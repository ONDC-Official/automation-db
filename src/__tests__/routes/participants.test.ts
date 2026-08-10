import { describe, expect, it } from "vitest";

import { useApi } from "../helpers/api";
import { seedPayload, seedSession } from "../factories";

const { get } = useApi();
const at = (iso: string) => new Date(iso);

/**
 * The shared payload factory's context carries only domain/version/action, so
 * every participant test has to supply the subscriber URIs itself.
 */
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

/** A BAP session plus one payload attributed to it. */
async function seedPair({
    npId,
    sessionId,
    npType = "BAP",
    flowId = "flow-1",
    sessionAt,
    payloadAt,
    uri,
    flowMap,
}: {
    npId: string;
    sessionId: string;
    npType?: string;
    flowId?: string;
    sessionAt: string;
    payloadAt: string;
    uri?: Record<string, unknown>;
    flowMap?: Record<string, string> | null;
}) {
    await seedSession({
        sessionId,
        npId,
        npType,
        flowMap,
        createdAt: at(sessionAt),
    } as never);
    await seedPayload({
        sessionId,
        flowId,
        createdAt: at(payloadAt),
        ...ctx(uri ?? (npType === "BAP" ? { bap_uri: npId } : { bpp_uri: npId })),
    });
}

const findHost = (body: { data: Array<{ host: string }> }, host: string) =>
    body.data.find((r) => r.host === host);

