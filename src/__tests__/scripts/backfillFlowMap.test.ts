import { describe, expect, it } from "vitest";

import { useApi } from "../helpers/api";
import { seedSession } from "../factories";
import { SessionDetails } from "../../entity/SessionDetails";
import { runFlowMapBackfill } from "../../scripts/backfill-flowmap";

/**
 * End-to-end cover for the flowMap repair, against real documents.
 *
 * A migration that has only been reasoned about is a migration that has not
 * been tested, so these seed flowMaps exactly as the pre-fix workbench wrote
 * them — every flow key stamped with the literal "RUN" — and assert both the
 * stored document and the participants aggregation read back correctly.
 */
const { get } = useApi();

const readFlowMap = async (sessionId: string) => {
    const doc = await SessionDetails.findOne({ sessionId }).lean();
    return (doc as { flowMap?: unknown } | null)?.flowMap;
};

describe("flowMap backfill", () => {
    it("reports what it would change without writing anything", async () => {
        await seedSession({
            sessionId: "s-1",
            flowMap: { FLOW_A: "RUN", FLOW_B: "RUN" },
        } as never);

        const tally = await runFlowMapBackfill({ apply: false });

        expect(tally).toMatchObject({
            cleaned: 1,
            emptied: 1,
            entriesRemoved: 2,
            valuesSeen: { RUN: 2 },
        });
        // The whole point of a dry run.
        expect(await readFlowMap("s-1")).toEqual({ FLOW_A: "RUN", FLOW_B: "RUN" });
    });

    it("unsets a flowMap left with no verdicts", async () => {
        await seedSession({
            sessionId: "s-1",
            flowMap: { FLOW_A: "RUN", FLOW_B: "RUN" },
        } as never);

        await runFlowMapBackfill({ apply: true });

        // Unset, not {} — flowsJudged counts keys, so an entry left behind as
        // null would still be counted as judged.
        expect(await readFlowMap("s-1")).toBeUndefined();
    });

    it("keeps real verdicts and drops only the pollution", async () => {
        await seedSession({
            sessionId: "s-1",
            flowMap: { FLOW_A: "PASS", FLOW_B: "RUN", FLOW_C: "FAIL" },
        } as never);

        const tally = await runFlowMapBackfill({ apply: true });

        expect(tally).toMatchObject({ cleaned: 1, emptied: 0, entriesRemoved: 1 });
        expect(await readFlowMap("s-1")).toEqual({ FLOW_A: "PASS", FLOW_C: "FAIL" });
    });

    it("leaves an already-clean flowMap untouched", async () => {
        await seedSession({
            sessionId: "s-1",
            flowMap: { FLOW_A: "PASS", FLOW_B: "FAIL" },
        } as never);

        const tally = await runFlowMapBackfill({ apply: true });

        expect(tally).toMatchObject({ clean: 1, cleaned: 0, entriesRemoved: 0 });
        expect(await readFlowMap("s-1")).toEqual({ FLOW_A: "PASS", FLOW_B: "FAIL" });
    });

    it("unsets a flowMap that is not an object at all", async () => {
        // flowMap is Schema.Types.Mixed, so it can hold a string or an array.
        await seedSession({ sessionId: "s-1", flowMap: "not-an-object" } as never);

        const tally = await runFlowMapBackfill({ apply: true });

        expect(tally).toMatchObject({ malformed: 1 });
        expect(await readFlowMap("s-1")).toBeUndefined();
    });

    it("is idempotent", async () => {
        await seedSession({
            sessionId: "s-1",
            flowMap: { FLOW_A: "PASS", FLOW_B: "RUN" },
        } as never);

        await runFlowMapBackfill({ apply: true });
        const second = await runFlowMapBackfill({ apply: true });

        expect(second).toMatchObject({ clean: 1, cleaned: 0, entriesRemoved: 0 });
        expect(await readFlowMap("s-1")).toEqual({ FLOW_A: "PASS" });
    });

    it("clears the inflated Failed count the dashboard was reporting", async () => {
        // The reported symptom, end to end: four started-but-unjudged flows read
        // as "judged 4 / failed 4" on the participants page.
        await seedSession({
            sessionId: "s-1",
            npId: "https://buyer.example.com",
            flowMap: { F1: "RUN", F2: "RUN", F3: "RUN", F4: "RUN" },
        } as never);

        await runFlowMapBackfill({ apply: true });

        const res = await get("/api/sessions/participants");
        expect(res.status).toBe(200);
        expect(res.body.data[0]).toMatchObject({
            flowsJudged: 0,
            flowsFailed: 0,
            passRate: null,
        });
    });
});
