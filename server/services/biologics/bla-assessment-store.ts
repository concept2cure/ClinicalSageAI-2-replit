/** The canonical BLA assessment INSERT and governed save on the request transaction. */
import { recordGovernedAction } from '../../routes/c2c/actions';
import { requireGovernedProgramWriteTx } from '../c2c/governed-program-write';
import { setTenantContextTx } from '../tenant/governed-tenant-context';
import { requireGovernedReason } from '../../routes/governed-reason';

export type BlaAssessmentKind = 'analytical_similarity' | 'comparability' | 'immunogenicity' | 'filing_risk';
interface Client { query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }
export class BlaAssessmentRefusal extends Error {
  constructor(readonly status: 400 | 401, readonly code: string, message: string) { super(message); }
}
interface SaveInput {
  organizationId: number; userId: number | null; programId: unknown; reason: unknown; title: unknown;
  kind: BlaAssessmentKind; modality?: string | null; referenceProduct?: string | null; targetAgency?: string | null;
  verdict: string | null; inputs: unknown; result: unknown;
}

function validatedSave(input: SaveInput) {
  if (!input.userId || !Number.isSafeInteger(input.userId) || input.userId <= 0) throw new BlaAssessmentRefusal(401, 'AUTH_REQUIRED', 'An identified actor is required to save an assessment.');
  if (typeof input.programId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.programId)) throw new BlaAssessmentRefusal(400, 'PROGRAM_REQUIRED', 'Open a program before saving a biologics assessment.');
  const reason = requireGovernedReason(input.reason);
  if (!reason.ok) throw new BlaAssessmentRefusal(400, 'REASON_REQUIRED', reason.error);
  if (typeof input.title !== 'string' || !input.title.trim()) throw new BlaAssessmentRefusal(400, 'TITLE_REQUIRED', 'Name the saved assessment.');
  return { userId: input.userId, programId: input.programId.toLowerCase(), title: input.title.trim(), reason: reason.reason };
}
export async function saveBlaAssessment(client: Client, input: SaveInput): Promise<Record<string, unknown>> {
  const facts = validatedSave(input);
  await client.query('BEGIN');
  try {
    await setTenantContextTx(client, input.organizationId);
    await requireGovernedProgramWriteTx(client, input.organizationId, facts.userId, facts.programId);
    const { rows } = await client.query(`INSERT INTO c2c_bla_assessments
      (org_id, program_id, kind, title, modality, reference_product, target_agency, status, verdict, input, result, created_by, tenant_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9::jsonb,$10::jsonb,$11,$12)
      RETURNING id, program_id, kind, title, status, verdict, created_at`,
      [input.organizationId, facts.programId, input.kind, facts.title, input.modality ?? null,
        input.referenceProduct ?? null, input.targetAgency ?? null, input.verdict, JSON.stringify(input.inputs ?? {}),
        JSON.stringify(input.result ?? {}), facts.userId, String(input.organizationId)]);
    const row = rows[0];
    if (!row || typeof row.id !== 'string') throw new Error('Saved assessment identity unavailable');
    const audit = await recordGovernedAction(client, { orgId: input.organizationId, userId: facts.userId,
      command: 'create', target: `bla_assessment:${row.id}`, reason: facts.reason,
      payload: { programId: facts.programId, kind: input.kind, verdict: input.verdict }, domain: 'biopharma', surface: 'api' });
    await client.query('COMMIT');
    return { ...row, governance: audit };
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
}
