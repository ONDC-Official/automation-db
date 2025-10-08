import { Request, Response } from "express";
import { PayloadRepository } from "../repositories/PayloadRepository";
import { PayloadService } from "../services/PayloadService";
import logger from "../utils/logger";

// Initialize the repository and service
const payloadRepo = new PayloadRepository();
const payloadService = new PayloadService(payloadRepo);

// ---------------------- Controller Methods ----------------------

/**
 * Fetch all payloads
 */
export const getAllPayloads = async (req: Request, res: Response) => {
  try {
    logger.info("Fetching all payloads");
    const payloads = await payloadService.getAllPayloads();
    res.json(payloads);
  } catch (error) {
    logger.error("Error retrieving payloads", error);
    res.status(500).send("Error retrieving payloads");
  }
};

/**
 * Fetch payload by Mongo _id
 */
export const getPayloadById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const payload = await payloadService.getPayloadById(id);
    if (!payload) {
      res.status(404).send("Payload not found"); // just send the response
      return; // stop execution (void)
    }
    res.json(payload);
  } catch (error) {
    res.status(400).send("Error retrieving payload");
  }
};

/**
 * Fetch payloads by payloadIds
 */
export const getPayloadByPayloadIds = async (req: Request, res: Response): Promise<void> => {
  const payloadIds = req.body.payload_ids;
  try {
    logger.info(`Fetching payloads with payloadIds: ${payloadIds}`);
    const payloads = await payloadService.getPayloadByPayloadIds(payloadIds);

    if (!payloads || payloads.length === 0) {
      logger.warn(`No payloads found for payloadIds: ${payloadIds}`);
      res.status(404).send("Payloads not found");
      return; // stop further execution
    }

    res.json({ payloads });
  } catch (error) {
    logger.error(`Error retrieving payloads with payloadIds: ${payloadIds}`, error);
    res.status(400).send("Error retrieving payloads");
  }
};

/**
 * Create a new payload
 */
export const createPayload = async (req: Request, res: Response) => {
  const payloadData = req.body;
  try {
    logger.info("Creating new payload", { payloadData });
    const createdPayload = await payloadService.savePayload(payloadData);
    res.status(201).json(createdPayload);
  } catch (error) {
    logger.error("Error creating payload", error);
    res.status(400).send("Error creating payload");
  }
};

/**
 * Update payload by _id
 */
export const updatePayload = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const payloadData = req.body;
  try {
    logger.info(`Updating payload with ID: ${id}`, { payloadData });
    const updatedPayload = await payloadService.updatePayload(id, payloadData);

    if (!updatedPayload) {
      logger.warn(`Payload with ID: ${id} not found for update`);
      res.status(404).send("Payload not found");
      return; // stop execution cleanly
    }

    res.json(updatedPayload);
  } catch (error) {
    logger.error(`Error updating payload with ID: ${id}`, error);
    res.status(400).send("Error updating payload");
  }
};

/**
 * Delete payload by _id
 */
export const deletePayload = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    logger.info(`Deleting payload with ID: ${id}`);
    await payloadService.deletePayload(id);
    res.status(200).send("Deleted successfully");
  } catch (error) {
    logger.error(`Error deleting payload with ID: ${id}`, error);
    res.status(400).send("Error deleting payload");
  }
};

/**
 * Fetch payload by transactionId
 */
export const getPayloadByTransactionId = async (req: Request, res: Response): Promise<void> => {
  const { transactionId } = req.params;
  try {
    logger.info(`Fetching payload with transactionId: ${transactionId}`);
    const payload = await payloadService.getPayloadByTransactionId(transactionId);

    if (!payload) {
      logger.warn(`Payload with transactionId: ${transactionId} not found`);
      res.status(404).send("Payload not found for transactionId");
      return; // stop execution
    }

    res.json(payload);
  } catch (error) {
    logger.error(`Error retrieving payload with transactionId: ${transactionId}`, error);
    res.status(400).send("Error retrieving payload");
  }
};

export const getPayloadsByTransactionId = async (
  req: Request,
  res: Response
) => {
  const { transactionId } = req.params;

  try {
    logger.info(`Fetching payload with transactionId: ${transactionId}`); // Log the action with transactionId
    const payload = await payloadService.getPayloadsByTransactionId(
      transactionId
    );
    if (payload) {
      res.json(payload); // Return the payload details if found
    } else {
      logger.warn(`Payload with transactionId: ${transactionId} not found`); // Log warning if not found
      res.status(404).send("Payload not found for transactionId"); // Send not found response
    }
  } catch (error) {
    logger.error(
      `Error retrieving payload with transactionId: ${transactionId}`,
      error
    ); // Log error with transactionId
    res.status(400).send("Error retrieving payload"); // Send bad request response
  }
};
