import { describe, expect, it } from "vitest";
import { useApi } from "../helpers/api";
import { Certificate, CERTIFICATES_COLLECTION } from "../../entity/Certificate";
import { certificateRequest, issueCertificate } from "../factories";

/**
 * /certificates/* — the FD go-live certification record store.
 *
 * Issuance, signature verification, lapse scoping, the go-live gate and
 * appeals, against a real mongod. The certification key is the throwaway seed
 * set in vitest.config.mts (FD_CERT_SIGNING_KEY / FD_CERT_KEY_ID).
 */

const { get, post, raw } = useApi();

const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FD = "ONDC:FIS14:FD";
const SUBJECT = `subscriberId=issuer.example.com&domain=${encodeURIComponent(FD)}&role=DEPOSIT_ISSUER`;

const failing = (requirementId = "FD-PRD-05") => ({
    coverage: {
        "FD-PRD-04": { status: "PASS", scenarios: ["booking"], evidence: ["msg-1"] },
        [requirementId]: { status: "FAIL", scenarios: ["booking"], evidence: ["msg-2"] },
    },
});

/** Runs `fn` with the certification key unset, then restores it. */
async function withoutKey(fn: () => Promise<void>) {
    const original = process.env.FD_CERT_SIGNING_KEY;
    delete process.env.FD_CERT_SIGNING_KEY;
    try {
        await fn();
    } finally {
        process.env.FD_CERT_SIGNING_KEY = original;
    }
}

/** Edits a stored record behind the service's back, as a DB-level tamper would. */
const tamper = (certificateId: string, set: Record<string, unknown>) =>
    Certificate.collection.updateOne({ certificateId }, { $set: set });

