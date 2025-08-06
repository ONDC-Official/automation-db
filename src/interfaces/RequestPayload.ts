export interface RequestPayload {
    messageId?: string | null;
    transactionId?: string | null;
    flowId?: string | null;
    payloadId: string;
    action?: string | null;
    bppId?: string | null;
    bapId?: string | null;
    reqHeader?: string | null;
    jsonRequest?: Record<string, unknown> | string | null;  
    jsonResponse?: Record<string, unknown> | string | null; 
    httpStatus?: number | null;
    sessionId?: string | null;
    createdAt?: Date; 
    updatedAt?: Date; 
  }
