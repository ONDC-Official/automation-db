import { Request, Response } from "express";
import { PayloadService } from "../services/PayloadService";
import { payloadRepository } from "../controllers/SessionDetailsController";
import { logger } from "../utils/logger"; // Importing logger utility

const payloadService = new PayloadService(payloadRepository);

/**
 * Fetches all payloads
 */
export const getAllPayloads = async (req: Request, res: Response) => {
  try {
    logger.info("Fetching all payloads"); // Log the action
    const payloads = await payloadService.getAllPayloads();
    res.json(payloads); // Return the payloads as JSON response
  } catch (error) {
    logger.error("Error retrieving payloads", error); // Log error with details
    res.status(500).send("Error retrieving payloads"); // Send internal server error
  }
};

/**
 * Fetches a specific payload by ID
 */
export const getPayloadById = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    logger.info(`Fetching payload with ID: ${id}`); // Log the action with ID
    const payload = await payloadService.getPayloadById(Number(id));
    if (payload) {
      res.json(payload); // Return the payload details if found
    } else {
      logger.warn(`Payload with ID: ${id} not found`); // Log warning if payload not found
      res.status(404).send("Payload not found"); // Send not found response
    }
  } catch (error) {
    logger.error(`Error retrieving payload with ID: ${id}`, error); // Log error with ID
    res.status(400).send("Error retrieving payload"); // Send bad request response
  }
};

/**
 * Fetches an array of payloads by Payload IDs
 */
export const getPayloadByPayloadIds = async (req: Request, res: Response) => {
  const payloadIds = req?.body?.payload_ids;
  try {
    logger.info(`Fetching payload with ID: ${payloadIds}`); // Log the action with ID
    const payloads = await payloadService.getPayloadByPayloadIds(payloadIds);
    if (payloads) {
      res.json({ payloads: payloads }); // Return the payload details if found
    } else {
      logger.warn(`Payload with ID: ${payloadIds} not found`); // Log warning if payload not found
      res.status(404).send("Payload not found"); // Send not found response
    }
  } catch (error) {
    logger.error(`Error retrieving payload with ID: ${payloadIds}`, error); // Log error with ID
    res.status(400).send("Error retrieving payload"); // Send bad request response
  }
};

/**
 * Creates a new payload with the provided data
 */
export const createPayload = async (req: Request, res: Response) => {
  const payloadData = req.body;

  try {
    logger.info("Creating new payload", { payloadData }); // Log the payload data being created
    const createdPayload = await payloadService.savePayload(payloadData);
    res.status(201).json(createdPayload); // Return the created payload as JSON response
  } catch (error: any) {
    logger.error("Error creating payload", error); // Log error during payload creation
    res.status(400).send("Error creating payload"); // Send bad request response
  }
};

/**
 * Updates an existing payload by ID
 */
export const updatePayload = async (req: Request, res: Response) => {
  const { id } = req.params;
  const payloadData = req.body;

  try {
    logger.info(`Updating payload with ID: ${id}`, { payloadData }); // Log the update details
    const updatedPayload = await payloadService.updatePayload(
      Number(id),
      payloadData
    );
    if (updatedPayload) {
      res.json(updatedPayload); // Return the updated payload if found
    } else {
      logger.warn(`Payload with ID: ${id} not found for update`); // Log warning if payload not found
      res.status(404).send("Payload not found"); // Send not found response
    }
  } catch (error) {
    logger.error(`Error updating payload with ID: ${id}`, error); // Log error during payload update
    res.status(400).send("Error updating payload"); // Send bad request response
  }
};

/**
 * Deletes a payload by ID
 */
export const deletePayload = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    logger.info(`Deleting payload with ID: ${id}`); // Log the deletion action
    await payloadService.deletePayload(Number(id));
    res.status(200).send("Deleted successfully from Postgres"); // Send no content response on successful deletion

  } catch (error) {
    logger.error(`Error deleting payload with ID: ${id}`, error); // Log error during payload deletion
    res.status(400).send("Error deleting payload"); // Send bad request response
  }
};

/**
 * Fetches a specific payload by transactionId
 */
export const getPayloadByTransactionId = async (
  req: Request,
  res: Response
) => {
  const { transactionId } = req.params;

  try {
    logger.info(`Fetching payload with transactionId: ${transactionId}`); // Log the action with transactionId
    const payload = await payloadService.getPayloadByTransactionId(
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
