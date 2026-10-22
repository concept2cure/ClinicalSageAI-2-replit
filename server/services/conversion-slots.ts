/**
 * One converter limiter for the whole process (MR-03 Stage 2 step 5; finding OPS-13).
 *
 * LibreOffice, the python3 DOCX→PDF pipeline, OCRmyPDF, veraPDF and Ghostscript
 * run as child processes inside the one API task. Nothing capped how many ran at
 * once: a large submission package started one Ghostscript per leaf, beside any
 * other request's LibreOffice, and could starve the task until its health check
 * failed. Every child-process converter now runs inside `withConversionSlot`,
 * and this module is the only limiter for them. MR-08 consumes this one; do not
 * add a second.
 *
 *   CONVERTER_MAX_CONCURRENCY   slots for the process (default 2; a value that
 *                               is not a positive integer means the default)
 *   CONVERTER_QUEUE_TIMEOUT_MS  longest a request waits for a slot (default
 *                               120000; same fallback rule)
 *
 * Slots are granted first come, first served. A request that waits past the
 * timeout is refused with ConversionCapacityError, which the HTTP layer answers
 * 503 with Retry-After (`respondIfConverterBusy`, server/lib/api-response.ts).
 * It is never dropped and never answered with an empty result, and a running
 * conversion is never interrupted by the queue timeout: the timeout bounds the
 * wait for a slot, not the conversion, which keeps its own time limit.
 *
 * The FIFO queue is the AI gateway's `Semaphore` (server/services/ai-gateway/
 * concurrency.ts), reused rather than copied: its abort removes a waiter from
 * the queue without dispatching it, which is exactly the bounded wait. A timer
 * aborts the wait with the typed error as the abort reason, and is cleared the
 * moment the slot is granted.
 *
 * Nesting: a conversion started while its async context already holds a slot
 * runs under that slot instead of queueing for a second one. A nested acquire
 * would otherwise deadlock as soon as every slot is held by an outer caller
 * waiting on its own inner one (at the default of 2, two concurrent callers are
 * enough). Today no wrapped converter calls another; this keeps it that way.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { Semaphore } from './ai-gateway/concurrency';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('conversion-slots');

export const DEFAULT_CONVERTER_MAX_CONCURRENCY = 2;
export const DEFAULT_CONVERTER_QUEUE_TIMEOUT_MS = 120_000;
/** What a refused caller is told to wait before retrying (the Retry-After header). */
export const CONVERTER_RETRY_AFTER_SECONDS = 30;

type ConverterEnv = Record<string, string | undefined>;

/** A whole decimal number above zero, or null. '1.5', '-3', '0', 'abc' and '' are null. */
function positiveInteger(raw: string | undefined): number | null {
  const text = raw?.trim() ?? '';
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function resolveConverterMaxConcurrency(env: ConverterEnv = process.env): number {
  return positiveInteger(env.CONVERTER_MAX_CONCURRENCY) ?? DEFAULT_CONVERTER_MAX_CONCURRENCY;
}

export function resolveConverterQueueTimeoutMs(env: ConverterEnv = process.env): number {
  return positiveInteger(env.CONVERTER_QUEUE_TIMEOUT_MS) ?? DEFAULT_CONVERTER_QUEUE_TIMEOUT_MS;
}

/**
 * Every conversion slot stayed in use for the whole queue timeout, so this
 * request's conversion was not started. Carries what the HTTP layer needs to
 * answer 503 with Retry-After; `statusCode` also lets a generic error handler
 * that reads it answer 503 rather than 500.
 */
export class ConversionCapacityError extends Error {
  readonly code = 'CONVERTER_BUSY';
  readonly status = 503;
  readonly statusCode = 503;

  constructor(
    /** Which converter was waiting (e.g. 'libreoffice', 'ghostscript'). For logs, not for the screen. */
    readonly kind: string,
    readonly waitedMs: number,
    readonly maxConcurrent: number,
    readonly retryAfterSeconds: number = CONVERTER_RETRY_AFTER_SECONDS,
  ) {
    const waited = Math.max(1, Math.round(waitedMs / 1000));
    super(
      `The document converter is busy. Every conversion slot stayed in use for the ${waited} ` +
        `second${waited === 1 ? '' : 's'} this request waited, so it was not converted. ` +
        `Try again in about ${retryAfterSeconds} seconds.`,
    );
    this.name = 'ConversionCapacityError';
  }
}

/**
 * Read structurally as well as by class: callers reach converters through
 * dynamic imports, and a refusal must be recognised the same way either way.
 */
export function isConversionCapacityError(err: unknown): err is ConversionCapacityError {
  if (err instanceof ConversionCapacityError) return true;
  const e = err as { name?: unknown; code?: unknown; retryAfterSeconds?: unknown } | null;
  return (
    !!e &&
    e.name === 'ConversionCapacityError' &&
    e.code === 'CONVERTER_BUSY' &&
    typeof e.retryAfterSeconds === 'number'
  );
}

let limiter: { semaphore: Semaphore; size: number } | null = null;

/** Created on first use, so CONVERTER_MAX_CONCURRENCY is read once the environment is loaded. */
function processLimiter(): { semaphore: Semaphore; size: number } {
  if (!limiter) {
    const size = resolveConverterMaxConcurrency();
    limiter = { semaphore: new Semaphore(size), size };
  }
  return limiter;
}

/** The kind of slot the current async context holds, if it holds one. */
const heldSlot = new AsyncLocalStorage<string>();

/**
 * Run `fn` — the part of a converter that owns the child process — inside one
 * of the process's conversion slots. Waits first come, first served; rejects
 * with ConversionCapacityError when no slot frees within
 * CONVERTER_QUEUE_TIMEOUT_MS. The slot is released when `fn` settles, whether
 * it resolves or throws, and `fn`'s own error passes through unchanged.
 */
export async function withConversionSlot<T>(kind: string, fn: () => Promise<T>): Promise<T> {
  if (heldSlot.getStore() !== undefined) return fn();

  const { semaphore, size } = processLimiter();
  const timeoutMs = resolveConverterQueueTimeoutMs();
  const queuedAt = Date.now();
  const wait = new AbortController();
  const timer = setTimeout(() => {
    wait.abort(new ConversionCapacityError(kind, Date.now() - queuedAt, size));
  }, timeoutMs);
  // The wait must never be what keeps a stopping process alive.
  timer.unref?.();

  try {
    return await semaphore.run(() => {
      clearTimeout(timer);
      return heldSlot.run(kind, fn);
    }, wait.signal);
  } catch (err) {
    if (err === wait.signal.reason && isConversionCapacityError(err)) {
      logger.warn('Conversion refused: no slot freed within the queue timeout', {
        kind,
        waitedMs: err.waitedMs,
        maxConcurrent: size,
        queueTimeoutMs: timeoutMs,
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Exported for tests; do not call from application code. Drops the limiter so the next use re-reads the environment. */
export function resetConversionSlotsForTests(): void {
  limiter = null;
}
