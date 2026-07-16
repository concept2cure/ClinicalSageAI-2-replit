/**
 * Nonclinical + SEND service (Capability C2C-04)
 *
 * Tenant-scoped transaction functions over nonclinical_studies / send_datasets.
 * Mutations run inside the caller's transaction with the governed-action ledger.
 * Creating a study derives its CTD Module 4 section and threads the provenance
 * chain: iacuc_protocol → nonclinical_study ('authorizes') and nonclinical_study
 * → submission_module4 ('supports') — completing the preclinical provenance chain.
 *
 * DB-backed — authored to the platform's governed-CRUD pattern; runtime-verified
 * in a DB-enabled environment.
 *
 * @module server/services/nonclinical/nonclinical-service
 */

import { pool } from '../../db';
import { linkProvenanceTx } from '../provenance/provenance-service';
import { ctdSectionFor } from './nonclinical-logic';
import type { NonclinicalStudyType, SendValidationStatus } from '../../../shared/schema/nonclinical';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class NonclinicalError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'NonclinicalError';
  }
}

export interface StudyInput {
  studyNumber: string;
  title: string;
  studyType: NonclinicalStudyType;
  species?: string | null;
  glpCompliant?: boolean;
  testingFacility?: string | null;
  noael?: string | null;
  submissionId?: number | null;
  iacucProtocolId?: number | null;
}

export async function createStudyTx(client: Queryable, orgId: number, userId: number, input: StudyInput): Promise<{ id: number; ctdSection: string; provenanceLinkIds: number[] }> {
  if (input.iacucProtocolId != null) {
    const owner = await client.query(`SELECT id FROM iacuc_protocols WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [input.iacucProtocolId, orgId]);
    if (owner.rows.length === 0) throw new NonclinicalError('NOT_FOUND', 'IACUC protocol not found for this organization.');
  }
  const ctdSection = ctdSectionFor(input.studyType);
  const { rows } = await client.query(
    `INSERT INTO nonclinical_studies
       (organization_id, submission_id, iacuc_protocol_id, study_number, title, study_type, species, glp_compliant, testing_facility, noael, status, ctd_section, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'planned',$11,$12) RETURNING id`,
    [orgId, input.submissionId ?? null, input.iacucProtocolId ?? null, input.studyNumber, input.title, input.studyType,
      input.species ?? null, input.glpCompliant === true, input.testingFacility ?? null, input.noael ?? null, ctdSection, userId],
  );
  const id = Number(rows[0].id);

  const provenanceLinkIds: number[] = [];
  if (input.iacucProtocolId != null) {
    const link = await linkProvenanceTx(client, { organizationId: orgId, userId, sourceType: 'iacuc_protocol', sourceId: input.iacucProtocolId, targetType: 'nonclinical_study', targetId: id, linkRole: 'authorizes' });
    provenanceLinkIds.push(link.id);
  }
  if (input.submissionId != null) {
    const link = await linkProvenanceTx(client, { organizationId: orgId, userId, sourceType: 'nonclinical_study', sourceId: id, targetType: 'submission_module4', targetId: input.submissionId, linkRole: 'supports' });
    provenanceLinkIds.push(link.id);
  }
  return { id, ctdSection, provenanceLinkIds };
}

const STATUSES = ['planned', 'in_life', 'in_reporting', 'finalized', 'cancelled'];

export async function setStudyStatusTx(client: Queryable, orgId: number, id: number, status: string, reportFinalizedDate?: string | null): Promise<void> {
  if (!STATUSES.includes(status)) throw new NonclinicalError('BAD_INPUT', `Invalid status "${status}".`);
  const r = await client.query(
    `UPDATE nonclinical_studies SET status = $3, report_finalized_date = COALESCE($4, report_finalized_date), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId, status, status === 'finalized' ? (reportFinalizedDate ?? new Date().toISOString().slice(0, 10)) : reportFinalizedDate ?? null],
  );
  if ((r as any).rowCount === 0) throw new NonclinicalError('NOT_FOUND', 'Study not found for this organization.');
}

export interface SendInput {
  sendigVersion?: string;
  domainsPresent: string[];
  defineXmlPresent?: boolean;
  nsdrcPresent?: boolean;
  validationStatus?: SendValidationStatus;
  validatorErrorCount?: number;
  validatorWarningCount?: number;
}

