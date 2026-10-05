/**
 * Regulatory basis — the one provenance type every regulatory fact carries.
 *
 * A statement AnA makes about what a regulator requires is either
 *   - `regulator-text`: wording confirmed against the regulator's own copy —
 *     a URL on a regulator host (`REGULATOR_HOSTS`) or a vendored regulator
 *     artifact in this repository — on the ISO date in `checked`;
 *   - `recall`: known to the author but not checked against the regulator's
 *     text (secondary sources, search extracts, memory). It must be shown to
 *     the reader as such;
 *   - `platform-convention`: how this platform recommends doing something.
 *     Not a regulatory requirement.
 *
 * `basisProblems` is the deterministic well-formedness rule (invariant 3 of
 * docs/design/ANA_REGULATORY_RECORD.md); `basisLabel` is the one rendering, and
 * it never presents recall, convention or a malformed regulator-text claim as
 * checked regulator text.
 *
 * This module has NO imports so client and server can both use it.
 *
 * @module shared/regulatory/regulatory-basis
 */

export type RegulatoryConfidence = 'regulator-text' | 'recall' | 'platform-convention';

export interface RegulatoryBasis {
  /** Short citation ("ICH E3 §12.2.4", "21 CFR 314.50(d)(5)(vi)(b)", "EU M1 eCTD Specification v3.1 §1.3.1"). */
  ref: string;
  confidence: RegulatoryConfidence;
  /** Where the wording can be read. For `regulator-text` the host must be in `REGULATOR_HOSTS`. */
  url?: string;
  /** ISO date (YYYY-MM-DD) the wording was checked. Required for `regulator-text`. */
  checked?: string;
  /** Repository path of a vendored regulator artifact that was read (e.g. a controlled vocabulary or template). */
  vendored?: string;
  /** Currency-registry id; a dated statement reads its date from the fact, never from copied text. */
  factId?: string;
  /** Free-text qualification, e.g. "search extract of the regulator page; verbatim re-read owed". */
  note?: string;
}

/** Hosts whose pages count as the regulator's own text. A subdomain of a listed host also counts. */
export const REGULATOR_HOSTS: readonly string[] = Object.freeze([
  'fda.gov',
  'ecfr.gov',
  'federalregister.gov',
  'hhs.gov',
  'ema.europa.eu',
  'esubmission.ema.europa.eu',
  'eur-lex.europa.eu',
  'health.ec.europa.eu',
  'pmda.go.jp',
  'mhlw.go.jp',
  'ich.org',
  'database.ich.org',
]);

const CONFIDENCES: readonly RegulatoryConfidence[] = ['regulator-text', 'recall', 'platform-convention'];

/** True when `host` is a listed regulator host or a subdomain of one. */
function isRegulatorHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return REGULATOR_HOSTS.some((r) => h === r || h.endsWith(`.${r}`));
}

/** A real calendar date written exactly as YYYY-MM-DD. */
function isIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** A relative repository path that stays inside the repository. */
function isRepoPath(value: string): boolean {
  if (value.trim() === '' || value !== value.trim()) return false;
  if (value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:/.test(value)) return false;
  return !value.split(/[\\/]/).some((seg) => seg === '..');
}

/** The URL's host, or null when it is not an absolute http(s) URL. */
function httpHost(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.hostname : null;
}

/**
 * Why a basis is not well formed; `[]` means it is.
 *
 * `regulator-text` needs a `checked` ISO date and either a `url` on a regulator
 * host or a `vendored` repository path; a `url` it carries must itself be on a
 * regulator host. Any basis needs a non-empty `ref` and a known confidence; a
 * `url` must be absolute http(s); `checked` and `vendored`, when present, must
 * be well formed.
 */
export function basisProblems(b: RegulatoryBasis): string[] {
  const host = b.url === undefined ? undefined : httpHost(b.url);
  return [...fieldProblems(b, host), ...(b.confidence === 'regulator-text' ? regulatorTextProblems(b, host) : [])];
}

/** Problems with the fields themselves, whatever the confidence. */
function fieldProblems(b: RegulatoryBasis, host: string | null | undefined): string[] {
  const problems: string[] = [];
  if (typeof b.ref !== 'string' || b.ref.trim() === '') problems.push('ref is empty');
  if (!CONFIDENCES.includes(b.confidence)) problems.push(`confidence "${String(b.confidence)}" is not one of ${CONFIDENCES.join(', ')}`);
  if (host === null) problems.push(`url "${b.url}" is not an absolute http(s) URL`);
  if (b.checked !== undefined && !isIsoDate(b.checked)) problems.push(`checked "${b.checked}" is not an ISO date (YYYY-MM-DD)`);
  if (b.vendored !== undefined && !isRepoPath(b.vendored)) problems.push(`vendored "${b.vendored}" is not a relative path inside the repository`);
  return problems;
}

/** What a `regulator-text` claim additionally needs. */
function regulatorTextProblems(b: RegulatoryBasis, host: string | null | undefined): string[] {
  const problems: string[] = [];
  if (b.checked === undefined) problems.push('regulator-text needs a checked date');
  if (host && !isRegulatorHost(host)) problems.push(`regulator-text url host "${host}" is not a regulator host`);
  if (b.url === undefined && b.vendored === undefined) problems.push('regulator-text needs a url on a regulator host or a vendored regulator artifact');
  return problems;
}

/**
 * The basis as a reader sees it. Only a well-formed `regulator-text` basis is
 * rendered as checked; anything else says it was not checked.
 */
export function basisLabel(b: RegulatoryBasis): string {
  if (b.confidence === 'regulator-text' && basisProblems(b).length === 0) {
    return `${b.ref} (checked against the regulator's text on ${b.checked})`;
  }
  if (b.confidence === 'platform-convention') {
    return `${b.ref} (platform convention — not a regulatory requirement)`;
  }
  return `${b.ref} (recall — not checked against the regulator's text)`;
}
