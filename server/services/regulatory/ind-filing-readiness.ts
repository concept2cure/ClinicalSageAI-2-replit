/**
 * @fileoverview IND filing-readiness engine (all five modules).
 * @module server/services/regulatory/ind-filing-readiness
 *
 * Rolls a program's per-section authoring status up against the canonical IND
 * eCTD section map (services/regulatory/ind-ectd-sections) to answer "is this
 * IND ready to file?". For every section required for initial filing it reports
 * whether the section is ready (approved/signed/locked), in progress, or
 * missing, then aggregates per module (M1–M5) and overall — with the
 * not-started required sections surfaced as filing blockers.
 *
 * This is the cross-module capstone: the nonclinical depth lives in the
 * preclinical engines; this places Module 4 alongside M1/M2/M3/M5 in the single
 * filing-readiness view a regulatory lead needs.
 *
 * Pure module — no database. Callable by ANA.
 *
 * @compliance 21 CFR 312.23(a); ICH M4.
 */

import {
  getRequiredSections,
  type SectionStatus,
  type CTDModule,
} from '../../../services/regulatory/ind-ectd-sections.js';

/** Statuses that count as filing-ready. */
const READY_STATUSES: ReadonlySet<SectionStatus> = new Set<SectionStatus>(['approved', 'signed', 'locked']);

export interface SectionReadiness {
  code: string;
  title: string;
  module: CTDModule;
  status: SectionStatus;
  ready: boolean;
}

export interface ModuleReadiness {
  module: CTDModule;
  requiredCount: number;
  readyCount: number;
  inProgressCount: number;
  missing: Array<{ code: string; title: string; status: SectionStatus }>;
  percentage: number;
}

export type FilingReadiness = 'ready_to_file' | 'gaps';

export interface IndFilingReadiness {
  overallReadiness: FilingReadiness;
  requiredCount: number;
  readyCount: number;
  percentage: number;
  modules: ModuleReadiness[];
  /** Required sections that have not been started — the hard blockers. */
  blockers: Array<{ code: string; title: string; module: CTDModule }>;
  sections: SectionReadiness[];
}

const MODULE_ORDER: CTDModule[] = ['M1', 'M2', 'M3', 'M4', 'M5'];

/**
 * Assess IND filing readiness from a per-section status map.
 *
 * @param sectionStatus map of eCTD section code → authoring status. Codes not
 *   present default to 'not_started'.
 */
export function assessIndFilingReadiness(
  sectionStatus: Record<string, SectionStatus> = {},
): IndFilingReadiness {
  const required = getRequiredSections();

  const sections: SectionReadiness[] = required.map(s => {
    const status = sectionStatus[s.code] ?? 'not_started';
    return { code: s.code, title: s.title, module: s.module, status, ready: READY_STATUSES.has(status) };
  });

  const modules: ModuleReadiness[] = MODULE_ORDER.map(module => {
    const inModule = sections.filter(s => s.module === module);
    const readyCount = inModule.filter(s => s.ready).length;
    const inProgressCount = inModule.filter(s => !s.ready && s.status !== 'not_started').length;
    const missing = inModule
      .filter(s => !s.ready)
      .map(s => ({ code: s.code, title: s.title, status: s.status }));
    return {
      module,
      requiredCount: inModule.length,
      readyCount,
      inProgressCount,
      missing,
      percentage: inModule.length > 0 ? Math.round((readyCount / inModule.length) * 100) : 100,
    };
  });

  const readyCount = sections.filter(s => s.ready).length;
  const requiredCount = sections.length;
  const blockers = sections
    .filter(s => s.status === 'not_started')
    .map(s => ({ code: s.code, title: s.title, module: s.module }));

  return {
    overallReadiness: readyCount === requiredCount ? 'ready_to_file' : 'gaps',
    requiredCount,
    readyCount,
    percentage: requiredCount > 0 ? Math.round((readyCount / requiredCount) * 100) : 100,
    modules,
    blockers,
    sections,
  };
}
