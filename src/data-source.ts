import { DataSource } from "typeorm";
import dotenv from "dotenv";
import { Payload } from "./entity/Payload";
import { SessionDetails } from "./entity/SessionDetails";
import { User } from "./entity/User";

// Initialize dotenv to load environment variables
dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

export const AppDataSource = new DataSource({
  type: "postgres", // or 'mysql', 'mariadb', 'sqlite', etc.
  host: process.env.DB_HOST, // Your database host
  port: 5432, // Your database port (5432 for PostgreSQL)
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "postgres", // Your DB name
  synchronize: isProduction ? false : true, // Automatically synchronize database schema (don't use in production)
  entities: [Payload, SessionDetails, User],
  logging: true, // Set to true for SQL logs
  migrations: [
    isProduction ? "dist/migration/**/*.js" : "src/migration/**/*.ts",
  ]
});
