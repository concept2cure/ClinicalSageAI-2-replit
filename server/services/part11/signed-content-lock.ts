/**
 * Signed content is not edited in place (P-63, decided 2026-10-29; 21 CFR
 * 11.10(e) and 11.70; 21 CFR 820.40, ISO 13485 §4.2.4).
 *
 * An approved, effective or superseded labeling document, an approved
 * translation and a hazard whose residual risk is accepted carry a signature
 * whose content digest binds the record (governed-target-binders.ts). An edit
 * of what that digest covers would leave the signature attached to something
 * nobody signed. So every write path that could change it is refused with the
 * one answer below: the route PATCHes, the symbol and control child-row writes,
 * and AnA's add_labeling_symbol and add_risk_control.
 *
 * What is refused is read from the recipe's own attested-field list
 * (RecipeAttestation, beside each binder), never restated here, so the refusal
 * and the digest cannot drift. A field the signature does not bind (a project,
 * an assignee, a timestamp) stays editable. A change goes through a new version
 * or a reopening, signed in its turn: a labeling document is superseded by a
 * new version, or moved back with a reason, which withdraws its approval
 * (routes/mdx-labeling-approvals.ts); a hazard's acceptance is reopened by a
 * signed act (routes/mdx-risk-acceptance.ts).
 *
 * The "changed since it was signed" read (signed-content-state.ts) stays as
 * the detector for records edited before this rule.
 *
 * docs/evidence/D5-SIGNED-CONTENT-LOCKED/2026-10-29/README.md
 *
 * @module server/services/part11/signed-content-lock
 */
import {
  LABELING_DOCUMENT_ATTESTATION,
  LABELING_TRANSLATION_ATTESTATION,
  RISK_RESIDUAL_ACCEPTANCE_ATTESTATION,
  type RecipeAttestation,
} from './governed-target-binders';

/** The one code for an edit refused because a signature binds it. */
export const SIGNED_CONTENT_LOCKED = 'SIGNED_CONTENT_LOCKED' as const;

export type SignedRecordKind = 'labeling-document' | 'labeling-translation' | 'risk-item';

interface LockSpec {
  attestation: RecipeAttestation;
  /**
   * API fields a signed act on the record writes and records on its manifest,
   * which no plain edit may change either: a labeling document's effective
   * date is the move to effective's own (act.effectiveDate).
   */
  actFields: readonly string[];
  /** The record's state, and that its signature binds what follows. */
  binds: (status: string) => string;
  /** How the change is made instead. */
  remedy: string;
}

const LOCKS: Readonly<Record<SignedRecordKind, LockSpec>> = {
  'labeling-document': {
    attestation: LABELING_DOCUMENT_ATTESTATION,
    actFields: ['effectiveDate'],
    binds: (status) => `This labeling document is ${status}, and its signature binds`,
    remedy: 'To change it, issue a new version and supersede this one, or move it back to draft or review with a reason, which withdraws its approval; then sign it again.',
  },
  'labeling-translation': {
    attestation: LABELING_TRANSLATION_ATTESTATION,
    actFields: [],
    binds: () => 'This translation is approved, and its approval signature binds',
    remedy: 'To change it, move it back to review with a reason, which withdraws its approval; then approve it again.',
  },
  'risk-item': {
    attestation: RISK_RESIDUAL_ACCEPTANCE_ATTESTATION,
    actFields: [],
    binds: () => "This hazard's residual risk is accepted, and the acceptance signature binds",
    remedy: 'To change it, reopen the acceptance, which is a signed act (POST /api/mdx/risk-items/:id/reopen); then accept its residual risk again.',
  },
};

/** The child rows a record's signature binds, in words. */
const CHILD_WORDS: Readonly<Record<string, string>> = {
  labeling_symbols: 'its ISO 15223-1 symbols',
  risk_controls: 'its risk controls, with their evidence and status',
};

/** Every API field whose edit changes what `kind`'s signature binds: the recipe's fields, its named text, and the signed act's own. */
export function lockedFieldsOf(kind: SignedRecordKind): string[] {
  const { attestation, actFields } = LOCKS[kind];
  return [
    ...attestation.fields.map((f) => f.field),
    ...(attestation.textField ? [attestation.textField] : []),
    ...actFields,
  ];
}

