'use strict';
require('dotenv').config();
import {logger} from "../utils/logger";
logger.info("Starting opentelemetry tracing");
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: process.env.SERVICE_NAME
});
const sdk = new NodeSDK({
  traceExporter: new JaegerExporter({
    endpoint: process.env.TRACE_URL,

  }),
  instrumentations: [getNodeAutoInstrumentations()],
  resource,
});

sdk.start();
