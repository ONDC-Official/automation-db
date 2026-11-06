import { Schema, model, Document } from "mongoose";
import { SessionType } from "./ActionEnums";
import { SessionResult } from "../utils/sessionResult";

export interface IFlow {
  id: string;
  status: "PENDING" | "COMPLETED";
  payloads?: string[];
}

export interface IFlowSummaryEntry {
  total: number;
  completed: number;
}

export interface ISessionDetails extends Document {
  sessionId: string;
  npType: string;
  sessionType: SessionType;
  version?: string | null;
  npId?: string | null;
  domain?: string | null;
  usecaseId?: string | null;
  userId?: string | null;
  // NP Portal organisation the session was run for (Login via ONDC only).
  orgId?: string | null;
  flows?: IFlow[];
  reportExists?: boolean;
  // flow_summary: per-tag summary (MANDATORY, OPTIONAL, REPORTABLE)
  // Nullable: the schema below defaults it to null, not undefined.
  flowSummary?: Record<string, IFlowSummaryEntry> | null;
  // flowMap: per-flow pass/fail result — nullable for the same reason.
  flowMap?: Record<string, "PASS" | "FAIL"> | null;
  // NP Portal API. Separate from updatedAt, which the dashboard sorts and exports.
  lastActivityAt?: Date | null;
  // Flows with a saved message; flows[] does not record this.
  flowIds?: string[];
  // Latest-try outcome, unlike flowMap's report verdicts.
  result?: SessionResult;
  // Time of the newest message `result` was worked out from.
  resultAsOf?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const FlowSchema = new Schema<IFlow>(
  {
    id: { type: String, required: true },
    status: { type: String, enum: ["PENDING", "COMPLETED"], required: true },
    payloads: [{ type: String }],
  },
  { _id: false }
);

const SessionDetailsSchema = new Schema<ISessionDetails>(
  {
    sessionId: { type: String, required: true },
    npType: { type: String, required: true },
    sessionType: { type: String, required: true },
    version: { type: String },
    npId: { type: String },
    domain: { type: String },
    usecaseId: { type: String },
    userId: { type: String },
    orgId: { type: String },
    flows: [FlowSchema],
    reportExists: { type: Boolean, default: false },
    flowSummary: { type: Schema.Types.Mixed, default: null },
    flowMap: { type: Schema.Types.Mixed, default: null },
    lastActivityAt: { type: Date },
    flowIds: [{ type: String }],
    result: {
      type: String,
      enum: ["passed", "failed", "incomplete"],
      default: "incomplete",
    },
    resultAsOf: { type: Date },
  },
  { timestamps: true }
);

// Indexes for the business dashboard's filter/aggregate queries. Without these
// every dashboard request is a full collection scan.
//
// sessionId is NOT unique: upsertSession assumes uniqueness but the schema never
// enforced it, so production may already hold duplicates. Promote to unique only
// after auditing for them.
SessionDetailsSchema.index({ sessionId: 1 });
SessionDetailsSchema.index({ userId: 1 });
// Lists an organisation's sessions, newest first (NP Portal APIs).
SessionDetailsSchema.index({ orgId: 1, createdAt: -1 });
// The NP Portal list's common filters, its activity filters and its flow filter.
SessionDetailsSchema.index({ orgId: 1, npId: 1, npType: 1, domain: 1, createdAt: -1 });
SessionDetailsSchema.index({ orgId: 1, lastActivityAt: -1 });
SessionDetailsSchema.index({ orgId: 1, flowIds: 1 });
SessionDetailsSchema.index({ npId: 1 });
SessionDetailsSchema.index({ domain: 1 });
SessionDetailsSchema.index({ version: 1 });
SessionDetailsSchema.index({ createdAt: -1 });
// Covers the common dashboard filter: domain + version, newest first.
SessionDetailsSchema.index({ domain: 1, version: 1, createdAt: -1 });
// Covers the /filter route's four-field exact match.
SessionDetailsSchema.index({ npType: 1, npId: 1, domain: 1, version: 1 });
// Covers the participants rollup: group by npId over a date window. The plain
// { npId: 1 } index above cannot serve the range as well.
SessionDetailsSchema.index({ npId: 1, createdAt: -1 });

export const SessionDetails = model<ISessionDetails>("SessionDetails", SessionDetailsSchema);

