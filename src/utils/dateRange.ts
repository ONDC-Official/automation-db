/**
 * Shared parsing for the `from`/`to` query bounds.
 *
 * The subtlety is the upper bound. A bare `YYYY-MM-DD` names a whole day, but
 * `new Date("2026-08-11")` is UTC *midnight* — so using it directly as `$lte`
 * matches only documents created in that single millisecond and silently drops
 * the other 86 399 999 of the day. With the dashboard's "Today" preset, which
 * sends `from` and `to` as the same date, that collapsed the window to zero
 * width and the page came back empty however many sessions ran that day.
 *
 * So a date-only upper bound is widened to the last instant of its day. A bound
 * that already carries a time is trusted exactly as given, which keeps the
 * precise `?to=2026-06-15T00:00:00Z` form callers already rely on.
 *
 * Both bounds are UTC days. A caller in a non-UTC zone that wants its own
 * midnight must send explicit instants rather than a bare date.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type DateBound = "start" | "end";

export function parseDateBound(
    value: unknown,
    field: string,
    bound: DateBound,
    errors: string[],
): Date | undefined {
    const raw =
        typeof value === "string" && value.trim() !== ""
            ? value.trim()
            : undefined;
    if (!raw) return undefined;

    // Only the end bound moves: a date-only `from` is already the first instant
    // of its day, which is what $gte wants.
    const iso =
        bound === "end" && DATE_ONLY.test(raw) ? `${raw}T23:59:59.999Z` : raw;

    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        errors.push(`${field} must be a valid ISO 8601 date`);
        return undefined;
    }
    return date;
}