describe("POST /certificates", () => {
    it("issues a signed VALID certificate on a full pass", async () => {
        const res = await post("/certificates").send(certificateRequest());

        expect(res.status).toBe(201);
        expect(res.body.reasons).toEqual([]);
        const cert = res.body.certificate;
        expect(cert.certificateId).toMatch(UUID);
        expect(cert).toMatchObject({
            subscriberId: "issuer.example.com",
            role: "DEPOSIT_ISSUER",
            domain: FD,
            version: "0.1.4",
            tableHash: "sha256:5f1c0d2e",
            verdict: "PASS",
            status: "VALID",
            issuer: "N-04 NETWORK_ADMIN",
            findings: [],
            waivers: [],
            appeals: [],
        });
        expect(cert.signature).toMatchObject({
            keyId: "test-cert-key",
            algorithm: "ed25519",
        });
        expect(Buffer.from(cert.signature.value, "base64")).toHaveLength(64);
        expect(cert.coverage["FD-PRD-04"]).toEqual({
            status: "PASS",
            scenarios: ["booking-happy-path"],
            evidence: ["msg-1", "msg-2"],
        });
        expect(cert.runs).toEqual([
            {
                sessionId: "session-fd-1",
                flowId: "FD_BOOKING",
                transactionId: "txn-fd-1",
                startedAt: "2026-10-29T10:00:00.000Z",
                finishedAt: "2026-10-29T10:20:00.000Z",
                seed: "c0ffee",
            },
        ]);
        expect(cert.toolVersions["fd-contract"]).toBe("0.1.0");
        expect(new Date(cert.issuedAt).toISOString()).toBe(cert.issuedAt);
        expect(cert).not.toHaveProperty("_id");
        expect(cert).not.toHaveProperty("lapsedAt");
    });

    it("stores it in the certificates collection, coverage keyed by requirement ID", async () => {
        const res = await post("/certificates").send(certificateRequest());
        const stored = await Certificate.collection.findOne({
            certificateId: res.body.certificate.certificateId,
        });

        expect(Certificate.collection.collectionName).toBe(CERTIFICATES_COLLECTION);
        expect(
            stored?.coverage.map((c: { requirementId: string }) => c.requirementId),
        ).toEqual(["FD-MOD-05", "FD-PRD-04", "FD-PRD-05"]);
    });

    it("stores a failing run as REFUSED: signed, with the reasons", async () => {
        const res = await post("/certificates").send(
            certificateRequest({
                ...failing(),
                findings: [
                    {
                        requirementIds: ["FD-PRD-05"],
                        rule: "application.version",
                        errorCode: "FD-PROTOCOL-0011",
                        fieldPath: "$.application.version",
                        detail: "version was not bumped",
                        messageId: "msg-2",
                        action: "application_update",
                    },
                ],
            }),
        );

        expect(res.status).toBe(201);
        expect(res.body.certificate).toMatchObject({
            verdict: "FAIL",
            status: "REFUSED",
        });
        expect(res.body.reasons).toEqual([
            "FD-PRD-05: FAIL",
            "finding 0 (application.version): not waived for FD-PRD-05",
        ]);
        expect(res.body.certificate.findings[0]).toEqual({
            requirementIds: ["FD-PRD-05"],
            rule: "application.version",
            errorCode: "FD-PROTOCOL-0011",
            fieldPath: "$.application.version",
            detail: "version was not bumped",
            messageId: "msg-2",
            action: "application_update",
        });
        expect(await Certificate.countDocuments()).toBe(1);

        const verified = await raw().get(
            `/certificates/${res.body.certificate.certificateId}/verify`,
        );
        expect(verified.body.signatureValid).toBe(true);
    });

    it("refuses an unwaived finding, and issues once a waiver covers it", async () => {
        const finding = {
            requirementIds: ["FD-NFR-02"],
            rule: "sla.p95",
            detail: "P95 412 ms over 20 samples",
        };
        const coverage = {
            "FD-PRD-04": { status: "PASS", scenarios: ["booking"], evidence: ["msg-1"] },
            "FD-NFR-02": { status: "WAIVED", scenarios: ["booking"], evidence: [] },
        };

        const refused = await post("/certificates").send(
            certificateRequest({ coverage, findings: [finding] }),
        );
        const issued = await post("/certificates").send(
            certificateRequest({
                coverage,
                findings: [finding],
                waivers: [
                    {
                        requirementId: "FD-NFR-02",
                        reason: "Sandbox latency; production SLA tested separately",
                        approvedBy: "N-04 reviewer",
                        approvedAt: "2026-10-29T09:00:00+05:30",
                    },
                ],
            }),
        );

        expect(refused.body.certificate.status).toBe("REFUSED");
        expect(issued.body.certificate.status).toBe("VALID");
        expect(issued.body.certificate.waivers).toEqual([
            {
                requirementId: "FD-NFR-02",
                reason: "Sandbox latency; production SLA tested separately",
                approvedBy: "N-04 reviewer",
                approvedAt: "2026-10-29T03:30:00.000Z",
            },
        ]);
    });

    it("refuses NOT_COVERED and empty coverage", async () => {
        const notCovered = await post("/certificates").send(
            certificateRequest({
                coverage: {
                    "FD-PRD-04": { status: "NOT_COVERED" },
                },
            }),
        );
        const empty = await post("/certificates").send(
            certificateRequest({ coverage: {} }),
        );

        expect(notCovered.body.certificate.status).toBe("REFUSED");
        expect(notCovered.body.certificate.coverage["FD-PRD-04"]).toEqual({
            status: "NOT_COVERED",
            scenarios: [],
            evidence: [],
        });
        expect(empty.body.certificate.status).toBe("REFUSED");
    });

    it("ignores server-owned fields sent by the caller", async () => {
        const res = await post("/certificates").send(
            certificateRequest({
                ...failing(),
                certificateId: "chosen-by-caller",
                verdict: "PASS",
                status: "VALID",
                issuer: "someone else",
                issuedAt: "2020-01-01T00:00:00Z",
                signature: { keyId: "x", algorithm: "ed25519", value: "AAAA" },
            }),
        );

        expect(res.status).toBe(201);
        expect(res.body.certificate.certificateId).toMatch(UUID);
        expect(res.body.certificate).toMatchObject({
            verdict: "FAIL",
            status: "REFUSED",
            issuer: "N-04 NETWORK_ADMIN",
        });
        expect(res.body.certificate.signature.keyId).toBe("test-cert-key");
    });

    it("400s with field errors for a malformed summary, storing nothing", async () => {
        const res = await post("/certificates").send(
            certificateRequest({ role: "BAP", runs: [], toolVersions: {} }),
        );

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Invalid request");
        expect(res.body.errors).toEqual(
            expect.arrayContaining([
                expect.stringMatching(/^role: /),
                expect.stringMatching(/^runs: /),
                expect.stringMatching(/^toolVersions: /),
            ]),
        );
        expect(await Certificate.countDocuments()).toBe(0);
    });

    it("400s for a run that finishes before it starts", async () => {
        const res = await post("/certificates").send(
            certificateRequest({
                runs: [
                    {
                        sessionId: "s",
                        flowId: "f",
                        transactionId: "t",
                        startedAt: "2026-10-29T10:20:00Z",
                        finishedAt: "2026-10-29T10:00:00Z",
                    },
                ],
            }),
        );

        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual([
            "runs.0.finishedAt: finishedAt is before startedAt",
        ]);
    });

    it("400s for a string with no canonical JSON form (a lone surrogate)", async () => {
        const res = await post("/certificates").send(
            certificateRequest({ tableHash: "sha256:\ud800" }),
        );

        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual(["Lone surrogate is not allowed"]);
        expect(await Certificate.countDocuments()).toBe(0);
    });

    it("503s and stores nothing without the certification key", async () => {
        await withoutKey(async () => {
            const res = await post("/certificates").send(certificateRequest());

            expect(res.status).toBe(503);
            expect(res.body).toEqual({
                message: "Certification key is not configured",
            });
        });
        expect(await Certificate.countDocuments()).toBe(0);
    });
});

