/**
 * LiteratureTab — the CER workbench's literature evidence view:
 *
 *   · Corpus panel — the program's year-bucketed literature corpus from
 *     /api/regulatory-programs/:id/literature (fetched once by CerSurface via
 *     useProgramExtras and passed down); fixtures only under sample mode.
 *   · Search panel — on-demand PubMed search through the real backend
 *     (GET /api/cerv2/literature/search → pubmed-client), with a per-row
 *     "Record" action that persists hits to the org corpus through
 *     POST /api/cerv2/literature/record (literature_entries). Rows show their
 *     real recorded/failed state and the server's failure text verbatim.
 *   · Screening — the MEDDEV 2.7/1 Rev 4 include/exclude appraisal decision per
 *     article per stage, persisted through POST /api/cerv2/literature/screen
 *     and read back from GET /api/cerv2/literature/screening
 *     (literature_screening_decisions, GA ledger L4). The stored trail is
 *     loaded on mount, so a decision made in an earlier session is present
 *     before the reviewer searches for anything — the PubMed search itself is
 *     transient by design, the decision is not.
 *
 * Honesty rules this file must not quietly break:
 *   · An article with no stored decision renders as "Not screened", never as
 *     "Pending" — an explicit deferral is a decision somebody made.
 *   · A screening write is never applied optimistically: the row shows what the
 *     server confirmed, and a refusal (e.g. the article is not in the corpus
 *     yet) is shown with the server's own text.
 *   · If the screening store cannot be read at all, the panel says so instead
 *     of drawing every row as unscreened.
 */

import * as React from 'react';
import { I } from '../../icons';
import { AskAnaChip } from '../AskAnaChip';
import { CER_LITERATURE } from '../../data/cer';
import type { LiteratureBucket as KitLiteratureBucket } from '../../data/cer';
import type { LiteratureBucket as LiveLiteratureBucket } from '../../hooks/useProgramExtras';
import {
  useCerLiteratureSearch,
  useCerLiteratureRecorder,
  useCerLiteratureScreening,
  screeningKey,
  SCREENING_STAGES,
  SCREENING_STAGE_LABELS,
  SCREENING_DECISION_LABELS,
} from '../../hooks/useCerLiterature';
import type {
  CerLiteratureStudyType,
  CerScreeningStage,
  CerScreeningDecisionValue,
} from '../../hooks/useCerLiterature';
import { SampleDataBanner } from '../../components/SampleDataBanner';
import { useSampleMode } from '../../components/DataGate';
import { useSampleRows } from '../../lib/useSampleRows';

export interface LiteratureTabProps {
  literature: LiveLiteratureBucket[] | null;
  literatureTotal: number;
  loading: boolean;
  programId: string | null;
  programTitle: string | null;
  onAskAna: (text: string) => void;
}

const STUDY_TYPES: Array<{ value: CerLiteratureStudyType; label: string }> = [
  { value: 'any', label: 'Any study type' },
  { value: 'rct', label: 'RCT' },
  { value: 'systematic_review', label: 'Systematic review' },
  { value: 'observational', label: 'Observational' },
  { value: 'case_report', label: 'Case report' },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 12,
  padding: '5px 8px',
  background: 'var(--bg-050)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-200)',
};

/** Colour is never the only signal — every state also carries its own words. */
const DECISION_COLOR: Record<CerScreeningDecisionValue, string> = {
  included: 'var(--ok, #1e8e3e)',
  excluded: 'var(--err, #c0392b)',
  pending: 'var(--text-300)',
};

/**
 * The screening control for one article at one stage.
 *
 * Every write is an explicit "Record decision" press, never an onChange
 * side-effect: this is governed evidence and a stray keystroke must not enter
 * the audit trail. An exclusion cannot be submitted without its rationale
 * (MEDDEV 2.7/1 Rev 4 §8) — the same rule the route and the DB CHECK enforce.
 */
