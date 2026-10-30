/** One canonical seed body; transaction ownership is explicit, never inferred from connect(). */
import type { RequestSqlClient } from '../../db/requestDb';
import { requireRbmProgram, type RbmActor } from './rbm-access';
import { DEFAULT_CTQ_FACTORS, scoreRisk, overallRiskFromScores } from './rbm-engine';
interface SeedInput { programId: string; title?: string; framework?: string }
interface SeedLease extends RequestSqlClient { release(error?: Error): void }
export interface RbmSeedPool { connect(): Promise<SeedLease> }
async function writeSeed(client: RequestSqlClient, actor: RbmActor, input: SeedInput) {
  await requireRbmProgram(client, actor, { programId: input.programId }, true);
  const overall = overallRiskFromScores(DEFAULT_CTQ_FACTORS.map(f => scoreRisk(f.likelihood, f.impact).score));
  const { rows } = await client.query(`INSERT INTO rbm_risk_assessments (organization_id, program_id, title, framework, overall_risk, status, created_by)
    VALUES ($1,$2,$3,$4,$5,'draft',$6) RETURNING *`, [actor.organizationId, input.programId, input.title ?? 'Risk assessment (RACT)', input.framework ?? 'ich_e6r3', overall, actor.userId]);
  const assessment = rows[0];
  if (!assessment) throw new Error('Assessment seed identity missing');
  for (const f of DEFAULT_CTQ_FACTORS) {
    await client.query(`INSERT INTO rbm_risk_items (organization_id, assessment_id, program_id, category, ctq_factor, risk_description, likelihood, impact, risk_score, is_critical, mitigation, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'open')`, [actor.organizationId, assessment.id, input.programId, f.category, f.ctqFactor, f.riskDescription, f.likelihood, f.impact, scoreRisk(f.likelihood, f.impact).score, f.isCritical, f.mitigation]);
  }
  const items = await client.query('SELECT * FROM rbm_risk_items WHERE organization_id=$1 AND assessment_id=$2 ORDER BY risk_score DESC,id', [actor.organizationId, assessment.id]);
  return { ...assessment, items: items.rows };
}
/** A caller-owned transaction is never opened, committed or rolled back here. */
export async function seedRbmAssessment(client: RequestSqlClient, actor: RbmActor, input: SeedInput, ownership: 'owned' | 'caller-owned') {
  if (ownership === 'caller-owned') return writeSeed(client, actor, input);
  if (ownership !== 'owned') throw new Error('Explicit seed transaction ownership is required');
  await client.query('BEGIN');
  try {
    const result = await writeSeed(client, actor, input);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch (rollbackError) { await client.discard?.(rollbackError instanceof Error ? rollbackError : new Error('Seed rollback could not be verified')); }
    throw error;
  }
}
/** Explicit lease boundary for the existing pool-backed AnA dispatch path. */
export async function seedRbmAssessmentFromPool(pool: RbmSeedPool, actor: RbmActor, input: SeedInput) {
  const lease = await pool.connect();
  let discard: Error | undefined;
  const client: RequestSqlClient = { query: (text, params) => lease.query(text, params), discard: async error => { discard = error; } };
  try { return await seedRbmAssessment(client, actor, input, 'owned'); }
  finally { lease.release(discard); }
}
