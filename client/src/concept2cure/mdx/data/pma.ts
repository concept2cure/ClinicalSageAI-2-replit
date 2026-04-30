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

export const PMA_PHASES: PmaPhase[] = [
  { id: 'presub',   label: 'Pre-submission',           pct: 100, status: 'complete' },
  { id: 'preclin',  label: 'Preclinical',              pct: 100, status: 'complete' },
  { id: 'ide',      label: 'IDE approval',             pct: 100, status: 'complete' },
  { id: 'mfg',      label: 'Manufacturing validation', pct: 85,  status: 'active'   },
  { id: 'pivotal',  label: 'Pivotal trial',            pct: 61,  status: 'active'   },
  { id: 'labeling', label: 'Labeling',                 pct: 40,  status: 'active'   },
  { id: 'module',   label: 'Module assembly',          pct: 25,  status: 'blocked'  },
  { id: 'panel',    label: 'Advisory panel',           pct: 0,   status: 'idle'     },
  { id: 'approval', label: 'Approval',                 pct: 0,   status: 'idle'     },
  { id: 'postapp',  label: 'Post-approval studies',    pct: 0,   status: 'idle'     },
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
