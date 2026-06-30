/**
 * PerAuthoringPanel — E3: the flag-gated IVDR PER authoring affordance inside
 * AnA's Document Studio.
 *
 * It renders the join between the recorded performance studies and the
 * author → verify loop:
 *   - the Annex XIII section skeleton (the three pillars + benefit–risk),
 *   - the figures that will be enforced verbatim in the narrative (the derived
 *     verify_docx_against_source required_strings, with their source trace), and
 *   - the 21 CFR Part 11 / IVDR honesty verdict — whether the PER may be sealed
 *     / exported, with factual blockers when it may not.
 *
 * The "Author PER and verify" action is disabled whenever the PER is not
 * exportable (sample data, a not-assessed pillar, or a fabricated figure), so a
 * PER can never reach download without provably reproducing the recorded data.
 *
 * Gated by ENABLE_ANA_DOCUMENT_STUDIO upstream (the host only mounts this when
 * the flag is on). No emoji; calm ~200ms motion via the shared styles; the
 * verdict is a polite live region for assistive tech.
 */
import { useMemo } from 'react';
import { I } from './icons';
import {
  buildPerAuthoringPlan,
  type PerStudyBundle,
} from './perAuthoring';
import styles from './styles.module.css';

export interface PerAuthoringPanelProps {
  bundle: PerStudyBundle;
  /**
   * Author the PER: build the DOCX from the template with the recorded numbers
   * injected, then verify it against the derived required_strings. The host
   * wires this to the build_from_template → verify_docx_against_source tool
   * sequence. Disabled when the PER is not exportable.
   */
  onAuthorAndVerify?: (plan: ReturnType<typeof buildPerAuthoringPlan>) => void;
  /** True while an author/verify request is in flight. */
  authoring?: boolean;
}

export function PerAuthoringPanel({ bundle, onAuthorAndVerify, authoring }: PerAuthoringPanelProps) {
  const plan = useMemo(() => buildPerAuthoringPlan(bundle), [bundle]);
  const { sections, requiredStrings, exportability } = plan;
  const blocked = !exportability.exportable;
  const canAuthor = !blocked && !authoring && !!onAuthorAndVerify;
  // Disabled-with-reason: every reason the action is unavailable is stated in
  // text (button title + the blockers list), never a silent or color-only gate.
  const disabledReason = blocked
    ? 'This PER cannot be authored yet — resolve the blockers below.'
    : !onAuthorAndVerify
      ? 'Authoring is unavailable in this context.'
      : authoring
        ? 'Authoring is in progress.'
        : undefined;

  return (
    <section className={styles.perPanel} aria-label="IVDR PER authoring">
      <header className={styles.perHead}>
        <span className={styles.ico} aria-hidden="true">
          <I.file size={14} />
        </span>
        <span className={styles.perTitle}>
          Performance Evaluation Report · {bundle.per.device_name} · {bundle.per.per_version}
        </span>
      </header>

      <p className={styles.perIntro}>
        AnA assembles the Annex XIII sections from the recorded performance studies and enforces every
        figure verbatim, so the narrative provably reproduces the recorded data.
      </p>

      <h3 className={styles.perSubhead}>Annex XIII sections</h3>
      <ol className={styles.perSections} aria-label="PER section skeleton">
        {sections.map(s => (
          <li key={s.key}>
            <span className={styles.perSectionHeading}>{s.heading}</span>
          </li>
        ))}
      </ol>

      <h3 className={styles.perSubhead}>
        Enforced figures ({requiredStrings.length})
      </h3>
      {requiredStrings.length === 0 ? (
        <p className={styles.perEmpty}>
          No performance figures are recorded yet. Record analytical and clinical studies before authoring.
        </p>
      ) : (
        <ul className={styles.perFigures} aria-label="Recorded figures enforced verbatim">
          {requiredStrings.map((r, i) => (
            <li key={i}>
              <span className={styles.perFigureValue}>{r.value}</span>
              <span className={styles.perFigureSource}>{r.source}</span>
            </li>
          ))}
        </ul>
      )}

      <div
        className={styles.perVerdict}
        data-status={blocked ? 'blocked' : 'ready'}
        role="status"
        aria-live="polite"
      >
        <span className={styles.ico} aria-hidden="true">
          {blocked ? <I.alert size={13} /> : <I.shieldCheck size={13} />}
        </span>
        <span className={styles.perVerdictText}>
          {blocked
            ? 'Not sealable or exportable yet.'
            : 'Ready to author and verify — all three Annex XIII pillars are recorded.'}
        </span>
      </div>

      {blocked && (
        <ul id="per-blockers" className={styles.perBlockers} aria-label="Reasons this PER cannot be sealed or exported">
          {exportability.blockers.map((b, i) => (
            <li key={i}>
              <span className={styles.ico} aria-hidden="true">
                <I.alert size={11} />
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className={styles.perAuthorBtn}
        onClick={() => canAuthor && onAuthorAndVerify?.(plan)}
        disabled={!canAuthor}
        title={disabledReason ?? 'Author the PER and verify it against the recorded figures'}
        aria-describedby={blocked ? 'per-blockers' : undefined}
      >
        <span className={styles.ico} aria-hidden="true">
          <I.sparkles size={13} />
        </span>
        <span>{authoring ? 'Authoring' : 'Author PER and verify'}</span>
      </button>
    </section>
  );
}
