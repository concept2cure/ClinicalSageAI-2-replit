/**
 * Process-wide schema-readiness flag.
 *
 * The fast-path /readyz endpoint (inline-endpoints.ts) must stay cheap — it
 * cannot re-verify the full schema on every probe. Instead the boot-time
 * schema verification (startup/services.ts → ensureCoreTables) records its
 * verdict here once, and /readyz reads it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE INCIDENT — why 'unknown' now FAILS.
 *
 * This module used to document 'unknown' as "treated as ready ... so the flag
 * never fails readiness on its own". Combined with startup/services.ts, which
 * had five terminal branches that never called setSchemaReadiness() at all —
 * including the outer catch, reached when the schema verification ITSELF threw
 * — the result was a probe that reported 200 ready for a database whose schema
 * had never been successfully verified. The one case where a readiness probe
 * has to be believed is the case it silently passed.
 *
 * A readiness probe answers "should traffic be routed here?". "I never managed
 * to check" is not a yes. The default is therefore 'unknown' AND 'unknown'
 * fails, which is fail-closed in the only direction that is safe.
 *
 * This is safe against a startup race: server/index.ts awaits
 * verifyDatabaseConnection(pool) before it listens, so no probe can be served
 * before a verdict is recorded. If 'unknown' is ever observed on a live
 * process, that is a genuine bug — a code path that returned without recording
 * a verdict — and a red probe is the correct, loud response to it.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * States:
 *   'unknown'  — never verified. FAILS readiness (see above).
 *   'ready'    — verified; every critical and security-load-bearing table present.
 *   'degraded' — serves traffic, but non-essential tables are absent. PASSES
 *                readiness, and names what is missing so the gap is visible
 *                rather than silent.
 *   'missing'  — required tables/extensions/subsystems positively absent. FAILS.
 *   'error'    — the verification could not complete. FAILS. Distinct from
 *                'missing' because the honest answer is "unknown, and we know
 *                why", which is diagnostically different from "checked, absent".
 */
export type SchemaReadiness = 'unknown' | 'ready' | 'degraded' | 'missing' | 'error';

let schemaReadiness: SchemaReadiness = 'unknown';
let schemaDetail = '';

export function setSchemaReadiness(state: SchemaReadiness, detail = ''): void {
  schemaReadiness = state;
  schemaDetail = detail;
}

export function getSchemaReadiness(): SchemaReadiness {
  return schemaReadiness;
}

export function getSchemaReadinessDetail(): string {
  return schemaDetail;
}

/**
 * Does this state permit serving traffic?
 *
 * The single place the fail-open/fail-closed decision is made, so /readyz and
 * any future probe cannot drift apart on it. Only two states pass.
 */
export function isSchemaReadinessServing(state: SchemaReadiness = schemaReadiness): boolean {
  return state === 'ready' || state === 'degraded';
}

/** Test seam: restore module state between cases. */
export function resetSchemaReadinessForTests(): void {
  schemaReadiness = 'unknown';
  schemaDetail = '';
}
