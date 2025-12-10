import mongoose from "mongoose";

// Use the GridFSBucket from mongoose's MongoDB driver
type GridFSBucketType = mongoose.mongo.GridFSBucket;

let bucket: GridFSBucketType | null = null;

export const getGridFsBucket = (): GridFSBucketType => {
  if (!bucket) {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("MongoDB is not connected. Call getGridFsBucket after mongoose.connect");
    }

    bucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: "reports",
    });
  }

  return bucket;
};
