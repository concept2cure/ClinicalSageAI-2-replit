import type { Express, NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';

export type CircuitBreakerMiddleware = (req: Request, res: Response, next: () => void) => void;

export type AuthMiddleware = (req: Request, res: Response, next: NextFunction) => void;

export interface RouteBootstrapContext {
  app: Express;
  pool: Pool;
  aiCircuitBreaker: CircuitBreakerMiddleware;
  /**
   * Test/QA-only routes allowed to mount. Optional; when omitted the consumer
   * fails closed (does not mount test routes).
   */
  testRoutesEnabled?: boolean;
}

export interface PlatformBootstrapContext {
  app: Express;
  pool: Pool;
  authMiddleware: AuthMiddleware;
}
