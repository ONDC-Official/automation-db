// gridfs.ts
import mongoose, { mongo } from "mongoose";
const { GridFSBucket } = mongo;

let bucket: mongo.GridFSBucket | null = null;

export const getReportsBucket = () => {
  if (!mongoose.connection.db) {
    throw new Error("MongoDB is not connected yet");
  }

  if (!bucket) {
    bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "reports",
    });
  }

  return bucket;
};
