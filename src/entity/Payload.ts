import { Schema, model, Types } from "mongoose";

const PayloadSchema = new Schema(
  {
    messageId: { type: String },
    transactionId: { type: String },
    flowId: { type: String },
    payloadId: { type: String, required: true, unique: true },
    action: { type: String },
    bppId: { type: String },
    bapId: { type: String },
    reqHeader: { type: String },
    jsonRequest: { type: Object },  // plain JSON object
    jsonResponse: { type: Object }, // plain JSON object
    httpStatus: { type: Number },
    action_id: { type: String },

    // Explicit session_id key referencing SessionDetails
    session_id: { type: Types.ObjectId, ref: "SessionDetails", required: true },
  },
  { timestamps: true }
);

// Index for faster queries by session
PayloadSchema.index({ session_id: 1 });

export const Payload = model("Payload", PayloadSchema);
