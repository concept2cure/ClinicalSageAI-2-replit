/**
 * The labeling approval controls, for server/routes/mdx-labeling.ts (D5,
 * 2026-10-29; docs/evidence/D5-LABELING-TRANSLATION-SIGNATURE/2026-10-29/).
 *
 * The QMS controlled document is the lifecycle copied (services/qms/), as
 * CLAUDE.md Rule 3 asks:
 *   - A labeling document's approval, its move to effective and its
 *     supersession, and a translation's approval, are electronic signatures
 *     through signGovernedAct (./governed-signed-act.ts).
 *   - Each step is admitted only from the step before it, as a QMS document
 *     is approved only in review.
 *   - Separation of duties from the record's creator, recorded as the QMS
 *     approval records it (`twoPersonRule`).
 *   - Moving a record that carries an approval back withdraws it, as a QMS
 *     controlled revision does: a reason, the stamp cleared, a ledger row.
 *   - The refusals of an edit to a record that carries an approval.
 *
 * Its own file because the same code inline put mdx-labeling.ts over
 * max-lines. The edit statements stay in the route: their SET lists are
 * built there.
 *
 * @module server/routes/mdx-labeling-approvals
 */
import type { Request, Response, RequestHandler } from 'express';
import { createScopedLogger } from '../utils/logger';
import { ok, clientError, notFoundInTenant, serverError } from '../lib/api-response';
import { pool } from '../db';
import type { RequestDbClient } from '../middleware/lazyRequestDbClient';
import { signedActAttempts, signGovernedAct } from './governed-signed-act';
import { recordGovernedAction } from './c2c/actions';
import { requireGovernedReason } from './governed-reason';
import { DECISION_ACT_MEANINGS, type GovernedSignMeaning } from '../services/part11/signature-meanings';
import { BINDING_BASIS } from '../services/part11/signature-persistence';
import { assertSignerIsNotAuthor, separationOfDutiesRefusal } from '../services/governance/separation-of-duties';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';
import { resolveUserId } from '../types/auth-request';

const log = createScopedLogger('mdx-labeling');

/** The document moves that are electronic signatures: to approved, to effective, and to superseded. */
export const DOC_SIGNED_STATUS: ReadonlySet<string> = new Set(['approved', 'effective', 'superseded']);

/* ─── Document approval, effectiveness and supersession: electronic signatures
   A labeling document moved to approved or effective releases the label, and
   until 2026-10-29 either move was a plain PATCH, or a create, with no
   signature and no approver column. Each now runs signGovernedAct, as the
   translation approval below does, and the row names its approver
   (approved_by, approved_at; 20261029b). The QMS controlled document is the
   lifecycle copied:
     - approval only from review, as a QMS document is approved only in review
       (APPROVABLE_STATES, services/qms/document-approval-signature.ts). It
       stamps the approver;
     - effective only from approved. It stamps effective_date and keeps the
       approval the document carries;
     - superseded is the QMS retirement (retireQmsDocumentSigned): signed, with
       the meaning QMS signs it with, from any status but superseded, with no
       two-person rule, and the approval kept;
     - the creator may not approve it or make it effective (separation of
       duties, from created_by). A document that records no creator is signed,
       with twoPersonRule 'not_applicable_no_author_recorded' on the ledger and
       the signature row, the QMS approval's field and words;
     - a document that carries an approval is not edited. Moving it back to
       draft or review withdraws the approval, as a QMS controlled revision
       does (reviseControlledQmsDocument): a reason, the stamp cleared, and a
       `transition` ledger row (withdrawApproval, below). */

/** The per-signer signing-attempt limit, only for the requests that sign. */
export const signingLimit = (signs: ReadonlySet<string>): RequestHandler => (req, res, next) =>
  signs.has(req.body?.status) ? signedActAttempts(req, res, next) : next();

