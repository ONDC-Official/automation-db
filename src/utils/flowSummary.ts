/**
 * Per-flow step counts for the NP Portal session API, from saved messages.
 *
 * Saved messages do not record which step they belong to, so steps are matched by
 * action, in order. Form submissions are not saved at all.
 */

export type StepState = "passed" | "failed" | "not_run";

export interface SavedMessage {
    flowId?: string | null;
    transactionId?: string | null;
    action?: string | null;
    messageId?: string | null;
    /** `ACK`, `NACK`, or nothing when no reply was saved. */
    ack?: string | null;
}

export interface BuildFlow {
    flowId: string;
    /** The `api` of each step, in flow order. */
    steps: string[];
}

const isForm = (api: string): boolean =>
    api === "html_form" || api === "dynamic_form";

/**
 * A technical cancellation tests an `on_confirm` that arrives too late, so its NACK
 * is the flow working. No flow config marks this, so it is decided by name here.
 */
export const nackIsExpected = (flowId: string, api: string): boolean =>
    api === "on_confirm" && /technical.?cancellation/i.test(flowId);

/** The messages of a flow's latest try. Expects them oldest first. */
export function latestTry(messages: SavedMessage[]): SavedMessage[] {
    const latest = [...new Set(messages.map((m) => m.transactionId))].at(-1);
    return messages.filter((m) => m.transactionId === latest);
}

/**
 * Each step's state in one try. Forms always count as passed. Messages sharing an
 * action and message ID are one step and the first decides, as on the live screen.
 * Matching per action keeps a late callback from shifting the steps after it.
 */
export function stepStates(flow: BuildFlow, messages: SavedMessage[]): StepState[] {
    const seen = new Set<string>();
    const replies = new Map<string, (string | null | undefined)[]>();
    for (const { action, messageId, ack } of messages) {
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

/** One flow's counts from its latest try. Messages must be oldest first. */
export function flowSummary(flow: BuildFlow, messages: SavedMessage[]) {
    const own = messages.filter((m) => m.flowId === flow.flowId);
    const attempt = latestTry(own);
    const states = attempt.length ? stepStates(flow, attempt) : [];
    return {
        flowId: flow.flowId,
        totalSteps: flow.steps.length,
        passedSteps: states.filter((state) => state === "passed").length,
        failedSteps: states.filter((state) => state === "failed").length,
        transactionIds: [...new Set(own.flatMap((m) => m.transactionId ?? []))],
    };
}
