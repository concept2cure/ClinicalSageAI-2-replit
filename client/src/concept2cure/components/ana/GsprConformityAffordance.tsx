/**
 * GsprConformityAffordance — E7: the flag-gated authoring affordance that drives
 * AnA to render the EU MDR Annex I GSPR conformity matrix and auto-verify it.
 *
 * It is a calm, reviewer-grade panel (no emoji, accessible, subtle motion via
 * the shared verify-panel styles) that:
 *
 *   - summarises the device's GSPR coverage (assessed vs. the 23 requirements);
 *   - offers "Author GSPR conformity matrix" which builds the authoring plan
 *     (matrix markdown + the required-clause strings) and hands it to the host
 *     so AnA runs `author_docx_native` then auto-runs `verify_docx_against_source`
 *     with `required_strings = deriveRequiredStrings()` — proving every clause
 *     row is present before download; and
 *   - HONESTY CONTRACT: when the matrix is a sample or has un-assessed clauses,
 *     the action is disabled and the reason is shown, so a sample / incomplete
 *     conformity table can never be sealed or exported.
 *
 * The component owns no chat or tool state — it is a pure view over the device's
 * GSPR input that emits an authoring plan. Gated behind ENABLE_ANA_DOCUMENT_STUDIO
 * by the caller (returns null when the flag is off).
 *
 * @module client/src/concept2cure/components/ana/GsprConformityAffordance
 */
import { isFeatureEnabled } from '@/flags/featureFlags';
import { I } from './icons';
import {
  buildGsprConformityAuthoringPlan,
  evaluateExportability,
  resolveMatrixRows,
  MDR_ANNEX_I_GSPR_COUNT,
  type GsprMatrixInput,
  type GsprConformityAuthoringPlan,
} from './gsprConformityMatrix';
import styles from './styles.module.css';

export interface GsprConformityAffordanceProps {
  /** The device's stored GSPR decisions (or fixture data). */
  input: GsprMatrixInput;
  /**
   * Called with the authoring plan when the user requests the matrix. The host
   * runs author_docx_native(title, matrixMarkdown) then auto-runs
   * verify_docx_against_source(required_strings = plan.requiredStrings).
   */
  onAuthor: (plan: GsprConformityAuthoringPlan) => void;
}

export function GsprConformityAffordance({ input, onAuthor }: GsprConformityAffordanceProps) {
  // Gate: the affordance lives inside Document Studio, off by default.
  if (!isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO')) return null;

  const resolved = resolveMatrixRows(input);
  const assessed = resolved.filter(r => r.row.applicability !== 'not_assessed').length;
  const block = evaluateExportability(input);

  const handleAuthor = () => {
    if (!block.exportable) return;
    onAuthor(buildGsprConformityAuthoringPlan(input));
  };

  return (
    <div
      className={styles.verifyPanel}
      data-status={block.exportable ? 'verified' : 'unverified'}
      role="group"
      aria-label="GSPR conformity matrix"
    >
      <div className={styles.verifyHead}>
        <span className={styles.ico} aria-hidden="true">
          {block.exportable ? <I.shieldCheck size={14} /> : <I.alert size={14} />}
        </span>
        <span className={styles.verifyTitle}>GSPR conformity matrix — EU MDR Annex I</span>
      </div>

      <p className={styles.verifyDetail}>
        {assessed} of {MDR_ANNEX_I_GSPR_COUNT} requirements assessed.
        {block.exportable
          ? ' Every clause row will be verified present before download.'
          : ` ${block.message}`}
      </p>

      {!block.exportable && block.reason === 'not_assessed' && block.clauseIds && (
        <ul className={styles.verifyMissing} aria-label="Requirements not yet assessed">
          {block.clauseIds.map(id => (
            <li key={id}>
              <span className={styles.ico} aria-hidden="true">
                <I.alert size={11} />
              </span>
              <span className={styles.verifyMissingText}>{id}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className={styles.verifyResolve}
        onClick={handleAuthor}
        disabled={!block.exportable}
        aria-disabled={!block.exportable}
      >
        <I.file size={12} />
        <span>Author GSPR conformity matrix</span>
      </button>
    </div>
  );
}