/** The signed acts' own refusals, by code, for signGovernedAct. The last three are separationOfDutiesRefusal's. */
const SIGNED_ACT_CODE_STATUS = {
  LABELING_DOCUMENT_NOT_FOUND: 404,
  LABELING_DOCUMENT_NOT_IN_REVIEW: 409,
  LABELING_DOCUMENT_NOT_APPROVED: 409,
  LABELING_DOCUMENT_ALREADY_SUPERSEDED: 409,
  TRANSLATION_NOT_FOUND: 404,
  TRANSLATION_ALREADY_APPROVED: 409,
  TRANSLATION_NOT_IN_REVIEW: 409,
  SEPARATION_OF_DUTIES: 403,
  SEPARATION_OF_DUTIES_AUTHOR_UNRESOLVED: 409,
  SEPARATION_OF_DUTIES_UNVERIFIED: 503,
} as const;
type SignedActCode = keyof typeof SIGNED_ACT_CODE_STATUS;
const NOTHING_SIGNED = 'Nothing was signed.';

/**
 * The meaning a supersession carries: the one a QMS retirement is signed with
 * (QMS_DOCUMENT_APPROVAL_MEANING, services/qms/document-approval-signature.ts,
 * and the retire body in routes/mdx-qms.ts).
 */
const SUPERSEDE_ACT_MEANINGS = ['APPROVED'] as const satisfies readonly GovernedSignMeaning[];

