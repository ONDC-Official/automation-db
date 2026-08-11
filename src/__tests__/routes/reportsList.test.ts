import { describe, expect, it } from "vitest";
import { useApi } from "../helpers/api";
import { seedReport, seedSession } from "../factories";

/**
 * GET /report/ — opt-in filtered/paginated mode with the session join.
 *
 * The legacy bare-array contract is covered in report.test.ts and must keep
 * passing.
 */

const { get } = useApi();

describe("mode switching", () => {
    it("keeps returning the bare array for unrecognised params", async () => {
        await seedReport();
        await seedReport();

        const res = await get("/report/?foo=bar");

        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(2);
    });

    it("returns the envelope once a recognised param appears", async () => {
        await seedReport();

        const res = await get("/report/?page=1");

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(false);
        expect(res.body).toMatchObject({
            total: 1,
            page: 1,
            limit: 50,
            totalPages: 1,
        });
    });
});

describe("session join", () => {
    // The convention is test_id = "PW_" + sessionId (SessionDetailsController).
    it("attaches session context to each report", async () => {
        await seedSession({
            sessionId: "s-joined",
            domain: "ONDC:TRV11",
            version: "2.0.0",
            npType: "BPP",
        });
        await seedReport({ test_id: "PW_s-joined" });

        const res = await get("/report/?page=1");
        const [row] = res.body.data;

        expect(row.sessionId).toBe("s-joined");
        expect(row.session).toMatchObject({
            sessionId: "s-joined",
            domain: "ONDC:TRV11",
            version: "2.0.0",
            npType: "BPP",
        });
    });

    it("reports a null session when no matching session exists", async () => {
        await seedReport({ test_id: "PW_orphan" });

        const res = await get("/report/?page=1");

        expect(res.body.data[0].sessionId).toBe("PW_orphan".slice(3));
        expect(res.body.data[0].session).toBeNull();
    });

    it("reports a null sessionId when test_id lacks the PW_ prefix", async () => {
        await seedReport({ test_id: "legacy-id" });

        const res = await get("/report/?page=1");

        expect(res.body.data[0].sessionId).toBeNull();
        expect(res.body.data[0].session).toBeNull();
    });

    it("never exposes the GridFS file_id", async () => {
        await seedReport();

        const res = await get("/report/?page=1");

        expect(res.body.data[0]).not.toHaveProperty("file_id");
    });

    it("keeps the report's own metrics alongside the join", async () => {
        await seedReport({
            test_id: "PW_metrics",
            total_tests: 12,
            passed_tests: 9,
        });

        const res = await get("/report/?page=1");

        expect(res.body.data[0]).toMatchObject({
            test_id: "PW_metrics",
            total_tests: 12,
            passed_tests: 9,
        });
        expect(res.body.data[0].flow_summary).toBeDefined();
    });
});

describe("filters", () => {
    it("filters by userId", async () => {
        await seedReport({ user_id: "gh-1" });
        await seedReport({ user_id: "gh-2" });

        const res = await get("/report/?userId=gh-1");

        expect(res.body.total).toBe(1);
    });

    // The legacy /report/user/:userId 404s on an empty list; the paginated form
    // returns an empty envelope, which is what the dashboard wants.
    it("returns an empty envelope rather than 404 when a user has no reports", async () => {
        const res = await get("/report/?userId=nobody");

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ data: [], total: 0, totalPages: 0 });
    });

    it("searches test_id case-insensitively", async () => {
        await seedReport({ test_id: "PW_ABC" });
        await seedReport({ test_id: "PW_XYZ" });

        const res = await get("/report/?q=abc");

        expect(res.body.total).toBe(1);
    });

    it("escapes regex metacharacters in the search term", async () => {
        await seedReport({ test_id: "PW_plain" });

        const res = await get("/report/?q=.*");

        expect(res.body.total).toBe(0);
    });

    it("filters by created date range", async () => {
        await seedReport({ createdAt: new Date("2025-01-01") });
        await seedReport({ createdAt: new Date("2026-06-01") });

        const res = await get("/report/?from=2026-01-01");

        expect(res.body.total).toBe(1);
    });
});

describe("pagination and sorting", () => {
    const seedMany = async (n: number) => {
        for (let i = 0; i < n; i++) {
            await seedReport({ test_id: `PW_${String(i).padStart(3, "0")}` });
        }
    };

    it("honours page and limit", async () => {
        await seedMany(25);

        const res = await get("/report/?page=2&limit=10");

        expect(res.body).toMatchObject({ total: 25, page: 2, totalPages: 3 });
        expect(res.body.data).toHaveLength(10);
    });

    it("does not repeat or skip rows across pages", async () => {
        await seedMany(30);

        const seen: string[] = [];
        for (const page of [1, 2, 3]) {
            const res = await get(`/report/?page=${page}&limit=10`);
            seen.push(
                ...res.body.data.map((r: { test_id: string }) => r.test_id),
            );
        }

        expect(new Set(seen).size).toBe(30);
    });

    it("sorts by passed_tests", async () => {
        await seedReport({ test_id: "PW_low", passed_tests: 1 });
        await seedReport({ test_id: "PW_high", passed_tests: 99 });

        const res = await get("/report/?sort=passed_tests&order=desc");

        expect(res.body.data[0].test_id).toBe("PW_high");
    });

    it("defaults to newest first", async () => {
        await seedReport({
            test_id: "PW_old",
            createdAt: new Date("2026-01-01"),
        });
        await seedReport({
            test_id: "PW_new",
            createdAt: new Date("2026-06-01"),
        });

        const res = await get("/report/?page=1");

        expect(res.body.data[0].test_id).toBe("PW_new");
    });
});

describe("validation", () => {
    it("400s on an invalid date", async () => {
        const res = await get("/report/?from=nonsense");

        expect(res.status).toBe(400);
        expect(res.body.messages).toContain(
            "from must be a valid ISO 8601 date",
        );
    });

    it("400s on an unknown sort field", async () => {
        const res = await get("/report/?sort=file_id");

        expect(res.status).toBe(400);
    });

    it("caps limit", async () => {
        const res = await get("/report/?limit=100000");

        expect(res.status).toBe(400);
    });
});

describe("route ordering", () => {
    // /report/:testId must not swallow the paginated list.
    it("does not treat a query on /report/ as a testId lookup", async () => {
        await seedReport();

        const res = await get("/report/?page=1");

        expect(res.body.data).toBeDefined();
        expect(res.body.test_id).toBeUndefined();
    });
});
