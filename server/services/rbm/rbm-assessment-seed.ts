/** One canonical seed body, and the one owned RBM write transaction; ownership is explicit, never inferred from connect(). */
import type { RequestSqlClient } from '../../db/requestDb';
import { requireRbmProgram, type RbmActor } from './rbm-access';
import { DEFAULT_CTQ_FACTORS, scoreRisk, overallRiskFromScores } from './rbm-engine';
interface SeedInput { programId: string; title?: string; framework?: string }
interface SeedLease extends RequestSqlClient { release(error?: Error): void }
export interface RbmSeedPool { connect(): Promise<SeedLease> }
async function writeSeed(client: RequestSqlClient, actor: RbmActor, input: SeedInput): Promise<Record<string, unknown> & { items: Array<Record<string, unknown>> }> {
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
/**
 * One RBM write in a transaction this module owns on `client`: BEGIN, the work,
 * COMMIT, and ROLLBACK on any failure. A rollback that cannot be verified is
 * handed to the client's owner (discard) so the connection is not reused. The
 * seed and AnA's add_ctq_factor both write through it.
 */
export async function inOwnedRbmTransaction<T>(client: RequestSqlClient, work: (tx: RequestSqlClient) => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch (rollbackError) { await client.discard?.(rollbackError instanceof Error ? rollbackError : new Error('RBM write rollback could not be verified')); }
    throw error;
  }
}
/** The same on one explicitly owned lease of the pool, released afterwards. */
export async function inOwnedRbmTransactionFromPool<T>(pool: RbmSeedPool, work: (tx: RequestSqlClient) => Promise<T>): Promise<T> {
  const lease = await pool.connect();
  let discard: Error | undefined;
  const client: RequestSqlClient = { query: (text, params) => lease.query(text, params), discard: async error => { discard = error; } };
  try { return await inOwnedRbmTransaction(client, work); }
  finally { lease.release(discard); }
}
/** A caller-owned transaction is never opened, committed or rolled back here. */
export async function seedRbmAssessment(client: RequestSqlClient, actor: RbmActor, input: SeedInput, ownership: 'owned' | 'caller-owned') {
  if (ownership === 'caller-owned') return writeSeed(client, actor, input);
  if (ownership !== 'owned') throw new Error('Explicit seed transaction ownership is required');
  return inOwnedRbmTransaction(client, tx => writeSeed(tx, actor, input));
}
/** Explicit lease boundary for the existing pool-backed AnA dispatch path. */
export async function seedRbmAssessmentFromPool(pool: RbmSeedPool, actor: RbmActor, input: SeedInput) {
  return inOwnedRbmTransactionFromPool(pool, tx => writeSeed(tx, actor, input));
}
