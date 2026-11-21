import { Router } from "express";
import mongoose from "mongoose";
import SessionRoutes from "./SessionRoutes"; // Import session-related routes
import PayloadRoutes from "./PayloadRoutes"; // Import payload-related routes
import ReportRoutes from "./ReportRoutes"; // Import report-related routes
import UserRoutes from "./UserRoutes";
import apiKeyMiddleware from "../middleware/api-key"; // Import API key middleware
import ProtocolRoutes from "./ProtocolRoutes"; // Import protocol specification routes
import CertificateRoutes, { publicCertificateRoutes } from "./CertificateRoutes"; // FD certification records
const router = Router();

router.get("/health", (_req, res) => {
    if (mongoose.connection.readyState === 1) {
        res.json({ status: "ok" });
    } else {
        res.status(503).json({ status: "degraded", checks: { mongo: "fail" } });
    }
});

// Public: GET /certificates/:id/verify. Everything else under /certificates
// falls through to the API key below.
router.use("/certificates", publicCertificateRoutes);

// Apply API key middleware
router.use(apiKeyMiddleware);

// Mount session, payload, and report routes
router.use("/api/sessions", SessionRoutes);
router.use("/payload", PayloadRoutes);
router.use("/report", ReportRoutes);
router.use("/user", UserRoutes);
router.use("/protocol-specs", ProtocolRoutes);
router.use("/certificates", CertificateRoutes);

export default router;
