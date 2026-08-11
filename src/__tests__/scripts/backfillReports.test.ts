import { beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { useApi } from "../helpers/api";
import { Report } from "../../entity/Reports";
import { runBackfill } from "../../scripts/backfill-reports";
import { htmlDataUri } from "../factories";

/**
 * End-to-end cover for the data migration, against a real GridFS bucket.
 *
 * A migration that has only been reasoned about is a migration that has not
 * been tested, so these seed genuinely-corrupted blobs the way the old code
 * wrote them and assert the repaired reports read back correctly through the
 * live API.
 */

const { get, post } = useApi();

let bucket: mongoose.mongo.GridFSBucket;

beforeEach(() => {
    bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
        bucketName: "reports",
    });
});

/** Writes a blob exactly as the pre-fix saveToGridFS did. */
async function seedCorruptReport(
    testId: string,
    html: string,
): Promise<mongoose.Types.ObjectId> {
    const dataUri = `data:text/html;base64,${Buffer.from(html).toString("base64")}`;
    const upload = bucket.openUploadStream(testId);

    const fileId = await new Promise<mongoose.Types.ObjectId>(
        (resolve, reject) => {
            upload.on("finish", () =>
                resolve(upload.id as mongoose.Types.ObjectId),
            );
            upload.on("error", reject);
            // THE BUG: the whole data URI decoded as base64.
            upload.end(Buffer.from(dataUri, "base64"));
        },
    );

    await Report.create({ test_id: testId, file_id: fileId, total_tests: 1 });
    return fileId;
}

/** Writes a blob the way the fixed code does. */
async function seedHealthyReport(testId: string, html: string): Promise<void> {
    const upload = bucket.openUploadStream(testId);
    const fileId = await new Promise<mongoose.Types.ObjectId>(
        (resolve, reject) => {
            upload.on("finish", () =>
                resolve(upload.id as mongoose.Types.ObjectId),
            );
            upload.on("error", reject);
            upload.end(Buffer.from(html, "utf8"));
        },
    );
    await Report.create({ test_id: testId, file_id: fileId });
}

const REPORT_HTML =
    "<!DOCTYPE html><html><body><h1>Test Report</h1><a href='/x?a=1+2'>l</a></body></html>";

describe("runBackfill", () => {
    it("dry run reports what it would repair and writes nothing", async () => {
        const originalFileId = await seedCorruptReport("PW_dry", REPORT_HTML);

        const tally = await runBackfill({ bucket, apply: false });

        expect(tally.recovered).toBe(1);
        expect(tally.alreadyValid).toBe(0);

        // file_id untouched.
        const doc = await Report.findOne({ test_id: "PW_dry" });
        expect(doc?.file_id?.toString()).toBe(originalFileId.toString());
    });

    it("apply repairs the blob and repoints file_id", async () => {
        const originalFileId = await seedCorruptReport("PW_fix", REPORT_HTML);

        const tally = await runBackfill({ bucket, apply: true });

        expect(tally.recovered).toBe(1);

        const doc = await Report.findOne({ test_id: "PW_fix" });
        expect(doc?.file_id?.toString()).not.toBe(originalFileId.toString());
    });

    it("makes the repaired report readable through the API", async () => {
        await seedCorruptReport("PW_read", REPORT_HTML);

        // Corrupt beforehand.
        const before = await get("/report/PW_read");
        const beforeB64 = before.body.data.replace(/^data:[^;,]*;base64,/, "");
        expect(Buffer.from(beforeB64, "base64").toString("utf8")).not.toBe(
            REPORT_HTML,
        );

        await runBackfill({ bucket, apply: true });

        // Readable afterwards.
        const after = await get("/report/PW_read");
        const afterB64 = after.body.data.replace(/^data:[^;,]*;base64,/, "");
        expect(Buffer.from(afterB64, "base64").toString("utf8")).toBe(
            REPORT_HTML,
        );
    });

    it("leaves already-valid reports alone", async () => {
        await seedHealthyReport("PW_ok", REPORT_HTML);

        const tally = await runBackfill({ bucket, apply: true });

        expect(tally.alreadyValid).toBe(1);
        expect(tally.recovered).toBe(0);
    });

    it("is idempotent — a second apply run finds nothing left to repair", async () => {
        await seedCorruptReport("PW_idem", REPORT_HTML);

        const first = await runBackfill({ bucket, apply: true });
        const second = await runBackfill({ bucket, apply: true });

        expect(first.recovered).toBe(1);
        expect(second.recovered).toBe(0);
        expect(second.alreadyValid).toBe(1);
    });

    it("counts reports with no file_id as missing rather than failing", async () => {
        await Report.create({ test_id: "PW_nofile" });

        const tally = await runBackfill({ bucket, apply: true });

        expect(tally.missingFile).toBe(1);
        expect(tally.recovered).toBe(0);
    });

    it("flags a dangling file_id for regeneration", async () => {
        await Report.create({
            test_id: "PW_dangling",
            file_id: new mongoose.Types.ObjectId(),
        });

        const tally = await runBackfill({ bucket, apply: true });

        expect(tally.missingFile).toBe(1);
        expect(tally.needsRegeneration).toContain("PW_dangling");
    });

    it("handles a mixed population in one pass", async () => {
        await seedCorruptReport("PW_a", REPORT_HTML);
        await seedCorruptReport("PW_b", REPORT_HTML);
        await seedHealthyReport("PW_c", REPORT_HTML);
        await Report.create({ test_id: "PW_d" });

        const tally = await runBackfill({ bucket, apply: true });

        expect(tally).toMatchObject({
            recovered: 2,
            alreadyValid: 1,
            missingFile: 1,
            unrecoverable: 0,
        });
    });

    it("round-trips a report written through the live API untouched", async () => {
        // Reports created after the fix must be classified already-valid, not
        // "repaired" into something different.
        await post("/report/PW_live").send({ data: htmlDataUri(REPORT_HTML) });

        const tally = await runBackfill({ bucket, apply: true });

        expect(tally.alreadyValid).toBe(1);
        expect(tally.recovered).toBe(0);

        const res = await get("/report/PW_live");
        const b64 = res.body.data.replace(/^data:[^;,]*;base64,/, "");
        expect(Buffer.from(b64, "base64").toString("utf8")).toBe(REPORT_HTML);
    });
});
