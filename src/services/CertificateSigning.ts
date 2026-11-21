import {
    createPrivateKey,
    createPublicKey,
    KeyObject,
    sign,
    verify,
} from "node:crypto";
import {
    CERTIFICATE_ISSUER,
    CERTIFICATE_SIGNATURE_ALGORITHM,
    CertificateFields,
    CertificateRole,
    CertificateStatus,
    CertificateVerdict,
    CoverageStatus,
    ICertificateAppeal,
    ICertificateSignature,
} from "../entity/Certificate";
import { canonicalize } from "../utils/canonicalJson";

/**
 * Signing and verification of FD certification records.
 *
 * What is signed: the record (see `toCertificateRecord`) without its
 * `signature`, in RFC 8785 canonical form, as UTF-8, with Ed25519. Dates are
 * ISO-8601 UTC strings with milliseconds and coverage is a map keyed by
 * requirement ID, exactly as the API returns them.
 *
 * Not signed: appeals (participants' statements, appended without re-signing)
 * and Mongo bookkeeping (_id, __v, createdAt, updatedAt).
 *
 * Status is signed, so a lapse re-signs the record. Flipping a stored record
 * from LAPSED or REFUSED back to VALID without the key breaks its signature,
 * and the go-live check verifies the signature before it allows anything.
 */

// ---------------------- The signed record ----------------------

export interface CertificateRunRecord {
    sessionId: string;
    flowId: string;
    transactionId: string;
    startedAt: string;
    finishedAt: string;
    seed?: string;
}

export interface CoverageRecord {
    status: CoverageStatus;
    scenarios: string[];
    evidence: string[];
}

export interface FindingRecord {
    requirementIds: string[];
    rule: string;
    errorCode?: string;
    fieldPath?: string;
    detail: string;
    messageId?: string;
    action?: string;
}

export interface WaiverRecord {
    requirementId: string;
    reason: string;
    approvedBy: string;
    approvedAt: string;
}

export interface UnsignedCertificateRecord {
    certificateId: string;
    subscriberId: string;
    role: CertificateRole;
    domain: string;
    version: string;
    tableHash: string;
    toolVersions: Record<string, string>;
    runs: CertificateRunRecord[];
    coverage: Record<string, CoverageRecord>;
    findings: FindingRecord[];
    waivers: WaiverRecord[];
    verdict: CertificateVerdict;
    issuedAt: string;
    issuer: typeof CERTIFICATE_ISSUER;
    status: CertificateStatus;
    lapsedAt?: string;
    lapseReason?: { specVersion: string; requirementIds: string[] };
}

export interface CertificateRecord extends UnsignedCertificateRecord {
    signature: ICertificateSignature;
}

export interface AppealRecord {
    appealId: string;
    runId: string;
    requirementId: string;
    statement: string;
    raisedBy: string;
    raisedAt: string;
    status: ICertificateAppeal["status"];
}

/** The API's view: the signed record plus its appeals. */
export interface CertificateView extends CertificateRecord {
    appeals: AppealRecord[];
}

const iso = (value: Date | string): string => new Date(value).toISOString();

/** Copies an optional string member only when it holds a string (null and undefined are absent). */
function optional<K extends string>(
    key: K,
    value: unknown,
): Partial<Record<K, string>> {
    return typeof value === "string"
        ? ({ [key]: value } as Record<K, string>)
        : {};
}

function toPlainStringMap(
    value: Map<string, string> | Record<string, string> | undefined | null,
): Record<string, string> {
    if (!value) return {};
    const entries =
        value instanceof Map ? [...value.entries()] : Object.entries(value);
    return Object.fromEntries(
        entries.filter(([, v]) => typeof v === "string"),
    );
}

/**
 * The record as signed and served, built field by field from a stored
 * certificate (lean or hydrated), so nothing Mongo adds can enter the
 * signature. Issuance and verification both go through here.
 */
