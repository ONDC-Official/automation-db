// src/index.ts
import "./config/otelConfig";
import express from "express";
import dotenv from "dotenv";
import logger from "@ondc/automation-logger";
import routes from "./routes/routes";
import mongoose from "mongoose";
import { getGridFsBucket } from "./config/gridfs";
import { createIndexes, createValidationTableIndexes } from "@ondc/build-tools";

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

app.use(express.json({ limit: "75mb" }));
app.use(express.urlencoded({ limit: "75mb", extended: true }));
// Initialize MongoDB and server
async function initializeApp() {
    try {
        await mongoose.connect(process.env.MONGO_URI!);
        logger.info("MongoDB connected");

        // IMPORTANT: initialize bucket AFTER connection
        getGridFsBucket();

        const db = mongoose.connection.db!;
        await createIndexes(db);
        await createValidationTableIndexes(db);
        // Register routes
        app.use("/", routes);

        // Start Express server
        app.listen(port, () => {
            logger.info(`Server is running at http://localhost:${port}`);
        });
    } catch (error) {
        console.trace(error);
        logger.error("Error during app initialization:", error);
        process.exit(1);
    }
}

initializeApp();
