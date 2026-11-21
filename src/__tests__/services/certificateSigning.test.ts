import { sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    CertificationKeyError,
    keyFromSeed,
    loadCertificationKey,
    signingPayload,
    signRecord,
    toCertificateRecord,
    UnsignedCertificateRecord,
    verifyRecord,
} from "../../services/CertificateSigning";
import { CertificateFields } from "../../entity/Certificate";

/**
 * Ed25519 over the RFC 8785 form of the record without its signature.
 * These run without Mongo: they pin the bytes that get signed and the key
 * handling, which the route tests then rely on.
 */

const hexToBase64 = (hex: string) => Buffer.from(hex, "hex").toString("base64");

// RFC 8032 section 7.1, TEST 1 (empty message).
const RFC8032_SEED =
    "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const RFC8032_PUBLIC =
    "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const RFC8032_SIGNATURE =
    "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b";

const SEED = Buffer.alloc(32, 9).toString("base64");

function storedCertificate(
    overrides: Partial<CertificateFields> = {},
): Omit<CertificateFields, "appeals" | "signature"> {
    return {
        certificateId: "4f6c5b1e-2b0a-4c7e-9d55-1f0e2d3c4b5a",
        subscriberId: "issuer.example.com",
        role: "DEPOSIT_ISSUER",
        domain: "ONDC:FIS14:FD",
        version: "0.1.4",
        tableHash: "sha256:5f1c0d2e",
        toolVersions: new Map([
            ["build-tools", "0.0.32"],
            ["fd-contract", "0.1.0"],
        ]),
        runs: [
            {
                sessionId: "session-1",
                flowId: "FD_BOOKING",
                transactionId: "txn-1",
                startedAt: new Date("2026-10-29T10:00:00.000Z"),
                finishedAt: new Date("2026-10-29T10:20:00.000Z"),
            },
        ],
        coverage: [
            {
                requirementId: "FD-PRD-05",
                status: "PASS",
                scenarios: ["booking"],
                evidence: ["msg-2"],
            },
            {
                requirementId: "FD-PRD-04",
                status: "PASS",
                scenarios: ["booking"],
                evidence: ["msg-1"],
            },
        ],
        findings: [],
        waivers: [],
        verdict: "PASS",
        issuedAt: new Date("2026-10-29T10:21:00.000Z"),
        issuer: "N-04 NETWORK_ADMIN",
        status: "VALID",
        ...overrides,
    };
}

describe("certification key", () => {
    it("derives the RFC 8032 key pair and signature from a raw seed", () => {
        const key = keyFromSeed(hexToBase64(RFC8032_SEED), "rfc8032");

        expect(key.publicKeyBase64).toBe(hexToBase64(RFC8032_PUBLIC));
        expect(sign(null, Buffer.alloc(0), key.privateKey).toString("hex")).toBe(
            RFC8032_SIGNATURE,
        );
    });

    it("loads FD_CERT_SIGNING_KEY and FD_CERT_KEY_ID from the environment", () => {
        const key = loadCertificationKey({
            FD_CERT_SIGNING_KEY: SEED,
            FD_CERT_KEY_ID: "cert-2026-10",
        });

        expect(key.keyId).toBe("cert-2026-10");
        expect(Buffer.from(key.publicKeyBase64, "base64")).toHaveLength(32);
    });

    it.each([
        [{ FD_CERT_KEY_ID: "k" }, /FD_CERT_SIGNING_KEY is not set/],
        [{ FD_CERT_SIGNING_KEY: SEED }, /FD_CERT_KEY_ID is not set/],
        [{ FD_CERT_SIGNING_KEY: SEED, FD_CERT_KEY_ID: "  " }, /FD_CERT_KEY_ID is not set/],
        [{ FD_CERT_SIGNING_KEY: "not base64!", FD_CERT_KEY_ID: "k" }, /not base64/],
        [
            {
                FD_CERT_SIGNING_KEY: Buffer.alloc(16, 1).toString("base64"),
                FD_CERT_KEY_ID: "k",
            },
            /32 bytes, got 16/,
        ],
    ])("refuses a missing or malformed key (%#)", (env, message) => {
        expect(() => loadCertificationKey(env)).toThrow(CertificationKeyError);
        expect(() => loadCertificationKey(env)).toThrow(message);
    });
});