describe("GET /api/sessions/participants", () => {
    it("groups sessions by subscriber host with first-seen dates", async () => {
        await seedPair({
            npId: "https://buyer.example.com",
            sessionId: "s-1",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
        });
        await seedPair({
            npId: "https://buyer.example.com",
            sessionId: "s-2",
            sessionAt: "2026-07-03T10:00:00.000Z",
            payloadAt: "2026-07-03T10:00:05.000Z",
        });

        const res = await get("/api/sessions/participants");

        expect(res.status).toBe(200);
        expect(res.body.total).toBe(1);
        expect(res.body.data[0]).toMatchObject({
            host: "buyer.example.com",
            npTypes: ["BAP"],
            sessions: 2,
            firstSessionAt: "2026-07-01T10:00:00.000Z",
            lastSessionAt: "2026-07-03T10:00:00.000Z",
            firstPayloadAt: "2026-07-01T10:00:05.000Z",
        });
    });

    it("collapses scheme and path variants of one subscriber into one row", async () => {
        await seedPair({
            npId: "https://buyer.example.com",
            sessionId: "s-1",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
        });
        await seedPair({
            npId: "http://buyer.example.com/ondc/bap",
            sessionId: "s-2",
            sessionAt: "2026-07-02T10:00:00.000Z",
            payloadAt: "2026-07-02T10:00:05.000Z",
        });

        const res = await get("/api/sessions/participants");

        expect(res.body.total).toBe(1);
        expect(res.body.data[0].host).toBe("buyer.example.com");
        expect(res.body.data[0].sessions).toBe(2);
        expect(res.body.data[0].npIds).toHaveLength(2);
    });

    it("counts distinct sessionIds, not session documents", async () => {
        // sessionId is deliberately non-unique, so the collection really can
        // hold two documents describing one session.
        await seedSession({
            sessionId: "dupe",
            npId: "https://buyer.example.com",
            createdAt: at("2026-07-01T10:00:00.000Z"),
        } as never);
        await seedSession({
            sessionId: "dupe",
            npId: "https://buyer.example.com",
            createdAt: at("2026-07-01T11:00:00.000Z"),
        } as never);

        const res = await get("/api/sessions/participants");

        expect(res.body.data[0].sessions).toBe(1);
    });

    it("excludes the workbench's own host", async () => {
        await seedPair({
            npId: "https://workbench.ondc.tech/api-service/bap",
            sessionId: "s-1",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
        });
        await seedPair({
            npId: "https://buyer.example.com",
            sessionId: "s-2",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
        });

        const res = await get("/api/sessions/participants");

        expect(res.body.total).toBe(1);
        expect(findHost(res.body, "workbench.ondc.tech")).toBeUndefined();
    });

    it("treats a null flowMap as nothing judged, not as failure", async () => {
        await seedPair({
            npId: "https://buyer.example.com",
            sessionId: "s-1",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
            flowMap: null,
        });

        const res = await get("/api/sessions/participants");

        expect(res.status).toBe(200);
        expect(res.body.data[0]).toMatchObject({
            flowsJudged: 0,
            flowsPassed: 0,
            passRate: null,
        });
    });

    it("counts flows as distinct identities, so judged never exceeds attempted", async () => {
        // The same flow judged in two sessions is ONE judged flow. Summing per
        // session instead would report 2 judged against 1 attempted.
        await seedPair({
            npId: "https://buyer.example.com",
            sessionId: "s-1",
            flowId: "flow-a",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
            flowMap: { "flow-a": "PASS" },
        });
        await seedPair({
            npId: "https://buyer.example.com",
            sessionId: "s-2",
            flowId: "flow-a",
            sessionAt: "2026-07-02T10:00:00.000Z",
            payloadAt: "2026-07-02T10:00:05.000Z",
            flowMap: { "flow-a": "FAIL" },
        });

        const res = await get("/api/sessions/participants");

        expect(res.body.data[0]).toMatchObject({
            flowsAttempted: 1,
            flowsJudged: 1,
            flowsPassed: 1,
        });
        expect(res.body.data[0].flowsJudged).toBeLessThanOrEqual(
            res.body.data[0].flowsAttempted,
        );
    });

    it("reports passRate over judged flows only", async () => {
        await seedPair({
            npId: "https://buyer.example.com",
            sessionId: "s-1",
            flowId: "flow-a",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
            flowMap: { "flow-a": "PASS", "flow-b": "FAIL" },
        });

        const res = await get("/api/sessions/participants");

        expect(res.body.data[0]).toMatchObject({
            flowsJudged: 2,
            flowsPassed: 1,
            passRate: 0.5,
        });
    });

    it("takes the payload URI side that matches the session's npType", async () => {
        // A BPP session's own URI is bpp_uri; bap_uri is the counterparty and
        // must not decide when this participant first sent us anything.
        await seedSession({
            sessionId: "s-1",
            npId: "https://seller.example.com",
            npType: "BPP",
            createdAt: at("2026-07-01T10:00:00.000Z"),
        } as never);
        await seedPayload({
            sessionId: "s-1",
            createdAt: at("2026-07-01T10:00:09.000Z"),
            ...ctx({
                bap_uri: "https://someone-else.example.com",
                bpp_uri: "https://seller.example.com",
            }),
        });

        const res = await get("/api/sessions/participants");

        expect(res.body.data[0].host).toBe("seller.example.com");
        expect(res.body.data[0].firstPayloadAt).toBe(
            "2026-07-01T10:00:09.000Z",
        );
    });

    it("falls back to the session's earliest payload when neither URI matches", async () => {
        await seedSession({
            sessionId: "s-1",
            npId: "https://seller.example.com",
            npType: "BPP",
            createdAt: at("2026-07-01T10:00:00.000Z"),
        } as never);
        await seedPayload({
            sessionId: "s-1",
            createdAt: at("2026-07-01T10:00:07.000Z"),
            ...ctx({ bap_uri: "https://a.example.com" }),
        });

        const res = await get("/api/sessions/participants");

        expect(res.body.data[0].firstPayloadAt).toBe(
            "2026-07-01T10:00:07.000Z",
        );
    });

    it("returns an empty envelope when nothing matches", async () => {
        const res = await get("/api/sessions/participants");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            data: [],
            total: 0,
            page: 1,
            limit: 50,
            totalPages: 0,
        });
    });

    it("honours the date window", async () => {
        await seedPair({
            npId: "https://old.example.com",
            sessionId: "s-1",
            sessionAt: "2026-06-01T10:00:00.000Z",
            payloadAt: "2026-06-01T10:00:05.000Z",
        });
        await seedPair({
            npId: "https://new.example.com",
            sessionId: "s-2",
            sessionAt: "2026-07-10T10:00:00.000Z",
            payloadAt: "2026-07-10T10:00:05.000Z",
        });

        const res = await get(
            "/api/sessions/participants?from=2026-07-01T00:00:00.000Z",
        );

        expect(res.body.total).toBe(1);
        expect(res.body.data[0].host).toBe("new.example.com");
    });

    it("filters on a partial host match", async () => {
        await seedPair({
            npId: "https://buyer.example.com",
            sessionId: "s-1",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
        });
        await seedPair({
            npId: "https://seller.example.org",
            sessionId: "s-2",
            npType: "BPP",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
        });

        const res = await get("/api/sessions/participants?q=seller");

        expect(res.body.total).toBe(1);
        expect(res.body.data[0].host).toBe("seller.example.org");
    });

    it("reports every invalid filter at once", async () => {
        const res = await get(
            "/api/sessions/participants?sort=bogus&from=notadate&order=sideways",
        );

        expect(res.status).toBe(400);
        expect(res.body.error).toBe(true);
        expect(res.body.messages).toHaveLength(3);
    });

    it("honours descending order on the host column itself", async () => {
        // host doubles as the paging tiebreaker, and `{ host: -1, host: 1 }`
        // is one key in an object literal — the literal 1 wins and the
        // requested direction disappears without an error.
        for (const name of ["alpha", "mike", "zulu"]) {
            await seedPair({
                npId: `https://${name}.example.com`,
                sessionId: `s-${name}`,
                sessionAt: "2026-07-01T10:00:00.000Z",
                payloadAt: "2026-07-01T10:00:05.000Z",
            });
        }

        const desc = await get(
            "/api/sessions/participants?sort=host&order=desc",
        );
        const asc = await get("/api/sessions/participants?sort=host&order=asc");

        expect(desc.body.data.map((r: { host: string }) => r.host)).toEqual([
            "zulu.example.com",
            "mike.example.com",
            "alpha.example.com",
        ]);
        expect(asc.body.data[0].host).toBe("alpha.example.com");
    });

    it("survives a flowMap that is neither an object nor null", async () => {
        // flowMap is Schema.Types.Mixed, so it can hold a string or an array,
        // and $objectToArray throws on both.
        await seedSession({
            sessionId: "s-1",
            npId: "https://buyer.example.com",
            flowMap: "not-an-object",
            createdAt: at("2026-07-01T10:00:00.000Z"),
        } as never);

        const res = await get("/api/sessions/participants");

        expect(res.status).toBe(200);
        expect(res.body.data[0]).toMatchObject({
            flowsJudged: 0,
            passRate: null,
        });
    });

    it("ignores a payload with no flowId rather than counting a phantom flow", async () => {
        await seedSession({
            sessionId: "s-1",
            npId: "https://buyer.example.com",
            createdAt: at("2026-07-01T10:00:00.000Z"),
        } as never);
        await seedPayload({
            sessionId: "s-1",
            flowId: undefined,
            createdAt: at("2026-07-01T10:00:05.000Z"),
            ...ctx({ bap_uri: "https://buyer.example.com" }),
        });

        const res = await get("/api/sessions/participants");

        expect(res.body.data[0].flowsAttempted).toBe(0);
    });

    it("pages without repeating or skipping a participant", async () => {
        for (let i = 0; i < 5; i += 1) {
            await seedPair({
                npId: `https://np-${i}.example.com`,
                sessionId: `s-${i}`,
                sessionAt: "2026-07-01T10:00:00.000Z",
                payloadAt: "2026-07-01T10:00:05.000Z",
            });
        }

        const first = await get("/api/sessions/participants?limit=2&page=1");
        const second = await get("/api/sessions/participants?limit=2&page=2");
        const third = await get("/api/sessions/participants?limit=2&page=3");

        expect(first.body.total).toBe(5);
        expect(first.body.totalPages).toBe(3);

        const seen = [...first.body.data, ...second.body.data, ...third.body.data].map(
            (r: { host: string }) => r.host,
        );
        expect(seen).toHaveLength(5);
        expect(new Set(seen).size).toBe(5);
    });
});

