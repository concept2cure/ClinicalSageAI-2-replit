/**
 * Adaptive monitoring — the wire, and the signature the decision runs through.
 *
 * Split out of `adaptiveMonitoring.tsx` so neither half exceeds the file-length
 * limit. This half is everything that talks to the server: the eight
 * `/api/biostat/adaptive/*` routes, the shapes they answer with, and the Part 11
 * dialog that signs an interim decision. The panel that renders them is the
 * other half.
 *
 * ── The decision is a signature, not a button ────────────────────────────────
 * An interim decision stops a trial, resizes it, drops an arm or enriches a
 * population, on unblinded data, and a regulator asks who decided and on what.
 * So it runs the shared Part 11 `EsignModal` and the server's one ceremony
 * (services/adaptive-decision-signature.ts): §11.50 meaning, reason, §11.200
 * re-entry of the password and the authenticator code, verified again inside
 * the transaction that writes the decision, its ledger row and its
 * `electronic_signatures` manifest — bound to the interim look's own data.
 *
 * Only `approval` and `responsibility` are offered, because those are the two
 * the server allows: nobody authors a decision about observed data, and an
 * IDMC recommendation that stops a trial is not a review of someone's work.
 * The dialog never offers a meaning the server would refuse.
 *
 * @module client/src/concept2cure/v2/surfaces/adaptiveMonitoringApi
 */
import React from 'react';
import { readOne } from './biostatPanelWire';
import { EsignModal, type EsigSignedManifest } from '../../_shared/components/EsignModal';
import { useAuthUser, type AuthUser } from '@/services/portal/authService';

export { FAILED, type Read } from './biostatPanelWire';

/* ── The wire ─────────────────────────────────────────────────────────────── */

/** One interim look as the server stores it. */
export interface InterimSnapshot {
  id: number;
  lookNumber: number;
  informationFraction: number | null;
  enrolledCount: number | null;
  isBlinded: boolean | null;
  testStatistic: number | null;
  conditionalPower: number | null;
  predictivePower: number | null;
  boundary?: unknown;
}

export interface AdaptiveDecisionRow {
  id: number;
  snapshotId: number | null;
  adaptationType: string;
  decision: string;
  rationale: string;
  approvedBy: number | null;
  approvedAt: string | null;
}

export interface AdaptivePlan {
  id: number;
  title: string | null;
  designType: string | null;
  spendingFunction: string | null;
  maxSampleSize: number | null;
  snapshots?: InterimSnapshot[];
  decisions?: AdaptiveDecisionRow[];
}

export const adaptiveApi = {
  plan: (planId: number) => readOne<AdaptivePlan>('GET', `/api/biostat/adaptive/${planId}`),
  operatingCharacteristics: (planId: number) =>
    readOne<Record<string, unknown>>('GET', `/api/biostat/adaptive/${planId}/operating-characteristics`),
  idmcReport: (planId: number, lookNumber: number) =>
    readOne<Record<string, unknown>>('GET', `/api/biostat/adaptive/${planId}/idmc-report/${lookNumber}`),
  createPlan: (body: Record<string, unknown>) => readOne<AdaptivePlan>('POST', '/api/biostat/adaptive/plan', body),
  ingestSnapshot: (planId: number, body: Record<string, unknown>) =>
    readOne<InterimSnapshot>('POST', `/api/biostat/adaptive/${planId}/interim-snapshot`, body),
  evaluate: (planId: number, snapshotId: number) =>
    readOne<Record<string, unknown>>('POST', `/api/biostat/adaptive/${planId}/evaluate/${snapshotId}`),
  reestimate: (planId: number, snapshotId: number) =>
    readOne<Record<string, unknown>>('POST', `/api/biostat/adaptive/${planId}/ssr/${snapshotId}`),
  signDecision: (planId: number, body: Record<string, unknown>) =>
    readOne<Record<string, unknown>>('POST', `/api/biostat/adaptive/${planId}/decision`, body),
};

/* ── The signature ────────────────────────────────────────────────────────── */

/** The adaptations the server models, by the name it stores. */
export const ADAPTATION_TYPES = [
  ['sample_size_reestimation', 'Sample-size re-estimation'],
  ['response_adaptive_randomization', 'Response-adaptive randomization'],
  ['dose_selection', 'Dose selection'],
  ['arm_dropping', 'Arm dropping'],
  ['endpoint_modification', 'Endpoint modification'],
  ['population_enrichment', 'Population enrichment'],
  ['seamless_phase', 'Seamless phase transition'],
] as const;

/** The stored adaptation name rendered as its label, or itself if unmodelled. */
export function adaptationLabel(value: string): string {
  return ADAPTATION_TYPES.find(([v]) => v === value)?.[1] ?? value;
}

/** The signer the dialog prints; never "undefined". The server records the real name. */
function printedSigner(authUser: AuthUser | null) {
  const printed = [
    authUser?.displayName,
    [authUser?.firstName, authUser?.lastName].filter(Boolean).join(' '),
    authUser?.email,
  ].find((v) => typeof v === 'string' && v.trim().length > 0);
  return printed ? { name: printed.trim(), ...(authUser?.email ? { email: authUser.email } : {}) } : undefined;
}

export interface DecisionDraft {
  planId: number;
  snapshot: InterimSnapshot;
  adaptationType: string;
  decision: string;
}

/**
 * The decision's signature dialog. The password and the authenticator code go
 * straight to the server as `reauth` and are re-verified inside the
 * transaction that writes the decision; nothing stores them.
 */
export function AdaptiveDecisionSignModal({ draft, onClose, onSigned }: {
  draft: DecisionDraft;
  onClose: () => void;
  onSigned: (result: Record<string, unknown>) => void;
}) {
  const authUser = useAuthUser();

  return (
    <EsignModal
      open
      action={`Sign interim decision: ${adaptationLabel(draft.adaptationType)}`}
      target={draft.decision}
      targetMeta={`At look ${draft.snapshot.lookNumber}${
        draft.snapshot.informationFraction !== null ? ` (information fraction ${draft.snapshot.informationFraction})` : ''
      }. Your signature binds this look's data — its test statistic, conditional and predictive power and boundary — not just the words above.`}
      defaultMeaning="approval"
      /* The two the server allows. Offering a third would be a dialog that
         collects a password for a signature the server then refuses. */
      meanings={['approval', 'responsibility']}
      signer={printedSigner(authUser)}
      requireMfa={authUser?.mfaEnabled === true}
      onClose={onClose}
      onSign={async (input) => {
        const result = await adaptiveApi.signDecision(draft.planId, {
          snapshotId: draft.snapshot.id,
          adaptationType: draft.adaptationType,
          decision: draft.decision,
          rationale: input.reason,
          meaning: input.meaning,
          reauth: { password: input.password, ...(input.totp ? { totp: input.totp } : {}) },
        });
        onSigned(result);
        return {
          meaning: input.meaning as EsigSignedManifest['meaning'],
          reason: input.reason,
          signedAt: typeof result.signedAt === 'string' ? result.signedAt : '',
          ...(typeof result.sha256Chain === 'string' ? { hash: result.sha256Chain } : {}),
        };
      }}
    />
  );
}
