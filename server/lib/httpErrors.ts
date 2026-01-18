import type { Response } from 'express';

export type ApiErrorBody = {
  ok: false;
  code: string;
  error: string;
  feature?: string;
  hint?: string;
};

type Logger = {
  warn: (message: string, meta?: Record<string, unknown>) => void;
};

const defaultLogger: Logger = {
  warn: (message, meta) => {
    if (meta) {
      console.warn(message, meta);
    } else {
      console.warn(message);
    }
  },
};

export function notImplemented(
  res: Response,
  feature: string,
  hint = 'This feature is not enabled in this environment yet.',
  logger: Logger = defaultLogger
) {
  const body: ApiErrorBody = {
    ok: false,
    code: 'NOT_IMPLEMENTED',
    error: 'Not implemented',
    feature,
    hint,
  };

  logger.warn('NOT_IMPLEMENTED', { feature, hint });
  return res.status(501).json(body);
}
