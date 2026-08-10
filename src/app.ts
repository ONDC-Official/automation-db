// src/app.ts
import express, { Express } from "express";
import routes from "./routes/routes";

/**
 * Builds the Express app with middleware and routes mounted.
 *
 * Deliberately does no I/O — no Mongo connection, no GridFS bucket, no OTel.
 * That lives in index.ts so tests can drive the app against a throwaway
 * database without booting the whole service.
 */
export function createApp(): Express {
    const app = express();

    app.use(express.json({ limit: "75mb" }));
    app.use(express.urlencoded({ limit: "75mb", extended: true }));
    app.use("/", routes);

    return app;
}
