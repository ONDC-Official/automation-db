import { Request, Response } from "express";
import { SessionDetailsRepository } from "../repositories/SessionDetailsRepository";
import { PayloadRepository } from "../repositories/PayloadRepository";
import logger from "../utils/logger";
import { SessionDetailsService } from "../services/SessionDetailsService";
import { SessionDetails } from "../entity/SessionDetails";
import { UserService } from "../services/UserService";
import { UserRepository } from "../repositories/UserRepository";
import { ReportService } from "../services/ReportService";
import { ReportRepository } from "../repositories/ReportRepository";

// Instantiate repositories and service
const sessionRepo = new SessionDetailsRepository();
const payloadRepo = new PayloadRepository();
const userRepo = new UserRepository()
const reportRepo = new ReportRepository();
const reportService = new ReportService(reportRepo); 
const sessionDetailsService = new SessionDetailsService(
  sessionRepo,
  payloadRepo
);
const userService = new UserService(userRepo)

/**
 * Fetch all sessions
 */
export const getAllSessions = async (req: Request, res: Response) => {
  try {
    logger.info("Fetching all sessions");
    const sessions = await sessionDetailsService.getAllSessions();
    res.json(sessions);
  } catch (error) {
    logger.error("Error retrieving sessions", error);
    res.status(500).send("Error retrieving sessions");
  }
};

/**
 * Fetch session by sessionId
 */
export const getSessionById = async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  try {
    logger.info(`Fetching session with ID: ${sessionId}`);
    const session = await sessionDetailsService.getSessionById(sessionId);
    if (session) {
      res.json(session);
    } else {
      logger.warn(`Session not found with ID: ${sessionId}`);
      res.status(404).send("Session not found");
    }
  } catch (error) {
    logger.error(`Error retrieving session with ID: ${sessionId}`, error);
    res.status(400).send("Error retrieving session");
  }
};

/**
 * Check if a session exists
 */
export const checkSessionById = async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  try {
    logger.info(`Checking existence of session ID: ${sessionId}`);
    const exists = await sessionDetailsService.checkSessionById(sessionId);
    res.json(exists);
  } catch (error) {
    logger.error(`Error checking session ID: ${sessionId}`, error);
    res.status(400).send("Error checking session");
  }
};

/**
 * Create a new session
 */
export const createSession = async (req: Request, res: Response) => {
  try {
    const sessionData: Partial<InstanceType<typeof SessionDetails>> = req.body;
    logger.info("Creating a new session", { sessionData });
    const createdSession = await sessionDetailsService.createSession(
      sessionData
    );

    if(sessionData?.userId && sessionData?.sessionId) {
      await userService.addSessionToUser(sessionData?.userId, sessionData?.sessionId)
    }

    res.status(201).json(createdSession);
  } catch (error: any) {
    logger.error("Error creating session", error);
    res.status(400).send(error.message || "Error creating session");
  }
};

/**
 * Update a session
 */
export const updateSession = async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const updatedData = req.body;
  try {
    logger.info(`Updating session with ID: ${sessionId}`, { updatedData });
    const updatedSession = await sessionDetailsService.updateSession(
      sessionId,
      updatedData
    );
    res.json(updatedSession);
  } catch (error: any) {
    logger.error(`Error updating session ID: ${sessionId}`, error);
    res.status(404).send(error.message || "Session not found");
  }
};

/**
 * Delete a session
 */
export const deleteSession = async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  try {
    logger.info(`Deleting session with ID: ${sessionId}`);
    await sessionDetailsService.deleteSession(sessionId);
    res.status(204).send();
  } catch (error) {
    logger.error(`Error deleting session ID: ${sessionId}`, error);
    res.status(404).send("Session not found");
  }
};

/**
 * Create a payload for a session
 */
export const createPayloadForSession = async (req: Request, res: Response) => {
  try {
    const { sessionDetails, ...rest } = req.body;
    const payloadData = {
      ...rest,
      sessionId: sessionDetails?.sessionId || null, // safely extract sessionId
    };
    logger.info("Creating payload for session", { payloadData });
    const newPayload = await payloadRepo.create(payloadData);
    res.status(201).json(newPayload);
  } catch (error: any) {
    logger.error("Error creating payload", error);
    res.status(400).send(error.message || "Error creating payload");
  }
};

