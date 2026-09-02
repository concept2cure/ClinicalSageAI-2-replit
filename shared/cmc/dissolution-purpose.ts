/**
 * What a recorded dissolution profile is FOR — the rule shared by the write-
 * through mapper, the composed sections and the register surface.
 *
 * §3.2.P.2 carries the profiles a dissolution method was developed and compared
 * on; §3.2.P.5 carries the profile the release acceptance criterion is judged
 * against. Both sections used to read the same four generic keys through
 * first-match helpers, so a single recorded profile rendered identically into
 * both — the method-development record and the release control presented as the
 * same test. The purpose is stored on the row and resolved once, here.
 *
 * This lives in shared/ for the same reason the material scope does: the
 * register surface displays the section a profile files under, and it must
 * never name a different one than the composer reaches.
 */

export const DISSOLUTION_RELEASE_PURPOSE = 'release-specification';

/** The purposes that are pharmaceutical development evidence (§3.2.P.2). */
export const DISSOLUTION_DEVELOPMENT_PURPOSES = ['development', 'comparability', 'biowaiver'];

/** Every purpose the register offers, in the order the form offers them. */
export const DISSOLUTION_PURPOSES = [
  'development',
  'release-specification',
  'comparability',
  'biowaiver',
];

/**
 * Read a stored purpose tolerantly, without inventing one. An unstated purpose
 * resolves to development, matching the column's default: a profile recorded
 * before an acceptance criterion exists is development work.
 */
export function normalizeDissolutionPurpose(raw: unknown): string {
  const v = String(raw ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!v) return 'development';
  if (v === 'release' || v === 'release-specification' || v === 'specification' || v === 'qc') {
    return DISSOLUTION_RELEASE_PURPOSE;
  }
  if (v === 'comparability' || v === 'comparison') return 'comparability';
  if (v === 'biowaiver' || v === 'bcs') return 'biowaiver';
  return 'development';
}

/** The CTD section a purpose files a profile under, for display next to a row. */
export function dissolutionPurposeSection(raw: unknown): string {
  return normalizeDissolutionPurpose(raw) === DISSOLUTION_RELEASE_PURPOSE ? '3.2.P.5' : '3.2.P.2';
}
