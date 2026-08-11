/**
 * Query-param parsing for the reports list, mirroring sessionFilters.ts.
 *
 * Kept separate rather than generalised: reports filter on different fields
 * (test_id, user_id) and a shared abstraction would have to know about both
 * anyway.
 */
import { parseDateBound } from "./dateRange";

/** Params that switch GET /report/ out of legacy bare-array mode. */
export const REPORT_FILTER_PARAMS = [
    "userId",
    "q",
    "from",
    "to",
    "page",
    "limit",
    "sort",
    "order",
] as const;

export const REPORT_SORTABLE_FIELDS = [
    "createdAt",
    "updatedAt",
    "test_id",
    "total_tests",
    "passed_tests",
] as const;

export const DEFAULT_REPORT_LIMIT = 50;
export const MAX_REPORT_LIMIT = 500;

export interface ParsedReportQuery {
    match: Record<string, unknown>;
    page: number;
    limit: number;
    sort: string;
    order: 1 | -1;
    errors: string[];
}

export function hasReportFilterParams(query: unknown): boolean {
    if (!query || typeof query !== "object") return false;
    return Object.keys(query as Record<string, unknown>).some((k) =>
        (REPORT_FILTER_PARAMS as readonly string[]).includes(k),
    );
}

const escapeRegex = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const asString = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

export function parseReportQuery(query: unknown): ParsedReportQuery {
    const q = (query ?? {}) as Record<string, unknown>;
    const errors: string[] = [];
    const match: Record<string, unknown> = {};

    const userId = asString(q.userId);
    if (userId !== undefined) match.user_id = userId;

    const search = asString(q.q);
    if (search !== undefined) {
        match.test_id = { $regex: escapeRegex(search), $options: "i" };
    }

    const from = parseDateBound(q.from, "from", "start", errors);
    const to = parseDateBound(q.to, "to", "end", errors);
    if (from || to) {
        const range: Record<string, Date> = {};
        if (from) range.$gte = from;
        if (to) range.$lte = to;
        match.createdAt = range;
    }
    if (from && to && from > to) errors.push("from must be earlier than to");

    const parseInteger = (
        value: unknown,
        field: string,
        fallback: number,
        min: number,
        max: number,
    ): number => {
        const raw = asString(value);
        if (raw === undefined) return fallback;
        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
            errors.push(`${field} must be an integer between ${min} and ${max}`);
            return fallback;
        }
        return parsed;
    };

    const page = parseInteger(q.page, "page", 1, 1, Number.MAX_SAFE_INTEGER);
    const limit = parseInteger(
        q.limit,
        "limit",
        DEFAULT_REPORT_LIMIT,
        1,
        MAX_REPORT_LIMIT,
    );

    let sort = "createdAt";
    const rawSort = asString(q.sort);
    if (rawSort !== undefined) {
        if ((REPORT_SORTABLE_FIELDS as readonly string[]).includes(rawSort)) {
            sort = rawSort;
        } else {
            errors.push(
                `sort must be one of ${REPORT_SORTABLE_FIELDS.join(", ")}`,
            );
        }
    }

    let order: 1 | -1 = -1;
    const rawOrder = asString(q.order);
    if (rawOrder !== undefined) {
        if (rawOrder === "asc") order = 1;
        else if (rawOrder === "desc") order = -1;
        else errors.push('order must be "asc" or "desc"');
    }

    return { match, page, limit, sort, order, errors };
}
