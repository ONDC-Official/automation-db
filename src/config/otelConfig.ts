// Enable strict mode automatically in ES modules
import dotenv from 'dotenv';
dotenv.config();


import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import logger from '../utils/logger';
logger.info('Starting opentelemetry tracing');

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: process.env.SERVICE_NAME,
});

const sdk = new NodeSDK({
traceExporter: new OTLPTraceExporter({
   url: process.env.TRACE_URL
 }),
  instrumentations: [getNodeAutoInstrumentations()],
  resource,
});

sdk.start();
