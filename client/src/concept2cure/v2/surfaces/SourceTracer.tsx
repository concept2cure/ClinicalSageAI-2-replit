import React, { useState, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import {
  ST_SOURCETYPES, ST_SECTIONS, ST_VSTATUS, stVerify,
} from '../fixtures/source-tracer-data';
import type { StVerifyOutput } from '../fixtures/source-tracer-data';

/* ---- Source tracer — provenance for every sentence AnA writes ---- */

export function SourceTracer({ onAsk, onNav }: SurfaceViewProps) {
  const ST = ST_SOURCETYPES;
  const ask = onAsk || ((window as any).openAna || (() => {}));
  const open = (id: string) => {
    if (!id) return;
    try { localStorage.setItem('c2c_open_surface', id); } catch (_e) { /* swallow */ }
    onNav && onNav(id);
  };
  const [selId, setSel] = useState(ST_SECTIONS[0].id);
  const [verify, setVerify] = useState<StVerifyOutput | null>(null);
  const [analyzed, setAnalyzed] = useState(false);
  useEffect(() => { setVerify(null); setAnalyzed(false); }, [selId]);

  const sec = ST_SECTIONS.find(s => s.id === selId) || ST_SECTIONS[0];
  const stTone = (s: string) => s === 'approved' ? 'ok' : s === 'review' ? 'warn' : 'idle';
  const allSents = ST_SECTIONS.flatMap(s => s.sentences);
  const litAll = allSents.filter(s => s.sourceType === 'literature');
  const weak = allSents.filter(s => s.conf < 0.7);
  const secLits = sec.sentences.filter(s => s.sourceType === 'literature');
  const runVerify = () => setVerify(stVerify(sec));

  return (
    <div className="sp">
      <SampleTag sample={true} />
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Provenance / 21 CFR Part 11</div>
          <h1 className="sp-title">Source tracer <span className="st-pill">Sample data</span></h1>
          <p className="sp-state">Every sentence AnA writes carries a typed source and a confidence score — trial data, literature, regulatory guidance, or internal data. Literature citations are checked against PubMed and CrossRef. No untraceable number reaches a submission.</p>
        </div>
        <button className="sp-primary" onClick={runVerify}>{I.shieldCheck} Verify sources</button>
      </div>

      <AnswerLead
        tone={weak.length ? 'calm' : 'good'}
        eyebrow="Whether every number in your dossier traces to a real source"
        headline={<>Every one of the <b>{allSents.length}</b> sentences across your Module&nbsp;2 and 3 summaries traces to a typed source — each with a confidence score.</>}
        body={<><b>{litAll.length}</b> of them cite published literature. I can check those against PubMed and CrossRef right now, so an untraceable citation never reaches the submission.</>}
        reassure={weak.length
          ? <>One citation is a conference abstract I cannot confirm in PubMed — I have flagged it so it does not slip through.</>
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
          <div className="pj-card-h"><span className="t">Generated sections</span><span className="s">{ST_SECTIONS.length}</span></div>
          <div className="pj-card-b" style={{ padding: 8 }}>
            <div className="sp-list">
              {ST_SECTIONS.map(s => {
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
          {/* Per-sentence provenance — the real SourceLink shape */}
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
                        {s.surface && <button className="sp-go" title="Open source" onClick={() => open(s.surface!)}>{I.externalLink || I.right}</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="cm-pushbar" style={{ marginTop: 14 }}>
                <button className="sp-ask" onClick={() => { setAnalyzed(true); }}>{I.sparkles} Analyze for untraced claims</button>
                <button className="sp-ask" onClick={() => ask('Show the full audit trail for ' + sec.doc + ' ' + '§' + sec.sec + ' including who approved each source.')}>{I.history} View audit trail</button>
              </div>
              {analyzed && (
                <div className="st-analyze">{I.check} AnA analyzed <b>{sec.doc}</b> via <code>/sources/analyze</code> — <b>{sec.sentences.length} claims found</b>, all {sec.sentences.length} linked to a typed source. 0 untraced.</div>
              )}
            </div>
          </div>

          {/* Citation verification — real /api/citations/verify */}
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
                      const st = r ? ST_VSTATUS[r.status] : null;
                      return (
                        <div key={s.sourceId} className="sp-row">
                          <span className="sp-q-ic">{I.fileText}</span>
                          <span className="sp-row-b"><span className="sp-row-t" style={{ fontSize: 12.5 }}>{s.sourceTitle}</span><span className="sp-row-s">{s.pmid ? ('PMID ' + s.pmid) : 'no index identifier'}{s.doi ? (' / DOI ' + s.doi) : ''}</span></span>
                          {st ? <span className={'rd-chip tone-' + st.t}>{st.l}</span> : <span className="st-unchecked">not checked</span>}
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
                    <button className="sp-primary" style={{ padding: '8px 14px' }} onClick={runVerify}>{I.shieldCheck} {verify ? 'Re-verify' : 'Verify'} against PubMed and CrossRef</button>
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