export async function upsertSendDatasetTx(client: Queryable, orgId: number, userId: number, studyId: number, input: SendInput): Promise<{ id: number }> {
  const owner = await client.query(`SELECT id FROM nonclinical_studies WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [studyId, orgId]);
  if (owner.rows.length === 0) throw new NonclinicalError('NOT_FOUND', 'Study not found for this organization.');
  const existing = await client.query(`SELECT id FROM send_datasets WHERE study_id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [studyId, orgId]);
  const domains = input.domainsPresent.map((d) => d.toUpperCase());
  if (existing.rows.length > 0) {
    const id = Number(existing.rows[0].id);
    await client.query(
      `UPDATE send_datasets SET sendig_version = $3, domains_present = $4, define_xml_present = $5, nsdrc_present = $6,
          validation_status = $7, validator_error_count = $8, validator_warning_count = $9, updated_at = now()
        WHERE id = $1 AND organization_id = $2`,
      [id, orgId, input.sendigVersion ?? '3.1', domains, input.defineXmlPresent === true, input.nsdrcPresent === true,
        input.validationStatus ?? 'not_validated', input.validatorErrorCount ?? 0, input.validatorWarningCount ?? 0],
    );
    return { id };
  }
  const { rows } = await client.query(
    `INSERT INTO send_datasets
       (organization_id, study_id, sendig_version, domains_present, define_xml_present, nsdrc_present, validation_status, validator_error_count, validator_warning_count, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [orgId, studyId, input.sendigVersion ?? '3.1', domains, input.defineXmlPresent === true, input.nsdrcPresent === true,
      input.validationStatus ?? 'not_validated', input.validatorErrorCount ?? 0, input.validatorWarningCount ?? 0, userId],
  );
  return { id: Number(rows[0].id) };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listStudies(orgId: number, submissionId?: number): Promise<any[]> {
  // Shaped to the nonclinical review board's display contract
  // ({ id, type, species, dur, finding, cls, send }). `id` is the human study
  // number; `send` (CDISC SEND conformance) is derived from the study's latest
  // send_datasets row so no column duplicates that state.
  const params: unknown[] = [orgId];
  let sql = `
    SELECT s.study_number                         AS id,
           CASE s.study_type
             WHEN 'repeat_dose_tox'     THEN 'Repeat-dose tox'
             WHEN 'single_dose_tox'     THEN 'Single-dose tox'
             WHEN 'safety_pharmacology' THEN 'Safety pharmacology'
             WHEN 'genotoxicity'        THEN 'Genotoxicity'
             WHEN 'carcinogenicity'     THEN 'Carcinogenicity'
             WHEN 'reproductive_tox'    THEN 'Reproductive tox'
             WHEN 'local_tolerance'     THEN 'Local tolerance'
             WHEN 'adme_pk'             THEN 'Toxicokinetics'
             WHEN 'immunotoxicity'      THEN 'Immunotoxicity'
             ELSE initcap(replace(s.study_type, '_', ' '))
           END                                    AS type,
           s.species,
           s.duration_label                       AS dur,
           s.key_finding                          AS finding,
           s.finding_class                        AS cls,
           CASE
             WHEN sd.validation_status IS NULL     THEN 'n/a'
             WHEN sd.validation_status = 'passed'  THEN 'conforms'
             ELSE 'in progress'
           END                                    AS send
      FROM nonclinical_studies s
      LEFT JOIN LATERAL (
        SELECT validation_status
          FROM send_datasets
         WHERE study_id = s.id AND deleted_at IS NULL
         ORDER BY updated_at DESC
         LIMIT 1
      ) sd ON true
     WHERE s.organization_id = $1 AND s.deleted_at IS NULL`;
  if (submissionId != null) { params.push(submissionId); sql += ` AND s.submission_id = $2`; }
  sql += ` ORDER BY s.created_at DESC`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function getSendReadinessInput(client: Queryable, orgId: number, studyId: number): Promise<{
  studyType: NonclinicalStudyType;
  domainsPresent: string[];
  defineXmlPresent: boolean;
  nsdrcPresent: boolean;
  validationStatus: SendValidationStatus;
  validatorErrorCount: number;
}> {
  const study = await client.query(`SELECT study_type FROM nonclinical_studies WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [studyId, orgId]);
  if (study.rows.length === 0) throw new NonclinicalError('NOT_FOUND', 'Study not found for this organization.');
  const send = await client.query(
    `SELECT domains_present, define_xml_present, nsdrc_present, validation_status, validator_error_count
       FROM send_datasets WHERE study_id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [studyId, orgId],
  );
  const s = send.rows[0];
  return {
    studyType: study.rows[0].study_type,
    domainsPresent: s ? (s.domains_present ?? []) : [],
    defineXmlPresent: s ? s.define_xml_present : false,
    nsdrcPresent: s ? s.nsdrc_present : false,
    validationStatus: s ? s.validation_status : 'not_validated',
    validatorErrorCount: s ? Number(s.validator_error_count) : 0,
  };
}
