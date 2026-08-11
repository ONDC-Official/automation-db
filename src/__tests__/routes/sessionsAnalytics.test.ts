import { describe, expect, it } from "vitest";
import { useApi } from "../helpers/api";
import { seedSession } from "../factories";

/**
 * GET /api/sessions/stats, /facets and /export.
 *
 * All three share the filter parser with the list endpoint, so the numbers on a
 * chart, the options in a dropdown and the rows in a download always describe
 * the same set.
 */

const { get } = useApi();

const at = (iso: string) => new Date(iso);

describe("GET /api/sessions/stats", () => {
    it("totals sessions, reports and flow outcomes", async () => {
        await seedSession({
            reportExists: true,
            flows: [
                { id: "f1", status: "COMPLETED" },
                { id: "f2", status: "COMPLETED" },
            ],
            flowMap: { f1: "PASS", f2: "FAIL" },
        });
        await seedSession({
            reportExists: false,
            flows: [{ id: "f1", status: "PENDING" }],
            flowMap: { f1: "PASS" },
        });

        const res = await get("/api/sessions/stats");

        expect(res.status).toBe(200);
        expect(res.body.totals).toEqual({
            sessions: 2,
            withReports: 1,
            flowsTotal: 3,
            flowsCompleted: 2,
            flowsPassed: 2,
            flowsFailed: 1,
            passRate: 2 / 3,
        });
    });

    it("reports zeroes and a null passRate for an empty set", async () => {
        const res = await get("/api/sessions/stats");

        expect(res.status).toBe(200);
        expect(res.body.totals).toMatchObject({
            sessions: 0,
            flowsPassed: 0,
            flowsFailed: 0,
            passRate: null,
        });
        expect(res.body.byDay).toEqual([]);
        expect(res.body.byDomain).toEqual([]);
    });

    it("buckets sessions by day in ascending date order", async () => {
        await seedSession({ createdAt: at("2026-03-01T09:00:00Z") });
        await seedSession({ createdAt: at("2026-03-01T21:00:00Z") });
        await seedSession({ createdAt: at("2026-03-03T10:00:00Z") });

        const res = await get("/api/sessions/stats");

        expect(res.body.byDay).toEqual([
            { date: "2026-03-01", sessions: 2, passed: 0, failed: 0 },
            { date: "2026-03-03", sessions: 1, passed: 0, failed: 0 },
        ]);
    });

    it("counts passes and failures per day", async () => {
        await seedSession({
            createdAt: at("2026-03-01T09:00:00Z"),
            flowMap: { f1: "PASS", f2: "FAIL" },
        });

        const res = await get("/api/sessions/stats");

        expect(res.body.byDay[0]).toMatchObject({ passed: 1, failed: 1 });
    });

    it("breaks down by domain with a per-domain passRate", async () => {
        await seedSession({
            domain: "ONDC:FIS10",
            flowMap: { f1: "PASS", f2: "PASS" },
        });
        await seedSession({
            domain: "ONDC:RET10",
            flowMap: { f1: "PASS", f2: "FAIL" },
        });

        const res = await get("/api/sessions/stats");
        const byDomain = Object.fromEntries(
            res.body.byDomain.map((d: { domain: string }) => [d.domain, d]),
        );

        expect(byDomain["ONDC:FIS10"]).toMatchObject({
            sessions: 1,
            passRate: 1,
        });
        expect(byDomain["ONDC:RET10"]).toMatchObject({
            sessions: 1,
            passRate: 0.5,
        });
    });

    it("breaks down by npType and version", async () => {
        await seedSession({ npType: "BAP", version: "2.1.0" });
        await seedSession({ npType: "BPP", version: "2.1.0" });

        const res = await get("/api/sessions/stats");

        expect(res.body.byNpType).toHaveLength(2);
        expect(res.body.byVersion).toEqual([
            expect.objectContaining({ version: "2.1.0", sessions: 2 }),
        ]);
    });

    it("orders breakdowns by session count descending", async () => {
        await seedSession({ domain: "ONDC:RET10" });
        await seedSession({ domain: "ONDC:FIS10" });
        await seedSession({ domain: "ONDC:FIS10" });

        const res = await get("/api/sessions/stats");

        expect(res.body.byDomain[0]).toMatchObject({
            domain: "ONDC:FIS10",
            sessions: 2,
        });
    });

    it("reports a null passRate for a bucket with nothing judged", async () => {
        await seedSession({ domain: "ONDC:FIS10", flowMap: null });

        const res = await get("/api/sessions/stats");

        expect(res.body.byDomain[0].passRate).toBeNull();
    });

    it("respects the same filters as the list endpoint", async () => {
        await seedSession({ domain: "ONDC:FIS10" });
        await seedSession({ domain: "ONDC:RET10" });

        const res = await get("/api/sessions/stats?domain=ONDC:FIS10");

        expect(res.body.totals.sessions).toBe(1);
        expect(res.body.byDomain).toHaveLength(1);
    });

    it("respects the date range filter", async () => {
        await seedSession({ createdAt: at("2025-01-01T00:00:00Z") });
        await seedSession({ createdAt: at("2026-06-01T00:00:00Z") });

        const res = await get("/api/sessions/stats?from=2026-01-01");

        expect(res.body.totals.sessions).toBe(1);
    });

    it("respects the derived result filter", async () => {
        await seedSession({ flowMap: { f1: "PASS" } });
        await seedSession({ flowMap: { f1: "FAIL" } });

        const res = await get("/api/sessions/stats?result=FAIL");

        expect(res.body.totals.sessions).toBe(1);
        expect(res.body.totals.passRate).toBe(0);
    });

    it("400s on an invalid filter", async () => {
        const res = await get("/api/sessions/stats?from=nonsense");

        expect(res.status).toBe(400);
        expect(res.body.error).toBe(true);
    });

    // stats totals must agree with what the list endpoint reports.
    it("agrees with the list endpoint's total", async () => {
        for (let i = 0; i < 7; i++) {
            await seedSession({ domain: "ONDC:FIS10" });
        }
        await seedSession({ domain: "ONDC:RET10" });

        const stats = await get("/api/sessions/stats?domain=ONDC:FIS10");
        const list = await get("/api/sessions/?domain=ONDC:FIS10&limit=1");

        expect(stats.body.totals.sessions).toBe(list.body.total);
    });
});