describe("GET /certificates/:id", () => {
    it("returns the record with its appeals", async () => {
        const issued = await issueCertificate();

        const res = await get(`/certificates/${issued.certificateId}`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual(issued);
    });

    it("404s for an unknown certificate", async () => {
        const res = await get("/certificates/does-not-exist");

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: "Certificate not found" });
    });
});

describe("GET /certificates", () => {
    it("filters by subscriberId, domain and role, the latest VALID first", async () => {
        const older = await issueCertificate({}, new Date("2026-10-01T00:00:00Z"));
        const newer = await issueCertificate({}, new Date("2026-10-10T00:00:00Z"));
        const refused = await issueCertificate(
            failing(),
            new Date("2026-10-20T00:00:00Z"),
        );
        await issueCertificate({ subscriberId: "other.example.com" });
        await issueCertificate({ role: "INVESTOR_APP" });
        await issueCertificate({ domain: "ONDC:FIS12" });

        const res = await get(`/certificates?${SUBJECT}`);

        expect(res.status).toBe(200);
        expect(res.body.map((c: { certificateId: string }) => c.certificateId)).toEqual([
            newer.certificateId,
            older.certificateId,
            refused.certificateId,
        ]);
    });

    it("returns every record when no filter is given", async () => {
        await issueCertificate();
        await issueCertificate({ role: "INVESTOR_APP" });

        const res = await get("/certificates");

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
    });

    it("400s on an unknown role", async () => {
        const res = await get("/certificates?role=BAP");

        expect(res.status).toBe(400);
        expect(res.body.errors[0]).toMatch(/^role: /);
    });
});

