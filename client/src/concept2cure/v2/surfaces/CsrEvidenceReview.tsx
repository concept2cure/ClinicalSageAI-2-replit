import * as React from 'react';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { capturedActorHeaders } from '@/utils/authToken';
import type { RetainedScientificRun, ScientificReviewSubmission } from '@shared/authoring/csr-scientific-review';
import type { AuthoringReviewContext } from '@shared/authoring/peer-review';
import {
  buildSubmission, claimableCells, figureOccurrences, mapGaps,
  type CellRef, type FigureOccurrence, type ReviewerMap, type SavedSection,
} from './csrEvidenceMap';
import type { PeerReviewScope } from './authoringPeerReview';

/**
 * The CSR scientific-review step inside a review decision (csrEvidenceMap.ts
 * for what it does and does not decide). The reviewer picks the retained run,
 * sees each figure in the saved text beside the table cells it could be,
 * confirms each, says how each section was checked, and attests coverage. The
 * map goes with the approval; the server verifies every cell and span.
 */
export interface CsrEvidenceReviewProps {
  scope: PeerReviewScope;
  programId: string | null;
  context: AuthoringReviewContext;
  disabled: boolean;
  onChange: (submission: ScientificReviewSubmission | null) => void;
}

interface SavedRun { runId: string; status: string; startedAt: string }
interface Preview { runs: RetainedScientificRun[]; tablesSha256: string; snapshotHash: string }

const NO_RESULTS = 'This section reports no quantitative results.';
const cellLabel = (c: CellRef) =>
  `${c.tableTitle} — ${c.rowLabel ? `${c.rowLabel}, ` : ''}${c.header}: ${c.value}${c.studyId ? ` (study ${c.studyId})` : ''}`;
const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');

async function readJson(method: 'GET' | 'POST', path: string, scope: PeerReviewScope, body?: unknown): Promise<unknown> {
  const response = await apiRequest(method, path, body, capturedActorHeaders(scope));
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(serverMessage(json) ?? 'The retained tables could not be read.');
  return json;
}

/** The program's saved runs: only a run with retained clinical source tables can be read for review. */
function useSavedRuns(scope: PeerReviewScope, programId: string | null) {
  const [runs, setRuns] = React.useState<SavedRun[] | null>(null);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    if (!programId) { setError('This document is not filed under a program, so no retained analysis run can be selected.'); return; }
    let live = true;
    readJson('GET', `/api/submission-orchestrator/runs?programId=${encodeURIComponent(programId)}`, scope)
      .then((body) => { if (live) setRuns(Array.isArray((body as { runs?: unknown })?.runs) ? (body as { runs: SavedRun[] }).runs : []); })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'The saved runs could not be read.'); });
    return () => { live = false; };
  }, [programId, scope]);
  return { runs, error };
}

/** A figure with exactly one possible cell is proposed; the reviewer can change it. Several stay undecided. */
function proposedChoices(sections: readonly SavedSection[], runs: readonly RetainedScientificRun[]) {
  const proposed = new Map<string, CellRef | null>();
  for (const s of sections) for (const o of figureOccurrences(s, claimableCells(runs))) {
    if (o.candidates.length === 1) proposed.set(o.key, o.candidates[0]);
  }
  return proposed;
}

