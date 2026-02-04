/**
 * Express and API Request/Response Types
 * Type declarations for Express middleware and API handlers
 */

import type { Request, Response, NextFunction } from 'express';

// ============================================================================
// Express Request Extensions
// ============================================================================

declare global {
  namespace Express {
    interface Request {
      // Authentication
      user?: {
        id: number;
        email: string;
        name?: string;
        role: string;
        organizationId: number;
      };
      userId?: number;

      // Multi-tenancy
      organizationId?: number;
      tenantId?: number;
      clientWorkspaceId?: number;

      // Session
      sessionId?: string;
      projectId?: number;

      // File uploads
      file?: Express.Multer.File;
      files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };

      // Parsed body types
      body: any;

      // Query parameters
      query: {
        [key: string]: string | string[] | undefined;
        page?: string;
        limit?: string;
        sort?: string;
        order?: string;
        search?: string;
        filter?: string;
        status?: string;
        type?: string;
        from?: string;
        to?: string;
      };

      // Route parameters
      params: {
        [key: string]: string;
        id?: string;
        projectId?: string;
        documentId?: string;
        submissionId?: string;
        userId?: string;
      };

      // Request context
      startTime?: number;
      requestId?: string;

      // Feature flags
      features?: Record<string, boolean>;

      // Database connection
      db?: any;
      pool?: any;
    }

    interface Response {
      // Custom response helpers
      success?: <T>(data: T, message?: string) => Response;
      error?: (message: string, statusCode?: number) => Response;
      paginated?: <T>(data: T[], total: number, page: number, limit: number) => Response;
    }
  }
}

// ============================================================================
// API Handler Types
// ============================================================================

export type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void | Response>;

export type SyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => void | Response;

export type RequestHandler = AsyncRequestHandler | SyncRequestHandler;

export type ErrorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => void | Response;

// ============================================================================
// Middleware Types
// ============================================================================

export type Middleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

export type AuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => void | Promise<void>;

export type ValidationMiddleware = (schema: any) => Middleware;

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  message?: string;
  code?: string;
  details?: Record<string, any>;
  stack?: string;
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================================
// Route Configuration Types
// ============================================================================

export interface RouteConfig {
  path: string;
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  handler: RequestHandler;
  middleware?: Middleware[];
  auth?: boolean;
  roles?: string[];
  validation?: any;
}

export interface RouterConfig {
  prefix: string;
  routes: RouteConfig[];
  middleware?: Middleware[];
}

// ============================================================================
// Service Context Types
// ============================================================================

export interface ServiceContext {
  userId?: number;
  organizationId?: number;
  projectId?: number;
  requestId?: string;
  db?: any;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// ============================================================================
// Pagination Types
// ============================================================================

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ============================================================================
// Query Types
// ============================================================================

export interface QueryParams {
  where?: Record<string, any>;
  orderBy?: { column: string; direction: 'asc' | 'desc' }[];
  limit?: number;
  offset?: number;
  include?: string[];
  select?: string[];
}

export interface FilterParams {
  status?: string | string[];
  type?: string | string[];
  createdAfter?: Date;
  createdBefore?: Date;
  updatedAfter?: Date;
  updatedBefore?: Date;
  search?: string;
  [key: string]: any;
}

// ============================================================================
// WebSocket Types
// ============================================================================

export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: number;
  userId?: number;
  roomId?: string;
}

export interface WebSocketClient {
  id: string;
  userId?: number;
  organizationId?: number;
  socket: any;
  rooms: Set<string>;
}

// ============================================================================
// File Upload Types
// ============================================================================

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination?: string;
  filename?: string;
  path?: string;
  buffer?: Buffer;
}

export interface FileUploadResult {
  success: boolean;
  file?: {
    id: string;
    name: string;
    url: string;
    size: number;
    mimeType: string;
  };
  error?: string;
}

// ============================================================================
// Authentication Types
// ============================================================================

export interface AuthUser {
  id: number;
  email: string;
  name?: string;
  role: string;
  organizationId: number;
  tenantId?: number;
  permissions?: string[];
  metadata?: Record<string, any>;
}

export interface JWTPayload {
  userId: number;
  email: string;
  role: string;
  organizationId: number;
  iat?: number;
  exp?: number;
}

export interface AuthResult {
  success: boolean;
  user?: AuthUser;
  token?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}

export interface SessionData {
  userId: number;
  organizationId: number;
  role: string;
  createdAt: Date;
  expiresAt: Date;
  metadata?: Record<string, any>;
}

// Export for module use
export {};
