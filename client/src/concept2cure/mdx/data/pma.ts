/**
 * PMA pathway fixtures — ported verbatim from data.jsx.
 */

import type { ProgramStatus, DueTone } from './programs';

export interface PmaPhase {
  id: string;
  label: string;
  pct: number;
  status: ProgramStatus;
}

export interface PmaModule {
  id: string;
  label: string;
  docs: number;
  status: 'complete' | 'active' | 'review' | 'draft';
  desc: string;
}

export interface TrialMetric {
  label: string;
  metric: string;
  unit?: string;
  bar?: { pct: number; tone: DueTone };
  meta: string;
  tone?: DueTone;
}

/**
 * The PMA pathway's ten phases. The ids and labels are the pathway BY
 * DEFINITION — real regulatory reference data, correct to ship — and this is
 * the only thing this constant is.
 *
 * It used to carry a position as well: 100/100/100/85/61/40/25/0/0/0, with
 * 'Module assembly' marked blocked. `derivePhases` in PmaSurface overwrites
 * every row's pct and status from the active program, so those numbers were
 * reachable through exactly one path — the no-program branch, which returned
 * this array verbatim — and on that path the grid drew one specific invented
 * programme's progress for a user who had selected nothing.
 *
 * Taxonomy carries no position. `derivePhases` supplies it, from the program.
 */
export const PMA_PHASES: PmaPhase[] = [
  { id: 'presub',   label: 'Pre-submission',           pct: 0, status: 'idle' },
  { id: 'preclin',  label: 'Preclinical',              pct: 0, status: 'idle' },
  { id: 'ide',      label: 'IDE approval',             pct: 0, status: 'idle' },
  { id: 'mfg',      label: 'Manufacturing validation', pct: 0, status: 'idle' },
  { id: 'pivotal',  label: 'Pivotal trial',            pct: 0, status: 'idle' },
  { id: 'labeling', label: 'Labeling',                 pct: 0, status: 'idle' },
  { id: 'module',   label: 'Module assembly',          pct: 0, status: 'idle' },
  { id: 'panel',    label: 'Advisory panel',           pct: 0, status: 'idle' },
  { id: 'approval', label: 'Approval',                 pct: 0, status: 'idle' },
  { id: 'postapp',  label: 'Post-approval studies',    pct: 0, status: 'idle' },
];

export const PMA_MODULES: PmaModule[] = [
  { id: 'preclinical',  label: 'Preclinical',  docs: 47, status: 'complete', desc: 'Bench, animal, biocompatibility per ISO 14708-1' },
  { id: 'clinical',     label: 'Clinical',     docs: 23, status: 'active',   desc: 'CV-330 IDE pivotal — 412/680 enrolled · 14 sites' },
  { id: 'manufacturing',label: 'Manufacturing',docs: 31, status: 'review',   desc: 'QS Regulation 21 CFR 820 · 3 facilities under audit' },
  { id: 'labeling',     label: 'Labeling',     docs: 12, status: 'draft',    desc: 'Professional labeling · MRI conditional statements' },
  { id: 'stats',        label: 'Statistical',  docs: 8,  status: 'review',   desc: 'SAP v2.4 · interim analysis plan · Bayesian borrowing' },
  { id: 'financial',    label: 'Financial',    docs: 14, status: 'complete', desc: 'Investigator disclosures · user-fee cover sheets' },
];

export const PMA_TRIAL_METRICS: TrialMetric[] = [
  { label: 'Enrolled',         metric: '412', unit: '/ 680', bar: { pct: 60.6, tone: 'warn' }, meta: 'Behind plan by 3 weeks' },
  { label: 'Active sites',     metric: '14',                                                   meta: 'Target 15 · 1 site pending IRB' },
  { label: 'Primary endpoint', metric: '94',  unit: '% sensitivity',                           meta: 'Pre-specified ≥ 90%' },
  { label: 'Adverse events',   metric: '47',  meta: '3 serious · 2 device-related under adjudication', tone: 'err' },
];
