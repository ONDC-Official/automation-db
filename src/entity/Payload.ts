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

  @Column({ name: "payload_id", nullable: false, unique:true })
  payloadId!: string; //mandatory

  @Column({
    name: "action",
    nullable: true,
  })
  action?: string; // Optional, can be undefined

  @Column({ name: "bpp_id", nullable: true })
  bppId?: string; // Optional, can be undefined

  @Column({ name: "bap_id", nullable: true })
  bapId?: string; // Optional, can be undefined

  @Column({ name: "request_header", nullable: true })
  reqHeader?: string; // Optional, can be undefined

  @Column("text", { name: "json_request", nullable: true })
  jsonRequest?: string;

  @Column("text", { name: "json_response", nullable: true })
  jsonResponse?: string;

  @Column({ name: "http_status", nullable: true })
  httpStatus?: number; // Optional, can be undefined


  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date; // Use definite assignment assertion

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date; // Use definite assignment assertion

  @Column({ name: "session_id", nullable: true })
  sessionId?: string;

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
