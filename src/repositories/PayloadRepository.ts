import { Payload } from "../entity/Payload";

export class PayloadRepository {
  async findByTransactionId(transactionId: string) {
    return Payload.findOne({ transactionId }).populate("session_id");
  }

  async findByPayloadId(payloadId: string) {
    return Payload.findOne({ payloadId }).populate("session_id");
  }

  async findBySessionDetailsSessionId(sessionId: string) {
    return Payload.find({ sessionDetails: sessionId }).populate("session_id");
  }

  async findAll() {
    return Payload.find().populate("session_id");
  }

  async create(payloadData: any) {
    return Payload.create(payloadData);
  }

  async update(id: string, updatedData: any) {
    return Payload.findByIdAndUpdate(id, updatedData, { new: true }).populate("sessionDetails");
  }

  async delete(id: string) {
    return Payload.findByIdAndDelete(id);
  }
}
