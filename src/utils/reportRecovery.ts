/**
 * Recovery for reports written by the old, broken saveToGridFS.
 *
 * The bug: `Buffer.from(dataUri, "base64")` was run over the WHOLE data URI.
 * Node's base64 decoder skips characters outside the alphabet — ":" ";" "," —
 * but "/" and "+" ARE in the alphabet, so `data:text/html;base64,` collapsed to
 * the 19 literal characters below and was decoded as if it were payload.
 *
 * The good news: that is a deterministic, reversible transform apart from the
 * final byte. Re-encoding the stored bytes reproduces the original character
 * stream; dropping the known prefix and decoding the remainder returns the
 * original HTML with only its last byte mangled or missing — because
 * 19 + len(base64) is rarely a multiple of 4, so the trailing bits were
 * truncated on the way in.
 *
 * Reports end in `</html>`, so that last byte is repairable with confidence.
 */

/** What `data:text/html;base64,` degrades to under a lenient base64 decode. */
const CORRUPT_PREFIX = "datatext/htmlbase64";

export type RecoveryStatus = "already-valid" | "recovered" | "unrecoverable";

export interface RecoveryResult {
    status: RecoveryStatus;
    /** Present unless the status is "unrecoverable". */
    html?: string;
}

export function looksLikeHtml(text: string): boolean {
    const head = text.slice(0, 500).toLowerCase();
    return head.includes("<html") || head.includes("<!doctype html");
}

/**
 * Repairs the trailing byte lost to base64 misalignment by rebuilding the
 * closing tag. Falls back to dropping the single known-bad byte.
 */
function repairTail(html: string): string {
    const idx = html.lastIndexOf("</html");
    if (idx === -1) return html.slice(0, -1);
    return `${html.slice(0, idx)}</html>`;
}

/**
 * Classifies a GridFS blob and recovers it where possible.
 *
 * Blobs written after the encoding fix are plain HTML bytes and pass straight
 * through as "already-valid".
 */
export function recoverReportBytes(stored: Buffer): RecoveryResult {
    const asText = stored.toString("utf8");
    if (looksLikeHtml(asText)) {
        return { status: "already-valid", html: asText };
    }

    const stream = stored.toString("base64");
    if (!stream.startsWith(CORRUPT_PREFIX)) {
        return { status: "unrecoverable" };
    }

    const decoded = Buffer.from(
        stream.slice(CORRUPT_PREFIX.length),
        "base64",
    ).toString("utf8");

    if (!looksLikeHtml(decoded)) {
        return { status: "unrecoverable" };
    }

    return { status: "recovered", html: repairTail(decoded) };
}
