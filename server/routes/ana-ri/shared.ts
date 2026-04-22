/**
 * AnA RI route helpers shared across the per-endpoint route modules.
 *
 * Pulled out of ana-ri.ts as the seed for splitting that file into
 * per-route modules. Anything in here is consumed by 2+ handlers and
 * has zero behavior of its own — pure helpers.
 *
 * @module server/routes/ana-ri/shared
 */

import type { Response } from 'express';

/** Success envelope — `{ success: true, data, meta? }`. Matches concept2cure.ts. */
export const sendSuccess = <T>(
  res: Response,
  data: T,
  meta?: Record<string, unknown>
) => {
  if (meta) return res.json({ success: true, data, meta });
  return res.json({ success: true, data });
};

/** Error envelope — `{ success: false, error: { message, code?, details? } }`. */
export const sendError = (
  res: Response,
  status: number,
  message: string,
  details?: unknown,
  code?: string
) =>
  res
    .status(status)
    .json({ success: false, error: { message, code, details } });
