/**
 * SafetyNarrativeAffordance — the guided ICH E3 §16 safety-narrative entry point
 * that lives in the AnA Composer (E5).
 *
 * Flag-gated by ENABLE_ANA_DOCUMENT_STUDIO. When enabled, the composer shows a
 * small "Safety narrative" chip; opening it reveals a calm form with two modes:
 *
 *   - Single:  the writer supplies the case facts for one subject. A live QC
 *              checklist of ICH E3 §16 required fields updates as they type, and
 *              the honesty contract is shown plainly (a sample-flagged or
 *              still-incomplete narrative is non-sealable). Submitting triggers
 *              the draft → author → verify chain through the normal stream path,
 *              pinning the three tools and supplying required_strings derived
 *              from the supplied facts.
 *
 *   - Batch:   the writer uploads / pastes a line listing (CSV / TSV / JSON of
 *              per-case fields). The parser (safetyNarrativeBatch) turns valid
 *              rows into cases and reports malformed rows. Submitting fans the
 *              chain out over the parsed set in one turn.
 *
 * This component only ORCHESTRATES the three already-built server tools — it
 * never reimplements them. It composes a structured chat message and pins the
 * tools, then hands both to the host (Composer → ChatView → Ana → useAnaChat).
 *
 * INTEGRATION: server-side batch fan-out across the SSE stream (so a single
 * upload yields N independently-verified narratives without one giant turn) is
 * not implemented here — that would require touching shared streaming code
 * (server/routes/ana-ri/stream.ts). This client slice composes ONE batch turn
 * and leaves the per-case streaming fan-out as a marked TODO below.
 *
 * BUILD-1 INTEGRATION: once Build 1 lands version persistence, each finished &
 * QC-clear narrative should persist as a version row (see marker in
 * handleSubmit). Persistence is intentionally NOT implemented here.
 */
import { useMemo, useRef, useState } from 'react';

import { I } from './icons';
import styles from './styles.module.css';
import { SafetyNarrativeQcPanel } from './SafetyNarrativeQcPanel';
import {
  SAFETY_NARRATIVE_TOOLS,
  computeNarrativeQc,
  composeSingleNarrativeMessage,
  composeBatchNarrativeMessage,
  parseLineListing,
  type SafetyNarrativeCase,
  type LineListingParseResult,
} from './safetyNarrativeBatch';

export interface SafetyNarrativeSubmit {
  /** The composed chat message to send through the normal stream path. */
  message: string;
  /** The tools to pin for the turn (additive focus). */
  tools: string[];
  /** The case(s) this turn drafts — for the caller's BUILD-1 persistence hook. */
  cases: SafetyNarrativeCase[];
}

export interface SafetyNarrativeAffordanceProps {
  /**
   * Fired when the writer submits a single case or a batch. The host wires this
   * to pin the tools and send the composed message via the existing chat path.
   */
  onSubmit: (payload: SafetyNarrativeSubmit) => void;
  /** Disable submission while a turn is already streaming. */
  disabled?: boolean;
}

type Mode = 'single' | 'batch';

/** Parse the comma/semicolon-separated free-text list inputs into arrays. */
const toList = (v: string): string[] =>
  v
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);

