// src/index.ts
import "./config/otelConfig";
import dotenv from "dotenv";
import logger from "@ondc/automation-logger";
import mongoose from "mongoose";
import { createApp } from "./app";
import { getGridFsBucket } from "./config/gridfs";
import { createIndexes, createValidationTableIndexes } from "@ondc/build-tools";

dotenv.config();

const port = process.env.PORT || 5001;

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

        // Build the app (middleware + routes) and start listening
        const app = createApp();

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