function signedActRefused(code: SignedActCode, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** The fields a signed move would change besides its status. A signature covers the record as it stands. */
export function editsBesides(patch: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(patch).filter((k) => k !== 'status' && !allowed.includes(k) && patch[k] !== undefined);
}

/** The QMS approval's record of separation of duties (`twoPersonRule`, document-approval-signature.ts), in its words. */
type TwoPersonRule = 'enforced' | 'not_applicable_no_author_recorded';

/**
 * Separation of duties, on the signing transaction and before the stamp, as
 * the QMS approval applies it. A recorded creator may not sign
 * (resolveTargetAuthors), refused in the one mapping's words
 * (separationOfDutiesRefusal), and nothing is signed. A record that names no
 * creator (added before 20261029b) is signed, and the outcome says so.
 */
async function twoPersonRule(
  client: RequestDbClient, target: string, ids: { orgId: number; userId: number; createdBy: number | null }, meaning: unknown,
): Promise<TwoPersonRule> {
  if (ids.createdBy === null) return 'not_applicable_no_author_recorded';
  try {
    await assertSignerIsNotAuthor(target, ids.orgId, ids.userId, { command: 'sign', meaning, client });
  } catch (err) {
    const refusal = separationOfDutiesRefusal(err, 'mdx-labeling');
    if (!refusal) throw err;
    const { error: code, detail } = refusal.body;
    throw signedActRefused(code as SignedActCode, detail.includes(NOTHING_SIGNED) ? detail : `${detail} ${NOTHING_SIGNED}`);
  }
  return 'enforced';
}

type DocAct = 'approved' | 'effective' | 'superseded';

/** Why document act `to` may not run from `status`, in words, or null when it may: the QMS order. */
function documentStateRefusal(to: DocAct, status: string): Error | null {
  if (to === 'approved' && status !== 'review') {
    return signedActRefused('LABELING_DOCUMENT_NOT_IN_REVIEW', status === 'draft'
      ? `This labeling document is a draft. Send it for review first: only a document in review can be approved. ${NOTHING_SIGNED}`
      : `This labeling document is ${status}; only a document in review can be approved. ${NOTHING_SIGNED}`);
  }
  if (to === 'effective' && status !== 'approved') {
    return signedActRefused('LABELING_DOCUMENT_NOT_APPROVED',
      `This labeling document is ${status}; only an approved document can be made effective. ${NOTHING_SIGNED}`);
  }
  if (to === 'superseded' && status === 'superseded') {
    return signedActRefused('LABELING_DOCUMENT_ALREADY_SUPERSEDED', `This labeling document is already superseded. ${NOTHING_SIGNED}`);
  }
  return null;
}

type DocSigningRow = {
  status: string; device_name: string; doc_kind: string; version: string; language: string;
  effective_on: string; created_by: number | null;
};

/** The signed move of document `id` to approved, effective or superseded. Answers the request itself. */
export async function signDocumentStatus(req: Request, res: Response, id: number, patch: Record<string, unknown>): Promise<void> {
  const to = patch.status as DocAct;
  // A move to effective may name the day it takes effect, as a QMS approval does.
  const edits = editsBesides(patch, to === 'effective' ? ['effectiveDate'] : []);
  if (edits.length > 0) {
    res.status(400).json({ error: {
      code: 'LABELING_DOCUMENT_SIGNING_EDITS_FIELDS',
      message: `A signature covers the document as it stands. Save the change to ${edits.join(', ')} first, then sign. ${NOTHING_SIGNED}`,
    } });
    return;
  }
  const target = `labeling-document:${id}`;
  /* The approval stamps its approver. The move to effective keeps the approval
     the document carries; one approved before 20261029b names no approver, and
     this signer is then recorded. A supersession stamps nothing: QMS keeps the
     approval a retired document was released under. */
  const stamp = (client: RequestDbClient, orgId: number, userId: number, current: DocSigningRow) => {
    if (to === 'approved') {
      return client.query(
        `UPDATE labeling_documents
            SET status = 'approved', approved_by = $3, approved_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND organization_id = $2
          RETURNING *`,
        [id, orgId, userId],
      );
    }
    if (to === 'effective') {
      return client.query(
        `UPDATE labeling_documents
            SET status = 'effective', approved_by = COALESCE(approved_by, $3), approved_at = COALESCE(approved_at, NOW()),
                effective_date = $4::date, updated_at = NOW()
          WHERE id = $1 AND organization_id = $2
          RETURNING *`,
        [id, orgId, userId, current.effective_on],
      );
    }
    return client.query(
      `UPDATE labeling_documents SET status = 'superseded', updated_at = NOW()
        WHERE id = $1 AND organization_id = $2
        RETURNING *`,
      [id, orgId],
    );
  };
  await signGovernedAct(req, res, {
    domain: 'labeling',
    target,
    meanings: to === 'superseded' ? SUPERSEDE_ACT_MEANINGS : DECISION_ACT_MEANINGS,
    codeStatus: SIGNED_ACT_CODE_STATUS,
    // The label as it stands is what is signed (21 CFR 11.70; governed-target-binders.ts).
    contentBasis: BINDING_BASIS.LABELING_DOCUMENT_CONTENT,
    run: async (client, orgId, userId) => {
      // Under the ceremony's lock on this target (DP-65); the day it takes effect is fixed here.
      const { rows } = await client.query<DocSigningRow>(
        `SELECT status, device_name, doc_kind, version, language, created_by,
                COALESCE($3::date, effective_date, CURRENT_DATE)::text AS effective_on
           FROM labeling_documents
          WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
          FOR UPDATE`,
        [id, orgId, patch.effectiveDate ?? null],
      );
      const current = rows[0];
      if (!current) throw signedActRefused('LABELING_DOCUMENT_NOT_FOUND', `Labeling document not found. ${NOTHING_SIGNED}`);
      const refused = documentStateRefusal(to, current.status);
      if (refused) throw refused;
      // A supersession is a retirement, and QMS retires with no two-person rule.
      const rule = to === 'superseded'
        ? null
        : await twoPersonRule(client, target, { orgId, userId, createdBy: current.created_by }, req.body?.meaning);
      const updated = await stamp(client, orgId, userId, current);
      return {
        target,
        // What was signed: it goes on the ledger and the signature manifest.
        payload: {
          labelingDocumentId: id, deviceName: current.device_name, docKind: current.doc_kind,
          version: current.version, language: current.language, previousStatus: current.status, status: to,
          ...(to === 'effective' ? { effectiveDate: current.effective_on } : {}),
          ...(rule ? { twoPersonRule: rule, originalAuthorId: current.created_by } : {}),
        },
        body: { data: updated.rows[0] },
      };
    },
  });
}

/* ─── Withdrawing an approval: the QMS controlled revision ──────────────────
   A record that carries an approval goes back only as a QMS document does
   (reviseControlledQmsDocument): with a reason of at least eight characters,
   the stamp cleared on one transaction with a `transition` ledger row
   (recordGovernedAction). It is not a signature: QMS does not sign a
   revision. */

type Withdrawal = {
  noun: string;
  notFound: string;
  target: (id: number) => string;
  carriesApproval: (status: string) => boolean;
  /** $1 id, $2 organization: the row's status and approver, locked. */
  lockSql: string;
  /** $1 the new status, $2 id, $3 organization: the move, with the approval cleared. */
  clearSql: string;
};

const DOCUMENT_WITHDRAWAL: Withdrawal = {
  noun: 'labeling document',
  notFound: 'Labeling document',
  target: (id) => `labeling-document:${id}`,
  carriesApproval: (status) => DOC_SIGNED_STATUS.has(status),
  lockSql: `SELECT status, approved_by FROM labeling_documents
             WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
             FOR UPDATE`,
  // The effective date goes when the document was released (effective or superseded), as a revision clears it.
  clearSql: `UPDATE labeling_documents
                SET status = $1, approved_by = NULL, approved_at = NULL,
                    effective_date = CASE WHEN status IN ('effective', 'superseded') THEN NULL ELSE effective_date END,
                    updated_at = NOW()
              WHERE id = $2 AND organization_id = $3
              RETURNING *`,
};

const TRANSLATION_WITHDRAWAL: Withdrawal = {
  noun: 'translation',
  notFound: 'Translation',
  target: (id) => `labeling-translation:${id}`,
  carriesApproval: (status) => status === 'approved',
  lockSql: `SELECT status, approved_by FROM labeling_translations
             WHERE id = $1 AND organization_id = $2
             FOR UPDATE`,
  clearSql: `UPDATE labeling_translations
                SET status = $1, approved_by = NULL, approved_at = NULL, updated_at = NOW()
              WHERE id = $2 AND organization_id = $3
              RETURNING *`,
};

/** Move record `move.id` out of a status that carries an approval. Answers the request itself. */
async function withdrawApproval(req: Request, res: Response, w: Withdrawal, move: { id: number; orgId: number; status: string }) {
  const userId = resolveUserId(req);
  if (userId === null) return clientError(res, 401, 'User context required');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, move.orgId);
    const { rows } = await client.query<{ status: string; approved_by: number | null }>(w.lockSql, [move.id, move.orgId]);
    const current = rows[0];
    if (!current || !w.carriesApproval(current.status)) {
      await client.query('ROLLBACK');
      return current
        ? clientError(res, 409, `This ${w.noun} changed while it was being moved. Reload it and try again. Nothing was saved.`, { code: 'LABELING_STATUS_CHANGED' })
        : notFoundInTenant(res, w.notFound);
    }
    const reason = requireGovernedReason(req.body?.reason);
    if (!reason.ok) {
      await client.query('ROLLBACK');
      return clientError(
        res,
        400,
        `Moving this ${w.noun} out of ${current.status} withdraws its approval, so it needs a reason. ${reason.error} Nothing was saved.`,
        { code: 'APPROVAL_WITHDRAWAL_REASON_REQUIRED' },
      );
    }
    const updated = await client.query(w.clearSql, [move.status, move.id, move.orgId]);
    const gov = await recordGovernedAction(client, {
      orgId: move.orgId, userId, command: 'transition', target: w.target(move.id), reason: reason.reason,
      payload: { kind: 'withdraw-approval', from: current.status, to: move.status, withdrawnApprovalBy: current.approved_by },
      domain: 'labeling',
    });
    await client.query('COMMIT');
    return ok(res, updated.rows[0], { auditTrail: { persisted: true, chained: true }, actionId: gov.actionId });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return serverError(res, log, 'withdraw-approval', err);
  } finally {
    client.release();
  }
}

