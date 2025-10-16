import { Router } from "express";
import SessionRoutes from "./SessionRoutes"; // Import session-related routes
import PayloadRoutes from "./PayloadRoutes"; // Import payload-related routes
import ReportRoutes from "./ReportRoutes";   // Import report-related routes
import apiKeyMiddleware from "../middleware/api-key"; // Import API key middleware

const router = Router();

// Apply API key middleware
router.use(apiKeyMiddleware);

// Mount session, payload, and report routes
router.use("/api/sessions", SessionRoutes);
router.use("/payload", PayloadRoutes);
router.use("/report", ReportRoutes);

export default router;
