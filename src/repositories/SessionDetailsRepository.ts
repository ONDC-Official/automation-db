import { SessionDetails, ISessionDetails } from "../entity/SessionDetails";

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
    return SessionDetails.findOneAndUpdate(
      { sessionId },
      { $push: { flows: flow } },
      { new: true }
    ).exec();
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

}
