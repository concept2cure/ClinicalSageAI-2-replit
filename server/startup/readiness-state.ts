/**
 * Process-wide schema-readiness flag.
 *
 * The fast-path /readyz endpoint (inline-endpoints.ts) must stay cheap — it
 * cannot re-verify the full schema on every probe. Instead the boot-time
 * schema verification (startup/services.ts → ensureCoreTables) records its
 * verdict here once, and /readyz reads it.
 *
 * Default is 'unknown' (treated as ready) so the flag never fails readiness on
 * its own — only an explicit 'missing' verdict, meaning the boot check
 * positively found required tables absent, turns /readyz red. This is the
 * fix for "green readiness against an unmigrated database": a reachable DB
 * with missing critical tables now fails readiness instead of passing.
 */
export type SchemaReadiness = 'unknown' | 'ready' | 'missing';

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
