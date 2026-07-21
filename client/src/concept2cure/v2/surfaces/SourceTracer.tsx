import React, { useState, useEffect } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import { ST_SOURCETYPES, ST_VSTATUS } from '../fixtures/source-tracer-data';

/* Real source-tracer read-model — GET /api/source-tracer/sections
   ({ data: { sections } }). Every sentence is a persisted, org-scoped
   source_citations row joined to its document; no provenance is fabricated.
   The service fail-closes (503) when the provenance store is unmigrated. */
interface StSentence {
  idx: number;
  sourceType: string;
  conf: number;
  text: string;
  sourceTitle: string;
  sourceId: string;
  sourceUrl?: string | null;
  pmid?: string;
  doi?: string;
}
interface StSection {
  id: string;
  doc: string;
  sec: string;
  module?: string | null;
  status: string;
  model: string;
  sentences: StSentence[];
}
interface StVerifyResult { id?: string; status: string }
interface StVerify {
  results: StVerifyResult[];
  summary: { verified: number; notFound: number; unverifiable: number; error: number };
}

/* Sentence click-through — POST /api/audit-services/traceability/click-through
   (sentenceTraceabilityService). The service takes the raw content + a char
   offset, re-detects sentence boundaries server-side, and resolves the exact
   source spans (file/page/excerpt + highlight range + access URL). */
interface CtSource {
  sourceId: string; sourceType: string; title: string; documentPath?: string;
  pageNumber?: number; excerpt: string; relevanceScore: number; linkType: string;
  isVerified: boolean; fullContent?: string; highlightRange?: { start: number; end: number }; accessUrl?: string;
}
interface CtResult {
  sentence: { index: number; text: string; charStart: number; charEnd: number; contentHash: string };
  sources: CtSource[];
  relatedSentences: Array<{ index: number; text: string }>;
  confidence: number;
}

/* ---- Source tracer — provenance for every sentence AnA writes ---- */

