/**
 * LiteratureTab — the CER workbench's literature evidence view:
 *
 *   · Corpus panel — the program's year-bucketed literature corpus from
 *     /api/regulatory-programs/:id/literature (fetched once by CerSurface via
 *     useProgramExtras and passed down); fixtures only under sample mode.
 *   · Search panel — on-demand PubMed search through the real backend
 *     (GET /api/cerv2/literature/search → pubmed-client). Results are
 *     READ-ONLY: no literature_entries write path exists yet, so the tab says
 *     plainly that a search is not recorded to the project corpus.
 */

import * as React from 'react';
import { I } from '../../icons';
import { AskAnaChip } from '../AskAnaChip';
import { CER_LITERATURE } from '../../data/cer';
import type { LiteratureBucket as KitLiteratureBucket } from '../../data/cer';
import type { LiteratureBucket as LiveLiteratureBucket } from '../../hooks/useProgramExtras';
import { useCerLiteratureSearch } from '../../hooks/useCerLiterature';
import type { CerLiteratureStudyType } from '../../hooks/useCerLiterature';
import { SampleDataBanner } from '../../components/SampleDataBanner';
import { useSampleMode } from '../../components/DataGate';
import { useSampleRows } from '../../lib/useSampleRows';

export interface LiteratureTabProps {
  literature: LiveLiteratureBucket[] | null;
  literatureTotal: number;
  loading: boolean;
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

export function LiteratureTab({
  literature,
  literatureTotal,
  loading,
  programTitle,
  onAskAna,
}: LiteratureTabProps) {
  const sampleOn = useSampleMode();
  const [query, setQuery] = React.useState('');
  const [years, setYears] = React.useState('');
  const [studyType, setStudyType] = React.useState<CerLiteratureStudyType>('any');
  const [localRefusal, setLocalRefusal] = React.useState<string | null>(null);
  const { searching, result, requestError, search } = useCerLiteratureSearch();

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
    await search({ q, years: years.trim() || undefined, studyType, max: 20 });
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
                  Results are not recorded to the project corpus — recording requires a persistence
                  route that does not exist yet
                </div>
              </div>
              <div className="actions">
                <button
                  className="section-more"
                  title="Have AnA run the search with her search_literature tool and appraise the results in conversation"
                  onClick={() =>
                    onAskAna(
                      `Search PubMed with search_literature for ${programTitle ?? 'this device'} literature` +
                        (query.trim().length >= 2 ? ` (query: "${query.trim()}")` : '') +
                        ' and appraise the results for the CER — scientific validity, relevance, and weighting per MEDDEV 2.7/1.',
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
              <div className="tbl-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>PMID</th>
                      <th>Title</th>
                      <th>Journal</th>
                      <th>Published</th>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                  Run a literature search and record the protocol via AnA to populate the
                  year-bucketed corpus.
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
        </div>
      </div>
    </>
  );
}
