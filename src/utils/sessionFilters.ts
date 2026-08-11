/**
 * One place that turns dashboard query params into MongoDB stages.
 *
 * The session list, the stats aggregation and the CSV export all build on this,
 * so a filter can never mean one thing on a chart and another in the export
 * beneath it.
 */
import { PipelineStage } from "mongoose";

/** Every param that switches GET /api/sessions/ out of legacy bare-array mode. */
export const SESSION_FILTER_PARAMS = [
    "from",
    "to",
    "npType",
    "npId",
    "domain",
    "version",
    "sessionType",
    "usecaseId",
    "userId",
    "reportExists",
    "result",
    "q",
    "page",
    "limit",
    "sort",
    "order",
] as const;

/** Sort keys a client may ask for. Anything else is rejected. */
export const SORTABLE_FIELDS = [
    "createdAt",
    "updatedAt",
    "sessionId",
    "domain",
    "version",
    "npType",
    "sessionType",
    "flowsTotal",
    "flowsPassed",
    "flowsFailed",
    "passRate",
] as const;

/**
 * Columns the CSV export may contain, in default order.
 *
 * A whitelist rather than "whatever the document has", so an export can never
 * accidentally leak a field the dashboard does not intend to publish.
 */
export const EXPORT_COLUMNS = [
    "sessionId",
    "createdAt",
    "updatedAt",
    "npType",
    "npId",
    "sessionType",
    "domain",
    "version",
    "usecaseId",
    "userId",
    "reportExists",
    "flowsTotal",
    "flowsCompleted",
    "flowsPassed",
    "flowsFailed",
    "passRate",
    "result",
] as const;

export type ExportColumn = (typeof EXPORT_COLUMNS)[number];

export type SessionResult = "PASS" | "FAIL" | "MIXED";

const RESULTS: SessionResult[] = ["PASS", "FAIL", "MIXED"];

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

export interface ParsedSessionQuery {
    match: Record<string, unknown>;
    result?: SessionResult;
    page: number;
    limit: number;
    sort: string;
    order: 1 | -1;
    errors: string[];
}

/**
 * True when the caller supplied any recognised filter/pagination param.
 *
 * This is what preserves backward compatibility: a bare GET /api/sessions/ with
 * no query string keeps returning the unbounded array the automation stack
 * already depends on.
 */
export function hasSessionFilterParams(query: unknown): boolean {
    if (!query || typeof query !== "object") return false;
    const keys = Object.keys(query as Record<string, unknown>);
    return keys.some((k) =>
        (SESSION_FILTER_PARAMS as readonly string[]).includes(k),
    );
}

const escapeRegex = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const asString = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

function parseDate(
    value: unknown,
    field: string,
    errors: string[],
): Date | undefined {
    const raw = asString(value);
    if (!raw) return undefined;

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
        errors.push(`${field} must be a valid ISO 8601 date`);
        return undefined;
    }
    return date;
}

function parseInteger(
    value: unknown,
    field: string,
    fallback: number,
    min: number,
    max: number,
    errors: string[],
): number {
    const raw = asString(value);
    if (raw === undefined) return fallback;

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        errors.push(`${field} must be an integer between ${min} and ${max}`);
        return fallback;
    }
    return parsed;
}

/**
 * Parses and validates the query string.
 *
 * Invalid input is collected into `errors` rather than thrown, so the caller
 * can answer 400 with every problem at once instead of one at a time.
 */
export function parseSessionQuery(query: unknown): ParsedSessionQuery {
    const q = (query ?? {}) as Record<string, unknown>;
    const errors: string[] = [];
    const match: Record<string, unknown> = {};

    // Exact-match scalar fields.
    for (const field of [
        "npType",
        "npId",
        "domain",
        "version",
        "sessionType",
        "usecaseId",
        "userId",
    ] as const) {
        const value = asString(q[field]);
        if (value !== undefined) match[field] = value;
    }

    // createdAt range.
    const from = parseDate(q.from, "from", errors);
    const to = parseDate(q.to, "to", errors);
    if (from || to) {
        const range: Record<string, Date> = {};
        if (from) range.$gte = from;
        if (to) range.$lte = to;
        match.createdAt = range;
    }
    if (from && to && from > to) errors.push("from must be earlier than to");

    // reportExists — accept only explicit true/false.
    const reportExists = asString(q.reportExists);
    if (reportExists !== undefined) {
        if (reportExists === "true") match.reportExists = true;
        else if (reportExists === "false")
            match.reportExists = { $ne: true };
        else errors.push('reportExists must be "true" or "false"');
    }

    // Partial sessionId search.
    const search = asString(q.q);
    if (search !== undefined) {
        match.sessionId = { $regex: escapeRegex(search), $options: "i" };
    }

    // result is derived from flowMap, so it cannot go in the initial $match —
    // it is applied after the $addFields stage.
    let result: SessionResult | undefined;
    const rawResult = asString(q.result);
    if (rawResult !== undefined) {
        const upper = rawResult.toUpperCase() as SessionResult;
        if (RESULTS.includes(upper)) result = upper;
        else errors.push(`result must be one of ${RESULTS.join(", ")}`);
    }

    const page = parseInteger(q.page, "page", 1, 1, Number.MAX_SAFE_INTEGER, errors);
    const limit = parseInteger(q.limit, "limit", DEFAULT_LIMIT, 1, MAX_LIMIT, errors);

    let sort = "createdAt";
    const rawSort = asString(q.sort);
    if (rawSort !== undefined) {
        if ((SORTABLE_FIELDS as readonly string[]).includes(rawSort)) {
            sort = rawSort;
        } else {
            errors.push(`sort must be one of ${SORTABLE_FIELDS.join(", ")}`);
        }
    }

    let order: 1 | -1 = -1;
    const rawOrder = asString(q.order);
    if (rawOrder !== undefined) {
        if (rawOrder === "asc") order = 1;
        else if (rawOrder === "desc") order = -1;
        else errors.push('order must be "asc" or "desc"');
    }

    return { match, result, page, limit, sort, order, errors };
}

