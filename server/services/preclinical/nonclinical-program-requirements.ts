/**
 * @fileoverview Nonclinical study-program requirements & gap engine.
 * @module server/services/preclinical/nonclinical-program-requirements
 *
 * Encodes the ICH M3(R2) / S-series staging that determines which nonclinical
 * studies are required to support a clinical trial of a given maximum duration
 * and phase, and compares that required battery against the studies a program
 * actually holds to produce the gap list. This is the forward-planning
 * counterpart to the reviewer personas (which judge an assembled package after
 * the fact): it answers "what do I still need to dose Phase 2?".
 *
 * Core rules encoded:
 *   - Repeat-dose tox duration vs clinical duration (ICH M3(R2) Table 1):
 *       ≤2 wk clinical → 2 wk tox; >2 wk–6 mo → match clinical; >6 mo → 6 mo
 *       rodent + 9 mo non-rodent — in a rodent AND a non-rodent species.
 *   - Safety pharmacology core battery before FIH (ICH S7A).
 *   - Genotoxicity: gene-mutation + in-vitro chromosomal damage before FIH;
 *       in-vivo before Phase 2 (ICH S2(R1)).
 *   - Reproductive tox staged with WOCBP inclusion / phase (ICH S5(R3)).
 *   - Carcinogenicity for chronic use at marketing (ICH S1) — not for trials.
 *   - Oncology (ICH S9) relaxes the gating for advanced-cancer programs.
 *
 * Pure module — no database, no network. Callable by ANA.
 *
 * @compliance ICH M3(R2); ICH S2(R1); ICH S5(R3); ICH S7A; ICH S1; ICH S9.
 */

const RODENT = new Set(['rat', 'mouse', 'hamster', 'guinea pig']);

function speciesClass(species: string | null | undefined): 'rodent' | 'non_rodent' | 'unknown' {
  if (!species) return 'unknown';
  const s = species.toLowerCase();
  for (const r of RODENT) if (s.includes(r)) return 'rodent';
  if (/dog|monkey|primate|minipig|mini-pig|micro-pig|rabbit|nhp|cyno|beagle|swine|\bpig\b|ferret/.test(s)) {
    return 'non_rodent';
  }
  return 'unknown';
}

export interface ProgramContext {
  /** Maximum clinical dosing duration to be supported, in weeks. */
  maxClinicalDurationWeeks: number;
  /** Clinical phase being enabled (1, 2, or 3). */
  targetPhase?: 1 | 2 | 3;
  /** Route of administration (non-oral routes add local tolerance). */
  route?: string;
  /** Trial will enrol women of childbearing potential. */
  includesWocbp?: boolean;
  /** Intended chronic therapy (≥6 months) — carcinogenicity at marketing. */
  chronicUse?: boolean;
  /** Advanced-cancer program — ICH S9 reduced/relaxed package. */
  oncology?: boolean;
  /** This is a marketing application (carcinogenicity becomes due). */
  marketingApplication?: boolean;
}

export type Requirement = 'required' | 'conditional' | 'not_required';
export type Timing = 'before_fih' | 'before_phase2' | 'before_phase3' | 'at_marketing';

export interface RequiredStudy {
  key: string;
  label: string;
  requirement: Requirement;
  timing: Timing;
  ichRef: string;
  rationale: string;
  /** For repeat-dose tox: required duration per species class. */
  durationWeeks?: { rodent: number; nonRodent: number };
}

export interface PresentStudy {
  studyType: string;
  species?: string | null;
  durationWeeks?: number | null;
  /** Genotoxicity component, when studyType is genotox. */
  genotoxComponent?: 'ames' | 'in_vitro_mammalian' | 'in_vivo';
}

export interface ProgramGap {
  key: string;
  label: string;
  reason: string;
  ichRef: string;
}

export interface ProgramAssessment {
  required: RequiredStudy[];
  gaps: ProgramGap[];
  /** True when no required study is missing. */
  adequate: boolean;
}

/** ICH M3(R2) Table 1 — repeat-dose tox duration to support a clinical trial. */
export function requiredRepeatDoseToxDuration(maxClinicalWeeks: number): { rodent: number; nonRodent: number } {
  if (maxClinicalWeeks <= 2) return { rodent: 2, nonRodent: 2 };
  if (maxClinicalWeeks <= 26) return { rodent: maxClinicalWeeks, nonRodent: maxClinicalWeeks };
  return { rodent: 26, nonRodent: 39 };
}

