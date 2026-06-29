/**
 * SafetyNarrativeQcPanel — the QC-checklist trust strip for an ICH E3 §16
 * safety narrative, modelled on VerificationPanel.
 *
 * The safety-narrative writer (draft_safety_narrative) reports a list of MISSING
 * required fields rather than inventing them. This panel surfaces those exactly
 * like verification issues: a calm checklist the writer clears before sign-off,
 * with each required field marked present (check) or missing (alert).
 *
 * Honesty contract (21 CFR Part 11): a narrative that is still missing required
 * fields — or one built from SAMPLE data — is FLAGGED and NON-SEALABLE. The
 * panel states this plainly and the surrounding UI must not offer a seal/sign
 * action while `sealable` is false. No emoji; factual microcopy; the strip is a
 * live region for assistive tech.
 */
import { I } from './icons';
import type { NarrativeQcResult } from './safetyNarrativeBatch';
import styles from './styles.module.css';

export interface SafetyNarrativeQcPanelProps {
  qc: NarrativeQcResult;
  /** Optional subject id, shown in the header for batch context. */
  subjectId?: string;
}

export function SafetyNarrativeQcPanel({ qc, subjectId }: SafetyNarrativeQcPanelProps) {
  const { checklist, missingFields, isSample, sealable, blockReason } = qc;
  const present = checklist.length - missingFields.length;

  return (
    <div
      className={styles.verifyPanel}
      data-status={sealable ? 'verified' : 'unverified'}
      role="status"
      aria-live="polite"
    >
      <div className={styles.verifyHead}>
        <span className={styles.ico} aria-hidden="true">
          {sealable ? <I.shieldCheck size={14} /> : <I.alert size={14} />}
        </span>
        <span className={styles.verifyTitle}>
          {sealable
            ? 'Narrative QC clear — ready for sign-off'
            : 'Narrative QC — not ready for sign-off'}
          {subjectId ? ` · ${subjectId}` : ''}
        </span>
      </div>

      <p className={styles.verifyDetail}>
        <span>
          {present} of {checklist.length} required {checklist.length === 1 ? 'field' : 'fields'} present.
        </span>
        {isSample && (
          <span className={styles.qcSampleFlag}> Sample data — non-sealable.</span>
        )}
        {!sealable && blockReason && <span> {blockReason}</span>}
      </p>

      <ul className={styles.verifyMissing} aria-label="ICH E3 section 16 required fields">
        {checklist.map((item) => (
          <li key={item.field} data-present={item.present ? 'true' : 'false'}>
            <span className={styles.ico} aria-hidden="true">
              {item.present ? <I.check size={11} /> : <I.alert size={11} />}
            </span>
            <span className={styles.qcFieldLabel}>
              {item.label}
              <span className={styles.srOnly}>{item.present ? ' — present' : ' — missing'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