describe("GET /certificates/:id/verify", () => {
    it("is public, and reports a valid signature without exposing evidence", async () => {
        const issued = await issueCertificate();

        const res = await raw().get(`/certificates/${issued.certificateId}/verify`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            certificateId: issued.certificateId,
            signatureValid: true,
            keyId: "test-cert-key",
            algorithm: "ed25519",
            status: "VALID",
            verdict: "PASS",
            subscriberId: "issuer.example.com",
            role: "DEPOSIT_ISSUER",
            domain: FD,
            version: "0.1.4",
            issuedAt: issued.issuedAt,
        });
    });

    it("detects a REFUSED record flipped to VALID in the database", async () => {
        const refused = await issueCertificate(failing());
        await tamper(refused.certificateId, { status: "VALID", verdict: "PASS" });

        const res = await raw().get(`/certificates/${refused.certificateId}/verify`);

        expect(res.body).toMatchObject({
            signatureValid: false,
            reason: "SIGNATURE_MISMATCH",
            status: "VALID",
        });
    });

    it("detects edited evidence", async () => {
        const issued = await issueCertificate();
        await tamper(issued.certificateId, { "coverage.0.evidence": ["forged"] });

        const res = await raw().get(`/certificates/${issued.certificateId}/verify`);

        expect(res.body.signatureValid).toBe(false);
    });

    it("is unaffected by appeals, which are not part of the signed record", async () => {
        const issued = await issueCertificate();
        await post(`/certificates/${issued.certificateId}/appeals`).send({
            runId: "txn-fd-1",
            requirementId: "FD-PRD-04",
            statement: "Evidence msg-2 was judged against the wrong scenario",
            raisedBy: "issuer.example.com",
        });

        const res = await raw().get(`/certificates/${issued.certificateId}/verify`);

        expect(res.body.signatureValid).toBe(true);
    });

    it("reports KEY_ID_MISMATCH once the configured key ID changes", async () => {
        const issued = await issueCertificate();
        const original = process.env.FD_CERT_KEY_ID;
        process.env.FD_CERT_KEY_ID = "rotated-key";
        try {
            const res = await raw().get(`/certificates/${issued.certificateId}/verify`);

            expect(res.body).toMatchObject({
                signatureValid: false,
                reason: "KEY_ID_MISMATCH",
                keyId: "test-cert-key",
            });
        } finally {
            process.env.FD_CERT_KEY_ID = original;
        }
    });

    it("404s for an unknown certificate and 503s without the key", async () => {
        const issued = await issueCertificate();

        expect((await raw().get("/certificates/nope/verify")).status).toBe(404);
        await withoutKey(async () => {
            const res = await raw().get(`/certificates/${issued.certificateId}/verify`);
            expect(res.status).toBe(503);
        });
    });

    it.each([
        ["get", "/certificates"],
        ["get", "/certificates/some-id"],
        ["get", `/certificates/go-live?${SUBJECT}`],
        ["post", "/certificates"],
        ["post", "/certificates/lapse"],
        ["post", "/certificates/some-id/appeals"],
    ] as const)("keeps %s %s behind the API key", async (method, url) => {
        const res = await raw()[method](url);

        expect(res.status).toBe(403);
    });
});

