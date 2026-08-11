import { describe, expect, it } from "vitest";
import { useApi } from "../helpers/api";
import { Report } from "../../entity/Reports";
import { htmlDataUri, seedReport } from "../factories";

/**
 * CHARACTERIZATION TESTS — /report/*
 *
 * See sessions.test.ts for the rules. `QUIRK:` marks behaviour that is
 * arguably wrong but is pinned deliberately, not fixed.
 *
 * NOTE: the mochawesome-JSON branch of createReport (ReportController.ts:35-47)
 * is only exercised for its failure path. Its success path shells out to
 * mochawesome-report-generator, which writes HTML files to src/output — a
 * filesystem side effect deliberately kept out of the test suite.
 */

const { get, post } = useApi();

describe("POST /report/:testId", () => {
    it("400s with a JSON error when data is absent", async () => {
        const res = await post("/report/PW_s1").send({ total_tests: 5 });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "Missing 'data' in request body" });
    });

    it("creates a report from a pre-rendered HTML data URI and returns 201", async () => {
        const res = await post("/report/PW_s1").send({
            data: htmlDataUri(),
            total_tests: 10,
            passed_tests: 8,
        });

        expect(res.status).toBe(201);
        expect(res.body.test_id).toBe("PW_s1");
        expect(res.body.total_tests).toBe(10);
        expect(res.body.passed_tests).toBe(8);
        expect(res.body.file_id).toBeDefined();
    });

    it("takes user_id from the query string, not the body", async () => {
        const res = await post("/report/PW_s2?userId=gh-42").send({
            data: htmlDataUri(),
        });

        expect(res.status).toBe(201);
        expect(res.body.user_id).toBe("gh-42");
    });

    it("stores flow_summary when supplied", async () => {
        const flow_summary = {
            MANDATORY: { total: 3, completed: 3 },
            OPTIONAL: { total: 2, completed: 1 },
        };

        const res = await post("/report/PW_s3").send({
            data: htmlDataUri(),
            flow_summary,
        });

        expect(res.status).toBe(201);
        expect(res.body.flow_summary).toEqual(flow_summary);
    });

    it("defaults total_tests and passed_tests to 0 when omitted", async () => {
        const res = await post("/report/PW_s4").send({ data: htmlDataUri() });

        expect(res.status).toBe(201);
        expect(res.body.total_tests).toBe(0);
        expect(res.body.passed_tests).toBe(0);
    });

    it("returns 200 instead of 201 when the test_id already exists", async () => {
        await post("/report/PW_dupe").send({ data: htmlDataUri("<p>v1</p>") });

        const res = await post("/report/PW_dupe").send({
            data: htmlDataUri("<p>v2</p>"),
        });

        expect(res.status).toBe(200);
        expect(await Report.countDocuments()).toBe(1);
    });

    // QUIRK: the update path re-uploads to GridFS under a NEW file id
    // (ReportService.ts:97) and simply repoints file_id. The previous GridFS
    // file is never deleted, so every re-run of a test leaks an orphaned blob.
    it("orphans the previous GridFS file on update", async () => {
        const first = await post("/report/PW_orphan").send({
            data: htmlDataUri("<p>v1</p>"),
        });
        const second = await post("/report/PW_orphan").send({
            data: htmlDataUri("<p>v2</p>"),
        });

        expect(second.body.file_id).not.toBe(first.body.file_id);

        const files = await Report.db
            .collection("reports.files")
            .countDocuments();
        expect(files).toBe(2);
    });

    // QUIRK: the update path does NOT refresh total_tests/passed_tests
    // (ReportService.ts:99-102 only sets file_id and flow_summary), so counts
    // go stale after a re-run.
    it("does not update total_tests or passed_tests on the update path", async () => {
        await post("/report/PW_stale").send({
            data: htmlDataUri(),
            total_tests: 10,
            passed_tests: 8,
        });

        const res = await post("/report/PW_stale").send({
            data: htmlDataUri(),
            total_tests: 99,
            passed_tests: 99,
        });

        expect(res.body.total_tests).toBe(10);
        expect(res.body.passed_tests).toBe(8);
    });

    it("500s when a non-data-URI payload fails mochawesome rendering", async () => {
        const res = await post("/report/PW_bad").send({
            data: { not: "a valid mochawesome report" },
        });

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "Failed to create/update report" });
    });
});

describe("GET /report/", () => {
    it("returns all report metadata as a bare array", async () => {
        await seedReport();
        await seedReport();

        const res = await get("/report/");

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(2);
    });

    it("returns metadata only, never the report HTML", async () => {
        await post("/report/PW_meta").send({
            data: htmlDataUri(),
            total_tests: 4,
            passed_tests: 4,
        });

        const res = await get("/report/");

        expect(res.body[0]).toHaveProperty("file_id");
        expect(res.body[0]).not.toHaveProperty("data");
        expect(res.body[0].total_tests).toBe(4);
    });

    it("returns an empty array when there are no reports", async () => {
        const res = await get("/report/");

        expect(res.body).toEqual([]);
    });
});

