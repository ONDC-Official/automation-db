import { describe, expect, it } from "vitest";
import { useApi } from "../helpers/api";
import { seedSession } from "../factories";

/**
 * GET /api/sessions/ — opt-in filtered/paginated mode.
 *
 * The legacy bare-array contract is covered in sessions.test.ts and must keep
 * passing; these cover what happens once a recognised filter param appears.
 */

const completed = (id: string) => ({ id, status: "COMPLETED" as const });
const pending = (id: string) => ({ id, status: "PENDING" as const });

const { get } = useApi();

describe("mode switching", () => {
    it("returns the paginated envelope as soon as a recognised param appears", async () => {
        await seedSession();

        const res = await get("/api/sessions/?page=1");

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(false);
        expect(res.body).toMatchObject({
            total: 1,
            page: 1,
            limit: 50,
            totalPages: 1,
        });
        expect(res.body.data).toHaveLength(1);
    });

    it("switches on a filter param alone, with no pagination param", async () => {
        await seedSession({ domain: "ONDC:FIS10" });

        const res = await get("/api/sessions/?domain=ONDC:FIS10");

        expect(res.body.data).toHaveLength(1);
        expect(res.body.total).toBe(1);
    });
});

describe("scalar filters", () => {
    it.each([
        ["domain", "ONDC:RET10"],
        ["version", "1.2.0"],
        ["npType", "BPP"],
        ["sessionType", "MANUAL"],
        ["usecaseId", "usecase-9"],
        ["userId", "gh-target"],
        ["npId", "https://target.example.com"],
    ] as const)("filters by %s", async (field, value) => {
        await seedSession({ [field]: value });
        await seedSession();

        const res = await get(
            `/api/sessions/?${field}=${encodeURIComponent(value)}`,
        );

        expect(res.body.total).toBe(1);
        expect(res.body.data[0][field]).toBe(value);
    });

    it("combines filters with AND", async () => {
        await seedSession({ domain: "ONDC:RET10", version: "1.0.0" });
        await seedSession({ domain: "ONDC:RET10", version: "2.0.0" });

        const res = await get("/api/sessions/?domain=ONDC:RET10&version=2.0.0");

        expect(res.body.total).toBe(1);
    });

    it("returns an empty envelope when nothing matches", async () => {
        await seedSession();

        const res = await get("/api/sessions/?domain=ONDC:NOPE");

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ data: [], total: 0, totalPages: 0 });
    });
});

describe("date range", () => {
    const at = (iso: string) => ({ createdAt: new Date(iso) });

    it("filters by from and to inclusive of the bounds", async () => {
        await seedSession(at("2026-01-01T00:00:00Z"));
        await seedSession(at("2026-06-15T00:00:00Z"));
        await seedSession(at("2026-12-31T00:00:00Z"));

        const res = await get(
            "/api/sessions/?from=2026-01-01T00:00:00Z&to=2026-06-15T00:00:00Z",
        );

        expect(res.body.total).toBe(2);
    });

    it("accepts from without to", async () => {
        await seedSession(at("2025-01-01T00:00:00Z"));
        await seedSession(at("2026-06-01T00:00:00Z"));

        const res = await get("/api/sessions/?from=2026-01-01T00:00:00Z");

        expect(res.body.total).toBe(1);
    });

    it("accepts a plain date string", async () => {
        await seedSession(at("2026-06-01T12:00:00Z"));

        const res = await get("/api/sessions/?from=2026-01-01&to=2026-12-31");

        expect(res.body.total).toBe(1);
    });
});

describe("reportExists filter", () => {
    it("matches only sessions with a report", async () => {
        await seedSession({ reportExists: true });
        await seedSession({ reportExists: false });

        const res = await get("/api/sessions/?reportExists=true");

        expect(res.body.total).toBe(1);
    });

    it("treats missing and false alike when asked for false", async () => {
        await seedSession({ reportExists: true });
        await seedSession({ reportExists: false });

        const res = await get("/api/sessions/?reportExists=false");

        expect(res.body.total).toBe(1);
    });
});

describe("sessionId search", () => {
    it("matches a partial sessionId case-insensitively", async () => {
        await seedSession({ sessionId: "ABC-12345" });
        await seedSession({ sessionId: "XYZ-99999" });

        const res = await get("/api/sessions/?q=abc");

        expect(res.body.total).toBe(1);
        expect(res.body.data[0].sessionId).toBe("ABC-12345");
    });

    // A raw regex in the search box must not become a query operator.
    it("escapes regex metacharacters in the search term", async () => {
        await seedSession({ sessionId: "session-1" });

        const res = await get("/api/sessions/?q=.*");

        expect(res.body.total).toBe(0);
    });
});

