import type { Response } from 'express';

/** Validate the existing batch bounds and reserve internal evidence for admitted AnA code. */
export function refuseInvalidBatchInput(requests: unknown, res: Response): boolean {
  if (!Array.isArray(requests) || requests.length === 0) {
    res.status(400).json({ error: 'Missing required field: requests (array of draft requests)' });
    return true;
  }
  if (requests.length > 20) {
    res.status(400).json({ error: 'Maximum 20 requests per batch' });
    return true;
  }
  if (!requests.some(item => item !== null && typeof item === 'object' && Object.hasOwn(item, 'sourceContext'))) return false;
  res.status(400).json({
    error: 'UNTRUSTED_SOURCE_CONTEXT',
    message: 'Source context is reserved for admitted server code. Select project sources through AnA before drafting with evidence.',
  });
  return true;
}
