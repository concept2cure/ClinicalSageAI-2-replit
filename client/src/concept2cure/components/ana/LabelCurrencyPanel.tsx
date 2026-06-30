/**
 * LabelCurrencyPanel — the label-currency gate, modeled on VerificationPanel.
 *
 * Renders the DETERMINISTIC verdict from `review_label_currency`: a calm trust
 * strip that reads "current" (every approved market carries a current label) or
 * "stale" (one or more approved markets are missing a current label), with the
 * cited findings + their regulatory basis. The verdict is never an AI guess —
 * it is the server's deterministic finding set, surfaced verbatim. This is the
 * gate a US/EU labeling team (and the 21 CFR Part 11 trail) cites before a draft
 * is treated as authoring-ready.
 *
 * Microcopy is factual (no emoji, no cheerleading). The strip is a live region
 * so assistive tech announces the verdict.
 */
import { I } from './icons';
import type { LabelCurrencyVerdict } from './labelingModes';
import { isLabelCurrent } from './labelingModes';
import styles from './styles.module.css';

export interface LabelCurrencyPanelProps {
  verdict: LabelCurrencyVerdict;
}

export function LabelCurrencyPanel({ verdict }: LabelCurrencyPanelProps) {
  const current = isLabelCurrent(verdict);
  const findingCount = verdict.findings.length;

  return (
    <div
      className={styles.verifyPanel}
      data-status={current ? 'verified' : 'unverified'}
      role="status"
      aria-live="polite"
    >
      <div className={styles.verifyHead}>
        <span className={styles.ico} aria-hidden="true">
          {current ? <I.shieldCheck size={14} /> : <I.alert size={14} />}
        </span>
        <span className={styles.verifyTitle}>
          {current ? 'Label currency: current' : 'Label currency: stale'}
        </span>
      </div>

      <p className={styles.verifyDetail}>
        {current ? (
          <span>All approved markets carry a current approved label.</span>
        ) : (
          <span>
            {findingCount} approved {findingCount === 1 ? 'market is' : 'markets are'} missing a
            current label. Risk level: {verdict.riskLevel}.
          </span>
        )}
      </p>

      {findingCount > 0 && (
        <ul className={styles.verifyMissing} aria-label="Label-currency findings">
          {verdict.findings.map((f, i) => (
            <li key={i}>
              <span className={styles.ico} aria-hidden="true">
                <I.alert size={11} />
              </span>
              <span className={styles.verifyMissingText}>
                {f.message} ({f.basis})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