describe("derived fields", () => {
    it("computes flow counts, passRate and result", async () => {
        await seedSession({
            sessionId: "derived",
            flows: [completed("f1"), completed("f2"), pending("f3")],
            flowMap: { f1: "PASS", f2: "FAIL" },
        });

        const res = await get("/api/sessions/?q=derived");
        const [row] = res.body.data;

        expect(row).toMatchObject({
            flowsTotal: 3,
            flowsCompleted: 2,
            flowsPassed: 1,
            flowsFailed: 1,
            passRate: 0.5,
            result: "MIXED",
        });
    });

    it("does not leak the intermediate flowMapEntries array", async () => {
        await seedSession({ flowMap: { f1: "PASS" } });

        const res = await get("/api/sessions/?page=1");

        expect(res.body.data[0]).not.toHaveProperty("flowMapEntries");
    });

    // flowMap and flows both default to null, and $objectToArray/$size throw on
    // a non-object — so the null case must be guarded, not assumed away.
    it("handles null flows and flowMap without erroring", async () => {
        await seedSession({ flows: undefined, flowMap: null });

        const res = await get("/api/sessions/?page=1");
        const [row] = res.body.data;

        expect(res.status).toBe(200);
        expect(row).toMatchObject({
            flowsTotal: 0,
            flowsPassed: 0,
            flowsFailed: 0,
            passRate: null,
            result: null,
        });
    });

    // passRate is over JUDGED flows, so pending ones do not drag it down.
    it("bases passRate on judged flows only, not the full flow list", async () => {
        await seedSession({
            flows: [completed("f1"), pending("f2"), pending("f3")],
            flowMap: { f1: "PASS" },
        });

        const res = await get("/api/sessions/?page=1");

        expect(res.body.data[0].passRate).toBe(1);
        expect(res.body.data[0].result).toBe("PASS");
    });

    it("reports null rather than 0 when nothing has been judged", async () => {
        await seedSession({ flows: [pending("f1")], flowMap: {} });

        const res = await get("/api/sessions/?page=1");

        expect(res.body.data[0].passRate).toBeNull();
        expect(res.body.data[0].result).toBeNull();
    });
});

describe("result filter", () => {
    const seedResults = async () => {
        await seedSession({
            sessionId: "all-pass",
            flowMap: { f1: "PASS", f2: "PASS" },
        });
        await seedSession({
            sessionId: "all-fail",
            flowMap: { f1: "FAIL" },
        });
        await seedSession({
            sessionId: "mixed",
            flowMap: { f1: "PASS", f2: "FAIL" },
        });
        await seedSession({ sessionId: "unjudged", flowMap: null });
    };

    it.each([
        ["PASS", "all-pass"],
        ["FAIL", "all-fail"],
        ["MIXED", "mixed"],
    ] as const)("filters result=%s", async (result, expected) => {
        await seedResults();

        const res = await get(`/api/sessions/?result=${result}`);

        expect(res.body.total).toBe(1);
        expect(res.body.data[0].sessionId).toBe(expected);
    });

    it("accepts lowercase", async () => {
        await seedResults();

        const res = await get("/api/sessions/?result=pass");

        expect(res.body.total).toBe(1);
    });

    it("excludes unjudged sessions from every result filter", async () => {
        await seedResults();

        for (const result of ["PASS", "FAIL", "MIXED"]) {
            const res = await get(`/api/sessions/?result=${result}`);
            const ids = res.body.data.map(
                (r: { sessionId: string }) => r.sessionId,
            );
            expect(ids).not.toContain("unjudged");
        }
    });

    it("combines the result filter with scalar filters", async () => {
        await seedSession({ domain: "ONDC:RET10", flowMap: { f1: "PASS" } });
        await seedSession({ domain: "ONDC:FIS10", flowMap: { f1: "PASS" } });

        const res = await get("/api/sessions/?result=PASS&domain=ONDC:RET10");

        expect(res.body.total).toBe(1);
    });
});

