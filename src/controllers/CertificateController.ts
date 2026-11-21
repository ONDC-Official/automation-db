import { Request, Response } from "express";
import logger from "@ondc/automation-logger";
import { CertificateRepository } from "../repositories/CertificateRepository";
import {
    AppealRejectedError,
    CertificateInputError,
    CertificateNotFoundError,
    CertificateService,
} from "../services/CertificateService";
import { CertificationKeyError } from "../services/CertificateSigning";
import {
    AppealRequest,
    formatIssues,
    GoLiveQuery,
    IssueCertificateRequest,
    LapseCertificatesRequest,
    ListCertificatesQuery,
} from "../validation/certificates";

// ---------------------- Constructor ----------------------

const certificateRepo = new CertificateRepository();
const certificateService = new CertificateService(certificateRepo);

// ---------------------- Helpers ----------------------

const invalid = (res: Response, errors: string[]) =>
    res.status(400).json({ message: "Invalid request", errors });

/**
 * A missing or malformed FD_CERT_SIGNING_KEY / FD_CERT_KEY_ID fails closed
 * with 503: nothing is issued, lapsed or verified without the key. The detail
 * goes to the log, not the (possibly public) response.
 */
const keyUnavailable = (res: Response, error: CertificationKeyError) => {
    logger.error("FD certification key unavailable", { message: error.message });
    res.status(503).json({ message: "Certification key is not configured" });
};

// ---------------------- Controller Methods ----------------------

/**
 * Issue a certificate from a run summary. The server applies the issuance
 * rule and signs; a run that fails the rule is stored as REFUSED. 201 either
 * way: the record exists.
 */
export const issueCertificate = async (req: Request, res: Response): Promise<void> => {
    const parsed = IssueCertificateRequest.safeParse(req.body);
    if (!parsed.success) {
        invalid(res, formatIssues(parsed.error));
        return;
    }
    try {
        const result = await certificateService.issue(parsed.data);
        res.status(201).json(result);
    } catch (error) {
        if (error instanceof CertificationKeyError) return keyUnavailable(res, error);
        if (error instanceof CertificateInputError) {
            invalid(res, [error.message]);
            return;
        }
        logger.error("Error issuing FD certificate", error);
        res.status(500).json({ message: "Error issuing certificate" });
    }
};

/**
 * Fetch one certificate record by certificateId.
 */
export const getCertificate = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    try {
        const certificate = await certificateService.getById(id);
        if (!certificate) {
            res.status(404).json({ message: "Certificate not found" });
            return;
        }
        res.json(certificate);
    } catch (error) {
        logger.error(`Error fetching certificate ${id}`, error);
        res.status(500).json({ message: "Error fetching certificate" });
    }
};

/**
 * List certificate records by subscriberId, domain and role, the latest VALID
 * one first.
 */
export const listCertificates = async (req: Request, res: Response): Promise<void> => {
    const parsed = ListCertificatesQuery.safeParse(req.query);
    if (!parsed.success) {
        invalid(res, formatIssues(parsed.error));
        return;
    }
    try {
        res.json(await certificateService.list(parsed.data));
    } catch (error) {
        logger.error("Error listing certificates", error);
        res.status(500).json({ message: "Error listing certificates" });
    }
};

/**
 * PUBLIC. Recompute the canonical record and check its signature against the
 * configured certification key.
 */
export const verifyCertificate = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    try {
        const result = await certificateService.verify(id);
        if (!result) {
            res.status(404).json({ message: "Certificate not found" });
            return;
        }
        res.json(result);
    } catch (error) {
        if (error instanceof CertificationKeyError) return keyUnavailable(res, error);
        logger.error(`Error verifying certificate ${id}`, error);
        res.status(500).json({ message: "Error verifying certificate" });
    }
};

/**
 * Lapse every VALID certificate in a domain whose coverage includes any of the
 * requirement IDs a spec change touched.
 */
export const lapseCertificates = async (req: Request, res: Response): Promise<void> => {
    const parsed = LapseCertificatesRequest.safeParse(req.body);
    if (!parsed.success) {
        invalid(res, formatIssues(parsed.error));
        return;
    }
    try {
        res.json(await certificateService.lapse(parsed.data));
    } catch (error) {
        if (error instanceof CertificationKeyError) return keyUnavailable(res, error);
        logger.error("Error lapsing certificates", error);
        res.status(500).json({ message: "Error lapsing certificates" });
    }
};

/**
 * Record an appeal against a certificate, citing a run and a requirement ID.
 */
export const createAppeal = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const parsed = AppealRequest.safeParse(req.body);
    if (!parsed.success) {
        invalid(res, formatIssues(parsed.error));
        return;
    }
    try {
        const appeal = await certificateService.addAppeal(id, parsed.data);
        res.status(201).json(appeal);
    } catch (error) {
        if (error instanceof CertificateNotFoundError) {
            res.status(404).json({ message: "Certificate not found" });
            return;
        }
        if (error instanceof AppealRejectedError) {
            res.status(422).json({
                message: "Appeal does not match the certificate",
                errors: error.errors,
            });
            return;
        }
        logger.error(`Error recording appeal on certificate ${id}`, error);
        res.status(500).json({ message: "Error recording appeal" });
    }
};

/**
 * The onboarding gate: may this participant go live in this domain and role?
 * Fails closed: if the key is missing the answer is still `allowed: false`.
 */
export const goLive = async (req: Request, res: Response): Promise<void> => {
    const parsed = GoLiveQuery.safeParse(req.query);
    if (!parsed.success) {
        invalid(res, formatIssues(parsed.error));
        return;
    }
    try {
        res.json(await certificateService.goLive(parsed.data));
    } catch (error) {
        if (error instanceof CertificationKeyError) {
            logger.error("FD certification key unavailable", { message: error.message });
            res.status(503).json({
                allowed: false,
                reason: "VERIFICATION_UNAVAILABLE",
                detail: "Certification key is not configured, so no certificate can be verified",
            });
            return;
        }
        logger.error("Error evaluating go-live", error);
        res.status(500).json({
            allowed: false,
            reason: "VERIFICATION_UNAVAILABLE",
            detail: "Error evaluating go-live",
        });
    }
};
