/**
 * Place an agency-bound leaf at a real, PLACEABLE CTD section — per artifact.
 *
 * The submission-ops (transmit) path models content as c2c package SECTIONS whose
 * `sectionKey` is a loose product label ('module3_cmc', 'labeling', 'cer'), not a
 * CTD code, while each ARTIFACT mapped into a section may declare its own
 * `ctd_section`. The canonical eCTD packager places leaves by CTD section code.
 *
 * TWO INVARIANTS this module enforces (both were violated by an earlier version,
 * caught by adversarial review — see the git history of this file):
 *
 *   1. Placement is a property of each ARTIFACT, never of the section. A section
 *      holding artifacts placed at different CTD sections must yield separate
 *      leaves; resolving ONE code for a whole section and merging everything
 *      under it silently misfiled content inside an agency submission.
 *
 *   2. Only a code the packager can place at a TERMINAL ICH heading is ever
 *      emitted. A syntactically-valid but non-existent code ('3.14', '3.foo') or a
 *      bare module ('3', '1') is NOT placeable: the packager nests it directly
 *      under a container element (or, for Module 1, under an `<m1>` element the
 *      us-regional DTD does not define) — a package a regional validator rejects.
 *      Such a leaf is reported as UNPLACED so the transmit gate refuses it; it is
 *      never guessed into the backbone.
 *
 * Keyword module inference (`moduleForSectionKey`) is therefore NOT a placement
 * source — a bare module is unplaceable — it is used only to cross-check an
 * artifact's declared placement against the module its section names, so a
 * mis-tagged artifact surfaces as a DISAGREEMENT finding instead of being filed
 * silently in the wrong Module.
 *
 * @module server/services/ectd/section-to-ctd
 */

import { isPlaceableSection } from '../submission-gateways/ectd-packager/ich-headings';

/** A syntactically-shaped CTD code: a module digit optionally followed by dotted
 *  sub-sections. Syntax only — see isPlaceableCtdCode for whether it is REAL. */
const CTD_CODE = /^\s*([1-5])((?:\.[0-9A-Za-z]+)*)\s*$/;

/** Normalize a candidate CTD code's SYNTAX, or null when it is not code-shaped.
 *  Accepts an optional leading 'm' ('m3.2.P.1'). Says nothing about whether the
 *  code exists in the ICH tree — use isPlaceableCtdCode for that. */
export function normalizeCtdCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const stripped = String(value).trim().replace(/^m/i, '');
  const m = CTD_CODE.exec(stripped);
  if (!m) return null;
  return `${m[1]}${m[2]}`;
}

/**
 * Whether a code can be placed at a TERMINAL heading of the ICH tree (or, for
 * Module 1, at a published regional heading). Bare modules are never placeable:
 * '3' would nest directly under <m3-quality> (a container) and '1' under an
 * <m1> element the FDA us-regional DTD does not define.
 */
