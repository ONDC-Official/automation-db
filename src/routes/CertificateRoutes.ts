import { Router } from "express";
import {
    createAppeal,
    getCertificate,
    goLive,
    issueCertificate,
    lapseCertificates,
    listCertificates,
    verifyCertificate,
} from "../controllers/CertificateController";

/**
 * FD certification records. Mounted at /certificates behind the API key.
 */
const router = Router();

// Literal paths first, so "go-live" and "lapse" are never read as an :id.
router.get("/go-live", goLive);
router.post("/lapse", lapseCertificates);

router.post("/", issueCertificate);
router.get("/", listCertificates);
router.get("/:id", getCertificate);
router.post("/:id/appeals", createAppeal);

export default router;

/**
 * The one public certificate route: anyone holding a certificate ID can have
 * its signature checked. Mounted BEFORE the API-key middleware.
 */
export const publicCertificateRoutes = Router();

publicCertificateRoutes.get("/:id/verify", verifyCertificate);
