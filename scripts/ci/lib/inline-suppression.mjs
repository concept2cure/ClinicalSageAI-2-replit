/**
 * Inline, per-query suppression for the tenant-isolation CI gate.
 *
 * The gate is a static text scanner: it flags raw SQL against a tenant-scoped
 * table that carries no org/tenant filter in the same statement. Some queries
 * are genuinely safe in ways the scanner cannot see:
 *   - tenant scope comes from RLS session context set at runtime
 *     (withTenantContext → set_config('app.current_org_id'),
 *      runWithSystemTenantScope / runWithTenantScope via AsyncLocalStorage);
 *   - the org filter is interpolated dynamically (`${orgFilter}`) rather than
 *     written literally in the template;
 *   - the key is a genuinely global identity/idempotency value (a user record
 *     by its own primary key during auth, a Stripe event by its globally-unique
 *     event_id).
 *
 * Such a query may be marked known-safe AT THE CALL SITE with a comment:
 *
 *     // tenant-isolation-safe: <why this query cannot cross tenants>
 *
 * The justification after the colon is MANDATORY — a bare marker with no reason
 * is ignored — so every suppression carries an auditable rationale you can
 * enumerate with `grep -rn 'tenant-isolation-safe:' server/`. Prefer an inline
 * marker over allowlisting a whole file whenever the file also holds genuinely
 * tenant-scoped queries the gate must keep watching (storage.ts, the RAG
 * pipeline, the ana-ri services, …). Reserve the file allowlist for files that
 * are cross-tenant/bootstrap end to end.
 *
 * Extracted into its own module (mirroring extract-string-literals.mjs) so the
 * suppression rules can be unit-tested without executing the gate's
 * scan-and-exit flow.
 */

/**
 * A valid marker is `tenant-isolation-safe:` followed by at least one
 * non-whitespace character of justification. Case-insensitive. The reason is
 * captured (trimmed) for reporting.
 */
export const INLINE_SUPPRESS_RE = /tenant-isolation-safe\s*:\s*(\S.*?)\s*$/i;

/**
 * How many lines ABOVE a flagged query the marker may sit. Kept small so a
 * marker governs only the query it annotates — place it on the line(s)
 * immediately preceding the `.query(` / `.execute(` call. A multi-line call
 * whose backtick opens a line or two below the marker is still covered.
 */
export const DEFAULT_LOOKBACK = 6;

/**
 * Scan source text for suppression markers.
 *
 * @param {string} text
 * @returns {Map<number, string>} 1-based line number → justification, for every
 *   marker whose justification is non-empty.
 */
export function collectSuppressions(text) {
  const out = new Map();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(INLINE_SUPPRESS_RE);
    if (m && m[1] && m[1].trim().length > 0) {
      out.set(i + 1, m[1].trim());
    }
  }
  return out;
}

/**
 * Return the governing justification for a finding on `lineNumber`, or null if
 * none. A marker governs a finding when it sits on the same line or within
 * `lookback` lines ABOVE it; the nearest qualifying marker (lowest in the file,
 * i.e. closest above the query) wins so adjacent queries don't borrow each
 * other's rationale.
 *
 * @param {number} lineNumber 1-based line the finding's SQL literal starts on
 * @param {Map<number, string>} suppressions from {@link collectSuppressions}
 * @param {number} [lookback]
 * @returns {string|null}
 */
export function suppressionFor(lineNumber, suppressions, lookback = DEFAULT_LOOKBACK) {
  let bestReason = null;
  let bestLine = -1;
  for (const [markerLine, reason] of suppressions) {
    const delta = lineNumber - markerLine;
    if (delta >= 0 && delta <= lookback && markerLine > bestLine) {
      bestReason = reason;
      bestLine = markerLine;
    }
  }
  return bestReason;
}
