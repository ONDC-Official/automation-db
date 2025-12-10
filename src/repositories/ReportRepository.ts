import { Report, IReport } from "../entity/Reports";
import { ObjectId } from "mongodb";
import { Types } from "mongoose";
import { getGridFsBucket } from "../utils/gridfs";
import mongoose from "mongoose";
import { mongo } from "mongoose";
const { GridFSBucket } = mongo;

export class ReportRepository {
   private bucket;

constructor() {
  this.bucket = new GridFSBucket(mongoose.connection.db!, {
    bucketName: "reports"
  });
}

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
async saveToGridFS(id: string, data: string) {
  const uploadStream = this.bucket.openUploadStream(id);
  uploadStream.end(Buffer.from(data));

  return new Promise<mongoose.Types.ObjectId>((resolve, reject) => {
    uploadStream.on("finish", (file: any) => {
      resolve(new mongoose.Types.ObjectId(file._id.toString()));
    });
    uploadStream.on("error", reject);
  });
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
