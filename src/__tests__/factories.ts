import { SessionDetails, ISessionDetails } from "../entity/SessionDetails";
import { Payload } from "../entity/Payload";
import { Report } from "../entity/Reports";
import { UserModel } from "../entity/User";
import { CertificateRepository } from "../repositories/CertificateRepository";
import { CertificateService } from "../services/CertificateService";
import { IssueCertificateRequest } from "../validation/certificates";

let counter = 0;
const uniq = (prefix: string) => `${prefix}-${++counter}`;

/**
 * Builders that return plain objects. Every field has a sane default so a test
 * only states the fields it actually cares about.
 */

export function sessionData(
    overrides: Partial<ISessionDetails> = {},
): Record<string, unknown> {
    return {
        sessionId: uniq("session"),
        npType: "BAP",
        sessionType: "AUTOMATION",
        version: "2.1.0",
        npId: "https://buyer.example.com",
        domain: "ONDC:FIS10",
        usecaseId: "usecase-1",
        userId: "github-user-1",
        flows: [],
        reportExists: false,
        ...overrides,
    };
}

export function payloadData(
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    const payloadId = uniq("payload");
    return {
        payloadId,
        sessionId: uniq("session"),
        messageId: uniq("message"),
        transactionId: uniq("transaction"),
        flowId: "flow-1",
        action: "search",
        bapId: "buyer.example.com",
        bppId: "seller.example.com",
        httpStatus: 200,
        action_id: uniq("action"),
        reqHeader: "signature-header",
        jsonRequest: {
            context: {
                domain: "ONDC:FIS10",
                version: "2.1.0",
                action: "search",
            },
        },
        jsonResponse: { message: { ack: { status: "ACK" } } },
        ...overrides,
    };
}

export function reportData(
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        test_id: uniq("PW_session"),
        user_id: "github-user-1",
        total_tests: 10,
        passed_tests: 8,
        flow_summary: {
            MANDATORY: { total: 5, completed: 5 },
            OPTIONAL: { total: 5, completed: 3 },
        },
        ...overrides,
    };
}

export function userData(
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        githubId: uniq("github-user"),
        participantId: uniq("participant"),
        sessionIds: [],
        ...overrides,
    };
}

/**
 * A full-pass FD run summary in the shape `POST /certificates` accepts: three
 * requirements, all PASS with scenarios and evidence, no findings.
 */
export function certificateRequest(
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        subscriberId: "issuer.example.com",
        role: "DEPOSIT_ISSUER",
        domain: "ONDC:FIS14:FD",
        version: "0.1.4",
        tableHash: "sha256:5f1c0d2e",
        toolVersions: {
            "build-tools": "0.0.32",
            "ondc-code-generator": "1.1.2",
            "api-service-generator": "1.1.2",
            plugins: "6c1a9e0",
            onix: "sha256:ab12cd34",
            "fd-contract": "0.1.0",
        },
        runs: [
            {
                sessionId: "session-fd-1",
                flowId: "FD_BOOKING",
                transactionId: "txn-fd-1",
                startedAt: "2026-10-29T10:00:00.000Z",
                finishedAt: "2026-10-29T10:20:00.000Z",
                seed: "c0ffee",
            },
        ],
        coverage: {
            "FD-PRD-04": {
                status: "PASS",
                scenarios: ["booking-happy-path"],
                evidence: ["msg-1", "msg-2"],
            },
            "FD-PRD-05": {
                status: "PASS",
                scenarios: ["booking-happy-path"],
                evidence: ["msg-3"],
            },
            "FD-MOD-05": {
                status: "PASS",
                scenarios: ["modification"],
                evidence: ["msg-4"],
            },
        },
        findings: [],
        waivers: [],
        ...overrides,
    };
}

/**
 * Issues through the service with a fixed clock, for tests that need records
 * in a known issuedAt order. Signed with the test key from vitest.config.mts.
 */
export async function issueCertificate(
    overrides: Record<string, unknown> = {},
    issuedAt: Date = new Date(),
) {
    const service = new CertificateService(
        new CertificateRepository(),
        () => issuedAt,
    );
    const input = IssueCertificateRequest.parse(certificateRequest(overrides));
    return (await service.issue(input)).certificate;
}

/** Persist helpers — use when a test needs the document to already exist. */

export const seedSession = (overrides: Partial<ISessionDetails> = {}) =>
    SessionDetails.create(sessionData(overrides));

export const seedPayload = (overrides: Record<string, unknown> = {}) =>
    Payload.create(payloadData(overrides));

export const seedReport = (overrides: Record<string, unknown> = {}) =>
    Report.create(reportData(overrides));

export const seedUser = (overrides: Record<string, unknown> = {}) =>
    UserModel.create(userData(overrides));

/** A base64 data URI in the shape `POST /report/:testId` accepts. */
export const htmlDataUri = (html = "<html><body>report</body></html>") =>
    `data:text/html;base64,${Buffer.from(html).toString("base64")}`;
