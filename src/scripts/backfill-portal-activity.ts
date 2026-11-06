/**
 * Backfill for the NP Portal session list.
 *
 * `lastActivityAt`, `flowIds` and `result` are only kept up to date from the day
 * they were added, so older sessions would be missing from the list's status,
 * activity, flow and result filters. This fills them in for every session with an
 * organisation; the rest can never appear in the list.
 *
 * `updatedAt` is left alone. Last activity becomes the later of `updatedAt` and the
 * newest message, which is an estimate for sessions from before this change.
 *
 * Safe to run again, for example after the rule for `result` changes.
 *
 * Dry run (default) — reports what WOULD change, writes nothing:
 *   npm run backfill:portal-activity
 *
 * Apply:
 *   npm run backfill:portal-activity -- --apply
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { SessionDetails } from "../entity/SessionDetails";
import { PayloadRepository } from "../repositories/PayloadRepository";
import { SessionDetailsRepository } from "../repositories/SessionDetailsRepository";
import { SessionDetailsService } from "../services/SessionDetailsService";

export interface PortalActivityBackfillTally {
    /** Sessions with an organisation. */
    sessions: number;
    /** Sessions whose activity, flows and result could not be worked out. */
    failed: number;
}

interface PortalActivityBackfillOptions {
    apply: boolean;
    log?: (message: string) => void;
}

/** Exported so the migration is covered by tests rather than trusted. */
export async function runPortalActivityBackfill({
    apply,
    log = () => {},
}: PortalActivityBackfillOptions): Promise<PortalActivityBackfillTally> {
    const tally: PortalActivityBackfillTally = { sessions: 0, failed: 0 };
    const service = new SessionDetailsService(
        new SessionDetailsRepository(),
        new PayloadRepository(),
    );

    const cursor = SessionDetails.find(
        { orgId: { $nin: [null, ""] } },
        { sessionId: 1, updatedAt: 1, createdAt: 1 },
    )
        .lean()
        .cursor();

    for await (const doc of cursor) {
        tally.sessions++;
        if (!apply) {
            log(`  would fill ${doc.sessionId}`);
            continue;
        }
        try {
            await SessionDetails.updateOne(
                { _id: doc._id },
                { $max: { lastActivityAt: doc.updatedAt ?? doc.createdAt } },
                { timestamps: false },
            );
            // The schema's defaults only reach rows written after they were added,
            // and a session with no messages gets nothing from the refresh below.
            await SessionDetails.updateOne(
                { _id: doc._id, result: { $exists: false } },
                { $set: { result: "incomplete", flowIds: [] } },
                { timestamps: false },
            );
            await service.refreshMessageActivity(doc.sessionId);
            log(`  filled ${doc.sessionId}`);
        } catch (error) {
            tally.failed++;
            log(`  failed ${doc.sessionId}: ${String(error)}`);
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
    console.log(
        `\n${apply ? "APPLYING" : "DRY RUN — no writes"}  (pass --apply to write)\n`,
    );

    const tally = await runPortalActivityBackfill({ apply, log: console.log });

    console.log("\n─── summary ───");
    console.log(`  sessions with an organisation : ${tally.sessions}`);
    console.log(`  failed                        : ${tally.failed}`);

    await mongoose.disconnect();
}

if (require.main === module) {
    main().catch((err) => {
        console.error("Portal activity backfill failed:", err);
        process.exit(1);
    });
}
