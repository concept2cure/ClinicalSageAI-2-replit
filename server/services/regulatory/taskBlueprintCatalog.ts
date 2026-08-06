/**
 * Task Blueprint Catalog — Registry-driven task/milestone blueprints.
 *
 * Provides task blueprint lookups by registry ID. For types with dedicated
 * blueprint files, delegates to those files. For others, uses default blueprints.
 *
 * @module server/services/regulatory/taskBlueprintCatalog
 */

import { resolveRegistryId } from './registry/legacySubmissionTypeMapper.js';
import { getTaskBlueprintForEntry } from '../../../shared/regulatory/project-bootstrap.js';
import { getApplicationType } from '../../../shared/regulatory/global-document-registry.js';
import type { TaskBlueprint, MilestoneDefinition } from '../../../shared/regulatory/document-taxonomy.js';

import * as usInd from './registry/blueprints/usIndBlueprint.js';
import * as usNda from './registry/blueprints/usNdaBlueprint.js';
import * as usBla from './registry/blueprints/usBlaBlueprint.js';
import * as euMaa from './registry/blueprints/euMaaBlueprint.js';
import * as euCta from './registry/blueprints/euCtaBlueprint.js';
import * as canadaNds from './registry/blueprints/canadaNdsBlueprint.js';
import * as canadaCta from './registry/blueprints/canadaCtaBlueprint.js';
import * as japanMaa from './registry/blueprints/japanMaaBlueprint.js';
import * as japanCtn from './registry/blueprints/japanCtnBlueprint.js';
import * as chinaCta from './registry/blueprints/chinaCtaBlueprint.js';
import * as australiaCtn from './registry/blueprints/australiaCtnBlueprint.js';
import * as brazilDdcm from './registry/blueprints/brazilDdcmBlueprint.js';
import * as indiaCt from './registry/blueprints/indiaCtBlueprint.js';

// ─── Blueprint Registry ───────────────────────────────────────────────────────

/**
 * Lazy-loaded blueprint cache. Blueprint files are only imported when needed.
 */
const blueprintCache = new Map<string, TaskBlueprint>();

/**
 * Get the task blueprint for a registry entry.
 * Checks for dedicated blueprint files first, then falls back to shared blueprints.
 */
export async function getTaskBlueprint(registryIdOrLegacy: string): Promise<TaskBlueprint> {
  const registryId = resolveRegistryId(registryIdOrLegacy) || registryIdOrLegacy;

  // Check cache
  if (blueprintCache.has(registryId)) {
    return blueprintCache.get(registryId)!;
  }

  // Try dedicated blueprint files
  const dedicated = await loadDedicatedBlueprint(registryId);
  if (dedicated) {
    blueprintCache.set(registryId, dedicated);
    return dedicated;
  }

  // Fall back to shared project-bootstrap blueprints
  const entry = getApplicationType(registryId);
  if (entry) {
    const bp = getTaskBlueprintForEntry(entry);
    blueprintCache.set(registryId, bp);
    return bp;
  }

  // Ultimate fallback
  return DEFAULT_TASK_BLUEPRINT;
}

/**
 * Registry ID → its dedicated task blueprint.
 *
 * ── Why these are static imports ──────────────────────────────────────────────
 * This was a `Record<string, string>` of module paths loaded as `import(file)`
 * with a runtime specifier. esbuild cannot resolve those, so none of the 13
 * blueprint modules was in dist/index.js — verified from esbuild's metafile,
 * 13/13 absent. In production the import rejected, the `catch { return null }`
 * below swallowed it without even a console line, and every region fell through
 * to DEFAULT_TASK_BLUEPRINT.
 *
 * The result was a platform that sells thirteen regional pathways and shipped
 * one generic three-milestone plan for all of them. Silent by construction: a
 * caller asking for the Japan CTN blueprint got a well-formed blueprint back,
 * just not the Japanese one.
 *
 * Kept in sync with `sectionBlueprintCatalog` (the same files export both).
 */
const TASK_BLUEPRINTS: Record<string, TaskBlueprint> = {
  US_IND: usInd.taskBlueprint,
  US_NDA: usNda.taskBlueprint,
  US_BLA: usBla.taskBlueprint,
  EU_MAA: euMaa.taskBlueprint,
  EU_CTA: euCta.taskBlueprint,
  CA_NDS: canadaNds.taskBlueprint,
  CA_CTA: canadaCta.taskBlueprint,
  JP_MKT_APPROVAL: japanMaa.taskBlueprint,
  JP_CTN: japanCtn.taskBlueprint,
  CN_CTA: chinaCta.taskBlueprint,
  AU_CTN: australiaCtn.taskBlueprint,
  BR_DDCM: brazilDdcm.taskBlueprint,
  IN_CT04: indiaCt.taskBlueprint,
};

/** Registry IDs that have a dedicated, wired task blueprint. */
export const DEDICATED_TASK_BLUEPRINT_IDS: readonly string[] =
  Object.keys(TASK_BLUEPRINTS);

/**
 * The dedicated blueprint for a registry ID, or null when it has none.
 *
 * Still async: the signature is part of this module's contract and several
 * callers await it. Nothing is loaded here any more — the blueprints are
 * ordinary module-scope values — so there is also nothing left to fail, which
 * is why the swallowing try/catch is gone rather than kept "just in case". A
 * catch that can only hide a programming error is not resilience.
 */
async function loadDedicatedBlueprint(registryId: string): Promise<TaskBlueprint | null> {
  return TASK_BLUEPRINTS[registryId] ?? null;
}

// ─── Default Blueprint ────────────────────────────────────────────────────────

const DEFAULT_TASK_BLUEPRINT: TaskBlueprint = {
  id: 'default_tasks',
  name: 'Standard Task Blueprint',
  milestones: [
    {
      id: 'ms_authoring',
      title: 'Document Authoring',
      description: 'Draft all required sections',
      phase: 'authoring',
      order: 1,
      tasks: [
        { id: 't_draft_docs', title: 'Draft Required Documents', description: 'Author all required submission documents' },
        { id: 't_supporting', title: 'Supporting Documents', description: 'Prepare supporting data and references' },
      ],
    },
    {
      id: 'ms_review',
      title: 'Internal Review',
      description: 'Quality and compliance review',
      phase: 'review',
      order: 2,
      tasks: [
        { id: 't_qc', title: 'QC Review', description: 'Quality control check' },
        { id: 't_compliance', title: 'Compliance Check', description: 'Regulatory compliance validation' },
      ],
    },
    {
      id: 'ms_finalize',
      title: 'Finalization & Submission',
      description: 'Final assembly and submission',
      phase: 'finalization',
      order: 3,
      tasks: [
        { id: 't_signatures', title: 'Signatures', description: 'Electronic signatures' },
        { id: 't_package', title: 'Package Assembly', description: 'Assemble submission package' },
        { id: 't_submit', title: 'Submit', description: 'Electronic submission' },
      ],
    },
  ],
};

/**
 * Get the default fallback blueprint.
 */
export function getDefaultTaskBlueprint(): TaskBlueprint {
  return DEFAULT_TASK_BLUEPRINT;
}
