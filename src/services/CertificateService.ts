import { randomUUID } from "node:crypto";
import logger from "@ondc/automation-logger";
import {
    CERTIFICATE_ISSUER,
    CertificateFields,
    CertificateStatus,
    CertificateVerdict,
    CoverageStatus,
    ICertificateAppeal,
} from "../entity/Certificate";
import {
    CertificateRepository,
    CertificateSubject,
} from "../repositories/CertificateRepository";
import {
    AppealInput,
    GoLiveSubject,
    IssueCertificateInput,
    LapseCertificatesInput,
} from "../validation/certificates";
import { CanonicalizationError } from "../utils/canonicalJson";
import {
    AppealRecord,
    CertificateView,
    loadCertificationKey,
    SignatureFailure,
    signRecord,
    toAppealRecord,
    toCertificateRecord,
    toCertificateView,
    verifyRecord,
} from "./CertificateSigning";

// ---------------------- Errors ----------------------

export class CertificateNotFoundError extends Error {
    override name = "CertificateNotFoundError";
    constructor(certificateId: string) {
        super(`Certificate ${certificateId} not found`);
    }
}

/** The appeal cites a run or requirement that is not on the certificate. */
export class AppealRejectedError extends Error {
    override name = "AppealRejectedError";
    constructor(readonly errors: string[]) {
        super(errors.join("; "));
    }
}

/** The run summary holds a value with no canonical JSON form (e.g. a lone surrogate). */
export class CertificateInputError extends Error {
    override name = "CertificateInputError";
}

// ---------------------- The issuance rule ----------------------

export interface IssuanceDecision {
    verdict: CertificateVerdict;
    status: Extract<CertificateStatus, "VALID" | "REFUSED">;
    /** Why the run did not pass; empty on a pass. */
    reasons: string[];
}

interface IssuanceFacts {
    coverage: Record<
        string,
        { status: CoverageStatus; scenarios: string[]; evidence: string[] }
    >;
    findings: { requirementIds: string[]; rule: string }[];
    waivers: { requirementId: string }[];
}

/**
 * Fail-closed: PASS only if every requirement in coverage is PASS or WAIVED and
 * every finding is waived. Anything the rule does not positively accept
 * refuses the certificate. In detail:
 *
 * - empty coverage proves nothing, so it refuses;
 * - FAIL and NOT_COVERED refuse, even when a waiver exists for the ID (the run
 *   summary must say WAIVED);
 * - WAIVED needs a waiver recorded for that requirement ID;
 * - PASS needs at least one scenario and one piece of evidence (M7: missing
 *   evidence fails);
 * - a finding is waived only when every requirement ID it cites is waived, so
 *   a finding citing no ID can never be waived.
 */
export function evaluateIssuance(facts: IssuanceFacts): IssuanceDecision {
    const reasons: string[] = [];
    const waived = new Set(facts.waivers.map((w) => w.requirementId));
    const requirementIds = Object.keys(facts.coverage).sort();

    if (requirementIds.length === 0) {
        reasons.push("coverage is empty: no requirement was evidenced");
    }

    for (const id of requirementIds) {
        const entry = facts.coverage[id];
        switch (entry.status) {
            case "PASS":
                if (entry.scenarios.length === 0) {
                    reasons.push(`${id}: PASS cites no scenario`);
                }
                if (entry.evidence.length === 0) {
                    reasons.push(`${id}: PASS cites no evidence`);
                }
                break;
            case "WAIVED":
                if (!waived.has(id)) {
                    reasons.push(`${id}: WAIVED but no waiver is recorded for it`);
                }
                break;
            default:
                reasons.push(`${id}: ${entry.status}`);
        }
    }

    facts.findings.forEach((finding, index) => {
        if (finding.requirementIds.length === 0) {
            reasons.push(
                `finding ${index} (${finding.rule}): cites no requirement ID, so no waiver can cover it`,
            );
            return;
        }
        const unwaived = finding.requirementIds.filter((id) => !waived.has(id));
        if (unwaived.length > 0) {
            reasons.push(
                `finding ${index} (${finding.rule}): not waived for ${unwaived.join(", ")}`,
            );
        }
    });

    const pass = reasons.length === 0;
    return {
        verdict: pass ? "PASS" : "FAIL",
        status: pass ? "VALID" : "REFUSED",
        reasons,
    };
}

