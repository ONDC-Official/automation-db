/**
 * The participants CSV: the same columns the participants table shows, with the
 * same text in every cell.
 *
 * mirrors: frontend/src/lib/utils.ts — formatNumber, formatDateTime, formatPercent
 * mirrors: frontend/src/pages/participants/constants.ts — TABLE_COLUMNS
 *
 * Duplicated rather than shared because the two live in separate services, the
 * same trade npFilters.ts already makes against lib/npFilters.ts. What is NOT
 * duplicated is the locale: both sides format "en-IN", so the only thing that
 * could make the file disagree with the screen is the zone, which the client
 * sends as `tz`.
 */

import { ParticipantRow } from "../repositories/SessionDetailsRepository";

/** Same em dash the table renders for an absent figure. */
const EM_DASH = "—";

export function formatNumber(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value))
        return EM_DASH;
    return new Intl.NumberFormat("en-IN").format(value);
}

export function formatDateTime(
    value: Date | string | null | undefined,
    timeZone: string,
): string {
    if (!value) return EM_DASH;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return EM_DASH;
    return new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone,
    }).format(date);
}

/** A 0..1 fraction as "94.2%". Null is "nothing judged", never "0.0%". */
export function formatPercent(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value))
        return EM_DASH;
    return `${(value * 100).toFixed(1)}%`;
}

export interface ParticipantCsvColumn {
    header: string;
    value: (row: ParticipantRow, timeZone: string) => string;
}

/** In table order — the CSV is meant to be read next to the page. */
export const PARTICIPANT_CSV_COLUMNS: ParticipantCsvColumn[] = [
    { header: "Participant", value: (row) => row.host },
    // Rendered as a row of badges on screen; there is no separator to mirror.
    { header: "Role", value: (row) => (row.npTypes ?? []).join(" ") },
    { header: "Sessions", value: (row) => formatNumber(row.sessions) },
    {
        header: "First session",
        value: (row, tz) => formatDateTime(row.firstSessionAt, tz),
    },
    {
        // "Never" is a real state — a session was created but no payload ever
        // arrived — and the table says so with a badge rather than an em dash.
        header: "First payload",
        value: (row, tz) =>
            row.firstPayloadAt ? formatDateTime(row.firstPayloadAt, tz) : "Never",
    },
    {
        header: "Flows attempted",
        value: (row) => formatNumber(row.flowsAttempted),
    },
    { header: "Flows judged", value: (row) => formatNumber(row.flowsJudged) },
    { header: "Passed", value: (row) => formatNumber(row.flowsPassed) },
    { header: "Failed", value: (row) => formatNumber(row.flowsFailed) },
    { header: "Pass rate", value: (row) => formatPercent(row.passRate) },
];

export const PARTICIPANT_CSV_HEADERS = PARTICIPANT_CSV_COLUMNS.map(
    (column) => column.header,
);

export function participantCsvValues(
    row: ParticipantRow,
    timeZone: string,
): string[] {
    return PARTICIPANT_CSV_COLUMNS.map((column) => column.value(row, timeZone));
}
