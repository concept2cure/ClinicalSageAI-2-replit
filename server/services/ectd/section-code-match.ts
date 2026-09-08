/**
 * Does a placed leaf satisfy a required CTD section?
 *
 * ── Why this is a module and not two copies ──────────────────────────────────
 * A required section is a NODE ('m3.2.S' — drug substance); a placed leaf is a
 * document under it ('m3.2.S.1', 'm3.2.S.4.4'). Nothing ever writes a leaf at
 * the parent code, so an exact comparison between the two says a fully placed
 * Module 3 is missing.
 *
 * That rule was written once, in the compile path, with a comment describing
 * this exact bug — and the package validator kept its `Set.has(required)`, so
 * the product returned two contradictory verdicts on the same sequence: the
 * compile reported seventeen placed leaves and the validator reported drug
 * substance and drug product MISSING_REQUIRED_SECTION. One rule, one module,
 * both callers.
 *
 * The comparison is case-insensitive and normalizes away a leading module
 * prefix, because both spellings are in the data: the Module 3 placement writes
 * 'm' + the CTD key (services/cmc/place-module3-into-submission.ts), and other
 * writers use the bare key.
 *
 * @module server/services/ectd/section-code-match
 */

/** 'm3.2.S.1' → '3.2.s.1'; '3.2.S' → '3.2.s'. */
function normalizeSectionCode(code: unknown): string {
  return String(code ?? '')
    .trim()
    .toLowerCase()
    .replace(/^m(?=\d)/, '');
}

/**
 * True when `sectionCode` is the required section or a leaf beneath it.
 *
 * The boundary matters: 'm3.2.S' must not be satisfied by 'm3.2.SX', so a
 * longer code counts only when the next character is a separator.
 */
export function sectionMatches(sectionCode: unknown, requiredCode: string): boolean {
  const code = normalizeSectionCode(sectionCode);
  const required = normalizeSectionCode(requiredCode);
  if (!code || !required) return false;
  if (code === required) return true;
  return code.startsWith(required) && /[.\-_/]/.test(code.charAt(required.length));
}

/** True when ANY placed leaf satisfies the required section. */
export function anyLeafSatisfies(sectionCodes: Iterable<unknown>, requiredCode: string): boolean {
  for (const code of sectionCodes) if (sectionMatches(code, requiredCode)) return true;
  return false;
}
