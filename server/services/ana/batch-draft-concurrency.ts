/** Resolve the shared HTTP/service scheduling bound before any batch work. */
export function resolveBatchConcurrency(value: unknown): number | null {
  if (value === undefined) return 3;
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 1) return null;
  return Math.min(value, 5);
}

export const BATCH_CONCURRENCY_MESSAGE = 'Concurrency must be a finite positive integer number; the maximum is 5.';
