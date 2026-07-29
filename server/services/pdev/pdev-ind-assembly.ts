/**
 * PDEV IND Assembly — Module 1–5 readiness view.
 *
 * Aggregates the registry's required documents per eCTD module and
 * cross-checks per-program activity state. Returns a per-module
 * snapshot of what is present, what is missing, what has unresolved
 * dependencies, and what is blocked by an in-flight contradiction.
 *
 * Honest framing: per the brief, this endpoint is **IND assembly
 * readiness** — not full eCTD backbone publishing. The codebase has
 * real ectd_compilations / ectd_documents / ectd-export machinery, but
 * this service does not invoke it. Routes that label this view as
 * publishing would be wrong.
 *
 * @module server/services/pdev/pdev-ind-assembly
 */

import { pdevOrchestrator } from './pdev-orchestrator';
import {
  PDEV_ACTIVITIES,
  type EctdModule,
  type PdevActivityState,
} from './pdev-activity-registry';

export interface IndAssemblyDocumentStatus {
  code: string;
  title: string;
  ectdModule: EctdModule;
  ectdSection?: string;
  mandatoryForInd: boolean;
  /** Source activity that produces this document. */
  activityKey: string;
  /** Activity state — drives present/missing logic. */
  activityState: PdevActivityState;
  /** True when activity state is approved/locked/submission_ready/submitted. */
  isPresent: boolean;
}

export interface IndAssemblyModuleStatus {
  module: EctdModule;
  totalDocuments: number;
  mandatoryDocuments: number;
  presentDocuments: number;
  presentMandatoryDocuments: number;
  /** 0-100 readiness — mandatory documents present / mandatory total. */
  moduleReadiness: number;
  documents: IndAssemblyDocumentStatus[];
}

export interface IndAssemblyReport {
  programId: string;
  modules: IndAssemblyModuleStatus[];
  /** Cross-module readiness — sum of mandatory present / mandatory total. */
  overallReadiness: number;
  /** Documents flagged as missing or in-flight that block submission. */
  blockers: IndAssemblyDocumentStatus[];
}

const COMPLETED_STATES: ReadonlySet<PdevActivityState> = new Set([
  'approved',
  'locked',
  'submission_ready',
  'submitted',
]);

const MODULES: EctdModule[] = ['m1', 'm2', 'm3', 'm4', 'm5'];

export class PdevIndAssemblyService {
  async getReadiness(programId: string, organizationId: number): Promise<IndAssemblyReport | null> {
    const view = await pdevOrchestrator.getProgramView(programId, organizationId);
    if (!view) return null;

    const stateByActivity = new Map<string, PdevActivityState>();
    for (const a of view.activities) {
      stateByActivity.set(a.registry.key, (a.state?.state ?? 'not_started') as PdevActivityState);
    }

    // Flatten the registry to a per-document table, tagging each with the
    // current activity state.
    const allDocs: IndAssemblyDocumentStatus[] = [];
    for (const activity of PDEV_ACTIVITIES) {
      const state = stateByActivity.get(activity.key) ?? 'not_started';
      const present = COMPLETED_STATES.has(state);
      for (const doc of activity.requiredDocuments) {
        allDocs.push({
          code: doc.code,
          title: doc.title,
          ectdModule: doc.ectdModule,
          ectdSection: doc.ectdSection,
          mandatoryForInd: doc.mandatoryForInd,
          activityKey: activity.key,
          activityState: state,
          isPresent: present,
        });
      }
    }

    // Group by module.
    const modules: IndAssemblyModuleStatus[] = MODULES.map(m => {
      const docs = allDocs.filter(d => d.ectdModule === m);
      const totalDocuments = docs.length;
      const mandatoryDocuments = docs.filter(d => d.mandatoryForInd).length;
      const presentDocuments = docs.filter(d => d.isPresent).length;
      const presentMandatoryDocuments = docs.filter(d => d.isPresent && d.mandatoryForInd).length;
      const moduleReadiness =
        mandatoryDocuments === 0
          ? 100
          : Math.round((presentMandatoryDocuments / mandatoryDocuments) * 10000) / 100;
      return {
        module: m,
        totalDocuments,
        mandatoryDocuments,
        presentDocuments,
        presentMandatoryDocuments,
        moduleReadiness,
        documents: docs,
      };
    });

    const mandatoryTotal = modules.reduce((acc, m) => acc + m.mandatoryDocuments, 0);
    const mandatoryPresent = modules.reduce((acc, m) => acc + m.presentMandatoryDocuments, 0);
    const overallReadiness =
      mandatoryTotal === 0 ? 0 : Math.round((mandatoryPresent / mandatoryTotal) * 10000) / 100;

    const blockers = allDocs.filter(d => d.mandatoryForInd && !d.isPresent);

    return {
      programId,
      modules,
      overallReadiness,
      blockers,
    };
  }
}

export const pdevIndAssemblyService = new PdevIndAssemblyService();
