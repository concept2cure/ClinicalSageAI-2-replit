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

  // 3. Keyword-inferred module.
  const mod = moduleForSectionKey(sectionKey);
  if (mod) return String(mod);

  // 4. Not inferable — the caller must not guess.
  return null;
}

export default { normalizeCtdCode, moduleForSectionKey, resolveCtdSection };
