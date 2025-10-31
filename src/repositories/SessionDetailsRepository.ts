import { SessionDetails, ISessionDetails } from "../entity/SessionDetails";

export class SessionDetailsRepository {
  // Find SessionDetails by sessionId
  async findBySessionId(sessionId: string) {
    return SessionDetails.findOne({ sessionId: sessionId }).exec();
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
  async findByNpTypeAndNpId(npType: string, npId: string) {
  return SessionDetails.find({ np_type: npType, np_id: npId }).exec();
}
}
