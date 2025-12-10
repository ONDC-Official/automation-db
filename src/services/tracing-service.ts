import { trace } from '@opentelemetry/api';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { get } from 'lodash';

/**
 * Middleware factory that creates a tracing span with optional dot-notated paths.
 * 
 * @param transaction_id_path - Dot path to transaction_id in req.body (default: 'context.transaction_id')
 * @param session_id - Dot path to transaction_id in req.body (default: 'context.transaction_id')
 * @param bap_id_path - Dot path to bap_id in req.body (default: 'context.bap_id')
 * @param bpp_id_path - Dot path to bpp_id in req.body (default: 'context.bpp_id')
 * @returns Express middleware
 */
export function otelTracing(
  transaction_id_path: string = 'transaction_id',
  session_id_path: string = 'session_id',
  bap_id_path: string = 'context.bap_id',
  bpp_id_path: string = 'context.bpp_id'
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const transaction_id: string | undefined = get(req, transaction_id_path);
    const session_id: string | undefined = get(req, session_id_path);
    const bap_id: string | undefined = get(req, bap_id_path);
    const bpp_id: string | undefined = get(req, bpp_id_path);

    const tracer = trace.getTracer(process.env.SERVICE_NAME || 'default-service');

    const span = tracer.startSpan("trace_span", {
      attributes: {
        'transaction_id': transaction_id || '',
        'session_id': session_id || '',
        'bap_id': bap_id || '',
        'bpp_id': bpp_id || '',
      }
    });

      span.end();
      
      next();

  };
}

export default otelTracing;
