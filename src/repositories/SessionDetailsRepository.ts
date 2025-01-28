import { Repository, DataSource } from "typeorm";
import { SessionDetails } from "../entity/SessionDetails";

export class SessionDetailsRepository {
  private repository: Repository<SessionDetails>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(SessionDetails);
  }

  // Find SessionDetails by sessionId
  async findBySessionId(sessionId: string): Promise<SessionDetails | null> {
    return this.repository.findOne({ where: { sessionId } });
  }

  // Find SessionDetails by sessionId and eagerly load related payloads
  async findWithPayloadsBySessionId(sessionId: string): Promise<SessionDetails | null> {
    return this.repository.findOne({
      where: { sessionId },
      relations: ["payloads"], // Eagerly load the 'payloads' relation
    });
  }
}