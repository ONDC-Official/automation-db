import mongoose from "mongoose";

let bucket: mongoose.mongo.GridFSBucket | null = null;

export function getGridFsBucket(): mongoose.mongo.GridFSBucket {
  if (bucket) return bucket;

  if (!mongoose.connection.db) {
    throw new Error("MongoDB connection not ready. Call after mongoose.connect()");
  }

  bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: "reports",
  });

  return bucket;
}
