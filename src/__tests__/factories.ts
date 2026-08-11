import { SessionDetails, ISessionDetails } from "../entity/SessionDetails";
import { Payload } from "../entity/Payload";
import { Report } from "../entity/Reports";
import { UserModel } from "../entity/User";

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
