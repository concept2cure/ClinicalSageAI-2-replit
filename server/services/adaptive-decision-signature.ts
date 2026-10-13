/**
 * The signature ceremony for an adaptive trial's interim decision.
 *
 * ── Why this module exists ───────────────────────────────────────────────────
 * `POST /api/biostat/adaptive/:planId/decision` wrote the decision with a
 * Drizzle insert that set `approved_by` to the session's user id and
 * `approved_at` to the wall clock, and built its own `audit_trail` array in the
 * service. No re-authentication, no signing-authority check, no separation of
 * duties, no signature manifestation, and nothing binding the approval to the
 * data it was taken on.
 *
 * That is, to the letter, the defect `POST /api/biostat/sap/:id/sign` was
 * REMOVED for on 2026-10-08 (505f71263): an approval stamped from the request's
 * own session, verifying nothing. It survived here because `ci:sign-ceremony`
 * says in its own header that a Drizzle `.set({ approvedBy })` "is not seen at
 * all" — the gate watches the sign ledger, and this wrote no ledger row.
 *
 * An interim decision is the most consequential act in a running trial: it
 * stops a study, re-estimates its size, drops an arm, or enriches a
 * population, on unblinded data, and a regulator will ask who decided and on
 * what. So it runs the platform's ONE ceremony
 * (services/part11/governed-signature-ceremony.ts): meaning, permission gate,
 * re-authentication, separation of duties, the domain write, the ledger pair
 * and the electronic_signatures row, all on one transaction.
 *
 * ── What the signature binds ─────────────────────────────────────────────────
 * The target is the INTERIM SNAPSHOT, not the decision row. An IDMC does not
 * approve "a decision" in the abstract; it approves a decision about a
 * specific look at the data. Binding the snapshot (BINDING_BASIS
 * .INTERIM_SNAPSHOT_CONTENT, governed-target-binders.ts) answers "what did you
 * approve?" with the look's own numbers, and it is derivable again later —
 * which a decision row created inside the same transaction is not.
 *
 * The join from a decision to its signature is therefore
 * `adaptation_decisions.snapshot_id` → `electronic_signatures.target =
 * 'interim-snapshot:<snapshot_id>'`. `adaptation_decisions` grew no column for
 * it, because a second place to keep the link is a second place for it to be
 * wrong.
 *
 * This module only names the ledger domain and surface, as
 * `protocol-development/protocol-signature.ts` does for the protocol
 * workspace. The ceremony itself is not copied.
 *
 * @module server/services/adaptive-decision-signature
 */
import {
  GovernedSignatureRefusal,
  signGovernedAct,
  signerIpAddress,
  type CeremonySignMeaning,
  type GovernedSignatureInput,
} from './part11/governed-signature-ceremony';

/**
 * An interim decision carries `approval` or `responsibility`, never
 * `authorship` or `review`.
 *
 * `authorship` is refused because nobody authors a decision about data — the
 * data was observed, and the ceremony's authorship check would have to resolve
 * an author for an interim look, which has none. `review` is refused because
 * an IDMC recommendation that stops or changes a trial is not a review of
 * someone else's work; the signer is accountable for the act itself.
 */
export const ADAPTIVE_DECISION_MEANINGS = ['approval', 'responsibility'] as const satisfies readonly CeremonySignMeaning[];

export { GovernedSignatureRefusal as AdaptiveDecisionRefusal, signerIpAddress };

export type AdaptiveDecisionSignatureInput = Omit<
  GovernedSignatureInput,
  'domain' | 'surface' | 'subject' | 'allowedMeanings'
>;

/** Sign an interim decision. Nothing is written unless the ceremony passes. */
export function signAdaptiveDecision(
  input: AdaptiveDecisionSignatureInput,
): Promise<Record<string, unknown>> {
  return signGovernedAct({
    ...input,
    domain: 'biostatistics',
    surface: 'adaptive-monitoring',
    subject: 'interim decision',
    allowedMeanings: ADAPTIVE_DECISION_MEANINGS,
  });
}
