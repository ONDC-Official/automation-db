import { z } from "zod";
import { CERTIFICATE_ROLES, COVERAGE_STATUSES } from "../entity/Certificate";

/**
 * Request shapes for /certificates. Server-owned fields (certificateId,
 * verdict, status, issuer, issuedAt, signature, appeals) are not accepted from
 * the caller: unknown keys are stripped, and the server computes them.
 */

const text = z.string().min(1);

/** Requirement IDs, scenario IDs and the like: non-empty, no whitespace. */
const identifier = z
    .string()
    .max(256)
    .regex(/^\S+$/, "must be non-empty and contain no whitespace");

/** An ISO-8601 timestamp with a zone, stored as a Date. */
const timestamp = z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value));

// toolVersions is stored as a mongoose Map, whose keys cannot contain "." or
// start with "$".
const toolName = z
    .string()
    .regex(/^[^.$][^.]*$/, "must not contain '.' or start with '$'");

const runSchema = z
    .object({
        sessionId: text,
        flowId: text,
        transactionId: text,
        startedAt: timestamp,
        finishedAt: timestamp,
        seed: text.optional(),
    })
    .refine((run) => run.finishedAt.getTime() >= run.startedAt.getTime(), {
        message: "finishedAt is before startedAt",
        path: ["finishedAt"],
    });

const coverageEntrySchema = z.object({
    status: z.enum(COVERAGE_STATUSES),
    scenarios: z.array(identifier).default([]),
    evidence: z.array(text).default([]),
});

const findingSchema = z.object({
    requirementIds: z.array(identifier).default([]),
    rule: text,
    errorCode: text.optional(),
    fieldPath: text.optional(),
    detail: text,
    messageId: text.optional(),
    action: text.optional(),
});

const waiverSchema = z.object({
    requirementId: identifier,
    reason: text,
    approvedBy: text,
    approvedAt: timestamp,
});

/** POST /certificates: a run summary to issue (or refuse) a certificate from. */
export const IssueCertificateRequest = z.object({
    subscriberId: text,
    role: z.enum(CERTIFICATE_ROLES),
    domain: text,
    version: text,
    tableHash: text,
    toolVersions: z
        .record(toolName, text)
        .refine((versions) => Object.keys(versions).length > 0, {
            message: "at least one tool version is required",
        }),
    runs: z.array(runSchema).min(1),
    coverage: z.record(identifier, coverageEntrySchema),
    findings: z.array(findingSchema).default([]),
    waivers: z.array(waiverSchema).default([]),
});
export type IssueCertificateInput = z.output<typeof IssueCertificateRequest>;

/** POST /certificates/lapse. An editorial change sends no requirement IDs. */
export const LapseCertificatesRequest = z.object({
    domain: text,
    version: text,
    requirementIds: z.array(identifier),
});
export type LapseCertificatesInput = z.output<typeof LapseCertificatesRequest>;

/** POST /certificates/:id/appeals. */
export const AppealRequest = z.object({
    runId: text,
    requirementId: identifier,
    statement: text.max(10_000),
    raisedBy: text,
});
export type AppealInput = z.output<typeof AppealRequest>;

/** GET /certificates. Every filter is optional. */
export const ListCertificatesQuery = z.object({
    subscriberId: text.optional(),
    domain: text.optional(),
    role: z.enum(CERTIFICATE_ROLES).optional(),
});
export type ListCertificatesFilter = z.output<typeof ListCertificatesQuery>;

/** GET /certificates/go-live. Every parameter is required. */
export const GoLiveQuery = z.object({
    subscriberId: text,
    domain: text,
    role: z.enum(CERTIFICATE_ROLES),
});
export type GoLiveSubject = z.output<typeof GoLiveQuery>;

/** Zod issues as "path: message" lines, as ProtocolController reports them. */
export function formatIssues(error: z.ZodError): string[] {
    return error.issues.map(
        (issue) =>
            `${issue.path.length ? issue.path.join(".") : "(root)"}: ${issue.message}`,
    );
}
