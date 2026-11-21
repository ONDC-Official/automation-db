import { Schema, model, Document } from "mongoose";

/**
 * FD go-live certification records (ONDC:FIS14:FD).
 *
 * Every issuance attempt is stored, pass or fail: a record whose run did not
 * meet the issuance rule is kept with status REFUSED, so it exists but is not a
 * certificate. Only a VALID record lets a participant go live.
 */

/** The collection every FD certification record lives in, issued or refused. */
export const CERTIFICATES_COLLECTION = "certificates";

/** Who issues FD certificates. Fixed: issuance is automatic on a full pass. */
export const CERTIFICATE_ISSUER = "N-04 NETWORK_ADMIN";

/** The only signature algorithm a certificate may carry. */
export const CERTIFICATE_SIGNATURE_ALGORITHM = "ed25519";

export const CERTIFICATE_ROLES = ["INVESTOR_APP", "DEPOSIT_ISSUER"] as const;
export type CertificateRole = (typeof CERTIFICATE_ROLES)[number];

export const COVERAGE_STATUSES = ["PASS", "FAIL", "WAIVED", "NOT_COVERED"] as const;
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

export const CERTIFICATE_VERDICTS = ["PASS", "FAIL"] as const;
export type CertificateVerdict = (typeof CERTIFICATE_VERDICTS)[number];

export const CERTIFICATE_STATUSES = ["VALID", "LAPSED", "REFUSED"] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

/** Appeals are only raised here; resolving them belongs to the certificate process. */
export const APPEAL_STATUSES = ["OPEN"] as const;
export type AppealStatus = (typeof APPEAL_STATUSES)[number];

export interface ICertificateRun {
  sessionId: string;
  flowId: string;
  transactionId: string;
  startedAt: Date;
  finishedAt: Date;
  seed?: string;
}

/**
 * One requirement's result. Stored as an array entry keyed by requirementId
 * (not a Map) so lapse can find certificates covering an ID with an index.
 * The API and the signed record present coverage as requirementId → entry.
 */
export interface ICoverageEntry {
  requirementId: string;
  status: CoverageStatus;
  scenarios: string[];
  /** Payload / message IDs that evidence the result. */
  evidence: string[];
}

export interface ICertificateFinding {
  requirementIds: string[];
  rule: string;
  errorCode?: string;
  fieldPath?: string;
  detail: string;
  messageId?: string;
  action?: string;
}

export interface ICertificateWaiver {
  requirementId: string;
  reason: string;
  approvedBy: string;
  approvedAt: Date;
}

export interface ILapseReason {
  specVersion: string;
  requirementIds: string[];
}

export interface ICertificateSignature {
  keyId: string;
  algorithm: typeof CERTIFICATE_SIGNATURE_ALGORITHM;
  /** Base64 Ed25519 signature over the record's RFC 8785 canonical form. */
  value: string;
}

export interface ICertificateAppeal {
  appealId: string;
  runId: string;
  requirementId: string;
  statement: string;
  raisedBy: string;
  raisedAt: Date;
  status: AppealStatus;
}

/** The stored fields, without mongoose's Document members (lean reads). */
export interface CertificateFields {
  certificateId: string;
  subscriberId: string;
  role: CertificateRole;
  domain: string;
  version: string;
  /** Hash of the FD route table the run used. */
  tableHash: string;
  /** Free-form: build-tools, code generator, api-service-generator, plugins ref, ONIX image, fd-contract. */
  toolVersions: Map<string, string> | Record<string, string>;
  runs: ICertificateRun[];
  coverage: ICoverageEntry[];
  findings: ICertificateFinding[];
  waivers: ICertificateWaiver[];
  verdict: CertificateVerdict;
  issuedAt: Date;
  issuer: typeof CERTIFICATE_ISSUER;
  status: CertificateStatus;
  lapsedAt?: Date;
  lapseReason?: ILapseReason;
  signature: ICertificateSignature;
  /** Not part of the signed record: participants' statements, not N-04's. */
  appeals: ICertificateAppeal[];
}

export interface ICertificate extends CertificateFields, Document {}

const RunSchema = new Schema<ICertificateRun>(
  {
    sessionId: { type: String, required: true },
    flowId: { type: String, required: true },
    transactionId: { type: String, required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    seed: { type: String },
  },
  { _id: false }
);

const CoverageEntrySchema = new Schema<ICoverageEntry>(
  {
    requirementId: { type: String, required: true },
    status: { type: String, enum: COVERAGE_STATUSES, required: true },
    scenarios: [{ type: String }],
    evidence: [{ type: String }],
  },
  { _id: false }
);

const FindingSchema = new Schema<ICertificateFinding>(
  {
    requirementIds: [{ type: String }],
    rule: { type: String, required: true },
    errorCode: { type: String },
    fieldPath: { type: String },
    detail: { type: String, required: true },
    messageId: { type: String },
    action: { type: String },
  },
  { _id: false }
);

const WaiverSchema = new Schema<ICertificateWaiver>(
  {
    requirementId: { type: String, required: true },
    reason: { type: String, required: true },
    approvedBy: { type: String, required: true },
    approvedAt: { type: Date, required: true },
  },
  { _id: false }
);

const LapseReasonSchema = new Schema<ILapseReason>(
  {
    specVersion: { type: String, required: true },
    requirementIds: [{ type: String }],
  },
  { _id: false }
);

const SignatureSchema = new Schema<ICertificateSignature>(
  {
    keyId: { type: String, required: true },
    algorithm: {
      type: String,
      enum: [CERTIFICATE_SIGNATURE_ALGORITHM],
      required: true,
    },
    value: { type: String, required: true },
  },
  { _id: false }
);

const AppealSchema = new Schema<ICertificateAppeal>(
  {
    appealId: { type: String, required: true },
    runId: { type: String, required: true },
    requirementId: { type: String, required: true },
    statement: { type: String, required: true },
    raisedBy: { type: String, required: true },
    raisedAt: { type: Date, required: true },
    status: { type: String, enum: APPEAL_STATUSES, required: true },
  },
  { _id: false }
);

const CertificateSchema = new Schema<ICertificate>(
  {
    certificateId: { type: String, required: true, unique: true },
    subscriberId: { type: String, required: true },
    role: { type: String, enum: CERTIFICATE_ROLES, required: true },
    domain: { type: String, required: true },
    version: { type: String, required: true },
    tableHash: { type: String, required: true },
    toolVersions: { type: Map, of: String, required: true },
    runs: [RunSchema],
    coverage: [CoverageEntrySchema],
    findings: [FindingSchema],
    waivers: [WaiverSchema],
    verdict: { type: String, enum: CERTIFICATE_VERDICTS, required: true },
    issuedAt: { type: Date, required: true },
    issuer: { type: String, enum: [CERTIFICATE_ISSUER], required: true },
    status: { type: String, enum: CERTIFICATE_STATUSES, required: true },
    lapsedAt: { type: Date },
    lapseReason: { type: LapseReasonSchema },
    signature: { type: SignatureSchema, required: true },
    appeals: [AppealSchema],
  },
  { timestamps: true }
);

// The go-live check and the list: one participant's certificates, newest first.
CertificateSchema.index({ subscriberId: 1, domain: 1, role: 1, issuedAt: -1 });
// Lapse: the VALID certificates in a domain that cover any of a set of IDs.
CertificateSchema.index({ domain: 1, status: 1, "coverage.requirementId": 1 });

export const Certificate = model<ICertificate>(
  "Certificate",
  CertificateSchema,
  CERTIFICATES_COLLECTION
);
