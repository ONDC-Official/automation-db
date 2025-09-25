import { In, Repository } from "typeorm";
import { Payload } from "../entity/Payload"; // Adjust the path accordingly
import logger from '../utils/logger'; // Importing logger utility

export class PayloadService {
  private payloadRepository: Repository<Payload>;

  constructor(payloadRepository: Repository<Payload>) {
    this.payloadRepository = payloadRepository;
  }

  /**
   * Retrieves all payloads from the database.
   * @returns List of payloads.
   */
  async getAllPayloads(): Promise<Payload[]> {
    try {
      logger.info("Fetching all payloads from database"); // Log the action
      const payloads = await this.payloadRepository.find();
      logger.info(`Found ${payloads.length} payload(s)`); // Log how many payloads were found
      return payloads;
    } catch (error) {
      logger.error("Error retrieving all payloads", error); // Log any error
      throw new Error("Error retrieving all payloads");
    }
  }

  /**
   * Retrieves a specific payload by its ID.
   * @param id The ID of the payload.
   * @returns Payload object or null if not found.
   */
  async getPayloadById(id: number): Promise<Payload | null> {
    try {
      logger.info(`Fetching payload with ID: ${id}`); // Log the action with ID
      const payload = await this.payloadRepository.findOne({ where: { id } });
      if (!payload) {
        logger.warn(`Payload with ID: ${id} not found`); // Log warning if payload not found
      } else {
        logger.info(`Payload with ID: ${id} found`); // Log if payload is found
      }
      return payload;
    } catch (error) {
      logger.error(`Error retrieving payload with ID: ${id}`, error); // Log error with ID
      throw new Error("Error retrieving payload");
    }
  }

  /**
   * Retrieves a list of payloads by its payload IDs.
   * @param payloadIds An array of payload IDs to be fetched.
   * @returns An array of Payload objects or undefined if not found.
   */
  async getPayloadByPayloadIds(payloadIds: string[]): Promise<Payload[] | undefined> {
    try {
      logger.info(`Fetching payloads with payloadIds: ${payloadIds}`); // Log the action with transactionId
  
      const payloads = await this.payloadRepository.find({
        where: { payloadId: In(payloadIds) }, // Use the In operator to query multiple payloadIds
      });
  
      if (!payloads || payloads.length === 0) {
        logger.warn(`No payloads found for payloadIds: ${payloadIds}`); // Log warning if not found
        return undefined;
      } else {
        logger.info(`Payloads found for payloadIds: ${payloadIds}`); // Log if found
      }
  
      return payloads;
    } catch (error) {
      logger.error(
        `Error retrieving payloads with payloadIds: ${payloadIds}`,
        error
      ); // Log error with transactionId
      throw new Error("Error retrieving payloads");
    }
  }

  /**
   * Retrieves a specific payload by its transaction ID.
   * @param transactionId The transaction ID of the payload.
   * @returns Payload object or undefined if not found.
   */
  async getPayloadByTransactionId(
    transactionId: string
  ): Promise<Payload | undefined> {
    try {
      logger.info(`Fetching payload with transactionId: ${transactionId}`); // Log the action with transactionId
      const payload = await this.payloadRepository.findOne({
        where: { transactionId },
      });
      if (!payload) {
        logger.warn(`Payload with transactionId: ${transactionId} not found`); // Log warning if not found
      } else {
        logger.info(`Payload with transactionId: ${transactionId} found`); // Log if found
      }
      return payload ?? undefined;
    } catch (error) {
      logger.error(
        `Error retrieving payload with transactionId: ${transactionId}`,
        error
      ); // Log error with transactionId
      throw new Error("Error retrieving payload");
    }
  }
  /**
   * Saves a new payload to the database.
   * @param payload The payload data to be saved.
   * @returns The saved payload.
   */
  async savePayload(payload: Payload): Promise<Payload> {
    try {
      logger.info("Saving new payload", { payload }); // Log the payload data being saved
      const savedPayload = await this.payloadRepository.save(payload);
      logger.info(`Payload saved successfully with ID: ${savedPayload.id}`); // Log the successful save
      return savedPayload;
    } catch (error) {
      logger.error("Error saving payload", error); // Log error during save
      throw new Error("Error saving payload");
    }
  }

  /**
   * Updates an existing payload by its ID.
   * @param id The ID of the payload to update.
   * @param updatedPayload The updated payload data.
   * @returns The updated payload.
   */
  async updatePayload(id: number, updatedPayload: Payload): Promise<Payload> {
    try {
      logger.info(`Updating payload with ID: ${id}`, { updatedPayload }); // Log the update action with ID and data
      const existingPayload = await this.payloadRepository.findOne({
        where: { id },
      });
      if (!existingPayload) {
        logger.warn(`Payload with ID: ${id} not found for update`); // Log if payload doesn't exist
        throw new Error(`Payload not found with ID: ${id}`);
      }

      // Update existing payload fields with the new data
      existingPayload.messageId = updatedPayload.messageId;
      existingPayload.transactionId = updatedPayload.transactionId;
      existingPayload.action = updatedPayload.action;
      existingPayload.payloadId = updatedPayload.payloadId;
      existingPayload.bppId = updatedPayload.bppId;
      existingPayload.bapId = updatedPayload.bapId;
      existingPayload.jsonRequest = updatedPayload.jsonRequest;
      existingPayload.jsonResponse = updatedPayload.jsonResponse;
      existingPayload.httpStatus = updatedPayload.httpStatus;

      const updated = await this.payloadRepository.save(existingPayload);
      logger.info(`Payload with ID: ${id} updated successfully`); // Log successful update
      return updated;
    } catch (error) {
      logger.error(`Error updating payload with ID: ${id}`, error); // Log error during update
      throw new Error("Error updating payload");
    }
  }

  /**
   * Deletes a payload by its ID.
   * @param id The ID of the payload to delete.
   */
  async deletePayload(id: number): Promise<void> {
    try {
      logger.info(`Attempting to delete payload with ID: ${id}`); // Log the deletion action
  
      // Check if the payload exists
      const payload = await this.payloadRepository.findOne({ where: { id } });
      if (!payload) {
        logger.warn(`Payload with ID: ${id} does not exist`); // Log that the payload was not found
        throw new Error(`Payload with ID: ${id} not found`);
      }
  
      // Proceed with deletion
      await this.payloadRepository.delete(id);
      logger.info(`Payload with ID: ${id} deleted successfully`); // Log successful deletion
    } catch (error:any) {
      logger.error(`Error deleting payload with ID: ${id}`, error?.message); // Log error during deletion
      throw new Error("Error deleting payload");
    }
  }
}