describe("the signed record", () => {
    it("is built field by field, ignoring Mongo bookkeeping and absent optionals", () => {
        const withBookkeeping = {
            ...storedCertificate(),
            _id: "665f1c0d2e",
            __v: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            lapsedAt: null,
            appeals: [],
        } as unknown as Omit<CertificateFields, "appeals" | "signature">;

        expect(toCertificateRecord(withBookkeeping)).toEqual(
            toCertificateRecord(storedCertificate()),
        );
    });

    it("presents coverage as a map, dates as ISO strings and toolVersions as an object", () => {
        const record = toCertificateRecord(storedCertificate());

        expect(record.coverage).toEqual({
            "FD-PRD-04": { status: "PASS", scenarios: ["booking"], evidence: ["msg-1"] },
            "FD-PRD-05": { status: "PASS", scenarios: ["booking"], evidence: ["msg-2"] },
        });
        expect(record.runs[0].startedAt).toBe("2026-10-29T10:00:00.000Z");
        expect(record.runs[0]).not.toHaveProperty("seed");
        expect(record.toolVersions).toEqual({
            "build-tools": "0.0.32",
            "fd-contract": "0.1.0",
        });
    });

    it("signs the canonical record without its signature", () => {
        const key = keyFromSeed(SEED, "k1");
        const record = toCertificateRecord(storedCertificate());
        const signature = signRecord(record, key);

        const payload = signingPayload({ ...record, signature }).toString("utf8");
        expect(payload.startsWith('{"certificateId":')).toBe(true);
        expect(payload).not.toContain('"signature"');
        expect(payload).toBe(signingPayload(record).toString("utf8"));
        expect(signature).toMatchObject({ keyId: "k1", algorithm: "ed25519" });
        expect(Buffer.from(signature.value, "base64")).toHaveLength(64);
    });
});

describe("verifyRecord", () => {
    const key = keyFromSeed(SEED, "k1");
    const signed = () => {
        const record = toCertificateRecord(storedCertificate());
        return { ...record, signature: signRecord(record, key) };
    };

    it("accepts an untouched record, with a KeyObject or a base64 public key", () => {
        expect(verifyRecord(signed(), key.publicKey, "k1")).toEqual({ valid: true });
        expect(verifyRecord(signed(), key.publicKeyBase64)).toEqual({ valid: true });
    });

    it.each([
        ["status", (r: UnsignedCertificateRecord) => ({ ...r, status: "REFUSED" as const })],
        ["verdict", (r: UnsignedCertificateRecord) => ({ ...r, verdict: "FAIL" as const })],
        ["subscriberId", (r: UnsignedCertificateRecord) => ({ ...r, subscriberId: "other.example.com" })],
        ["tableHash", (r: UnsignedCertificateRecord) => ({ ...r, tableHash: "sha256:00" })],
        [
            "a coverage status",
            (r: UnsignedCertificateRecord) => ({
                ...r,
                coverage: {
                    ...r.coverage,
                    "FD-PRD-04": { ...r.coverage["FD-PRD-04"], status: "WAIVED" as const },
                },
            }),
        ],
        [
            "a tool version",
            (r: UnsignedCertificateRecord) => ({
                ...r,
                toolVersions: { ...r.toolVersions, "fd-contract": "0.1.1" },
            }),
        ],
        [
            "an added finding",
            (r: UnsignedCertificateRecord) => ({
                ...r,
                findings: [{ requirementIds: [], rule: "x", detail: "y" }],
            }),
        ],
    ])("rejects a record whose %s was changed", (_, tamper) => {
        const record = signed();
        const tampered = { ...tamper(record), signature: record.signature };

        expect(verifyRecord(tampered, key.publicKey, "k1")).toEqual({
            valid: false,
            reason: "SIGNATURE_MISMATCH",
        });
    });

    it("rejects a signature from another key", () => {
        const other = keyFromSeed(Buffer.alloc(32, 3).toString("base64"), "k1");
        const record = toCertificateRecord(storedCertificate());
        const forged = { ...record, signature: signRecord(record, other) };

        expect(verifyRecord(forged, key.publicKey, "k1")).toEqual({
            valid: false,
            reason: "SIGNATURE_MISMATCH",
        });
    });

    it("names the failure for a missing, malformed or foreign signature", () => {
        const record = signed();

        expect(verifyRecord({ ...record, signature: undefined }, key.publicKey)).toEqual({
            valid: false,
            reason: "SIGNATURE_MISSING",
        });
        expect(
            verifyRecord(
                { ...record, signature: { ...record.signature, value: "AAAA" } },
                key.publicKey,
            ),
        ).toEqual({ valid: false, reason: "SIGNATURE_MALFORMED" });
        expect(
            verifyRecord(
                {
                    ...record,
                    signature: { ...record.signature, algorithm: "rsa" as "ed25519" },
                },
                key.publicKey,
            ),
        ).toEqual({ valid: false, reason: "ALGORITHM_UNSUPPORTED" });
        expect(verifyRecord(record, key.publicKey, "k2")).toEqual({
            valid: false,
            reason: "KEY_ID_MISMATCH",
        });
    });
});
