/**
 * VerificationPanel — the UI manifestation of AnA's "verify it against your
 * text" step (the 12th move of the document-surgery loop). Renders the result
 * of `verify_docx_against_source` as a calm, reviewer-grade trust strip:
 *
 *   - Verified   → shield-check, "Verified against your source", with the
 *                  count of caption/boilerplate strings confirmed verbatim.
 *   - Not verified → alert, the exact strings that are missing, and the
 *                  line-level divergence vs. the supplied source.
 *
 * Microcopy is factual — calm, no cheerleading, no emoji. The strip is a live
 * region so assistive tech announces the verdict. This is the evidence a
 * regulatory user (and the 21 CFR Part 11 trail) cites — not "AnA wrote it"
 * but "AnA wrote it and proved it matches your source."
 */
import { useEffect, useState } from 'react';

import { EsignModal, type EsigSignedManifest } from '../../_shared/components/EsignModal';
import { I } from './icons';
import { SealBadge } from './SealBadge';
import type { VerificationResult } from './useAnaChat';
import {
  esigMeaningToSealMeaning,
  type SealVerifiedArgs,
  type VerifiedSeal,
} from './useVerifiedSeal';
import styles from './styles.module.css';

/**
 * Compose the targeted fix request AnA receives when the user clicks "Ask AnA
 * to resolve" on a failed verification — it cites exactly what diverged so AnA
 * can correct and re-verify. Pure + exported for testing.
 */
export function composeVerificationFixMessage(
  title: string,
  verification: VerificationResult,
): string {
  const parts: string[] = [`The document "${title}" failed verification against the source.`];
  if (verification.missingRequiredStrings.length > 0) {
    parts.push(
      `These required strings are missing and must appear verbatim: ${verification.missingRequiredStrings
        .map(s => `"${s}"`)
        .join(', ')}.`,
    );
  }
  const div = verification.divergence;
  if (div && (div.additions > 0 || div.deletions > 0)) {
    parts.push(`There are ${div.additions} added and ${div.deletions} dropped line(s) versus the source.`);
  }
  parts.push(
    'Please correct the document so it reproduces the source verbatim — restore the missing strings and reconcile the divergences — then re-verify it.',
  );
  return parts.join(' ');
}

export interface VerificationPanelProps {
  verification: VerificationResult;
  /**
   * When the document is NOT verified, offer a one-click action to ask AnA to
   * fix the divergences (missing caption strings / content drift) and re-verify.
   * Omit to hide the action (e.g. read-only history views).
   */
  onResolve?: () => void;
  /**
   * E1 — Part 11 verified-and-sealed export. When the document IS verified
   * (`verification.ok === true`) and a sealer is supplied, render a calm
   * "Sign and seal verified version" action that opens the shared e-signature
   * modal and, on sign, persists an immutable SealedRecord. Omit to hide the
   * action (e.g. when ENABLE_ANA_DOCUMENT_STUDIO is off, or in read-only views).
   * Returns the persisted seal, or null on failure (surfaces inline).
   */
  onSeal?: (
    args: Pick<SealVerifiedArgs, 'printedName' | 'meaning' | 'reasonForChange' | 'password' | 'mfaToken'>,
  ) => Promise<VerifiedSeal | null>;
  /** Identity shown as the signer in the e-sign modal. */
  signer?: { name: string; email?: string; role?: string };
  /** True when the signer is MFA-enrolled (modal requires a TOTP). */
  requireMfa?: boolean;
  /** An already-applied seal for this version (e.g. rehydrated). Renders the SealBadge. */
  seal?: VerifiedSeal | null;
}