describe("GET /api/sessions/participants/:host", () => {
    it("returns the participant with its sessions and flow verdicts", async () => {
        await seedPair({
            npId: "https://buyer.example.com",
            sessionId: "s-1",
            flowId: "flow-a",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
            flowMap: { "flow-a": "PASS" },
        });
        await seedPair({
            npId: "https://buyer.example.com",
            sessionId: "s-2",
            flowId: "flow-a",
            sessionAt: "2026-07-02T10:00:00.000Z",
            payloadAt: "2026-07-02T10:00:05.000Z",
            flowMap: { "flow-a": "FAIL" },
        });

        const res = await get(
            "/api/sessions/participants/buyer.example.com",
        );

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            host: "buyer.example.com",
            sessions: 2,
            flowsAttempted: 1,
            flowsJudged: 1,
        });
        expect(res.body.recentSessions).toHaveLength(2);
        // Verdict counts, unlike the headline figures, are NOT flattened.
        expect(res.body.flows).toEqual([
            { flowId: "flow-a", passed: 1, failed: 1 },
        ]);
    });

    it("404s for a host with no sessions", async () => {
        const res = await get("/api/sessions/participants/nobody.example.com");

        expect(res.status).toBe(404);
    });

    it("404s for the excluded workbench host", async () => {
        await seedPair({
            npId: "https://workbench.ondc.tech/api-service/bap",
            sessionId: "s-1",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
        });

        const res = await get(
            "/api/sessions/participants/workbench.ondc.tech",
        );

        expect(res.status).toBe(404);
    });
});

describe("participants route ordering", () => {
    it("does not shadow the wildcard session route", async () => {
        // /participants must resolve as a literal, not as a sessionId.
        const res = await get("/api/sessions/participants");
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
    });
});