/**
 * A plain status move of a document, to draft or review. One that withdraws no
 * approval is one statement, as before; one out of approved, effective or
 * superseded is a withdrawal.
 */
export async function moveDocumentStatus(req: Request, res: Response, id: number, orgId: number, status: string) {
  try {
    const { rows } = await pool.query(
      `UPDATE labeling_documents SET status = $1, updated_at = NOW()
        WHERE id = $2 AND organization_id = $3 AND deleted_at IS NULL
          AND status NOT IN ('approved', 'effective', 'superseded')
        RETURNING *`,
      [status, id, orgId],
    );
    if (rows.length > 0) return ok(res, rows[0]);
    return await withdrawApproval(req, res, DOCUMENT_WITHDRAWAL, { id, orgId, status });
  } catch (err) { return serverError(res, log, 'patch-status', err); }
}

/** After a guarded edit of document `id` changed nothing: 404 when the organization holds no live one, else 409. */
export async function refuseControlledDocumentEdit(res: Response, id: number, orgId: number) {
  const { rows } = await pool.query<{ status: string }>(
    `SELECT status FROM labeling_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId],
  );
  if (!rows[0]) return notFoundInTenant(res, 'Labeling document');
  return clientError(
    res,
    409,
    `This labeling document is ${rows[0].status}, so what was signed stays as it is. Move it back to draft or review, with a reason, to change it; that withdraws its approval. Nothing was saved.`,
    { code: 'LABELING_DOCUMENT_CONTROLLED' },
  );
}

/* ─── Translation approval: an electronic signature ─────────────────────────
   Approving a translation releases that language's label, and the row then
   names who approved it and when (approved_by, approved_at), so it is read as
   a signed record. Until 2026-10-29 the PATCH below stamped both from a
   session alone. Since 43fb57cc it needed an editor, and nothing more: no
   re-authentication (21 CFR 11.200), no declared meaning (11.50(a)(3)), no
   reason, and no electronic_signatures row (11.50, 11.70).

   A PATCH to `approved` now runs the platform's one route-level signing
   ceremony, signGovernedAct (./governed-signed-act.ts). The RIM label
   approval uses it the same way on its own route. In order:
     1. signing authority, before the password;
     2. the password, and the second factor when one is enrolled;
     3. on one transaction: only a translation in review (as a QMS document
        is approved only in review), separation of duties from its creator
        (created_by, 20261029b; recorded as twoPersonRule), then the stamp,
        the `sign` ledger pair and the signature row.
   An approved translation is not edited. Moving it out of approved withdraws
   the approval, with a reason and a ledger row, as the documents above do. */

type TranslationApprovalRow = {
  labeling_document_id: number; language: string; status: string;
  translation_method: string | null; back_translation_verified: boolean | null; created_by: number | null;
};

/** The signed approval of translation `transId`. Answers the request itself. */
export async function approveTranslationSigned(
  req: Request, res: Response, transId: number, patch: Record<string, unknown>,
): Promise<void> {
  /* The signature covers the translation as it stands. A field edited in the
     same request would be signed before anyone reviewed it. */
  const edits = editsBesides(patch, []);
  if (edits.length > 0) {
    res.status(400).json({ error: {
      code: 'TRANSLATION_APPROVAL_EDITS_FIELDS',
      message: `An approval signs the translation as it stands. Save the change to ${edits.join(', ')} first, then approve it. ${NOTHING_SIGNED}`,
    } });
    return;
  }
  const target = `labeling-translation:${transId}`;
  await signGovernedAct(req, res, {
    domain: 'labeling',
    target,
    meanings: DECISION_ACT_MEANINGS,
    codeStatus: SIGNED_ACT_CODE_STATUS,
    // The translation as it stands is what is signed (21 CFR 11.70).
    contentBasis: BINDING_BASIS.LABELING_TRANSLATION_CONTENT,
    run: async (client, orgId, userId) => {
      /* On the signing transaction, under the ceremony's lock on this target
         (DP-65): a second approval waits here and then reads what the first
         left. The document must be live and the organization's. */
      const { rows } = await client.query<TranslationApprovalRow>(
        `SELECT t.labeling_document_id, t.language, t.status,
                t.translation_method, t.back_translation_verified, t.created_by
           FROM labeling_translations t
           JOIN labeling_documents d
             ON d.id = t.labeling_document_id AND d.organization_id = t.organization_id
          WHERE t.id = $1 AND t.organization_id = $2 AND d.deleted_at IS NULL
          FOR UPDATE OF t`,
        [transId, orgId],
      );
      const current = rows[0];
      if (!current) throw signedActRefused('TRANSLATION_NOT_FOUND', `Translation not found. ${NOTHING_SIGNED}`);
      if (current.status === 'approved') {
        throw signedActRefused('TRANSLATION_ALREADY_APPROVED', `This translation is already approved. ${NOTHING_SIGNED}`);
      }
      if (current.status !== 'review') {
        throw signedActRefused('TRANSLATION_NOT_IN_REVIEW',
          `This translation is ${current.status.replace('_', ' ')}. Move it to review first: only a translation in review can be approved. ${NOTHING_SIGNED}`);
      }
      const rule = await twoPersonRule(client, target, { orgId, userId, createdBy: current.created_by }, req.body?.meaning);
      const updated = await client.query(
        `UPDATE labeling_translations
            SET status = 'approved', approved_by = $3, approved_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND organization_id = $2
          RETURNING *`,
        [transId, orgId, userId],
      );
      return {
        target,
        // What was approved: it goes on the ledger and the signature manifest.
        payload: {
          translationId: transId,
          labelingDocumentId: current.labeling_document_id,
          language: current.language,
          previousStatus: current.status,
          translationMethod: current.translation_method,
          backTranslationVerified: current.back_translation_verified === true,
          twoPersonRule: rule,
          originalAuthorId: current.created_by,
        },
        body: { data: updated.rows[0] },
      };
    },
  });
}

/**
 * A plain status move of a translation, short of approved. One that withdraws
 * no approval is one statement, and a stamp left on a row that is not
 * approved (before 2026-10-29) goes with it. One out of approved is a
 * withdrawal.
 */
export async function moveTranslationStatus(req: Request, res: Response, transId: number, orgId: number, status: string) {
  try {
    const { rows } = await pool.query(
      `UPDATE labeling_translations
          SET status = $1, approved_by = NULL, approved_at = NULL, updated_at = NOW()
        WHERE id = $2 AND organization_id = $3 AND status <> 'approved'
        RETURNING *`,
      [status, transId, orgId],
    );
    if (rows.length > 0) return ok(res, rows[0]);
    return await withdrawApproval(req, res, TRANSLATION_WITHDRAWAL, { id: transId, orgId, status });
  } catch (err) { return serverError(res, log, 'trans-patch-status', err); }
}

/** After a guarded edit of translation `transId` changed nothing: 409 when it is approved, else 404. */
export async function refuseApprovedTranslationEdit(res: Response, transId: number, orgId: number) {
  const { rows } = await pool.query<{ status: string }>(
    `SELECT status FROM labeling_translations WHERE id = $1 AND organization_id = $2`,
    [transId, orgId],
  );
  if (rows[0]?.status !== 'approved') return notFoundInTenant(res, 'Translation');
  return clientError(
    res,
    409,
    'This translation is approved, and its approval is signed. Move it back to review, with a reason, to change it; that withdraws the approval. Nothing was saved.',
    { code: 'TRANSLATION_APPROVED_LOCKED' },
  );
}
