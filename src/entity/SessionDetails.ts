import { Schema, model, Document } from "mongoose";
import { SessionType } from "./ActionEnums";

export interface ISessionDetails {
  sessionId: string;
  npType: string;        
  sessionType: SessionType;
  version?: string | null;
  npId?: string | null;
  domain?: string | null;
  reportExists?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const SessionDetailsSchema = new Schema<ISessionDetails>(
  {
    sessionId: { type: String, required: true },
    npType: { type: String, required: true },
    sessionType: { type: String, required: true },
    version: { type: String },
    npId: { type: String },
    domain: { type: String },
    reportExists: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const SessionDetails = model<ISessionDetails>("SessionDetails", SessionDetailsSchema);
