/**
 * The DB-facing half of protocol → study design derivation.
 *
 * `design-derivation.ts` is the pure engine: it takes a protocol's structured
 * registers and the design the protocol is bound to, and returns a reviewed
 * proposal. This module does the two things the engine deliberately cannot —
 * read the registers out of the database, and (once a human has accepted
 * specific paths) write the result through the platform's existing governed
 * writer.
 *
 * Nothing here computes or decides. The derivation is the engine's; the write
 * is `persistStudyDesignTx`, the same function `POST /api/study-design/persist`
 * and `applySampleSizeToDesign` use, on the caller's transaction so the design
 * change and its 21 CFR Part 11 audit row commit or roll back together. There
 * is no second writer and no second derivation.
 *
 * Every read is tenant-scoped on BOTH sides: another organisation's protocol
 * document and a design that is not this tenant's are each NOT_FOUND, and a
 * protocol with no design bound is refused rather than derived against an
 * invented empty design — "nothing is bound" and "the design is empty" are
 * different facts and the surface must not confuse them.
 *
 * @module server/services/protocol-development/design-derivation-service
 */

import {
  applyDerivation,
  deriveDesignFromProtocol,
  type DesignDerivation,
  type ProtocolDerivationInput,
} from './design-derivation';
import { persistStudyDesignTx, rowsToStudyDesign } from '../study-design/study-design-repository';
import type { StudyDesign } from '../study-design/study-design-types';

/** The minimal client surface this module needs from the caller's transaction. */
export interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

/** Same error contract the rest of protocol-development uses, so routes map it unchanged. */
export class DerivationError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'DerivationError';
  }
}

export interface DerivationContext {
  documentId: number;
  studyDesignId: string;
  /** The bound design, read back out of `cdisc_prm_studies.metadata`. */
  design: StudyDesign;
  /** The protocol as the engine consumes it. */
  input: ProtocolDerivationInput;
}

/**
 * Load everything the derivation needs. Throws rather than returning a partial
 * context: a caller that gets a `DerivationContext` back has a real protocol,
 * a real bound design, and registers read under this tenant.
 */
