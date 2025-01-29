import { DataSource } from "typeorm";
import { SessionDetails } from "../entity/SessionDetails";
import { PayloadDetailsDTO } from "../entity/PayloadDetailsDTO";
import { Payload } from "../entity/Payload";
import {logger} from "../utils/logger"; // Importing logger utility

export class SessionDetailsService {
  private dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  /**
   * Retrieves all session details from the database.
   * @returns List of session details.
   */
  async getAllSessions(): Promise<SessionDetails[]> {
    try {
      logger.info("Fetching all session details from database"); // Log the action
      const sessionDetailsRepository = this.dataSource.getRepository(SessionDetails);
      const sessions = await sessionDetailsRepository.find();
      logger.info(`Found ${sessions.length} session(s)`); // Log how many sessions were found
      return sessions;
    } catch (error) {
      logger.error("Error retrieving all session details", error); // Log any error
      throw new Error("Error retrieving all session details");
    }
  }

  /**
   * Retrieves a specific session by its ID.
   * @param sessionId The ID of the session.
   * @returns SessionDetails object or undefined if not found.
   */
  async getSessionById(sessionId: string): Promise<SessionDetails | undefined> {
    try {
      logger.info(`Fetching session with ID: ${sessionId}`); // Log the action with ID
      const sessionDetailsRepository = this.dataSource.getRepository(SessionDetails);
      const sessionDetails = await sessionDetailsRepository.findOne({
        where: { sessionId },
        relations: ["payloads"],
      });
      if (!sessionDetails) {
        logger.warn(`Session with ID: ${sessionId} not found`); // Log warning if not found
      } else {
        logger.info(`Session with ID: ${sessionId} found`); // Log if found
      }
      return sessionDetails || undefined; // Return undefined if null
    } catch (error) {
      logger.error(`Error retrieving session with ID: ${sessionId}`, error); // Log error with ID
      throw new Error("Error retrieving session");
    }
  }

  /**
   * Checks if a session exists by its ID.
   * @param sessionId The ID of the session.
   * @returns True if the session exists, otherwise false.
   */
  async checkSessionById(sessionId: string): Promise<boolean> {
    try {
      logger.info(`Checking existence of session with ID: ${sessionId}`); // Log the check action
      const sessionDetailsRepository = this.dataSource.getRepository(SessionDetails);
      const sessionDetails = await sessionDetailsRepository.findOne({
        where: { sessionId },
      });
      const exists = sessionDetails !== null; // True if session exists
      if (exists) {
        logger.info(`Session with ID: ${sessionId} exists`); // Log if session exists
      } else {
        logger.warn(`Session with ID: ${sessionId} does not exist`); // Log warning if not found
      }
      return exists;
    } catch (error) {
      logger.error(`Error checking session existence with ID: ${sessionId}`, error); // Log error with ID
      throw new Error("Error checking session existence");
    }
  }

  /**
   * Creates a new session in the database.
   * @param sessionDetails The session data to be created.
   * @returns The created session details.
   */
  async createSession(sessionDetails: SessionDetails): Promise<SessionDetails> {
    try {
      logger.info("Creating new session", { sessionDetails }); // Log session creation
      const sessionDetailsRepository = this.dataSource.getRepository(SessionDetails);
      const savedSession = await sessionDetailsRepository.save(sessionDetails);
      logger.info(`Session created successfully with ID: ${savedSession.sessionId}`); // Log successful creation
      return savedSession;
    } catch (error) {
      logger.error("Error creating new session", error); // Log error during session creation
      throw new Error("Error creating new session");
    }
  }

