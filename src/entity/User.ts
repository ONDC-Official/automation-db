import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from "typeorm";
import { Action } from "./ActionEnums";

@Entity({ name: "user" })
export class User {
  @PrimaryGeneratedColumn()
  id!: number; // Use definite assignment assertion

  @Column({ name: "message_id", nullable: true })
  messageId?: string; // Optional, can be undefined

  @Column({ name: "transaction_id", nullable: true })
  transactionId?: string; // Optional, can be undefined

  @Column({ name: "flow_id", nullable: true })
  flowId?: string; // Optional, can be undefined

  @Column({ name: "contact", nullable: true })
  contact?: string; // Optional, can be undefined

  @Column({ name: "num", nullable: true })
  num?: string; // Optional, can be undefined

  @Column({ name: "section", nullable: true })
  section?: string; // Optional, can be undefined

  @Column({ name: "surname", nullable: true })
  surname?: string; // Optional, can be undefined


  @Column({ name: "school", nullable: true })
  school?: string; // Optional, can be undefined

  @Column({ name: "payload_id", nullable: true })
  payloadId?: string; // Optional, can be undefined

  @Column({
    type: "enum",
    enum: Action,
    nullable: true,
  })
  action?: Action; // Optional, can be undefined

  @Column({ name: "bpp_id", nullable: true })
  bppId?: string; // Optional, can be undefined

  @Column({ name: "bap_id", nullable: true })
  bapId?: string; // Optional, can be undefined

  @Column("simple-json", { name: "json_request", nullable: true })
  jsonRequest?: Record<string, unknown>; // Optional, can be undefined

  @Column("simple-json", { name: "json_response", nullable: true })
  jsonResponse?: Record<string, unknown>; // Optional, can be undefined

  @Column({ name: "http_status", nullable: true })
  httpStatus?: number; // Optional, can be undefined



}
