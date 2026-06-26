// utils/mongoClient.ts
import mongoose from "mongoose";
import type { Db } from "mongodb";

export function getDb(): Db {
    const db = mongoose.connection.db;
    if (!db) throw new Error("MongoDB not connected yet");
    return db;
}