export function isPlaceableCtdCode(code: string | null | undefined): boolean {
  const c = normalizeCtdCode(code);
  if (!c) return false;
  if (!c.includes('.')) return false; // bare module — a container, not a leaf-bearing heading
  return isPlaceableSection(c);
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
 * Returns null when the key names none of them.
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

/**
 * Infer the CTD MODULE (1-5) a loose section key names. Used ONLY to cross-check
 * declared placements (a bare module is not itself placeable).
 *
 * Ordering is load-bearing:
 *   - an explicit 'module N' / 'mN' / leading 'N.' declaration beats every keyword
 *     ('m5-labeling' is Module 5, whatever 'labeling' suggests);
 *   - 'nonclinical' is tested before 'clinical' (it contains it);
 *   - human/clinical pharmacology + PK are MODULE 5 (5.3.3 / 5.3.4), so the
 *     'clinical' family is tested BEFORE the nonclinical pharmacology/PK
 *     keywords — the reverse order filed 'clinical-pharmacology' under Module 4.
 */
export function moduleForSectionKey(sectionKey: string): 1 | 2 | 3 | 4 | 5 | null {
  const k = (sectionKey || '').toLowerCase();
  const prefix = k.match(/(?:^|[^a-z0-9])(?:module|mod|m)[\s_-]?([1-5])(?:[^0-9]|$)/);
  if (prefix) return Number(prefix[1]) as 1 | 2 | 3 | 4 | 5;
  const numeric = k.match(/^\s*([1-5])\./);
  if (numeric) return Number(numeric[1]) as 1 | 2 | 3 | 4 | 5;
  if (/(cover|admin|labell?ing|\blabel\b|user-?fee|1571|1572|3674|\bform\b|regional)/.test(k)) return 1;
  if (/(qos|quality-overall|overall-summary|overview|\bsummary\b)/.test(k)) return 2;
  if (/(cmc|quality|drug-substance|drug-product|stability|specification|manufactur)/.test(k)) return 3;
  if (/nonclinical|non-clinical|preclinical/.test(k)) return 4;
  if (/(clinical|efficacy|safety|\bcsr\b|\bcer\b|study-report|\bhuman\b)/.test(k)) return 5;
  if (/(pharmacolog|toxicolog|pharmacokinetic|\bpk\b|\badme\b)/.test(k)) return 4;
  return null;
}

/** The module digit of a CTD code. */
function moduleOf(code: string): number {
  return Number(code.split('.')[0]);
}

/** Where a leaf's placement came from, for findings and audit. */
export type PlacementSource = 'artifact' | 'section-key' | 'module1-heading';

export interface ArtifactPlacement {
  /** A PLACEABLE CTD code, or null when the artifact cannot be honestly placed. */
  code: string | null;
  source: PlacementSource | null;
  /** Set when a code WAS declared/derived but is not placeable (bare module,
   *  non-existent heading) — surfaced so the finding says what was rejected. */
  unplaceableCode?: string;
  /** Set when the placed code's module contradicts the module the SECTION key
   *  names — a mis-tagged artifact, surfaced rather than filed silently. */
  moduleDisagreement?: { sectionModule: number; placedModule: number };
}

/**
 * Resolve the placement for ONE artifact in a section. Most-specific evidence
 * first, and every candidate is gated by isPlaceableCtdCode:
 *   1. the artifact's own declared `ctd_section`;
 *   2. the section key, when it is itself a CTD code;
 *   3. a Module 1 heading the section key names unambiguously;
 *   4. nothing placeable → code null (the caller reports LEAF-UNPLACED).
 * A candidate that is code-shaped but NOT placeable is rejected and recorded in
 * `unplaceableCode`. Keyword module inference never produces a placement; it only
 * powers the disagreement cross-check.
 */
export function resolveArtifactPlacement(
  sectionKey: string,
  artifactCtdSection: string | null | undefined,
): ArtifactPlacement {
  const candidates: Array<{ raw: string | null | undefined; source: PlacementSource }> = [
    { raw: artifactCtdSection, source: 'artifact' },
    { raw: sectionKey, source: 'section-key' },
    { raw: module1HeadingForSectionKey(sectionKey), source: 'module1-heading' },
  ];
  let unplaceableCode: string | undefined;
  for (const cand of candidates) {
    const norm = normalizeCtdCode(cand.raw);
    if (!norm) continue;
    if (!isPlaceableCtdCode(norm)) {
      // Remember the first rejected code so the finding names it; keep looking
      // for a placeable one from a lower-precedence source.
      unplaceableCode = unplaceableCode ?? norm;
      continue;
    }
    // A rejected higher-precedence code is still surfaced on a successful
    // placement: an artifact declaring '3.foo' is a data defect worth a finding
    // even when its section key rescued the placement.
    const placement: ArtifactPlacement = {
      code: norm,
      source: cand.source,
      ...(unplaceableCode ? { unplaceableCode } : {}),
    };
    const sectionModule = moduleForSectionKey(sectionKey);
    const placedModule = moduleOf(norm);
    // Cross-check only when the SECTION names a module and the code came from the
    // artifact (a section-key-derived code cannot disagree with itself).
    if (cand.source === 'artifact' && sectionModule && sectionModule !== placedModule) {
      placement.moduleDisagreement = { sectionModule, placedModule };
    }
    return placement;
  }
  return { code: null, source: null, ...(unplaceableCode ? { unplaceableCode } : {}) };
}

export default {
  normalizeCtdCode,
  isPlaceableCtdCode,
  module1HeadingForSectionKey,
  moduleForSectionKey,
  resolveArtifactPlacement,
};
