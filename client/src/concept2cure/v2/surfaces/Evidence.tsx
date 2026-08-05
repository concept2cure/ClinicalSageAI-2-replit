import React, { useState, useEffect, useCallback } from 'react';
import { I } from '../icons';
import { liveGetOrNull, liveMutateOrNull, EmptyState } from '../dataConnect';
import { PedigreeBadge } from '../intelligence/Intelligence';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ════ Evidence — live corpus search surface ════

   Fixture-free by construction. Every rendered value is real:
   • the "Try" chips are the org's REAL recent questions (GET /api/evidence-asks,
     assembled from the ai_retrieval_runs trace chain — never invented prompts);
   • an ask runs LIVE against the corpus (POST /api/evidence/ask) and renders the
     model's real answer, its real citations, and the real retrieved source chunks.
   An org that has never asked sees an honest empty affordance, not a stand-in. */

interface EvChunk {
  n: number;
  doc: string;
  page: string;
  sim: number;
  snip: string;
}

interface EvAnswer {
  pedigree: string;
  text: string;
  cites: number[];
}

/** Shape returned by POST /api/evidence/ask (see server/routes/evidence-ask.ts). */
interface AskResponse {
  answer?: string;
  sources?: Array<{ id: string; title: string; content: string; score: number }>;
  citations?: Array<{ id: string; title: string; cited: boolean }>;
}

/** Shape returned by GET /api/evidence-asks (the org's latest real ask + history). */
interface LatestAsk {
  question?: string;
  suggestions?: string[];
}

const SNIP_MAX = 400;

export function Evidence(_props: SurfaceViewProps) {
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<EvAnswer | null>(null);
  const [chunks, setChunks] = useState<EvChunk[]>([]);
  const [asked, setAsked] = useState<string>('');

  /* Load the org's REAL recent questions for the "Try" chips (honest empty when
     the tenant has never run an ask — no fabricated starter prompts). */
  useEffect(() => {
    let cancelled = false;
    liveGetOrNull<LatestAsk>('/api/evidence-asks').then((r) => {
      if (cancelled) return;
      const s = r.data?.suggestions;
      if (Array.isArray(s) && s.length > 0) setRecent(s.filter((x) => typeof x === 'string' && x.trim()));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const go = useCallback(
    async (text?: string) => {
      const v = (text || q).trim();
      if (!v || loading) return;
      setQ(v);
      setAsked(v);
      setLoading(true);
      setError(null);
      setAnswer(null);
      setChunks([]);
      const res = await liveMutateOrNull<AskResponse>('POST', '/api/evidence/ask', { message: v });
      const d = res.data;
      if (!d || res.error) {
        setError(res.error || 'The corpus search did not complete — the retrieval service returned no result. Retry, or narrow the query.');
        setLoading(false);
        return;
      }
      const sources = Array.isArray(d.sources) ? d.sources : [];
      const cites = Array.isArray(d.citations)
        ? d.citations
            .filter((c) => c.cited)
            .map((c) => parseInt(String(c.id).replace(/^SRC-/, ''), 10))
            .filter((n) => Number.isFinite(n))
        : [];
      setAnswer({ pedigree: 'model_assisted', text: d.answer || '', cites });
      setChunks(
        sources.map((s, i) => ({
          n: i + 1,
          doc: s.title || 'Untitled source',
          page: '',
          sim: typeof s.score === 'number' ? s.score : 0,
          snip: (s.content || '').slice(0, SNIP_MAX),
        })),
      );
      setLoading(false);
    },
    [q, loading],
  );

  const ran = loading || answer !== null || error !== null;

  return (
    <div className="page-inner">
      <div className="ph">
        <div>
          <div className="ph-eyebrow">Project {I.dot} evidence</div>
          <h1 className="ph-title">Evidence search</h1>
          <div className="ph-sub">
            Ask across the full corpus. AnA retrieves over 3-layer memory and
            answers with citations traced back to the exact source chunks.
          </div>
        </div>
      </div>

      <div className="ev-search">
        <span className="ico">{I.search}</span>
        <input
          aria-label="Ask a question about your evidence" placeholder="Ask a question about your evidence…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go()}
        />
        <button
          className="btn primary"
          style={{ height: 34 }}
          disabled={loading || !q.trim()}
          onClick={() => go()}
        >
          {I.sparkles} {loading ? 'Asking…' : 'Ask'}
        </button>
      </div>

      {!ran ? (
        <div style={{ marginTop: 18 }}>
          {recent.length > 0 && (
            <>
              <div className="ana-seclbl" style={{ marginBottom: 10 }}>
                Recent asks
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {recent.map((s, i) => (
                  <button
                    key={i}
                    className="ana-sugg"
                    style={{ width: 'auto' }}
                    onClick={() => go(s)}
                  >
                    <span className="ico">{I.sparkles}</span>
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="ev-meta">
            Retrieval: pgvector similarity over S3-backed chunks {I.dot}{' '}
            384-dim embeddings {I.dot} working + project + client memory.
          </div>
        </div>
      ) : (
        <div
          className="split"
          style={{ marginTop: 18, gridTemplateColumns: '1fr 380px' }}
        >
          <div
            className="gri-result"
            style={{ marginTop: 0, height: 'fit-content' }}
          >
            <div className="gri-result-hdr">
              <span className="t">Answer</span>
              {answer && <PedigreeBadge level={answer.pedigree} />}
            </div>
            <div className="gri-result-body">
              {loading ? (
                <div className="gri-result-sum" style={{ opacity: 0.7 }}>
                  Searching the corpus for “{asked}”…
                </div>
              ) : error ? (
                <EmptyState
                  tone="error"
                  title="Search failed"
                  hint={error}
                  icon={I.alertTriangle}
                />
              ) : answer ? (
                <>
                  <div className="gri-result-sum">
                    {answer.text}{' '}
                    {answer.cites.length > 0 && (
                      <sup className="ev-cite-ref">
                        {answer.cites.map((c) => `[${c}]`).join('')}
                      </sup>
                    )}
                  </div>
                  <div className="ev-trace">
                    {chunks.length > 0
                      ? `Traced to ${chunks.length} source ${chunks.length === 1 ? 'chunk' : 'chunks'}.`
                      : 'No source chunks matched — the answer is bounded to retrieved evidence only.'}
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div>
            <div className="ana-seclbl" style={{ marginBottom: 10 }}>
              Sources
            </div>
            {chunks.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {chunks.map((c) => (
                  <div key={c.n} className="ev-chunk">
                    <div className="ev-chunk-top">
                      <span className="ev-chunk-n">{c.n}</span>
                      <span className="ev-chunk-doc">{c.doc}</span>
                      <span className="ev-chunk-sim mono">
                        {c.sim.toFixed(2)}
                      </span>
                    </div>
                    {c.page && <div className="ev-chunk-page">{c.page}</div>}
                    <div className="ev-chunk-snip">{c.snip}</div>
                  </div>
                ))}
              </div>
            ) : (
              !loading &&
              !error && (
                <EmptyState
                  title="No sources retrieved"
                  hint="Nothing in the corpus cleared the similarity threshold for this question."
                  icon={I.search}
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
