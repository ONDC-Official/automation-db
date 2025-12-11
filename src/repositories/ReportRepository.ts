import { Report, IReport } from "../entity/Reports";
import mongoose from "mongoose";

export class ReportRepository {
  private bucket: mongoose.mongo.GridFSBucket | null = null;

  /** Lazy getter for GridFSBucket */
  private getBucket(): mongoose.mongo.GridFSBucket {
    if (this.bucket) return this.bucket;

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error(
        "MongoDB connection not ready. Ensure mongoose.connect() has completed"
      );
    }

    this.bucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: "reports",
    });
    return this.bucket;
  }

  /** Save report metadata (test_id + GridFS file_id) */
  async create(reportData: Partial<IReport>) {
    return Report.create(reportData);
  }

  /** Find report by test_id */
  async findByTestId(test_id: string) {
    return Report.findOne({ test_id });
  }

  /** Check if report exists */
  async existsByTestId(testId: string): Promise<boolean> {
    if (!testId) return false;
    return !!(await Report.exists({ test_id: testId }));
  }

  /** Get all reports */
  async findAll() {
    return Report.find();
  }

  /** Update a report by its _id */
  async update(id: string, updatedData: Partial<IReport>) {
    return Report.findByIdAndUpdate(id, updatedData, { new: true });
  }

  /** Delete a report by its _id */
  async delete(id: string) {
    return Report.findByIdAndDelete(id);
  }

  /** Save base64 data to GridFS */
async saveToGridFS(id: string, data: string): Promise<mongoose.Types.ObjectId> {
  const bucket = this.getBucket();
  const uploadStream = bucket.openUploadStream(id);

  return new Promise<mongoose.Types.ObjectId>((resolve, reject) => {
    uploadStream.on("finish", () => {
      // uploadStream.id is the ObjectId of the stored file
      const fileId = uploadStream.id as mongoose.Types.ObjectId;
      resolve(fileId);
    });

    uploadStream.on("error", reject);

    uploadStream.end(Buffer.from(data, "base64"));
  });
}


  /** Fetch base64 data from GridFS */
  async fetchFromGridFS(fileId: mongoose.Types.ObjectId): Promise<string> {
    const bucket = this.getBucket();
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      const downloadStream = bucket.openDownloadStream(fileId);
      downloadStream.on("data", (chunk) => chunks.push(chunk));
      downloadStream.on("error", reject);
      downloadStream.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
    });
  }
}