/** Build the required nonclinical battery for the given program context. */
export function requiredNonclinicalBattery(ctx: ProgramContext): RequiredStudy[] {
  const phase = ctx.targetPhase ?? 1;
  const dur = requiredRepeatDoseToxDuration(ctx.maxClinicalDurationWeeks);
  const studies: RequiredStudy[] = [];

  studies.push({
    key: 'repeat_dose_tox',
    label: 'Repeat-dose toxicity (rodent + non-rodent)',
    requirement: 'required',
    timing: 'before_fih',
    ichRef: 'ICH M3(R2) §5',
    rationale: `Two-species repeat-dose tox of ≥${dur.rodent} wk (rodent) / ≥${dur.nonRodent} wk (non-rodent) to support up to ${ctx.maxClinicalDurationWeeks} wk of clinical dosing.`,
    durationWeeks: dur,
  });

  studies.push({
    key: 'safety_pharm',
    label: 'Safety pharmacology core battery (CV, CNS, respiratory)',
    requirement: 'required',
    timing: 'before_fih',
    ichRef: 'ICH S7A',
    rationale: 'Core battery assessing vital organ function is required before first-in-human dosing.',
  });

  studies.push({
    key: 'genotox_ames',
    label: 'Genotoxicity — gene mutation (Ames)',
    requirement: ctx.oncology ? 'conditional' : 'required',
    timing: 'before_fih',
    ichRef: 'ICH S2(R1)',
    rationale: ctx.oncology
      ? 'For advanced-cancer agents (ICH S9), genotoxicity is not required to support first-in-human dosing.'
      : 'Gene-mutation assay required before first-in-human dosing.',
  });
  studies.push({
    key: 'genotox_in_vitro_mammalian',
    label: 'Genotoxicity — in-vitro chromosomal damage',
    requirement: ctx.oncology ? 'conditional' : 'required',
    timing: 'before_fih',
    ichRef: 'ICH S2(R1)',
    rationale: ctx.oncology
      ? 'Relaxed under ICH S9 for advanced cancer.'
      : 'In-vitro chromosomal damage assay required before first-in-human dosing.',
  });
  studies.push({
    key: 'genotox_in_vivo',
    label: 'Genotoxicity — in-vivo assay (complete battery)',
    requirement: ctx.oncology ? 'conditional' : 'required',
    timing: 'before_phase2',
    ichRef: 'ICH S2(R1)',
    rationale: 'In-vivo assay completes the standard battery before Phase 2.',
  });

  // Reproductive toxicology, staged with WOCBP and phase.
  studies.push({
    key: 'dart_efd',
    label: 'Embryo-fetal development (EFD)',
    requirement: ctx.includesWocbp ? 'required' : 'conditional',
    timing: 'before_phase3',
    ichRef: 'ICH S5(R3); ICH M3(R2) §11',
    rationale: ctx.includesWocbp
      ? 'EFD studies required to support inclusion of women of childbearing potential in larger / Phase 3 trials.'
      : 'EFD required before marketing; staging depends on WOCBP inclusion.',
  });
  studies.push({
    key: 'dart_fertility',
    label: 'Fertility and early embryonic development',
    requirement: 'conditional',
    timing: 'before_phase3',
    ichRef: 'ICH S5(R3)',
    rationale: 'Fertility study required before Phase 3.',
  });

  if (ctx.route && !/oral|po\b/i.test(ctx.route)) {
    studies.push({
      key: 'local_tolerance',
      label: 'Local tolerance',
      requirement: 'required',
      timing: 'before_fih',
      ichRef: 'ICH M3(R2)',
      rationale: `Non-oral route (${ctx.route}) requires local tolerance evaluation (may be incorporated into repeat-dose studies).`,
    });
  }

  studies.push({
    key: 'carcinogenicity',
    label: 'Carcinogenicity',
    requirement: ctx.chronicUse && ctx.marketingApplication ? 'required' : 'not_required',
    timing: 'at_marketing',
    ichRef: 'ICH S1A/S1B',
    rationale:
      ctx.chronicUse && ctx.marketingApplication
        ? 'Chronic use (≥6 months) requires carcinogenicity assessment for the marketing application.'
        : 'Not required to support clinical trials; due at marketing only for chronic-use indications.',
  });

  return studies;
}

