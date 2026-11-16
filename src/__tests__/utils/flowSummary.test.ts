import { describe, expect, it } from "vitest";
import { IFlowRunStep } from "../../entity/SessionDetails";
import {
    BuildFlow,
    MAX_RUN_STEPS,
    flowSummary,
    stepStates,
    toFlowRunSteps,
} from "../../utils/flowSummary";

let id = 0;
const msg = (action: string, ack: string | null = "ACK", extra: Partial<IFlowRunStep> = {}) => ({
    action,
    ack: ack ?? "",
    messageId: `m-${++id}`,
    ...extra,
});

const flowA: BuildFlow = { flowId: "A", steps: ["search", "on_search"] };

const states = (steps: string[], messages: IFlowRunStep[], flowId = "A") =>
    stepStates({ flowId, steps }, messages);

describe("stepStates", () => {
    it("marks ACK as passed, anything else as failed, and no message as not run", () => {
        expect(
            states(["select", "init", "confirm", "status"], [
                msg("SELECT"),
                msg("INIT", "NACK"),
                msg("CONFIRM", null),
            ]),
        ).toEqual(["passed", "failed", "failed", "not_run"]);
    });

    it("matches a repeated action to its steps in order", () => {
        expect(
            states(["on_status", "on_status", "on_status"], [
                msg("ON_STATUS"),
                msg("ON_STATUS", "NACK"),
            ]),
        ).toEqual(["passed", "failed", "not_run"]);
    });

    it("is not thrown off by a late callback", () => {
        expect(
            states(["select", "on_select", "init"], [
                msg("SELECT"),
                msg("INIT"),
                msg("ON_SELECT", "NACK"),
            ]),
        ).toEqual(["passed", "failed", "passed"]);
    });

    it("treats the same action and message ID as one step, first copy deciding", () => {
        const same = { messageId: "same" };
        expect(
            states(["select", "select"], [
                msg("SELECT", "NACK", same),
                msg("SELECT", "ACK", same),
            ]),
        ).toEqual(["failed", "not_run"]);
    });

    it("ignores messages beyond the flow's steps", () => {
        expect(states(["init"], [msg("INIT"), msg("INIT", "NACK")])).toEqual(["passed"]);
    });

    it("always counts a form as passed, wherever it sits", () => {
        expect(
            states(["search", "html_form", "select", "dynamic_form"], [msg("SEARCH")]),
        ).toEqual(["passed", "passed", "not_run", "passed"]);
    });

    it.each([
        "TECHNICAL_CANCELLATION_FLOW",
        "TECHNICAL_CANCELLATION_FLOW (W/O search_1 & select)",
        "OnDemand_Ride_Technical_Cancellation_Flow",
        "technical_cancellation",
    ])("accepts the expected on_confirm NACK in %s", (flowId) => {
        expect(
            states(["on_confirm", "status"], [msg("ON_CONFIRM", "NACK"), msg("STATUS")], flowId),
        ).toEqual(["passed", "passed"]);
    });

    it("keeps any other NACK in a technical cancellation as failed", () => {
        expect(
            states(["search", "on_confirm"], [msg("SEARCH", "NACK")], "TECHNICAL_CANCELLATION_FLOW"),
        ).toEqual(["failed", "not_run"]);
    });

    it("keeps an on_confirm with no reply as failed in a technical cancellation", () => {
        expect(
            states(["on_confirm"], [msg("ON_CONFIRM", null)], "TECHNICAL_CANCELLATION_FLOW"),
        ).toEqual(["failed"]);
    });

    it("keeps an on_confirm NACK as failed in other cancellation flows", () => {
        expect(
            states(["on_confirm"], [msg("ON_CONFIRM", "NACK")], "USER_CANCELLATION_FLOW"),
        ).toEqual(["failed"]);
    });
});

describe("toFlowRunSteps", () => {
    it("keeps action, message ID and ACK/NACK of each call, in order", () => {
        expect(
            toFlowRunSteps([
                { action: " search ", messageId: " m1 ", ack: "ack", extra: "dropped" },
                { action: "on_search", messageId: "m1", ack: "NACK" },
                { action: "select" },
            ]),
        ).toEqual([
            { action: "search", messageId: "m1", ack: "ACK" },
            { action: "on_search", messageId: "m1", ack: "NACK" },
            { action: "select", messageId: "", ack: "" },
        ]);
    });

    it("drops entries with no action and anything that is not an entry", () => {
        expect(
            toFlowRunSteps([null, "x", 7, [], { messageId: "m" }, { action: "  " }, { action: 5 }, { action: "init" }]),
        ).toEqual([{ action: "init", messageId: "", ack: "" }]);
    });

    it("turns non-text values into empty text", () => {
        expect(toFlowRunSteps([{ action: "init", messageId: { $gt: "" }, ack: 1 }])).toEqual([
            { action: "init", messageId: "", ack: "" },
        ]);
    });

    it(`keeps at most ${MAX_RUN_STEPS} calls`, () => {
        const many = Array.from({ length: MAX_RUN_STEPS + 50 }, (_, i) => ({ action: `a${i}` }));
        const kept = toFlowRunSteps(many)!;
        expect(kept).toHaveLength(MAX_RUN_STEPS);
        expect(kept[0].action).toBe("a0");
    });

    it("gives an empty list for an empty list, and nothing when no list was sent", () => {
        expect(toFlowRunSteps([])).toEqual([]);
        expect(toFlowRunSteps(undefined)).toBeUndefined();
        expect(toFlowRunSteps(null)).toBeUndefined();
        expect(toFlowRunSteps({ action: "search" })).toBeUndefined();
    });
});

describe("flowSummary", () => {
    const run = (steps: IFlowRunStep[], transactionIds = ["t1"]) => ({
        flowId: "A",
        transactionId: transactionIds.at(-1)!,
        transactionIds,
        steps,
    });

    it("counts the latest run and lists every transaction", () => {
        expect(
            flowSummary(flowA, run([msg("SEARCH"), msg("ON_SEARCH", "NACK")], ["t1", "t2"])),
        ).toEqual({
            flowId: "A",
            totalSteps: 2,
            passedSteps: 1,
            failedSteps: 1,
            transactionIds: ["t1", "t2"],
        });
    });

    it("shows a flow that never ran with nothing passed, forms included", () => {
        const flow = { flowId: "F", steps: ["search", "html_form"] };
        const empty = { flowId: "F", totalSteps: 2, passedSteps: 0, failedSteps: 0, transactionIds: [] };

        expect(flowSummary(flow)).toEqual(empty);
        expect(flowSummary(flow, null)).toEqual(empty);
    });

    it("counts forms as passed once the flow has run", () => {
        const flow = { flowId: "A", steps: ["search", "html_form", "select"] };

        expect(flowSummary(flow, run([msg("SEARCH")]))).toMatchObject({
            totalSteps: 3,
            passedSteps: 2,
            failedSteps: 0,
        });
    });

    it("lists the transaction even when its run has no calls yet", () => {
        expect(flowSummary(flowA, run([], ["t1"]))).toEqual({
            flowId: "A",
            totalSteps: 2,
            passedSteps: 0,
            failedSteps: 0,
            transactionIds: ["t1"],
        });
    });
});
