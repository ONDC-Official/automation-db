// src/config/mongoConfig.ts
import mongoose from "mongoose";
import logger from "./utils/logger";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/mydb";

export const connectMongoDB = async () => {
  try {
    await mongoose.connect(MONGO_URI); // simple connection
    logger.info("MongoDB connected successfully!");
  } catch (error) {
    logger.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
};