// ---------------------- Results ----------------------

export interface IssueResult {
    certificate: CertificateView;
    reasons: string[];
}

export interface VerificationResult {
    certificateId: string;
    /** The signature check only. A LAPSED certificate can still be validly signed. */
    signatureValid: boolean;
    reason?: SignatureFailure;
    keyId?: string;
    algorithm?: string;
    status: CertificateStatus;
    verdict: CertificateVerdict;
    subscriberId: string;
    role: string;
    domain: string;
    version: string;
    issuedAt: string;
    lapsedAt?: string;
}

export interface LapseResult {
    domain: string;
    specVersion: string;
    lapsed: number;
    certificateIds: string[];
    /** Lapsed, but not re-signed: their stored signature did not verify first. */
    notResigned: string[];
}

export type GoLiveReason =
    | "VALID_CERTIFICATE"
    | "NO_CERTIFICATE"
    | "CERTIFICATE_LAPSED"
    | "CERTIFICATE_REFUSED"
    | "CERTIFICATE_INVALID";

export interface GoLiveDecision {
    allowed: boolean;
    /** On allow, the certificate relied on; on deny, the one that was considered. */
    certificateId?: string;
    reason: GoLiveReason;
    detail: string;
}

// ---------------------- Service ----------------------

export class CertificateService {
    constructor(
        private readonly repo: CertificateRepository,
        private readonly now: () => Date = () => new Date(),
    ) {}

    /**
     * Applies the issuance rule to a run summary, signs the record and stores
     * it. A run that fails the rule is stored too, as REFUSED.
     */
    async issue(input: IssueCertificateInput): Promise<IssueResult> {
        const key = loadCertificationKey();
        const decision = evaluateIssuance(input);

        const fields: Omit<CertificateFields, "appeals" | "signature"> = {
            certificateId: randomUUID(),
            subscriberId: input.subscriberId,
            role: input.role,
            domain: input.domain,
            version: input.version,
            tableHash: input.tableHash,
            toolVersions: input.toolVersions,
            runs: input.runs.map((run) => ({
                sessionId: run.sessionId,
                flowId: run.flowId,
                transactionId: run.transactionId,
                startedAt: run.startedAt,
                finishedAt: run.finishedAt,
                ...(run.seed !== undefined ? { seed: run.seed } : {}),
            })),
            coverage: Object.keys(input.coverage)
                .sort()
                .map((requirementId) => ({
                    requirementId,
                    status: input.coverage[requirementId].status,
                    scenarios: input.coverage[requirementId].scenarios,
                    evidence: input.coverage[requirementId].evidence,
                })),
            findings: input.findings,
            waivers: input.waivers,
            verdict: decision.verdict,
            issuedAt: this.now(),
            issuer: CERTIFICATE_ISSUER,
            status: decision.status,
        };

        let signature;
        try {
            signature = signRecord(toCertificateRecord(fields), key);
        } catch (error) {
            if (error instanceof CanonicalizationError) {
                throw new CertificateInputError(error.message);
            }
            throw error;
        }

        const saved = await this.repo.create({ ...fields, signature });
        logger.info("FD certificate record stored", {
            certificateId: fields.certificateId,
            subscriberId: fields.subscriberId,
            role: fields.role,
            status: fields.status,
        });

        return {
            certificate: toCertificateView(saved.toObject()),
            reasons: decision.reasons,
        };
    }

    async getById(certificateId: string): Promise<CertificateView | null> {
        const doc = await this.repo.findByCertificateId(certificateId);
        return doc ? toCertificateView(doc) : null;
    }

