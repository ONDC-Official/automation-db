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
    sessionId: { type: String, required: true },
  },
  { timestamps: true }
);

// Index for faster queries by session
PayloadSchema.index({ sessionId: 1 });

/**
 * The participants rollup looks payloads up per session and reduces them to a
 * min(createdAt) plus a set of flowIds. Carrying createdAt in the index keeps
 * that sub-pipeline off the documents themselves, which hold full request and
 * response bodies.
 */
PayloadSchema.index({ sessionId: 1, createdAt: 1, flowId: 1 });

export const Payload = model("Payload", PayloadSchema);