/** The fields `patch` sets (a value other than undefined) that `kind`'s signature binds. */
export function lockedFieldsIn(kind: SignedRecordKind, patch: Record<string, unknown>): string[] {
  return lockedFieldsOf(kind).filter((f) => patch[f] !== undefined);
}

/** The child tables whose rows `kind`'s signature binds, from its recipe. */
export function lockedChildrenOf(kind: SignedRecordKind): string[] {
  return Object.keys(LOCKS[kind].attestation.children);
}

export interface SignedContentRefusal {
  status: 409;
  message: string;
  details: { code: typeof SIGNED_CONTENT_LOCKED; record: SignedRecordKind; recordStatus: string; fields: string[]; child: string | null };
}

/**
 * The refusal: `fields` the edit named, or the `child` table whose rows it
 * would add, change or remove. It names what the signature binds and how to
 * change it instead, and says that nothing was saved.
 */
export function signedContentRefusal(
  kind: SignedRecordKind, recordStatus: string, what: { fields: string[] } | { child: string },
): SignedContentRefusal {
  const spec = LOCKS[kind];
  const fields = 'fields' in what ? what.fields : [];
  const child = 'child' in what ? what.child : null;
  const bound = child ? (CHILD_WORDS[child] ?? child) : fields.join(', ');
  return {
    status: 409,
    message: `${spec.binds(recordStatus)} ${bound}. A signed record is not edited in place (21 CFR 11.10(e), 11.70). ${spec.remedy} Nothing was saved.`,
    details: { code: SIGNED_CONTENT_LOCKED, record: kind, recordStatus, fields, child },
  };
}

/* ─── The child rows a signature binds ─────────────────────────────────────
   A symbol on a labeling document and a control on a hazard are digested with
   their record, so adding, editing or removing one changes signed content. Each
   write below is one statement that takes a share lock on the record it hangs
   from and writes only while that record carries no signature: a signing act,
   which locks the record FOR UPDATE, waits for the write or the write waits for
   it and then sees the record as signed (READ COMMITTED re-checks the locked
   row). The routes and AnA's tools call these, so the rule has one copy. */

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }> };

export type ChildWrite =
  | { outcome: 'written'; row: Record<string, unknown> | null }
  | { outcome: 'not-found' }
  | { outcome: 'refused'; refusal: SignedContentRefusal }
  /** The record moved between the write and the check: reload and try again. */
  | { outcome: 'changed' };

