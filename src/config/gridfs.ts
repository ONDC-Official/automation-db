import mongoose from "mongoose";

let bucket: mongoose.mongo.GridFSBucket | null = null;

export const getGridFsBucket = () => {
  if (!bucket) {
    const db = mongoose.connection.db;
    if (!db) throw new Error("MongoDB is not connected");

    bucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: "reports"
    });
  }
  return bucket;
};