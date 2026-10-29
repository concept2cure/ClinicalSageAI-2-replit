/**
 * The server's machine-readable error code, read from an error envelope.
 *
 * Moved here from queryClient.ts unchanged (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/refusal-not-failed-read/), and still
 * re-exported from there, so every caller keeps its import. It has its own
 * module so that useFetchJson, which reads the body itself, can use the ONE
 * code reader without importing '@/lib/queryClient': dozens of suites replace
 * that module with a factory exporting only `apiRequest`, and a failed read in
 * any of them would then throw on the missing export.
 */

/**
 * An enum-shaped error token — `PENDING_STORE`, `FORBIDDEN`, `QUOTA_EXCEEDED`.
 *
 * This distinction is the whole point of the extraction in queryClient.ts. The
 * API answers failures in two different shapes that both put a string in
 * `error`:
 *
 *   { error: 'PENDING_STORE', message: 'The store is not provisioned…' }
 *   { error: 'name is required' }        // send400(res, msg) — a real sentence
 *
 * The first `error` is a CODE and must never be shown to a user; the second is
 * the validation message and must be. Matching SCREAMING_SNAKE_CASE separates
 * them without needing the server to change shape: a code has no spaces and no
 * lowercase, a sentence has both.
 */
const ERROR_CODE_RE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

export function isErrorCode(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && ERROR_CODE_RE.test(value);
}

/**
 * The server's machine-readable error code, when it sent one.
 *
 * Separate from the message so a consumer can branch on `PENDING_STORE` or
 * `ESIGN_REQUIRED` without parsing display copy — copy is expected to change,
 * codes are not.
 */
export function errorCodeOf(payload: unknown): string | undefined {
  const p = (payload ?? {}) as Record<string, any>;
  const err = p.error;
  return (
    (typeof err?.code === 'string' ? err.code : undefined) ??
    (isErrorCode(err) ? err : undefined) ??
    (isErrorCode(p.code) ? p.code : undefined)
  );
}