function ScreeningCell({
  pmid,
  stage,
  stored,
  saving,
  onScreen,
}: {
  pmid: string;
  stage: CerScreeningStage;
  stored: { decision: CerScreeningDecisionValue; exclusionReason: string | null; decidedAt: string } | null;
  saving: boolean;
  onScreen: (decision: CerScreeningDecisionValue, exclusionReason: string) => void;
}) {
  const [draft, setDraft] = React.useState<CerScreeningDecisionValue | ''>('');
  const [reason, setReason] = React.useState('');

  // Re-seed the editor when the confirmed decision changes (including the first
  // load of the stored trail), so the control reflects what is actually stored.
  React.useEffect(() => {
    setDraft(stored?.decision ?? '');
    setReason(stored?.exclusionReason ?? '');
  }, [stored?.decision, stored?.exclusionReason, stage]);

  const reasonMissing = draft === 'excluded' && reason.trim().length === 0;
  const unchanged =
    stored != null &&
    draft === stored.decision &&
    (draft !== 'excluded' || reason.trim() === (stored.exclusionReason ?? '').trim());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
      <div style={{ fontSize: 11, color: stored ? DECISION_COLOR[stored.decision] : 'var(--text-300)' }}>
        {stored
          ? `${SCREENING_DECISION_LABELS[stored.decision]} · ${new Date(stored.decidedAt).toLocaleDateString()}`
          : 'Not screened'}
      </div>
      {stored?.decision === 'excluded' && stored.exclusionReason && (
        <div style={{ fontSize: 11, color: 'var(--text-300)' }}>Reason: {stored.exclusionReason}</div>
      )}
      <select
        value={draft}
        aria-label={`${SCREENING_STAGE_LABELS[stage]} decision for PMID ${pmid}`}
        onChange={(e) => setDraft(e.target.value as CerScreeningDecisionValue | '')}
        style={{ ...inputStyle, padding: '3px 6px' }}
      >
        <option value="">Select a decision…</option>
        {(Object.keys(SCREENING_DECISION_LABELS) as CerScreeningDecisionValue[]).map((d) => (
          <option key={d} value={d}>
            {SCREENING_DECISION_LABELS[d]}
          </option>
        ))}
      </select>
      {draft === 'excluded' && (
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label={`Exclusion reason for PMID ${pmid}`}
          placeholder="Exclusion reason (required)"
          style={{ ...inputStyle, padding: '3px 6px' }}
        />
      )}
      {draft !== '' && (
        <button
          className="section-more"
          disabled={saving || reasonMissing || unchanged}
          title={
            reasonMissing
              ? 'MEDDEV 2.7/1 Rev 4 §8 — an exclusion must carry its reason'
              : unchanged
                ? 'This decision is already recorded'
                : `Record this ${SCREENING_STAGE_LABELS[stage]} decision`
          }
          onClick={() => onScreen(draft, reason)}
        >
          {saving ? 'Recording…' : unchanged ? 'Recorded' : 'Record decision'}
        </button>
      )}
    </div>
  );
}

