import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { recordKernelDecision } from '../control-plane/decision-log';
import { persistKernelDecision } from '../control-plane/persistent-decision-sink';
import { anaMicrokernel, type KernelEvaluation } from '../control-plane/kernel';

interface RequestContext {
  requestId: string;
  startTimeMs: number;
  kernel?: KernelEvaluation;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

type LogFn = (obj: Record<string, unknown>, msg?: string) => void;

export const logger: Record<'info' | 'error' | 'warn' | 'debug', LogFn> = {
  info: (obj, msg) => console.log(msg || 'info', obj),
  error: (obj, msg) => console.error(msg || 'error', obj),
  warn: (obj, msg) => console.warn(msg || 'warn', obj),
  debug: (obj, msg) => console.debug(msg || 'debug', obj),
};

function extractActor(req: Request): string {
  const maybeUser = (req as any).user;
  return (
    maybeUser?.id ||
    maybeUser?.userId ||
    (req.headers['x-user-id'] as string | undefined) ||
    'anonymous'
  );
}

function summarizeBody(req: Request): string {
  const body = req.body;
  if (!body) return '';
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return text.slice(0, 512);
}

function toHeaderMap(req: Request): Record<string, string | string[] | undefined> {
  return Object.entries(req.headers).reduce<Record<string, string | string[] | undefined>>(
    (acc, [key, value]) => {
      if (Array.isArray(value) || typeof value === 'string' || typeof value === 'undefined') {
        acc[key] = value;
      }
      return acc;
    },
    {}
  );
}

function logResponse(
  req: Request,
  res: Response,
  kernel: KernelEvaluation,
  requestId: string,
  startTimeMs: number
) {
  const durationMs = Date.now() - startTimeMs;
  const tenantId = (req.headers['x-tenant-id'] as string | undefined) || undefined;
  const actorId = extractActor(req);

  const payload = {
    requestId,
    method: req.method,
    path: req.originalUrl || req.url,
    statusCode: res.statusCode,
    durationMs,
    kernelMode: kernel.mode,
    kernelDecision: kernel.finalDecision,
    kernelEnforcedDecision: kernel.enforcedDecision,
    kernelScore: kernel.score,
    kernelPolicyBundleId: kernel.policyBundleId,
    kernelPolicyBundleVersion: kernel.policyBundleVersion,
    flags: kernel.flags,
  };

  const decisionEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl || req.url,
    statusCode: res.statusCode,
    requestId,
    tenantId,
    actorId,
    kernel,
  };

  recordKernelDecision(decisionEntry);
  void persistKernelDecision(decisionEntry);

  if (res.statusCode >= 500) {
    logger.error(payload, 'request_failed');
  } else if (res.statusCode >= 400) {
    logger.warn(payload, 'request_warning');
  } else {
    logger.info(payload, 'request_ok');
  }
}

export const httpLogger = (req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string | undefined) || randomUUID();
  res.setHeader('x-request-id', requestId);

  const kernel = anaMicrokernel.evaluate({
    method: req.method,
    path: req.path,
    actorId: extractActor(req),
    tenantId: (req.headers['x-tenant-id'] as string | undefined) || undefined,
    headers: toHeaderMap(req),
    bodySnippet: summarizeBody(req),
  });

  (req as any).anaKernelDecision = kernel;
  res.setHeader('x-ana-kernel-decision', kernel.finalDecision);

  if (kernel.controls.requiresHumanReview) {
    res.setHeader('x-ana-review-required', 'true');
  }

  if (kernel.finalDecision === 'deny') {
    logger.warn(
      {
        requestId,
        path: req.path,
        method: req.method,
        flags: kernel.flags,
        trace: kernel.trace,
        mode: kernel.mode,
        enforcedDecision: kernel.enforcedDecision,
      },
      'kernel_policy_denied'
    );

    return res.status(403).json({
      error: {
        code: 'KERNEL_POLICY_DENIED',
        message: 'Request denied by cross-cutting control plane policy.',
        requestId,
        policy: {
          mode: kernel.mode,
          decision: kernel.finalDecision,
          enforcedDecision: kernel.enforcedDecision,
          policyBundleId: kernel.policyBundleId,
          policyBundleVersion: kernel.policyBundleVersion,
          flags: kernel.flags,
          score: kernel.score,
          trace: kernel.trace,
        },
      },
    });
  }

  const startTimeMs = Date.now();

  requestContextStorage.run({ requestId, startTimeMs, kernel }, () => {
    res.on('finish', () => {
      logResponse(req, res, kernel, requestId, startTimeMs);
    });

    next();
  });
};

export function getRequestContext() {
  return requestContextStorage.getStore();
}

// Centralized error handler — consistent { error: { code, message, ... } } format
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err?.statusCode || err?.status || 500;
  const errorCode = err?.code || (statusCode >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR');
  const message =
    statusCode >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : (err?.message || 'Internal server error');

  const kernel = (req as any).anaKernelDecision as KernelEvaluation | undefined;

  if (statusCode >= 500) {
    logger.error(
      {
        err,
        path: req.path,
        method: req.method,
        requestId: res.getHeader('x-request-id'),
        kernelDecision: kernel?.finalDecision,
      },
      'unhandled_error'
    );
  } else {
    logger.warn(
      {
        path: req.path,
        method: req.method,
        code: errorCode,
        message,
        requestId: res.getHeader('x-request-id'),
      },
      'client_error'
    );
  }

  res.status(statusCode).json({
    error: {
      code: errorCode,
      message,
      path: req.path,
      timestamp: new Date().toISOString(),
      requestId: res.getHeader('x-request-id'),
      kernelDecision: kernel?.finalDecision,
      kernelEnforcedDecision: kernel?.enforcedDecision,
      kernelFlags: kernel?.flags || [],
      policyBundleId: kernel?.policyBundleId,
      policyBundleVersion: kernel?.policyBundleVersion,
    },
  });
}
