/**
 * Query-param parsing and the shared identity expression for the participants
 * view, mirroring sessionFilters.ts.
 *
 * Kept separate rather than generalised, for the same reason reportFilters.ts
 * is: participants filter on a *derived* key (the subscriber host) that no other
 * endpoint has, and a shared abstraction would have to know about all three
 * anyway.
 */

/** Params that the participants endpoints recognise. */
export const NP_FILTER_PARAMS = [
    "from",
    "to",
    "npType",
    "domain",
    "version",
    "sessionType",
    "q",
    "page",
    "limit",
    "sort",
    "order",
] as const;

/**
 * Sort keys a client may ask for. All of these are produced by the $group, so
 * they are applied after it — unlike the session list, none of them is a stored
 * field.
 */
export const NP_SORTABLE_FIELDS = [
    "host",
    "sessions",
    "firstSessionAt",
    "lastSessionAt",
    "firstPayloadAt",
    "flowsAttempted",
    "flowsJudged",
    "flowsPassed",
    "passRate",
] as const;

/**
 * Hosts that are ours, not a Network Participant's.
 *
 * The workbench appears in `bap_uri`/`bpp_uri` whenever it proxies for a
 * participant under test, so without this it ranks among the busiest
 * "participants" while describing nobody.
 */
export const EXCLUDED_HOSTS = ["workbench.ondc.tech"] as const;

export const DEFAULT_NP_LIMIT = 50;
export const MAX_NP_LIMIT = 500;

export interface ParsedNpQuery {
    /** Applied to session documents, before the host is derived. */
    match: Record<string, unknown>;
    /** Partial host match — derived, so it cannot go in the initial $match. */
    hostSearch?: string;
    page: number;
    limit: number;
    sort: string;
    order: 1 | -1;
    errors: string[];
}

const escapeRegex = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const asString = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

/**
 * The subscriber host of a URL, as an aggregation expression.
 *
 * A participant is identified by the host of its subscriber URL — `npId` on a
 * session, `context.bap_uri`/`bpp_uri` on a payload. Deliberately NOT the
 * `bapId`/`bppId` columns: those carry the registered ONDC subscriber id, which
 * disagrees with the URI host on roughly half of the payloads in this database
 * (the workbench proxies, so the id and the callback endpoint differ). Keying on
 * one and joining on the other would silently split participants in two.
 *
 * Port is kept, matching `URL.host`. Verified against every session in the
 * local database with zero disagreements against `new URL(x).host`.
 */
export const hostExpr = (field: string): Record<string, unknown> => ({
    $let: {
        vars: {
            bare: {
                $replaceAll: {
                    input: {
                        $replaceAll: {
                            input: {
                                // $toLower errors outright on a non-string, and
                                // npId reaches us from an upsert that does not
                                // always cast — so the type is checked, not
                                // assumed. $ifNull alone would not catch a
                                // number or an object here.
                                $toLower: {
                                    $cond: [
                                        { $eq: [{ $type: field }, "string"] },
                                        field,
                                        "",
                                    ],
                                },
                            },
                            find: "https://",
                            replacement: "",
                        },
                    },
                    find: "http://",
                    replacement: "",
                },
            },
        },
        in: {
            $let: {
                vars: {
                    h: { $arrayElemAt: [{ $split: ["$$bare", "/"] }, 0] },
                },
                // "" would otherwise become a participant of its own.
                in: { $cond: [{ $eq: ["$$h", ""] }, null, "$$h"] },
            },
        },
    },
});

/**
 * Parses and validates the query string.
 *
 * Invalid input is collected into `errors` rather than thrown, so the caller can
 * answer 400 with every problem at once — same contract as parseSessionQuery.
 */
export function parseNpQuery(query: unknown): ParsedNpQuery {
    const q = (query ?? {}) as Record<string, unknown>;
    const errors: string[] = [];
    const match: Record<string, unknown> = {};

    // Exact-match session fields. A participant is a group of sessions, so
    // filtering here narrows which sessions count toward each participant.
    for (const field of [
        "npType",
        "domain",
        "version",
        "sessionType",
    ] as const) {
        const value = asString(q[field]);
        if (value !== undefined) match[field] = value;
    }

    const parseDate = (value: unknown, field: string): Date | undefined => {
        const raw = asString(value);
        if (!raw) return undefined;
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) {
            errors.push(`${field} must be a valid ISO 8601 date`);
            return undefined;
        }
        return date;
    };

    const from = parseDate(q.from, "from");
    const to = parseDate(q.to, "to");
    if (from || to) {
        const range: Record<string, Date> = {};
        if (from) range.$gte = from;
        if (to) range.$lte = to;
        match.createdAt = range;
    }
    if (from && to && from > to) errors.push("from must be earlier than to");

    // Host is computed by the pipeline, so this is applied after $addFields.
    const hostSearch = asString(q.q);

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
        DEFAULT_NP_LIMIT,
        1,
        MAX_NP_LIMIT,
    );

    let sort: string = "sessions";
    const rawSort = asString(q.sort);
    if (rawSort !== undefined) {
        if ((NP_SORTABLE_FIELDS as readonly string[]).includes(rawSort)) {
            sort = rawSort;
        } else {
            errors.push(`sort must be one of ${NP_SORTABLE_FIELDS.join(", ")}`);
        }
    }

    let order: 1 | -1 = -1;
    const rawOrder = asString(q.order);
    if (rawOrder !== undefined) {
        if (rawOrder === "asc") order = 1;
        else if (rawOrder === "desc") order = -1;
        else errors.push('order must be "asc" or "desc"');
    }

    return {
        match,
        hostSearch: hostSearch && escapeRegex(hostSearch),
        page,
        limit,
        sort,
        order,
        errors,
    };
}
