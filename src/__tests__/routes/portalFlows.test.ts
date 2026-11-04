import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { useApi } from "../helpers/api";
import { seedSession } from "../factories";

/** Internal routes behind the NP Portal API: flow catalog and session scope. */

const { get } = useApi();

const step = (action_id: string, api: string, responseFor: string | null = null) => ({
    action_id,
    api,
    owner: "BAP",
    description: `${action_id} step`,
    unsolicited: false,
    responseFor,
    mock: { generate: "secret-mock-code" },
    examples: [{ name: "big example" }],
});

const flow = (flowId: string, overrides: Record<string, unknown> = {}) => ({
    flowId,
    domain: "ONDC:RET10",
    version: "1.2.5",
    usecase: "GROCERY",
    description: `About ${flowId}`,
    tags: ["WORKBENCH"],
    config: {
        meta: { flowId },
        steps: [step("search", "search"), step("on_search", "on_search", "search")],
    },
    ...overrides,
});

const seedFlows = (...flows: Record<string, unknown>[]) =>
    mongoose.connection.db!.collection("build_flows").insertMany(flows);

const ids = (res: { body: { flows: { flowId: string }[] } }) =>
    res.body.flows.map((f) => f.flowId).sort();

describe("GET /protocol-specs/flows", () => {
    it("returns display fields only, never mock code or examples", async () => {
        await seedFlows(flow("A"));

        const res = await get("/protocol-specs/flows");

        expect(res.status).toBe(200);
        expect(res.body.flows).toHaveLength(1);
        expect(res.body.flows[0].config.steps[1]).toEqual({
            action_id: "on_search",
            api: "on_search",
            owner: "BAP",
            description: "on_search step",
            unsolicited: false,
            responseFor: "search",
        });
        expect(JSON.stringify(res.body)).not.toContain("secret-mock-code");
        expect(JSON.stringify(res.body)).not.toContain("big example");
    });

    it("matches any of several values of a filter", async () => {
        await seedFlows(
            flow("A"),
            flow("B", { domain: "ONDC:RET11" }),
            flow("C", { domain: "ONDC:FIS12" }),
        );

        const res = await get(
            "/protocol-specs/flows?domain=ONDC:RET10&domain=ONDC:RET11",
        );

        expect(ids(res)).toEqual(["A", "B"]);
    });

    it("keeps a filter repeated up to the contract's limit of 100", async () => {
        await seedFlows(flow("A"), flow("B"));
        const flowIds = Array.from({ length: 99 }, (_, i) => `flowId=F${i}`);

        const res = await get(
            `/protocol-specs/flows?flowId=A&${flowIds.join("&")}`,
        );

        expect(ids(res)).toEqual(["A"]);
    });

    it("combines different filters with AND", async () => {
        await seedFlows(flow("A"), flow("A2"), flow("A", { version: "1.2.0" }));

        const res = await get("/protocol-specs/flows?version=1.2.5&flowId=A");

        expect(ids(res)).toEqual(["A"]);
        expect(res.body.flows[0].version).toBe("1.2.5");
    });

    it("matches tags by any or by all", async () => {
        await seedFlows(
            flow("both", { tags: ["core", "order"] }),
            flow("one", { tags: ["core"] }),
        );

        const any = await get("/protocol-specs/flows?tag=core&tag=order");
        const all = await get("/protocol-specs/flows?tag=core&tag=order&tagMatch=all");

        expect(ids(any)).toEqual(["both", "one"]);
        expect(ids(all)).toEqual(["both"]);
    });

    it("finds flows having a step for an action", async () => {
        await seedFlows(
            flow("cancels", {
                config: { meta: {}, steps: [step("cancel_1", "cancel")] },
            }),
            flow("other"),
        );

        const res = await get("/protocol-specs/flows?action=cancel");

        expect(ids(res)).toEqual(["cancels"]);
    });

    it("searches flow ID, title and description in any case", async () => {
        await seedFlows(
            flow("Order_Flow"),
            flow("x", { config: { meta: { flowName: "Big ORDER" }, steps: [] } }),
            flow("y", { description: "places an order" }),
            flow("z"),
        );

        const res = await get("/protocol-specs/flows?q=order");

        expect(ids(res)).toEqual(["Order_Flow", "x", "y"]);
    });

    it("treats special characters in q as plain text", async () => {
        await seedFlows(flow("Return(v-2.0.0)"), flow("Return"));

        const res = await get(
            `/protocol-specs/flows?q=${encodeURIComponent("(v-2.0.0)")}`,
        );

        expect(ids(res)).toEqual(["Return(v-2.0.0)"]);
    });
});

describe("GET /api/sessions/:sessionId/portal-scope", () => {
    it("returns only the session's organisation and build", async () => {
        await seedSession({
            sessionId: "s-1",
            orgId: "11899",
            domain: "ONDC:RET10",
            version: "1.2.5",
            usecaseId: "GROCERY",
        });

        const res = await get("/api/sessions/s-1/portal-scope");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            orgId: "11899",
            domain: "ONDC:RET10",
            version: "1.2.5",
            usecaseId: "GROCERY",
        });
    });

    it("answers 404 for an unknown session", async () => {
        const res = await get("/api/sessions/nope/portal-scope");

        expect(res.status).toBe(404);
    });
});
