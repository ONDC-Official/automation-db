import { DataSource } from "typeorm";
import dotenv from "dotenv";
import { Payload } from "./entity/Payload";
import { SessionDetails } from "./entity/SessionDetails";

// Initialize dotenv to load environment variables
dotenv.config();

// const isProduction = process.env.NODE_ENV === "production";

export const AppDataSource = new DataSource({
  type: "postgres", // or 'mysql', 'mariadb', 'sqlite', etc.
  host: process.env.DB_HOST, // Your database host
  port: parseInt(process.env.DB_PORT as string), // Your database port
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "yugabytedb", // Your DB name
  synchronize: true, // Automatically synchronize database schema (don't use in production)
  entities: [Payload, SessionDetails],
  logging: true, // Set to true for SQL logs
  // migrations: [
  //   isProduction ? "dist/migration/**/*.js" : "src/migration/**/*.ts",
  // ]
});
