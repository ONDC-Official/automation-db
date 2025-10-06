import logger from "../utils/logger";
import { PayloadRepository } from "../repositories/PayloadRepository";

export class PayloadService {
  constructor(private payloadRepo: PayloadRepository) {}

  async getAllPayloads() {
    try {
      logger.info("Fetching all payloads from database");
      const payloads = await this.payloadRepo.findAll();
      logger.info(`Found ${payloads.length} payload(s)`);
      return payloads;
    } catch (error) {
      logger.error("Error retrieving all payloads", error);
      throw new Error("Error retrieving all payloads");
    }
  }

  async getPayloadById(id: string) {
    try {
      logger.info(`Fetching payload with ID: ${id}`);
      const payload = await this.payloadRepo.findByPayloadId(id);
      if (!payload) logger.warn(`Payload with ID: ${id} not found`);
      return payload;
    } catch (error) {
      logger.error(`Error retrieving payload with ID: ${id}`, error);
      throw new Error("Error retrieving payload");
    }
  }

  async getPayloadByTransactionId(transactionId: string) {
    try {
      logger.info(`Fetching payload with transactionId: ${transactionId}`);
      const payload = await this.payloadRepo.findByTransactionId(transactionId);
      if (!payload) logger.warn(`Payload with transactionId: ${transactionId} not found`);
      return payload;
    } catch (error) {
      logger.error(`Error retrieving payload with transactionId: ${transactionId}`, error);
      throw new Error("Error retrieving payload");
    }
  }

  async getPayloadByPayloadIds(payloadIds: string[]) {
    try {
      logger.info(`Fetching payloads with payloadIds: ${payloadIds}`);
      const payloads = await Promise.all(payloadIds.map(id => this.payloadRepo.findByPayloadId(id)));
      const foundPayloads = payloads.filter(p => p != null);
      if (foundPayloads.length === 0) logger.warn(`No payloads found for payloadIds: ${payloadIds}`);
      return foundPayloads;
    } catch (error) {
      logger.error(`Error retrieving payloads with payloadIds: ${payloadIds}`, error);
      throw new Error("Error retrieving payloads");
    }
  }

  async savePayload(payloadData: any) {
    try {
      logger.info("Saving new payload", { payloadData });
      const payload = await this.payloadRepo.create(payloadData);
      logger.info(`Payload saved successfully with ID: ${payload._id}`);
      return payload;
    } catch (error) {
      logger.error("Error saving payload", error);
      throw new Error("Error saving payload");
    }
  }

  async updatePayload(id: string, updatedData: any) {
    try {
      logger.info(`Updating payload with ID: ${id}`, { updatedData });
      const payload = await this.payloadRepo.update(id, updatedData);
      if (!payload) throw new Error(`Payload not found with ID: ${id}`);
      logger.info(`Payload with ID: ${id} updated successfully`);
      return payload;
    } catch (error) {
      logger.error(`Error updating payload with ID: ${id}`, error);
      throw new Error("Error updating payload");
    }
  }

  async deletePayload(id: string) {
    try {
      logger.info(`Deleting payload with ID: ${id}`);
      const payload = await this.payloadRepo.delete(id);
      if (!payload) throw new Error(`Payload not found with ID: ${id}`);
      logger.info(`Payload with ID: ${id} deleted successfully`);
    } catch (error) {
      logger.error(`Error deleting payload with ID: ${id}`, error);
      throw new Error("Error deleting payload");
    }
  }
}
