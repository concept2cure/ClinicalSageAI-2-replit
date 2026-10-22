/**
 * AnA's own Manual holds, as the lineage dossier reads them (row 74, slice
 * S4) — kept beside lineage-dossier.ts rather than in it, so the run policy's
 * part of the dossier is one small module and the dossier (row 60's) gains a
 * field, not a reader.
 *
 * @module server/services/ana/lineage-dossier-holds
 */
import { isPolicyHoldOutcome, stepLabels, type PolicyHoldOutcome } from '@shared/ana/run-policy';
import { actorLabel, resolveActorNames, type ActorName } from '../tenant/actor-names.js';

/**
 * One of AnA's OWN holds under Manual (row 74): she stopped before a step and
 * waited for the person. Distinct from the dossier's human controls on
 * purpose — the pause was the run policy's, not a person's, so it is not a
 * control; the person's "Run this step" that answered it IS one, and appears
 * there as a resume. Together they explain a resume that has no matching
 * human pause.
 */
export interface DossierPolicyHold {
  /** The assistant turn (1-based), numbered as the reasoning and controls are. */
  turn: number;
  /** The round she held before. */
  round: number;
  reason: 'manual';
  /** The steps she was about to run, by label. */
  next: string[];
  /**
   * How it was settled (shared/ana/run-policy.ts POLICY_HOLD_OUTCOMES).
   * `superseded` is not a hold: a steer sent while she worked replaced the
   * step before it was shown — kept so the step's fate is on the record.
   */
  outcome: PolicyHoldOutcome;
  at: string | null;
  /** The turn's run policy as stored with the message. */
  runPolicy: string | null;
}

/**
 * One turn's Manual holds, from the message metadata (tool-trace.ts
 * withTurnEnding). A malformed entry is COUNTED as unreadable, never dropped
 * in silence: a corrupt record must not read as "no holds".
 */
export function policyHoldsOf(
  meta: Record<string, unknown>,
  turn: number,
): { holds: DossierPolicyHold[]; unreadable: number } {
  const runPolicy = typeof meta.runPolicy === 'string' ? meta.runPolicy : null;
  const stored: unknown[] = Array.isArray(meta.policyHolds) ? meta.policyHolds : [];
  const holds: DossierPolicyHold[] = [];
  for (const raw of stored) {
    const h = raw as Record<string, unknown> | null;
    if (!h || typeof h !== 'object' || !Number.isInteger(h.round) || h.reason !== 'manual') continue;
    if (!isPolicyHoldOutcome(h.outcome)) continue;
    holds.push({
      turn,
      round: h.round as number,
      reason: 'manual',
      next: stepLabels(h.next),
      outcome: h.outcome,
      at: typeof h.at === 'string' ? h.at : null,
      runPolicy,
    });
  }
  return { holds, unreadable: stored.length - holds.length };
}

/** One person's control of a turn, as the dossier lists it (lineage-dossier.ts re-exports it). */
export interface DossierHumanControl {
  /** The assistant turn (1-based) the control was recorded against. */
  turn: number;
  action: 'pause' | 'resume' | 'interject' | 'cancel';
  message: string | null;
  round: number | null;
  at: string | null;
  /**
   * Who took it (AnA detach DT3 review: an administrator's cancel read as the
   * document author's own stop): their name as this tenant may name them, or
   * "user <id>" (services/tenant/actor-names.ts); null when the control
   * recorded no actor. Absent from dossiers assembled before this field.
   */
  by?: string | null;
  /** 'administrator' when an organisation administrator took it on a colleague's turn. */
  byRole?: 'administrator' | null;
  /** The reason an administrator gave for stopping the turn. */
  reason?: string | null;
}

/**
 * The human control actions one assistant message recorded (its
 * `metadata.humanControls`), numbered with the turn. An entry without an
 * action is skipped; a missing time is the message's own. Moved here from
 * lineage-dossier.ts beside policyHoldsOf, which reads the same metadata.
 */
export function humanControlsOf(
  meta: Record<string, unknown>,
  turn: number,
  createdAt: string | null,
): Array<DossierHumanControl & { byUserId: number | null }> {
  if (!Array.isArray(meta.humanControls)) return [];
  const out: Array<DossierHumanControl & { byUserId: number | null }> = [];
  for (const c of meta.humanControls as Array<Record<string, unknown> | null>) {
    if (!c || typeof c.action !== 'string') continue;
    out.push({
      turn,
      action: c.action as DossierHumanControl['action'],
      message: typeof c.message === 'string' ? c.message : null,
      round: typeof c.round === 'number' ? c.round : null,
      at: typeof c.at === 'string' ? c.at : createdAt,
      // Who took it, resolved to a name by the dossier (DT3 review): an
      // administrator's cancel is theirs, never the document author's.
      byUserId: typeof c.byUserId === 'number' && Number.isInteger(c.byUserId) ? c.byUserId : null,
      byRole: c.byRole === 'admin' ? 'administrator' : null,
      reason: typeof c.reason === 'string' && c.reason ? c.reason : null,
    });
  }
  return out;
}

/**
 * Each control's actor by name (DT3 review): resolved through the one
 * resolver, inside the dossier's tenant scope; "user <id>" for an id it does
 * not answer for, and the same when the names cannot be read — a control is
 * never left unattributed or credited to anyone else.
 */
export async function namedControls(controls: Array<DossierHumanControl & { byUserId?: number | null }>): Promise<DossierHumanControl[]> {
  const ids = controls.map(c => c.byUserId ?? null);
  const names = await resolveActorNames(ids).catch(() => new Map<number, ActorName>());
  return controls.map(({ byUserId, ...c }) => ({ ...c, by: actorLabel(names, byUserId ?? null) }));
}
