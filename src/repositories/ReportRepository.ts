import { Report, IReport } from "../entity/Reports";

import { Types } from "mongoose";
import { getGridFsBucket } from "../utils/gridfs";

export class ReportRepository {
  
  // Save report metadata (test_id + GridFS file_id)
  async create(reportData: Partial<IReport>) {
    return Report.create(reportData);
  }

  async findByTestId(test_id: string) {
    return Report.findOne({ test_id });
  }

  async existsByTestId(testId: string): Promise<boolean> {
    if (!testId) return false;
    return !!(await Report.exists({ test_id: testId }));
  }

  async findAll() {
    return Report.find();
  }

  async update(id: string, updatedData: Partial<IReport>) {
    return Report.findByIdAndUpdate(id, updatedData, { new: true });
  }

  async delete(id: string) {
    return Report.findByIdAndDelete(id);
  }

  /** GRIDFS: Save base64 data into GridFS bucket */
  async saveToGridFS(testId: string, base64: string): Promise<Types.ObjectId> {
    const bucket = getGridFsBucket();

    const buffer = Buffer.from(base64, "base64");

    const uploadStream = bucket.openUploadStream(testId);
    uploadStream.end(buffer);

    return uploadStream.id as Types.ObjectId;
  }

  /** GRIDFS: Fetch base64 data from GridFS */
  async fetchFromGridFS(fileId: Types.ObjectId): Promise<string> {
    const bucket = getGridFsBucket();

    return new Promise((resolve, reject) => {
      const downloadStream = bucket.openDownloadStream(fileId);

      const chunks: Buffer[] = [];

      downloadStream.on("data", (chunk) => chunks.push(chunk));
      downloadStream.on("error", reject);
      downloadStream.on("end", () => {
        resolve(Buffer.concat(chunks).toString("base64"));
      });
    });
  }
}