describe("POST /certificates/lapse", () => {
    it("lapses only VALID certificates in the domain that cover a touched ID", async () => {
        const covering = await issueCertificate();
        const notCovering = await issueCertificate({
            coverage: {
                "FD-CAP-01": { status: "PASS", scenarios: ["s"], evidence: ["m"] },
            },
        });
        const otherDomain = await issueCertificate({ domain: "ONDC:FIS12" });
        const refused = await issueCertificate(failing());

        const res = await post("/certificates/lapse").send({
            domain: FD,
            version: "0.1.5",
            requirementIds: ["FD-PRD-05", "FD-XYZ-99"],
        });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            domain: FD,
            specVersion: "0.1.5",
            lapsed: 1,
            certificateIds: [covering.certificateId],
            notResigned: [],
        });

        const lapsed = (await get(`/certificates/${covering.certificateId}`)).body;
        expect(lapsed.status).toBe("LAPSED");
        expect(new Date(lapsed.lapsedAt).toISOString()).toBe(lapsed.lapsedAt);
        // Only the IDs this certificate actually covered.
        expect(lapsed.lapseReason).toEqual({
            specVersion: "0.1.5",
            requirementIds: ["FD-PRD-05"],
        });

        for (const [cert, status] of [
            [notCovering, "VALID"],
            [otherDomain, "VALID"],
            [refused, "REFUSED"],
        ] as const) {
            const body = (await get(`/certificates/${cert.certificateId}`)).body;
            expect(body.status).toBe(status);
        }
    });

    it("re-signs the lapsed record, so its signature still verifies", async () => {
        const issued = await issueCertificate();
        await post("/certificates/lapse").send({
            domain: FD,
            version: "0.1.5",
            requirementIds: ["FD-PRD-04"],
        });

        const res = await raw().get(`/certificates/${issued.certificateId}/verify`);

        expect(res.body).toMatchObject({ signatureValid: true, status: "LAPSED" });
    });

    it("lapses nothing for an editorial change (no requirement IDs)", async () => {
        const issued = await issueCertificate();

        const res = await post("/certificates/lapse").send({
            domain: FD,
            version: "0.1.5",
            requirementIds: [],
        });

        expect(res.body.lapsed).toBe(0);
        expect((await get(`/certificates/${issued.certificateId}`)).body.status).toBe(
            "VALID",
        );
    });

    it("lapses every VALID certificate in the domain for an envelope change (every ID)", async () => {
        const a = await issueCertificate();
        const b = await issueCertificate({
            role: "INVESTOR_APP",
            coverage: {
                "FD-CAP-01": { status: "PASS", scenarios: ["s"], evidence: ["m"] },
            },
        });

        const res = await post("/certificates/lapse").send({
            domain: FD,
            version: "0.2.0",
            requirementIds: ["FD-PRD-04", "FD-PRD-05", "FD-MOD-05", "FD-CAP-01"],
        });

        expect(res.body.lapsed).toBe(2);
        expect(res.body.certificateIds.sort()).toEqual(
            [a.certificateId, b.certificateId].sort(),
        );
    });

    it("does not lapse an already LAPSED certificate again", async () => {
        const issued = await issueCertificate();
        const body = { domain: FD, requirementIds: ["FD-PRD-04"] };
        await post("/certificates/lapse").send({ ...body, version: "0.1.5" });

        const again = await post("/certificates/lapse").send({
            ...body,
            version: "0.1.6",
        });

        expect(again.body.lapsed).toBe(0);
        const stored = (await get(`/certificates/${issued.certificateId}`)).body;
        expect(stored.lapseReason.specVersion).toBe("0.1.5");
    });

    it("lapses a tampered certificate without re-signing it", async () => {
        const issued = await issueCertificate();
        await tamper(issued.certificateId, { tableHash: "sha256:forged" });

        const res = await post("/certificates/lapse").send({
            domain: FD,
            version: "0.1.5",
            requirementIds: ["FD-PRD-04"],
        });

        expect(res.body.notResigned).toEqual([issued.certificateId]);
        const verified = await raw().get(`/certificates/${issued.certificateId}/verify`);
        expect(verified.body).toMatchObject({
            status: "LAPSED",
            signatureValid: false,
        });
    });

    it("400s without requirementIds", async () => {
        const res = await post("/certificates/lapse").send({
            domain: FD,
            version: "0.1.5",
        });

        expect(res.status).toBe(400);
        expect(res.body.errors[0]).toMatch(/^requirementIds: /);
    });

    it("503s without the key and lapses nothing", async () => {
        const issued = await issueCertificate();

        await withoutKey(async () => {
            const res = await post("/certificates/lapse").send({
                domain: FD,
                version: "0.1.5",
                requirementIds: ["FD-PRD-04"],
            });
            expect(res.status).toBe(503);
        });

        expect((await get(`/certificates/${issued.certificateId}`)).body.status).toBe(
            "VALID",
        );
    });
});

