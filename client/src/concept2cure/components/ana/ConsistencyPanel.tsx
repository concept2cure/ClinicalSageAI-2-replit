/**
 * ConsistencyPanel — the UI manifestation of AnA's Dossier Consistency Sweep
 * (E2). A SECOND Document Studio verification surface, modeled on
 * VerificationPanel: where VerificationPanel proves a draft reproduces *its own
 * source* verbatim, this proves the draft does not *contradict the rest of the
 * dossier* — the same labelled quantity (N, p-value, dose, NOAEL, shelf-life)
 * stated with conflicting values across Module 2 summaries and Module 5 study
 * reports, or a cross-reference that points at nothing.
 *
 * It renders the `check_dossier_consistency` verdict as a calm, reviewer-grade
 * trust strip:
 *
 *   - clean        → shield-check, "Consistent with your dossier".
 *   - minor_issues → info, low-severity divergences worth a glance.
 *   - needs_review → alert, material divergences to resolve or justify.
 *   - blocker      → octagon-alert, critical divergences; do not seal.
 *
 * Each divergence is a deep-linked bullet showing the two conflicting values
 * and a pointer to the source artifact (title + CTD section). Microcopy is
 * factual — calm, no cheerleading, no emoji. The strip is a live region so assistive
 * tech announces the verdict.
 *
 * 21 CFR Part 11 honesty contract: a verdict computed over `isSample` /
 * not_assessed content is advisory-only — never sealable/exportable — so the
 * panel renders a sample notice and suppresses the "Ask AnA to resolve" action.
 */
import { I } from './icons';
import type { ConsistencyResult, ConsistencyVerdict } from './useAnaChat';
import styles from './styles.module.css';

/**
 * Compose the targeted fix request AnA receives when the user clicks "Ask AnA
 * to resolve" on a dossier divergence — it cites the conflicting values and
 * their source artifacts so AnA can reconcile and re-run the sweep. Pure +
 * exported for testing.
 */
export function composeConsistencyFixMessage(
  title: string,
  consistency: ConsistencyResult,
): string {
  const parts: string[] = [
    `The document "${title}" diverges from the rest of the dossier (${consistencyVerdictLabel(consistency.verdict).toLowerCase()}).`,
  ];
  const shown = consistency.divergences.slice(0, 6);
  for (const d of shown) {
    const where = d.existingArtifact
      ? ` (in ${d.existingArtifact}${d.existingCtdSection ? `, ${d.existingCtdSection}` : ''})`
      : '';
    if (d.existingValue) {
      parts.push(
        `This draft states "${d.draftValue}" but the dossier states "${d.existingValue}"${where}.`,
      );
    } else {
      parts.push(`${d.description || `Unresolved reference "${d.draftValue}"`}${where}.`);
    }
  }
  parts.push(
    'Please reconcile these so the draft is consistent with the dossier — correct the draft or, if the difference is intentional, justify it explicitly — then re-run the consistency check.',
  );
  return parts.join(' ');
}

/** Headline label for each verdict tier. */
export function consistencyVerdictLabel(verdict: ConsistencyVerdict): string {
  switch (verdict) {
    case 'clean':
      return 'Consistent with your dossier';
    case 'minor_issues':
      return 'Minor inconsistencies';
    case 'needs_review':
      return 'Inconsistencies need review';
    case 'blocker':
      return 'Blocking inconsistencies';
  }
}

/** Stable data-status token for verdict-driven severity styling. */
function verdictStatus(verdict: ConsistencyVerdict): string {
  return verdict;
}

function VerdictIcon({ verdict }: { verdict: ConsistencyVerdict }) {
  switch (verdict) {
    case 'clean':
      return <I.shieldCheck size={14} />;
    case 'minor_issues':
      return <I.info size={14} />;
    case 'needs_review':
      return <I.alert size={14} />;
    case 'blocker':
      return <I.blocker size={14} />;
  }
}

