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
 * Registry ID → dedicated blueprint module that exports `taskBlueprint`.
 * Kept in sync with `sectionBlueprintCatalog` (the same files export both).
 */
const TASK_BLUEPRINT_FILES: Record<string, () => Promise<any>> = {
  US_IND: () => import('./registry/blueprints/usIndBlueprint.js'),
  US_NDA: () => import('./registry/blueprints/usNdaBlueprint.js'),
  US_BLA: () => import('./registry/blueprints/usBlaBlueprint.js'),
  EU_MAA: () => import('./registry/blueprints/euMaaBlueprint.js'),
  EU_CTA: () => import('./registry/blueprints/euCtaBlueprint.js'),
  CA_NDS: () => import('./registry/blueprints/canadaNdsBlueprint.js'),
  CA_CTA: () => import('./registry/blueprints/canadaCtaBlueprint.js'),
  JP_MKT_APPROVAL: () => import('./registry/blueprints/japanMaaBlueprint.js'),
  JP_CTN: () => import('./registry/blueprints/japanCtnBlueprint.js'),
  CN_CTA: () => import('./registry/blueprints/chinaCtaBlueprint.js'),
  AU_CTN: () => import('./registry/blueprints/australiaCtnBlueprint.js'),
  BR_DDCM: () => import('./registry/blueprints/brazilDdcmBlueprint.js'),
  IN_CT04: () => import('./registry/blueprints/indiaCtBlueprint.js'),
};

/** Registry IDs that have a dedicated, wired task blueprint. */
export const DEDICATED_TASK_BLUEPRINT_IDS: readonly string[] =
  Object.keys(TASK_BLUEPRINT_FILES);

/**
 * Try to load a dedicated blueprint file for the given registry ID.
 */
async function loadDedicatedBlueprint(registryId: string): Promise<TaskBlueprint | null> {
  const file = TASK_BLUEPRINT_FILES[registryId];
  if (!file) return null;

  try {
    const mod = await file();
    return mod.taskBlueprint ?? null;
  } catch {
    return null;
  }
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
