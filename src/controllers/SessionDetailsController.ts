import { Request, Response } from "express";
import { SessionDetailsRepository } from "../repositories/SessionDetailsRepository";
import { PayloadRepository } from "../repositories/PayloadRepository";
import logger from "../utils/logger";
import { SessionDetailsService } from "../services/SessionDetailsService";

// Instantiate repositories and service
const sessionRepo = new SessionDetailsRepository();
const payloadRepo = new PayloadRepository();
const sessionDetailsService = new SessionDetailsService(
  sessionRepo,
  payloadRepo
);

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
    const sessionData = req.body;
    logger.info("Creating a new session", { sessionData });
    const createdSession = await sessionDetailsService.createSession(
      sessionData
    );
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


export const getSessionsByNp = async (req: Request, res: Response) => {
  const np_type = (req.query.npType as string) 
  const np_id = (req.query.npId as string)

  if (!np_type || !np_id) {
    logger.warn("Missing np_type or np_id in query params");
    res.status(400).send("Missing np_type or np_id query parameters");
    return
  }

  try {
    logger.info(`Fetching sessions for np_type=${np_type}, np_id=${np_id}`);
    const sessions = await sessionDetailsService.getSessionsByNp(np_type, np_id);

    // 🔹 Extract only sessionId values
    const sessionIds = sessions.map((s: any) => s.session_id);
    res.json({ sessionIds });
  } catch (error: any) {
    logger.error(`Error fetching sessions for np_type=${np_type}, np_id=${np_id}`, error);
    res.status(500).send(error.message || "Error retrieving session IDs");
  }
};