/** Human label for a divergence kind, for the bullet's leading tag. */
function kindLabel(kind: string): string {
  switch (kind) {
    case 'numeric_divergence':
      return 'Value mismatch';
    case 'endpoint_drift':
      return 'Endpoint drift';
    case 'population_drift':
      return 'Population drift';
    case 'missing_cross_reference':
      return 'Missing reference';
    case 'orphan_section':
      return 'Orphan reference';
    default:
      return kind.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
  }
}

export interface ConsistencyPanelProps {
  consistency: ConsistencyResult;
  /**
   * When the dossier has unresolved divergences, offer a one-click action to
   * ask AnA to reconcile them and re-run the sweep. Omit to hide the action
   * (e.g. read-only history views). Suppressed automatically for sample drafts.
   */
  onResolve?: () => void;
}

export function ConsistencyPanel({ consistency, onResolve }: ConsistencyPanelProps) {
  const { verdict, divergences, artifactsCompared, divergenceCount, bySeverity, isSample } =
    consistency;
  const clean = verdict === 'clean';
  // The honesty contract: a verdict over sample / not_assessed content is
  // advisory-only and cannot drive a sealable action, so we never surface the
  // resolve affordance for it.
  const canResolve = !clean && !isSample && Boolean(onResolve);
  const highCount = bySeverity.critical + bySeverity.high;

  return (
    <div
      className={styles.consistencyPanel}
      data-status={verdictStatus(verdict)}
      role="status"
      aria-live="polite"
    >
      <div className={styles.consistencyHead}>
        <span className={styles.ico} aria-hidden="true">
          <VerdictIcon verdict={verdict} />
        </span>
        <span className={styles.consistencyTitle}>{consistencyVerdictLabel(verdict)}</span>
        <span className={styles.consistencyScope} aria-hidden="true">
          <I.scan size={11} />
        </span>
      </div>

      <p className={styles.consistencyDetail}>
        {clean ? (
          <span>
            No conflicting values found across {artifactsCompared}{' '}
            {artifactsCompared === 1 ? 'artifact' : 'artifacts'} in this dossier.
          </span>
        ) : (
          <span>
            {divergenceCount} {divergenceCount === 1 ? 'divergence' : 'divergences'} vs.{' '}
            {artifactsCompared} {artifactsCompared === 1 ? 'artifact' : 'artifacts'}
            {highCount > 0 ? `, ${highCount} high-severity` : ''}.
          </span>
        )}
      </p>

      {isSample && (
        <p className={styles.consistencySample} role="note">
          Sample content — this verdict is advisory only and cannot be sealed or exported.
        </p>
      )}

      {divergences.length > 0 && (
        <ul className={styles.consistencyList} aria-label="Dossier divergences">
          {divergences.map((d, i) => (
            <li key={i} className={styles.consistencyItem} data-severity={d.severity}>
              <span className={styles.ico} aria-hidden="true">
                {d.severity === 'critical' ? (
                  <I.blocker size={11} />
                ) : d.severity === 'high' ? (
                  <I.alert size={11} />
                ) : (
                  <I.info size={11} />
                )}
              </span>
              <span className={styles.consistencyItemBody}>
                <span className={styles.consistencyKind}>{kindLabel(d.kind)}</span>
                {d.description && (
                  <span className={styles.consistencyDesc}>{d.description}</span>
                )}
                {d.existingValue ? (
                  <span className={styles.consistencyValues}>
                    This draft: <code className={styles.consistencyVal}>{d.draftValue}</code>
                    {' · '}Dossier: <code className={styles.consistencyVal}>{d.existingValue}</code>
                  </span>
                ) : (
                  d.draftValue && (
                    <span className={styles.consistencyValues}>
                      This draft: <code className={styles.consistencyVal}>{d.draftValue}</code>
                    </span>
                  )
                )}
                {(d.existingArtifact || d.existingCtdSection) && (
                  <span className={styles.consistencySource}>
                    Source: {d.existingArtifact || 'dossier artifact'}
                    {d.existingCtdSection ? ` · ${d.existingCtdSection}` : ''}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canResolve && (
        <button type="button" className={styles.consistencyResolve} onClick={onResolve}>
          <I.sparkles size={12} />
          <span>Ask AnA to resolve</span>
        </button>
      )}
    </div>
  );
}
