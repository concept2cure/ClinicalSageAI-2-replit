import type { Express, NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';

export type CircuitBreakerMiddleware = (req: Request, res: Response, next: () => void) => void;

export type AuthMiddleware = (req: Request, res: Response, next: NextFunction) => void;

export interface RouteBootstrapContext {
  app: Express;
  pool: Pool;
  aiCircuitBreaker: CircuitBreakerMiddleware;
}

export interface PlatformBootstrapContext {
  app: Express;
  pool: Pool;
  authMiddleware: AuthMiddleware;
}
