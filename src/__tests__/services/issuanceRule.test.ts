import { describe, expect, it } from "vitest";
import { evaluateIssuance } from "../../services/CertificateService";

/**
 * The issuance rule, fail-closed: PASS only when every requirement in coverage
 * is PASS or WAIVED and every finding is waived. Anything else is REFUSED.
 */

const pass = (evidence = ["msg-1"]) => ({
    status: "PASS" as const,
    scenarios: ["s-1"],
    evidence,
});

const waiver = (requirementId: string) => ({ requirementId });

describe("evaluateIssuance", () => {
    it("passes when every requirement is PASS and there are no findings", () => {
        expect(
            evaluateIssuance({
                coverage: { "FD-PRD-04": pass(), "FD-PRD-05": pass() },
                findings: [],
                waivers: [],
            }),
        ).toEqual({ verdict: "PASS", status: "VALID", reasons: [] });
    });

    it("passes with a WAIVED requirement and a finding, both covered by waivers", () => {
        const decision = evaluateIssuance({
            coverage: {
                "FD-PRD-04": pass(),
                "FD-NFR-02": { status: "WAIVED", scenarios: [], evidence: [] },
            },
            findings: [{ requirementIds: ["FD-NFR-02"], rule: "sla.p95" }],
            waivers: [waiver("FD-NFR-02")],
        });

        expect(decision.verdict).toBe("PASS");
        expect(decision.status).toBe("VALID");
    });

    it.each(["FAIL", "NOT_COVERED"] as const)(
        "refuses a %s requirement, even if a waiver exists for it",
        (status) => {
            const decision = evaluateIssuance({
                coverage: {
                    "FD-PRD-04": pass(),
                    "FD-PRD-05": { status, scenarios: ["s-1"], evidence: [] },
                },
                findings: [],
                waivers: [waiver("FD-PRD-05")],
            });

            expect(decision).toEqual({
                verdict: "FAIL",
                status: "REFUSED",
                reasons: [`FD-PRD-05: ${status}`],
            });
        },
    );

    it("refuses WAIVED without a recorded waiver", () => {
        const decision = evaluateIssuance({
            coverage: { "FD-PRD-04": { status: "WAIVED", scenarios: [], evidence: [] } },
            findings: [],
            waivers: [waiver("FD-PRD-05")],
        });

        expect(decision.status).toBe("REFUSED");
        expect(decision.reasons).toEqual([
            "FD-PRD-04: WAIVED but no waiver is recorded for it",
        ]);
    });

    it("refuses an unwaived finding, naming the unwaived IDs", () => {
        const decision = evaluateIssuance({
            coverage: { "FD-PRD-04": pass(), "FD-PRD-05": pass() },
            findings: [
                { requirementIds: ["FD-PRD-04", "FD-PRD-05"], rule: "version.bump" },
            ],
            waivers: [waiver("FD-PRD-04")],
        });

        expect(decision.status).toBe("REFUSED");
        expect(decision.reasons).toEqual([
            "finding 0 (version.bump): not waived for FD-PRD-05",
        ]);
    });

    it("refuses a finding that cites no requirement ID, since nothing can waive it", () => {
        const decision = evaluateIssuance({
            coverage: { "FD-PRD-04": pass() },
            findings: [{ requirementIds: [], rule: "transport" }],
            waivers: [waiver("FD-PRD-04")],
        });

        expect(decision.status).toBe("REFUSED");
        expect(decision.reasons[0]).toMatch(/cites no requirement ID/);
    });

    it("refuses empty coverage", () => {
        expect(
            evaluateIssuance({ coverage: {}, findings: [], waivers: [] }).reasons,
        ).toEqual(["coverage is empty: no requirement was evidenced"]);
    });

    it("refuses a PASS with no scenario or no evidence (missing evidence fails)", () => {
        const decision = evaluateIssuance({
            coverage: {
                "FD-PRD-04": pass([]),
                "FD-PRD-05": { status: "PASS", scenarios: [], evidence: ["msg-1"] },
            },
            findings: [],
            waivers: [],
        });

        expect(decision.reasons).toEqual([
            "FD-PRD-04: PASS cites no evidence",
            "FD-PRD-05: PASS cites no scenario",
        ]);
    });
});