export function VerificationPanel({
  verification,
  onResolve,
  onSeal,
  signer,
  requireMfa,
  seal,
}: VerificationPanelProps) {
  const { ok, missingRequiredStrings, requiredStringsChecked, divergence } = verification;
  const checked = requiredStringsChecked ?? 0;
  const missingCount = missingRequiredStrings.length;
  const confirmed = Math.max(0, checked - missingCount);

  // E1 — seal flow state. The shared <EsignModal> handles re-auth + §11.50
  // meaning + reason capture; on sign we map its meaning onto the seal meaning
  // and call onSeal, then show the SealBadge.
  const [modalOpen, setModalOpen] = useState(false);
  const [appliedSeal, setAppliedSeal] = useState<VerifiedSeal | null>(seal ?? null);
  const [sealError, setSealError] = useState<string | null>(null);
  // Resync when the host switches the shown version/document while this panel
  // stays mounted — otherwise the first version's seal keeps rendering (and
  // keeps canSeal false) for every other version.
  useEffect(() => {
    setAppliedSeal(seal ?? null);
    setSealError(null);
  }, [seal]);
  const canSeal = ok && Boolean(onSeal) && !appliedSeal;

  const handleSign = async (input: {
    meaning: string;
    reason: string;
    password: string;
    totp?: string;
  }): Promise<EsigSignedManifest> => {
    const sealMeaning = esigMeaningToSealMeaning(input.meaning);
    if (!sealMeaning) {
      throw new Error('Choose Authorship, Review, or Approval to seal this version.');
    }
    const result = await onSeal?.({
      printedName: signer?.name ?? '',
      meaning: sealMeaning,
      reasonForChange: input.reason,
      password: input.password,
      mfaToken: input.totp,
    });
    if (!result) {
      throw new Error('The version could not be sealed. No record was written.');
    }
    setAppliedSeal(result);
    setSealError(null);
    return {
      meaning: input.meaning as EsigSignedManifest['meaning'],
      reason: input.reason,
      signedAt: result.sealedRecord.sealedAt,
      hash: result.sealedRecord.contentHash,
    };
  };

  return (
    <div
      className={styles.verifyPanel}
      data-status={ok ? 'verified' : 'unverified'}
      role="status"
      aria-live="polite"
    >
      <div className={styles.verifyHead}>
        <span className={styles.ico} aria-hidden="true">
          {ok ? <I.shieldCheck size={14} /> : <I.alert size={14} />}
        </span>
        <span className={styles.verifyTitle}>
          {ok ? 'Verified against your source' : 'Not verified against your source'}
        </span>
      </div>

      <p className={styles.verifyDetail}>
        {checked > 0 && (
          <span>
            {confirmed} of {checked} required {checked === 1 ? 'string' : 'strings'} present verbatim
            {divergence ? '. ' : '.'}
          </span>
        )}
        {divergence && (
          <span>
            {divergence.additions} added / {divergence.deletions} dropped {divergence.deletions === 1 ? 'line' : 'lines'} vs. source.
          </span>
        )}
        {checked === 0 && !divergence && (
          <span>{ok ? 'Document matches the source you provided.' : 'Document does not match the source you provided.'}</span>
        )}
      </p>

      {missingCount > 0 && (
        <ul className={styles.verifyMissing} aria-label="Missing required strings">
          {missingRequiredStrings.map((s, i) => (
            <li key={i}>
              <span className={styles.ico} aria-hidden="true">
                <I.alert size={11} />
              </span>
              <span className={styles.verifyMissingText}>{s}</span>
            </li>
          ))}
        </ul>
      )}

      {!ok && onResolve && (
        <button type="button" className={styles.verifyResolve} onClick={onResolve}>
          <I.sparkles size={12} />
          <span>Ask AnA to resolve</span>
        </button>
      )}

      {appliedSeal && <SealBadge seal={appliedSeal} />}

      {canSeal && (
        <button
          type="button"
          className={styles.sealAction}
          onClick={() => {
            setSealError(null);
            setModalOpen(true);
          }}
        >
          <I.shieldCheck size={12} />
          <span>Sign and seal verified version</span>
        </button>
      )}

      {sealError && (
        <p className={styles.sealError} role="alert">
          {sealError}
        </p>
      )}

      {canSeal && modalOpen && (
        <EsignModal
          open={modalOpen}
          action="Seal verified version"
          target="Verified document"
          targetMeta="Sealed against the source it was verified against"
          defaultMeaning="approval"
          signer={signer}
          requireMfa={requireMfa}
          onClose={() => setModalOpen(false)}
          onSign={handleSign}
        />
      )}
    </div>
  );
}
