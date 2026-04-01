import type { Express, NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';

export type CircuitBreakerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => void;

export type AuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;

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

export interface AdminBootstrapContext {
  app: Express;
  pool: Pool;
}
