import { Router } from "express";
import SessionRoutes from "./SessionRoutes"; // Import session-related routes
import PayloadRoutes from "./PayloadRoutes"; // Import payload-related routes
import apiKeyMiddleware from "../middleware/api-key"; // Import API key middleware
const router = Router();

// Mount session and payload related routes
router.use(apiKeyMiddleware);
router.use("/api/sessions", SessionRoutes);
router.use("/payload", PayloadRoutes);

export default router;
