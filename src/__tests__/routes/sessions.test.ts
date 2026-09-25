import { describe, expect, it } from "vitest";
import { useApi } from "../helpers/api";
import { SessionDetails } from "../../entity/SessionDetails";
import { Payload } from "../../entity/Payload";
import { UserModel } from "../../entity/User";
import { seedPayload, seedReport, seedSession, seedUser } from "../factories";

/**
 * CHARACTERIZATION TESTS — /api/sessions/*
 *
 * These pin the CURRENT behaviour of the service, warts and all, so that the
 * Phase B changes (indexes, filtering, pagination, aggregation, export) can be
 * made with confidence that nothing existing broke.
 *
 * Anything marked `QUIRK:` documents behaviour that is arguably wrong. Do NOT
 * "fix" it here — an existing caller in the automation stack may depend on it.
 * Fixing it is a separate, deliberate decision.
 */

const { get, post, put, del } = useApi();

describe("GET /api/sessions/", () => {
    it("returns a bare unbounded array, not a paginated envelope", async () => {
        await seedSession({ sessionId: "s-1" });
        await seedSession({ sessionId: "s-2" });

        const res = await get("/api/sessions/");

        expect(res.status).toBe(200);
        // THE contract Phase B must preserve when no query params are present.
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(2);
        expect(res.body[0]).not.toHaveProperty("data");
        expect(res.body[0]).not.toHaveProperty("total");
    });

    it("returns full documents including flows and timestamps", async () => {
        await seedSession({
            sessionId: "s-full",
            flows: [{ id: "flow-1", status: "COMPLETED", payloads: ["p1"] }],
        });

        const res = await get("/api/sessions/");
        const [session] = res.body;

        expect(session).toMatchObject({
            sessionId: "s-full",
            npType: "BAP",
            sessionType: "AUTOMATION",
            domain: "ONDC:FIS10",
            version: "2.1.0",
        });
        expect(session.flows).toHaveLength(1);
        expect(session).toHaveProperty("createdAt");
        expect(session).toHaveProperty("updatedAt");
    });

    it("returns an empty array when there are no sessions", async () => {
        const res = await get("/api/sessions/");

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    // Params the dashboard does not own leave the legacy contract intact, so an
    // existing automation-stack caller that appends its own cache-buster or
    // tracing param still gets the bare array.
    //
    // See sessionsFilter.test.ts for the opt-in paginated mode.
    it("keeps returning the bare array for unrecognised query params", async () => {
        await seedSession();
        await seedSession();

        const res = await get("/api/sessions/?foo=bar&_=1699999999");

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(2);
    });
});

describe("GET /api/sessions/:sessionId", () => {
    it("returns the session document", async () => {
        await seedSession({ sessionId: "s-one", domain: "ONDC:TRV11" });

        const res = await get("/api/sessions/s-one");

        expect(res.status).toBe(200);
        expect(res.body.sessionId).toBe("s-one");
        expect(res.body.domain).toBe("ONDC:TRV11");
    });

    // QUIRK: error bodies are plain text, not JSON (SessionDetailsController.ts:50).
    it("404s with a plain-text body when missing", async () => {
        const res = await get("/api/sessions/does-not-exist");

        expect(res.status).toBe(404);
        expect(res.text).toBe("Session not found");
        expect(res.type).not.toBe("application/json");
    });
});

describe("GET /api/sessions/check/:sessionId", () => {
    // QUIRK: responds with a bare JSON boolean rather than an object
    // (SessionDetailsController.ts:66). `res.body` is literally `true`/`false`.
    it("returns bare true when the session exists", async () => {
        await seedSession({ sessionId: "s-check" });

        const res = await get("/api/sessions/check/s-check");

        expect(res.status).toBe(200);
        expect(res.body).toBe(true);
    });

    it("returns bare false when the session does not exist", async () => {
        const res = await get("/api/sessions/check/nope");

        expect(res.status).toBe(200);
        expect(res.body).toBe(false);
    });
});

describe("POST /api/sessions/", () => {
    it("creates a session and returns 201 with the document", async () => {
        const res = await post("/api/sessions/").send({
            sessionId: "s-created",
            npType: "BPP",
            sessionType: "MANUAL",
            domain: "ONDC:RET10",
        });

        expect(res.status).toBe(201);
        expect(res.body.sessionId).toBe("s-created");
        expect(res.body.npType).toBe("BPP");
        expect(await SessionDetails.countDocuments()).toBe(1);
    });

    it("links the session to the user when userId and sessionId are both present", async () => {
        await seedUser({ githubId: "gh-1", sessionIds: [] });

        const res = await post("/api/sessions/").send({
            sessionId: "s-linked",
            npType: "BAP",
            sessionType: "AUTOMATION",
            userId: "gh-1",
        });

        expect(res.status).toBe(201);
        const user = await UserModel.findOne({ githubId: "gh-1" });
        expect(user?.sessionIds).toContain("s-linked");
    });

    // QUIRK: addSessionId uses findOneAndUpdate with no upsert
    // (UserRepository.ts:26), so an unknown user is a silent no-op.
    it("still succeeds when the referenced user does not exist", async () => {
        const res = await post("/api/sessions/").send({
            sessionId: "s-orphan",
            npType: "BAP",
            sessionType: "AUTOMATION",
            userId: "ghost-user",
        });

        expect(res.status).toBe(201);
        expect(await UserModel.countDocuments()).toBe(0);
    });

    it("400s with a plain-text body when required fields are missing", async () => {
        const res = await post("/api/sessions/").send({ domain: "ONDC:RET10" });

        expect(res.status).toBe(400);
        expect(res.type).not.toBe("application/json");
    });

    // QUIRK: sessionType is schema-required here (SessionDetails.ts:47) but
    // $setOnInsert-defaulted to "AUTOMATION" by /upsert
    // (SessionDetailsRepository.ts:167). The same logical create succeeds via
    // one route and 400s via the other.
    it("400s when sessionType is omitted, unlike /upsert which defaults it", async () => {
        const created = await post("/api/sessions/").send({
            sessionId: "s-no-type",
            npType: "BAP",
        });
        expect(created.status).toBe(400);

        const upserted = await post("/api/sessions/upsert").send({
            sessionId: "s-no-type",
            npType: "BAP",
        });
        expect(upserted.status).toBe(200);
        expect(upserted.body.sessionType).toBe("AUTOMATION");
    });
});

describe("PUT /api/sessions/:sessionId", () => {
    it("updates the session and returns the new document", async () => {
        await seedSession({ sessionId: "s-upd", domain: "ONDC:FIS10" });

        const res = await put("/api/sessions/s-upd").send({
            domain: "ONDC:TRV11",
        });

        expect(res.status).toBe(200);
        expect(res.body.domain).toBe("ONDC:TRV11");
    });

    // QUIRK: the service wraps every failure in a generic Error
    // (SessionDetailsService.ts:125), so the 404 body is "Error updating
    // session" — NOT the "Session not found" the controller's fallback implies.
    it("404s with the generic wrapped message when the session is missing", async () => {
        const res = await put("/api/sessions/nope").send({ domain: "x" });

        expect(res.status).toBe(404);
        expect(res.text).toBe("Error updating session");
    });
});

describe("DELETE /api/sessions/:sessionId", () => {
    it("deletes the session and returns 204", async () => {
        await seedSession({ sessionId: "s-del" });

        const res = await del("/api/sessions/s-del");

        expect(res.status).toBe(204);
        expect(await SessionDetails.countDocuments()).toBe(0);
    });

    // QUIRK: findOneAndDelete resolves null for a miss rather than throwing
    // (SessionDetailsRepository.ts:38), so deleting nothing still reports 204.
    it("returns 204 even when the session never existed", async () => {
        const res = await del("/api/sessions/never-existed");

        expect(res.status).toBe(204);
    });
});

describe("POST /api/sessions/payload", () => {
    it("flattens sessionDetails.sessionId onto the payload", async () => {
        const res = await post("/api/sessions/payload").send({
            sessionDetails: { sessionId: "s-payload" },
            payloadId: "p-1",
            action: "search",
            httpStatus: 200,
        });

        expect(res.status).toBe(201);
        expect(res.body.sessionId).toBe("s-payload");
        expect(res.body.payloadId).toBe("p-1");
        // sessionDetails itself is not persisted — only the extracted id.
        expect(res.body).not.toHaveProperty("sessionDetails");
    });

    // QUIRK: sessionId is required by the schema, so a missing sessionDetails
    // becomes a validation 400 rather than a clear "sessionDetails required".
    it("400s when sessionDetails is absent", async () => {
        const res = await post("/api/sessions/payload").send({
            payloadId: "p-2",
        });

        expect(res.status).toBe(400);
    });
});

describe("GET /api/sessions/payload/:sessionId", () => {
    it("returns PayloadDetailsDTOs shaped { npType, domain, payload }", async () => {
        await seedSession({
            sessionId: "s-dto",
            npType: "BPP",
            domain: "ONDC:RET10",
        });
        await seedPayload({ sessionId: "s-dto", payloadId: "p-dto" });

        const res = await get("/api/sessions/payload/s-dto");

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0]).toMatchObject({
            npType: "BPP",
            domain: "ONDC:RET10",
        });
        expect(res.body[0].payload.payloadId).toBe("p-dto");
    });

    it("returns an empty array when the session exists but has no payloads", async () => {
        await seedSession({ sessionId: "s-empty" });

        const res = await get("/api/sessions/payload/s-empty");

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    // QUIRK: falls back to the literal string "defaultDomain"
    // (SessionDetailsService.ts:83) when the session has no domain.
    it('substitutes "defaultDomain" when the session has no domain', async () => {
        await seedSession({ sessionId: "s-nodomain", domain: null });
        await seedPayload({ sessionId: "s-nodomain" });

        const res = await get("/api/sessions/payload/s-nodomain");

        expect(res.body[0].domain).toBe("defaultDomain");
    });

    // QUIRK: the specific "SessionDetails not found" message is swallowed by the
    // service's catch-and-rewrap (SessionDetailsService.ts:97).
    it("404s with the generic wrapped message when the session is missing", async () => {
        const res = await get("/api/sessions/payload/nope");

        expect(res.status).toBe(404);
        expect(res.text).toBe("Error retrieving payload details");
    });
});

describe("PUT /api/sessions/flows/:sessionId", () => {
    it("updates an existing flow's status", async () => {
        await seedSession({
            sessionId: "s-flow",
            flows: [{ id: "f1", status: "PENDING" }],
        });

        const res = await put("/api/sessions/flows/s-flow").send({
            flow: { id: "f1", status: "COMPLETED" },
        });

        expect(res.status).toBe(200);
        expect(res.body.flows[0].status).toBe("COMPLETED");
    });

    it("400s when flow or flow.id is absent", async () => {
        await seedSession({ sessionId: "s-flow-2" });

        const noFlow = await put("/api/sessions/flows/s-flow-2").send({});
        expect(noFlow.status).toBe(400);
        expect(noFlow.text).toBe("flow is required with id");

        const noId = await put("/api/sessions/flows/s-flow-2").send({
            flow: { status: "COMPLETED" },
        });
        expect(noId.status).toBe(400);
    });

    // QUIRK: the controller's `if (!updatedSession) 404` branch
    // (SessionDetailsController.ts:181) is UNREACHABLE — the service throws on a
    // miss (SessionDetailsService.ts:159) so the catch turns it into a 500.
    it("500s, not 404s, when the flow does not exist", async () => {
        await seedSession({ sessionId: "s-flow-3", flows: [] });

        const res = await put("/api/sessions/flows/s-flow-3").send({
            flow: { id: "ghost", status: "COMPLETED" },
        });

        expect(res.status).toBe(500);
        expect(res.text).toBe("Error updating flow in session");
    });

    it("500s when the session does not exist", async () => {
        const res = await put("/api/sessions/flows/nope").send({
            flow: { id: "f1", status: "COMPLETED" },
        });

        expect(res.status).toBe(500);
    });
});

describe("POST /api/sessions/flows/:sessionId", () => {
    it("adds a flow and returns the updated session", async () => {
        await seedSession({ sessionId: "s-add", flows: [] });

        const res = await post("/api/sessions/flows/s-add").send({
            id: "f-new",
            status: "PENDING",
        });

        expect(res.status).toBe(200);
        expect(res.body.flows).toHaveLength(1);
        expect(res.body.flows[0].id).toBe("f-new");
    });

    it("400s when id or status is missing", async () => {
        await seedSession({ sessionId: "s-add-2" });

        const res = await post("/api/sessions/flows/s-add-2").send({
            id: "f-new",
        });

        expect(res.status).toBe(400);
        expect(res.text).toBe("Flow id and status are required");
    });

    // QUIRK: on a duplicate the repository returns the EXISTING FLOW subdocument
    // (SessionDetailsRepository.ts:69-72), not the session — so the response
    // shape silently changes between first and second call.
    it("returns the existing flow object, not the session, on a duplicate add", async () => {
        await seedSession({
            sessionId: "s-dup",
            flows: [{ id: "f-dup", status: "PENDING" }],
        });

        const res = await post("/api/sessions/flows/s-dup").send({
            id: "f-dup",
            status: "COMPLETED",
        });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id: "f-dup", status: "PENDING" });
        expect(res.body).not.toHaveProperty("sessionId");
        expect(res.body).not.toHaveProperty("flows");
    });

    // QUIRK: the controller's `if (!updatedSession) 400 "Session not found"`
    // branch (SessionDetailsController.ts:210) is likewise unreachable.
    it("500s, not 400s, when the session does not exist", async () => {
        const res = await post("/api/sessions/flows/nope").send({
            id: "f1",
            status: "PENDING",
        });

        expect(res.status).toBe(500);
        expect(res.text).toBe("Error adding flow to session");
    });
});