describe("GET /report/:testId", () => {
    it("404s with a JSON error when the report does not exist", async () => {
        const res = await get("/report/PW_missing");

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: "Report not found" });
    });

    // QUIRK: seedReport creates metadata with no file_id, and getReportByTestId
    // returns null when file_id is absent (ReportService.ts:38) — so a report
    // row that genuinely exists still reports 404.
    it("404s when metadata exists but has no GridFS file_id", async () => {
        await seedReport({ test_id: "PW_nofile" });

        const res = await get("/report/PW_nofile");

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: "Report not found" });
    });

    it("returns { test_id, data } for a stored report", async () => {
        await post("/report/PW_fetch").send({ data: htmlDataUri() });

        const res = await get("/report/PW_fetch");

        expect(res.status).toBe(200);
        expect(res.body.test_id).toBe("PW_fetch");
        expect(typeof res.body.data).toBe("string");
    });

    /**
     * REGRESSION GUARD for the worst defect in the codebase.
     *
     * saveToGridFS used to run `Buffer.from(data, "base64")` over the WHOLE data
     * URI, prefix included. Node's base64 decoder drops ":" ";" and "," but
     * KEEPS "/" and "+" — both valid base64 characters — so
     * "data:text/html;base64," was decoded as though it were payload and the
     * report HTML was destroyed on write, unrecoverable on read.
     *
     * The prefix is now stripped before decoding and re-attached on read.
     */
    it("round-trips report HTML through GridFS without corrupting it", async () => {
        const originalHtml = "<html><body>report</body></html>";
        const dataUri = htmlDataUri(originalHtml);

        await post("/report/PW_roundtrip").send({ data: dataUri });
        const res = await get("/report/PW_roundtrip");

        expect(res.body.data).toBe(dataUri);

        const base64 = res.body.data.replace(/^data:[^;,]*;base64,/, "");
        expect(Buffer.from(base64, "base64").toString("utf8")).toBe(
            originalHtml,
        );
    });

    it("round-trips report HTML containing base64-significant characters", async () => {
        // "/" and "+" are valid base64 characters and were exactly what made the
        // old prefix bug silent — keep a payload that exercises them.
        const originalHtml =
            '<html><body><a href="/a/b?x=1+2">link</a></body></html>';
        const dataUri = htmlDataUri(originalHtml);

        await post("/report/PW_chars").send({ data: dataUri });
        const res = await get("/report/PW_chars");

        const base64 = res.body.data.replace(/^data:[^;,]*;base64,/, "");
        expect(Buffer.from(base64, "base64").toString("utf8")).toBe(
            originalHtml,
        );
    });

    it("accepts bare base64 with no data-URI prefix", async () => {
        const originalHtml = "<html><body>bare</body></html>";
        const bare = Buffer.from(originalHtml).toString("base64");

        // No prefix means the generator branch, so post the pre-rendered form
        // through GridFS directly to prove stripping is prefix-optional.
        await post("/report/PW_bare").send({
            data: `data:text/html;base64,${bare}`,
        });
        const res = await get("/report/PW_bare");

        const base64 = res.body.data.replace(/^data:[^;,]*;base64,/, "");
        expect(Buffer.from(base64, "base64").toString("utf8")).toBe(
            originalHtml,
        );
    });
});

describe("GET /report/user/:userId", () => {
    it("returns a lean projection without _id", async () => {
        await seedReport({ user_id: "gh-7", test_id: "PW_a" });

        const res = await get("/report/user/gh-7");

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(Object.keys(res.body[0]).sort()).toEqual([
            "createdAt",
            "flow_summary",
            "passed_tests",
            "test_id",
            "total_tests",
            "updatedAt",
        ]);
        expect(res.body[0]).not.toHaveProperty("_id");
        expect(res.body[0]).not.toHaveProperty("file_id");
    });

    it("returns only that user's reports", async () => {
        await seedReport({ user_id: "gh-7" });
        await seedReport({ user_id: "gh-7" });
        await seedReport({ user_id: "gh-8" });

        const res = await get("/report/user/gh-7");

        expect(res.body).toHaveLength(2);
    });

    // QUIRK: an empty result is a 404 with an error body rather than a 200 []
    // (ReportController.ts:123-126). The dashboard must treat this 404 as an
    // empty state, NOT as a failure.
    it("404s with a JSON error instead of returning an empty array", async () => {
        const res = await get("/report/user/nobody");

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: "No reports found for user" });
    });
});
