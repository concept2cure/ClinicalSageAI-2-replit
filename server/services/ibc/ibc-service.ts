/**
 * IBC service (Capability C2C-07)
 *
 * Tenant-scoped transaction functions over ibc_registrations /
 * ibc_biological_agents / ibc_reviews. Mutations run inside the caller's
 * transaction with the governed-action ledger. An `approved` determination
 * records the expiration the committee set, if any, and threads the provenance
 * link ibc_registration → submission_module4 ('supports') — biosafety clearance
 * into the IND-enabling record.
 *
 * DB-backed — authored to the platform's governed-CRUD pattern; runtime-verified
 * in a DB-enabled environment.
 *
 * @module server/services/ibc/ibc-service
 */

import { pool } from '../../db';
import { linkProvenanceTx } from '../provenance/provenance-service';
import { minimumBslForRiskGroup } from './ibc-logic';
import type { BiosafetyLevel, RiskGroup, NihGuidelinesSection, AgentType } from '../../../shared/schema/ibc';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

/** `value` as a YYYY-MM-DD calendar date, or null. 2026-02-30 is not one. */
function calendarDate(value: string | null | undefined): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null;
  return d && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

/**
 * The board's determination date, as recorded by the board — required.
 *
 * A missing date was stamped as the day the record was entered, and the
 * approval date and the continuing-review expiration were derived from it: an
 * approval entered a week late expired a week late (2026-10-15).
 */
function requireDeterminationDate(
  value: string | null | undefined,
  Err: new (code: 'BAD_INPUT', message: string) => Error,
): string {
  const v = calendarDate(value);
  if (!v) {
    throw new Err('BAD_INPUT', 'determinationDate is required, as the date the board made the determination (YYYY-MM-DD).');
  }
  return v;
}

export class IbcError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'IbcError';
  }
}

/**
 * The expiration the committee set on an approval, or null when it set none.
 * Refused on any other outcome, and unless it is a calendar date after the
 * determination.
 */
function committeeExpiration(value: string | null | undefined, outcome: string, determinationDate: string): string | null {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  if (outcome !== 'approved') throw new IbcError('BAD_INPUT', 'expirationDate is recorded only with an approval.');
  const v = calendarDate(value);
  if (!v || v <= determinationDate) {
    throw new IbcError('BAD_INPUT', 'expirationDate must be the calendar date (YYYY-MM-DD) the committee set for this approval to expire, after the determination date.');
  }
  return v;
}

// ─── Registrations ───────────────────────────────────────────────────────────

export interface RegistrationInput {
  registrationNumber: string;
  title: string;
  /** Absent/null means NOT RECORDED, not 'not_applicable'. */
  nihGuidelinesSection?: NihGuidelinesSection | null;
  /** Declared containment. Absent/null means NOT DECLARED, not BSL-1. */
  biosafetyLevel?: BiosafetyLevel | null;
  submissionId?: number | null;
  /** Absent/null means NOT RECORDED, not "no". */
  involvesRecombinantDna?: boolean | null;
  /** Absent/null means NOT RECORDED, not "no". */
  involvesHumanGeneTransfer?: boolean | null;
}

