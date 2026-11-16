/**
 * Per-flow step counts for the NP Portal session API, from the flow runs the
 * recorder sends with each message (see IFlowRun). No saved payload is read.
 *
 * The recorder's step list does not say which flow step a call belongs to, so
 * steps are matched by action, in order. Form submissions are not in the list.
 */
import { IFlowRun, IFlowRunStep } from "../entity/SessionDetails";

export type StepState = "passed" | "failed" | "not_run";

export interface BuildFlow {
    flowId: string;
    /** The `api` of each step, in flow order. */
    steps: string[];
}

/** Longest step list kept per run. Real flows have well under 100 calls. */
export const MAX_RUN_STEPS = 200;

const isForm = (api: string): boolean =>
    api === "html_form" || api === "dynamic_form";

/**
 * A technical cancellation tests an `on_confirm` that arrives too late, so its NACK
 * is the flow working. No flow config marks this, so it is decided by name here.
 */
export const nackIsExpected = (flowId: string, api: string): boolean =>
    api === "on_confirm" && /technical.?cancellation/i.test(flowId);

const text = (value: unknown): string =>
    typeof value === "string" ? value.trim() : "";

/**
 * The recorder's step list, cleaned: only calls with an action, at most
 * MAX_RUN_STEPS. Returns undefined when no list was sent (an older recorder), so
 * the caller leaves the saved run alone.
 */
export function toFlowRunSteps(raw: unknown): IFlowRunStep[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    return raw
        .filter((item) => item && typeof item === "object" && text(item.action))
        .slice(0, MAX_RUN_STEPS)
        .map((item) => ({
            action: text(item.action),
            messageId: text(item.messageId),
            ack: text(item.ack).toUpperCase(),
        }));
}

/**
 * Each step's state in one run. Forms always count as passed. Calls sharing an
 * action and message ID are one step and the first decides, as on the live screen.
 * Matching per action keeps a late callback from shifting the steps after it.
 */
export function stepStates(flow: BuildFlow, calls: IFlowRunStep[]): StepState[] {
    const seen = new Set<string>();
    const replies = new Map<string, string[]>();
    for (const { action, messageId, ack } of calls) {
        const key = `${action}|${messageId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const api = String(action).toLowerCase();
        replies.set(api, [...(replies.get(api) ?? []), ack]);
    }

    return flow.steps.map((api): StepState => {
        if (isForm(api)) return "passed";
        const queue = replies.get(api);
        if (!queue?.length) return "not_run";
        const ack = queue.shift();
        return ack === "ACK" || (ack === "NACK" && nackIsExpected(flow.flowId, api))
            ? "passed"
            : "failed";
    });
}

/** One flow's counts from its latest run. A flow never run has no run. */
export function flowSummary(flow: BuildFlow, run?: IFlowRun | null) {
    const states = run?.steps?.length ? stepStates(flow, run.steps) : [];
    return {
        flowId: flow.flowId,
        totalSteps: flow.steps.length,
        passedSteps: states.filter((state) => state === "passed").length,
        failedSteps: states.filter((state) => state === "failed").length,
        transactionIds: run?.transactionIds ?? [],
    };
}