export function toCertificateRecord(
    doc: Omit<CertificateFields, "appeals" | "signature"> & {
        signature?: ICertificateSignature | null;
    },
): UnsignedCertificateRecord & { signature?: ICertificateSignature } {
    const coverage: Record<string, CoverageRecord> = {};
    for (const entry of [...(doc.coverage ?? [])].sort((a, b) =>
        a.requirementId < b.requirementId ? -1 : a.requirementId > b.requirementId ? 1 : 0,
    )) {
        coverage[entry.requirementId] = {
            status: entry.status,
            scenarios: [...(entry.scenarios ?? [])],
            evidence: [...(entry.evidence ?? [])],
        };
    }

    return {
        certificateId: doc.certificateId,
        subscriberId: doc.subscriberId,
        role: doc.role,
        domain: doc.domain,
        version: doc.version,
        tableHash: doc.tableHash,
        toolVersions: toPlainStringMap(doc.toolVersions),
        runs: (doc.runs ?? []).map((run) => ({
            sessionId: run.sessionId,
            flowId: run.flowId,
            transactionId: run.transactionId,
            startedAt: iso(run.startedAt),
            finishedAt: iso(run.finishedAt),
            ...optional("seed", run.seed),
        })),
        coverage,
        findings: (doc.findings ?? []).map((finding) => ({
            requirementIds: [...(finding.requirementIds ?? [])],
            rule: finding.rule,
            ...optional("errorCode", finding.errorCode),
            ...optional("fieldPath", finding.fieldPath),
            detail: finding.detail,
            ...optional("messageId", finding.messageId),
            ...optional("action", finding.action),
        })),
        waivers: (doc.waivers ?? []).map((waiver) => ({
            requirementId: waiver.requirementId,
            reason: waiver.reason,
            approvedBy: waiver.approvedBy,
            approvedAt: iso(waiver.approvedAt),
        })),
        verdict: doc.verdict,
        issuedAt: iso(doc.issuedAt),
        issuer: doc.issuer,
        status: doc.status,
        ...(doc.lapsedAt ? { lapsedAt: iso(doc.lapsedAt) } : {}),
        ...(doc.lapseReason
            ? {
                  lapseReason: {
                      specVersion: doc.lapseReason.specVersion,
                      requirementIds: [...(doc.lapseReason.requirementIds ?? [])],
                  },
              }
            : {}),
        ...(doc.signature
            ? {
                  signature: {
                      keyId: doc.signature.keyId,
                      algorithm: doc.signature.algorithm,
                      value: doc.signature.value,
                  },
              }
            : {}),
    };
}

export function toAppealRecord(appeal: ICertificateAppeal): AppealRecord {
    return {
        appealId: appeal.appealId,
        runId: appeal.runId,
        requirementId: appeal.requirementId,
        statement: appeal.statement,
        raisedBy: appeal.raisedBy,
        raisedAt: iso(appeal.raisedAt),
        status: appeal.status,
    };
}

export function toCertificateView(doc: CertificateFields): CertificateView {
    return {
        ...(toCertificateRecord(doc) as CertificateRecord),
        appeals: (doc.appeals ?? []).map(toAppealRecord),
    };
}

/** The exact bytes the signature covers: the canonical record without `signature`. */
export function signingPayload(
    record: UnsignedCertificateRecord & { signature?: unknown },
): Buffer {
    const { signature: _signature, ...unsigned } = record;
    const text = canonicalize(unsigned);
    if (text === undefined) {
        throw new Error("Certificate record has no canonical form");
    }
    return Buffer.from(text, "utf8");
}

// ---------------------- The certification key ----------------------

/** Raised when FD_CERT_SIGNING_KEY / FD_CERT_KEY_ID are missing or malformed. */
export class CertificationKeyError extends Error {
    override name = "CertificationKeyError";
}

export interface CertificationKey {
    keyId: string;
    privateKey: KeyObject;
    publicKey: KeyObject;
    /** The raw 32-byte Ed25519 public key, base64. */
    publicKeyBase64: string;
}

// DER prefixes that wrap a raw 32-byte Ed25519 key (RFC 8410).
const PKCS8_ED25519_PREFIX = Buffer.from(
    "302e020100300506032b657004220420",
    "hex",
);
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const STRICT_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function decodeKeyBytes(value: string, what: string): Buffer {
    const trimmed = value.trim();
    if (!STRICT_BASE64.test(trimmed) || trimmed.length % 4 !== 0) {
        throw new CertificationKeyError(`${what} is not base64`);
    }
    const bytes = Buffer.from(trimmed, "base64");
    if (bytes.length !== 32) {
        throw new CertificationKeyError(
            `${what} must decode to 32 bytes, got ${bytes.length}`,
        );
    }
    return bytes;
}