describe("GET /api/sessions/filter", () => {
    const FILTER_BASE =
        "/api/sessions/filter?np_type=BAP&np_id=https://buyer.example.com" +
        "&domain=ONDC:FIS10&version=2.1.0";

    it("400s when np_type or np_id is missing", async () => {
        const noType = await get("/api/sessions/filter?np_id=x");
        expect(noType.status).toBe(400);
        expect(noType.text).toBe("Missing npType or npId query parameters");

        const noId = await get("/api/sessions/filter?np_type=BAP");
        expect(noId.status).toBe(400);
    });

    // QUIRK: the controller only guards np_type/np_id, but the service ALSO
    // demands domain and version (SessionDetailsService.ts:182). That guard sits
    // OUTSIDE the service's try block, so the raw message escapes unwrapped and
    // the controller surfaces it as a 500 — a perfectly reasonable two-param
    // query looks like a server fault. This is why this endpoint cannot back a
    // filter bar, and why Phase B adds a new one rather than repairing this.
    it("500s when domain or version is missing", async () => {
        const res = await get(
            "/api/sessions/filter?np_type=BAP&np_id=https://buyer.example.com",
        );

        expect(res.status).toBe(500);
        expect(res.text).toBe("npType,npId,domain and version must be provided");
    });

    it("returns { sessions: [] } when nothing matches", async () => {
        const res = await get(FILTER_BASE);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ sessions: [] });
    });

    it("matches on all four fields with exact equality", async () => {
        await seedSession({ sessionId: "match", npType: "BAP" });
        await seedSession({ sessionId: "wrong-domain", domain: "ONDC:RET10" });
        await seedSession({ sessionId: "wrong-version", version: "1.0.0" });
        await seedSession({ sessionId: "wrong-nptype", npType: "BPP" });

        const res = await get(FILTER_BASE);

        expect(res.body.sessions).toHaveLength(1);
        expect(res.body.sessions[0].sessionId).toBe("match");
    });

    // QUIRK: the response is a hand-built projection that DROPS npType and npId
    // (SessionDetailsController.ts:273-284) — the very fields you filtered on.
    it("omits npType and npId from the projection", async () => {
        await seedSession({ sessionId: "proj" });

        const res = await get(FILTER_BASE);
        const [session] = res.body.sessions;

        expect(Object.keys(session).sort()).toEqual([
            "createdAt",
            "domain",
            "flowMap",
            "flowSummary",
            "flows",
            "reportExists",
            "sessionId",
            "usecaseId",
            "userId",
            "version",
        ]);
    });

    // QUIRK: reportExists here is computed live per session with an N+1 query
    // against the Report collection using test_id = `PW_${sessionId}`
    // (SessionDetailsController.ts:257-263) — it ignores the STORED
    // session.reportExists boolean entirely.
    it("computes reportExists live from Report, ignoring the stored flag", async () => {
        await seedSession({ sessionId: "has-report", reportExists: false });
        await seedReport({ test_id: "PW_has-report" });

        const res = await get(FILTER_BASE);

        expect(res.body.sessions[0].reportExists).toBe(true);
    });

    it("reports reportExists false when no matching report row exists", async () => {
        await seedSession({ sessionId: "no-report", reportExists: true });

        const res = await get(FILTER_BASE);

        expect(res.body.sessions[0].reportExists).toBe(false);
    });

    it("serialises createdAt as an ISO 8601 string", async () => {
        await seedSession({ sessionId: "iso" });

        const res = await get(FILTER_BASE);

        expect(res.body.sessions[0].createdAt).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        );
    });
});

