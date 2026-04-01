import type { NextFunction, Request, Response } from 'express';
import { classifyBetaFlow, recordBetaFlowEvent } from '../services/telemetry/betaFlowTelemetry';

export function betaFlowTelemetryMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const flow = classifyBetaFlow(req.method, req.originalUrl || req.url);
    recordBetaFlowEvent(flow, res.statusCode, Date.now() - start, {
      method: req.method,
      path: req.originalUrl || req.url,
    });
  });
  next();
}