/** Compare the required battery against the studies present and list the gaps. */
export function assessNonclinicalProgram(ctx: ProgramContext, present: PresentStudy[]): ProgramAssessment {
  const required = requiredNonclinicalBattery(ctx);
  const phase = ctx.targetPhase ?? 1;
  const gaps: ProgramGap[] = [];

  const has = (type: string) => present.some(p => normalize(p.studyType) === type);
  const repeatDose = present.filter(p => normalize(p.studyType) === 'repeat_dose_tox');
  const genotoxComponents = new Set(
    present.filter(p => normalize(p.studyType) === 'genotox').map(p => p.genotoxComponent).filter(Boolean),
  );

  // Only gate on studies due at or before the target phase.
  const dueByPhase = (timing: Timing): boolean => {
    if (timing === 'before_fih') return true;
    if (timing === 'before_phase2') return phase >= 2;
    if (timing === 'before_phase3') return phase >= 3;
    return ctx.marketingApplication === true; // at_marketing
  };

  for (const r of required) {
    if (r.requirement === 'not_required') continue;
    if (r.requirement === 'conditional' && r.key.startsWith('genotox') && ctx.oncology) continue;
    if (!dueByPhase(r.timing)) continue;

    if (r.key === 'repeat_dose_tox') {
      const dur = r.durationWeeks!;
      const rodentOk = repeatDose.some(
        p => speciesClass(p.species) === 'rodent' && (p.durationWeeks ?? 0) >= dur.rodent,
      );
      const nonRodentOk = repeatDose.some(
        p => speciesClass(p.species) === 'non_rodent' && (p.durationWeeks ?? 0) >= dur.nonRodent,
      );
      if (!rodentOk) {
        gaps.push({ key: r.key, label: r.label, reason: `Missing rodent repeat-dose tox of ≥${dur.rodent} weeks.`, ichRef: r.ichRef });
      }
      if (!nonRodentOk) {
        gaps.push({ key: r.key, label: r.label, reason: `Missing non-rodent repeat-dose tox of ≥${dur.nonRodent} weeks.`, ichRef: r.ichRef });
      }
      continue;
    }

    if (r.key === 'genotox_ames') {
      if (!genotoxComponents.has('ames')) gaps.push(gapOf(r, 'Ames (gene-mutation) assay not present.'));
      continue;
    }
    if (r.key === 'genotox_in_vitro_mammalian') {
      if (!genotoxComponents.has('in_vitro_mammalian')) gaps.push(gapOf(r, 'In-vitro chromosomal damage assay not present.'));
      continue;
    }
    if (r.key === 'genotox_in_vivo') {
      if (!genotoxComponents.has('in_vivo')) gaps.push(gapOf(r, 'In-vivo genotoxicity assay not present.'));
      continue;
    }
    if (r.key === 'safety_pharm') {
      if (!has('safety_pharm')) gaps.push(gapOf(r, 'Safety pharmacology core battery not present.'));
      continue;
    }
    if (r.key === 'dart_efd') {
      if (r.requirement === 'required' && !has('dart')) gaps.push(gapOf(r, 'Embryo-fetal development study not present.'));
      continue;
    }
    if (r.key === 'dart_fertility') {
      // Conditional; only gate at Phase 3.
      if (phase >= 3 && !has('dart')) gaps.push(gapOf(r, 'Fertility study not present for Phase 3.'));
      continue;
    }
    if (r.key === 'local_tolerance') {
      if (!has('local_tolerance') && !has('repeat_dose_tox')) {
        gaps.push(gapOf(r, 'Local tolerance not addressed for the non-oral route.'));
      }
      continue;
    }
    if (r.key === 'carcinogenicity') {
      if (!has('carc')) gaps.push(gapOf(r, 'Carcinogenicity study not present for the chronic-use marketing application.'));
      continue;
    }
  }

  return { required, gaps, adequate: gaps.length === 0 };
}

function gapOf(r: RequiredStudy, reason: string): ProgramGap {
  return { key: r.key, label: r.label, reason, ichRef: r.ichRef };
}

function normalize(studyType: string): string {
  // Collapse builder-category synonyms onto the ingest enum keys used here.
  switch (studyType) {
    case 'toxicology':
      return 'repeat_dose_tox';
    case 'genotoxicity':
      return 'genotox';
    case 'safety_pharmacology':
      return 'safety_pharm';
    case 'reproductive_tox':
      return 'dart';
    case 'carcinogenicity':
      return 'carc';
    default:
      return studyType;
  }
}