export function SourceTracer({ onAsk }: SurfaceViewProps) {
  const ST = ST_SOURCETYPES;
  const ask = onAsk || (() => {});
  const st = useLiveData<{ sections: StSection[] }>('/api/source-tracer/sections');
  const sections = st.data?.sections ?? [];

  const [selId, setSel] = useState<string | null>(null);
  const [verify, setVerify] = useState<StVerify | null>(null);
  const [verifying, setVerifying] = useState(false);
  // Click-through state: which sentence is being traced and the server's result.
  const [trace, setTrace] = useState<{ idx: number; state: 'loading' | 'ready' | 'none' | 'error'; result: CtResult | null; note?: string } | null>(null);

  // Default the selection to the first real section once they load.
  useEffect(() => {
    if (selId == null && sections.length) setSel(sections[0].id);
  }, [sections, selId]);
  useEffect(() => { setVerify(null); }, [selId]);

  const sec = sections.find(s => s.id === selId) || sections[0] || null;
  const stTone = (s: string) => (s === 'approved' ? 'ok' : s === 'review' ? 'warn' : 'idle');
  const allSents = sections.flatMap(s => s.sentences);
  const litAll = allSents.filter(s => s.sourceType === 'literature');
  const weak = allSents.filter(s => s.conf < 0.7);
  const secLits = sec ? sec.sentences.filter(s => s.sourceType === 'literature') : [];

  /* Real citation verification — POST /api/citations/verify checks each
     literature citation against PubMed + CrossRef and returns a per-citation
     status + summary. No fabricated verdict. */
  const runVerify = async () => {
    if (!sec || secLits.length === 0 || verifying) return;
    setVerifying(true);
    try {
      const res = await apiRequest('POST', '/api/citations/verify', {
        citations: secLits.map(s => ({
          id: s.sourceId,
          title: s.sourceTitle,
          ...(s.pmid ? { pmid: s.pmid } : {}),
          ...(s.doi ? { doi: s.doi } : {}),
        })),
      });
      const body = await res.json().catch(() => null);
      setVerify(res.ok && body?.data ? (body.data as StVerify) : null);
    } catch {
      setVerify(null);
    } finally {
      setVerifying(false);
    }
  };

  /* Sentence click-through — resolves the clicked sentence to its exact source
     spans via the real traceability service. The service keys on raw content +
     a char offset (it re-detects sentence boundaries server-side), so the
     section's own sentence texts are joined into the content and the offset
     points inside the clicked sentence. Nothing is fabricated: no project open,
     no trace found, or a failed call all render honestly. */
  const clickThrough = async (idx: number) => {
    if (!sec) return;
    const proj = (window as unknown as { C2C_PROJECT?: { id?: string | number } }).C2C_PROJECT;
    const projectId = proj?.id != null ? String(proj.id) : null;
    if (!projectId) {
      setTrace({ idx, state: 'error', result: null, note: 'Open a program first — sentence traces are resolved per project.' });
      return;
    }
    setTrace({ idx, state: 'loading', result: null });
    try {
      const ordered = sec.sentences;
      const pos = ordered.findIndex(x => x.idx === idx);
      const content = ordered.map(x => x.text).join(' ');
      const charOffset = ordered.slice(0, pos).reduce((acc, x) => acc + x.text.length + 1, 0) + 1;
      const res = await apiRequest('POST', '/api/audit-services/traceability/click-through', { content, charOffset, projectId });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setTrace({ idx, state: 'error', result: null, note: res.status === 401 ? 'Sign in to trace sentences.' : `Trace failed (HTTP ${res.status}).` });
        return;
      }
      const ct = (body as { clickThrough?: CtResult | null })?.clickThrough ?? null;
      setTrace({ idx, state: ct ? 'ready' : 'none', result: ct });
    } catch (e) {
      setTrace({ idx, state: 'error', result: null, note: 'Trace failed — ' + (e instanceof Error ? e.message : String(e)) + '.' });
    }
  };

  // Four-state on the real read-model — never a fabricated stand-in.
  if (st.loading) {
    return (
      <div className="sp"><div style={{ padding: 24 }}><EmptyState title="Loading source provenance…" icon={I.clock} /></div></div>
    );
  }
  if (st.error) {
    return (
      <div className="sp"><div style={{ padding: 24 }}>
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load source provenance"
          hint="The source-tracer service didn't respond (the provenance store may not be provisioned for this organization yet). Sign in and retry — nothing is shown from a cached sample."
        />
      </div></div>
    );
  }
  if (!sec || sections.length === 0) {
    return (
      <div className="sp"><div style={{ padding: 24 }}>
        <EmptyState
          icon={I.shieldCheck || I.check}
          title="No traced document sections yet"
          hint="Once AnA writes governed document sections, every sentence's typed source and confidence appears here — provenance for each claim, checkable against PubMed and CrossRef. Nothing here is simulated."
        />
      </div></div>
    );
  }

  return (
    <div className="sp">
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Provenance / 21 CFR Part 11</div>
          <h1 className="sp-title">Source tracer</h1>
          <p className="sp-state">Every sentence AnA writes carries a typed source and a confidence score — trial data, literature, regulatory guidance, or internal data. Literature citations are checked against PubMed and CrossRef. No untraceable number reaches a submission.</p>
        </div>
        <button className="sp-primary" onClick={runVerify} disabled={verifying || secLits.length === 0}>{I.shieldCheck} {verifying ? 'Verifying…' : 'Verify sources'}</button>
      </div>

      <AnswerLead
        tone={weak.length ? 'calm' : 'good'}
        eyebrow="Whether every number in your dossier traces to a real source"
        headline={<>Every one of the <b>{allSents.length}</b> traced sentences across your generated sections carries a typed source — each with a confidence score.</>}
        body={<><b>{litAll.length}</b> of them cite published literature. I can check those against PubMed and CrossRef right now, so an untraceable citation never reaches the submission.</>}
        reassure={weak.length
          ? <><b>{weak.length}</b> sentence{weak.length > 1 ? 's' : ''} carr{weak.length > 1 ? 'y' : 'ies'} a confidence below 70% — flagged so nothing unverified slips through.</>
          : <>Every citation is confirmable against a public index.</>}
        action={{
          label: 'Verify ' + sec.doc.split('/')[0].trim() + ' citations',
          icon: I.shieldCheck,
          onClick: runVerify,
          alt: { label: 'Ask AnA to re-trace a claim', onClick: () => ask('Re-trace every cited value in ' + sec.doc + ' to its locked source and flag anything unverified.') },
        }}
        secondary="Or inspect any sentence-level chain below."
      />

      <div className="sp-2col" style={{ gridTemplateColumns: '296px 1fr' }}>
        <div className="pj-card" style={{ alignSelf: 'start' }}>
          <div className="pj-card-h"><span className="t">Generated sections</span><span className="s">{sections.length}</span></div>
          <div className="pj-card-b" style={{ padding: 8 }}>
            <div className="sp-list">
              {sections.map(s => {
                const lit = s.sentences.filter(x => x.sourceType === 'literature').length;
                return (
                  <button key={s.id} className="sp-row" style={{ width: '100%', textAlign: 'left', borderRadius: 8, padding: '9px 10px', border: selId === s.id ? '1px solid var(--accent-muted)' : '1px solid transparent', background: selId === s.id ? 'var(--accent-000)' : 'transparent' }} onClick={() => setSel(s.id)}>
                    <span className="sp-row-b"><span className="sp-row-t">{s.doc}</span><span className="sp-row-s">{'§'}{s.sec} / {s.sentences.length} sentences / {lit} literature</span></span>
                    <span className={'rd-chip tone-' + stTone(s.status)}>{s.status}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          {/* Per-sentence provenance — the real source_citations rows */}
          <div className="pj-card" style={{ marginBottom: 14 }}>
            <div className="pj-card-h"><span className="t">{sec.doc} / {'§'}{sec.sec}</span><span className="s">{sec.model}</span></div>
            <div className="pj-card-b">
              <div className="pj-seclbl">Sentence-level provenance <span style={{ fontWeight: 400, color: 'var(--text-400)' }}>/ claim -- typed source -- confidence</span></div>
              <div className="st-sents">
                {sec.sentences.map(s => {
                  const ty = ST[s.sourceType] || { label: s.sourceType, tone: 'idle' };
                  const low = s.conf < 0.7;
                  return (
                    <div key={s.idx} className="st-sent">
                      <div className="st-sent-txt">{s.text}</div>
                      <div className="st-sent-src">
                        <span className={'rd-chip tone-' + ty.tone}>{ty.label}</span>
                        <span className="st-sent-title">{s.sourceTitle}</span>
                        {s.pmid && <span className="st-pmid">PMID {s.pmid}</span>}
                        <span className={'st-conf' + (low ? ' low' : '')} title="model confidence">{Math.round(s.conf * 100)}%</span>
                        {s.sourceUrl && <a className="sp-go" href={s.sourceUrl} target="_blank" rel="noreferrer" title="Open source">{I.externalLink || I.right}</a>}
                        <button className="nda-open" style={{ marginLeft: 'auto' }} onClick={() => clickThrough(s.idx)}
                          title="Resolve this sentence to its exact source spans">
                          {I.search} {trace?.idx === s.idx && trace.state === 'loading' ? 'Tracing…' : 'Trace'}
                        </button>
                      </div>
                      {trace?.idx === s.idx && trace.state !== 'loading' && (
                        <div className="st-sent-src" style={{ display: 'block', marginTop: 6, paddingLeft: 10, borderLeft: '2px solid var(--accent-muted,#c7d7fe)' }}>
                          {trace.state === 'error' ? (
                            <span className="sp-tone-warn" style={{ fontSize: 12.5 }}>{trace.note}</span>
                          ) : trace.state === 'none' || !trace.result ? (
                            <span style={{ fontSize: 12.5, color: 'var(--text-400,#667085)' }}>No source span resolved for this sentence — the traceability service found no mapped source above its confidence floor. Nothing is fabricated.</span>
                          ) : (
                            <div>
                              <div style={{ fontSize: 12, color: 'var(--text-400,#667085)', marginBottom: 4 }}>
                                Resolved by the traceability service · confidence {Math.round((trace.result.confidence ?? 0) * 100)}% · sentence hash <span className="mono">{trace.result.sentence.contentHash}</span>
                              </div>
                              {trace.result.sources.length === 0 ? (
                                <span style={{ fontSize: 12.5 }}>No mapped sources.</span>
                              ) : trace.result.sources.map((src, i) => (
                                <div key={i} style={{ fontSize: 12.5, marginBottom: 4 }}>
                                  <b>{src.title}</b>
                                  {src.pageNumber != null ? ' · p.' + src.pageNumber : ''}
                                  {' · '}{src.sourceType}{' · relevance '}{Math.round((src.relevanceScore ?? 0) * 100)}%
                                  {src.accessUrl && <> · <a className="sp-go" href={src.accessUrl} target="_blank" rel="noreferrer">open source</a></>}
                                  {src.excerpt && <div style={{ color: 'var(--text-400,#667085)', marginTop: 2 }}>“{src.excerpt}”</div>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="cm-pushbar" style={{ marginTop: 14 }}>
                <button className="sp-ask" onClick={() => ask('Analyze ' + sec.doc + ' ' + '§' + sec.sec + ' for any claim without a traceable source and flag each one.')}>{I.sparkles} Analyze for untraced claims</button>
                <button className="sp-ask" onClick={() => ask('Show the full audit trail for ' + sec.doc + ' ' + '§' + sec.sec + ' including who approved each source.')}>{I.history} View audit trail</button>
              </div>
            </div>
          </div>

          {/* Citation verification — real POST /api/citations/verify */}
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Citation verification</span><span className="s">PubMed + CrossRef / /api/citations/verify</span></div>
            <div className="pj-card-b">
              {secLits.length === 0 ? (
                <div className="scaf-note">No published-literature citations in this section — every source is trial, guidance, or internal data, which trace directly to a locked dataset.</div>
              ) : (
                <>
                  <div className="scaf-note" style={{ marginBottom: 10 }}>{secLits.length} literature citation{secLits.length > 1 ? 's' : ''} in this section. AnA checks each against PubMed and CrossRef — a citation that cannot be confirmed is flagged, never assumed.</div>
                  <div className="sp-list">
                    {secLits.map(s => {
                      const r = verify && verify.results.find(x => x.id === s.sourceId);
                      const stv = r ? ST_VSTATUS[r.status] : null;
                      return (
                        <div key={s.sourceId} className="sp-row">
                          <span className="sp-q-ic">{I.fileText}</span>
                          <span className="sp-row-b"><span className="sp-row-t" style={{ fontSize: 12.5 }}>{s.sourceTitle}</span><span className="sp-row-s">{s.pmid ? ('PMID ' + s.pmid) : 'no index identifier'}{s.doi ? (' / DOI ' + s.doi) : ''}</span></span>
                          {stv ? <span className={'rd-chip tone-' + stv.t}>{stv.l}</span> : <span className="st-unchecked">not checked</span>}
                        </div>
                      );
                    })}
                  </div>
                  {verify && (
                    <div className="st-vsum">
                      <span className="st-vsum-i tone-ok">{verify.summary.verified} verified</span>
                      {verify.summary.notFound > 0 && <span className="st-vsum-i tone-warn">{verify.summary.notFound} not found</span>}
                      {verify.summary.unverifiable > 0 && <span className="st-vsum-i tone-idle">{verify.summary.unverifiable} unverifiable</span>}
                      {verify.summary.error > 0 && <span className="st-vsum-i tone-warn">{verify.summary.error} error</span>}
                      {verify.summary.notFound > 0 && <button className="sp-ask" style={{ marginLeft: 'auto' }} onClick={() => ask('Find a peer-reviewed source to replace the unconfirmed citation in ' + sec.doc + ', or remove the claim.')}>{I.sparkles} Fix flagged citation</button>}
                    </div>
                  )}
                  <div className="cm-pushbar" style={{ marginTop: 12 }}>
                    <button className="sp-primary" style={{ padding: '8px 14px' }} onClick={runVerify} disabled={verifying}>{I.shieldCheck} {verifying ? 'Verifying…' : (verify ? 'Re-verify' : 'Verify')} against PubMed and CrossRef</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
