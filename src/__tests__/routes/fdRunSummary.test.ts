import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { useApi } from "../helpers/api";

/**
 * The FD report service's run summaries, through this service's issuance rule.
 *
 * The fixtures are what automation-report-service posts (its
 * src/fd/__tests__/certification.test.ts writes them when
 * FD_SUMMARY_FIXTURE_DIR is set): a full BOOKING certification run of an
 * issuer against @ondc/fd-contract's real plan (65 requirement IDs, 7 flows),
 * every flow judged with no finding and every SLA met on enough samples; and the same run without one plan flow, which the report service
 * records as a certification.missing-flow finding. VALID must come exactly when
 * the plan is fully covered and nothing was found.
 */

const { get, post } = useApi();

type Summary = {
    subscriberId: string;
    coverage: Record<string, { status: string; scenarios: string[]; evidence: string[] }>;
    findings: { requirementIds: string[]; rule: string; detail: string; action?: string }[];
    runs: unknown[];
};

const load = (name: string): Summary =>
    JSON.parse(
        readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8"),
    ) as Summary;

const goLive = (subscriberId: string) =>
    get(
        `/certificates/go-live?subscriberId=${encodeURIComponent(subscriberId)}&domain=${encodeURIComponent("ONDC:FIS14:FD")}&role=DEPOSIT_ISSUER`,
    );

describe("POST /certificates with the FD report service's run summary", () => {
    it("issues VALID for a full BOOKING run with every requirement PASS and no finding", async () => {
        const summary = load("fd-run-summary-valid.json");
        expect(summary.findings).toEqual([]);
        expect(summary.runs).toHaveLength(7);

        const res = await post("/certificates").send(summary);

        expect(res.status).toBe(201);
        expect(res.body.reasons).toEqual([]);
        expect(res.body.certificate).toMatchObject({
            subscriberId: "fd.examplebank.in",
            role: "DEPOSIT_ISSUER",
            status: "VALID",
            verdict: "PASS",
        });
        expect(Object.keys(res.body.certificate.coverage).sort()).toEqual(
            Object.keys(summary.coverage).sort(),
        );
        expect((await goLive("fd.examplebank.in")).body).toMatchObject({
            allowed: true,
            reason: "VALID_CERTIFICATE",
        });
    });

    it("refuses the run without a plan flow: the missing-flow finding cites no requirement, so no waiver covers it", async () => {
        const summary = load("fd-run-summary-missing-flow.json");

        const res = await post("/certificates").send({
            ...summary,
            subscriberId: "fd.missing-flow.example",
        });

        expect(res.status).toBe(201);
        expect(res.body.certificate).toMatchObject({ status: "REFUSED", verdict: "FAIL" });
        expect(res.body.reasons).toEqual([
            "finding 0 (certification.missing-flow): cites no requirement ID, so no waiver can cover it",
        ]);
        expect((await goLive("fd.missing-flow.example")).body).toMatchObject({
            allowed: false,
            reason: "CERTIFICATE_REFUSED",
        });
    });

    it.each([
        [
            "a requirement the run did not cover",
            (s: Summary): Summary => {
                const [first] = Object.keys(s.coverage);
                return {
                    ...s,
                    coverage: {
                        ...s.coverage,
                        [first]: { status: "NOT_COVERED", scenarios: [], evidence: [] },
                    },
                };
            },
            /: NOT_COVERED$/,
        ],
        [
            "an SLA row that is not a pass",
            (s: Summary): Summary => ({
                ...s,
                findings: [
                    {
                        requirementIds: [],
                        rule: "sla.answer-time",
                        detail: "quote_request: P95 answer time 3500 ms over 25 samples exceeds the limit",
                        action: "quote_request",
                    },
                ],
            }),
            /^finding 0 \(sla\.answer-time\): cites no requirement ID/,
        ],
    ])("refuses the full run with %s", async (_what, change, reason) => {
        const res = await post("/certificates").send(
            change(load("fd-run-summary-valid.json")),
        );

        expect(res.status).toBe(201);
        expect(res.body.certificate.status).toBe("REFUSED");
        expect(res.body.reasons).toHaveLength(1);
        expect(res.body.reasons[0]).toMatch(reason);
    });
});
