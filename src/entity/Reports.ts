import { Schema, model, Document, Types } from "mongoose";
import mongoose from "mongoose";

export interface FlowCategorySummary {
  total: number;
  completed: number;
}

export interface FlowSummary {
  REPORTABLE?: FlowCategorySummary;
  MANDATORY?: FlowCategorySummary;
  OPTIONAL?: FlowCategorySummary;
  [key: string]: FlowCategorySummary | undefined;
}

export interface IReport extends Document {
  test_id: string;
  user_id?: string;
  file_id: Types.ObjectId;
  total_tests?: number;
  passed_tests?: number;
  flow_summary?: FlowSummary;
}

const FlowCategorySummarySchema = new Schema<FlowCategorySummary>(
  {
    total: { type: Number, required: true },
    completed: { type: Number, required: true },
  },
  { _id: false }
);

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

    flow_summary: {
      type: Map,
      of: FlowCategorySummarySchema,
      required: false,
    },
  },
  { timestamps: true }
);

export const Report = model<IReport>("Report", ReportSchema);
