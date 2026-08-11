// SessionDetailsRoutes.ts
import { Router } from "express";
import {
  getAllSessions,
  getSessionById,
  checkSessionById,
  createSession,
  createPayloadForSession,
  getPayloadBySessionId,
  updateSession,
  deleteSession,
  updateFlow,
  addFlowToSession,
  getSessionsByNp,
  getSubscriberUrlsByUserId,
  saveSessionAnalytics,
  upsertSession,
  getSessionStats,
  getSessionFacets,
  exportSessions,
  exportParticipants,
  getParticipants,
  getParticipantDetail,
} from "../controllers/SessionDetailsController";

const router = Router();

// ⚠️ Specific routes MUST come before wildcard /:sessionId
router.get("/stats", getSessionStats);
router.get("/facets", getSessionFacets);
router.get("/export", exportSessions);
router.get("/participants", getParticipants);
// Before /participants/:host, which would otherwise match "export" as a host.
router.get("/participants/export", exportParticipants);
router.get("/participants/:host", getParticipantDetail);
router.get("/filter", getSessionsByNp);
router.get("/subscriber-urls/:userId", getSubscriberUrlsByUserId);
router.get("/check/:sessionId", checkSessionById);
router.get("/payload/:sessionId", getPayloadBySessionId);
router.get("/", getAllSessions);
router.get("/:sessionId", getSessionById);

router.post("/", createSession);
router.post("/upsert", upsertSession);
router.post("/payload", createPayloadForSession);

router.put("/flows/:sessionId", updateFlow);
router.put("/:sessionId", updateSession);

router.post("/flows/:sessionId", addFlowToSession);
router.post("/:sessionId/analytics", saveSessionAnalytics);

router.delete("/:sessionId", deleteSession);

export default router;

