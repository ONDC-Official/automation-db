import { Schema, model, Document } from "mongoose";

export interface IReport extends Document {
  test_id: string;
  data: string;
}

const ReportSchema = new Schema<IReport>(
  {
    test_id: { type: String, required: true },
    data: { type: String, required: true },
  },
  {
    timestamps: true, // adds createdAt and updatedAt automatically
  }
);

export const Report = model<IReport>("Report", ReportSchema);