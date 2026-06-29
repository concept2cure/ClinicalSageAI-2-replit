/**
 * @fileoverview Tenant-scoped reader: cmc_source_objects → orchestrator CanonicalSource[].
 * @module server/services/cmc/load-cmc-sources-for-project
 *
 * Path-to-GA Turn 1, Step 1 (post-Move-6). The submission-package-orchestrator
 * consumes Module 3 inputs as `CanonicalSource[]` (see
 * `OrchestratorInputs.cmcSources`). Write-through is already wired
 * (`cmc-write-through.ts` upserts every CMC data-entry save into
 * `cmc_source_objects`), but there is no READER that returns the
 * orchestrator-shaped inputs from (orgId, projectId). Without this reader
 * the orchestrator route is unreachable from any UI: it requires hand-built
 * server-internal payloads.
 *
 * This module closes that gap by reading `cmc_source_objects` tenant-scoped
 * and reshaping each row into the `CanonicalSource` contract consumed by
 * `module3Composer.composeFullModule3` and the m3.compose step.
 *
 * Design notes:
 *   - Uses Drizzle ORM (no raw SQL). The table is defined in
 *     `shared/schema/cmc-os.ts` as `cmcSourceObjects`.
 *   - Tenant-scope is non-negotiable: both `organization_id` AND `project_id`
 *     filters are applied. Org positivity is asserted at entry; we throw
 *     before any DB I/O.
 *   - `cmcSourceObjects.projectId` is a `uuid` (FK → `cmcProjects.id`), so
 *     the projectId parameter is typed `string`. The legacy/orchestrator
 *     numeric projectId (concept2cure `projects.id`) does not address the
 *     CMC project space; callers must pass the CMC project uuid that
 *     write-through used as the `projectId` argument.
 *   - We return only the latest `version` per (sourceType, sourceKey) pair
 *     so the composer never sees superseded payloads. cmc-write-through
 *     currently always writes version=1 (ON CONFLICT updates in place),
 *     so a simple ORDER BY version DESC, updated_at DESC + dedup is correct
 *     today and forward-compatible if a version bump is introduced.
 */

import { and, desc, eq } from 'drizzle-orm';

import { db } from '../../db';
import { cmcSourceObjects } from '../../../shared/schema/cmc-os';
import type { CanonicalSource, CmcSourceType } from '../module3Composer';

/**
 * Read all canonical CMC source objects for a (organization, CMC project)
 * pair and return them in the shape consumed by the orchestrator's
 * `m3.compose` step.
 *
 * @param orgId      Positive integer organization id.
 * @param projectId  CMC project uuid (matches `cmc_source_objects.project_id`).
 * @returns Latest-version CanonicalSource[] tenant-scoped to the org.
 * @throws Error when orgId is missing or non-positive.
 */
export async function loadCmcSourcesForProject(
  orgId: number,
  projectId: string,
): Promise<CanonicalSource[]> {
  // ── Tenant-scope precondition (non-negotiable) ──────────────────────────
  if (!Number.isInteger(orgId) || orgId <= 0) {
    throw new Error(
      `[loadCmcSourcesForProject] organizationId must be a positive integer; got ${String(orgId)}`,
    );
  }
  if (!projectId || typeof projectId !== 'string') {
    // Empty projectId would scope to "all projects in the org" — refuse.
    throw new Error(
      `[loadCmcSourcesForProject] projectId is required (CMC project uuid); got ${String(projectId)}`,
    );
  }
  if (!db) {
    throw new Error('[loadCmcSourcesForProject] Drizzle db is not initialized');
  }

  // ── Tenant-scoped read ──────────────────────────────────────────────────
  // ORDER BY version DESC, updated_at DESC so the first row per
  // (sourceType, sourceKey) is the freshest. We then deduplicate to that
  // first row, mirroring the write-through "latest wins" semantics.
  const rows = await db
    .select({
      id: cmcSourceObjects.id,
      sourceType: cmcSourceObjects.sourceType,
      sourceKey: cmcSourceObjects.sourceKey,
      sourcePayload: cmcSourceObjects.sourcePayload,
      sourceHash: cmcSourceObjects.sourceHash,
      organizationId: cmcSourceObjects.organizationId,
      projectId: cmcSourceObjects.projectId,
    })
    .from(cmcSourceObjects)
    .where(
      and(
        eq(cmcSourceObjects.organizationId, orgId),
        eq(cmcSourceObjects.projectId, projectId),
      ),
    )
    .orderBy(desc(cmcSourceObjects.version), desc(cmcSourceObjects.updatedAt));

  // ── Dedup: keep first occurrence per (sourceType, sourceKey) ────────────
  const seen = new Set<string>();
  const latest: typeof rows = [];
  for (const row of rows) {
    const key = `${row.sourceType}::${row.sourceKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(row);
  }

  // ── Reshape to CanonicalSource ─────────────────────────────────────────
  // Mirror cmc-write-through.ts: sourcePayload is jsonb already in the
  // composer-consumable shape (produced by the map*Payload helpers). The
  // sourceType column accepts any CMC source-type string; we coerce to the
  // shared union type for the composer's match logic. organizationId /
  // projectId tags are carried through so cross-tenant composer callers
  // (e.g. buildModule3WithNarrative) can assert tenant consistency.
  return latest.map((row): CanonicalSource => ({
    id: String(row.id),
    sourceType: row.sourceType as CmcSourceType,
    sourcePayload: (row.sourcePayload ?? {}) as Record<string, any>,
    sourceHash: row.sourceHash ?? undefined,
    organizationId: row.organizationId,
    projectId: row.projectId,
  }));
}
