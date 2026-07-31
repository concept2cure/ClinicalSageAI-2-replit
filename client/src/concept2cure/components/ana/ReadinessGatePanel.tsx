/**
 * ReadinessGatePanel — the E10 "assemble Module 2/5 + readiness gate" trust
 * strip. Modeled on VerificationPanel: a calm, reviewer-grade verdict that the
 * 21 CFR Part 11 trail can cite — not "AnA assembled it" but "AnA assembled it,
 * proved it structurally valid, and proved it consistent with the dossier."
 *
 * The gate is the honesty contract made visible. It renders one of three states
 * (the verdict is computed in ectdReadiness.aggregateReadiness, never here):
 *
 *   - ready        → shield-check, "Ready for submission", both sub-checks
 *                    green. Export / seal is ENABLED.
 *   - blocked      → alert, the blocking items listed with deep links, ordered
 *                    highest-severity first. Export / seal is DISABLED.
 *   - not_assessed → neutral, "Readiness not assessed" (or a sample notice).
 *                    Export / seal is DISABLED — a gate that never ran, or ran
 *                    over sample data, cannot certify a submission.
 *
 * Microcopy is factual — calm, no cheerleading, no emoji. The strip is a live region
 * so assistive tech announces the verdict. The export/seal button's `disabled`
 * is bound to `!gate.sealable`, so a non-clean verdict can never be sealed.
 *
 * @module client/src/concept2cure/components/ana/ReadinessGatePanel
 */
import { I } from './icons';
import type { ReadinessGate, BlockingItem } from './ectdReadiness';
import styles from './styles.module.css';

export interface ReadinessGatePanelProps {
  gate: ReadinessGate;
  /**
   * The PDUFA-clock submission / seal action. Fired only from the gate's
   * Export action, which is disabled unless `gate.sealable` is true — so the
   * caller never has to re-check the contract.
   */
  onSeal?: () => void;
  /**
   * Follow a blocking item's deep link (jump to the conflicting CTD section, or
   * open the assembled module). Omit for read-only history views.
   */
  onFollowLink?: (item: BlockingItem) => void;
  /** True while the assemble + check action is in flight. */
  assessing?: boolean;
}

const STATUS_LABEL: Record<ReadinessGate['gate'], string> = {
  ready: 'Ready for submission',
  blocked: 'Blocked — resolve before submission',
  not_assessed: 'Readiness not assessed',
};

export function ReadinessGatePanel({ gate, onSeal, onFollowLink, assessing }: ReadinessGatePanelProps) {
  const { gate: status, blockingItems, sealable, structuralOk, consistencyVerdict, moduleNumber } = gate;
  const ready = status === 'ready';

  return (
    <section
      className={styles.gatePanel}
      data-status={status}
      role="status"
      aria-live="polite"
      aria-label="eCTD module readiness gate"
    >
      <div className={styles.gateHead}>
        <span className={styles.ico} aria-hidden="true">
          {ready ? <I.shieldCheck size={14} /> : <I.alert size={14} />}
        </span>
        <span className={styles.gateTitle}>
          {moduleNumber ? `Module ${moduleNumber} — ` : ''}
          {STATUS_LABEL[status]}
        </span>
      </div>

      <p className={styles.gateSummary}>{gate.summary}</p>

      {/* Two-line sub-verdict so the reviewer sees which check gated. */}
      {status !== 'not_assessed' && (
        <ul className={styles.gateChecks} aria-label="Readiness checks">
          <li data-ok={structuralOk ? 'true' : 'false'}>
            <span className={styles.ico} aria-hidden="true">
              {structuralOk ? <I.check size={12} /> : <I.alert size={12} />}
            </span>
            <span>
              Structural validation:{' '}
              <strong>{structuralOk ? 'valid' : 'failed'}</strong>
            </span>
          </li>
          <li data-ok={consistencyVerdict === 'clean' ? 'true' : 'false'}>
            <span className={styles.ico} aria-hidden="true">
              {consistencyVerdict === 'clean' ? <I.check size={12} /> : <I.alert size={12} />}
            </span>
            <span>
              Dossier consistency:{' '}
              <strong>{String(consistencyVerdict).replace(/_/g, ' ')}</strong>
            </span>
          </li>
        </ul>
      )}

      {blockingItems.length > 0 && (
        <ul className={styles.gateBlockers} aria-label="Blocking items">
          {blockingItems.map(item => (
            <li key={item.id} data-severity={item.severity}>
              <span className={styles.ico} aria-hidden="true">
                <I.alert size={11} />
              </span>
              <span className={styles.gateBlockerText}>{item.label}</span>
              {item.deepLink && (
                <button
                  type="button"
                  className={styles.gateDeepLink}
                  // Name carries the blocker so the link is distinguishable out
                  // of context (multiple "Open" links would otherwise collide).
                  aria-label={`${item.deepLink.label}: ${item.label}`}
                  onClick={() => onFollowLink?.(item)}
                >
                  {item.deepLink.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className={styles.gateActions}>
        <button
          type="button"
          className={styles.gateSeal}
          onClick={onSeal}
          // The honesty contract: the seal / submit action is unavailable unless
          // the gate is ready (and the module is not a sample). Bound directly
          // to the aggregated verdict so the UI cannot drift from the contract.
          disabled={!sealable || assessing || !onSeal}
          aria-disabled={!sealable || assessing || !onSeal}
        >
          <span className={styles.ico} aria-hidden="true">
            <I.shieldCheck size={13} />
          </span>
          <span>{assessing ? 'Assessing…' : 'Seal and submit to PDUFA clock'}</span>
        </button>
        {!sealable && !assessing && (
          <span className={styles.gateSealHint}>
            {status === 'not_assessed'
              ? 'Available once the module is assembled from live artifacts and the checks pass.'
              : 'Available once every blocking item is resolved.'}
          </span>
        )}
      </div>
    </section>
  );
}
