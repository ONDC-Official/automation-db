import { Schema, model, Document, Types } from "mongoose";
import mongoose from "mongoose";
export interface IReport extends Document {
  test_id: string;
  file_id: Types.ObjectId; 
}

const ReportSchema = new Schema<IReport>(
  {
    test_id: { type: String, required: true, unique: true },
    file_id: mongoose.Types.ObjectId
  },
  { timestamps: true }
);

export const Report = model<IReport>("Report", ReportSchema);
