import mongoose from "mongoose";

const PayloadSchema = new mongoose.Schema(
  {
    data: { type: Object, required: true },
  },
  { timestamps: true }
);

export const MongoPayload = mongoose.model("MongoPayload", PayloadSchema);
