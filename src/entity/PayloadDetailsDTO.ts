import { SessionType, Type } from "./ActionEnums";
import { Payload } from "./Payload";

export class PayloadDetailsDTO {
  npType: string;
  domain: string;
  payload: InstanceType<typeof Payload>; // Keep Payload as type

  constructor(npType: string, domain: string, payload: InstanceType<typeof Payload> | any) {
    this.npType = npType;
    this.domain = domain;
    this.payload = payload;
  }

  getNpType(): string {
    return this.npType;
  }

  setNpType(npType: Type): void {
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
