// utils/mongoClient.ts
import { MongoClient, Db } from "mongodb";

let client: MongoClient;
let db: Db;

export async function connectMongo() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URI!);
    await client.connect();
    db = client.db(); // default DB from URI
  }
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error("MongoDB not connected yet");
  return db;
}
