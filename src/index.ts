// src/index.ts
import "./config/otelConfig";
import express from "express";
import dotenv from "dotenv";
import logger from "./utils/logger";
import routes from "./routes/routes";
import { connectMongoDB } from "./mongoConfig";

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
// Initialize MongoDB and server
async function initializeApp() {
  try {
    // Connect to MongoDB
    await connectMongoDB();

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