export async function loadDerivationContext(
  client: Queryable,
  orgId: number,
  docId: number,
): Promise<DerivationContext> {
  const doc = await client.query(
    `SELECT id, title, phase, design_type, therapeutic_area, study_design_id
       FROM protocol_documents
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [docId, orgId],
  );
  if (doc.rows.length === 0) {
    throw new DerivationError('NOT_FOUND', 'Protocol document not found for this organization.');
  }
  const row = doc.rows[0];
  const studyDesignId = String(row.study_design_id ?? '').trim();
  if (!studyDesignId) {
    throw new DerivationError(
      'INVALID_STATE',
      'No study design is bound to this protocol, so there is nothing to derive into. Bind a design first.',
    );
  }

  const design = await loadBoundDesign(client, orgId, studyDesignId);
  const input = await loadProtocolRegisters(client, orgId, docId, row);
  return { documentId: docId, studyDesignId, design, input };
}

/**
 * The design object itself, not its column projections. A row whose metadata
 * does not round-trip is reported as unresolved rather than substituted with a
 * blank design — deriving a protocol into an empty object would read every
 * design field as absent and propose overwriting all of them.
 */
async function loadBoundDesign(client: Queryable, orgId: number, studyDesignId: string): Promise<StudyDesign> {
  const res = await client.query(
    `SELECT study_id, metadata FROM cdisc_prm_studies
      WHERE study_id = $1 AND tenant_id = $2 LIMIT 1`,
    [studyDesignId, orgId],
  );
  if (res.rows.length === 0) {
    throw new DerivationError('NOT_FOUND', 'The bound study design was not found for this organization.');
  }
  const design = rowsToStudyDesign(res.rows[0]);
  if (!design) {
    throw new DerivationError(
      'INVALID_STATE',
      'The bound study design row carries no design object, so it cannot be derived into.',
    );
  }
  // The id is what persistStudyDesignTx upserts on. A design read back without
  // it would be written as a NEW study rather than an update to this one.
  return { ...design, id: design.id ?? studyDesignId };
}

/** The three structured registers plus the document's own columns. */
async function loadProtocolRegisters(
  client: Queryable,
  orgId: number,
  docId: number,
  row: Record<string, unknown>,
): Promise<ProtocolDerivationInput> {
  const [objectives, eligibility, visits] = await Promise.all([
    client.query(
      `SELECT id, objective_type, objective, endpoint, timepoint, order_index
         FROM protocol_objectives
        WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL
        ORDER BY order_index, id`,
      [docId, orgId],
    ),
    client.query(
      `SELECT id, kind, criterion, order_index
         FROM protocol_eligibility_criteria
        WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL
        ORDER BY order_index, id`,
      [docId, orgId],
    ),
    client.query(
      `SELECT id, visit_name, timepoint, procedures, order_index
         FROM protocol_schedule_visits
        WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL
        ORDER BY order_index, id`,
      [docId, orgId],
    ),
  ]);

  return {
    documentId: docId,
    title: String(row.title ?? ''),
    phase: row.phase == null ? null : String(row.phase),
    designType: row.design_type == null ? null : String(row.design_type),
    therapeuticArea: row.therapeutic_area == null ? null : String(row.therapeutic_area),
    objectives: objectives.rows.map((o) => ({
      id: Number(o.id),
      objectiveType: String(o.objective_type ?? ''),
      objective: String(o.objective ?? ''),
      endpoint: o.endpoint == null ? null : String(o.endpoint),
      timepoint: o.timepoint == null ? null : String(o.timepoint),
      orderIndex: Number(o.order_index ?? 0),
    })),
    eligibility: eligibility.rows.map((e) => ({
      id: Number(e.id),
      kind: String(e.kind ?? ''),
      criterion: String(e.criterion ?? ''),
      orderIndex: Number(e.order_index ?? 0),
    })),
    visits: visits.rows.map((v) => ({
      id: Number(v.id),
      visitName: String(v.visit_name ?? ''),
      timepoint: v.timepoint == null ? null : String(v.timepoint),
      procedures: Array.isArray(v.procedures) ? v.procedures.map(String) : null,
      orderIndex: Number(v.order_index ?? 0),
    })),
  };
}

export interface DerivationView extends DerivationContext {
  derivation: DesignDerivation;
}

/** Read-only: what the protocol evidences about its design. Writes nothing. */
export async function readDerivation(
  client: Queryable,
  orgId: number,
  docId: number,
): Promise<DerivationView> {
  const ctx = await loadDerivationContext(client, orgId, docId);
  return { ...ctx, derivation: deriveDesignFromProtocol(ctx.input, ctx.design) };
}

export interface ApplyDerivationResult {
  studyDesignId: string;
  applied: string[];
  rejected: Array<{ path: string; reason: string }>;
  /** The derivation recomputed against the design as it now stands. */
  derivation: DesignDerivation;
}

/**
 * Apply the paths a human accepted, on the caller's transaction.
 *
 * The derivation is recomputed here from the live rows rather than trusted from
 * the client: a request that names a path is saying "I accept what the protocol
 * evidences at this path", not supplying the value. A path the current
 * derivation does not offer — because someone else edited the protocol since
 * the diff was displayed — is rejected with its reason and nothing is written
 * for it.
 *
 * An empty `applied` set is NOT an error. It means the accepted paths were all
 * refused, and the caller decides whether that is worth an audit row.
 */
export async function applyDerivationTx(
  client: Queryable,
  orgId: number,
  docId: number,
  acceptedPaths: readonly string[],
  actorUserId: number,
): Promise<ApplyDerivationResult> {
  if (acceptedPaths.length === 0) {
    throw new DerivationError('BAD_INPUT', 'Name at least one path to accept.');
  }
  const ctx = await loadDerivationContext(client, orgId, docId);
  const derivation = deriveDesignFromProtocol(ctx.input, ctx.design);
  const { next, applied, rejected } = applyDerivation(ctx.design, derivation, acceptedPaths);

  if (applied.length > 0) {
    await persistStudyDesignTx(client, next, { tenantId: orgId, userId: actorUserId });
  }

  return {
    studyDesignId: ctx.studyDesignId,
    applied,
    rejected,
    derivation: applied.length > 0 ? deriveDesignFromProtocol(ctx.input, next) : derivation,
  };
}
