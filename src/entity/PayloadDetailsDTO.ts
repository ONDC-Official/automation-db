import { Payload } from "./Payload";
import { Type as SessionType } from "./SessionDetails";

export class PayloadDetailsDTO {
  npType: SessionType;
  domain: string;
  payload: Payload;

  constructor(npType: SessionType, domain: string, payload: Payload) {
    this.npType = npType;
    this.domain = domain;
    this.payload = payload;
  }

  getNpType(): SessionType {
    return this.npType;
  }

  setNpType(npType: SessionType): void {
    this.npType = npType;
  }

  getDomain(): string {
    return this.domain;
  }

  setDomain(domain: string): void {
    this.domain = domain;
  }

  getPayload(): Payload {
    return this.payload;
  }

  setPayload(payload: Payload): void {
    this.payload = payload;
  }
}