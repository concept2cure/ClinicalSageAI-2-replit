import React, { useState, useEffect, useMemo } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState, hasKeys } from '../dataConnect';
import { useSurfaceActionHandlers, notifySurfaceActionReady } from '../surfaceActions';
import { usePublishSurfaceContext } from '../surfaceContext';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ---- Source tracer — RECORDED source lineage per authored section ----

   GET /api/source-tracer/sections serves the sections that carry recorded
   canonical-source citations (authoring_citations → cre_evidence_sources via
   source-usage.service). Every row exists because a person recorded it, and
   each carries the source's checksum captured AT CITE TIME, so its standing
   against the source's content today is a stored fact the SERVER computes —
   this surface renders states, it never infers them.

   What this surface deliberately does NOT show: sentence-level "provenance"
   with model confidence scores. The previous read-model was backed by a table
   that never existed in any database and whose writer/reader disagreed about
   what its ids meant; its content was model-asserted similarity, not lineage.
   Inferred matches are never presented as locked source lineage — model-
   asserted claim support lives in the trace-chain tooling, labelled as
   inference. */

interface StCitedSource {
  citationId: string;
  state: 'current' | 'changed' | 'superseded' | 'unverified' | 'unresolved';
  citedAt: string | null;
  citationText: string | null;
  citedChecksum: string | null;
  sourceId: number | null;
  sourceTitle: string | null;
  currentChecksum: string | null;
  extractionStatus: string | null;
  mimeType: string | null;
}
interface StSection {
  id: string;
  doc: string;
  sec: string;
  sectionTitle: string | null;
  module: string | null;
  status: string;
  sources: StCitedSource[];
}

/** How each recorded citation's standing reads. Mirrors the authoring Sources
 *  rail so the same fact never gets two vocabularies. */
function stateLabel(s: StCitedSource): { text: string; tone: string; hint: string } {
  switch (s.state) {
    case 'current':
      return {
        // NOT "content unchanged since cited". Nothing in the product ever
        // revises cre_evidence_sources.checksum — a revised document is ingested
        // as a NEW source row — so `changed` is unreachable and this branch is
        // what every citation shows, always. Claiming the content is unchanged
        // was therefore a verification the system has no mechanism to perform,
        // shown to a regulatory lead as a settled fact.
        text: 'matches the source record as stored',
        tone: 'ok',
        hint: 'The checksum recorded at cite time still matches this source record. That is a statement about the RECORD, not the document: a revised document is ingested as a NEW source, which this citation does not point at, so a revision upstream is not detected here.',
      };
    case 'superseded':
      return {
        text: 'source has been replaced since cited',
        tone: 'warn',
        hint:
          'A newer version of this document was ingested after this section cited it. The ' +
          'checksum still matches, because a source keeps its bytes and its hash forever — ' +
          'the revision was recorded as a successor, and that is what says this citation ' +
          'points at a superseded version.',
      };
    case 'changed':
      return {
        text: 'source changed since cited',
        tone: 'warn',
        hint:
          'This section was drafted from earlier content. Nothing has been rewritten — re-read the source and decide whether it changes what the section says.',
      };
    case 'unresolved':
      return {
        text: 'source no longer available',
        tone: 'warn',
        hint: 'The citation is recorded but its source does not resolve in this organization — it may have been deleted.',
      };
    default:
      return {
        text: 'not checked against content',
        tone: 'idle',
        hint: 'No checksum was recorded for this citation, so no claim is made about whether the source has changed.',
      };
  }
}

function fmtWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '';
}

