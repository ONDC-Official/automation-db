import { SessionDetails, ISessionDetails } from "../entity/SessionDetails";

export class SessionDetailsRepository {
  // Find SessionDetails by sessionId
  async findBySessionId(sessionId: string) {
    return SessionDetails.findOne({ session_id: sessionId }).exec();
  }

  // Find SessionDetails by sessionId and populate related payloads
  async findWithPayloadsBySessionId(sessionId: string) {
    return SessionDetails.findOne({ session_id: sessionId }).populate("payloads").exec();
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

  // Update a session by session_id
  async update(sessionId: string, updateData: Partial<ISessionDetails>) {
    return SessionDetails.findOneAndUpdate(
      { session_id: sessionId },
      updateData,
      { new: true }
    ).exec();
  }

  // Delete a session by session_id
  async delete(sessionId: string) {
    return SessionDetails.findOneAndDelete({ session_id: sessionId }).exec();
  }

  // Check if a session exists
  async checkSessionById(sessionId: string): Promise<boolean> {
    const session = await SessionDetails.exists({ session_id: sessionId });
    return !!session;
  }

  // Find by Mongo ObjectId if needed
  async findSessionById(id: string) {
    return SessionDetails.findById(id).exec();
  }
}