describe("GET /api/sessions/subscriber-urls/:userId", () => {
    it("returns distinct npIds for the user", async () => {
        await seedSession({ userId: "gh-9", npId: "https://a.example.com" });
        await seedSession({ userId: "gh-9", npId: "https://a.example.com" });
        await seedSession({ userId: "gh-9", npId: "https://b.example.com" });
        await seedSession({ userId: "other", npId: "https://c.example.com" });

        const res = await get("/api/sessions/subscriber-urls/gh-9");

        expect(res.status).toBe(200);
        expect(res.body.subscriberUrls.sort()).toEqual([
            "https://a.example.com",
            "https://b.example.com",
        ]);
    });

    it("returns an empty list for an unknown user", async () => {
        const res = await get("/api/sessions/subscriber-urls/nobody");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ subscriberUrls: [] });
    });
});

describe("POST /api/sessions/upsert", () => {
    it("400s with a JSON error body when sessionId or npType is missing", async () => {
        const res = await post("/api/sessions/upsert").send({
            sessionId: "s-1",
        });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({
            error: true,
            message: "sessionId and npType are required",
        });
    });

    it("creates the session on first call, defaulting sessionType to AUTOMATION", async () => {
        const res = await post("/api/sessions/upsert").send({
            sessionId: "s-up",
            npType: "BAP",
            domain: "ONDC:FIS10",
        });

        expect(res.status).toBe(200);
        expect(res.body.sessionId).toBe("s-up");
        // $setOnInsert (SessionDetailsRepository.ts:167)
        expect(res.body.sessionType).toBe("AUTOMATION");
    });

    it("updates scalar fields on a subsequent call", async () => {
        await post("/api/sessions/upsert").send({
            sessionId: "s-up2",
            npType: "BAP",
            domain: "ONDC:FIS10",
        });

        const res = await post("/api/sessions/upsert").send({
            sessionId: "s-up2",
            npType: "BPP",
            domain: "ONDC:RET10",
        });

        expect(res.body.npType).toBe("BPP");
        expect(res.body.domain).toBe("ONDC:RET10");
        expect(await SessionDetails.countDocuments()).toBe(1);
    });

    // QUIRK: the merge is `{...incoming, ...existing}` so EXISTING KEYS WIN. An
    // upsert can never overwrite an already-recorded PASS/FAIL. Note this is the
    // exact OPPOSITE of the analytics endpoint's merge direction. Both sides are
    // run through `onlyVerdicts` first, so the rule applies to verdicts only.
    it("merges flowMap with existing keys winning", async () => {
        await post("/api/sessions/upsert").send({
            sessionId: "s-merge",
            npType: "BAP",
            flowMap: { f1: "PASS" },
        });

        const res = await post("/api/sessions/upsert").send({
            sessionId: "s-merge",
            npType: "BAP",
            flowMap: { f1: "FAIL", f2: "FAIL" },
        });

        expect(res.body.flowMap).toEqual({ f1: "PASS", f2: "FAIL" });
    });

    it("refuses to store a flowMap value that is not a verdict", async () => {
        // flowMap is Schema.Types.Mixed, so this is the only layer that can keep
        // a non-verdict out. The workbench used to send every flow key stamped
        // "RUN"; because existing keys win above, each one was then sticky
        // against every later upsert, and the participants aggregation reported
        // it as a failed flow forever.
        const res = await post("/api/sessions/upsert").send({
            sessionId: "s-run",
            npType: "BAP",
            flowMap: { f1: "PASS", f2: "RUN", f3: null, f4: 7 },
        });

        expect(res.body.flowMap).toEqual({ f1: "PASS" });
    });

    it("strips pollution already stored when the next upsert lands", async () => {
        await seedSession({
            sessionId: "s-legacy",
            npType: "BAP",
            flowMap: { f1: "RUN", f2: "PASS" },
        } as never);

        const res = await post("/api/sessions/upsert").send({
            sessionId: "s-legacy",
            npType: "BAP",
        });

        expect(res.body.flowMap).toEqual({ f2: "PASS" });
    });

    it("links the session to the user when userId is present", async () => {
        await seedUser({ githubId: "gh-up", sessionIds: [] });

        await post("/api/sessions/upsert").send({
            sessionId: "s-link",
            npType: "BAP",
            userId: "gh-up",
        });

        // The link is fire-and-forget (SessionDetailsController.ts:345), so poll
        // briefly rather than assuming it resolved before the response.
        await expect
            .poll(async () => {
                const user = await UserModel.findOne({ githubId: "gh-up" });
                return user?.sessionIds ?? [];
            })
            .toContain("s-link");
    });
});