describe("GET /certificates/go-live", () => {
    it("allows a participant with a VALID certificate", async () => {
        const issued = await issueCertificate();

        const res = await get(`/certificates/go-live?${SUBJECT}`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            allowed: true,
            certificateId: issued.certificateId,
            reason: "VALID_CERTIFICATE",
        });
    });

    it("denies a participant with no record", async () => {
        const res = await get(`/certificates/go-live?${SUBJECT}`);

        expect(res.body).toMatchObject({ allowed: false, reason: "NO_CERTIFICATE" });
        expect(res.body).not.toHaveProperty("certificateId");
    });

    it("denies when the only record is REFUSED", async () => {
        const refused = await issueCertificate(failing());

        const res = await get(`/certificates/go-live?${SUBJECT}`);

        expect(res.body).toMatchObject({
            allowed: false,
            certificateId: refused.certificateId,
            reason: "CERTIFICATE_REFUSED",
        });
    });

    it("denies once the certificate has lapsed, naming the spec change", async () => {
        const issued = await issueCertificate();
        await post("/certificates/lapse").send({
            domain: FD,
            version: "0.1.5",
            requirementIds: ["FD-PRD-05"],
        });

        const res = await get(`/certificates/go-live?${SUBJECT}`);

        expect(res.body).toMatchObject({
            allowed: false,
            certificateId: issued.certificateId,
            reason: "CERTIFICATE_LAPSED",
        });
        expect(res.body.detail).toContain("0.1.5");
        expect(res.body.detail).toContain("FD-PRD-05");
    });

    it("allows again after a fresh pass following a lapse", async () => {
        await issueCertificate({}, new Date("2026-10-01T00:00:00Z"));
        await post("/certificates/lapse").send({
            domain: FD,
            version: "0.1.5",
            requirementIds: ["FD-PRD-05"],
        });
        const rerun = await issueCertificate({ version: "0.1.5" });

        const res = await get(`/certificates/go-live?${SUBJECT}`);

        expect(res.body).toMatchObject({
            allowed: true,
            certificateId: rerun.certificateId,
        });
    });

    it("keeps allowing on a VALID certificate after a later run is refused", async () => {
        const issued = await issueCertificate({}, new Date("2026-10-01T00:00:00Z"));
        await issueCertificate(failing(), new Date("2026-10-20T00:00:00Z"));

        const res = await get(`/certificates/go-live?${SUBJECT}`);

        expect(res.body).toMatchObject({
            allowed: true,
            certificateId: issued.certificateId,
        });
    });

    it("is scoped to the role and the domain", async () => {
        await issueCertificate();

        const asApp = await get(
            `/certificates/go-live?subscriberId=issuer.example.com&domain=${encodeURIComponent(FD)}&role=INVESTOR_APP`,
        );
        const otherDomain = await get(
            "/certificates/go-live?subscriberId=issuer.example.com&domain=ONDC:FIS12&role=DEPOSIT_ISSUER",
        );

        expect(asApp.body).toMatchObject({ allowed: false, reason: "NO_CERTIFICATE" });
        expect(otherDomain.body).toMatchObject({
            allowed: false,
            reason: "NO_CERTIFICATE",
        });
    });

    it("denies a VALID record whose signature does not verify", async () => {
        const refused = await issueCertificate(failing());
        await tamper(refused.certificateId, { status: "VALID", verdict: "PASS" });

        const res = await get(`/certificates/go-live?${SUBJECT}`);

        expect(res.body).toMatchObject({
            allowed: false,
            certificateId: refused.certificateId,
            reason: "CERTIFICATE_INVALID",
        });
        expect(res.body.detail).toContain("SIGNATURE_MISMATCH");
    });

    it("400s without subscriberId, domain or role", async () => {
        const res = await get("/certificates/go-live?subscriberId=issuer.example.com");

        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual(
            expect.arrayContaining([
                expect.stringMatching(/^domain: /),
                expect.stringMatching(/^role: /),
            ]),
        );
    });

    it("fails closed with 503 and allowed: false when the key is missing", async () => {
        await issueCertificate();

        await withoutKey(async () => {
            const res = await get(`/certificates/go-live?${SUBJECT}`);

            expect(res.status).toBe(503);
            expect(res.body).toMatchObject({
                allowed: false,
                reason: "VERIFICATION_UNAVAILABLE",
            });
        });
    });
});

