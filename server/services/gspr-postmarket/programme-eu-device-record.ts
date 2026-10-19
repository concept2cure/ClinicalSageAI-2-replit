/**
 * The EU device facts a programme record states — the one read behind every
 * post-market and GSPR answer about a European device.
 *
 * Why this module exists. The documentation-status route took the device class
 * from a query parameter and the draft generator took it from the request
 * body, so the class a governed obligation set was computed from was whatever
 * the caller sent. The CER surface sent `regulatory_programs.device_class` —
 * the US 21 CFR 860 class — into an MDR assessment, which
 * `normaliseEuDeviceClass` rightly refused: a European programme was told
 * `"class II" is not an MDR device class` while its MDR class sat unread in
 * `eu_mdr_class` (added 480c3f36, written by the project-setup projection).
 *
 * So the class comes from the record, by regulation, and from nowhere else. A
 * record that states no class yields null and the report says the class is not
 * set — which is now a fact about the programme rather than an artefact of
 * what the client happened to send.
 *
 * Custom-made is asked nowhere and no column holds it, so it is never stated
 * here; `computeDocStatus` says so in `assumptions` and treats the device as
 * not custom-made, which can only add obligations.
 */

import { and, eq } from 'drizzle-orm';

import { db } from '../../db';
import { regulatoryPrograms } from '../../../shared/schema/programs';
import { isIvdFamily } from '../../../shared/constants/domain/product-types.js';
import { deviceFlagsFromMetadata } from '../pathway-engines/estar/program-device-flags';

export type EuDeviceRegulation = 'MDR' | 'IVDR';

/** The columns of `regulatory_programs` the EU device facts come from. */
export interface ProgrammeEuDeviceRow {
  productType: string | null;
  euMdrClass: string | null;
  euIvdrClass: string | null;
  metadata: unknown;
}

/**
 * The class the record states under this regulation, or null. A device is
 * classified under the MDR and a diagnostic under the IVDR — different
 * regulations, different vocabularies — so the regulation picks the column
 * rather than one column answering for both.
 */
export function euDeviceClassFrom(
  row: ProgrammeEuDeviceRow,
  regulation: EuDeviceRegulation
): string | null {
  const stated = regulation === 'IVDR' ? row.euIvdrClass : row.euMdrClass;
  return typeof stated === 'string' && stated.trim() !== '' ? stated.trim() : null;
}

/** The regulation the record's product type puts the device under. */
export function euRegulationFrom(row: ProgrammeEuDeviceRow): EuDeviceRegulation {
  return isIvdFamily(String(row.productType ?? '').trim().toLowerCase()) ? 'IVDR' : 'MDR';
}

/**
 * The post-market facts the record states. `implantable` is an intake question
 * (`metadata.deviceFlags`); a question nobody answered stays null, which the
 * obligation resolver reads as undetermined rather than as false.
 */
export function euPostMarketFactsFrom(row: ProgrammeEuDeviceRow): {
  implantable: boolean | null;
  customMade: boolean | null;
} {
  const flags = deviceFlagsFromMetadata(row.metadata);
  return {
    implantable: typeof flags?.implantable === 'boolean' ? flags.implantable : null,
    customMade: null,
  };
}

/** The programme's EU device row, or null when it is not in the organization. */
export async function loadProgrammeEuDeviceRow(
  organizationId: number,
  programId: string
): Promise<ProgrammeEuDeviceRow | null> {
  const [row] = await db
    .select({
      productType: regulatoryPrograms.productType,
      euMdrClass: regulatoryPrograms.euMdrClass,
      euIvdrClass: regulatoryPrograms.euIvdrClass,
      metadata: regulatoryPrograms.metadata,
    })
    .from(regulatoryPrograms)
    .where(and(eq(regulatoryPrograms.id, programId), eq(regulatoryPrograms.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}