export function SourceTracer({ onAsk }: SurfaceViewProps) {
  const ask = onAsk || (() => {});
  // Guarded so a payload that is not `{ sections }` reaches the error branch
  // below rather than the `?? []` fallback. Without it, a wrong shape renders as
  // "no sections yet" — an empty state that is not true, on a surface whose
  // entire job is telling the user where text came from.
  const st = useLiveData<{ sections: StSection[] }>(
    '/api/source-tracer/sections',
    ['/api/source-tracer/sections'],
    hasKeys<{ sections: StSection[] }>('sections'),
  );
  const sections = st.data?.sections ?? [];

  const [selId, setSel] = useState<string | null>(null);

  // Default the selection to the first real section once they load.
  useEffect(() => {
    if (selId == null && sections.length) setSel(sections[0].id);
  }, [sections, selId]);

  const sec = sections.find(s => s.id === selId) || sections[0] || null;

  /* AnA can open any traced section by its id or a phrase from its title/document
     — the same row click a person makes — so a drive can land on a section's
     source trail. Resolved against the REAL sections with honest misses; held
     (retry) while they load, re-attempted on the ready signal below. */
  useSurfaceActionHandlers('source-tracer', {
    'source-tracer.select-section': (params) => {
      const raw = String(params.section ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a section by its id or a phrase from its title.' };
      if (st.loading) return { ok: false, reason: 'The traced sections are still loading.', retry: true };
      if (st.error) return { ok: false, reason: 'The sections did not load, so there are none to open.' };
      if (sections.length === 0) return { ok: false, reason: 'No traced sections are recorded yet.' };
      const needle = raw.toLowerCase();
      const byId = sections.filter((s) => s.id.toLowerCase() === needle);
      const hits = byId.length
        ? byId
        : sections.filter((s) => `${s.sectionTitle ?? ''} ${s.doc} ${s.sec}`.toLowerCase().includes(needle));
      if (hits.length === 0) return { ok: false, reason: `No section matching "${raw}".` };
      if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} sections — name one exactly.` };
      const s = hits[0];
      if (selId === s.id) return { ok: true, detail: `Already on ${s.sectionTitle ?? s.sec}` };
      setSel(s.id);
      return { ok: true, detail: `Opened ${s.sectionTitle ?? s.sec}` };
    },
  });
  useEffect(() => {
    if (!st.loading && !st.error) notifySurfaceActionReady('source-tracer');
  }, [st.loading, st.error]);

  const stTone = (s: string) => (s === 'approved' ? 'ok' : s === 'in_review' || s === 'review' ? 'warn' : 'idle');

  const allSources = sections.flatMap(s => s.sources);
  const changed = allSources.filter(s => s.state === 'changed');
  const unresolved = allSources.filter(s => s.state === 'unresolved');

  /* WHAT ANA SEES HERE. Published above all four early returns — the publisher
     is a hook, and the loading/error/empty states are exactly the ones AnA most
     needs to describe correctly. This surface's whole job is saying where text
     came from, so the payload distinguishes "the citation store did not respond"
     from "nothing has been cited yet": an error reported as an empty library
     would be the same lie the render branches are written to avoid.

     `changed` and `unresolved` travel because they are the answer to "can I
     trust this section" — a source whose content identity moved since it was
     cited is the thing a reviewer needs told, unprompted. */
  const anaContext = useMemo(() => {
    // Publish NO counts while loading or on a failed read — a zeroed
    // sectionCount/totalRecordedSources beside an 'error' flag reads as a false
    // "0 sections have citations." Only the success branch carries facts.
    if (st.loading) {
      return { summary: 'Source tracer, still loading recorded source lineage.' };
    }
    if (st.error) {
      return {
        summary: 'Source tracer could not load the citation store — lineage is unavailable, not absent.',
        availableActions: ['Retry the source-tracer read'],
      };
    }
    return {
      summary:
        sections.length === 0
          ? 'Source tracer: no recorded source citations yet for this organization.'
          : `Source tracer: ${sections.length} section(s) with recorded citations` +
            (sec ? `, "${sec.sectionTitle ?? sec.sec ?? sec.id}" selected` : '') +
            `; ${changed.length} source(s) changed since citation, ${unresolved.length} unresolved.`,
      facts: {
        lineageState: sections.length === 0 ? 'empty' : 'ready',
        sectionCount: sections.length,
        ...(sec ? { selectedSectionId: sec.id, selectedSectionTitle: sec.sectionTitle, selectedSectionModule: sec.module, selectedSectionStatus: sec.status, selectedSectionSources: sec.sources?.length ?? 0 } : {}),
        totalRecordedSources: allSources.length,
        sourcesChangedSinceCitation: changed.length,
        sourcesUnresolved: unresolved.length,
        // Only recorded citations appear here; nothing is inferred from text
        // similarity. AnA must not offer to "find" a source that was never cited.
        citationsAreRecordedOnly: true,
      },
      availableActions: [
        'Trace this section back to its source documents',
        'Explain which sources changed after they were cited, and what that means',
        'Explain why a source is unresolved',
      ],
    };
  }, [st.loading, st.error, sections.length, sec, allSources.length, changed.length, unresolved.length]);
  usePublishSurfaceContext('source-tracer', anaContext);

  // Four-state on the real read-model — never a fabricated stand-in.
  if (st.loading) {
    return (
      <div className="sp"><div style={{ padding: 24 }}><EmptyState title="Loading recorded source lineage…" icon={I.clock} /></div></div>
    );
  }
  if (st.error) {
    return (
      <div className="sp"><div style={{ padding: 24 }}>
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load source lineage"
          hint="The source-tracer service didn't respond (the citation store may not be provisioned for this organization yet). Sign in and retry — a failed read is a failed read, not an empty library."
        />
      </div></div>
    );
  }
  if (!sec || sections.length === 0) {
    return (
      <div className="sp"><div style={{ padding: 24 }}>
        <EmptyState
          icon={I.shieldCheck || I.check}
          title="No recorded source citations yet"
          hint="When a section records what it is drafted from — in the authoring editor's Sources rail — it appears here with its source's content identity. Only recorded citations are shown; nothing is inferred from text similarity."
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
          <p className="sp-state">
            Each section below records the sources it was drafted from, with the source&rsquo;s
            content identity captured at the moment of citation. A citation whose source has since
            changed is flagged — nothing is rewritten for you. Only recorded citations appear here;
            this surface never presents an inferred match as source lineage.
          </p>
        </div>
      </div>

      <AnswerLead
        tone={changed.length || unresolved.length ? 'calm' : 'good'}
        eyebrow="What your authored sections are drafted from"
        headline={<><b>{sections.length}</b> section{sections.length === 1 ? '' : 's'} carr{sections.length === 1 ? 'ies' : 'y'} <b>{allSources.length}</b> recorded source citation{allSources.length === 1 ? '' : 's'} — each with the source&rsquo;s content identity at cite time. Sections that recorded nothing do not appear.</>}
        body={changed.length
          ? <><b>{changed.length}</b> citation{changed.length === 1 ? ' is' : 's are'} against content the source no longer has — those sections were written from an earlier version.</>
          : <>Every recorded citation still matches the source record it points at, or says plainly that it was never checked. A revised document is ingested as a new source, so this does not establish that the underlying document is unchanged.</>}
        reassure={unresolved.length
          ? <><b>{unresolved.length}</b> citation{unresolved.length === 1 ? '' : 's'} point{unresolved.length === 1 ? 's' : ''} at a source that no longer resolves — kept visible rather than dropped, because &ldquo;cites something unavailable&rdquo; is worth seeing.</>
          : <>Recorded lineage only — nothing here is a similarity guess.</>}
        action={{
          label: changed.length ? 'Review sections on changed sources' : 'Analyze for unrecorded claims',
          icon: I.shieldCheck,
          onClick: () => ask(changed.length
            ? 'List every section whose recorded source changed after it was cited, and for each, what in the section may no longer match. Do not rewrite anything yet.'
            : 'Analyze ' + sec.doc + ' for claims with no recorded source citation and flag each one.'),
        }}
        secondary="Or inspect any section's recorded sources below."
      />

      <div className="sp-2col" style={{ gridTemplateColumns: '296px 1fr' }}>
        <div className="pj-card" style={{ alignSelf: 'start' }}>
          <div className="pj-card-h"><span className="t">Sections with recorded sources</span><span className="s">{sections.length}</span></div>
          <div className="pj-card-b" style={{ padding: 8 }}>
            <div className="sp-list">
              {sections.map(s => {
                const nChanged = s.sources.filter(x => x.state === 'changed').length;
                return (
                  <button key={s.id} className="sp-row" style={{ width: '100%', textAlign: 'left', borderRadius: 8, padding: '9px 10px', border: selId === s.id ? '1px solid var(--accent-muted)' : '1px solid transparent', background: selId === s.id ? 'var(--accent-000)' : 'transparent' }} onClick={() => setSel(s.id)}>
                    <span className="sp-row-b">
                      <span className="sp-row-t">{s.doc}</span>
                      <span className="sp-row-s">{'§'}{s.sec} / {s.sources.length} source{s.sources.length === 1 ? '' : 's'}{nChanged ? ` / ${nChanged} changed` : ''}</span>
                    </span>
                    <span className={'rd-chip tone-' + stTone(s.status)}>{s.status}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          {/* Recorded citations for the selected section — the real
              authoring_citations rows, states computed server-side. */}
          <div className="pj-card">
            <div className="pj-card-h">
              <span className="t">{sec.doc} / {'§'}{sec.sec}{sec.sectionTitle ? ` — ${sec.sectionTitle}` : ''}</span>
              <span className="s">{sec.sources.length} recorded</span>
            </div>
            <div className="pj-card-b">
              <div className="pj-seclbl">Drafted from <span style={{ fontWeight: 400, color: 'var(--text-400)' }}>/ recorded citation — content identity at cite time — standing today</span></div>
              <div className="st-sents">
                {sec.sources.map(s => {
                  const lab = stateLabel(s);
                  return (
                    <div key={s.citationId} className="st-sent">
                      <div className="st-sent-src">
                        <span className="st-sent-title" style={{ fontWeight: 600 }}>
                          {s.sourceTitle ?? 'Source no longer resolvable'}
                        </span>
                        <span className={'rd-chip tone-' + lab.tone} title={lab.hint}>{lab.text}</span>
                        {fmtWhen(s.citedAt) && <span style={{ fontSize: 12, color: 'var(--text-400,#667085)' }}>cited {fmtWhen(s.citedAt)}</span>}
                      </div>
                      {s.citationText && <div className="st-sent-txt" style={{ marginTop: 4 }}>{s.citationText}</div>}
                      {s.citedChecksum && (
                        <div style={{ fontSize: 11.5, color: 'var(--text-400,#667085)', marginTop: 4 }}>
                          cited checksum <span className="mono">{s.citedChecksum.slice(0, 12)}…</span>
                          {s.state === 'changed' && s.currentChecksum && (
                            <> · source now <span className="mono">{s.currentChecksum.slice(0, 12)}…</span></>
                          )}
                        </div>
                      )}
                      {s.state === 'changed' && (
                        <div className="cm-pushbar" style={{ marginTop: 6 }}>
                          <button className="nda-open" onClick={() => ask(
                            `The source "${s.sourceTitle ?? 'this document'}" changed after section ${sec.sec} of ${sec.doc} was drafted from it. Read the current source and tell me what in this section no longer matches. Do not rewrite it yet.`,
                          )}>
                            {I.sparkles} Ask what changed
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="cm-pushbar" style={{ marginTop: 14 }}>
                <button className="sp-ask" onClick={() => ask('Analyze ' + sec.doc + ' ' + '§' + sec.sec + ' for any claim without a recorded source citation and flag each one. Do not invent citations.')}>{I.sparkles} Analyze for unrecorded claims</button>
                <button className="sp-ask" onClick={() => ask('Show the audit trail for ' + sec.doc + ' ' + '§' + sec.sec + ' including who recorded each source citation and when.')}>{I.history} View audit trail</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
