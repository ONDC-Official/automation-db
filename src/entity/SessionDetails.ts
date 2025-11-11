import { Schema, model, Document } from "mongoose";
import { SessionType } from "./ActionEnums";

export interface IFlow {
  id: string;
  status: "PENDING" | "COMPLETED";
  payloads?: string[];
}

export interface ISessionDetails extends Document {
  sessionId: string;
  npType: string;        
  sessionType: SessionType;
  version?: string | null;
  npId?: string | null;
  domain?: string | null;
  userId?: string | null;
  flows?: IFlow[];
  reportExists?: boolean;
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
    userId: { type: String },
    flows: [FlowSchema],
    reportExists: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const SessionDetails = model<ISessionDetails>("SessionDetails", SessionDetailsSchema);
