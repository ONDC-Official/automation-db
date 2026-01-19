// src/index.ts
import "./config/otelConfig";
import express from "express";
import dotenv from "dotenv";
import logger from "./utils/logger";
import routes from "./routes/routes";
import { connectMongoDB } from "./mongoConfig";
import mongoose from "mongoose";
import { getGridFsBucket } from "./config/gridfs";

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

app.use(express.json({ limit: '75mb' }));
app.use(express.urlencoded({ limit: '75mb', extended: true }));
// Initialize MongoDB and server
async function initializeApp() {
  try {
    // Connect to MongoDB
    mongoose.connect(process.env.MONGO_URI!)
  .then(() => {
    console.log("Mongo Connected");

    // IMPORTANT: initialize bucket AFTER connection
    getGridFsBucket();

    // start server only after bucket is ready
    app.listen(3000, () => console.log("Server started"));
  })
  .catch(console.error);

    // Register routes
    app.use("/", routes);

    // Start Express server
    app.listen(port, () => {
      logger.info(`Server is running at http://localhost:${port}`);
    });
  } catch (error) {
    console.trace(error);
    logger.error("Error during app initialization:", error);
  }
}

initializeApp();