function useEvidenceMap(props: CsrEvidenceReviewProps) {
  const { scope, context, onChange } = props;
  const [selected, setSelected] = React.useState<string[]>([]);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [previewError, setPreviewError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [choices, setChoices] = React.useState<Map<string, CellRef | null>>(new Map());
  const [rationale, setRationale] = React.useState<Map<string, string>>(new Map());
  const [mapped, setMapped] = React.useState(false);
  const [methods, setMethods] = React.useState(false);
  const sections: SavedSection[] = context.snapshot.sections;
  const cells = React.useMemo(() => (preview ? claimableCells(preview.runs) : []), [preview]);
  const occurrences = React.useMemo(() => sections.flatMap((s) => figureOccurrences(s, cells)), [sections, cells]);
  const map: ReviewerMap = { runIds: preview ? selected : [], tablesSha256: preview?.tablesSha256 ?? '', sections, choices, rationale,
    allQuantitativeResultsMapped: mapped, populationsMethodsUnitsReviewed: methods };
  const gaps = preview ? mapGaps(map, occurrences) : [];

  // The submission exists only while the map is complete; otherwise nothing goes with the approval.
  const signature = JSON.stringify([selected, preview?.tablesSha256, [...choices], [...rationale], mapped, methods]);
  React.useEffect(() => {
    if (!preview || gaps.length) { onChange(null); return; }
    let live = true;
    buildSubmission(map, occurrences).then((s) => { if (live) onChange(s); }, () => { if (live) onChange(null); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map's content is captured in `signature`
  }, [signature]);

  const loadPreview = async () => {
    setLoading(true); setPreviewError(''); setPreview(null); setChoices(new Map());
    try {
      const body = await readJson('POST', `/api/authoring/documents/${encodeURIComponent(scope.documentId)}/csr-evidence/preview`, scope, { runIds: selected });
      const p = (body as { preview?: Preview }).preview;
      if (!p || p.snapshotHash !== context.snapshotHash) {
        throw new Error('The saved document changed since this review was opened. Reload the review record.');
      }
      setPreview(p);
      setChoices(proposedChoices(sections, p.runs));
    } catch (e: unknown) {
      setPreviewError(e instanceof Error ? e.message : 'The retained tables could not be read.');
    } finally { setLoading(false); }
  };
  const choose = (o: FigureOccurrence, value: string) => setChoices((prev) => {
    const next = new Map(prev);
    if (value === '') next.delete(o.key); else next.set(o.key, value === 'none' ? null : o.candidates[Number(value)]);
    return next;
  });
  const say = (sectionId: string, text: string) => setRationale((prev) => new Map(prev).set(sectionId, text));
  return { selected, setSelected, preview, previewError, loading, loadPreview, sections, occurrences, choices, choose,
    rationale, say, mapped, setMapped, methods, setMethods, gaps };
}
type EvidenceMap = ReturnType<typeof useEvidenceMap>;

function RunPicker({ m, runs, runError, disabled }: { m: EvidenceMap; runs: SavedRun[] | null; runError: string; disabled: boolean }) {
  const toggle = (runId: string, on: boolean) => m.setSelected((prev) => on ? [...prev, runId].slice(0, 10) : prev.filter((id) => id !== runId));
  return <fieldset disabled={disabled || m.loading}>
    <legend>1. The retained analysis run</legend>
    {runError && <p className="esign-err" role="alert">{runError}</p>}
    {!runError && runs === null && <p role="status">Reading the saved runs for this program…</p>}
    {runs?.length === 0 && <p role="status">This program has no saved package run. Start one from eCTD compile with the approved clinical source tables, then return here.</p>}
    {runs?.map((r) => <label key={r.runId} className="rv-csr-run">
      <input type="checkbox" checked={m.selected.includes(r.runId)} onChange={(e) => toggle(r.runId, e.target.checked)} />
      Run {r.runId.slice(0, 8)} · {r.status} · started {new Date(r.startedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
    </label>)}
    <button type="button" className="btn ghost" disabled={!m.selected.length} onClick={() => { void m.loadPreview(); }}>
      {m.loading ? 'Reading the retained tables…' : 'Read the retained tables'}
    </button>
    {m.previewError && <p className="esign-err" role="alert">{m.previewError}</p>}
  </fieldset>;
}

function FigureChoice({ m, o, content }: { m: EvidenceMap; o: FigureOccurrence; content: string }) {
  const chosen = m.choices.get(o.key);
  const current = !m.choices.has(o.key) ? '' : chosen === null ? 'none' : String(o.candidates.indexOf(chosen as CellRef));
  return <div className="esign-field">
    <label htmlFor={`fig-${o.key}`}>“…{plain(content.slice(Math.max(0, o.start - 60), o.start))}<mark>{o.display}</mark>{plain(content.slice(o.end, o.end + 60))}…”</label>
    <select id={`fig-${o.key}`} value={current} onChange={(e) => m.choose(o, e.target.value)}>
      <option value="">Not decided — choose</option>
      {o.candidates.map((c, i) => <option key={i} value={String(i)}>{cellLabel(c)}</option>)}
      <option value="none">Not a result from these tables</option>
    </select>
  </div>;
}

function SectionStatement({ m, s, anyMapped }: { m: EvidenceMap; s: SavedSection; anyMapped: boolean }) {
  if (!anyMapped) {
    return <div className="esign-field"><label>
      <input type="checkbox" checked={m.rationale.get(s.id) === NO_RESULTS} onChange={(e) => m.say(s.id, e.target.checked ? NO_RESULTS : '')} /> {NO_RESULTS}
    </label></div>;
  }
  return <div className="esign-field">
    <label htmlFor={`why-${s.id}`}>How you checked this section (required)</label>
    <textarea id={`why-${s.id}`} rows={2} maxLength={4000} value={m.rationale.get(s.id) ?? ''} onChange={(e) => m.say(s.id, e.target.value)}
      placeholder="For example: each figure compared with the retained table; population and units agree" />
  </div>;
}

function SectionFigures({ m, s }: { m: EvidenceMap; s: SavedSection }) {
  const mine = m.occurrences.filter((o) => o.sectionId === s.id);
  const content = s.content ?? '';
  return <section className="rv-csr-section">
    <h4>{s.code}{s.title ? ` · ${s.title}` : ''}</h4>
    {!content.trim() && <p className="esign-err">No saved text. A CSR is approved only when every section is written.</p>}
    {mine.map((o) => <FigureChoice key={o.key} m={m} o={o} content={content} />)}
    {content.trim() && <SectionStatement m={m} s={s} anyMapped={mine.some((o) => m.choices.get(o.key))} />}
  </section>;
}

function Attestation({ m, disabled }: { m: EvidenceMap; disabled: boolean }) {
  return <fieldset disabled={disabled}>
    <legend>3. Your attestation</legend>
    <label><input type="checkbox" checked={m.mapped} onChange={(e) => m.setMapped(e.target.checked)} /> Every quantitative result in the saved text is mapped to the retained table cell it reports.</label>
    <label><input type="checkbox" checked={m.methods} onChange={(e) => m.setMethods(e.target.checked)} /> I reviewed the analysis populations, methods and units these results are reported under.</label>
    {m.gaps.length > 0 && <ul className="rv-csr-gaps" aria-label="What still stops approval">{m.gaps.map((g) => <li key={g}>{g}</li>)}</ul>}
    {m.gaps.length === 0 && <p role="status">The review map is complete. It goes with your approval and is checked by the server before anything is recorded.</p>}
  </fieldset>;
}

export function CsrEvidenceReview(props: CsrEvidenceReviewProps) {
  const { runs, error: runError } = useSavedRuns(props.scope, props.programId);
  const m = useEvidenceMap(props);
  return <section className="rv-csr-evidence" aria-label="CSR scientific review">
    <h3>CSR scientific review</h3>
    <p>This document is a clinical study report. Before you approve it, map each result it reports to the exact cell of the retained clinical table it comes from. The server checks every mapping against the saved text and the retained tables; it does not judge clinical meaning, which is yours to attest.</p>
    <RunPicker m={m} runs={runs} runError={runError} disabled={props.disabled} />
    {m.preview && <fieldset disabled={props.disabled}>
      <legend>2. Each figure in the saved text</legend>
      {m.occurrences.length === 0 && <p role="status">No figure in the saved text matches a retained table cell exactly. If the document reports results, check that they are written as the tables give them.</p>}
      {m.sections.map((s) => <SectionFigures key={s.id} m={m} s={s} />)}
    </fieldset>}
    {m.preview && <Attestation m={m} disabled={props.disabled} />}
  </section>;
}
