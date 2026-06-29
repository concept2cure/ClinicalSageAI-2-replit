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
}

export function VerificationPanel({ verification, onResolve }: VerificationPanelProps) {
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

      {!ok && onResolve && (
        <button type="button" className={styles.verifyResolve} onClick={onResolve}>
          <I.sparkles size={12} />
          <span>Ask AnA to resolve</span>
        </button>
      )}
    </div>
  );
}
