import mongoose from "mongoose";

export const connectMongo = async () => {
  try {
    const uri = process.env.MONGO_URI || "";
    await mongoose.connect(uri);
    console.log("MongoDB connected");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};