    /** Filtered list, the latest VALID certificate first. */
    async list(subject: CertificateSubject): Promise<CertificateView[]> {
        const docs = await this.repo.list(subject);
        return docs.map(toCertificateView);
    }

    /** Recomputes the canonical record and checks it against the configured key. */
    async verify(certificateId: string): Promise<VerificationResult | null> {
        const doc = await this.repo.findByCertificateId(certificateId);
        if (!doc) return null;

        const key = loadCertificationKey();
        const record = toCertificateRecord(doc);
        const check = verifyRecord(record, key.publicKey, key.keyId);

        return {
            certificateId: record.certificateId,
            signatureValid: check.valid,
            ...(check.valid ? {} : { reason: check.reason }),
            keyId: record.signature?.keyId,
            algorithm: record.signature?.algorithm,
            status: record.status,
            verdict: record.verdict,
            subscriberId: record.subscriberId,
            role: record.role,
            domain: record.domain,
            version: record.version,
            issuedAt: record.issuedAt,
            ...(record.lapsedAt ? { lapsedAt: record.lapsedAt } : {}),
        };
    }

    /**
     * The re-run-scope rule: a spec change lapses every VALID certificate in
     * the domain whose coverage includes any requirement ID it touches. An
     * envelope/context change passes every ID; an editorial change passes none.
     *
     * The status is signed, so each lapsed record is re-signed, but only if its
     * current signature verifies: re-signing a tampered record would launder it.
     */
    async lapse(input: LapseCertificatesInput): Promise<LapseResult> {
        const touched = [...new Set(input.requirementIds)].sort();
        const result: LapseResult = {
            domain: input.domain,
            specVersion: input.version,
            lapsed: 0,
            certificateIds: [],
            notResigned: [],
        };
        if (touched.length === 0) return result;

        const key = loadCertificationKey();
        const candidates = await this.repo.findValidCovering(input.domain, touched);
        const lapsedAt = this.now();

        for (const doc of candidates) {
            const covered = new Set(doc.coverage.map((c) => c.requirementId));
            const lapseReason = {
                specVersion: input.version,
                requirementIds: touched.filter((id) => covered.has(id)),
            };
            if (lapseReason.requirementIds.length === 0) continue;

            const intact = verifyRecord(
                toCertificateRecord(doc),
                key.publicKey,
                key.keyId,
            ).valid;
            const signature = intact
                ? signRecord(
                      toCertificateRecord({
                          ...doc,
                          status: "LAPSED",
                          lapsedAt,
                          lapseReason,
                      }),
                      key,
                  )
                : undefined;
            if (!intact) {
                logger.error(
                    "FD certificate signature did not verify; lapsing without re-signing",
                    { certificateId: doc.certificateId },
                );
            }

            const changed = await this.repo.markLapsed(doc.certificateId, {
                lapsedAt,
                lapseReason,
                signature,
            });
            if (!changed) continue; // lapsed concurrently

            result.certificateIds.push(doc.certificateId);
            if (!intact) result.notResigned.push(doc.certificateId);
        }

        result.lapsed = result.certificateIds.length;
        logger.info("FD certificates lapsed", {
            domain: result.domain,
            specVersion: result.specVersion,
            certificateIds: result.certificateIds,
        });
        return result;
    }

