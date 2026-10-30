/**
 * Portfolio of active programs and aggregate health KPIs.
 * Ported verbatim from ui_kits/mdx/data.jsx.
 *
 * Status vocabulary: idle · active · blocked · complete (shared across the
 * stage strip, phase grid, and program chips). Pathway codes are orthogonal
 * to status — never use 'k510' / 'pma' / 'cer' as a status value.
 */

import type { RegulatoryPathway } from '../../../../../shared/constants/mdx';

export type ProgramStatus = 'idle' | 'active' | 'blocked' | 'complete';
export type ProgramPathway = RegulatoryPathway;
export type DueTone = 'ok' | 'warn' | 'err';

export interface Program {
  id: string;
  title: string;
  code: string;
  pathway: ProgramPathway;
  stage: string;
  stageIdx: number;
  readiness: number | null;
  /** Raw recorded progress for the validation view; never a readiness assessment. */
  recordedProgress?: number | null;
  status: ProgramStatus;
  lead: string;
  owners: string[];
  nextBlocker: string | null;
  dueLabel: string;
  dueTone: DueTone;
  lastActivity: string;
  meta: string;
  /**
   * The server's product_type ('device' | 'ivd' | …). Decides which FDA eSTAR
   * family a filing is produced on — the nIVD or the IVD template — so an IVD
   * program that files a 510(k) is never previewed or filled on the nIVD form.
   * Absent when the server did not send it.
   */
  productType?: string;
  /**
   * The server's regulatory_path ('510k' | 'de_novo' | 'pma' | …). The kit
   * pathway folds De Novo into k510 because both share the 510(k) surface, so
   * the official eSTAR needs the raw path to name and produce the right
   * pathway on that surface. Absent when the server did not send it.
   */
  regulatoryPath?: string;
}

/* REMOVED 2026-10-14: MDX_PROGRAMS — fourteen invented device programs
   ("BX-204 Continuous Glucose Monitor", leads such as "Jordan Chen", blockers,
   K-numbers, enrolment and literature counts) — and MDX_HEALTH, the KPI strip
   that described them ("Active programs 14 · Down 3 pts vs last week"). Nothing
   imported MDX_PROGRAMS; MDX_HEALTH rendered on the Overview under sample mode,
   which is gone. The Overview derives its strip from the tenant's programs. */

export interface HealthKpi {
  label: string;
  metric: string;
  unit?: string;
  bar?: { pct: number; tone: DueTone };
  meta: string;
  tone?: DueTone;
}
