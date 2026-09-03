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
import { nearestUsRegionalHeading } from './controlled-vocab/fda-regional-sections';
import type { Region } from '../submission-gateways/types';

/**
 * Regions whose Module 1 placement this module can vouch for. FDA has a
 * published regional heading table (fda-regional-sections.ts); every other
 * regional builder files each `1.*` leaf flat under its Module 1 container, so
 * a dotted code is "placeable" there only in the structural sense — and the
 * FDA-numbered headings inferred from keywords (1.2 = cover letter) are NOT
 * offered for them: EU/JP Module 1 numbering differs (EU 1.0 = cover letter).
 */
export type PlacementRegion = Region;

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
  // Canonical ICH spelling: alpha segments are uppercase (3.2.S.1, 3.2.P.1,
  // 2.3.S). ctd_section is free text on the write paths, and '3.2.s.1' and
  // '3.2.S.1' used to reach the packager as two distinct codes — one heading,
  // two leaf folders (m3/3-2-s-1 and m3/3-2-S-1). This is the one
  // normalisation point on the transmit path, so it canonicalises.
  return `${m[1]}${m[2].toUpperCase()}`;
}

/**
 * Whether a code can be placed at a TERMINAL heading of the ICH tree (Modules
 * 2–5) or, for Module 1, at a PUBLISHED regional heading. Bare modules are never
 * placeable: '3' would nest directly under <m3-quality> (a container) and '1'
 * under an <m1> element the FDA us-regional DTD does not define.
 *
 * Module 1 is judged per region, not by the module digit: for FDA the code (or
 * a published ancestor — the forms 1.1.x file under <m1-1-forms>) must exist in
 * the FDA Module 1 heading table, otherwise the builder invents an element
 * (`<m1-foo>`) the DTD does not define. '1.foo' and '1.99.99' used to pass on
 * the digit alone (adversarial review). Other regions file `1.*` flat under
 * their Module 1 container, so any dotted code is structurally placeable there.
 */
export function isPlaceableCtdCode(code: string | null | undefined, region: PlacementRegion = 'fda'): boolean {
  const c = normalizeCtdCode(code);
  if (!c) return false;
  if (!c.includes('.')) return false; // bare module — a container, not a leaf-bearing heading
  if (moduleOf(c) === 1) {
    return region === 'fda' ? nearestUsRegionalHeading(c) !== null : true;
  }
  return isPlaceableSection(c);
}

/**
 * Infer the FDA Module 1 HEADING for a loosely-keyed regional document, when
 * the key names one unambiguously. A section keyed 'form-1571' or 'cover-letter'
 * used to resolve to the bare module '1', which the packager nests under an
 * `<m1>` element the us-regional DTD does not define — so a transmit built from
 * those keys failed DTD validation at the gateway.
 *
 * Every code returned here is a PUBLISHED leaf heading of the FDA Module 1
 * table (controlled-vocab/cv-v4-data.ts, us_1.*), pinned by test. An earlier
 * version returned the CONTAINERS 1.3.5 / 1.13 / 1.14 for 'patent' / 'annual
 * report' / 'labeling'; the table has no such leaf headings, so the builder
 * invented `<m1-14>`-style elements the DTD does not define. A key that names
 * only a container ('labeling' — which of 1.14.1.x / 1.14.4.x?) is therefore
 * NOT inferred: it returns null and is reported unplaced, so the author assigns
 * the precise section instead of the platform guessing one.
 *   forms (1571/1572/356h/3674/3397/2253) → 1.1 · cover letters → 1.2 ·
 *   debarment → 1.3.3 · financial (3454/3455) → 1.3.4 ·
 *   patent certification → 1.3.5.2 · exclusivity claim → 1.3.5.3 ·
 *   patent information → 1.3.5.1 · letter of authorization → 1.4.1 ·
 *   environmental analysis → 1.12.14 · DSUR → 1.13.15 ·
 *   investigator's brochure → 1.14.4.1 · investigational drug labeling → 1.14.4.2
 */
export function module1HeadingForSectionKey(sectionKey: string): string | null {
  const k = (sectionKey || '').toLowerCase();
  if (/(3454|3455|financial[-_ ]?(cert|disclos))/.test(k)) return '1.3.4';
  // FDA forms: a form NUMBER, or 'form(s)' as the key's subject ('forms',
  // 'fda-form'). NOT any key containing the word — 'dosage-form-description'
  // is Module 3 content and must never file under 1.1.
  if (/(1571|1572|356h|3674|3397|2253|\bfda[-_ ]?forms?\b|^forms?(?:[-_ ]|$))/.test(k)) return '1.1';
  if (/cover[-_ ]?letter/.test(k)) return '1.2';
  if (/debarment/.test(k)) return '1.3.3';
  if (/patent[-_ ]?cert/.test(k)) return '1.3.5.2';
  if (/exclusivity/.test(k)) return '1.3.5.3';
  if (/patent/.test(k)) return '1.3.5.1';
  if (/letter[-_ ]?of[-_ ]?authori[sz]ation|\bloa\b/.test(k)) return '1.4.1';
  if (/environmental/.test(k)) return '1.12.14';
  if (/\bdsur\b|development[-_ ]?safety[-_ ]?update/.test(k)) return '1.13.15';
  if (/investigator[-_' ]*s?[-_ ]?brochure|\bib\b/.test(k)) return '1.14.4.1';
  if (/investigational[-_ ]?(drug[-_ ]?)?labell?ing/.test(k)) return '1.14.4.2';
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
  if (/(cover|admin|labell?ing|\blabel\b|user-?fee|1571|1572|3674|\bfda[-_ ]?forms?\b|^forms?(?:[-_ ]|$)|regional)/.test(k)) return 1;
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
  region: PlacementRegion = 'fda',
): ArtifactPlacement {
  const sectionModule = moduleForSectionKey(sectionKey);
  const candidates: Array<{ raw: string | null | undefined; source: PlacementSource }> = [
    { raw: artifactCtdSection, source: 'artifact' },
    { raw: sectionKey, source: 'section-key' },
  ];
  // The Module 1 heading inferred from the key's WORDS is FDA numbering and is
  // offered only for an FDA package whose key does not name another module.
  // 'm5-labeling' says Module 5 explicitly; its 'labeling' word must not file it
  // under 1.14 (adversarial review caught exactly that). Such a key resolves to
  // nothing and is reported UNPLACED.
  if (region === 'fda' && (sectionModule === null || sectionModule === 1)) {
    candidates.push({ raw: module1HeadingForSectionKey(sectionKey), source: 'module1-heading' });
  }
  let unplaceableCode: string | undefined;
  for (const cand of candidates) {
    const norm = normalizeCtdCode(cand.raw);
    if (!norm) continue;
    if (!isPlaceableCtdCode(norm, region)) {
      // Remember the first rejected code AS DECLARED (not canonicalised) so the
      // finding names the value the author will recognise; keep looking for a
      // placeable one from a lower-precedence source.
      unplaceableCode = unplaceableCode ?? String(cand.raw).trim();
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
    // Cross-check EVERY source against the module the section names — a
    // section-key code cannot disagree with itself, but the check is
    // source-agnostic so no future candidate can slip past it.
    const placedModule = moduleOf(norm);
    if (sectionModule && sectionModule !== placedModule) {
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