describe("pagination", () => {
    const seedMany = async (n: number) => {
        for (let i = 0; i < n; i++) {
            await seedSession({ sessionId: `s-${String(i).padStart(3, "0")}` });
        }
    };

    it("honours page and limit", async () => {
        await seedMany(25);

        const res = await get("/api/sessions/?page=2&limit=10");

        expect(res.body).toMatchObject({
            total: 25,
            page: 2,
            limit: 10,
            totalPages: 3,
        });
        expect(res.body.data).toHaveLength(10);
    });

    it("returns a short final page", async () => {
        await seedMany(25);

        const res = await get("/api/sessions/?page=3&limit=10");

        expect(res.body.data).toHaveLength(5);
    });

    it("returns an empty page past the end without erroring", async () => {
        await seedMany(5);

        const res = await get("/api/sessions/?page=99&limit=10");

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
        expect(res.body.total).toBe(5);
    });

    it("does not repeat or skip rows across pages", async () => {
        await seedMany(30);

        const seen: string[] = [];
        for (const page of [1, 2, 3]) {
            const res = await get(`/api/sessions/?page=${page}&limit=10`);
            seen.push(
                ...res.body.data.map((r: { sessionId: string }) => r.sessionId),
            );
        }

        expect(seen).toHaveLength(30);
        expect(new Set(seen).size).toBe(30);
    });

    it("counts the filtered set, not the whole collection", async () => {
        await seedMany(10);
        await seedSession({ domain: "ONDC:RET10" });

        const res = await get("/api/sessions/?domain=ONDC:RET10&limit=5");

        expect(res.body.total).toBe(1);
        expect(res.body.totalPages).toBe(1);
    });
});

describe("sorting", () => {
    it("defaults to newest first", async () => {
        await seedSession({
            sessionId: "old",
            createdAt: new Date("2026-01-01"),
        });
        await seedSession({
            sessionId: "new",
            createdAt: new Date("2026-06-01"),
        });

        const res = await get("/api/sessions/?page=1");

        expect(res.body.data[0].sessionId).toBe("new");
    });

    it("sorts ascending when asked", async () => {
        await seedSession({
            sessionId: "old",
            createdAt: new Date("2026-01-01"),
        });
        await seedSession({
            sessionId: "new",
            createdAt: new Date("2026-06-01"),
        });

        const res = await get("/api/sessions/?sort=createdAt&order=asc");

        expect(res.body.data[0].sessionId).toBe("old");
    });

    it("sorts by a derived field", async () => {
        await seedSession({ sessionId: "low", flowMap: { f1: "FAIL" } });
        await seedSession({ sessionId: "high", flowMap: { f1: "PASS" } });

        const res = await get("/api/sessions/?sort=passRate&order=desc");

        expect(res.body.data[0].sessionId).toBe("high");
    });

    it("sorts by sessionId", async () => {
        await seedSession({ sessionId: "bbb" });
        await seedSession({ sessionId: "aaa" });

        const res = await get("/api/sessions/?sort=sessionId&order=asc");

        expect(res.body.data[0].sessionId).toBe("aaa");
    });
});

describe("validation", () => {
    it("400s with every problem at once", async () => {
        const res = await get(
            "/api/sessions/?from=not-a-date&limit=99999&order=sideways",
        );

        expect(res.status).toBe(400);
        expect(res.body.error).toBe(true);
        expect(res.body.messages).toHaveLength(3);
    });

    it.each([
        ["from=nonsense", "from must be a valid ISO 8601 date"],
        ["order=up", 'order must be "asc" or "desc"'],
        ["reportExists=maybe", 'reportExists must be "true" or "false"'],
    ] as const)("rejects %s", async (qs, message) => {
        const res = await get(`/api/sessions/?${qs}`);

        expect(res.status).toBe(400);
        expect(res.body.messages).toContain(message);
    });

    it("rejects an unknown sort field rather than silently ignoring it", async () => {
        const res = await get("/api/sessions/?sort=; drop database");

        expect(res.status).toBe(400);
        expect(res.body.messages[0]).toMatch(/^sort must be one of/);
    });

    it("rejects an unknown result value", async () => {
        const res = await get("/api/sessions/?result=MAYBE");

        expect(res.status).toBe(400);
    });

    it("rejects from later than to", async () => {
        const res = await get("/api/sessions/?from=2026-12-01&to=2026-01-01");

        expect(res.status).toBe(400);
        expect(res.body.messages).toContain("from must be earlier than to");
    });

    it("caps limit to protect the server", async () => {
        const res = await get("/api/sessions/?limit=100000");

        expect(res.status).toBe(400);
        expect(res.body.messages[0]).toMatch(/limit must be an integer/);
    });

    it("rejects a non-integer page", async () => {
        const res = await get("/api/sessions/?page=1.5");

        expect(res.status).toBe(400);
    });
});
