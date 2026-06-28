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
 * Microcopy is factual (no "Looks good!", no emoji). The strip is a live
 * region so assistive tech announces the verdict. This is the evidence a
 * regulatory user (and the 21 CFR Part 11 trail) cites — not "AnA wrote it"
 * but "AnA wrote it and proved it matches your source."
 */
import { I } from './icons';
import type { VerificationResult } from './useAnaChat';
import styles from './styles.module.css';

export interface VerificationPanelProps {
  verification: VerificationResult;
}

export function VerificationPanel({ verification }: VerificationPanelProps) {
  const { ok, missingRequiredStrings, requiredStringsChecked, divergence } = verification;
  const checked = requiredStringsChecked ?? 0;
  const missingCount = missingRequiredStrings.length;
  const confirmed = Math.max(0, checked - missingCount);

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
    </div>
  );
}
