import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { SessionDetailsService } from "../services/SessionDetailsService";
import { SessionDetails } from "../entity/SessionDetails";
import { Payload } from "../entity/Payload";
import { PayloadDetailsDTO } from "../entity/PayloadDetailsDTO";
import {logger} from "../utils/logger"; // Import the logger utility for logging

const sessionDetailsService = new SessionDetailsService(AppDataSource);

// Repositories to interact with the database
const sessionDetailsRepository = AppDataSource.getRepository(SessionDetails);
export const payloadRepository = AppDataSource.getRepository(Payload);

/**
 * Fetches all session details
 */
export const getAllSessions = async (req: Request, res: Response) => {
  try {
    logger.info("Fetching all sessions"); // Log the action
    const sessions = await sessionDetailsService.getAllSessions();
    res.json(sessions); // Return sessions as JSON response
  } catch (error) {
    logger.error("Error retrieving sessions: ", error); // Log error with details
    res.status(500).send("Error retrieving sessions"); // Send internal server error
  }
};

/**
 * Fetches session details by sessionId
 */
export const getSessionById = async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  try {
    logger.info(`Fetching session with ID: ${sessionId}`); // Log the action with sessionId
    const session = await sessionDetailsService.getSessionById(sessionId);
    if (session) {
      res.json(session); // Return session details if found
    } else {
      logger.warn(`Session with ID: ${sessionId} not found`); // Log warning if session not found
      res.status(404).send("Session not found"); // Send session not found response
    }
  } catch (error) {
    logger.error(`Error retrieving session with ID: ${sessionId}`, error); // Log error with sessionId
    res.status(400).send("Error retrieving session"); // Send bad request response
  }
};

/**
 * Checks if a session exists by sessionId
 */
export const checkSessionById = async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  try {
    logger.info(`Checking existence of session with ID: ${sessionId}`); // Log the action
    const exists = await sessionDetailsService.checkSessionById(sessionId);
    res.json(exists); // Return the result of the check (true/false)
  } catch (error) {
    logger.error(`Error checking session with ID: ${sessionId}`, error); // Log error with sessionId
    res.status(400).send("Error checking session"); // Send bad request response
  }
};

/**
 * Creates a new session with the details provided in the request body
 */
export const createSession = async (req: Request, res: Response) => {
  const sessionDetails = req.body;

  try {
    logger.info("Creating a new session", { sessionDetails }); // Log the session details being created
    const createdSession = await sessionDetailsService.createSession(sessionDetails);
    res.status(201).json(createdSession); // Return the created session as JSON response
  } catch (error: any) {
    logger.error("Error creating session", error); // Log error during session creation
    res.status(400).send(error.message); // Send error message response
  }
};

/**
 * Creates a payload for an existing session by sessionId
 */
// export const createPayloadForSession = async (req: Request, res: Response) => {
//   const payload = req.body;

//   try {
//     logger.info("Creating payload for session", { payload }); // Log the payload being created
//     const sessionDetails = await sessionDetailsRepository.findOneByOrFail({
//       sessionId: payload?.sessionDetails?.sessionId,
//     });

//     // Add the payload to the session's payload list
//     const payloadList = sessionDetails.payloads || [];
//     payloadList.push(payload);    
//     sessionDetails.payloads = payloadList;

//     // Save the updated session
//     const updatedSession = await sessionDetailsRepository.save(sessionDetails);
//     res.json(updatedSession); // Return the updated session as JSON response
//   } catch (error:any) {
//     logger.error("Error creating payload for session", error); // Log error with details
//     res.status(404).send(`${error?.message}`); // Send session not found error
//   }
// };


export const createPayloadForSession = async (req: Request, res: Response) => {
  const payloadData = req.body;

  try {
    logger.info("Creating payload for session", { payloadData });

    // 1. Find the session
    const sessionDetails = await sessionDetailsRepository.findOneByOrFail({
      sessionId: payloadData?.sessionDetails?.sessionId,
    });

    // 2. Create a proper Payload entity instance
    const newPayload = payloadRepository.create({
      ...payloadData,
      sessionDetails, // This links it via the relation
    });

    // 3. Save the payload directly
    await payloadRepository.save(newPayload);

    res.json(newPayload); // Return the saved payload
  } catch (error: any) {
    logger.error("Error creating payload for session", error);
    res.status(400).send(error?.message || "Error creating payload");
  }
};

/**
 * Fetches payload details for a given sessionId
 */
export const getPayloadBySessionId = async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  try {
    logger.info(`Fetching payload details for session ID: ${sessionId}`); // Log the action
    const payloadDetails: PayloadDetailsDTO[] =
      await sessionDetailsService.getPayloadDetails(sessionId);
    res.json(payloadDetails); // Return the payload details as JSON response
  } catch (error: any) {
    logger.error(`Error retrieving payload for session ID: ${sessionId}`, error); // Log error with sessionId
    res.status(404).send(error.message); // Send error message response
  }
};

/**
 * Updates session details by sessionId
 */
export const updateSession = async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const updatedDetails = req.body;

  try {
    logger.info(`Updating session with ID: ${sessionId}`, { updatedDetails }); // Log session update details
    const updatedSession = await sessionDetailsService.updateSession(sessionId, updatedDetails);
    res.json(updatedSession); // Return the updated session as JSON response
  } catch (error) {
    logger.error(`Error updating session with ID: ${sessionId}`, error); // Log error during session update
    res.status(404).send("Session not found"); // Send session not found error
  }
};

/**
 * Deletes a session by sessionId
 */
export const deleteSession = async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  try {
    logger.info(`Deleting session with ID: ${sessionId}`); // Log session deletion
    await sessionDetailsService.deleteSession(sessionId);
    res.status(204).send(); // Send no content response on successful deletion
  } catch (error) {
    logger.error(`Error deleting session with ID: ${sessionId}`, error); // Log error during session deletion
    res.status(404).send("Session not found"); // Send session not found error
  }
};