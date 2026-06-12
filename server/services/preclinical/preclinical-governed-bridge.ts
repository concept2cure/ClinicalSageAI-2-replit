/**
 * Preclinical governed bridge — connects PDF digestion to the governed registry.
 *
 * `ingestStudy()` extracts a nonclinical study report into `ctd_nonclinical_studies`
 * (rich, ungoverned, program-scoped). This bridge threads that digested study into
 * the governed C2C-04 registry (`nonclinical_studies`): it creates a governed study
 * row (org-scoped, audited), maps the extraction study-type to the CTD Module 4
 * taxonomy, links provenance digested→governed and governed→submission_module4
 * (and IACUC protocol → governed when supplied), completing the preclinical
 * provenance chain so digested data becomes citable evidence under Module 4.
 *
 * Read CDISC SENDIG / ICH M3 grounding lives in the governed service; this module
 * only maps + threads. Enhancement of an existing pipeline — not a new table.
 *
 * @module server/services/preclinical/preclinical-governed-bridge
 */

import { createStudyTx } from '../nonclinical/nonclinical-service';
import { linkProvenanceTx } from '../provenance/provenance-service';
import type { NonclinicalStudyType } from '../../../shared/schema/nonclinical';
import type { PreclinicalStudy, PreclinicalStudyType } from './preclinical-extraction-schema';

interface Queryable { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>; }

/** Map the extraction taxonomy to the governed CTD Module 4 study-type union. */
export function mapStudyType(t: PreclinicalStudyType): NonclinicalStudyType {
  switch (t) {
    case 'single_dose_tox': return 'single_dose_tox';
    case 'repeat_dose_tox': return 'repeat_dose_tox';
    case 'genotox': return 'genotoxicity';
    case 'carc': return 'carcinogenicity';
    case 'dart': return 'reproductive_tox';
    case 'safety_pharm': return 'safety_pharmacology';
    case 'tk':
    case 'pk':
    case 'adme': return 'adme_pk';
    case 'local_tolerance': return 'local_tolerance';
    default: return 'other';
  }
}

export interface BridgeInput {
  ctdStudyId: number;
  data: PreclinicalStudy;
  sourcePdfId: string;
  submissionId?: number | null;
  iacucProtocolId?: number | null;
}

/**
 * Create a governed nonclinical study from a digested ctd_nonclinical_studies row
 * and thread provenance. Runs inside the caller's transaction; the caller records
 * the governed action + COMMIT.
 */
export async function bridgeIngestedStudyTx(
  client: Queryable, orgId: number, userId: number, input: BridgeInput,
): Promise<{ governedStudyId: number; ctdSection: string; provenanceLinkIds: number[] }> {
  const { data } = input;
  const created = await createStudyTx(client, orgId, userId, {
    // Derive a stable study number from the report number or the digestion handle.
    studyNumber: data.studyReportNumber?.slice(0, 60) || `INGEST-${input.sourcePdfId}`.slice(0, 60),
    title: data.studyTitle?.slice(0, 300) || 'Digested nonclinical study',
    studyType: mapStudyType(data.studyType),
    species: data.species ?? null,
    glpCompliant: data.glpCompliant === true,
    testingFacility: data.testingFacility ?? null,
    noael: data.noael ?? null,
    submissionId: input.submissionId ?? null,
    iacucProtocolId: input.iacucProtocolId ?? null,
  });

  // Thread digested source → governed study so the extracted evidence is citable.
  const derived = await linkProvenanceTx(client, {
    organizationId: orgId, userId,
    sourceType: 'ctd_nonclinical_study', sourceId: input.ctdStudyId,
    targetType: 'nonclinical_study', targetId: created.id, linkRole: 'derived_from',
  });

  return { governedStudyId: created.id, ctdSection: created.ctdSection, provenanceLinkIds: [...created.provenanceLinkIds, derived.id] };
}
