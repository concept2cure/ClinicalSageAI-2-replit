/**
 * Whether drafted CSR text still holds an unresolved data placeholder. Moved
 * verbatim out of csr-builder.ts (2026-10-30) so the assembly placement gate
 * (csr-assembly-placement.ts) applies the same rule the build runner and the
 * section status use; csr-builder.ts re-exports it.
 */

/**
 * Matches an unresolved data placeholder left in drafted CSR content, e.g.
 * [DATA TO BE INSERTED], [N], [value], [result], [reasons], [list], [X],
 * [statistical method to be specified], [favorable/unfavorable]. Both the AI
 * system prompt (buildSectionSystemPrompt) and the template fallback
 * (generateSectionTemplate) are instructed to use exactly this bracketed
 * convention for any real study number/finding that isn't available yet —
 * so ANY surviving `[...]` span containing a letter means the section still
 * needs real data, regardless of how much surrounding prose looks finished.
 *
 * Deliberately broad on purpose (fail closed per repo working agreement): a
 * false positive costs a section an extra "needs_data" glance from a
 * reviewer; a false negative would let a CSR section that's still full of
 * [DATA TO BE INSERTED] report as filing-ready, which is the bug this gate
 * exists to close. Legitimate regulatory prose does not use square brackets.
 */
const PLACEHOLDER_PATTERN = /\[[^[\]]*[A-Za-z][^[\]]*\]/;

/** True if `content` still contains at least one unresolved data placeholder. */
export function hasUnresolvedPlaceholders(content: string | null | undefined): boolean {
  if (!content) return false;
  return PLACEHOLDER_PATTERN.test(content);
}
