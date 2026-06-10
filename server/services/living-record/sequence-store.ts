/**
 * Living Record Spine — Sequence store (data access).
 *
 * Read access to the eCTD sequence node (regulatory_sequences) so dossier
 * navigation can show a document inside its sequence (Surface 7 of the design
 * handoff). Program-scoped, ordered by sequence number.
 */

import { eq, asc } from 'drizzle-orm';

import { db } from '../../db';
import {
  regulatorySequences,
  type RegulatorySequence,
} from '../../../shared/schema/living-record-spine';

export async function listProgramSequences(programId: string): Promise<RegulatorySequence[]> {
  return db
    .select()
    .from(regulatorySequences)
    .where(eq(regulatorySequences.programId, programId))
    .orderBy(asc(regulatorySequences.sequenceNumber));
}

export async function getSequence(sequenceId: string): Promise<RegulatorySequence | null> {
  const rows = await db
    .select()
    .from(regulatorySequences)
    .where(eq(regulatorySequences.id, sequenceId))
    .limit(1);
  return rows[0] ?? null;
}
