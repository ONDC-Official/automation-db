import { DataSource, Repository } from "typeorm";
import { Payload } from "../entity/Payload";

export class PayloadRepository {
  private repository: Repository<Payload>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(Payload);
  }

  // Find Payload by transactionId
  async findByTransactionId(transactionId: string): Promise<Payload | null> {
    return this.repository.findOne({ where: { transactionId } });
  }

  // Find Payload by transactionId
  async findByPayloadId(payloadId: string): Promise<Payload | null> {
    return this.repository.findOne({ where: { payloadId } });
  }
  // Find Payload by sessionId
  async findBySessionDetailsSessionId(sessionId: string): Promise<Payload[]> {
    return this.repository.find({ where: { sessionDetails: { sessionId } } });
  }
}
