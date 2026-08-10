import { describe, expect, it } from "vitest";
import { useApi } from "../helpers/api";
import { Payload } from "../../entity/Payload";
import { seedPayload } from "../factories";

/**
 * CHARACTERIZATION TESTS — /payload/*
 *
 * See sessions.test.ts for the rules. `QUIRK:` marks behaviour that is
 * arguably wrong but is pinned deliberately, not fixed.
 */

const { get, post, put, del } = useApi();

describe("GET /payload/", () => {
    it("returns every payload as a bare unbounded array", async () => {
        await seedPayload();
        await seedPayload();

        const res = await get("/payload/");

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(2);
    });

    // QUIRK: no pagination and no projection, so this ships the full
    // jsonRequest/jsonResponse blobs for every payload in the database. The
    // dashboard must never call it.
    it("includes the full jsonRequest and jsonResponse blobs", async () => {
        await seedPayload();

        const res = await get("/payload/");

        expect(res.body[0].jsonRequest.context.domain).toBe("ONDC:FIS10");
        expect(res.body[0].jsonResponse).toBeDefined();
    });

    it("returns an empty array when there are no payloads", async () => {
        const res = await get("/payload/");

        expect(res.body).toEqual([]);
    });
});

describe("GET /payload/:id", () => {
    // QUIRK: the JSDoc says "Fetch payload by Mongo _id"
    // (PayloadController.ts:27) but the service calls findByPayloadId
    // (PayloadService.ts:22). `:id` is a payloadId here — yet the SAME param on
    // PUT and DELETE below is a Mongo _id. One route param, two meanings.
    it("resolves the business payloadId, not the Mongo _id", async () => {
        const created = await seedPayload({ payloadId: "biz-id-1" });

        const byPayloadId = await get("/payload/biz-id-1");
        expect(byPayloadId.status).toBe(200);
        expect(byPayloadId.body.payloadId).toBe("biz-id-1");

        const byMongoId = await get(`/payload/${created._id.toString()}`);
        expect(byMongoId.status).toBe(404);
    });

    it("404s with a plain-text body when missing", async () => {
        const res = await get("/payload/nope");

        expect(res.status).toBe(404);
        expect(res.text).toBe("Payload not found");
    });
});

describe("POST /payload/", () => {
    it("creates a payload and returns 201", async () => {
        const res = await post("/payload/").send({
            payloadId: "p-new",
            sessionId: "s-1",
            action: "search",
            httpStatus: 200,
        });

        expect(res.status).toBe(201);
        expect(res.body.payloadId).toBe("p-new");
        expect(await Payload.countDocuments()).toBe(1);
    });

    it("400s when the unique payloadId is reused", async () => {
        await seedPayload({ payloadId: "dupe" });

        const res = await post("/payload/").send({
            payloadId: "dupe",
            sessionId: "s-1",
        });

        expect(res.status).toBe(400);
        expect(res.text).toBe("Error creating payload");
    });

    it("400s when required fields are missing", async () => {
        const res = await post("/payload/").send({ action: "search" });

        expect(res.status).toBe(400);
    });
});

describe("POST /payload/ids", () => {
    it("returns the found payloads under a payloads key", async () => {
        await seedPayload({ payloadId: "a" });
        await seedPayload({ payloadId: "b" });

        const res = await post("/payload/ids").send({ payload_ids: ["a", "b"] });

        expect(res.status).toBe(200);
        expect(res.body.payloads).toHaveLength(2);
    });

    // QUIRK: misses are silently dropped (PayloadService.ts:53) rather than
    // reported, so the caller cannot tell which ids were not found.
    it("silently drops ids that do not resolve", async () => {
        await seedPayload({ payloadId: "real" });

        const res = await post("/payload/ids").send({
            payload_ids: ["real", "ghost"],
        });

        expect(res.status).toBe(200);
        expect(res.body.payloads).toHaveLength(1);
        expect(res.body.payloads[0].payloadId).toBe("real");
    });

    it("404s when none of the ids resolve", async () => {
        const res = await post("/payload/ids").send({
            payload_ids: ["ghost"],
        });

        expect(res.status).toBe(404);
        expect(res.text).toBe("Payloads not found");
    });

    // QUIRK: payload_ids is never validated, so an absent body throws inside
    // .map (PayloadService.ts:51) and surfaces as a generic 400.
    it("400s when payload_ids is absent", async () => {
        const res = await post("/payload/ids").send({});

        expect(res.status).toBe(400);
        expect(res.text).toBe("Error retrieving payloads");
    });
});

