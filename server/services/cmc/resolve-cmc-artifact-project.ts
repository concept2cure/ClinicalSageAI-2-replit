/**
 * The CMC ↔ governed-artifact spine resolver.
 *
 * CMC Module 3 tables key `project_id` as free TEXT (migrations/0017 dropped
 * the FKs): the v2 shell passes the `regulatory_programs` UUID, legacy
 * callers pass the numeric `projects.id` as a string. The governed artifact
 * registry (`concept2cure_artifacts.project_id`) is an INTEGER FK →
 * `projects.id`. Any CMC query that touches the registry with the raw TEXT id
 * either aborts (22P02: a UUID literal against an integer column takes the
 * whole statement — and any surrounding Promise.all — down) or silently
 * matches nothing.
 *
 * That is not hypothetical; it is what shipped: build-state 500'd for every
 * wizard-created program, and the compile auto-bridge caught its own insert
 * failure per section and dropped every artifact with a console.warn.
 *
 * This module is the one translation rule:
 *
 *   numeric string → that `projects.id`, but ONLY when the row belongs to the
 *                    caller's org (legacy callers). A numeric id owned by
 *                    another org is 'unaddressable', never resolved — the same
 *                    tenant scoping the uuid branch gets from the anchor reader.
 *   UUID           → the program's anchored `projects.id` via
 *                    resolveProgramProjectAnchor — the canonical anchor
 *                    reader. No anchor is a real, reportable state
 *                    ('unanchored'), never a guess.
 *   anything else  → 'unaddressable'
 *
 * Callers MUST branch on the resolution and keep an honest degraded path for
 * the null cases: skip the registry query and say why, never substitute the
 * raw id, and never render the absence as a plain empty result.
 */
import { and, eq } from 'drizzle-orm';
import { db as runtimeDb } from '../../db/runtime';
import type { RequestDb } from '../../db/requestDb';
import { projects } from '../../../shared/schema';
import { resolveProgramProjectAnchor } from '../c2c/program-project-anchor';
import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('cmc-artifact-spine');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ArtifactSpineState = 'linked' | 'unanchored' | 'unaddressable';

export type ArtifactProjectResolution =
  | { state: 'linked'; artifactProjectId: number; via: 'numeric' | 'program-anchor' }
  | {
      state: 'unanchored' | 'unaddressable';
      artifactProjectId: null;
      /** Human-readable fact for API responses — why the registry is out of reach. */
      detail: string;
    };

/**
 * Resolve the integer artifact-spine project id for a CMC TEXT project id.
 * Never throws for an unresolvable id — the resolution IS the answer.
 */
export async function resolveCmcArtifactProject(
  orgId: number,
  cmcProjectId: string,
  deps: { db?: RequestDb } = {},
): Promise<ArtifactProjectResolution> {
  const raw = String(cmcProjectId ?? '').trim();

  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (!(Number.isSafeInteger(n) && n > 0)) {
      return {
        state: 'unaddressable',
        artifactProjectId: null,
        detail: `Project id ${raw} is not a valid projects.id.`,
      };
    }

    // Org-scope the numeric branch exactly as the uuid branch is org-scoped
    // through resolveProgramProjectAnchor: a caller-supplied projects.id is only
    // 'linked' when that row actually belongs to `orgId`. Without this check a
    // caller could name ANOTHER tenant's projects.id and have the CMC artifact
    // spine (and every provenance/compile write keyed to it) resolve against it —
    // a cross-tenant read/write. An id that is not owned is not addressable for
    // this caller, so we take the same honest unresolved path the function
    // already uses, never leaking whether the row exists in some other org.
    const database = deps.db ?? (runtimeDb as RequestDb);
    try {
      const rows = await database
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, n), eq(projects.organizationId, orgId)))
        .limit(1);
      if (rows.length > 0) {
        return { state: 'linked', artifactProjectId: n, via: 'numeric' };
      }
    } catch (err) {
      logger.warn('Numeric project-id ownership check failed; treating id as unaddressable', {
        orgId,
        projectId: n,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    return {
      state: 'unaddressable',
      artifactProjectId: null,
      detail: `Project id ${raw} is not a projects.id in this organization.`,
    };
  }

  if (UUID_RE.test(raw)) {
    const anchored = await resolveProgramProjectAnchor(deps.db ?? (runtimeDb as RequestDb), {
      programId: raw,
      orgId,
      context: 'cmc-artifact-spine',
    });
    if (anchored != null) {
      return { state: 'linked', artifactProjectId: anchored, via: 'program-anchor' };
    }
    return {
      state: 'unanchored',
      artifactProjectId: null,
      detail:
        'This program has no PM-spine anchor (projects.regulatory_program_id), so the governed ' +
        'artifact registry cannot be addressed for it. CMC capture, compile and provenance still ' +
        'work; artifacts stay unplaced until the program is anchored.',
    };
  }

  return {
    state: 'unaddressable',
    artifactProjectId: null,
    detail: `Project id ${raw || '(empty)'} is neither a projects.id nor a program uuid.`,
  };
}