/**
 * Computes the per-session fields the dashboard needs so the browser never has
 * to derive them from flows/flowMap itself.
 *
 * flowMap and flows are Schema.Types.Mixed and default to null, so both are
 * guarded before $objectToArray/$size — which throw on a non-object.
 */
export const SESSION_DERIVED_FIELDS: PipelineStage.AddFields = {
    $addFields: {
        flowsTotal: { $size: { $ifNull: ["$flows", []] } },
        flowsCompleted: {
            $size: {
                $filter: {
                    input: { $ifNull: ["$flows", []] },
                    as: "f",
                    cond: { $eq: ["$$f.status", "COMPLETED"] },
                },
            },
        },
        flowMapEntries: {
            $cond: [
                { $eq: [{ $type: "$flowMap" }, "object"] },
                { $objectToArray: "$flowMap" },
                [],
            ],
        },
    },
};

/** Second pass — needs flowMapEntries from the stage above. */
export const SESSION_RESULT_FIELDS: PipelineStage.AddFields = {
    $addFields: {
        flowsPassed: {
            $size: {
                $filter: {
                    input: "$flowMapEntries",
                    as: "e",
                    cond: { $eq: ["$$e.v", "PASS"] },
                },
            },
        },
        flowsFailed: {
            $size: {
                $filter: {
                    input: "$flowMapEntries",
                    as: "e",
                    cond: { $eq: ["$$e.v", "FAIL"] },
                },
            },
        },
    },
};

/**
 * Final pass — passRate over judged flows only, and the PASS/FAIL/MIXED verdict.
 *
 * passRate is deliberately the share of *judged* flows that passed, not of all
 * flows: a session with 3 passes and 7 flows still awaiting a verdict is at
 * 100%, not 43%. Sessions with nothing judged report null, never 0, so the
 * dashboard can distinguish "no results yet" from "everything failed".
 */
export const SESSION_VERDICT_FIELDS: PipelineStage.AddFields = {
    $addFields: {
        passRate: {
            $cond: [
                { $gt: [{ $add: ["$flowsPassed", "$flowsFailed"] }, 0] },
                {
                    $divide: [
                        "$flowsPassed",
                        { $add: ["$flowsPassed", "$flowsFailed"] },
                    ],
                },
                null,
            ],
        },
        result: {
            $switch: {
                branches: [
                    {
                        case: {
                            $eq: [
                                { $add: ["$flowsPassed", "$flowsFailed"] },
                                0,
                            ],
                        },
                        then: null,
                    },
                    {
                        case: { $eq: ["$flowsFailed", 0] },
                        then: "PASS",
                    },
                    {
                        case: { $eq: ["$flowsPassed", 0] },
                        then: "FAIL",
                    },
                ],
                default: "MIXED",
            },
        },
    },
};

/** Drops the intermediate array so it never reaches the client. */
export const SESSION_CLEANUP: PipelineStage.Project = {
    $project: { flowMapEntries: 0 },
};

/**
 * The shared head of every session pipeline: filter, then derive.
 * Callers append their own $sort/$skip/$limit or $group.
 */
export function buildSessionPipeline(
    parsed: ParsedSessionQuery,
): PipelineStage[] {
    const stages: PipelineStage[] = [
        { $match: parsed.match },
        SESSION_DERIVED_FIELDS,
        SESSION_RESULT_FIELDS,
        SESSION_VERDICT_FIELDS,
    ];

    if (parsed.result) {
        stages.push({ $match: { result: parsed.result } });
    }

    stages.push(SESSION_CLEANUP);
    return stages;
}

/**
 * Validates a `?columns=a,b,c` list against the whitelist.
 *
 * Returns the full default set when the param is absent.
 */
export function parseExportColumns(value: unknown): {
    columns: ExportColumn[];
    errors: string[];
} {
    const raw = asString(value);
    if (raw === undefined) return { columns: [...EXPORT_COLUMNS], errors: [] };

    const requested = raw
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

    const errors: string[] = [];
    const columns: ExportColumn[] = [];

    for (const column of requested) {
        if ((EXPORT_COLUMNS as readonly string[]).includes(column)) {
            columns.push(column as ExportColumn);
        } else {
            errors.push(`unknown column "${column}"`);
        }
    }

    if (columns.length === 0 && errors.length === 0) {
        errors.push("columns must name at least one column");
    }

    return { columns, errors };
}