describe("PUT /payload/:id", () => {
    // REGRESSION GUARD. This route used to chain .populate("sessionDetails")
    // (PayloadRepository.ts) on a path absent from the Payload schema. Mongoose
    // 8's strictPopulate threw AFTER findByIdAndUpdate had committed, so the
    // route answered 400 on a request that had succeeded — and any client
    // retrying on 400 wrote twice. The populate is gone; keep it gone.
    it("updates and returns 200 with the new document", async () => {
        const created = await seedPayload({ httpStatus: 200 });

        const res = await put(`/payload/${created._id.toString()}`).send({
            httpStatus: 500,
        });

        expect(res.status).toBe(200);
        expect(res.body.httpStatus).toBe(500);

        const persisted = await Payload.findById(created._id);
        expect(persisted?.httpStatus).toBe(500);
    });

    it("does not report failure for a write that succeeded", async () => {
        const created = await seedPayload({ httpStatus: 200 });

        const res = await put(`/payload/${created._id.toString()}`).send({
            httpStatus: 404,
        });
        const persisted = await Payload.findById(created._id);

        // The response status and the database must agree.
        expect(res.status).toBe(200);
        expect(persisted?.httpStatus).toBe(404);
    });

    // QUIRK: the controller's `if (!updatedPayload) 404` branch
    // (PayloadController.ts:102) is unreachable — the service throws first
    // (PayloadService.ts:82), so every failure is a 400.
    it("400s rather than 404s for an unknown _id", async () => {
        const res = await put("/payload/507f1f77bcf86cd799439011").send({
            httpStatus: 500,
        });

        expect(res.status).toBe(400);
        expect(res.text).toBe("Error updating payload");
    });

    it("400s for a malformed _id", async () => {
        const res = await put("/payload/not-an-object-id").send({
            httpStatus: 500,
        });

        expect(res.status).toBe(400);
    });
});

describe("DELETE /payload/:id", () => {
    // Unlike GET, this really is a Mongo _id (PayloadRepository.ts:37).
    it("deletes by Mongo _id and returns a plain-text 200", async () => {
        const created = await seedPayload();

        const res = await del(`/payload/${created._id.toString()}`);

        expect(res.status).toBe(200);
        expect(res.text).toBe("Deleted successfully");
        expect(await Payload.countDocuments()).toBe(0);
    });

    it("400s for an unknown _id", async () => {
        const res = await del("/payload/507f1f77bcf86cd799439011");

        expect(res.status).toBe(400);
        expect(res.text).toBe("Error deleting payload");
    });

    it("does not accept a business payloadId", async () => {
        await seedPayload({ payloadId: "biz-del" });

        const res = await del("/payload/biz-del");

        expect(res.status).toBe(400);
        expect(await Payload.countDocuments()).toBe(1);
    });
});

