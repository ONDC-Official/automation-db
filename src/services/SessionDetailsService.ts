import { SessionDetailsRepository } from "../repositories/SessionDetailsRepository";
import { PayloadRepository } from "../repositories/PayloadRepository";
import { SessionDetails } from "../entity/SessionDetails";
import { Payload } from "../entity/Payload";
import { PayloadDetailsDTO } from "../entity/PayloadDetailsDTO";
import logger from "../utils/logger";

// Define a type for session + populated payloads
type SessionWithPayloads = InstanceType<typeof SessionDetails> & {
  payloads: InstanceType<typeof Payload>[];
};

export class SessionDetailsService {
  private sessionRepo: SessionDetailsRepository;
  private payloadRepo: PayloadRepository;

  constructor(sessionRepo: SessionDetailsRepository, payloadRepo: PayloadRepository) {
    this.sessionRepo = sessionRepo;
    this.payloadRepo = payloadRepo;
  }

  async getAllSessions(): Promise<InstanceType<typeof SessionDetails>[]> {
    try {
      logger.info("Fetching all session details from MongoDB");
      return this.sessionRepo.findAll();
    } catch (error) {
      logger.error("Error retrieving all session details", error);
      throw new Error("Error retrieving all session details");
    }
  }

  async getSessionById(sessionId: string): Promise<InstanceType<typeof SessionDetails> | null> {
    try {
      logger.info(`Fetching session with ID: ${sessionId}`);
      return this.sessionRepo.findBySessionId(sessionId);
    } catch (error) {
      logger.error(`Error retrieving session with ID: ${sessionId}`, error);
      throw new Error("Error retrieving session");
    }
  }

  async checkSessionById(sessionId: string): Promise<boolean> {
    try {
      logger.info(`Checking existence of session with ID: ${sessionId}`);
      return this.sessionRepo.checkSessionById(sessionId);
    } catch (error) {
      logger.error(`Error checking session existence with ID: ${sessionId}`, error);
      throw new Error("Error checking session existence");
    }
  }

  async getPayloadDetails(sessionId: string): Promise<PayloadDetailsDTO[]> {
    if (!sessionId) throw new Error("Session ID cannot be undefined");

    try {
      logger.info(`Fetching payload details for session ID: ${sessionId}`);
      
      const session = (await this.sessionRepo.findWithPayloadsBySessionId(sessionId)) as SessionWithPayloads;
                   
      if (!session) {
        logger.warn(`SessionDetails not found for sessionId: ${sessionId}`);
        throw new Error(`SessionDetails not found for sessionId: ${sessionId}`);
      }

      const domain = session.domain ?? "defaultDomain";

      return session.payloads.map(
        (payload: InstanceType<typeof Payload>) => new PayloadDetailsDTO(session.sessionType, domain, payload)
      );
    } catch (error) {
      logger.error(`Error retrieving payload details for sessionId: ${sessionId}`, error);
      throw new Error("Error retrieving payload details");
    }
  }

  // -------------------- New Methods --------------------

  async createSession(sessionData: Partial<InstanceType<typeof SessionDetails>>): Promise<InstanceType<typeof SessionDetails>> {
    try {
      logger.info("Creating new session", { sessionData });
      const created = await this.sessionRepo.create(sessionData);
      logger.info(`Session created successfully with ID: ${created.sessionId}`);
      return created;
    } catch (error) {
      logger.error("Error creating session", error);
      throw new Error("Error creating session");
    }
  }

  async updateSession(sessionId: string, updatedData: Partial<InstanceType<typeof SessionDetails>>): Promise<InstanceType<typeof SessionDetails> | null> {
    try {
      logger.info(`Updating session with ID: ${sessionId}`, { updatedData });
      const updated = await this.sessionRepo.update(sessionId, updatedData);
      if (!updated) {
        logger.warn(`Session with ID: ${sessionId} not found for update`);
        throw new Error(`Session not found with ID: ${sessionId}`);
      }
      logger.info(`Session with ID: ${sessionId} updated successfully`);
      return updated;
    } catch (error) {
      logger.error(`Error updating session with ID: ${sessionId}`, error);
      throw new Error("Error updating session");
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      logger.info(`Deleting session with ID: ${sessionId}`);
      await this.sessionRepo.delete(sessionId);
      logger.info(`Session with ID: ${sessionId} deleted successfully`);
    } catch (error) {
      logger.error(`Error deleting session with ID: ${sessionId}`, error);
      throw new Error("Error deleting session");
    }
  }
}
