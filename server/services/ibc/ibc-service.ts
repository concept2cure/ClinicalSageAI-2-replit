/**
 * IBC service (Capability C2C-07)
 *
 * Tenant-scoped transaction functions over ibc_registrations /
 * ibc_biological_agents / ibc_reviews. Mutations run inside the caller's
 * transaction with the governed-action ledger. An `approved` determination sets
 * the 1-year review expiration and threads the provenance link ibc_registration
 * → submission_module4 ('supports') — biosafety clearance into the IND-enabling
 * record.
 *
 * DB-backed — authored to the platform's governed-CRUD pattern; runtime-verified
 * in a DB-enabled environment.
 *
 * @module server/services/ibc/ibc-service
 */

import { pool } from '../../db';
import { linkProvenanceTx } from '../provenance/provenance-service';
import { minimumBslForRiskGroup, registrationExpiration } from './ibc-logic';
import type { BiosafetyLevel, RiskGroup, NihGuidelinesSection, AgentType } from '../../../shared/schema/ibc';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class IbcError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'IbcError';
  }
}

// ─── Registrations ───────────────────────────────────────────────────────────

export interface RegistrationInput {
  registrationNumber: string;
  title: string;
  nihGuidelinesSection?: NihGuidelinesSection;
  biosafetyLevel: BiosafetyLevel;
  submissionId?: number | null;
  involvesRecombinantDna?: boolean;
  involvesHumanGeneTransfer?: boolean;
}

export async function createRegistrationTx(client: Queryable, orgId: number, userId: number, input: RegistrationInput): Promise<{ id: number }> {
  const { rows } = await client.query(
    `INSERT INTO ibc_registrations
       (organization_id, submission_id, registration_number, title, nih_guidelines_section, biosafety_level,
        involves_recombinant_dna, involves_human_gene_transfer, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9) RETURNING id`,
    [orgId, input.submissionId ?? null, input.registrationNumber, input.title, input.nihGuidelinesSection ?? 'not_applicable',
      input.biosafetyLevel, input.involvesRecombinantDna === true, input.involvesHumanGeneTransfer === true, userId],
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
 * the 1-year review expiration, and threads provenance to the IND-enabling
 * submission when present.
 */
export async function recordReviewTx(
  client: Queryable,
  orgId: number,
  userId: number,
  registrationId: number,
  input: { outcome: 'approved' | 'conditional' | 'disapproved' | 'tabled'; convenedQuorum?: boolean; conditions?: string | null; determinationDate?: string | null },
): Promise<{ reviewId: number; expirationDate: string | null; provenanceLinkId: number | null }> {
  const reg = await getRegistration(client, orgId, registrationId);
  const determinationDate = input.determinationDate ?? new Date().toISOString().slice(0, 10);
  const { rows } = await client.query(
    `INSERT INTO ibc_reviews (organization_id, registration_id, outcome, convened_quorum, conditions, determination_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [orgId, registrationId, input.outcome, input.convenedQuorum === true, input.conditions ?? null, determinationDate, userId],
  );
  const reviewId = Number(rows[0].id);

  let expirationDate: string | null = null;
  let provenanceLinkId: number | null = null;
  if (input.outcome === 'approved') {
    expirationDate = registrationExpiration(determinationDate, determinationDate).expirationDate;
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
  declaredBsl: BiosafetyLevel;
  nihGuidelinesSection: NihGuidelinesSection;
  involvesHumanGeneTransfer: boolean;
  agents: Array<{ agentName: string; riskGroup: RiskGroup; requiredBsl: BiosafetyLevel }>;
  approvalDate: string | null;
}> {
  const reg = await getRegistration(client, orgId, id);
  const { rows } = await client.query(
    `SELECT agent_name, risk_group, required_bsl FROM ibc_biological_agents WHERE registration_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`,
    [id, orgId],
  );
  return {
    declaredBsl: reg.biosafety_level,
    nihGuidelinesSection: reg.nih_guidelines_section,
    involvesHumanGeneTransfer: reg.involves_human_gene_transfer,
    agents: rows.map((a) => ({ agentName: a.agent_name, riskGroup: a.risk_group, requiredBsl: a.required_bsl })),
    approvalDate: reg.approval_date,
  };
}