/** An Ed25519 public key from its raw 32 bytes, base64. */
export function publicKeyFromBase64(raw: string): KeyObject {
    return createPublicKey({
        key: Buffer.concat([
            SPKI_ED25519_PREFIX,
            decodeKeyBytes(raw, "Public key"),
        ]),
        format: "der",
        type: "spki",
    });
}

/** An Ed25519 key pair from a 32-byte seed, base64. */
export function keyFromSeed(seedBase64: string, keyId: string): CertificationKey {
    const seed = decodeKeyBytes(seedBase64, "FD_CERT_SIGNING_KEY");
    const privateKey = createPrivateKey({
        key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
        format: "der",
        type: "pkcs8",
    });
    const publicKey = createPublicKey(privateKey);
    const spki = publicKey.export({ format: "der", type: "spki" });
    return {
        keyId,
        privateKey,
        publicKey,
        publicKeyBase64: spki.subarray(spki.length - 32).toString("base64"),
    };
}

let cached: { seed: string; keyId: string; key: CertificationKey } | undefined;

/**
 * The certification key from the environment. Read on every call (cheaply,
 * through a cache keyed by the values) so a rotated env takes effect and
 * tests can change it. This key is the Network Admin's, not any of the
 * workbench's mock identities.
 */
export function loadCertificationKey(
    env: NodeJS.ProcessEnv = process.env,
): CertificationKey {
    const seed = env.FD_CERT_SIGNING_KEY;
    const keyId = env.FD_CERT_KEY_ID?.trim();
    if (!seed) {
        throw new CertificationKeyError("FD_CERT_SIGNING_KEY is not set");
    }
    if (!keyId) {
        throw new CertificationKeyError("FD_CERT_KEY_ID is not set");
    }
    if (cached && cached.seed === seed && cached.keyId === keyId) {
        return cached.key;
    }
    const key = keyFromSeed(seed, keyId);
    cached = { seed, keyId, key };
    return key;
}

// ---------------------- Sign and verify ----------------------

export function signRecord(
    record: UnsignedCertificateRecord,
    key: CertificationKey,
): ICertificateSignature {
    return {
        keyId: key.keyId,
        algorithm: CERTIFICATE_SIGNATURE_ALGORITHM,
        value: sign(null, signingPayload(record), key.privateKey).toString(
            "base64",
        ),
    };
}

export type SignatureFailure =
    | "SIGNATURE_MISSING"
    | "ALGORITHM_UNSUPPORTED"
    | "KEY_ID_MISMATCH"
    | "SIGNATURE_MALFORMED"
    | "SIGNATURE_MISMATCH";

export type SignatureCheck =
    | { valid: true }
    | { valid: false; reason: SignatureFailure };

/**
 * Recomputes the canonical record and checks its signature.
 *
 * `publicKey` is a KeyObject or a raw 32-byte Ed25519 public key in base64.
 * With `expectedKeyId`, a signature made under any other key ID fails
 * (KEY_ID_MISMATCH) rather than being checked against the wrong key.
 */
export function verifyRecord(
    record: UnsignedCertificateRecord & {
        signature?: ICertificateSignature | null;
    },
    publicKey: KeyObject | string,
    expectedKeyId?: string,
): SignatureCheck {
    const signature = record.signature;
    if (!signature || !signature.value) {
        return { valid: false, reason: "SIGNATURE_MISSING" };
    }
    if (signature.algorithm !== CERTIFICATE_SIGNATURE_ALGORITHM) {
        return { valid: false, reason: "ALGORITHM_UNSUPPORTED" };
    }
    if (expectedKeyId !== undefined && signature.keyId !== expectedKeyId) {
        return { valid: false, reason: "KEY_ID_MISMATCH" };
    }
    if (!STRICT_BASE64.test(signature.value)) {
        return { valid: false, reason: "SIGNATURE_MALFORMED" };
    }
    const bytes = Buffer.from(signature.value, "base64");
    if (bytes.length !== 64) {
        return { valid: false, reason: "SIGNATURE_MALFORMED" };
    }
    const key =
        typeof publicKey === "string" ? publicKeyFromBase64(publicKey) : publicKey;
    let ok: boolean;
    try {
        ok = verify(null, signingPayload(record), key, bytes);
    } catch {
        return { valid: false, reason: "SIGNATURE_MISMATCH" };
    }
    return ok ? { valid: true } : { valid: false, reason: "SIGNATURE_MISMATCH" };
}
