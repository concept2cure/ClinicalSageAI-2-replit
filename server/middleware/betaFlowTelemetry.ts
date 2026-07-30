import type { NextFunction, Request, Response } from 'express';
import {
  classifyBetaFlow,
  normalizeBetaTelemetryPath,
  recordBetaFlowEvent,
} from '../services/telemetry/betaFlowTelemetry';

export function betaFlowTelemetryMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const path = normalizeBetaTelemetryPath(req.originalUrl || req.url);
    const flow = classifyBetaFlow(req.method, path);
    recordBetaFlowEvent(flow, res.statusCode, Date.now() - start, {
      method: req.method,
      path,
    });
  });
  next();
}
