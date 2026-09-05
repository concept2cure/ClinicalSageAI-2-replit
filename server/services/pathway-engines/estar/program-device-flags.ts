/**
 * The device questions a program answered at intake, in the shape the eSTAR
 * mapper reads.
 *
 * Intake stores the wizard's device flags on `regulatory_programs.metadata`
 * as `deviceFlags: DeviceFlagId[]` — the questions that were answered YES. The
 * mapper wants every question: `true`, `false`, or absent for "nobody has
 * asked". A section whose applicability nobody established is reported as
 * undetermined and counts against filing readiness (estar-filing-readiness),
 * so the difference between "answered: none apply" and "never asked" is the
 * difference between a fileable 510(k) and one the platform refuses to call
 * complete.
 *
 * Before this, no route caller passed flags at all: every program read as
 * undetermined on every conditional section, so no program could report a
 * producible official eSTAR — a readiness engine that could only ever say no.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../../db';
import { regulatoryPrograms } from '../../../../shared/schema/programs';
import { DEVICE_FLAGS, type DeviceFlagId } from '../../../../shared/constants/domain/device-classification';
import type { DeviceFlags } from './estar-mapper';

const FLAG_IDS = DEVICE_FLAGS.map((f) => f.id as DeviceFlagId);

/**
 * `deviceFlags` on a program's metadata, expanded to every question.
 *
 * Returns undefined when the questions were never answered — the metadata has
 * no `deviceFlags` array — so the mapper keeps reporting those sections as
 * undetermined rather than as not applicable.
 */
export function deviceFlagsFromMetadata(metadata: unknown): DeviceFlags | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const raw = (metadata as { deviceFlags?: unknown }).deviceFlags;
  if (!Array.isArray(raw)) return undefined;
  const yes = new Set(raw.filter((f): f is string => typeof f === 'string'));
  const out: DeviceFlags = {};
  for (const id of FLAG_IDS) out[id] = yes.has(id);
  return out;
}

/** The program's answered device questions, or undefined when never answered or the program is not in the org. */
export async function loadProgramDeviceFlags(
  organizationId: number,
  programId: string,
): Promise<DeviceFlags | undefined> {
  const rows = await db
    .select({ metadata: regulatoryPrograms.metadata })
    .from(regulatoryPrograms)
    .where(and(eq(regulatoryPrograms.id, programId), eq(regulatoryPrograms.organizationId, organizationId)))
    .limit(1);
  return rows.length ? deviceFlagsFromMetadata(rows[0].metadata) : undefined;
}
