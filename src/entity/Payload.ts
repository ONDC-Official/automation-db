import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { SessionDetails } from "./SessionDetails";
import { Action } from "./ActionEnums";

@Entity({ name: "payload" })
export class Payload {
  @PrimaryGeneratedColumn()
  id!: number; // Use definite assignment assertion

  @Column({ name: "message_id", nullable: true })
  messageId?: string; // Optional, can be undefined

  @Column({ name: "transaction_id", nullable: true })
  transactionId?: string; // Optional, can be undefined

  @Column({ name: "flow_id", nullable: true })
  flowId?: string; // Optional, can be undefined

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


  @Column({ name: "status", nullable: true })
  status?: string; // Optional, can be undefined

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date; // Use definite assignment assertion

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date; // Use definite assignment assertion

  @ManyToOne(
    () => SessionDetails,
    (sessionDetails) => sessionDetails.payloads,
    {
      eager: false,
      nullable: true,
    }
  )
  @JoinColumn({ name: "session_id", referencedColumnName: "sessionId" })
  sessionDetails?: SessionDetails; // Optional, can be undefined
}
