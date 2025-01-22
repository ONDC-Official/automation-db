// PayloadRoutes.ts
import { Router } from "express";
import {
  getAllPayloads,
  getPayloadById,
  createPayload,
  updatePayload,
  deletePayload,
  getPayloadByTransactionId,
  getPayloadByPayloadId
} from "../controllers/PayloadController";

const router = Router();

router.get("/", getAllPayloads);
router.get("/:id", getPayloadById);
router.post("/", createPayload);
router.put("/:id", updatePayload);
router.delete("/:id", deletePayload);
router.get("/transaction/:transactionId", getPayloadByTransactionId);
router.get("/id/:payloadId", getPayloadByPayloadId);


export default router;
