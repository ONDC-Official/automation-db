import { Schema, model, Document } from "mongoose";
import { SessionType } from "./ActionEnums";

export interface ISessionDetails {
  session_id: string;
  np_type: string;        // or enum
  session_type: SessionType;   // or enum
  version?: string | null;
  np_id?: string | null;
  domain?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const SessionDetailsSchema = new Schema<ISessionDetails>(
  {
    session_id: { type: String, required: true },
    np_type: { type: String, required: true },
    session_type: { type: String, required: true },
    version: { type: String },
    np_id: { type: String },
    domain: { type: String }
  },
  { timestamps: true }
);

export const SessionDetails = model<ISessionDetails>("SessionDetails", SessionDetailsSchema);
