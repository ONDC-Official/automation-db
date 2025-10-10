import { SessionType } from "./ActionEnums";
import { Payload } from "./Payload";

export class PayloadDetailsDTO {
  npType: SessionType;
  domain: string;
  payload: InstanceType<typeof Payload>; // Keep Payload as type

  constructor(npType: SessionType, domain: string, payload: InstanceType<typeof Payload> | any) {
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

  getPayload(): InstanceType<typeof Payload> {
    return this.payload;
  }

  setPayload(payload: InstanceType<typeof Payload> | any): void {
    this.payload = payload;
  }
}
