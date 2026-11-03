/**
 * Persist only a stable refusal code for a failed CSR background task.
 *
 * Provider SDK errors, PostgreSQL exceptions and arbitrary ingestion failures
 * can embed prompt fragments, connection strings, uploaded clinical values or
 * headers in Error.message. Neither the job's persistent JSON error (which is
 * returned by GET /api/csr/jobs/:jobId) nor operational logs may repeat them.
 *
 * The existing job-error schema is unchanged: { message, code?, section, at }.
 * Exact CSR_* machine codes preserve actionable error routing without source
 * content. Unknown failures are recorded as a generic code for operators.
 */
const SAFE_CODE = /^CSR_[A-Z0-9_]{3,80}$/;
type ErrLike = { code?: unknown; message?: unknown };

export function safeCsrJobFailure(error: unknown): { message: string; code?: string } {
  const e = error && typeof error === 'object' ? error as ErrLike : null;
  const explicit = typeof e?.code === 'string' && SAFE_CODE.test(e.code) ? e.code : null;
  const bareMessage = typeof e?.message === 'string' && SAFE_CODE.test(e.message) ? e.message : null;
  const code = explicit ?? bareMessage;
  return code
    ? { message: code, code }
    : { message: 'CSR_BUILD_STEP_FAILED' };
}
