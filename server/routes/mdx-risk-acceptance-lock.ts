/**
 * An accepted hazard is not edited in place, and its acceptance is reopened by
 * a signed act (P-63, decided 2026-10-29; D5; 21 CFR 11.10(e), 11.70; ISO 14971
 * §7, §8). For server/routes/mdx-risk-management.ts.
 *
 * Accepting a hazard's residual risk signs its content (risk-residual-
 * acceptance/v1: the hazard analysis, both estimates, the strategy, the
 * benefit-risk rationale and every control with its evidence and status;
 * services/part11/governed-target-binders.ts). Until this change every one of
 * those could be edited afterwards, and read "changed since it was signed".
 * Now, while a hazard carries its acceptance (status `accepted`, or
 * `acceptable` true: the Risk screen's own test, isAccepted in RiskRegister):
 *   - a PATCH naming a field the acceptance binds is refused with the one
 *     refusal of signed content (services/part11/signed-content-lock.ts);
 *   - adding or editing a control is refused the same way;
 *   - taking the acceptance off by a plain PATCH (a status before acceptance,
 *     or `acceptable` false or null) is refused, and the reopen named;
 *   - what the acceptance does not bind stays editable: the assignee, the
 *     project, and closing the hazard, which keeps its acceptance.
 *
 * The reopen. No route reopened an acceptance (the search is in the evidence
 * README), so this is the narrowest one: POST /api/mdx/risk-items/:id/reopen,
 * through the platform's one route-level ceremony (signGovernedAct), as the
 * acceptance is. It returns the hazard to the status it had before it was
 * accepted, as the acceptance in force recorded it (`act.previousStatus` on its
 * manifest), or to the pre-acceptance status the request names, and clears
 * `acceptable`. Its signature binds the hazard as it stood (the same recipe),
 * so the record says what was reopened, by whom and why. The fields can then
 * change, and the hazard is accepted and signed again.
 *
 * docs/evidence/D5-SIGNED-CONTENT-LOCKED/2026-10-29/README.md
 *
 * @module server/routes/mdx-risk-acceptance-lock
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { clientError, notFoundInTenant } from '../lib/api-response';
import { pool } from '../db';
import type { RequestDbClient } from '../middleware/lazyRequestDbClient';
import { signGovernedAct } from './governed-signed-act';
import { DECISION_ACT_MEANINGS } from '../services/part11/signature-meanings';
import { BINDING_BASIS, isSignatureWithdrawn } from '../services/part11/signature-persistence';
import {
  hazardAcceptanceState, hazardChildRefusal, lockedFieldsIn, signedContentRefusal, type ChildWrite,
} from '../services/part11/signed-content-lock';

/** A guarded edit's condition: the hazard carries no acceptance. */
export const HAZARD_CARRIES_NO_ACCEPTANCE = "status IS DISTINCT FROM 'accepted' AND acceptable IS NOT TRUE";

/** What a plain PATCH of a hazard touches that its acceptance binds or holds. */
export interface HazardEditGuard {
  /** Fields the acceptance binds. */
  locked: string[];
  /** It would take the acceptance off: a status other than closing it, or `acceptable` false or null. */
  takesOff: boolean;
}

export function hazardEditGuard(patch: Record<string, unknown>): HazardEditGuard {
  return {
    locked: lockedFieldsIn('risk-item', patch),
    takesOff: (patch.status !== undefined && patch.status !== 'closed') || patch.acceptable !== undefined,
  };
}

/**
 * The WHERE of a hazard edit whose SET list fills $1..$(n-2), with the id at
 * $(n-1) and the organization at $n: guarded, so it writes only while the
 * hazard carries no acceptance, when it touches what the acceptance binds or
 * holds (hazardEditGuard).
 */
export function hazardEditWhere(n: number, patch: Record<string, unknown>): { where: string[]; guard: HazardEditGuard; guarded: boolean } {
  const guard = hazardEditGuard(patch);
  const guarded = guard.locked.length > 0 || guard.takesOff;
  const where = [`id = $${n - 1}`, `organization_id = $${n}`, 'deleted_at IS NULL'];
  if (guarded) where.push(HAZARD_CARRIES_NO_ACCEPTANCE);
  return { where, guard, guarded };
}

/**
 * After a PATCH of hazard `id` changed nothing: 404 when the organization holds
 * no live one (an unguarded edit matches nothing only then), else the refusal,
 * or a hazard that moved while it was saved.
 */
export async function refuseAcceptedHazardEdit(res: Response, id: number, orgId: number, guard: HazardEditGuard) {
  const state = await hazardAcceptanceState(pool, orgId, id);
  if (!state) return notFoundInTenant(res, 'Risk item');
  if (!state.accepted) {
    return clientError(res, 409, 'This hazard changed while it was being saved. Reload it and try again. Nothing was saved.', { code: 'RISK_ITEM_CHANGED' });
  }
  if (guard.locked.length > 0) {
    const refusal = signedContentRefusal('risk-item', state.status, { fields: guard.locked });
    return clientError(res, refusal.status, refusal.message, refusal.details);
  }
  return clientError(
    res,
    409,
    "This hazard's residual risk is accepted, and the acceptance is signed. Moving it to a status before acceptance, or recording its residual risk as not acceptable, reopens that acceptance, which is a signed act: POST /api/mdx/risk-items/:id/reopen with your password, what the signature means and a reason. Nothing was saved.",
    { code: 'RESIDUAL_ACCEPTANCE_REOPEN_REQUIRED' },
  );
}

