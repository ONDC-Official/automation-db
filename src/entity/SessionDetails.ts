import {
    Entity,
    PrimaryColumn,
    Column,
    OneToMany,
    CreateDateColumn,
    UpdateDateColumn,
  } from "typeorm";
  import { Payload } from "./Payload";
import { SessionType, Type } from "./ActionEnums";
  
  // Enum must be declared before being used in the class
  
  @Entity({ name: "session_details" })
  export class SessionDetails {
    @PrimaryColumn({ name: "session_id" })
    sessionId!: string;
  
    @Column({
      type: "enum",
      enum: Type,  // Now 'Type' is already declared
      name: "np_type",
    })
    npType!: Type;
  
    @Column({ name: "np_id", nullable: true })
    npId?: string;
  
    @Column({ name: "domain", nullable: true })
    domain?: string;
  
    @Column({ name: "version", nullable: true })
    version?: string;
  
    @Column({
      type: "enum",
      enum: SessionType,
      name: "session_type",
    })
    sessionType!: SessionType;
  
  
    @OneToMany(() => Payload, (payload) => payload.sessionDetails, {
      eager: false,
      cascade: true,
    })
    payloads!: Payload[];
  
    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date;
  
    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date;
  }

export { Type };
