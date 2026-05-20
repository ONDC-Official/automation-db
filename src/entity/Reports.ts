import { Schema, model, Document, Types } from "mongoose";
import mongoose from "mongoose";
export interface IReport extends Document {
  test_id: string;
  user_id?: string;
  file_id: Types.ObjectId;
  total_tests?: number;
  passed_tests?: number;
}

const ReportSchema = new Schema<IReport>(
  {
    test_id: { type: String, required: true, unique: true },

    user_id: {
      type: String,
      required: false,
      index: true,
    },

    file_id: mongoose.Types.ObjectId,

    total_tests: {
      type: Number,
      required: false,
      default: 0,
    },

    passed_tests: {
      type: Number,
      required: false,
      default: 0,
    },
  },
  { timestamps: true }
);

export const Report = model<IReport>("Report", ReportSchema);