/** A control write under an accepted hazard that wrote nothing, answered. */
export function answerControlWrite(res: Response, w: Exclude<ChildWrite, { outcome: 'written' }>, noun: string) {
  if (w.outcome === 'not-found') return notFoundInTenant(res, noun);
  if (w.outcome === 'refused') return clientError(res, w.refusal.status, w.refusal.message, w.refusal.details);
  return clientError(res, 409, 'This hazard changed while the control was being saved. Reload it and try again. Nothing was saved.', { code: 'RISK_ITEM_CHANGED' });
}

/** After a guarded control PATCH changed nothing: why, from the control's hazard. */
export async function refuseAcceptedControlEdit(res: Response, controlId: number, orgId: number) {
  const { rows } = await pool.query<{ risk_item_id: number }>(
    `SELECT risk_item_id FROM risk_controls WHERE id = $1 AND organization_id = $2`,
    [controlId, orgId],
  );
  if (!rows[0]) return notFoundInTenant(res, 'Risk control');
  const w = await hazardChildRefusal(pool, orgId, Number(rows[0].risk_item_id));
  return answerControlWrite(res, w.outcome === 'written' ? { outcome: 'changed' } : w, 'Risk control');
}

/* ─── The reopen: a signed act ───────────────────────────────────────────── */

/** The statuses before acceptance, which a reopened hazard returns to. */
const PRE_ACCEPTANCE_STATUS = ['open', 'mitigating', 'verified'] as const;
type PreAcceptanceStatus = (typeof PRE_ACCEPTANCE_STATUS)[number];

export const reopenBody = z.object({ status: z.enum(PRE_ACCEPTANCE_STATUS).optional() });

const REOPEN_CODE_STATUS = {
  RISK_ITEM_NOT_FOUND: 404,
  RISK_NOT_ACCEPTED: 409,
  RISK_REOPEN_STATUS_REQUIRED: 409,
} as const;

function reopenRefused(code: keyof typeof REOPEN_CODE_STATUS, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/**
 * The acceptance in force on `target` that the reopen withdraws from use: its
 * signature id, and the pre-acceptance status it recorded (`act.previousStatus`),
 * when it is one. Read on the signing transaction.
 */
async function acceptanceInForce(client: RequestDbClient, orgId: number, target: string): Promise<{ id: number | null; from: PreAcceptanceStatus | null }> {
  const { rows } = await client.query<Record<string, unknown>>(
    `SELECT id, is_valid, superseded_by, verification_status,
            (signature_manifest::jsonb -> 'act' ->> 'previousStatus') AS previous_status
       FROM electronic_signatures
      WHERE organization_id = $1 AND signed_target = $2
        AND (signature_manifest::jsonb -> 'act' ->> 'acceptable') = 'true'
      ORDER BY signed_at DESC, id DESC`,
    [orgId, target],
  );
  const live = rows.find((r) => !isSignatureWithdrawn(r));
  const from = PRE_ACCEPTANCE_STATUS.find((s) => s === live?.previous_status) ?? null;
  return { id: live ? Number(live.id) : null, from };
}

type HazardRow = { status: string; acceptable: boolean | null };

/** The signed reopen of hazard `id`'s accepted residual risk. Answers the request itself. */
export async function reopenResidualAcceptanceSigned(req: Request, res: Response, id: number): Promise<void> {
  const parsed = reopenBody.safeParse({ status: req.body?.status });
  if (!parsed.success) {
    clientError(res, 422, 'A reopened hazard returns to a status before acceptance: open, mitigating or verified. Nothing was signed.', parsed.error.flatten().fieldErrors);
    return;
  }
  const target = `risk-item:${id}`;
  await signGovernedAct(req, res, {
    domain: 'risk',
    target,
    meanings: DECISION_ACT_MEANINGS,
    codeStatus: REOPEN_CODE_STATUS,
    // The hazard as it stood when it was reopened: what the acceptance signed, unchanged since.
    contentBasis: BINDING_BASIS.RISK_RESIDUAL_ACCEPTANCE_CONTENT,
    run: async (client, orgId) => {
      // Under the ceremony's lock on this target (DP-65), as the acceptance runs.
      const { rows } = await client.query<HazardRow>(
        `SELECT status, acceptable FROM risk_items
          WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
          FOR UPDATE`,
        [id, orgId],
      );
      const current = rows[0];
      if (!current) throw reopenRefused('RISK_ITEM_NOT_FOUND', 'Risk item not found. Nothing was signed.');
      if (current.status !== 'accepted' && current.acceptable !== true) {
        throw reopenRefused('RISK_NOT_ACCEPTED', "This hazard's residual risk is not accepted, so there is no acceptance to reopen. Nothing was signed.");
      }
      const acceptance = await acceptanceInForce(client, orgId, target);
      const to = parsed.data.status ?? acceptance.from;
      if (!to) {
        throw reopenRefused('RISK_REOPEN_STATUS_REQUIRED',
          'No signed acceptance in force records the status this hazard had before it was accepted. Name the status to return it to: open, mitigating or verified. Nothing was signed.');
      }
      const updated = await client.query(
        `UPDATE risk_items SET status = $3, acceptable = NULL, updated_at = NOW()
          WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
          RETURNING *`,
        [id, orgId, to],
      );
      return {
        target,
        // What was reopened: it goes on the ledger and the signature manifest.
        payload: {
          kind: 'reopen-residual-acceptance',
          riskItemId: id,
          previousStatus: current.status,
          previousAcceptable: current.acceptable,
          status: to,
          reopenedAcceptanceSignatureId: acceptance.id,
        },
        body: { data: updated.rows[0] },
      };
    },
  });
}
