import { SessionDetails, ISessionDetails } from "../entity/SessionDetails";
import { UserModel } from "../entity/User";

export class SessionDetailsRepository {
  // Find SessionDetails by sessionId
  async findBySessionId(sessionId: string) {
    return SessionDetails.findOne({ sessionId: sessionId }).exec();
  }

  async findByUserId(userId: string) {
    return SessionDetails.find({ userId }).exec();
  }

  // Find SessionDetails by sessionId and populate related payloads
  async findWithPayloadsBySessionId(sessionId: string) {
    return SessionDetails.findOne({ sessionId: sessionId }).exec();
  }

  // Fetch all sessions
  async findAll() {
    return SessionDetails.find().exec();
  }

  // Create a new session
  async create(sessionData: Partial<ISessionDetails>) {
    const session = new SessionDetails(sessionData);
    return session.save();
  }

  async update(sessionId: string, updateData: Partial<ISessionDetails>) {
    return SessionDetails.findOneAndUpdate(
      { sessionId: sessionId },
      updateData,
      { new: true }
    ).exec();
  }

  async delete(sessionId: string) {
    return SessionDetails.findOneAndDelete({ sessionId: sessionId }).exec();
  }

  // Check if a session exists
  async checkSessionById(sessionId: string): Promise<boolean> {
    const session = await SessionDetails.exists({ sessionId: sessionId });
    return !!session;
  }

  // Find by Mongo ObjectId if needed
  async findSessionById(id: string) {
    return SessionDetails.findById(id).exec();
  }

  // -------------------------
  // 🧩 Flow Management
  // -------------------------

  // Add a new flow to a session
  async addFlowToSession(sessionId: string, flow: { id: string; status: string; payloads?: string[] }) {
    // 1️⃣ Check if session exists
    const session = await SessionDetails.findOne({ sessionId }).exec();
    if (!session) {
      throw new Error(`Session with ID ${sessionId} not found`);
    }

    // 2️⃣ Check if flow already exists in that session
    const existingFlow = session.flows?.find((f: any) => f.id === flow.id);
    if (existingFlow) {
      return existingFlow
    }

    // 3️⃣ Atomically push flow (avoids race conditions if many writes happen)
    const updated = await SessionDetails.findOneAndUpdate(
      { sessionId, "flows.id": { $ne: flow.id } }, // ensure flow.id not present
      { $push: { flows: flow } },
      { new: true }
    ).exec();

    // 4️⃣ Handle unexpected null (edge race case)
    if (!updated) {
      throw new Error(`Failed to add flow — it may have been added concurrently`);
    }

    return updated;
  }

  // Update a flow’s status or payloads
  async updateFlowInSession(
    sessionId: string,
    flowId: string,
    updateData: Partial<{ status: string; payloads: string[] }>
  ) {
    return SessionDetails.findOneAndUpdate(
      { sessionId, "flows.id": flowId },
      {
        $set: {
          ...(updateData.status && { "flows.$.status": updateData.status }),
          ...(updateData.payloads && { "flows.$.payloads": updateData.payloads }),
        },
      },
      { new: true }
    ).exec();
  }

  // Remove a flow from session
  async removeFlowFromSession(sessionId: string, flowId: string) {
    return SessionDetails.findOneAndUpdate(
      { sessionId },
      { $pull: { flows: { id: flowId } } },
      { new: true }
    ).exec();
  }

  async findByNpTypeAndNpId(npType: string, npId: string) {
    return SessionDetails.find({ npType: npType, npId: npId }).exec();
  }

  // Get all distinct npId (subscriber URLs) for a given userId (githubId)
  async findDistinctNpIdsByUserId(userId: string): Promise<string[]> {
    // Step 1: Find the user and get their sessionIds
    const user = await UserModel.findOne({ userId: userId }).exec();
    if (!user || !user.sessionIds || user.sessionIds.length === 0) {
      return [];
    }

    // Step 2: Get distinct npId values from those sessions
    const results = await SessionDetails.distinct("npId", {
      sessionId: { $in: user.sessionIds },
      npId: { $ne: null, $exists: true },
    }).exec();

    return results.filter(Boolean) as string[];
  }

  // Upsert a session — creates it if not found, updates fields if it exists
  async upsertSession(
    sessionId: string,
    data: {
      userId?: string;
      npType: string;
      npId?: string;
      domain?: string;
      version?: string;
    }
  ) {
    return SessionDetails.findOneAndUpdate(
      { sessionId },
      {
        $setOnInsert: { sessionId, sessionType: "AUTOMATION" },
        $set: data,
      },
      { upsert: true, new: true }
    ).exec();
  }

  // Save flowSummary and flowMap (pass/fail per flow) after report generation
  async saveSessionAnalytics(
    sessionId: string,
    flowSummary: Record<string, { total: number; completed: number }>,
    flowMap: Record<string, "PASS" | "FAIL">
  ) {
    return SessionDetails.findOneAndUpdate(
      { sessionId },
      {
        $set: {
          flowSummary,
          flowMap,
          reportExists: true,
        },
      },
      { new: true }
    ).exec();
  }
}
