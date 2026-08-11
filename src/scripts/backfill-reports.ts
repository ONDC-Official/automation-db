/**
 * Backfill for reports corrupted by the old saveToGridFS base64 bug.
 *
 * Dry run (default) — reports what WOULD change, writes nothing:
 *   npm run backfill:reports
 *
 * Apply:
 *   npm run backfill:reports -- --apply
 *
 * The old blob is left in place rather than deleted, so a bad run can be undone
 * by repointing file_id. Clean the orphans up separately once you are satisfied.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { Report } from "../entity/Reports";
import { recoverReportBytes } from "../utils/reportRecovery";

export interface BackfillTally {
    alreadyValid: number;
    recovered: number;
    unrecoverable: number;
    missingFile: number;
    /** test_ids whose HTML is gone and must be regenerated from source. */
    needsRegeneration: string[];
}

interface BackfillOptions {
    bucket: mongoose.mongo.GridFSBucket;
    apply: boolean;
    log?: (message: string) => void;
}

async function readBlob(
    bucket: mongoose.mongo.GridFSBucket,
    fileId: mongoose.Types.ObjectId,
): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
        const stream = bucket.openDownloadStream(fileId);
        stream.on("data", (c: Buffer) => chunks.push(c));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
}

async function writeBlob(
    bucket: mongoose.mongo.GridFSBucket,
    name: string,
    html: string,
): Promise<mongoose.Types.ObjectId> {
    const upload = bucket.openUploadStream(name);
    return new Promise((resolve, reject) => {
        upload.on("finish", () =>
            resolve(upload.id as mongoose.Types.ObjectId),
        );
        upload.on("error", reject);
        upload.end(Buffer.from(html, "utf8"));
    });
}

/**
 * Walks every Report, classifies its GridFS blob, and repairs the recoverable
 * ones. Exported so the migration is covered by tests rather than trusted.
 */
export async function runBackfill({
    bucket,
    apply,
    log = () => {},
}: BackfillOptions): Promise<BackfillTally> {
    const tally: BackfillTally = {
        alreadyValid: 0,
        recovered: 0,
        unrecoverable: 0,
        missingFile: 0,
        needsRegeneration: [],
    };

    const cursor = Report.find({}, { test_id: 1, file_id: 1 }).cursor();

    for await (const doc of cursor) {
        if (!doc.file_id) {
            tally.missingFile++;
            continue;
        }

        let stored: Buffer;
        try {
            stored = await readBlob(
                bucket,
                new mongoose.Types.ObjectId(doc.file_id.toString()),
            );
        } catch {
            tally.missingFile++;
            tally.needsRegeneration.push(doc.test_id);
            continue;
        }

        const result = recoverReportBytes(stored);

        if (result.status === "already-valid") {
            tally.alreadyValid++;
            continue;
        }

        if (result.status === "unrecoverable") {
            tally.unrecoverable++;
            tally.needsRegeneration.push(doc.test_id);
            continue;
        }

        tally.recovered++;
        const html = result.html as string;

        if (apply) {
            const newFileId = await writeBlob(bucket, doc.test_id, html);
            await Report.updateOne(
                { _id: doc._id },
                { $set: { file_id: newFileId } },
            );
            log(`  repaired ${doc.test_id}`);
        } else {
            log(`  would repair ${doc.test_id} (${html.length} bytes)`);
        }
    }

    return tally;
}

async function main(): Promise<void> {
    dotenv.config();

    const apply = process.argv.includes("--apply");
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI is not set");

    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    if (!db) throw new Error("MongoDB connection not ready");

    const bucket = new mongoose.mongo.GridFSBucket(db, {
        bucketName: "reports",
    });

    console.log(
        `\n${apply ? "APPLYING" : "DRY RUN — no writes"}  (pass --apply to write)\n`,
    );

    const tally = await runBackfill({ bucket, apply, log: console.log });

    console.log("\n─── summary ───");
    console.log(`  already valid : ${tally.alreadyValid}`);
    console.log(
        `  ${apply ? "repaired     " : "repairable   "} : ${tally.recovered}`,
    );
    console.log(`  unrecoverable : ${tally.unrecoverable}`);
    console.log(`  missing blob  : ${tally.missingFile}`);

    if (tally.needsRegeneration.length) {
        console.log(
            "\nThese need regenerating from source — the original HTML is gone:",
        );
        tally.needsRegeneration.forEach((id) => console.log(`  - ${id}`));
    }

    if (!apply && tally.recovered > 0) {
        console.log("\nRe-run with --apply to write these changes.");
    }

    await mongoose.disconnect();
}

if (require.main === module) {
    main().catch((err) => {
        console.error("Backfill failed:", err);
        process.exit(1);
    });
}