describe("POST /certificates/:id/appeals", () => {
    const appeal = {
        runId: "txn-fd-1",
        requirementId: "FD-PRD-05",
        statement: "The callback arrived within its deadline in test time",
        raisedBy: "issuer.example.com",
    };

    it("records an OPEN appeal citing a run and a requirement", async () => {
        const refused = await issueCertificate(failing());

        const res = await post(`/certificates/${refused.certificateId}/appeals`).send(
            appeal,
        );

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ ...appeal, status: "OPEN" });
        expect(res.body.appealId).toMatch(UUID);
        expect(new Date(res.body.raisedAt).toISOString()).toBe(res.body.raisedAt);

        const stored = (await get(`/certificates/${refused.certificateId}`)).body;
        expect(stored.appeals).toEqual([res.body]);
    });

    it("accepts the run's sessionId as its run ID, and appends", async () => {
        const issued = await issueCertificate();
        await post(`/certificates/${issued.certificateId}/appeals`).send(appeal);

        const res = await post(`/certificates/${issued.certificateId}/appeals`).send({
            ...appeal,
            runId: "session-fd-1",
        });

        expect(res.status).toBe(201);
        const stored = (await get(`/certificates/${issued.certificateId}`)).body;
        expect(stored.appeals).toHaveLength(2);
    });

    it("accepts a requirement cited only by a finding", async () => {
        const refused = await issueCertificate({
            findings: [{ requirementIds: ["FD-NFR-02"], rule: "sla", detail: "slow" }],
        });

        const res = await post(`/certificates/${refused.certificateId}/appeals`).send({
            ...appeal,
            requirementId: "FD-NFR-02",
        });

        expect(res.status).toBe(201);
    });

    it("422s when the run or requirement is not on the certificate", async () => {
        const issued = await issueCertificate();

        const res = await post(`/certificates/${issued.certificateId}/appeals`).send({
            ...appeal,
            runId: "txn-unknown",
            requirementId: "FD-XYZ-99",
        });

        expect(res.status).toBe(422);
        expect(res.body).toEqual({
            message: "Appeal does not match the certificate",
            errors: [
                "runId: txn-unknown is not a run on this certificate",
                "requirementId: FD-XYZ-99 is not on this certificate",
            ],
        });
        const stored = (await get(`/certificates/${issued.certificateId}`)).body;
        expect(stored.appeals).toEqual([]);
    });

    it("404s for an unknown certificate", async () => {
        const res = await post("/certificates/nope/appeals").send(appeal);

        expect(res.status).toBe(404);
    });

    it("400s without a statement", async () => {
        const issued = await issueCertificate();

        const res = await post(`/certificates/${issued.certificateId}/appeals`).send({
            ...appeal,
            statement: "",
        });

        expect(res.status).toBe(400);
        expect(res.body.errors[0]).toMatch(/^statement: /);
    });
});

describe("certificates indexes", () => {
    it("enforces a unique certificateId and indexes go-live and lapse lookups", async () => {
        await Certificate.syncIndexes();
        const indexes = await Certificate.collection.indexes();
        const byKey = new Map(indexes.map((i) => [JSON.stringify(i.key), i]));

        expect(byKey.get(JSON.stringify({ certificateId: 1 }))?.unique).toBe(true);
        expect(
            byKey.has(
                JSON.stringify({ subscriberId: 1, domain: 1, role: 1, issuedAt: -1 }),
            ),
        ).toBe(true);
        expect(
            byKey.has(
                JSON.stringify({ domain: 1, status: 1, "coverage.requirementId": 1 }),
            ),
        ).toBe(true);
    });
});