    /**
     * Records an appeal, OPEN. It must cite a run on the certificate (by its
     * transactionId, or the sessionId that ran it) and a requirement ID the
     * certificate mentions (coverage, a finding or a waiver).
     */
    async addAppeal(
        certificateId: string,
        input: AppealInput,
    ): Promise<AppealRecord> {
        const doc = await this.repo.findByCertificateId(certificateId);
        if (!doc) throw new CertificateNotFoundError(certificateId);

        const runIds = new Set(
            doc.runs.flatMap((run) => [run.transactionId, run.sessionId]),
        );
        const requirementIds = new Set([
            ...doc.coverage.map((c) => c.requirementId),
            ...doc.findings.flatMap((f) => f.requirementIds),
            ...doc.waivers.map((w) => w.requirementId),
        ]);

        const errors: string[] = [];
        if (!runIds.has(input.runId)) {
            errors.push(`runId: ${input.runId} is not a run on this certificate`);
        }
        if (!requirementIds.has(input.requirementId)) {
            errors.push(
                `requirementId: ${input.requirementId} is not on this certificate`,
            );
        }
        if (errors.length > 0) throw new AppealRejectedError(errors);

        const appeal: ICertificateAppeal = {
            appealId: randomUUID(),
            runId: input.runId,
            requirementId: input.requirementId,
            statement: input.statement,
            raisedBy: input.raisedBy,
            raisedAt: this.now(),
            status: "OPEN",
        };
        const updated = await this.repo.addAppeal(certificateId, appeal);
        if (!updated) throw new CertificateNotFoundError(certificateId);

        return toAppealRecord(appeal);
    }

    /**
     * The onboarding gate. Allowed only on a VALID, PASS certificate from N-04
     * whose signature verifies. Any VALID certificate for the subject counts:
     * a later failed re-run does not revoke one (phase 1 has no breach), only
     * a lapse does.
     */
    async goLive(subject: GoLiveSubject): Promise<GoLiveDecision> {
        const docs = await this.repo.findForSubject(
            subject.subscriberId,
            subject.domain,
            subject.role,
        );
        if (docs.length === 0) {
            return {
                allowed: false,
                reason: "NO_CERTIFICATE",
                detail: `No FD certification record for ${subject.subscriberId} as ${subject.role} in ${subject.domain}`,
            };
        }

        const valid = docs.filter((doc) => doc.status === "VALID");
        if (valid.length > 0) {
            const key = loadCertificationKey();
            const problems: string[] = [];
            for (const doc of valid) {
                if (doc.verdict !== "PASS" || doc.issuer !== CERTIFICATE_ISSUER) {
                    problems.push(
                        `${doc.certificateId}: VALID with verdict ${doc.verdict} from ${doc.issuer}`,
                    );
                    continue;
                }
                const check = verifyRecord(
                    toCertificateRecord(doc),
                    key.publicKey,
                    key.keyId,
                );
                if (check.valid) {
                    if (problems.length > 0) {
                        logger.error("FD certificate failed go-live integrity checks", {
                            subscriberId: subject.subscriberId,
                            problems,
                        });
                    }
                    return {
                        allowed: true,
                        certificateId: doc.certificateId,
                        reason: "VALID_CERTIFICATE",
                        detail: `Certificate for ${doc.domain} ${doc.version}, issued ${doc.issuedAt.toISOString()}`,
                    };
                }
                problems.push(`${doc.certificateId}: ${check.reason}`);
            }
            logger.error("FD certificate failed go-live integrity checks", {
                subscriberId: subject.subscriberId,
                problems,
            });
            return {
                allowed: false,
                certificateId: valid[0].certificateId,
                reason: "CERTIFICATE_INVALID",
                detail: `A VALID certificate exists but failed its integrity check (${problems.join("; ")})`,
            };
        }

        const latest = docs[0];
        if (latest.status === "LAPSED") {
            const ids = latest.lapseReason?.requirementIds ?? [];
            return {
                allowed: false,
                certificateId: latest.certificateId,
                reason: "CERTIFICATE_LAPSED",
                detail: `Lapsed by spec version ${latest.lapseReason?.specVersion ?? "unknown"}, which changed ${ids.join(", ") || "requirements"} it covered; re-run the affected scenarios`,
            };
        }
        return {
            allowed: false,
            certificateId: latest.certificateId,
            reason: "CERTIFICATE_REFUSED",
            detail: "The latest run did not meet the issuance rule",
        };
    }
}
