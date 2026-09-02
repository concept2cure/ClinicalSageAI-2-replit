/**
 * Derive a real CTD section code for an agency-bound leaf.
 *
 * The submission-ops (transmit) path models content as c2c package SECTIONS whose
 * `sectionKey` is a loose product label ('module3_cmc', 'labeling', 'cer'), not a
 * CTD code. The canonical eCTD packager places leaves by CTD section code, so the
 * convergence needs one honest mapping between them.
 *
 * Resolution order — most specific evidence first:
 *   1. The section key IS a CTD code already ('3.2.P.1', '2.5') → use it verbatim.
 *   2. An artifact mapped into that section declares a `ctd_section` → use it
 *      (this is the field the compute/placement path populates when an artifact is
 *      "placed"), preferring the most specific (longest) declaration.
 *   3. Fall back to the module the existing keyword mapper infers ('3') → the leaf
 *      lands under that module's heading rather than being misfiled elsewhere.
 *   4. Nothing inferable → null. The caller decides (the honest options are to
 *      refuse assembly or to surface the leaf as unplaced — never to guess a
 *      section, which would misfile content inside an agency submission).
 *
 * Pure + dependency-free so it is unit-testable and reusable by any path that
 * needs to feed loosely-keyed content to the strict packager.
 *
 * @module server/services/ectd/section-to-ctd
 */

/** A CTD code: a module digit optionally followed by dotted sub-sections. */
const CTD_CODE = /^\s*([1-5])((?:\.[0-9A-Za-z]+)*)\s*$/;

/** Normalize a candidate CTD code, or null when it is not one. Accepts an
 *  optional leading 'm' ('m3.2.P.1') and trims surrounding whitespace. */
export function normalizeCtdCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const stripped = String(value).trim().replace(/^m/i, '');
  const m = CTD_CODE.exec(stripped);
  if (!m) return null;
  return `${m[1]}${m[2]}`;
}

/**
 * Infer the FDA Module 1 HEADING for a loosely-keyed regional document, when
 * the key names one unambiguously. A section keyed 'form-1571' or 'cover-letter'
 * used to resolve to the bare module '1', which the packager nests under an
 * `<m1>` element the us-regional DTD does not define — so a transmit built from
 * those keys failed DTD validation at the gateway. FDA eCTD Module 1
 * Specification v2.3 files every one of these at a specific heading:
 *   forms (1571/1572/356h/3674/3397/2253) → 1.1 · cover letters → 1.2 ·
 *   debarment → 1.3.3 · financial (3454/3455) → 1.3.4 · patents → 1.3.5 ·
 *   letters of authorization → 1.4.1 · environmental → 1.12.14 ·
 *   annual report → 1.13 · investigator's brochure → 1.14.4.1 · labeling → 1.14
 * Returns null when the key names none of them (the module inference below
 * still applies).
 */
export function module1HeadingForSectionKey(sectionKey: string): string | null {
  const k = (sectionKey || '').toLowerCase();
  if (/(3454|3455|financial[-_ ]?(cert|disclos))/.test(k)) return '1.3.4';
  if (/(1571|1572|356h|3674|3397|2253|\bform\b)/.test(k)) return '1.1';
  if (/cover[-_ ]?letter/.test(k)) return '1.2';
  if (/debarment/.test(k)) return '1.3.3';
  if (/patent|exclusivity/.test(k)) return '1.3.5';
  if (/letter[-_ ]?of[-_ ]?authori[sz]ation|\bloa\b/.test(k)) return '1.4.1';
  if (/environmental/.test(k)) return '1.12.14';
  if (/annual[-_ ]?report|\bdsur\b/.test(k)) return '1.13';
  if (/investigator[-_' ]*s?[-_ ]?brochure|\bib\b/.test(k)) return '1.14.4.1';
  if (/(labell?ing|\blabel\b|package[-_ ]?insert|prescribing[-_ ]?information|\bifu\b|\bpi\b|medication[-_ ]?guide)/.test(k)) return '1.14';
  return null;
}

/** Infer the CTD module (1-5) from a loose product section key. Mirrors the
 *  keyword mapping the transmit path already used for module folders. */
export function moduleForSectionKey(sectionKey: string): 1 | 2 | 3 | 4 | 5 | null {
  const k = (sectionKey || '').toLowerCase();
  const prefix = k.match(/(?:^|[^a-z0-9])(?:module|mod|m)[\s_-]?([1-5])(?:[^0-9]|$)/);
  if (prefix) return Number(prefix[1]) as 1 | 2 | 3 | 4 | 5;
  const numeric = k.match(/^\s*([1-5])\./);
  if (numeric) return Number(numeric[1]) as 1 | 2 | 3 | 4 | 5;
  // Order matters: module-2 "overview/summary" before the broad clinical
  // keywords; "nonclinical" (m4) is matched before "clinical" (m5).
  if (/(cover|admin|labeling|label|user-?fee|1571|1572|3674|\bform\b|regional)/.test(k)) return 1;
  if (/(qos|quality-overall|overall-summary|overview|\bsummary\b)/.test(k)) return 2;
  if (/(cmc|quality|drug-substance|drug-product|stability|specification|manufactur)/.test(k)) return 3;
  if (/(nonclinical|pharmacolog|toxicolog|pharmacokinetic|\bpk\b|\badme\b)/.test(k)) return 4;
  if (/(clinical|efficacy|safety|\bcsr\b|\bcer\b|study-report)/.test(k)) return 5;
  return null;
}

/**
 * Resolve the CTD section code for one leaf. `artifactCtdSections` are the
 * `ctd_section` values of the artifacts mapped into this section (may be empty).
 * Returns null when nothing can be honestly inferred.
 */
export function resolveCtdSection(
  sectionKey: string,
  artifactCtdSections: Array<string | null | undefined> = [],
): string | null {
  // 1. The section key is already a CTD code.
  const fromKey = normalizeCtdCode(sectionKey);
  if (fromKey) return fromKey;

  // 2. An artifact declares its placement — take the most specific.
  const declared = artifactCtdSections
    .map(normalizeCtdCode)
    .filter((c): c is string => c !== null)
    .sort((a, b) => b.length - a.length);
  if (declared.length > 0) return declared[0];

  // 3. A Module 1 heading the key names unambiguously (forms, cover letter,
  //    labeling, …) — a bare module '1' is not a placeable FDA regional leaf.
  const heading = module1HeadingForSectionKey(sectionKey);
  if (heading) return heading;

  // 4. Keyword-inferred module.
  const mod = moduleForSectionKey(sectionKey);
  if (mod) return String(mod);

  // 5. Not inferable — the caller must not guess.
  return null;
}

export default { normalizeCtdCode, module1HeadingForSectionKey, moduleForSectionKey, resolveCtdSection };
