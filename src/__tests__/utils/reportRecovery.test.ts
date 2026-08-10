import { describe, expect, it } from "vitest";
import { looksLikeHtml, recoverReportBytes } from "../../utils/reportRecovery";

/** Reproduces exactly what the old saveToGridFS wrote to GridFS. */
const corruptAsOldCodeDid = (html: string): Buffer =>
    Buffer.from(
        `data:text/html;base64,${Buffer.from(html).toString("base64")}`,
        "base64",
    );

const report = (body: string) => `<html><body>${body}</body></html>`;

describe("looksLikeHtml", () => {
    it("accepts an html document", () => {
        expect(looksLikeHtml(report("x"))).toBe(true);
    });

    it("accepts a doctype-prefixed document", () => {
        expect(looksLikeHtml("<!DOCTYPE html><html></html>")).toBe(true);
    });

    it("rejects binary garbage", () => {
        expect(looksLikeHtml("u�Z��m�f")).toBe(false);
    });
});

describe("recoverReportBytes", () => {
    it("passes through blobs written after the fix", () => {
        const html = report("fresh");
        const result = recoverReportBytes(Buffer.from(html));

        expect(result.status).toBe("already-valid");
        expect(result.html).toBe(html);
    });

    it("recovers a corrupted report exactly", () => {
        const html = report("report");
        const result = recoverReportBytes(corruptAsOldCodeDid(html));

        expect(result.status).toBe("recovered");
        expect(result.html).toBe(html);
    });

    // The prefix bug was silent precisely because "/" and "+" are valid base64
    // characters, so exercise a payload full of them.
    it("recovers content containing base64-significant characters", () => {
        const html = report('<a href="/a/b?x=1+2">link</a>');
        const result = recoverReportBytes(corruptAsOldCodeDid(html));

        expect(result.status).toBe("recovered");
        expect(result.html).toBe(html);
    });

    // 19 prefix chars + len(base64) is rarely a multiple of 4, so the exact
    // amount of trailing damage varies with payload length. Sweep the residues.
    it.each([0, 1, 2, 3, 4, 5, 6, 7])(
        "recovers exactly at payload length residue %i",
        (extra) => {
            const html = report("z".repeat(500 + extra));
            const result = recoverReportBytes(corruptAsOldCodeDid(html));

            expect(result.status).toBe("recovered");
            expect(result.html).toBe(html);
        },
    );

    it("recovers a large realistic report", () => {
        const html = `<!DOCTYPE html><html><head><title>PW_session</title></head><body>${"<div class='test'>passed</div>".repeat(200)}</body></html>`;
        const result = recoverReportBytes(corruptAsOldCodeDid(html));

        expect(result.status).toBe("recovered");
        expect(result.html).toBe(html);
    });

    it("reports unrecoverable for bytes that are neither html nor prefixed", () => {
        const result = recoverReportBytes(Buffer.from([0x00, 0x01, 0x02, 0x03]));

        expect(result.status).toBe("unrecoverable");
        expect(result.html).toBeUndefined();
    });
});
