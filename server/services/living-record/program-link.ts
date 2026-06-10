/**
 * Living Record Spine — program-id bridge.
 *
 * Resolves the uuid regulatory_programs id for a claim that only carries the
 * legacy integer program id. The mapping is explicit and operator/UI-populated
 * (living_record_program_links); there is no native FK between the two program
 * namespaces. When no link exists, resolveUuidProgram returns null and the
 * caller no-ops — it never guesses a mapping.
 *
 * See docs/architecture/LIVING_RECORD_SPINE.md §5.
 */

import { and, eq } from 'drizzle-orm';

import { db } from '../../db';
import { livingRecordProgramLinks } from '../../../shared/schema/living-record-spine';

/** Resolve the uuid program for a legacy integer program id, or null. */
export async function resolveUuidProgram(
  legacyProgramId: number,
  organizationId: number
): Promise<string | null> {
  const [row] = await db
    .select({ programId: livingRecordProgramLinks.programId })
    .from(livingRecordProgramLinks)
    .where(
      and(
        eq(livingRecordProgramLinks.organizationId, organizationId),
        eq(livingRecordProgramLinks.legacyProgramId, legacyProgramId)
      )
    )
    .limit(1);
  return row?.programId ?? null;
}

/** Record the legacy↔uuid program link. Idempotent (no-op if it already exists). */
export async function linkLegacyProgram(params: {
  organizationId: number;
  legacyProgramId: number;
  programId: string;
  createdBy?: number | null;
}): Promise<void> {
  await db
    .insert(livingRecordProgramLinks)
    .values({
      organizationId: params.organizationId,
      legacyProgramId: params.legacyProgramId,
      programId: params.programId,
      createdBy: params.createdBy ?? null,
    })
    .onConflictDoNothing();
}
