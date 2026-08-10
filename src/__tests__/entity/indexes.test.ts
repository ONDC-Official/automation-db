import { beforeAll, describe, expect, it } from "vitest";
import { SessionDetails } from "../../entity/SessionDetails";
import { Payload } from "../../entity/Payload";
import { seedPayload, seedSession } from "../factories";

/**
 * SessionDetails had no indexes at all, so every dashboard query was a full
 * collection scan. These tests assert both that the indexes exist and — more
 * importantly — that the planner actually uses them.
 *
 * mongodb-memory-server runs a real mongod, so explain() output here matches
 * production behaviour.
 */

describe("SessionDetails indexes", () => {
    beforeAll(async () => {
        await SessionDetails.syncIndexes();
    });

    it("declares an index for every field the dashboard filters on", async () => {
        const indexes = await SessionDetails.collection.indexes();
        const keys = indexes.map((i) => JSON.stringify(i.key));

        expect(keys).toContain(JSON.stringify({ sessionId: 1 }));
        expect(keys).toContain(JSON.stringify({ userId: 1 }));
        expect(keys).toContain(JSON.stringify({ npId: 1 }));
        expect(keys).toContain(JSON.stringify({ domain: 1 }));
        expect(keys).toContain(JSON.stringify({ version: 1 }));
        expect(keys).toContain(JSON.stringify({ createdAt: -1 }));
        expect(keys).toContain(
            JSON.stringify({ domain: 1, version: 1, createdAt: -1 }),
        );
        expect(keys).toContain(
            JSON.stringify({ npType: 1, npId: 1, domain: 1, version: 1 }),
        );
        // Covers the participants rollup: group by npId over a date window.
        expect(keys).toContain(JSON.stringify({ npId: 1, createdAt: -1 }));
    });

    it("indexes the payload lookup the participants rollup drives", async () => {
        await Payload.syncIndexes();
        const keys = (await Payload.collection.indexes()).map((i) =>
            JSON.stringify(i.key),
        );

        expect(keys).toContain(JSON.stringify({ sessionId: 1 }));
        // Carries createdAt and flowId so the rollup's sub-pipeline is covered
        // and never fetches the request/response envelopes.
        expect(keys).toContain(
            JSON.stringify({ sessionId: 1, createdAt: 1, flowId: 1 }),
        );
    });

    it("uses an index to reach one participant's payloads", async () => {
        await Payload.syncIndexes();
        await seedPayload({ sessionId: "explain-me" });

        const plan = await Payload.collection
            .find({ sessionId: "explain-me" })
            .explain("queryPlanner");

        expect(JSON.stringify(plan)).toContain("IXSCAN");
    });

    // sessionId must stay non-unique until production is audited for duplicates
    // — upsertSession assumes uniqueness the schema never enforced.
    it("does not enforce uniqueness on sessionId yet", async () => {
        const indexes = await SessionDetails.collection.indexes();
        const sessionIdIndex = indexes.find(
            (i) => JSON.stringify(i.key) === JSON.stringify({ sessionId: 1 }),
        );

        expect(sessionIdIndex?.unique).toBeUndefined();
    });

    // Mongoose types .explain() as returning the document type, so the plan has
    // to be reached through an explicit shape.
    interface ExplainResult {
        queryPlanner: { winningPlan: Record<string, unknown> };
    }

    /** Walks to the innermost stage — the one that says IXSCAN or COLLSCAN. */
    const innermostStage = (plan: Record<string, unknown>): string => {
        let stage = plan;
        while (stage.inputStage) stage = stage.inputStage as typeof stage;
        return stage.stage as string;
    };

    const scanStageFor = async (
        filter: Record<string, unknown>,
        sort?: Record<string, 1 | -1>,
    ): Promise<string> => {
        const query = SessionDetails.find(filter);
        if (sort) query.sort(sort);

        const explained = (await query.explain(
            "executionStats",
        )) as unknown as ExplainResult;

        return innermostStage(explained.queryPlanner.winningPlan);
    };

    it("uses an index scan for a sessionId lookup", async () => {
        await seedSession({ sessionId: "idx-1" });

        expect(await scanStageFor({ sessionId: "idx-1" })).toBe("IXSCAN");
    });

    it("uses an index scan for the domain + version + date-range filter", async () => {
        await seedSession({ domain: "ONDC:FIS10", version: "2.1.0" });

        const stage = await scanStageFor(
            {
                domain: "ONDC:FIS10",
                version: "2.1.0",
                createdAt: { $gte: new Date("2020-01-01") },
            },
            { createdAt: -1 },
        );

        expect(stage).toBe("IXSCAN");
    });

    it("uses an index scan for the four-field /filter query", async () => {
        await seedSession();

        const stage = await scanStageFor({
            npType: "BAP",
            npId: "https://buyer.example.com",
            domain: "ONDC:FIS10",
            version: "2.1.0",
        });

        expect(stage).toBe("IXSCAN");
    });

    it("uses an index scan for a createdAt-only date range", async () => {
        await seedSession();

        const stage = await scanStageFor({
            createdAt: { $gte: new Date("2020-01-01") },
        });

        expect(stage).toBe("IXSCAN");
    });
});
