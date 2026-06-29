/**
 * SEComparisonTable — E6 client surface. Renders the 510(k) Substantial
 * Equivalence side-by-side comparison table from an analyzed SE matrix, so the
 * reviewer sees the SAME predicate facts + equivalence verdicts that drive the
 * authored .docx and its verification.
 *
 * Honesty contract (21 CFR Part 11): a `sample` / `not_assessed` matrix is
 * shown with a visible preview-only label and is NOT sealable/exportable — the
 * Download/Seal affordance is suppressed. No verdict is shown that the matrix
 * did not record; the renderer is a pure projection of the matrix rows.
 *
 * Gated upstream by ENABLE_ANA_DOCUMENT_STUDIO. Accessible (semantic <table>,
 * scope'd headers, per-cell status text — colour is never the only signal).
 */
import { I } from './icons';
import styles from './styles.module.css';

/** Mirrors shared EquivalenceStatus (predicate-intelligence types). */
export type SEEquivalenceStatus =
  | 'EQUIVALENT'
  | 'DISCUSSION_REQUIRED'
  | 'NOT_EQUIVALENT'
  | 'TOXIC'
  | 'PENDING';

/**
 * Reviewer-grade verdict labels — kept identical to the server builder's
 * EQUIVALENCE_VERDICT_LABEL so the preview and the authored document agree
 * verbatim (and so the verify required_strings match what the user sees).
 */
export const SE_VERDICT_LABEL: Record<SEEquivalenceStatus, string> = {
  EQUIVALENT: 'Equivalent',
  DISCUSSION_REQUIRED: 'Discussion required',
  NOT_EQUIVALENT: 'Not equivalent',
  TOXIC: 'Predicate safety signal',
  PENDING: 'Pending assessment',
};

/** Tone for the verdict pill — colour is paired with the text label, never alone. */
function verdictTone(status: SEEquivalenceStatus): 'ok' | 'warn' | 'open' {
  if (status === 'EQUIVALENT') return 'ok';
  if (status === 'DISCUSSION_REQUIRED') return 'warn';
  return 'open';
}

export interface SEComparisonRow {
  characteristic: string;
  subjectValue: string;
  predicateValue: string;
  status: SEEquivalenceStatus;
  /** Optional matrix discussion note, surfaced under the characteristic. */
  note?: string;
}

export interface SEComparisonTableProps {
  subjectDeviceName: string;
  predicateDeviceName: string;
  predicateKNumber: string;
  rows: SEComparisonRow[];
  /**
   * Provenance of the matrix. 'analyzed' is sealable/exportable; 'sample' and
   * 'not_assessed' are preview-only and suppress any seal/export affordance.
   */
  provenance: 'analyzed' | 'sample' | 'not_assessed';
}

export function SEComparisonTable({
  subjectDeviceName,
  predicateDeviceName,
  predicateKNumber,
  rows,
  provenance,
}: SEComparisonTableProps) {
  const exportable = provenance === 'analyzed';
  const provenanceNote =
    provenance === 'sample'
      ? 'Sample matrix — preview only. This comparison cannot be sealed or exported.'
      : provenance === 'not_assessed'
        ? 'Matrix not assessed — preview only. This comparison cannot be sealed or exported.'
        : null;

  return (
    <section className={styles.seTableWrap} aria-label="Substantial equivalence comparison">
      <header className={styles.seTableHead}>
        <span className={styles.ico} aria-hidden="true">
          <I.file size={14} />
        </span>
        <h3 className={styles.seTableTitle}>
          Substantial Equivalence — {subjectDeviceName} vs {predicateKNumber}
        </h3>
      </header>

      {provenanceNote && (
        <p className={styles.seProvenance} role="note" data-provenance={provenance}>
          <span className={styles.ico} aria-hidden="true">
            <I.alert size={12} />
          </span>
          <span>{provenanceNote}</span>
        </p>
      )}

      <div className={styles.seTableScroll}>
        <table className={styles.seTable}>
          <caption className={styles.srOnly}>
            Side-by-side comparison of {subjectDeviceName} against predicate{' '}
            {predicateDeviceName} ({predicateKNumber}). Each row shows the matrix's
            equivalence verdict.
          </caption>
          <thead>
            <tr>
              <th scope="col">Characteristic</th>
              <th scope="col">{subjectDeviceName}</th>
              <th scope="col">{predicateDeviceName}</th>
              <th scope="col">Equivalence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <th scope="row" className={styles.seCharCell}>
                  {r.characteristic}
                  {r.note && <span className={styles.seNote}>{r.note}</span>}
                </th>
                <td>{r.subjectValue}</td>
                <td>{r.predicateValue}</td>
                <td>
                  <span className={styles.seVerdict} data-tone={verdictTone(r.status)}>
                    {SE_VERDICT_LABEL[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {exportable ? (
        <p className={styles.seExportNote}>
          This comparison reflects the analyzed matrix and may be sealed or exported.
        </p>
      ) : null}
    </section>
  );
}