describe("GET /payload/transaction/:transactionId", () => {
    // QUIRK: named getPayloadByTransactionId (singular) but backed by
    // Payload.find (PayloadRepository.ts:6), so it returns an ARRAY.
    it("returns an array despite the singular handler name", async () => {
        await seedPayload({ transactionId: "txn-1" });
        await seedPayload({ transactionId: "txn-1" });

        const res = await get("/payload/transaction/txn-1");

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(2);
    });

    // QUIRK: the `if (!payload) 404` guard (PayloadController.ts:144) can never
    // fire — an empty array is truthy — so an unknown transaction is a 200 [].
    it("200s with an empty array, never 404, for an unknown transactionId", async () => {
        const res = await get("/payload/transaction/ghost-txn");

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});

describe("GET /payload/logs/:transactionId", () => {
    // QUIRK: behaviourally identical to /payload/transaction/:transactionId —
    // both call findByTransactionId. Two routes, one implementation.
    it("behaves identically to the transaction route", async () => {
        await seedPayload({ transactionId: "txn-2" });

        const logs = await get("/payload/logs/txn-2");
        const txn = await get("/payload/transaction/txn-2");

        expect(logs.status).toBe(200);
        expect(logs.body).toHaveLength(1);
        expect(logs.body.map((p: { payloadId: string }) => p.payloadId)).toEqual(
            txn.body.map((p: { payloadId: string }) => p.payloadId),
        );
    });

    it("200s with an empty array for an unknown transactionId", async () => {
        const res = await get("/payload/logs/ghost-txn");

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});

describe("GET /payload/stored/:domain/:version/:action/:page", () => {
    const ctx = (over: Record<string, unknown> = {}) => ({
        jsonRequest: {
            context: {
                domain: "ONDC:FIS10",
                version: "2.1.0",
                action: "search",
                ...over,
            },
        },
    });

    it("returns the paginated envelope with pageSize hardcoded to 10", async () => {
        await seedPayload(ctx());

        const res = await get("/payload/stored/ONDC:FIS10/2.1.0/any/1");

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            totalCount: 1,
            // QUIRK: not client-settable (PayloadService.ts:139).
            pageSize: 10,
            currentPage: 1,
            totalPages: 1,
        });
        expect(res.body.payloads).toHaveLength(1);
    });

    it("paginates with a hardcoded page size of 10", async () => {
        for (let i = 0; i < 12; i++) await seedPayload(ctx());

        const page1 = await get("/payload/stored/ONDC:FIS10/2.1.0/any/1");
        const page2 = await get("/payload/stored/ONDC:FIS10/2.1.0/any/2");

        expect(page1.body.payloads).toHaveLength(10);
        expect(page2.body.payloads).toHaveLength(2);
        expect(page1.body.totalCount).toBe(12);
        expect(page1.body.totalPages).toBe(2);
    });

    // QUIRK: filters on the EMBEDDED jsonRequest.context, not the top-level
    // Payload.action/domain columns — and none of those paths are indexed.
    it("filters on jsonRequest.context, ignoring the top-level action column", async () => {
        await seedPayload({ ...ctx({ action: "select" }), action: "search" });

        const asSearch = await get("/payload/stored/ONDC:FIS10/2.1.0/search/1");
        const asSelect = await get("/payload/stored/ONDC:FIS10/2.1.0/select/1");

        expect(asSearch.body.totalCount).toBe(0);
        expect(asSelect.body.totalCount).toBe(1);
    });

    // The literal string "any" is the sentinel for "no action filter"
    // (PayloadService.ts:147).
    it('treats the literal "any" action as no filter', async () => {
        await seedPayload(ctx({ action: "search" }));
        await seedPayload(ctx({ action: "select" }));

        const res = await get("/payload/stored/ONDC:FIS10/2.1.0/any/1");

        expect(res.body.totalCount).toBe(2);
    });

    it("accepts core_version as an alternative to version", async () => {
        await seedPayload({
            jsonRequest: {
                context: {
                    domain: "ONDC:FIS10",
                    core_version: "1.2.0",
                    action: "search",
                },
            },
        });

        const res = await get("/payload/stored/ONDC:FIS10/1.2.0/any/1");

        expect(res.body.totalCount).toBe(1);
    });

    it("returns an empty envelope when nothing matches", async () => {
        const res = await get("/payload/stored/ONDC:NOPE/9.9.9/any/1");

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            payloads: [],
            totalCount: 0,
            totalPages: 0,
        });
    });

    it("excludes payloads from other domains and versions", async () => {
        await seedPayload(ctx());
        await seedPayload(ctx({ domain: "ONDC:RET10" }));
        await seedPayload(ctx({ version: "1.0.0" }));

        const res = await get("/payload/stored/ONDC:FIS10/2.1.0/any/1");

        expect(res.body.totalCount).toBe(1);
    });
});
