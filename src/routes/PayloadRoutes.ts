// PayloadRoutes.ts
import { Router } from "express";
import {
	getAllPayloads,
	getPayloadById,
	createPayload,
	updatePayload,
	deletePayload,
	getPayloadByTransactionId,
	getPayloadByPayloadIds,
	getPayloadsByTransactionId,
	getPayloadsByDomainAndVersion,
} from "../controllers/PayloadController";

const router = Router();

router.get("/", getAllPayloads);
router.get("/:id", getPayloadById);
router.post("/", createPayload);
router.put("/:id", updatePayload);
router.delete("/:id", deletePayload);
router.get("/transaction/:transactionId", getPayloadByTransactionId);
router.get("/logs/:transactionId", getPayloadsByTransactionId);
router.post("/ids", getPayloadByPayloadIds);
router.get("/stored/:domain/:version/:page", getPayloadsByDomainAndVersion);

export default router;
