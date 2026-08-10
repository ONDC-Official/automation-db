import { Schema, model, Document } from "mongoose";
import { SessionType } from "./ActionEnums";

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
  flows?: IFlow[];
  reportExists?: boolean;
  // flow_summary: per-tag summary (MANDATORY, OPTIONAL, REPORTABLE)
  // Nullable: the schema below defaults it to null, not undefined.
  flowSummary?: Record<string, IFlowSummaryEntry> | null;
  // flowMap: per-flow pass/fail result — nullable for the same reason.
  flowMap?: Record<string, "PASS" | "FAIL"> | null;
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
    flows: [FlowSchema],
    reportExists: { type: Boolean, default: false },
    flowSummary: { type: Schema.Types.Mixed, default: null },
    flowMap: { type: Schema.Types.Mixed, default: null },
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

