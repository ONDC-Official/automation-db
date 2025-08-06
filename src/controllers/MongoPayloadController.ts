import { Payload } from "../entity/Payload";
import { MongoPayload } from "../models/MongoPayload"; // adjust path as needed

export async function hydratePayloadsWithMongoJson(
  payloads: Payload[]
): Promise<Payload[]> {
  const hydratedPayloads: Payload[] = [];

  for (const payload of payloads) {
    const clonedPayload = { ...payload }; // avoid mutating the original

    // Replace jsonRequest ID with actual JSON if present
    if (clonedPayload.jsonRequest && typeof clonedPayload.jsonRequest === "string") {
      try {
        const mongoReq = await MongoPayload.findById(clonedPayload.jsonRequest);
        clonedPayload.jsonRequest = mongoReq?.data ?? undefined;
      } catch (err) {
        console.warn(`⚠️ Could not fetch jsonRequest for ID: ${clonedPayload.jsonRequest}`);
        clonedPayload.jsonRequest = undefined;
      }
    }

    // Replace jsonResponse ID with actual JSON if present
    if (clonedPayload.jsonResponse && typeof clonedPayload.jsonResponse === "string") {
      try {
        const mongoRes = await MongoPayload.findById(clonedPayload.jsonResponse);
        clonedPayload.jsonResponse = mongoRes?.data ?? undefined;
      } catch (err) {
        console.warn(`⚠️ Could not fetch jsonResponse for ID: ${clonedPayload.jsonResponse}`);
        clonedPayload.jsonResponse = undefined;
      }
    }

    hydratedPayloads.push(clonedPayload);
  }

  return hydratedPayloads;
}


export async function hydrateSinglePayloadWithMongoJson(
    payload: Payload
  ): Promise<Payload> {
    const clonedPayload = { ...payload }; // avoid mutating original
  
    // Fetch and replace jsonRequest if it's a string ID
    if (clonedPayload.jsonRequest && typeof clonedPayload.jsonRequest === "string") {
      try {
        const mongoReq = await MongoPayload.findById(clonedPayload.jsonRequest);
        clonedPayload.jsonRequest = mongoReq?.data ?? undefined;
      } catch (err) {
        console.warn(`⚠️ Could not fetch jsonRequest for ID: ${clonedPayload.jsonRequest}`);
        clonedPayload.jsonRequest = undefined;
      }
    }
  
    // Fetch and replace jsonResponse if it's a string ID
    if (clonedPayload.jsonResponse && typeof clonedPayload.jsonResponse === "string") {
      try {
        const mongoRes = await MongoPayload.findById(clonedPayload.jsonResponse);
        clonedPayload.jsonResponse = mongoRes?.data ?? undefined;
      } catch (err) {
        console.warn(`⚠️ Could not fetch jsonResponse for ID: ${clonedPayload.jsonResponse}`);
        clonedPayload.jsonResponse = undefined;
      }
    }
  
    return clonedPayload;
  }

  export async function deletePayloadsFromMongo(
    jsonRequestId?: string | null,
    jsonResponseId?: string | null
  ): Promise<void> {
    const deletions = [];
  
    if (jsonRequestId) {
      deletions.push(MongoPayload.findByIdAndDelete(jsonRequestId));
    }
  
    if (jsonResponseId) {
      deletions.push(MongoPayload.findByIdAndDelete(jsonResponseId));
    }
  
    try {
      await Promise.all(deletions);
      console.log("Deleted payloads from MongoDB successfully");
    } catch (error) {
      console.error("Error deleting payloads from MongoDB:", error);
      throw new Error("Failed to delete one or more payloads from MongoDB");
    }
  }