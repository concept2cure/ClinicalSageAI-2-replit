/** Recorded drafting context reuses current project admission; it is not scientific evidence. */
import { createHash } from 'node:crypto';
import type { RequestSqlClient } from '../../db/requestDb';
import { admitAnaProjectScope, AnaProjectScopeError, type AnaProjectScopeInput } from './project-scope-admission';
import { modalityOf } from '../../../shared/regulatory/product-modality';

export interface RecordedDraftProduct {
  state: 'recorded' | 'unassessed';
  projectId: number | null;
  programId: string | null;
  therapeuticArea: string | null;
  phase: string | null;
  population: string | null;
  productType: string | null;
  modality: ReturnType<typeof modalityOf>;
  indication: string | null;
  charterState: 'recorded' | 'missing' | 'ambiguous';
  charter: { id: number; version: number | null; updatedAt: string | null; approvalStatus: string | null } | null;
  snapshot: string | null;
}
export interface RecordedDraftProductRead {
  context: Readonly<RecordedDraftProduct>;
  assertCurrent(): Promise<void>;
}

const text = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.trim() : null;
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const stamp = (v: unknown): string | null => v instanceof Date ? v.toISOString() : text(v);
const version = (v: unknown): number | null => typeof v === 'number' && Number.isSafeInteger(v) ? v : null;
const empty = (): RecordedDraftProduct => ({ state: 'unassessed', projectId: null, programId: null,
  therapeuticArea: null, phase: null, population: null, productType: null, modality: null, indication: null,
  charterState: 'missing', charter: null, snapshot: null });

function unavailable(error: unknown): never {
  if (error instanceof AnaProjectScopeError) throw error;
  throw new AnaProjectScopeError(503, 'DRAFT_PRODUCT_CONTEXT_UNAVAILABLE', 'Recorded product context could not be read. Nothing was drafted.');
}

async function readFacts(q: RequestSqlClient, scope: { projectId: number | null; programId: string | null }, orgId: number): Promise<RecordedDraftProduct> {
  const program = scope.programId ? (await q.query(`SELECT product_type, indication, program_type, primary_agency, metadata FROM regulatory_programs
    WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL`, [scope.programId, orgId])).rows[0] : null;
  if (scope.programId && !program) throw new AnaProjectScopeError(409, 'DRAFT_PRODUCT_CONTEXT_CHANGED', 'The recorded project changed. Reload before drafting.');
  const charters = (await q.query(`SELECT id, version, updated_at, approval_status, therapeutic_area,
    development_stage, target_population FROM project_charters
    WHERE project_id=$1 AND organization_id=$2 ORDER BY id LIMIT 2`, [scope.projectId, orgId])).rows;
  const charter = charters.length === 1 ? charters[0] : null;
  const productType = text(program?.product_type);
  const facts: RecordedDraftProduct = { state: 'recorded', projectId: scope.projectId, programId: scope.programId,
    therapeuticArea: text(charter?.therapeutic_area), phase: text(charter?.development_stage),
    population: text(charter?.target_population), productType, modality: modalityOf(productType),
    indication: text(program?.indication), charterState: charter ? 'recorded' : charters.length ? 'ambiguous' : 'missing',
    charter: charter ? { id: Number(charter.id), version: version(charter.version),
      updatedAt: stamp(charter.updated_at), approvalStatus: text(charter.approval_status) } : null, snapshot: null };
  facts.snapshot = hash({ facts, filing: program ? { programType: program.program_type,
    agency: program.primary_agency, metadata: program.metadata } : null });
  return facts;
}

/** No identity or source facts come from caller context labels. Missing/ambiguous fields remain null. */
export async function loadRecordedDraftProductContext(q: RequestSqlClient, input: AnaProjectScopeInput): Promise<RecordedDraftProductRead> {
  if ((input.projectRef == null || input.projectRef === '') && (input.projectId == null || input.projectId === '')) {
    return { context: Object.freeze(empty()), assertCurrent: async () => undefined };
  }
  const pinned = Object.freeze({ ...input });
  try {
    const scope = await admitAnaProjectScope(q, pinned);
    const facts = await readFacts(q, scope, Number(pinned.organizationId));
    if (facts.charter) Object.freeze(facts.charter);
    const context = Object.freeze(facts);
    return { context, assertCurrent: async () => {
      try {
        const current = await admitAnaProjectScope(q, pinned);
        if (current.projectId !== scope.projectId || current.programId !== scope.programId ||
          (await readFacts(q, current, Number(pinned.organizationId))).snapshot !== context.snapshot) {
          throw new AnaProjectScopeError(409, 'DRAFT_PRODUCT_CONTEXT_CHANGED', 'The recorded product context changed. Reload and draft again; the earlier result was not retained.');
        }
      } catch (error) { unavailable(error); }
    } };
  } catch (error) {
    unavailable(error);
  }
}
