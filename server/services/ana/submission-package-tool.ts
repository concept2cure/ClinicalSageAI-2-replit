import type { ToolContext } from './AnaToolExecutor.js';
import { resolveRegistryId } from '../regulatory/registry/legacySubmissionTypeMapper.js';
import { buildPackageManifest, type ProjectArtifactData, type ProjectSectionData } from '../regulatory/submissionPackageBuilder.js';
import { getApplicationType } from '../../../shared/regulatory/global-document-registry.js';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function validHypotheticalRows(value: unknown, kind: 'sections' | 'artifacts'): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 500) return false;
  return value.every(row => record(row) && typeof row.status === 'string'
    && typeof row[kind === 'sections' ? 'code' : 'type'] === 'string'
    && (row.documentId === undefined || typeof row.documentId === 'string')
    && (row.documentIds === undefined || (Array.isArray(row.documentIds) && row.documentIds.every(id => typeof id === 'string'))));
}

function hypotheticalPackage(input: Record<string, unknown>, registryId: string): string {
  if (!validHypotheticalRows(input.sections, 'sections') || !validHypotheticalRows(input.artifacts, 'artifacts')) {
    return JSON.stringify({ status: 'needs_parameters', message: 'Supply hypothetical section/artifact objects with string codes/types, statuses and source IDs; at most 500 rows per array.' });
  }
  const manifest = buildPackageManifest(registryId, 'hypothetical',
    (Array.isArray(input.sections) ? input.sections : []) as ProjectSectionData[],
    (Array.isArray(input.artifacts) ? input.artifacts : []) as ProjectArtifactData[])!;
  manifest.metadata.packageComplete = false;
  manifest.metadata.sourceIdentitiesPresent = false;
  return JSON.stringify({ status: 'hypothetical', assessmentBasis: 'hypothetical', result: manifest,
    instruction: 'These are hypothetical supplied statuses, never assessed client evidence. Explain modeled gaps without claiming a completed package or filing readiness.' });
}

export async function assessSubmissionPackageTool(input: Record<string, unknown>, context?: ToolContext): Promise<string> {
  const requested = typeof input.submissionType === 'string' ? input.submissionType.trim() : '';
  const registryId = resolveRegistryId(requested) ?? requested;
  if (!getApplicationType(registryId)) return JSON.stringify({ status: 'needs_parameters', message: 'Provide a recognized application type or exact registry ID and target jurisdiction.' });
  if (input.mode !== undefined && !['project', 'hypothetical'].includes(String(input.mode))) {
    return JSON.stringify({ status: 'needs_parameters', message: 'Use mode project or hypothetical.' });
  }
  if (input.mode === 'hypothetical') return hypotheticalPackage(input, registryId);
  if (!context?.organizationId || (!context.projectId && !context.projectRef)) {
    return JSON.stringify({ status: 'needs_project', message: 'Open the client project to assess saved evidence. A model-supplied project ID or approval cannot establish project state. Use hypothetical mode only for an explicitly requested scenario.' });
  }
  try {
    const [{ db, getPool }, { loadSavedSubmissionInventory }] = await Promise.all([
      import('../../db.js'), import('../regulatory/submissionPackageInventory.js'),
    ]);
    const inventory = await loadSavedSubmissionInventory({ pool: getPool(), db, context, registryId });
    if (!inventory) return JSON.stringify({ status: 'needs_project', message: 'The active project could not be resolved in this organization. Open an accessible project first.' });
    const manifest = buildPackageManifest(registryId, inventory.programId, inventory.sections, inventory.artifacts)!;
    // The canonical projection is not a reconciliation of every source store.
    // It can establish progress, but cannot certify a whole client package.
    manifest.metadata.packageComplete = false;
    return JSON.stringify({ status: 'computed', engine: 'deterministic', assessmentBasis: 'saved_canonical_projection',
      inventoryComplete: false, filingReadiness: 'not_assessed', notices: inventory.notices, result: manifest,
      instruction: 'Report missing projection rows and required content awaiting review first. State the saved projection scope and its limits. Unlinked working documents may exist. packageComplete is false because source-store reconciliation and governed technical checks were not performed; do not claim filing readiness.' });
  } catch (error) {
    if (error instanceof Error && error.name === 'SubmissionInventoryScopeLimit') {
      return JSON.stringify({ status: 'needs_parameters', message: error.message });
    }
    return JSON.stringify({ status: 'error', error: 'Saved project records could not be read for assessment. Retry; no successful or empty assessment was produced.' });
  }
}