describe("POST /api/sessions/:sessionId/analytics", () => {
    const flowSummary = {
        MANDATORY: { total: 3, completed: 3 },
        OPTIONAL: { total: 2, completed: 1 },
    };

    it("400s with a JSON error body when flowSummary or flowMap is missing", async () => {
        await seedSession({ sessionId: "s-an" });

        const res = await post("/api/sessions/s-an/analytics").send({
            flowSummary,
        });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({
            error: true,
            message: "flowSummary and flowMap are required",
        });
    });

    it("saves analytics and forces reportExists to true", async () => {
        await seedSession({ sessionId: "s-an2", reportExists: false });

        const res = await post("/api/sessions/s-an2/analytics").send({
            flowSummary,
            flowMap: { f1: "PASS" },
        });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, message: "Analytics saved" });

        const saved = await SessionDetails.findOne({ sessionId: "s-an2" });
        expect(saved?.reportExists).toBe(true);
        expect(saved?.flowSummary).toEqual(flowSummary);
        expect(saved?.flowMap).toEqual({ f1: "PASS" });
    });

    // QUIRK: merge is `{...existing, ...incoming}`
    // (SessionDetailsRepository.ts:184-187) so INCOMING KEYS WIN — the opposite
    // of upsertSession above. Two endpoints, two merge directions.
    it("merges flowMap with incoming keys winning", async () => {
        await seedSession({
            sessionId: "s-an3",
            flowMap: { f1: "PASS", f2: "PASS" },
        });

        await post("/api/sessions/s-an3/analytics").send({
            flowSummary,
            flowMap: { f1: "FAIL" },
        });

        const saved = await SessionDetails.findOne({ sessionId: "s-an3" });
        expect(saved?.flowMap).toEqual({ f1: "FAIL", f2: "PASS" });
    });

    // QUIRK: flowSummary is replaced wholesale rather than merged
    // (SessionDetailsRepository.ts:191-193).
    it("replaces flowSummary wholesale instead of merging", async () => {
        await seedSession({
            sessionId: "s-an4",
            flowSummary: { REPORTABLE: { total: 9, completed: 9 } },
        });

        await post("/api/sessions/s-an4/analytics").send({
            flowSummary,
            flowMap: { f1: "PASS" },
        });

        const saved = await SessionDetails.findOne({ sessionId: "s-an4" });
        expect(saved?.flowSummary).toEqual(flowSummary);
        expect(saved?.flowSummary).not.toHaveProperty("REPORTABLE");
    });

    // QUIRK: findOneAndUpdate resolves null for an unknown session without
    // throwing, so the endpoint reports success having written nothing.
    it("reports success even when the session does not exist", async () => {
        const res = await post("/api/sessions/ghost/analytics").send({
            flowSummary,
            flowMap: { f1: "PASS" },
        });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, message: "Analytics saved" });
        expect(await SessionDetails.countDocuments()).toBe(0);
    });
});

describe("route ordering", () => {
    // The literal segments MUST stay registered before /:sessionId
    // (SessionRoutes.ts:22 carries a warning comment). Phase B adds /stats,
    // /facets and /export, which must go in the same block.
    it("does not let /:sessionId swallow the literal /filter route", async () => {
        await seedSession({ sessionId: "filter" });

        const res = await get("/api/sessions/filter");

        // 400 from getSessionsByNp, NOT 200 from getSessionById.
        expect(res.status).toBe(400);
        expect(res.text).toBe("Missing npType or npId query parameters");
    });

    it("does not let /:sessionId swallow /check/:sessionId", async () => {
        const res = await get("/api/sessions/check/anything");

        expect(res.status).toBe(200);
        expect(res.body).toBe(false);
    });
});

describe("payload isolation", () => {
    it("keeps payloads addressable by sessionId", async () => {
        await seedSession({ sessionId: "s-iso" });
        await seedPayload({ sessionId: "s-iso" });
        await seedPayload({ sessionId: "other" });

        expect(await Payload.countDocuments({ sessionId: "s-iso" })).toBe(1);
    });
});