export async function createRegistrationTx(client: Queryable, orgId: number, userId: number, input: RegistrationInput): Promise<{ id: number }> {
  // The section and the gene-transfer flag were written as 'not_applicable' /
  // false when absent, so convened review read as not required; the
  // recombinant-DNA flag as `=== true`, and an undeclared containment took the
  // column default BSL-1 (2026-10-15).
  const { rows } = await client.query(
    `INSERT INTO ibc_registrations
       (organization_id, submission_id, registration_number, title, nih_guidelines_section, biosafety_level,
        involves_recombinant_dna, involves_human_gene_transfer, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9) RETURNING id`,
    [orgId, input.submissionId ?? null, input.registrationNumber, input.title, input.nihGuidelinesSection ?? null,
      input.biosafetyLevel ?? null, input.involvesRecombinantDna ?? null, input.involvesHumanGeneTransfer ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

async function getRegistration(client: Queryable, orgId: number, id: number): Promise<any> {
  const { rows } = await client.query(
    `SELECT * FROM ibc_registrations WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [id, orgId],
  );
  if (rows.length === 0) throw new IbcError('NOT_FOUND', 'IBC registration not found for this organization.');
  return rows[0];
}

const STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'conditional', 'disapproved', 'expired', 'closed'];

export async function setRegistrationStatusTx(client: Queryable, orgId: number, id: number, status: string): Promise<void> {
  if (!STATUSES.includes(status)) throw new IbcError('BAD_INPUT', `Invalid status "${status}".`);
  await getRegistration(client, orgId, id);
  await client.query(
    `UPDATE ibc_registrations SET status = $3, updated_at = now() WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId, status],
  );
}

/** Add a biological agent; required_bsl is derived from the risk group (never trusted from input). */
export async function addAgentTx(client: Queryable, orgId: number, userId: number, registrationId: number, input: { agentName: string; agentType: AgentType; riskGroup: RiskGroup }): Promise<{ id: number; requiredBsl: BiosafetyLevel }> {
  await getRegistration(client, orgId, registrationId);
  const requiredBsl = minimumBslForRiskGroup(input.riskGroup);
  const { rows } = await client.query(
    `INSERT INTO ibc_biological_agents (organization_id, registration_id, agent_name, agent_type, risk_group, required_bsl, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [orgId, registrationId, input.agentName, input.agentType, input.riskGroup, requiredBsl, userId],
  );
  return { id: Number(rows[0].id), requiredBsl };
}

/**
 * Record a determination. `approved` flips the registration to approved, stamps
 * the approval date and the expiration the committee set (if it set one), and
 * threads provenance to the IND-enabling submission when present.
 *
 * `expirationDate` is the COMMITTEE's. It used to be computed here as
 * determination + 1 year and stored where the list serves the committee's date
 * (2026-10-15). Without one the column stays NULL and registrationExpiration
 * derives the date itself, labelled 'computed'.
 */
export async function recordReviewTx(
  client: Queryable,
  orgId: number,
  userId: number,
  registrationId: number,
  input: { outcome: 'approved' | 'conditional' | 'disapproved' | 'tabled'; convenedQuorum?: boolean | null; conditions?: string | null; determinationDate?: string | null; expirationDate?: string | null },
): Promise<{ reviewId: number; expirationDate: string | null; provenanceLinkId: number | null }> {
  const reg = await getRegistration(client, orgId, registrationId);
  const determinationDate = requireDeterminationDate(input.determinationDate, IbcError);
  const expirationDate = committeeExpiration(input.expirationDate, input.outcome, determinationDate);
  // convened_quorum: unstated stays NULL. It was written `=== true`, so a
  // determination nobody described read as made without a quorum (2026-10-15).
  const { rows } = await client.query(
    `INSERT INTO ibc_reviews (organization_id, registration_id, outcome, convened_quorum, conditions, determination_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [orgId, registrationId, input.outcome, input.convenedQuorum ?? null, input.conditions ?? null, determinationDate, userId],
  );
  const reviewId = Number(rows[0].id);

  let provenanceLinkId: number | null = null;
  if (input.outcome === 'approved') {
    await client.query(
      `UPDATE ibc_registrations SET status = 'approved', approval_date = $3, expiration_date = $4, updated_at = now()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [registrationId, orgId, determinationDate, expirationDate],
    );
    if (reg.submission_id != null) {
      const link = await linkProvenanceTx(client, {
        organizationId: orgId, userId, sourceType: 'ibc_registration', sourceId: registrationId,
        targetType: 'submission_module4', targetId: Number(reg.submission_id), linkRole: 'supports',
      });
      provenanceLinkId = link.id;
    }
  } else if (input.outcome === 'conditional') {
    await client.query(
      `UPDATE ibc_registrations SET status = 'conditional', updated_at = now() WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [registrationId, orgId],
    );
  }
  return { reviewId, expirationDate, provenanceLinkId };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listRegistrations(orgId: number, submissionId?: number): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, submission_id, registration_number, title, nih_guidelines_section, biosafety_level,
                    involves_human_gene_transfer, status, approval_date, expiration_date
               FROM ibc_registrations WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (submissionId != null) { params.push(submissionId); sql += ` AND submission_id = $2`; }
  sql += ` ORDER BY created_at DESC`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function getContainmentInput(client: Queryable, orgId: number, id: number): Promise<{
  /** NULL = not declared; the containment check is then not assessed. */
  declaredBsl: BiosafetyLevel | null;
  nihGuidelinesSection: NihGuidelinesSection | null;
  involvesHumanGeneTransfer: boolean | null;
  agents: Array<{ agentName: string; riskGroup: RiskGroup; requiredBsl: BiosafetyLevel }>;
  approvalDate: string | null;
  /** The expiration the committee recorded, or null; registrationExpiration prefers it to its computed one. */
  expirationDate: string | null;
}> {
  // approval_date as text: node-postgres returns a DATE as a Date, on which
  // addYears returned its input, so `expired` was always false (2026-10-15).
  const { rows: found } = await client.query(
    `SELECT biosafety_level, nih_guidelines_section, involves_human_gene_transfer, approval_date::text AS approval_date,
            expiration_date::text AS expiration_date
       FROM ibc_registrations WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [id, orgId],
  );
  if (found.length === 0) throw new IbcError('NOT_FOUND', 'IBC registration not found for this organization.');
  const reg = found[0];
  const { rows } = await client.query(
    `SELECT agent_name, risk_group, required_bsl FROM ibc_biological_agents WHERE registration_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`,
    [id, orgId],
  );
  return {
    declaredBsl: reg.biosafety_level ?? null,
    nihGuidelinesSection: reg.nih_guidelines_section ?? null,
    involvesHumanGeneTransfer: reg.involves_human_gene_transfer ?? null,
    agents: rows.map((a) => ({ agentName: a.agent_name, riskGroup: a.risk_group, requiredBsl: a.required_bsl })),
    approvalDate: reg.approval_date,
    expirationDate: reg.expiration_date ?? null,
  };
}
