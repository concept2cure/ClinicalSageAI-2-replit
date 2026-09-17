/**
 * Verdict inspector — the payload half of `check-unverified-verdicts`.
 *
 * Every other gate in this repository reads source text or a schema. This one
 * reads what a surface actually ANSWERED after its dependency was made to fail,
 * and refuses any token that asserts a verdict about a check that cannot have
 * run. It is deliberately dumb: it does not know what the surface is, only that
 * the dependency failed, so anything below is a claim the surface could not
 * have earned.
 *
 * Plain ESM (no TypeScript) so both the vitest gate tests and the CI runner's
 * `--self-test` can import it without a build step.
 */

/** String VALUES that assert a verdict. Case-sensitive on purpose. */
export const VERDICT_STRINGS = new Set([
  'VERIFIED',
  'INTEGRITY_FAILURE',
  'COMPLIANT',
  'NON_COMPLIANT',
  'REVIEW_REQUIRED',
  'intact',
  'broken',
  'verified',
  'signature-revoked',
]);

/** Keys whose BOOLEAN value is a verdict (true or false — both are claims). */
export const VERDICT_BOOLEAN_KEYS = new Set(['valid', 'integrityValid', 'chainVerified', 'isValid']);

/** Keys whose `true` value asserts the act happened. */
export const SUCCESS_KEYS = new Set(['success', 'recorded', 'persisted']);

/**
 * Tokens that say the check did NOT run. Their presence is not a hit — a body
 * may carry them alongside a neutral count. Listed so a reader can see the
 * vocabulary the gate accepts as honest.
 */
export const HONEST_STRINGS = new Set([
  'UNVERIFIABLE',
  'unavailable',
  'unverified',
  'not_assessed',
  'NOT_ASSESSED',
  'ownership_unverifiable',
  'signature-unverifiable',
  'VERIFICATION_UNAVAILABLE',
]);

/**
 * XML: a `count="…"` on an element the failed query feeds is a claim, and so is
 * a status attribute carrying a verdict word.
 */
const XML_COUNT_CLAIM = /<(AuditLog|Signatures)\b[^>]*\bcount="\d+"/g;
const XML_STATUS_CLAIM = /\bstatus="(intact|broken|verified|VERIFIED|COMPLIANT|NON_COMPLIANT)"/g;

/**
 * Walk a payload and collect every verdict claim in it.
 *
 * @param {unknown} body   JSON value, or an XML/plain string.
 * @param {string}  [path] internal — where in the body we are.
 * @returns {string[]}     human-readable hits; empty means no verdict claimed.
 */
export function findVerdictClaims(body, path = '$') {
  const hits = [];
  if (typeof body === 'string') {
    // A bare string body: XML or text.
    for (const m of body.matchAll(XML_COUNT_CLAIM)) hits.push(`${path}: <${m[1]} count=…> asserts a count for a query that failed`);
    for (const m of body.matchAll(XML_STATUS_CLAIM)) hits.push(`${path}: status="${m[1]}"`);
    if (VERDICT_STRINGS.has(body)) hits.push(`${path}: "${body}"`);
    return hits;
  }
  if (Array.isArray(body)) {
    body.forEach((v, i) => hits.push(...findVerdictClaims(v, `${path}[${i}]`)));
    return hits;
  }
  if (body && typeof body === 'object') {
    for (const [k, v] of Object.entries(body)) {
      const here = `${path}.${k}`;
      if (typeof v === 'boolean') {
        if (VERDICT_BOOLEAN_KEYS.has(k)) hits.push(`${here}: ${v} (a boolean verdict)`);
        if (SUCCESS_KEYS.has(k) && v === true) hits.push(`${here}: true`);
        continue;
      }
      if (typeof v === 'string') {
        if (VERDICT_STRINGS.has(v)) hits.push(`${here}: "${v}"`);
        else if (v.includes('<')) hits.push(...findVerdictClaims(v, here));
        continue;
      }
      hits.push(...findVerdictClaims(v, here));
    }
  }
  return hits;
}

/**
 * Throw when a body claims a verdict. Call this only on a response produced
 * AFTER the dependency was made to fail — that precondition is what makes any
 * claim in the body unearned.
 */
export function assertNoVerdictClaims(body, context) {
  const hits = findVerdictClaims(body);
  if (hits.length) {
    throw new Error(
      `${context}: the dependency failed, but the surface still asserted a verdict:\n  - ${hits.join('\n  - ')}`,
    );
  }
}

/**
 * Self-test: the inspector must catch the fabricated shapes WO-16B found, and
 * must accept the honest shapes the fixes produce. Returns a list of failures;
 * empty means the inspector works.
 */
export function selfTest() {
  const failures = [];
  const mustCatch = [
    ['finding 12 — store down reported as failure', { chainIntegrity: 'INTEGRITY_FAILURE', complianceStatus: 'NON_COMPLIANT' }],
    ['finding 29 — nothing compared, valid:true', { valid: true }],
    ['finding 25 — empty set reported intact', { chainIntegrity: { status: 'intact', totalEntries: 0 } }],
    ['finding 27 — success over a write that never ran', { success: true, data: { hash: 'abc' } }],
    ['finding 14 — a thrown lookup reported as revoked', { ok: false, refusal: 'signature-revoked' }],
    ['finding 10 — a failed query reported as an empty log', '<AnALedger><AuditLog count="0">\n</AuditLog></AnALedger>'],
    ['finding 13 — unconditional framework verdict', { complianceFrameworks: [{ framework: 'GAMP 5', status: 'COMPLIANT' }] }],
  ];
  for (const [label, body] of mustCatch) {
    if (findVerdictClaims(body).length === 0) failures.push(`did NOT catch: ${label}`);
  }
  const mustAccept = [
    ['third state, response', { success: false, error: 'VERIFICATION_UNAVAILABLE', reason: '42P01: relation "audit_events" does not exist' }],
    ['third state, verdict word', { chainIntegrity: 'UNVERIFIABLE', complianceStatus: 'UNVERIFIABLE', entriesVerified: 0 }],
    ['third state, manifest', { chainIntegrity: { status: 'unverified', totalEntries: 12, hashedEntries: 0, reason: 'no row carries a record_hash' } }],
    ['third state, refusal', { ok: false, refusal: 'signature-unverifiable' }],
    ['third state, document', '<AnALedger><AuditLog unavailable="true" reason="42501: permission denied"/></AnALedger>'],
    ['not assessed', { complianceFrameworks: [{ framework: 'GAMP 5', status: 'NOT_ASSESSED' }] }],
  ];
  for (const [label, body] of mustAccept) {
    const hits = findVerdictClaims(body);
    if (hits.length) failures.push(`wrongly flagged (${label}): ${hits.join('; ')}`);
  }
  return failures;
}
