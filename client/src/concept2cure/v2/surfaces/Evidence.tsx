import React, { useState } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import { PedigreeBadge } from '../intelligence/Intelligence';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Inline fixture data (small, kit-identical) ── */

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

const EV_ANSWER: EvAnswer = {
  pedigree: 'model_assisted',
  text: 'For a 14-day wear CGM, FDA precedent requires ISO 10993-11 (systemic toxicity) testing in addition to the -5 and -10 panels used for shorter-wear predicates, and reviewers consistently request an accuracy sub-analysis stratified by age band. Both points should be addressed in §11 (substantial equivalence) and §14 (biocompatibility) before filing.',
  cites: [1, 2, 3],
};

const EV_CHUNKS: EvChunk[] = [
  { n: 1, doc: 'K221847 Decision Summary.pdf', page: 'p. 7', sim: 0.92, snip: '…extended-wear sensors (>10 days) required additional ISO 10993-11 systemic toxicity evaluation beyond the predicate biocompatibility profile…' },
  { n: 2, doc: 'FDA 2023 CGM guidance.pdf', page: 'p. 14', sim: 0.88, snip: '…accuracy should be characterized across pediatric and adult sub-populations, with MARD reported by age band…' },
  { n: 3, doc: 'BX-204 Biocompatibility plan v2.docx', page: '§3.2', sim: 0.81, snip: '…cytotoxicity (-5) and sensitization (-10) complete; systemic toxicity (-11) in progress pending 14-day extract…' },
];

const EV_SUGGEST: string[] = [
  'What testing does 14-day wear require?',
  'Find precedent for predictive low alerts',
  'Summarize open biocompatibility gaps',
];

/* ── Window globals — cross-surface data providers (gap until backing modules port) ── */
declare global {
  interface Window {
    PedigreeBadge?: React.ComponentType<{ level: string }>;
  }
}

/* ════ Evidence — corpus search surface ════ */

export function Evidence({ onAsk }: SurfaceViewProps) {
  const [q, setQ] = useState('');
  const [run, setRun] = useState(false);

  const go = (text?: string) => {
    const v = text || q;
    if (!v) return;
    setQ(v);
    setRun(true);
  };

  return (
    <div className="page-inner">
      <SampleTag sample={true} />
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
          placeholder="Ask a question about your evidence…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go()}
        />
        <button
          className="btn primary"
          style={{ height: 34 }}
          onClick={() => go()}
        >
          {I.sparkles} Ask
        </button>
      </div>

      {!run ? (
        <div style={{ marginTop: 18 }}>
          <div className="ana-seclbl" style={{ marginBottom: 10 }}>
            Try
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {EV_SUGGEST.map((s, i) => (
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
              <PedigreeBadge level={EV_ANSWER.pedigree} />
            </div>
            <div className="gri-result-body">
              <div className="gri-result-sum">
                {EV_ANSWER.text}{' '}
                <sup className="ev-cite-ref">[1][2][3]</sup>
              </div>
              <div className="ev-trace">
                Traced to {EV_CHUNKS.length} source chunks across 3 documents.
              </div>
            </div>
          </div>

          <div>
            <div className="ana-seclbl" style={{ marginBottom: 10 }}>
              Sources
            </div>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 9 }}
            >
              {EV_CHUNKS.map((c) => (
                <div key={c.n} className="ev-chunk">
                  <div className="ev-chunk-top">
                    <span className="ev-chunk-n">{c.n}</span>
                    <span className="ev-chunk-doc">{c.doc}</span>
                    <span className="ev-chunk-sim mono">
                      {c.sim.toFixed(2)}
                    </span>
                  </div>
                  <div className="ev-chunk-page">{c.page}</div>
                  <div className="ev-chunk-snip">{c.snip}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