export function SafetyNarrativeAffordance({ onSubmit, disabled }: SafetyNarrativeAffordanceProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('single');
  const [isSample, setIsSample] = useState(false);

  // Single-case fields.
  const [subjectId, setSubjectId] = useState('');
  const [studyId, setStudyId] = useState('');
  const [studyDrug, setStudyDrug] = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');
  const [term, setTerm] = useState('');
  const [severity, setSeverity] = useState('');
  const [seriousness, setSeriousness] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [outcome, setOutcome] = useState('');
  const [causality, setCausality] = useState('');

  // Batch text + parse result.
  const [listingText, setListingText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const singleCase = useMemo<SafetyNarrativeCase>(
    () => ({
      subjectId: subjectId.trim(),
      studyId: studyId.trim() || undefined,
      studyDrug: studyDrug.trim() || undefined,
      medicalHistory: medicalHistory.trim() ? toList(medicalHistory) : undefined,
      event: {
        term: term.trim(),
        severity: severity.trim() || undefined,
        seriousnessCriteria: seriousness.trim() ? toList(seriousness) : undefined,
        actionTaken: actionTaken.trim() || undefined,
        outcome: outcome.trim() || undefined,
        causality: causality.trim() || undefined,
      },
      isSample: isSample || undefined,
    }),
    [subjectId, studyId, studyDrug, medicalHistory, term, severity, seriousness, actionTaken, outcome, causality, isSample],
  );

  const singleQc = useMemo(() => computeNarrativeQc(singleCase), [singleCase]);

  const batch: LineListingParseResult | null = useMemo(
    () => (listingText.trim() ? parseLineListing(listingText, { isSample }) : null),
    [listingText, isSample],
  );

  const canSubmitSingle = subjectId.trim().length > 0 && term.trim().length > 0;
  const canSubmitBatch = (batch?.cases.length ?? 0) > 0;
  const canSubmit = !disabled && (mode === 'single' ? canSubmitSingle : canSubmitBatch);

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    const text = await file.text();
    setListingText(text);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (mode === 'single') {
      onSubmit({
        message: composeSingleNarrativeMessage(singleCase),
        tools: [...SAFETY_NARRATIVE_TOOLS],
        cases: [singleCase],
      });
      // BUILD-1 INTEGRATION: when version persistence lands, persist this
      // finished narrative as a version row (status drawn from singleQc:
      // QC-clear + non-sample = sealable; otherwise a non-sealable draft).
    } else if (batch) {
      onSubmit({
        message: composeBatchNarrativeMessage(batch.cases),
        tools: [...SAFETY_NARRATIVE_TOOLS],
        cases: batch.cases,
      });
      // INTEGRATION: this sends ONE batch turn. Server-side per-case fan-out
      // across the SSE stream (N independently-verified narratives) requires
      // touching shared streaming code (server/routes/ana-ri/stream.ts) and is
      // deliberately deferred to keep this slice green-in-isolation.
      // BUILD-1 INTEGRATION: persist each QC-clear case as a version row here.
    }
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        className={styles.composerChip}
        onClick={() => setOpen(true)}
        title="Guided ICH E3 §16 safety narrative"
        aria-label="Open guided safety narrative"
        disabled={disabled}
      >
        <I.flask size={12} />
        Safety narrative
      </button>
    );
  }

  return (
    <div className={styles.narrativePanel} role="group" aria-label="Guided safety narrative">
      <div className={styles.narrativeHead}>
        <span className={styles.narrativeTitle}>
          <I.flask size={13} /> Guided safety narrative — ICH E3 §16
        </span>
        <button
          type="button"
          className={styles.composerIcon}
          onClick={() => setOpen(false)}
          aria-label="Close guided safety narrative"
        >
          <I.close size={14} />
        </button>
      </div>

      <div className={styles.narrativeModes} role="tablist" aria-label="Narrative mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'single'}
          className={styles.narrativeMode}
          data-active={mode === 'single' ? 'true' : 'false'}
          onClick={() => setMode('single')}
        >
          Single case
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'batch'}
          className={styles.narrativeMode}
          data-active={mode === 'batch' ? 'true' : 'false'}
          onClick={() => setMode('batch')}
        >
          Batch (line listing)
        </button>
      </div>

      {mode === 'single' ? (
        <div className={styles.narrativeForm}>
          <Field label="Subject id" required value={subjectId} onChange={setSubjectId} />
          <Field label="Study id" value={studyId} onChange={setStudyId} />
          <Field label="Study drug" value={studyDrug} onChange={setStudyDrug} />
          <Field label="Relevant medical history (; separated)" value={medicalHistory} onChange={setMedicalHistory} />
          <Field label="Event term" required value={term} onChange={setTerm} />
          <Field label="Severity / grade" value={severity} onChange={setSeverity} />
          <Field label="Seriousness criteria (; separated)" value={seriousness} onChange={setSeriousness} />
          <Field label="Action taken with study drug" value={actionTaken} onChange={setActionTaken} />
          <Field label="Outcome" value={outcome} onChange={setOutcome} />
          <Field label="Investigator causality" value={causality} onChange={setCausality} />
        </div>
      ) : (
        <div className={styles.narrativeForm}>
          <label className={styles.narrativeFieldLabel} htmlFor="sn-listing">
            Line listing (CSV / TSV / JSON)
          </label>
          <textarea
            id="sn-listing"
            className={styles.narrativeTextarea}
            value={listingText}
            onChange={(e) => setListingText(e.target.value)}
            placeholder="subject_id,study_drug,term,severity,outcome,causality&#10;S-001,DRUG-X,headache,moderate,recovered,possibly related"
            rows={4}
          />
          <div className={styles.narrativeFileRow}>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.json,.txt,text/csv,text/tab-separated-values,application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                void handleFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className={styles.composerChip}
              onClick={() => fileRef.current?.click()}
            >
              <I.attach size={12} /> Upload listing
            </button>
            {batch && (
              <span className={styles.narrativeParseMeta}>
                {batch.cases.length} case{batch.cases.length === 1 ? '' : 's'} parsed
                {batch.errors.length > 0 ? `, ${batch.errors.length} row(s) skipped` : ''} ({batch.format})
              </span>
            )}
          </div>
          {batch && batch.errors.length > 0 && (
            <ul className={styles.narrativeErrors} aria-label="Skipped rows">
              {batch.errors.map((e) => (
                <li key={e.rowNumber}>
                  <span className={styles.ico} aria-hidden="true">
                    <I.alert size={11} />
                  </span>
                  Row {e.rowNumber}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <label className={styles.narrativeSampleToggle}>
        <input type="checkbox" checked={isSample} onChange={(e) => setIsSample(e.target.checked)} />
        Sample data — narrative is illustrative and non-sealable
      </label>

      {mode === 'single' && (subjectId.trim() || term.trim()) && (
        <SafetyNarrativeQcPanel qc={singleQc} subjectId={subjectId.trim() || undefined} />
      )}

      <div className={styles.narrativeActions}>
        <button
          type="button"
          className={styles.narrativeSubmit}
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          <I.sparkles size={12} />
          {mode === 'single' ? 'Draft, author & verify' : `Author ${batch?.cases.length ?? 0} narratives`}
        </button>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}

function Field({ label, value, onChange, required }: FieldProps) {
  const id = `sn-${label.replace(/[^a-z]+/gi, '-').toLowerCase()}`;
  return (
    <div className={styles.narrativeField}>
      <label className={styles.narrativeFieldLabel} htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
        {required && <span className={styles.srOnly}> (required)</span>}
      </label>
      <input
        id={id}
        className={styles.narrativeInput}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
