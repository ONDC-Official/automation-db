import { Payload } from "../entity/Payload";

export class PayloadRepository {
   async findByTransactionId(transactionId: string) {
    // returns all payloads for the given transactionId
    return Payload.find({ transactionId });
  }

  async findOneByTransactionId(transactionId: string) {
    // returns just one payload for the given transactionId
    return Payload.findOne({ transactionId });
  }

  async findByPayloadId(payloadId: string) {
    return Payload.findOne({ payloadId });
  }
  
  async findBySessionId(sessionId: string) {
    return Payload.find({ sessionId: sessionId });
  }

  async findAll() {
    return Payload.find();
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
