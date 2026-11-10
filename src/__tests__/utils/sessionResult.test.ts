import { describe, expect, it } from "vitest";
import {
    BuildFlow,
    SavedMessage,
    flowSummary,
    latestTry,
    sessionResult,
    stepStates,
} from "../../utils/sessionResult";

let id = 0;
const msg = (action: string, ack: string | null = "ACK", extra: Partial<SavedMessage> = {}) => ({
    action,
    ack,
    messageId: `m-${++id}`,
    flowId: "A",
    transactionId: "t1",
    ...extra,
});

const flowA: BuildFlow = { flowId: "A", steps: ["search", "on_search"] };

const states = (steps: string[], messages: SavedMessage[], flowId = "A") =>
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

describe("latestTry", () => {
    it("keeps only the transaction that started last", () => {
        const first = msg("SEARCH", "NACK", { transactionId: "t1" });
        const second = msg("SEARCH", "ACK", { transactionId: "t2" });
        const lateFromFirst = msg("ON_SEARCH", "ACK", { transactionId: "t1" });

        expect(latestTry([first, second])).toEqual([second]);
        expect(latestTry([first, second, lateFromFirst])).toEqual([second]);
    });
});

describe("sessionResult", () => {
    it("is passed when every flow of the build passed every step", () => {
        expect(sessionResult([flowA], [msg("SEARCH"), msg("ON_SEARCH")])).toBe("passed");
    });

    it("is failed when any flow has a failed step, even if others have not run", () => {
        const flowB = { flowId: "B", steps: ["select"] };
        expect(sessionResult([flowA, flowB], [msg("SEARCH", "NACK")])).toBe("failed");
    });

    it("is incomplete when a step has not run", () => {
        expect(sessionResult([flowA], [msg("SEARCH")])).toBe("incomplete");
    });

    it("is incomplete when a flow of the build never ran", () => {
        const flowB = { flowId: "B", steps: ["select"] };
        expect(sessionResult([flowA, flowB], [msg("SEARCH"), msg("ON_SEARCH")])).toBe(
            "incomplete",
        );
    });

    it("is incomplete with no flows or no messages", () => {
        expect(sessionResult([], [msg("SEARCH")])).toBe("incomplete");
        expect(sessionResult([flowA], [])).toBe("incomplete");
    });

    it("forgives a failure that a later retry passed", () => {
        expect(
            sessionResult([flowA], [
                msg("SEARCH", "NACK", { transactionId: "t1" }),
                msg("SEARCH", "ACK", { transactionId: "t2" }),
                msg("ON_SEARCH", "ACK", { transactionId: "t2" }),
            ]),
        ).toBe("passed");
    });

    it("passes a finished technical cancellation despite its on_confirm NACK", () => {
        const flow = { flowId: "TECHNICAL_CANCELLATION_FLOW", steps: ["on_confirm", "cancel"] };
        const extra = { flowId: flow.flowId };

        expect(
            sessionResult([flow], [msg("ON_CONFIRM", "NACK", extra), msg("CANCEL", "ACK", extra)]),
        ).toBe("passed");
    });

    it("stays incomplete if a technical cancellation stops at the NACK", () => {
        const flow = { flowId: "TECHNICAL_CANCELLATION_FLOW", steps: ["on_confirm", "cancel"] };

        expect(sessionResult([flow], [msg("ON_CONFIRM", "NACK", { flowId: flow.flowId })])).toBe(
            "incomplete",
        );
    });

    it("passes a flow that ends on a form once its other steps pass", () => {
        const flow = { flowId: "A", steps: ["search", "html_form"] };

        expect(sessionResult([flow], [msg("SEARCH")])).toBe("passed");
    });

    it("does not treat a flow made only of forms as passed before it runs", () => {
        expect(sessionResult([{ flowId: "F", steps: ["html_form"] }], [])).toBe("incomplete");
    });
});

describe("flowSummary", () => {
    it("counts the latest try and lists every try, oldest first", () => {
        expect(
            flowSummary(flowA, [
                msg("SEARCH", "NACK", { transactionId: "t1" }),
                msg("SEARCH", "ACK", { transactionId: "t2" }),
                msg("ON_SEARCH", "NACK", { transactionId: "t2" }),
            ]),
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

        expect(flowSummary(flow, [msg("SEARCH", "ACK", { flowId: "other" })])).toEqual({
            flowId: "F",
            totalSteps: 2,
            passedSteps: 0,
            failedSteps: 0,
            transactionIds: [],
        });
    });

    it("counts forms as passed once the flow has run", () => {
        const flow = { flowId: "F", steps: ["search", "html_form", "select"] };

        expect(flowSummary(flow, [msg("SEARCH", "ACK", { flowId: "F" })])).toMatchObject({
            totalSteps: 3,
            passedSteps: 2,
            failedSteps: 0,
        });
    });
});