  /**
   * Updates an existing session by its ID.
   * @param sessionId The ID of the session to update.
   * @param updatedDetails The updated session details.
   * @returns The updated session details.
   */
  async updateSession(
    sessionId: string,
    updatedDetails: SessionDetails
  ): Promise<SessionDetails> {
    try {
      logger.info(`Updating session with ID: ${sessionId}`, { updatedDetails }); // Log the update action
      const sessionDetailsRepository = this.dataSource.getRepository(SessionDetails);
      const existingSession = await sessionDetailsRepository.findOne({
        where: { sessionId },
      });

      if (!existingSession) {
        logger.warn(`Session with ID: ${sessionId} not found for update`); // Log if session doesn't exist
        throw new Error(`Session not found with ID: ${sessionId}`);
      }

      // Update existing session fields with the new data
      existingSession.npType = updatedDetails.npType;
      existingSession.npId = updatedDetails.npId;
      existingSession.domain = updatedDetails.domain;

      const updatedSession = await sessionDetailsRepository.save(existingSession);
      logger.info(`Session with ID: ${sessionId} updated successfully`); // Log successful update
      return updatedSession;
    } catch (error) {
      logger.error(`Error updating session with ID: ${sessionId}`, error); // Log error during update
      throw new Error("Error updating session");
    }
  }

  /**
   * Deletes a session by its ID.
   * @param sessionId The ID of the session to delete.
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      logger.info(`Deleting session with ID: ${sessionId}`); // Log the deletion action
      const sessionDetailsRepository = this.dataSource.getRepository(SessionDetails);
      await sessionDetailsRepository.delete({ sessionId });
      logger.info(`Session with ID: ${sessionId} deleted successfully`); // Log successful deletion
    } catch (error) {
      logger.error(`Error deleting session with ID: ${sessionId}`, error); // Log error during deletion
      throw new Error("Error deleting session");
    }
  }

  /**
   * Retrieves session details along with associated payloads.
   * @param sessionId The ID of the session.
   * @returns SessionDetails with associated payloads or undefined if not found.
   */
  async getSessionWithPayloads(
    sessionId: string
  ): Promise<SessionDetails | undefined> {
    try {
      logger.info(`Fetching session with ID: ${sessionId} and its payloads`); // Log the action
      const sessionDetailsRepository = this.dataSource.getRepository(SessionDetails);
      const sessionDetails = await sessionDetailsRepository.findOne({
        where: { sessionId },
        relations: ["payloads"], // Ensure payloads are included
      });

      if (!sessionDetails) {
        logger.warn(`Session with ID: ${sessionId} not found with payloads`); // Log warning if not found
      }

      return sessionDetails || undefined; // Return undefined if null
    } catch (error) {
      logger.error(`Error retrieving session with payloads for sessionId: ${sessionId}`, error); // Log error with sessionId
      throw new Error("Error retrieving session with payloads");
    }
  }

  /**
   * Retrieves payload details associated with a session.
   * @param sessionId The ID of the session.
   * @returns List of PayloadDetailsDTO objects.
   */
  async getPayloadDetails(
    sessionId: string | undefined
  ): Promise<PayloadDetailsDTO[]> {
    // Ensure sessionId is valid
    if (!sessionId) {
      logger.error("Session ID cannot be undefined"); // Log error for invalid session ID
      throw new Error("Session ID cannot be undefined");
    }

    try {
      logger.info(`Fetching payload details for session ID: ${sessionId}`); // Log the action
      const sessionDetailsRepository = this.dataSource.getRepository(SessionDetails);
      const sessionDetails = await sessionDetailsRepository.findOne({
        where: { sessionId },
        relations: ["payloads"],
      });

      if (!sessionDetails) {
        logger.warn(`SessionDetails not found for sessionId: ${sessionId}`); // Log warning if not found
        throw new Error(`SessionDetails not found for sessionId: ${sessionId}`);
      }

      const domain = sessionDetails.domain ?? "defaultDomain"; // Provide a default value for domain

      // Map payloads to PayloadDetailsDTO objects
      const payloadDetails = sessionDetails.payloads.map((payload) => {
        return new PayloadDetailsDTO(sessionDetails.npType, domain, payload);
      });

      logger.info(`Fetched ${payloadDetails.length} payload details for session ID: ${sessionId}`); // Log how many payloads were fetched
      return payloadDetails;
    } catch (error) {
      logger.error(`Error retrieving payload details for sessionId: ${sessionId}`, error); // Log error with sessionId
      throw new Error("Error retrieving payload details");
    }
  }
}