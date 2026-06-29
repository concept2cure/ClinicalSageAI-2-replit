/**
 * LabelingAuthoringPane — the build-from-template labeling authoring surface
 * (roadmap E9). Flag-gated by ENABLE_ANA_DOCUMENT_STUDIO upstream.
 *
 * It drives the already-built tool chain for a labeling team:
 *
 *   build_from_template  (scaffold the correctly-sectioned PLR/QRD draft,
 *                         guided by advise_labeling_structure)
 *     → review_label_currency  (DETERMINISTIC currency gate, LabelCurrencyPanel)
 *     → verify_docx_against_source  (required_strings = the mandatory PLR/QRD
 *                                    section headers for the selected mode)
 *
 * The pane owns no tool I/O — it is a pure view over a mode toggle, the section
 * guard, the deterministic currency verdict, and the verification result the
 * host produced. A US (USPI/PLR) ↔ EU (SmPC/QRD) toggle re-derives the section
 * guard and the required_strings.
 *
 * 21 CFR Part 11 honesty contract: a draft built on sample/fixture data is
 * watermarked and CANNOT be sealed or exported. The currency verdict is the
 * server's deterministic finding set — never an AI guess.
 */
import { useMemo, useRef, type KeyboardEvent } from 'react';
import { I } from './icons';
import { VerificationPanel } from './VerificationPanel';
import { LabelCurrencyPanel } from './LabelCurrencyPanel';
import type { VerificationResult } from './useAnaChat';
import {
  LABELING_MODES,
  checkSectionGuard,
  deriveRequiredStrings,
  type LabelingMode,
  type LabelCurrencyVerdict,
} from './labelingModes';
import styles from './styles.module.css';

export interface LabelingDraft {
  title: string;
  content: string;
  /**
   * Provenance of the draft's data. 'sample' ⇒ built on fixtures: the honesty
   * contract forbids sealing/exporting it. 'live' ⇒ joined to live label data.
   */
  dataSource: 'sample' | 'live';
}

export interface LabelingAuthoringPaneProps {
  mode: LabelingMode;
  onModeChange: (mode: LabelingMode) => void;
  draft: LabelingDraft;
  /** The deterministic currency verdict from review_label_currency, if run. */
  currencyVerdict?: LabelCurrencyVerdict;
  /** The verify_docx_against_source result for the draft, if run. */
  verification?: VerificationResult;
  /** Seal/export the authored label. Disabled for sample drafts (honesty). */
  onExport?: (draft: LabelingDraft) => void;
  /** Ask AnA to resolve a failed verification. */
  onResolveVerification?: () => void;
}

export function LabelingAuthoringPane({
  mode,
  onModeChange,
  draft,
  currencyVerdict,
  verification,
  onExport,
  onResolveVerification,
}: LabelingAuthoringPaneProps) {
  const spec = LABELING_MODES[mode];
  const guard = useMemo(() => checkSectionGuard(mode, draft.content), [mode, draft.content]);
  const requiredStrings = useMemo(() => deriveRequiredStrings(mode), [mode]);

  const MODES: LabelingMode[] = ['us', 'eu'];
  const radioRefs = useRef<Record<LabelingMode, HTMLButtonElement | null>>({ us: null, eu: null });

  // radiogroup keyboard model: arrow keys move selection (and focus) between the
  // two structures; the checked radio is the only tab stop (roving tabindex).
  const onRadioKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowUp') {
      return;
    }
    e.preventDefault();
    const idx = MODES.indexOf(mode);
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const next = MODES[(idx + delta + MODES.length) % MODES.length];
    if (next !== mode) onModeChange(next);
    radioRefs.current[next]?.focus();
  };

  const isSample = draft.dataSource === 'sample';
  // Honesty contract: a sample draft is never sealable/exportable, regardless of
  // currency/verify state. Live drafts may export only once current + verified.
  const currencyClear = currencyVerdict ? currencyVerdict.findings.length === 0 : false;
  const verifyClear = verification ? verification.ok : false;
  const canExport = !isSample && currencyClear && verifyClear;

  return (
    <aside className={styles.labelingPane} aria-label="Labeling authoring">
      <header className={styles.labelingHeader}>
        <div className={styles.labelingTitleWrap}>
          <span className={styles.ico} aria-hidden="true">
            <I.file size={14} />
          </span>
          <span className={styles.studioTitle} title={draft.title}>
            {draft.title}
          </span>
          <span className={styles.studioFormat}>· {spec.structure}</span>
        </div>

        {/* US (USPI/PLR) ↔ EU (SmPC/QRD) mode toggle. */}
        <div
          className={styles.labelingToggle}
          role="radiogroup"
          aria-label="Labeling structure"
        >
          {MODES.map((m) => (
            <button
              key={m}
              ref={(el) => {
                radioRefs.current[m] = el;
              }}
              type="button"
              role="radio"
              aria-checked={mode === m}
              title={LABELING_MODES[m].label}
              tabIndex={mode === m ? 0 : -1}
              className={styles.labelingToggleBtn}
              data-active={mode === m ? 'true' : 'false'}
              onClick={() => onModeChange(m)}
              onKeyDown={onRadioKeyDown}
            >
              {LABELING_MODES[m].short}
            </button>
          ))}
        </div>
      </header>

      <p className={styles.labelingBasis}>
        {spec.label} — {spec.basis}
      </p>

      {isSample && (
        <p className={styles.labelingSample} role="note">
          Sample data — this draft is built on fixtures and cannot be sealed or exported.
        </p>
      )}

      {/* Section guard — the mandatory PLR/QRD section checklist. */}
      <section className={styles.labelingGuard} aria-label="Section completeness">
        <div className={styles.labelingGuardHead}>
          <span className={styles.verifyTitle}>
            {spec.structure} sections — {guard.items.filter((i) => i.present).length} of{' '}
            {guard.items.length} present
          </span>
          <span
            className={styles.labelingGuardBadge}
            data-complete={guard.complete ? 'true' : 'false'}
          >
            {guard.complete ? 'Complete' : `${guard.missing.length} missing`}
          </span>
        </div>
        <ul className={styles.labelingChecklist} aria-label="Required sections">
          {guard.items.map((item) => (
            <li key={item.number} data-present={item.present ? 'true' : 'false'}>
              <span className={styles.ico} aria-hidden="true">
                {item.present ? <I.check size={12} /> : <I.alert size={12} />}
              </span>
              <span className={styles.labelingChecklistText}>{item.header}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Deterministic currency gate. */}
      {currencyVerdict && (
        <div className={styles.labelingGate}>
          <LabelCurrencyPanel verdict={currencyVerdict} />
        </div>
      )}

      {/* Source verification (required_strings = mandatory section headers). */}
      {verification && (
        <div className={styles.labelingGate}>
          <VerificationPanel verification={verification} onResolve={onResolveVerification} />
        </div>
      )}

      <footer className={styles.labelingFooter}>
        <span className={styles.labelingReqCount}>
          {requiredStrings.length} required section header{requiredStrings.length === 1 ? '' : 's'} checked
        </span>
        <button
          type="button"
          className={styles.labelingExport}
          onClick={() => canExport && onExport?.(draft)}
          disabled={!canExport}
          title={
            isSample
              ? 'Sample drafts cannot be exported'
              : !currencyClear
                ? 'Label currency is not clear'
                : !verifyClear
                  ? 'Draft is not verified against source'
                  : 'Seal and export the authored label'
          }
        >
          <I.share size={13} />
          <span>Seal &amp; export</span>
        </button>
      </footer>
    </aside>
  );
}