describe("GET /api/sessions/facets", () => {
    it("returns sorted distinct values for each dropdown", async () => {
        await seedSession({ domain: "ONDC:RET10", version: "1.0.0" });
        await seedSession({ domain: "ONDC:FIS10", version: "2.1.0" });
        await seedSession({ domain: "ONDC:FIS10", version: "2.1.0" });

        const res = await get("/api/sessions/facets");

        expect(res.status).toBe(200);
        expect(res.body.domains).toEqual(["ONDC:FIS10", "ONDC:RET10"]);
        expect(res.body.versions).toEqual(["1.0.0", "2.1.0"]);
    });

    it("returns every facet key even when empty", async () => {
        const res = await get("/api/sessions/facets");

        expect(res.body).toEqual({
            domains: [],
            versions: [],
            npTypes: [],
            sessionTypes: [],
            usecaseIds: [],
        });
    });

    it("excludes null and empty values", async () => {
        await seedSession({ domain: null, usecaseId: "" });
        await seedSession({ domain: "ONDC:FIS10", usecaseId: "uc-1" });

        const res = await get("/api/sessions/facets");

        expect(res.body.domains).toEqual(["ONDC:FIS10"]);
        expect(res.body.usecaseIds).toEqual(["uc-1"]);
    });

    it("narrows other dimensions to the current filter", async () => {
        await seedSession({ domain: "ONDC:FIS10", version: "2.1.0" });
        await seedSession({ domain: "ONDC:RET10", version: "1.0.0" });

        const res = await get("/api/sessions/facets?domain=ONDC:FIS10");

        expect(res.body.versions).toEqual(["2.1.0"]);
    });

    // Standard faceted search: a dimension must not filter itself, or the
    // dropdown collapses to the value already chosen and the user cannot switch
    // without clearing the filter first.
    it("does NOT apply a dimension's own filter to its own options", async () => {
        await seedSession({ domain: "ONDC:FIS10" });
        await seedSession({ domain: "ONDC:RET10" });
        await seedSession({ domain: "ONDC:TRV11" });

        const res = await get("/api/sessions/facets?domain=ONDC:FIS10");

        expect(res.body.domains).toEqual([
            "ONDC:FIS10",
            "ONDC:RET10",
            "ONDC:TRV11",
        ]);
    });

    it("keeps every dimension switchable when several filters are active", async () => {
        await seedSession({ domain: "ONDC:FIS10", npType: "BAP" });
        await seedSession({ domain: "ONDC:FIS10", npType: "BPP" });
        await seedSession({ domain: "ONDC:RET10", npType: "BAP" });

        const res = await get(
            "/api/sessions/facets?domain=ONDC:FIS10&npType=BAP",
        );

        // domain ignores its own filter but still respects npType=BAP.
        expect(res.body.domains).toEqual(["ONDC:FIS10", "ONDC:RET10"]);
        // npType ignores its own filter but still respects domain=ONDC:FIS10.
        expect(res.body.npTypes).toEqual(["BAP", "BPP"]);
    });

    // Non-dimension filters have no "own dimension" to exclude, so they
    // constrain every facet.
    it("applies non-dimension filters to every facet", async () => {
        await seedSession({
            domain: "ONDC:FIS10",
            createdAt: new Date("2026-06-01"),
        });
        await seedSession({
            domain: "ONDC:RET10",
            createdAt: new Date("2025-01-01"),
        });

        const res = await get("/api/sessions/facets?from=2026-01-01");

        expect(res.body.domains).toEqual(["ONDC:FIS10"]);
    });

    it("applies the derived result filter to every facet", async () => {
        await seedSession({ domain: "ONDC:FIS10", flowMap: { f1: "PASS" } });
        await seedSession({ domain: "ONDC:RET10", flowMap: { f1: "FAIL" } });

        const res = await get("/api/sessions/facets?result=PASS");

        expect(res.body.domains).toEqual(["ONDC:FIS10"]);
    });

    it("400s on an invalid filter", async () => {
        const res = await get("/api/sessions/facets?order=sideways");

        expect(res.status).toBe(400);
    });
});