/** A document's state, when it is the organization's and live. */
async function documentStatus(db: Queryable, orgId: number, docId: number): Promise<string | null> {
  const { rows } = await db.query(
    `SELECT status FROM labeling_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [docId, orgId],
  );
  return rows[0] ? String(rows[0].status) : null;
}

const DOCUMENT_SIGNED = new Set(['approved', 'effective', 'superseded']);

/** Why a write under document `docId` wrote nothing. */
async function documentChildRefusal(db: Queryable, orgId: number, docId: number | null): Promise<ChildWrite> {
  const status = docId === null ? null : await documentStatus(db, orgId, docId);
  if (status === null) return { outcome: 'not-found' };
  if (!DOCUMENT_SIGNED.has(status)) return { outcome: 'changed' };
  return { outcome: 'refused', refusal: signedContentRefusal('labeling-document', status, { child: 'labeling_symbols' }) };
}

export interface SymbolInput {
  symbolCode: string;
  symbolName: string;
  description?: string | null;
  requiredBy?: string[] | null;
}

/** Add an ISO 15223-1 symbol to document `docId`, unless the document carries a signature. */
export async function insertLabelingSymbol(db: Queryable, orgId: number, docId: number, s: SymbolInput): Promise<ChildWrite> {
  const { rows } = await db.query(
    `INSERT INTO labeling_symbols (
       labeling_document_id, organization_id, symbol_code, symbol_name,
       description, required_by
     )
     SELECT d.id, d.organization_id, $3::text, $4::text, $5::text, $6::text[]
       FROM labeling_documents d
      WHERE d.id = $1 AND d.organization_id = $2 AND d.deleted_at IS NULL
        AND d.status NOT IN ('approved', 'effective', 'superseded')
        FOR SHARE
     RETURNING *`,
    [docId, orgId, s.symbolCode, s.symbolName, s.description ?? null, s.requiredBy ?? null],
  );
  return rows.length > 0 ? { outcome: 'written', row: rows[0] } : documentChildRefusal(db, orgId, docId);
}

/** Remove symbol `symId`, unless its document carries a signature. */
export async function deleteLabelingSymbol(db: Queryable, orgId: number, symId: number): Promise<ChildWrite> {
  const deleted = await db.query(
    `DELETE FROM labeling_symbols s
      WHERE s.id = $1 AND s.organization_id = $2
        AND EXISTS (
          SELECT 1 FROM labeling_documents d
           WHERE d.id = s.labeling_document_id AND d.organization_id = s.organization_id
             AND d.status NOT IN ('approved', 'effective', 'superseded')
             FOR SHARE)`,
    [symId, orgId],
  );
  if ((deleted.rowCount ?? deleted.rows.length) > 0) return { outcome: 'written', row: null };
  const { rows } = await db.query(
    `SELECT labeling_document_id FROM labeling_symbols WHERE id = $1 AND organization_id = $2`,
    [symId, orgId],
  );
  return rows[0] ? documentChildRefusal(db, orgId, Number(rows[0].labeling_document_id)) : { outcome: 'not-found' };
}

/** A hazard's state, when it is the organization's and live: whether it carries its residual-risk acceptance. */
export async function hazardAcceptanceState(db: Queryable, orgId: number, itemId: number): Promise<{ status: string; accepted: boolean } | null> {
  const { rows } = await db.query(
    `SELECT status, acceptable FROM risk_items WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [itemId, orgId],
  );
  if (!rows[0]) return null;
  return { status: String(rows[0].status), accepted: rows[0].status === 'accepted' || rows[0].acceptable === true };
}

/** Why a write under hazard `itemId` wrote nothing. */
export async function hazardChildRefusal(db: Queryable, orgId: number, itemId: number | null): Promise<ChildWrite> {
  const state = itemId === null ? null : await hazardAcceptanceState(db, orgId, itemId);
  if (!state) return { outcome: 'not-found' };
  if (!state.accepted) return { outcome: 'changed' };
  return { outcome: 'refused', refusal: signedContentRefusal('risk-item', state.status, { child: 'risk_controls' }) };
}

export interface ControlInput {
  description: string;
  controlType: string;
  implementationEvidence?: string | null;
  verificationEvidence?: string | null;
  effectivenessEvidence?: string | null;
  introducesNewRisk?: boolean | null;
  newRiskItemId?: number | null;
  status?: string | null;
}

/**
 * Add a risk control to hazard `itemId`, unless its residual risk is accepted
 * (status `accepted`, or `acceptable` true: the Risk screen's own test).
 */
export async function insertRiskControl(db: Queryable, orgId: number, itemId: number, c: ControlInput): Promise<ChildWrite> {
  const { rows } = await db.query(
    `INSERT INTO risk_controls (
       risk_item_id, organization_id, description, control_type,
       implementation_evidence, verification_evidence, effectiveness_evidence,
       introduces_new_risk, new_risk_item_id, status
     )
     SELECT r.id, r.organization_id, $3::text, $4::text, $5::text, $6::text, $7::text,
            COALESCE($8::boolean, false), $9::int, COALESCE($10::text, 'proposed')
       FROM risk_items r
      WHERE r.id = $1 AND r.organization_id = $2 AND r.deleted_at IS NULL
        AND r.status IS DISTINCT FROM 'accepted' AND r.acceptable IS NOT TRUE
        FOR SHARE
     RETURNING *`,
    [
      itemId, orgId, c.description, c.controlType,
      c.implementationEvidence ?? null, c.verificationEvidence ?? null, c.effectivenessEvidence ?? null,
      c.introducesNewRisk ?? null, c.newRiskItemId ?? null, c.status ?? null,
    ],
  );
  return rows.length > 0 ? { outcome: 'written', row: rows[0] } : hazardChildRefusal(db, orgId, itemId);
}
