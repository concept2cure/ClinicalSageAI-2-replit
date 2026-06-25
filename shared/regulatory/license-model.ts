/**
 * License model — entitlement by client type, then project type.
 *
 * Licensing is a two-level grant that mirrors the spine:
 *   1. CLIENT TYPE  — the segment(s) an org is licensed for (device / ivd /
 *      biotech / pharma). The vertical they bought.
 *   2. PROJECT TYPE — the filing types (registry ids) licensed within those
 *      segments (NDA, IND, BLA, 510(k), …). The projects they may create.
 *   3. APPS         — NOT licensed separately. The project type dictates which
 *      apps appear (the generative core); if you're licensed for the project
 *      type, you get its apps.
 *
 * This replaces the flat "tier × industry × 18 modules" entitlement with two
 * grounded lists — segments + project types — and derives everything else. The
 * New-Project Document-Type picker is filtered by `licensedProjectTypes`, and
 * app access follows transitively from the licensed project type.
 *
 * Pure, no DB. Grounded in the segment + filing registries.
 *
 * @module shared/regulatory/license-model
 */

import { resolveProgramModel } from './program-model.js';
import {
  resolveToRegistryEntry,
  getAllActiveSubmissionTypes,
} from './submission-type-bridge.js';
import { resolveWorkspaceConfig } from './workspace-config.js';
import type { ClientSegmentId } from './client-segments.js';

/** A licensed project type: a registry filing id, or '*' = all within a licensed segment. */
export type ProjectTypeGrant = string;

export interface License {
  /** Client types (segments) the org is licensed for. */
  segments: ClientSegmentId[];
  /**
   * Project types licensed within those segments — registry filing ids, or
   * include '*' to grant every filing type in the licensed segments.
   */
  projectTypes: ProjectTypeGrant[];
}

export interface AccessDecision {
  allowed: boolean;
  reason?: string;
}

/** Resolve a need to its (segment, registry id). */
function resolve(need: string): { segment: ClientSegmentId | null; id: string | null } {
  const key = (need ?? '').trim();
  const p = resolveProgramModel(key);
  const id = p.filing?.id ?? resolveToRegistryEntry(key)?.id ?? null;
  return { segment: p.segment?.id ?? null, id };
}

/**
 * Can the org create a project of this type? A project type is allowed when its
 * client-type (segment) is licensed AND the project type is granted (explicitly
 * or via '*'). Cross-cutting filings with no product segment (e.g. a DMF) must
 * be granted explicitly, since there's no segment to license them under.
 */
export function canCreateProjectType(license: License, need: string): AccessDecision {
  const { segment, id } = resolve(need);
  if (!id) return { allowed: false, reason: 'unknown project type' };

  const grantedAll = license.projectTypes.includes('*');
  const grantedId = license.projectTypes.includes(id);

  if (segment) {
    if (!license.segments.includes(segment)) {
      return { allowed: false, reason: `client type '${segment}' is not licensed` };
    }
    if (grantedAll || grantedId) return { allowed: true };
    return { allowed: false, reason: `project type '${id}' is not licensed within '${segment}'` };
  }

  // No product segment — must be explicitly licensed (not covered by '*').
  return grantedId
    ? { allowed: true }
    : { allowed: false, reason: `cross-cutting type '${id}' is not explicitly licensed` };
}

/**
 * The filing types the org may create — feeds the New-Project Document-Type
 * picker so a client only ever sees what they're licensed for.
 */
export function licensedProjectTypes(license: License): string[] {
  return getAllActiveSubmissionTypes()
    .filter((e) => canCreateProjectType(license, e.id).allowed)
    .map((e) => e.id);
}

/**
 * The apps a licensed project type includes. Empty when the project type is not
 * licensed — apps are never sold separately; they follow the project type.
 */
export function includedApps(license: License, need: string): string[] {
  if (!canCreateProjectType(license, need).allowed) return [];
  return resolveWorkspaceConfig(need).apps.map((a) => a.id);
}

export default { canCreateProjectType, licensedProjectTypes, includedApps };
