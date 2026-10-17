/**
 * PMA pathway taxonomy (the ten phases) and the row types the PMA surface
 * reads from the backend. The kit's example modules and trial metrics
 * (PMA_MODULES, PMA_TRIAL_METRICS) were deleted with sample mode on 2026-10-14.
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