describe("GET /api/sessions/export", () => {
    const parseCsv = (text: string): string[][] =>
        text
            .split("\r\n")
            .filter((line) => line !== "")
            .map((line) => line.split(","));

    it("sends a CSV attachment with a dated filename", async () => {
        await seedSession();

        const res = await get("/api/sessions/export");

        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/text\/csv/);
        expect(res.headers["content-disposition"]).toMatch(
            /^attachment; filename="sessions-\d{4}-\d{2}-\d{2}\.csv"$/,
        );
    });

    it("writes a header row followed by one row per session", async () => {
        await seedSession({ sessionId: "exp-1" });
        await seedSession({ sessionId: "exp-2" });

        const res = await get("/api/sessions/export");
        const rows = parseCsv(res.text);

        expect(rows[0]).toContain("sessionId");
        expect(rows).toHaveLength(3);
    });

    it("honours an explicit column list and its order", async () => {
        await seedSession({ sessionId: "cols", domain: "ONDC:FIS10" });

        const res = await get(
            "/api/sessions/export?columns=domain,sessionId",
        );
        const rows = parseCsv(res.text);

        expect(rows[0]).toEqual(["domain", "sessionId"]);
        expect(rows[1]).toEqual(["ONDC:FIS10", "cols"]);
    });

    it("includes the server-derived columns", async () => {
        await seedSession({
            sessionId: "derived",
            flows: [{ id: "f1", status: "COMPLETED" }],
            flowMap: { f1: "PASS" },
        });

        const res = await get(
            "/api/sessions/export?columns=flowsPassed,flowsFailed,passRate,result",
        );
        const rows = parseCsv(res.text);

        expect(rows[1]).toEqual(["1", "0", "1", "PASS"]);
    });

    it("quotes values containing commas and doubles embedded quotes", async () => {
        await seedSession({ sessionId: 'a,b"c' });

        const res = await get("/api/sessions/export?columns=sessionId");

        expect(res.text).toContain('"a,b""c"');
    });

    // Spreadsheet software executes a leading =, +, - or @. The data comes from
    // external network participants, so it is not trustworthy.
    it("neutralises formula injection in exported values", async () => {
        await seedSession({ sessionId: "=cmd|' /c calc'!A0" });

        const res = await get("/api/sessions/export?columns=sessionId");

        expect(res.text).toMatch(/'=cmd/);
    });

    it("leaves an empty cell for a missing value", async () => {
        await seedSession({ sessionId: "nulls", usecaseId: null });

        const res = await get(
            "/api/sessions/export?columns=sessionId,usecaseId",
        );
        const rows = parseCsv(res.text);

        expect(rows[1]).toEqual(["nulls", ""]);
    });

    it("exports only the filtered rows", async () => {
        await seedSession({ domain: "ONDC:FIS10" });
        await seedSession({ domain: "ONDC:RET10" });

        const res = await get(
            "/api/sessions/export?domain=ONDC:FIS10&columns=domain",
        );
        const rows = parseCsv(res.text);

        expect(rows).toHaveLength(2);
        expect(rows[1]).toEqual(["ONDC:FIS10"]);
    });

    // "Download what I'm looking at" only holds if the two agree exactly.
    it("row count matches the list endpoint's total for the same filter", async () => {
        for (let i = 0; i < 12; i++) {
            await seedSession({ domain: "ONDC:FIS10" });
        }
        await seedSession({ domain: "ONDC:RET10" });

        const list = await get("/api/sessions/?domain=ONDC:FIS10&limit=5");
        const csv = await get(
            "/api/sessions/export?domain=ONDC:FIS10&columns=sessionId",
        );

        expect(parseCsv(csv.text)).toHaveLength(list.body.total + 1);
    });

    // The export is not capped by the list's page limit.
    it("exports past the pagination limit", async () => {
        for (let i = 0; i < 30; i++) await seedSession();

        const res = await get(
            "/api/sessions/export?limit=5&columns=sessionId",
        );

        expect(parseCsv(res.text)).toHaveLength(31);
    });

    it("honours the sort order", async () => {
        await seedSession({ sessionId: "bbb" });
        await seedSession({ sessionId: "aaa" });

        const res = await get(
            "/api/sessions/export?sort=sessionId&order=asc&columns=sessionId",
        );
        const rows = parseCsv(res.text);

        expect(rows[1]).toEqual(["aaa"]);
    });

    it("emits just a header row when nothing matches", async () => {
        const res = await get("/api/sessions/export?domain=ONDC:NOPE");

        expect(res.status).toBe(200);
        expect(parseCsv(res.text)).toHaveLength(1);
    });

    it("400s on an unknown column rather than silently dropping it", async () => {
        const res = await get("/api/sessions/export?columns=sessionId,secrets");

        expect(res.status).toBe(400);
        expect(res.body.messages).toContain('unknown column "secrets"');
    });

    it("400s on an invalid filter", async () => {
        const res = await get("/api/sessions/export?from=nonsense");

        expect(res.status).toBe(400);
    });
});

describe("route ordering for the new endpoints", () => {
    // These literals sit above /:sessionId in SessionRoutes.ts. If anyone moves
    // them below it, the wildcard swallows them and these turn red.
    it.each(["stats", "facets", "export"])(
        "does not let /:sessionId swallow /%s",
        async (segment) => {
            await seedSession({ sessionId: segment });

            const res = await get(`/api/sessions/${segment}`);

            expect(res.status).toBe(200);
            // A session document would have a sessionId; these responses do not.
            expect(res.body.sessionId).toBeUndefined();
        },
    );
});