export function LiteratureTab({
  literature,
  literatureTotal,
  loading,
  programId,
  programTitle,
  onAskAna,
}: LiteratureTabProps) {
  const sampleOn = useSampleMode();
  const [query, setQuery] = React.useState('');
  const [years, setYears] = React.useState('');
  const [studyType, setStudyType] = React.useState<CerLiteratureStudyType>('any');
  const [localRefusal, setLocalRefusal] = React.useState<string | null>(null);
  const [stage, setStage] = React.useState<CerScreeningStage>('title_abstract');
  const { searching, result, requestError, search } = useCerLiteratureSearch();
  const { rowState, recordError, recordNotes, record } = useCerLiteratureRecorder(programId);
  const {
    decisions,
    loading: screeningLoading,
    trailUnavailable,
    savingKey,
    screenError,
    screen,
    reload: reloadScreening,
  } = useCerLiteratureScreening(programId);

  /** The stored trail, newest first — this is what survives a reload. */
  const trail = React.useMemo(
    () =>
      Object.values(decisions).sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : -1)),
    [decisions],
  );

  const sourceLiterature = useSampleRows<LiveLiteratureBucket | KitLiteratureBucket>(
    literature && literature.length > 0 ? literature : null,
    CER_LITERATURE,
  );
  const usingSample = sampleOn && (literature === null || literature.length === 0) && sourceLiterature.length > 0;
  const maxHits = Math.max(1, ...sourceLiterature.map((l) => l.hits));
  const corpusTotal = literatureTotal > 0
    ? literatureTotal
    : sourceLiterature.reduce((s, l) => s + l.hits, 0);

  async function onSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setLocalRefusal('Enter a search of at least 2 characters first');
      return;
    }
    setLocalRefusal(null);
    const r = await search({ q, years: years.trim() || undefined, studyType, max: 20 });
    // Narrow the trail read to the hits now on screen, so a decision recorded
    // in an earlier session is already attached when the rows render.
    if (r?.available && r.articles.length > 0) {
      await reloadScreening(r.articles.map((a) => a.pmid));
    }
  }

  const searchStatus = searching
    ? 'Searching PubMed…'
    : localRefusal
      ? localRefusal
      : requestError
        ? requestError
        : result
          ? result.available
            ? `${result.totalCount.toLocaleString()} PubMed match${result.totalCount === 1 ? '' : 'es'} · showing ${result.articles.length}${result.stale ? ' · cached result' : ''}`
            : `Search unavailable — ${result.unavailableReason ?? 'unknown reason'}`
          : null;

  return (
    <>
      <SampleDataBanner show={usingSample} loading={loading} label="literature corpus" />
      <div className="col2">
        <div>
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Search PubMed</div>
                <div className="s">
                  Record hits to the organization corpus per row, then screen them — the
                  include/exclude decision, its reason and its reviewer are persisted per
                  appraisal stage (MEDDEV 2.7/1 Rev 4)
                </div>
              </div>
              <div className="actions">
                <button
                  className="section-more"
                  title="Have AnA run the search with search_literature, appraise the results, and record the keepers to the corpus with record_literature"
                  onClick={() =>
                    onAskAna(
                      `Search PubMed with search_literature for ${programTitle ?? 'this device'} literature` +
                        (query.trim().length >= 2 ? ` (query: "${query.trim()}")` : '') +
                        ' and appraise the results for the CER — scientific validity, relevance, and weighting per MEDDEV 2.7/1. ' +
                        'Record the relevant hits to the corpus with record_literature.',
                    )
                  }
                >
                  Search with AnA {I.sparkles}
                </button>
              </div>
            </div>
            <div className="panel-body pad">
              <form
                onSubmit={onSearch}
                style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
              >
                <label style={{ flex: '2 1 220px' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-300)', display: 'block', marginBottom: 3 }}>
                    Search terms
                  </span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. EGFR companion diagnostic NSCLC"
                    style={{
                      width: '100%',
                      fontSize: 12,
                      padding: '5px 8px',
                      background: 'var(--bg-050)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: 'var(--text-200)',
                    }}
                  />
                </label>
                <label style={{ flex: '0 1 110px' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-300)', display: 'block', marginBottom: 3 }}>
                    Years
                  </span>
                  <input
                    value={years}
                    onChange={(e) => setYears(e.target.value)}
                    placeholder="2020-2026"
                    style={{
                      width: '100%',
                      fontSize: 12,
                      padding: '5px 8px',
                      background: 'var(--bg-050)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: 'var(--text-200)',
                    }}
                  />
                </label>
                <label style={{ flex: '0 1 160px' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-300)', display: 'block', marginBottom: 3 }}>
                    Study type
                  </span>
                  <select
                    value={studyType}
                    onChange={(e) => setStudyType(e.target.value as CerLiteratureStudyType)}
                    style={{
                      width: '100%',
                      fontSize: 12,
                      padding: '5px 8px',
                      background: 'var(--bg-050)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: 'var(--text-200)',
                    }}
                  >
                    {STUDY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="section-more" type="submit" disabled={searching}>
                  {searching ? 'Searching…' : 'Search'} {I.search}
                </button>
              </form>
              {searchStatus && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{ fontSize: 11, color: 'var(--text-300)', marginTop: 8 }}
                >
                  {searchStatus}
                </div>
              )}
            </div>
            {result?.available && result.articles.length > 0 && (
              <>
                {recordError && (
                  <div
                    role="alert"
                    style={{ padding: '6px 16px', fontSize: 11, color: 'var(--err, #c0392b)' }}
                  >
                    {recordError}
                  </div>
                )}
                {recordNotes.length > 0 && (
                  <div
                    role="status"
                    style={{ padding: '6px 16px', fontSize: 11, color: 'var(--text-300)' }}
                  >
                    Recorded — {recordNotes.join('; ')}. The corpus chart refreshes on reload.
                  </div>
                )}
                {screenError && (
                  <div
                    role="alert"
                    style={{ padding: '6px 16px', fontSize: 11, color: 'var(--err, #c0392b)' }}
                  >
                    {screenError}
                  </div>
                )}
                {trailUnavailable && (
                  <div
                    role="alert"
                    style={{ padding: '6px 16px', fontSize: 11, color: 'var(--err, #c0392b)' }}
                  >
                    Screening trail could not be read — {trailUnavailable}. Decisions already
                    recorded are not shown below; nothing here means &ldquo;unscreened&rdquo;.
                  </div>
                )}
                <div
                  style={{
                    padding: '6px 16px',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <label style={{ fontSize: 11, color: 'var(--text-300)' }} htmlFor="cer-screening-stage">
                    Screening pass
                  </label>
                  <select
                    id="cer-screening-stage"
                    value={stage}
                    onChange={(e) => setStage(e.target.value as CerScreeningStage)}
                    style={{ ...inputStyle, width: 'auto', padding: '3px 6px' }}
                  >
                    {SCREENING_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {SCREENING_STAGE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: 11, color: 'var(--text-300)' }}>
                    {screeningLoading
                      ? 'Reading the stored screening trail…'
                      : 'Each article carries one decision per pass'}
                  </span>
                </div>
                <div className="tbl-scroll">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>PMID</th>
                        <th>Title</th>
                        <th>Journal</th>
                        <th>Published</th>
                        <th>Corpus</th>
                        <th>{SCREENING_STAGE_LABELS[stage]}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.articles.map((a) => (
                        <tr key={a.pmid}>
                          <td>
                            <a
                              className="k-num"
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              title="Open on PubMed"
                            >
                              {a.pmid}
                            </a>
                          </td>
                          <td>
                            <div className="k-name" style={{ fontWeight: 400, fontSize: 12 }}>
                              {a.title || 'Untitled record'}
                              <AskAnaChip
                                onAsk={() =>
                                  onAskAna(
                                    `Appraise PMID ${a.pmid} ("${a.title || 'untitled'}") for the CER — ` +
                                      'scientific validity, relevance to the intended purpose, and evidence weighting per MEDDEV 2.7/1 Rev 4.',
                                  )
                                }
                                label={`Appraise PMID ${a.pmid} with AnA`}
                              />
                            </div>
                            <div className="k-holder">
                              {a.authors || 'Authors not listed'}
                              {a.doi ? ` · ${a.doi}` : ''}
                            </div>
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--text-300)' }}>{a.journal || '—'}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-300)' }}>{a.pubDate || '—'}</td>
                          <td>
                            {rowState[a.pmid] === 'recorded' ? (
                              <span style={{ fontSize: 11, color: 'var(--text-300)' }}>Recorded</span>
                            ) : (
                              <button
                                className="section-more"
                                disabled={rowState[a.pmid] === 'recording'}
                                title={
                                  rowState[a.pmid] === 'failed'
                                    ? 'Recording failed — retry'
                                    : 'Record this hit to the organization literature corpus'
                                }
                                onClick={() => void record([a])}
                              >
                                {rowState[a.pmid] === 'recording'
                                  ? 'Recording…'
                                  : rowState[a.pmid] === 'failed'
                                    ? 'Retry'
                                    : 'Record'}
                              </button>
                            )}
                          </td>
                          <td>
                            {/* The control is always offered: the client cannot
                                know whether an article is already in the corpus
                                from an earlier session, so gating it on THIS
                                session's record state would hide a legitimate
                                action. An article that genuinely is not in the
                                corpus is refused by the server (422) with the
                                reason, shown in the banner above. */}
                            <ScreeningCell
                              pmid={a.pmid}
                              stage={stage}
                              stored={decisions[screeningKey(a.pmid, stage)] ?? null}
                              saving={savingKey === screeningKey(a.pmid, stage)}
                              onScreen={(decision, exclusionReason) =>
                                void screen({
                                  pmid: a.pmid,
                                  stage,
                                  decision,
                                  exclusionReason,
                                })
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {result?.available && result.articles.length === 0 && (
              <div
                role="status"
                style={{ padding: '16px', fontSize: 12, color: 'var(--text-300)', textAlign: 'center' }}
              >
                No PubMed records matched this query. Broaden the terms or widen the year range.
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Literature corpus</div>
                <div className="s">
                  {corpusTotal.toLocaleString()} hits · PubMed · FDA · ClinicalTrials.gov ·{' '}
                  {sourceLiterature.length}-year window
                </div>
              </div>
              <div className="actions">
                <button
                  className="tb-btn"
                  title="Refine literature search with AnA"
                  onClick={() =>
                    onAskAna(
                      `Refine the literature search for ${programTitle ?? 'this program'} — tighten the inclusion window, ` +
                        'expand to MeSH synonyms, and flag any cohort studies missing from the corpus.',
                    )
                  }
                >
                  {I.search}
                </button>
              </div>
            </div>
            <div style={{ padding: '12px 0' }}>
              {literature !== null && corpusTotal === 0 && !usingSample ? (
                <div
                  role="status"
                  style={{
                    padding: '24px 16px',
                    textAlign: 'center',
                    fontSize: 12,
                    color: 'var(--text-300)',
                  }}
                >
                  <div style={{ fontWeight: 600, color: 'var(--text-200)', marginBottom: 4 }}>
                    No literature corpus indexed yet
                  </div>
                  Search PubMed on the left and record hits to the corpus — entries whose title or
                  abstract mention the product name appear in this year-bucketed chart.
                </div>
              ) : (
                sourceLiterature.map((l) => (
                  <div key={l.year} className="litbar">
                    <span className="yr">{l.year}</span>
                    <div className="bar">
                      <div className="bar-fill" style={{ width: `${(l.hits / maxHits) * 100}%` }} />
                    </div>
                    <span className="ct">{l.hits.toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* The screening trail — the part a notified body audits. Rendered
              from the STORED decisions, not from the transient search, which is
              what makes it survive a reload. Never shows sample data: an
              invented appraisal decision in a CER is not a demo, it is a
              fabricated regulatory record. */}
          <div className="panel" style={{ marginTop: 12 }}>
            <div className="panel-hdr">
              <div>
                <div className="t">Screening decisions</div>
                <div className="s">
                  {trailUnavailable
                    ? 'Trail unavailable'
                    : `${trail.length.toLocaleString()} recorded · ${
                        programId ? 'this program' : 'organization corpus'
                      } · MEDDEV 2.7/1 Rev 4`}
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 16px' }}>
              {trailUnavailable ? (
                <div role="alert" style={{ fontSize: 12, color: 'var(--err, #c0392b)' }}>
                  {trailUnavailable}
                </div>
              ) : screeningLoading && trail.length === 0 ? (
                <div role="status" style={{ fontSize: 12, color: 'var(--text-300)' }}>
                  Reading the stored screening trail…
                </div>
              ) : trail.length === 0 ? (
                <div role="status" style={{ fontSize: 12, color: 'var(--text-300)' }}>
                  No screening decisions recorded yet. Record hits to the corpus, then include or
                  exclude them per appraisal stage — every decision is stored with its reviewer,
                  its timestamp and, for an exclusion, its reason.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {trail.map((d) => (
                    <div key={d.id} style={{ fontSize: 11, color: 'var(--text-300)' }}>
                      <div style={{ color: DECISION_COLOR[d.decision] }}>
                        {SCREENING_DECISION_LABELS[d.decision]} ·{' '}
                        {SCREENING_STAGE_LABELS[d.stage]} ·{' '}
                        {new Date(d.decidedAt).toLocaleDateString()}
                      </div>
                      <div style={{ color: 'var(--text-200)' }}>
                        PMID {d.pmid}
                        {d.title ? ` — ${d.title}` : ''}
                      </div>
                      {d.exclusionReason && <div>Reason: {d.exclusionReason}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