/**
 * Get payloads by sessionId
 */
export const getPayloadBySessionId = async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  try {
    logger.info(`Fetching payloads for session ID: ${sessionId}`);
    const payloadDetails = await sessionDetailsService.getPayloadDetails(
      sessionId
    );
    res.json(payloadDetails);
  } catch (error: any) {
    logger.error(`Error fetching payloads for session ID: ${sessionId}`, error);
    res.status(404).send(error.message || "Error retrieving payloads");
  }
};

/**
 * Update flow status in a session
 */
 export const updateFlow = async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.params;
  const { flow } = req.body;

  if (!flow || !flow?.id) {
    res.status(400).send("flow is required with id");
    return; // ✅ ensure it exits cleanly
  }

  try {
    logger.info(`Updating flow ${flow.id} status in session ${sessionId}`);
    const updatedSession = await sessionDetailsService.updateFlowInSession(sessionId, flow.id, flow);

    if (!updatedSession) {
      res.status(404).send("Flow or session not found");
      return;
    }

    res.json(updatedSession);
  } catch (error: any) {
    logger.error(`Error updating flow ${flow.id} in session ${sessionId}`, error);
    res.status(500).send(error.message || "Error updating flow status");
  }
};


/**
 * Add a new flow to the session
 */
export const addFlowToSession = async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.params;
  const { id, status, payloads } = req.body;

  if (!id || !status) {
     res.status(400).send("Flow id and status are required");
     return
  }

  try {
    logger.info(`Adding new flow to session ${sessionId}`);
    const updatedSession = await sessionDetailsService.addFlowToSession(sessionId, { id, status, payloads });

    if (!updatedSession) {
       res.status(400).send("Session not found");
       return
    }

    res.json(updatedSession);
  } catch (error: any) {
    logger.error(`Error adding flow to session ${sessionId}`, error);
    res.status(500).send(error.message || "Error adding flow to session");
  }
}
export const getSessionsByNp = async (req: Request, res: Response) => {
  const np_type = req.query.np_type as string;
  const np_id = req.query.np_id as string;

  if (!np_type || !np_id) {
    logger.warn("Missing npType or npId in query params");
    res.status(400).send("Missing npType or npId query parameters");
    return;
  }

  try {
    logger.info(`Fetching sessions for np_type=${np_type}, np_id=${np_id}`);
    const sessions = await sessionDetailsService.getSessionsByNp(
      np_type,
      np_id
    );

    if (!sessions || sessions.length === 0) {
      logger.info(`No sessions found for np_type=${np_type}, np_id=${np_id}`);
      res.json({ sessions: [] });
      return;
    }

    // For each session, call reportService.hasReportForTestId individually (prefixed with PW_)
    const sessionsResponse = await Promise.all(
      sessions.map(async (s: any) => {
        const sessionId = s.sessionId ?? s.session_id ?? null;

        const createdAt =
          s.createdAt instanceof Date
            ? s.createdAt.toISOString()
            : typeof s.createdAt === "string"
            ? new Date(s.createdAt).toISOString()
            : null;

        const prefixedTestId = `PW_${sessionId}`;

        let reportExists = false;
        try {
          // Individual check per session (no bulk)
          logger.info("Finding report for testId", { testId: prefixedTestId });
          reportExists = await reportService.hasReportForTestId(prefixedTestId);
        } catch (err) {
          // Best-effort: log and default to false so we don't fail entire response
          logger.error(
            `Error checking report existence for testId=${prefixedTestId}`,
            err
          );
          reportExists = false;
        }

        return {
          sessionId,
          reportExists,
          createdAt,
        };
      })
    );

    res.json({ sessions: sessionsResponse });
  } catch (error: any) {
    logger.error(
      `Error fetching sessions for np_type=${np_type}, np_id=${np_id}`,
      error
    );
    res.status(500).send(error.message || "Error retrieving session IDs");
  }
};
