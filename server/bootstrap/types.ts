import type { Express, Request, Response } from 'express';
import type { Pool } from 'pg';

export type CircuitBreakerMiddleware = (req: Request, res: Response, next: () => void) => void;

export interface RouteBootstrapContext {
  app: Express;
  pool: Pool;
  aiCircuitBreaker: CircuitBreakerMiddleware;
}
