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
async function seedPair(args: {
    npId: string;
    sessionId: string;
    npType?: string;
    flowId?: string;
    sessionAt: string;
    payloadAt: string;
    uri?: Record<string, unknown>;
    flowMap?: Record<string, string> | null;
    /**
     * A row is one host in one role on one domain+version, so the tests that
     * exercise the split vary these. Omit the key to take the factory's
     * ONDC:FIS10 / 2.1.0; pass it explicitly as undefined to seed a session
     * with the field absent altogether.
     */
    domain?: string | null;
    version?: string | null;
}) {
    const {
        npId,
        sessionId,
        npType = "BAP",
        flowId = "flow-1",
        sessionAt,
        payloadAt,
        uri,
        flowMap,
    } = args;

    await seedSession({
        sessionId,
        npId,
        npType,
        flowMap,
        // Key presence, not value: `domain: undefined` has to reach the factory
        // to override its default, which a `!== undefined` guard would swallow.
        ...("domain" in args && { domain: args.domain }),
        ...("version" in args && { version: args.version }),
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
            npType: "BAP",
            domain: "ONDC:FIS10",
            version: "2.1.0",
            sessions: 2,
            firstSessionAt: "2026-07-01T10:00:00.000Z",
            lastSessionAt: "2026-07-03T10:00:00.000Z",
            firstPayloadAt: "2026-07-01T10:00:05.000Z",
        });
    });

    it("splits a host that acted as both BAP and BPP into a row each", async () => {
        // The whole point of the split: one merged row could only carry the
        // earliest payload across both roles, so "first payload as a BPP" was
        // unanswerable.
        await seedPair({
            npId: "https://np.example.com",
            sessionId: "s-bap",
            npType: "BAP",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
        });
        await seedPair({
            npId: "https://np.example.com",
            sessionId: "s-bpp",
            npType: "BPP",
            sessionAt: "2026-07-05T10:00:00.000Z",
            payloadAt: "2026-07-05T10:00:05.000Z",
        });

        const res = await get("/api/sessions/participants?sort=npType&order=asc");

        expect(res.body.total).toBe(2);
        expect(res.body.data).toMatchObject([
            {
                host: "np.example.com",
                npType: "BAP",
                sessions: 1,
                firstPayloadAt: "2026-07-01T10:00:05.000Z",
            },
            {
                host: "np.example.com",
                npType: "BPP",
                sessions: 1,
                firstPayloadAt: "2026-07-05T10:00:05.000Z",
            },
        ]);
    });

    it("splits one host and role across domains and across versions", async () => {
        await seedPair({
            npId: "https://np.example.com",
            sessionId: "s-fis",
            domain: "ONDC:FIS10",
            version: "2.1.0",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
        });
        await seedPair({
            npId: "https://np.example.com",
            sessionId: "s-ret",
            domain: "ONDC:RET10",
            version: "2.1.0",
            sessionAt: "2026-07-02T10:00:00.000Z",
            payloadAt: "2026-07-02T10:00:05.000Z",
        });
        await seedPair({
            npId: "https://np.example.com",
            sessionId: "s-ret-2",
            domain: "ONDC:RET10",
            version: "2.0.0",
            sessionAt: "2026-07-03T10:00:00.000Z",
            payloadAt: "2026-07-03T10:00:05.000Z",
        });

        const res = await get(
            "/api/sessions/participants?sort=domain&order=asc",
        );

        expect(res.body.total).toBe(3);
        expect(
            res.body.data.map((r: { domain: string; version: string }) => [
                r.domain,
                r.version,
            ]),
        ).toEqual([
            ["ONDC:FIS10", "2.1.0"],
            ["ONDC:RET10", "2.0.0"],
            ["ONDC:RET10", "2.1.0"],
        ]);
    });

    it("partitions sessions across the split rather than duplicating them", async () => {
        // Two roles on one host: the split rows must still add back up to the
        // session count the merged row used to show.
        for (const [i, npType] of ["BAP", "BPP", "BAP"].entries()) {
            await seedPair({
                npId: "https://np.example.com",
                sessionId: `s-${i}`,
                npType,
                sessionAt: "2026-07-01T10:00:00.000Z",
                payloadAt: "2026-07-01T10:00:05.000Z",
            });
        }

        const res = await get("/api/sessions/participants");
        const total = res.body.data.reduce(
            (sum: number, r: { sessions: number }) => sum + r.sessions,
            0,
        );

        expect(res.body.total).toBe(2);
        expect(total).toBe(3);
    });

    it("treats a missing, a null and an empty domain as one row", async () => {
        // A document-valued $group._id omits a field that resolves to missing,
        // so without normalisation these would be three separate rows — and the
        // missing-domain one would arrive with no `domain` key at all.
        await seedPair({
            npId: "https://np.example.com",
            sessionId: "s-undef",
            domain: undefined,
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
        });
        await seedPair({
            npId: "https://np.example.com",
            sessionId: "s-null",
            domain: null,
            sessionAt: "2026-07-02T10:00:00.000Z",
            payloadAt: "2026-07-02T10:00:05.000Z",
        });
        await seedPair({
            npId: "https://np.example.com",
            sessionId: "s-empty",
            domain: "",
            sessionAt: "2026-07-03T10:00:00.000Z",
            payloadAt: "2026-07-03T10:00:05.000Z",
        });

        const res = await get("/api/sessions/participants");

        expect(res.body.total).toBe(1);
        expect(res.body.data[0]).toMatchObject({
            host: "np.example.com",
            domain: null,
            sessions: 3,
        });
        expect(res.body.data[0]).toHaveProperty("domain");
    });

    it("selects the blank slice through the __none__ sentinel", async () => {
        await seedPair({
            npId: "https://np.example.com",
            sessionId: "s-blank",
            domain: null,
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
        });
        await seedPair({
            npId: "https://np.example.com",
            sessionId: "s-fis",
            domain: "ONDC:FIS10",
            sessionAt: "2026-07-02T10:00:00.000Z",
            payloadAt: "2026-07-02T10:00:05.000Z",
        });

        const res = await get("/api/sessions/participants?domain=__none__");

        expect(res.body.total).toBe(1);
        expect(res.body.data[0]).toMatchObject({
            domain: null,
            sessions: 1,
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

    it("honours descending order on every identity column", async () => {
        // All four double as the paging tiebreaker, so each one is its own
        // chance to write `{ domain: -1, ..., domain: 1 }` and lose the
        // direction to the literal 1.
        await seedPair({
            npId: "https://alpha.example.com",
            sessionId: "s-1",
            npType: "BAP",
            domain: "ONDC:FIS10",
            version: "2.0.0",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
        });
        await seedPair({
            npId: "https://zulu.example.com",
            sessionId: "s-2",
            npType: "BPP",
            domain: "ONDC:RET10",
            version: "2.1.0",
            sessionAt: "2026-07-02T10:00:00.000Z",
            payloadAt: "2026-07-02T10:00:05.000Z",
        });

        for (const [field, low, high] of [
            ["host", "alpha.example.com", "zulu.example.com"],
            ["npType", "BAP", "BPP"],
            ["domain", "ONDC:FIS10", "ONDC:RET10"],
            ["version", "2.0.0", "2.1.0"],
        ] as const) {
            const desc = await get(
                `/api/sessions/participants?sort=${field}&order=desc`,
            );
            const asc = await get(
                `/api/sessions/participants?sort=${field}&order=asc`,
            );

            expect(
                desc.body.data.map((r: Record<string, string>) => r[field]),
            ).toEqual([high, low]);
            expect(
                asc.body.data.map((r: Record<string, string>) => r[field]),
            ).toEqual([low, high]);
        }
    });

    it("pages one host's slices without repeating or skipping one", async () => {
        // Same host on every row, so host alone cannot break the tie — this is
        // what the rest of the identity chain is for.
        for (const domain of ["ONDC:FIS10", "ONDC:RET10", "ONDC:TRV11"]) {
            await seedPair({
                npId: "https://np.example.com",
                sessionId: `s-${domain}`,
                domain,
                sessionAt: "2026-07-01T10:00:00.000Z",
                payloadAt: "2026-07-01T10:00:05.000Z",
            });
        }

        const pages = await Promise.all(
            [1, 2, 3].map((page) =>
                get(`/api/sessions/participants?limit=1&page=${page}`),
            ),
        );
        const seen = pages.flatMap((p) =>
            p.body.data.map((r: { domain: string }) => r.domain),
        );

        expect(seen).toHaveLength(3);
        expect(new Set(seen).size).toBe(3);
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

    it("scopes the drill-down to the clicked slice, not the whole host", async () => {
        // The three identity params are a pre-group match, so pinning them
        // narrows the head to the one row that was clicked — and carries the
        // same narrowing into recentSessions and the flow verdicts.
        await seedPair({
            npId: "https://np.example.com",
            sessionId: "s-bap",
            npType: "BAP",
            flowId: "flow-a",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
            flowMap: { "flow-a": "PASS" },
        });
        await seedPair({
            npId: "https://np.example.com",
            sessionId: "s-bpp",
            npType: "BPP",
            flowId: "flow-b",
            sessionAt: "2026-07-05T10:00:00.000Z",
            payloadAt: "2026-07-05T10:00:05.000Z",
            flowMap: { "flow-b": "FAIL" },
        });

        const res = await get(
            "/api/sessions/participants/np.example.com" +
                "?npType=BAP&domain=ONDC:FIS10&version=2.1.0",
        );

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            host: "np.example.com",
            npType: "BAP",
            domain: "ONDC:FIS10",
            version: "2.1.0",
            sessions: 1,
            flowsPassed: 1,
            firstPayloadAt: "2026-07-01T10:00:05.000Z",
        });
        expect(res.body.recentSessions).toEqual([
            expect.objectContaining({ sessionId: "s-bap", npType: "BAP" }),
        ]);
        expect(res.body.flows).toEqual([
            { flowId: "flow-a", passed: 1, failed: 0 },
        ]);
    });

    it("addresses a blank-domain slice through the sentinel", async () => {
        await seedPair({
            npId: "https://np.example.com",
            sessionId: "s-blank",
            domain: null,
            version: null,
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
        });
        await seedPair({
            npId: "https://np.example.com",
            sessionId: "s-fis",
            sessionAt: "2026-07-02T10:00:00.000Z",
            payloadAt: "2026-07-02T10:00:05.000Z",
        });

        const res = await get(
            "/api/sessions/participants/np.example.com" +
                "?npType=BAP&domain=__none__&version=__none__",
        );

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            domain: null,
            version: null,
            sessions: 1,
        });
        expect(res.body.recentSessions).toHaveLength(1);
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

describe("participants passed / failed", () => {
    it("counts flowsFailed as the judged flows that never passed", async () => {
        await seedPair({
            npId: "https://buyer.example.com",
            sessionId: "s-1",
            flowId: "flow-a",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
            flowMap: { "flow-a": "PASS", "flow-b": "FAIL", "flow-c": "FAIL" },
        });

        const res = await get("/api/sessions/participants");

        expect(res.body.data[0]).toMatchObject({
            flowsJudged: 3,
            flowsPassed: 1,
            flowsFailed: 2,
        });
    });

    it("keeps passed + failed equal to judged on every row", async () => {
        // The invariant the column pair exists to show. A distinct union of
        // FAIL verdicts would break it here: flow-a both failed and passed.
        await seedPair({
            npId: "https://buyer.example.com",
            sessionId: "s-1",
            flowId: "flow-a",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
            flowMap: { "flow-a": "FAIL", "flow-b": "FAIL" },
        });
        await seedPair({
            npId: "https://buyer.example.com",
            sessionId: "s-2",
            flowId: "flow-a",
            sessionAt: "2026-07-02T10:00:00.000Z",
            payloadAt: "2026-07-02T10:00:05.000Z",
            flowMap: { "flow-a": "PASS" },
        });

        const [row] = (await get("/api/sessions/participants")).body.data;

        expect(row).toMatchObject({
            flowsJudged: 2,
            flowsPassed: 1,
            flowsFailed: 1,
        });
        expect(row.flowsPassed + row.flowsFailed).toBe(row.flowsJudged);
    });

    it("reports nothing judged as zero failed, not as failure", async () => {
        await seedPair({
            npId: "https://buyer.example.com",
            sessionId: "s-1",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
            flowMap: null,
        });

        const res = await get("/api/sessions/participants");

        expect(res.body.data[0]).toMatchObject({
            flowsJudged: 0,
            flowsFailed: 0,
            passRate: null,
        });
    });

    it("sorts on flowsFailed in both directions", async () => {
        await seedPair({
            npId: "https://one.example.com",
            sessionId: "s-1",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
            flowMap: { "flow-a": "FAIL" },
        });
        await seedPair({
            npId: "https://three.example.com",
            sessionId: "s-2",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
            flowMap: { "flow-a": "FAIL", "flow-b": "FAIL", "flow-c": "FAIL" },
        });

        const desc = await get(
            "/api/sessions/participants?sort=flowsFailed&order=desc",
        );
        const asc = await get(
            "/api/sessions/participants?sort=flowsFailed&order=asc",
        );

        expect(desc.status).toBe(200);
        expect(desc.body.data.map((r: { host: string }) => r.host)).toEqual([
            "three.example.com",
            "one.example.com",
        ]);
        expect(asc.body.data[0].host).toBe("one.example.com");
    });
});

/**
 * The CSV mirrors the table rather than the wire format: cells hold the text the
 * page renders, so the file a user downloads reads like what they exported.
 */
describe("GET /api/sessions/participants/export", () => {
    /** Enough of RFC 4180 to read back what csvRow writes, quotes and all. */
    const parseCsv = (text: string): string[][] => {
        const rows: string[][] = [];
        let row: string[] = [];
        let field = "";
        let quoted = false;

        for (let i = 0; i < text.length; i += 1) {
            const char = text[i];

            if (quoted) {
                if (char !== '"') field += char;
                else if (text[i + 1] === '"') {
                    field += '"';
                    i += 1;
                } else quoted = false;
                continue;
            }

            if (char === '"') quoted = true;
            else if (char === ",") {
                row.push(field);
                field = "";
            } else if (char === "\r" && text[i + 1] === "\n") {
                row.push(field);
                rows.push(row);
                field = "";
                row = [];
                i += 1;
            } else field += char;
        }

        if (field !== "" || row.length > 0) {
            row.push(field);
            rows.push(row);
        }
        return rows;
    };

    it("sends a CSV attachment with a dated filename", async () => {
        await seedPair({
            npId: "https://buyer.example.com",
            sessionId: "s-1",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
        });

        const res = await get("/api/sessions/participants/export");

        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/text\/csv/);
        expect(res.headers["content-disposition"]).toMatch(
            /^attachment; filename="participants-\d{4}-\d{2}-\d{2}\.csv"$/,
        );
    });

    it("writes the table's own headers, in the table's order", async () => {
        const res = await get("/api/sessions/participants/export");

        expect(parseCsv(res.text)[0]).toEqual([
            "Participant",
            "Role",
            "Domain",
            "Version",
            "Sessions",
            "First session",
            "First payload",
            "Flows attempted",
            "Flows judged",
            "Passed",
            "Failed",
            "Pass rate",
        ]);
    });

    it("exports the whole filtered set, not the page on screen", async () => {
        for (let i = 0; i < 5; i += 1) {
            await seedPair({
                npId: `https://np-${i}.example.com`,
                sessionId: `s-${i}`,
                sessionAt: "2026-07-01T10:00:00.000Z",
                payloadAt: "2026-07-01T10:00:05.000Z",
            });
        }

        // limit is what the table was paging by; the file ignores it.
        const res = await get("/api/sessions/participants/export?limit=2");

        expect(parseCsv(res.text)).toHaveLength(6);
    });

    it("carries display text, not wire values", async () => {
        await seedPair({
            npId: "https://buyer.example.com",
            sessionId: "s-1",
            flowId: "flow-a",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
            flowMap: { "flow-a": "PASS", "flow-b": "FAIL" },
        });

        const [, row] = parseCsv(
            (await get("/api/sessions/participants/export?tz=UTC")).text,
        );

        expect(row[0]).toBe("buyer.example.com");
        expect(row[1]).toBe("BAP");
        expect(row[2]).toBe("ONDC:FIS10");
        expect(row[3]).toBe("2.1.0");
        expect(row[5]).toMatch(/1 Jul 2026/);
        expect(row[9]).toBe("1");
        expect(row[10]).toBe("1");
        // 0.5 on the wire, "50.0%" on the page.
        expect(row[11]).toBe("50.0%");
    });

    it('writes "Never" for a participant that sent no payload', async () => {
        // A real state — the session exists, nothing ever arrived — which the
        // table shows as a badge rather than as a zero date.
        await seedSession({
            sessionId: "s-1",
            npId: "https://buyer.example.com",
            createdAt: at("2026-07-01T10:00:00.000Z"),
        } as never);

        const [, row] = parseCsv(
            (await get("/api/sessions/participants/export")).text,
        );

        expect(row[6]).toBe("Never");
        // Nothing judged is unmeasured, not 0%.
        expect(row[11]).toBe("—");
    });

    it("renders timestamps in the caller's zone", async () => {
        // 20:00 UTC is already the next day in Kolkata. Without tz the file
        // would silently use the server's zone and disagree with the table.
        await seedPair({
            npId: "https://buyer.example.com",
            sessionId: "s-1",
            sessionAt: "2026-07-01T20:00:00.000Z",
            payloadAt: "2026-07-01T20:00:05.000Z",
        });

        const utc = await get("/api/sessions/participants/export?tz=UTC");
        const ist = await get(
            "/api/sessions/participants/export?tz=Asia/Kolkata",
        );

        expect(parseCsv(utc.text)[1][5]).toMatch(/1 Jul 2026/);
        expect(parseCsv(ist.text)[1][5]).toMatch(/2 Jul 2026/);
    });

    it("rejects a time zone the runtime does not know", async () => {
        const res = await get("/api/sessions/participants/export?tz=Not/AZone");

        expect(res.status).toBe(400);
        expect(res.body.messages).toContain(
            "tz must be a valid IANA time zone",
        );
    });

    it("honours the filters and sort the table was showing", async () => {
        await seedPair({
            npId: "https://alpha.example.com",
            sessionId: "s-1",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
        });
        await seedPair({
            npId: "https://zulu.example.com",
            sessionId: "s-2",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
        });
        await seedPair({
            npId: "https://seller.example.org",
            sessionId: "s-3",
            npType: "BPP",
            sessionAt: "2026-07-01T10:00:00.000Z",
            payloadAt: "2026-07-01T10:00:05.000Z",
        });

        const filtered = await get(
            "/api/sessions/participants/export?npType=BPP",
        );
        expect(parseCsv(filtered.text).slice(1).map((r) => r[0])).toEqual([
            "seller.example.org",
        ]);

        const sorted = await get(
            "/api/sessions/participants/export?sort=host&order=desc",
        );
        expect(parseCsv(sorted.text).slice(1).map((r) => r[0])).toEqual([
            "zulu.example.com",
            "seller.example.org",
            "alpha.example.com",
        ]);
    });
});

describe("participants route ordering", () => {
    it("does not shadow the wildcard session route", async () => {
        // /participants must resolve as a literal, not as a sessionId.
        const res = await get("/api/sessions/participants");
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("does not read /participants/export as a subscriber host", async () => {
        // The detail route would happily 404 on a host called "export".
        const res = await get("/api/sessions/participants/export");

        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/text\/csv/);
    });
});
