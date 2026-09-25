/**
 * Backfill for session flowMaps polluted with non-verdict values.
 *
 * `SessionDetails.flowMap` is a per-flow verdict map (`flowId -> "PASS" | "FAIL"`),
 * but the field is `Schema.Types.Mixed`, so nothing enforced that. The workbench
 * backend used to stamp the literal "RUN" over every flow key on each session
 * update, conflating this map with its own `flowId -> transactionId` cache.
 *
 * The participants aggregation counted `flowsJudged` as every key present and
 * derived `flowsFailed = flowsJudged - flowsPassed`, so each "RUN" entry was
 * reported as a *failed* flow — while the per-flow drill-down, which matches
 * "PASS"/"FAIL" exactly, showed nothing but zeros for the same session.
 *
 * This strips every entry that is not a verdict, and unsets `flowMap` entirely
 * when nothing is left, because `flowsJudged` reads keys — an entry left behind
 * as `null` would still be counted.
 *
 * Run the writer fix first. While the workbench is still stamping "RUN", the
 * pollution returns on the next session update, and because existing keys win
 * in `upsertSession`, the new entries are sticky.
 *
 * Dry run (default) — reports what WOULD change, writes nothing:
 *   npm run backfill:flowmap
 *
 * Apply:
 *   npm run backfill:flowmap -- --apply
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { SessionDetails } from "../entity/SessionDetails";

export interface FlowMapBackfillTally {
    /** Documents whose flowMap was already verdict-only (or absent). */
    clean: number;
    /** Documents with at least one non-verdict entry stripped. */
    cleaned: number;
    /** Of those, the ones left with no verdicts at all — flowMap unset. */
    emptied: number;
    /** Individual key/value pairs removed, across all documents. */
    entriesRemoved: number;
    /** flowMap present but not a usable object (a string, an array). */
    malformed: number;
    /** The distinct bad values encountered, for the summary. */
    valuesSeen: Record<string, number>;
}

interface FlowMapBackfillOptions {
    apply: boolean;
    log?: (message: string) => void;
}

const isVerdict = (value: unknown): value is "PASS" | "FAIL" =>
    value === "PASS" || value === "FAIL";

/**
 * Walks every session with a flowMap and strips non-verdict entries. Exported so
 * the migration is covered by tests rather than trusted.
 */
export async function runFlowMapBackfill({
    apply,
    log = () => {},
}: FlowMapBackfillOptions): Promise<FlowMapBackfillTally> {
    const tally: FlowMapBackfillTally = {
        clean: 0,
        cleaned: 0,
        emptied: 0,
        entriesRemoved: 0,
        malformed: 0,
        valuesSeen: {},
    };

    const cursor = SessionDetails.find(
        { flowMap: { $nin: [null, undefined] } },
        { sessionId: 1, flowMap: 1 },
    ).cursor();

    for await (const doc of cursor) {
        const raw: unknown = doc.flowMap;

        // Mixed means this can be a string or an array. Neither is salvageable,
        // and $objectToArray throws on both, so unset it outright.
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            tally.malformed++;
            if (apply) {
                await SessionDetails.updateOne(
                    { _id: doc._id },
                    { $unset: { flowMap: "" } },
                );
                log(`  unset malformed flowMap on ${doc.sessionId}`);
            } else {
                log(`  would unset malformed flowMap on ${doc.sessionId}`);
            }
            continue;
        }

        const entries = Object.entries(raw as Record<string, unknown>);
        const kept: Record<string, "PASS" | "FAIL"> = {};
        const dropped: string[] = [];

        for (const [flowId, verdict] of entries) {
            if (isVerdict(verdict)) {
                kept[flowId] = verdict;
            } else {
                dropped.push(flowId);
                const label = typeof verdict === "string" ? verdict : typeof verdict;
                tally.valuesSeen[label] = (tally.valuesSeen[label] ?? 0) + 1;
            }
        }

        if (dropped.length === 0) {
            tally.clean++;
            continue;
        }

        tally.cleaned++;
        tally.entriesRemoved += dropped.length;

        const keptCount = Object.keys(kept).length;
        if (keptCount === 0) tally.emptied++;

        // Unset rather than store {} — flowsJudged counts keys, and an empty map
        // is indistinguishable from "no verdicts" anyway.
        const update =
            keptCount === 0
                ? { $unset: { flowMap: "" } }
                : { $set: { flowMap: kept } };

        const summary = `${doc.sessionId}: dropped ${dropped.length} (${dropped.join(", ")}), kept ${keptCount}`;

        if (apply) {
            await SessionDetails.updateOne({ _id: doc._id }, update);
            log(`  cleaned ${summary}`);
        } else {
            log(`  would clean ${summary}`);
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

    const tally = await runFlowMapBackfill({ apply, log: console.log });

    console.log("\n─── summary ───");
    console.log(`  already clean   : ${tally.clean}`);
    console.log(`  ${apply ? "cleaned        " : "would clean    "} : ${tally.cleaned}`);
    console.log(`  left with none  : ${tally.emptied}`);
    console.log(`  entries removed : ${tally.entriesRemoved}`);
    console.log(`  malformed       : ${tally.malformed}`);

    const values = Object.entries(tally.valuesSeen);
    if (values.length) {
        console.log("\nNon-verdict values found:");
        values
            .sort((a, b) => b[1] - a[1])
            .forEach(([value, count]) => console.log(`  ${value} × ${count}`));
    }

    if (!apply && (tally.cleaned > 0 || tally.malformed > 0)) {
        console.log("\nRe-run with --apply to write these changes.");
    }

    await mongoose.disconnect();
}

if (require.main === module) {
    main().catch((err) => {
        console.error("flowMap backfill failed:", err);
        process.exit(1);
    });
}
