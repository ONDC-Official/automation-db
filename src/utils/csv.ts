/**
 * Minimal RFC 4180 CSV writing.
 *
 * Deliberately dependency-free and streaming-friendly: the export endpoint
 * writes rows straight to the response as the Mongo cursor yields them, so a
 * large export never has to be held in memory.
 */

/**
 * Quotes a value only when it needs it, and doubles embedded quotes.
 *
 * A leading =, +, - or @ is prefixed with a single quote: spreadsheet software
 * treats those as formulas, which is a CSV-injection vector when the data came
 * from an external network participant.
 */
export function csvEscape(value: unknown): string {
    if (value === null || value === undefined) return "";

    let text: string;
    if (value instanceof Date) text = value.toISOString();
    else if (typeof value === "object") text = JSON.stringify(value);
    else text = String(value);

    if (/^[=+\-@]/.test(text)) text = `'${text}`;

    if (/[",\r\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

export function csvRow(values: unknown[]): string {
    return `${values.map(csvEscape).join(",")}\r\n`;
}

/** Reads a dotted path so nested fields can be exported as columns. */
export function pluck(source: Record<string, unknown>, path: string): unknown {
    return path
        .split(".")
        .reduce<unknown>(
            (acc, key) =>
                acc && typeof acc === "object"
                    ? (acc as Record<string, unknown>)[key]
                    : undefined,
            source,
        );
}
