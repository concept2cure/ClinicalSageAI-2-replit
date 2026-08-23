/**
 * Filings Catalog -- kit app/filings-catalog.jsx ported (registry id
 * `filings-catalog`).
 *
 * The canonical, organized index of every regulatory filing type (113 types
 * across 4 segments). Segment tabs -> categories -> filing rows. Search
 * across all. Each row shows authority, format, CTD and routes into its
 * execution workflow ("Start").
 */
import React, { useState, useMemo } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import {
  FILINGS_TAXONOMY,
  FILING_WF_SURFACE,
  FILING_WF_LABEL,
  FILING_LOOP_ARCHETYPE,
  FILING_LOOP,
} from '../fixtures/filings-catalog-data';
import type { FilingItem } from '../fixtures/filings-catalog-data';
import '../styles/project-home-v2.css';

/* ---- Filing detail slide-over ---- */

interface FilingSelection {
  it: FilingItem;
  segLabel: string;
  catLabel: string;
}

function FilingDetail({
  sel,
  hasWf,
  onClose,
  onStart,
  onAsk,
  onNav,
}: {
  sel: FilingSelection;
  hasWf: boolean;
  onClose: () => void;
  onStart: () => void;
  onAsk: (text: string) => void;
  onNav: (id: string) => void;
}) {
  const { it, segLabel, catLabel } = sel;
  const wfLabel = it.wf ? (FILING_WF_LABEL[it.wf] || it.wf) : null;
  const arch = FILING_LOOP_ARCHETYPE[it.wf];
  const loop = arch ? FILING_LOOP[arch] : null;
  const goSurf = (surf: string) => {
    onNav(surf);
    onClose();
  };
  const build = hasWf
    ? `Opens the ${wfLabel} workflow — structured sections, evidence binding, and validation gates, with AnA drafting alongside you.`
    : 'Authored in the document editor with AnA — from the section template, grounded in your linked evidence.';
  const meta: [string, string][] = [
    ['Authority / region', it.a],
    ['Submission format', it.f && it.f !== '—' ? it.f : 'No standard transmission format'],
    ['CTD module', it.c && it.c !== '—' ? it.c : 'Not CTD-structured'],
    ['Execution workflow', wfLabel || 'Document editor (no dedicated workflow)'],
  ];

  return (
    <div className="fc-detail-bd" onClick={onClose}>
      <div className="fc-detail" onClick={(e) => e.stopPropagation()}>
        <div className="fc-detail-top">
          <div className="fc-detail-crumb">{segLabel}{catLabel ? ' -- ' + catLabel : ''}</div>
          <button className="fc-detail-x" onClick={onClose}>{I.close}</button>
        </div>
        <h2 className="fc-detail-t">{it.n}</h2>
        {wfLabel && <div className="fc-detail-wf">{I.gitCompare || I.arrowRight} Routes into the {wfLabel} workflow</div>}
        <p className="fc-detail-d">{it.d}</p>

        <div className="fc-detail-sec">What it is</div>
        <div className="fc-detail-grid">
          {meta.map(([k, v], i) => (
            <div key={i} className="fc-detail-cell"><span className="fc-detail-k">{k}</span><span className="fc-detail-v">{v}</span></div>
          ))}
        </div>

        {loop && <>
          <div className="fc-detail-sec">The lifecycle — concept to approval, and the loop back from the agency</div>
          <div className="fc-loop-clock">{I.clock || I.info} {loop.clock}</div>
          <div className="fc-loop-arc">
            {loop.stages.map((s, i) => (
              <React.Fragment key={i}>
                <div className="fc-loop-stage"><span className="n">{i + 1}</span><span className="l">{s}</span></div>
                {i < loop.stages.length - 1 && <span className="fc-loop-arrow">{I.arrowRight}</span>}
              </React.Fragment>
            ))}
          </div>
          <div className="fc-loop-ret">
            <span className="fc-loop-ret-ic">{I.rotateCcw || I.refresh || I.alertTriangle}</span>
            <div><div className="fc-loop-ret-t">If it comes back: {loop.ret.label}</div><div className="fc-loop-ret-d">{loop.ret.desc}</div></div>
          </div>
        </>}

        <div className="fc-detail-sec">How you'll build it</div>
        <p className="fc-detail-build">{build}</p>

        <div className="fc-detail-actions">
          <button className="fc-detail-go" onClick={onStart}>{hasWf ? 'Open workflow' : 'Start with AnA'} {I.arrowRight}</button>
          <button className="fc-detail-ask" onClick={() => { onAsk('Tell me about the ' + it.n + ' -- when it\'s required, what it contains, and what evidence I need.'); onClose(); }}>{I.sparkles} Ask AnA</button>
        </div>

        {loop && <>
          <div className="fc-detail-sec">Run the whole loop</div>
          <div className="fc-loop-links">
            <button className="fc-loop-link" onClick={() => goSurf('submission-center')}><span className="ic">{I.rocket || I.send}</span><span className="t">Assemble &amp; dispatch</span><span className="s">Submission Center</span></button>
            <button className="fc-loop-link" onClick={() => goSurf('communication-center')}><span className="ic">{I.mail || I.inbox}</span><span className="t">Track the FDA loop</span><span className="s">Communication Center</span></button>
            <button className="fc-loop-link" onClick={() => goSurf('tasks')}><span className="ic">{I.checkSquare || I.check}</span><span className="t">Plan the work</span><span className="s">Tasking</span></button>
            <button className="fc-loop-link" onClick={() => goSurf('program-journey')}><span className="ic">{I.gitBranch || I.map}</span><span className="t">See the journey</span><span className="s">Program journey</span></button>
          </div>
        </>}
      </div>
    </div>
  );
}

/* ---- Inline meta component ---- */

function Meta({ it }: { it: FilingItem }) {
  return (
    <span className="fc-meta">
      <span className="fc-meta-auth">{it.a}</span>
      {it.f && it.f !== '—' && <span className="fc-meta-fmt">{it.f}</span>}
      {it.c && it.c !== '—' && <span className="fc-meta-ctd mono">{it.c}</span>}
    </span>
  );
}

/* ---- Component ---- */

export function FilingsCatalog({ onAsk, onNav }: SurfaceViewProps) {
  const TAX = FILINGS_TAXONOMY;
  const [seg, setSeg] = useState(TAX[0] ? TAX[0].seg : 'pharma');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(0);
  const [sel, setSel] = useState<FilingSelection | null>(null);

  const total = useMemo(() => TAX.reduce((a, s) => a + s.cats.reduce((b, c) => b + c.items.length, 0), 0), [TAX]);
  const term = q.trim().toLowerCase();

  const match = (it: FilingItem) => !term ||
    it.n.toLowerCase().includes(term) || it.a.toLowerCase().includes(term) ||
    it.d.toLowerCase().includes(term) || (it.c || '').toLowerCase().includes(term) ||
    (FILING_WF_LABEL[it.wf] || '').toLowerCase().includes(term);

  const results = useMemo(() => {
    if (!term) return [];
    const out: { it: FilingItem; seg: string; segIcon: string; cat: string }[] = [];
    TAX.forEach((s) => s.cats.forEach((c) => c.items.forEach((it) => { if (match(it)) out.push({ it, seg: s.label, segIcon: s.icon, cat: c.cat }); })));
    return out;
  }, [TAX, term]);

  const segObj = TAX.find((s) => s.seg === seg) || TAX[0] || { cats: [] as any[] };

  /* What AnA can see of this screen.
     The catalog is a controlled taxonomy, not tenant data — so there is no
     loading or error branch to publish. What varies, and what a question here
     is always about, is WHICH slice of it the user is looking at: the segment
     tab, the search term, and the filing type they have opened. */
  const anaContext = useMemo(() => {
    const cats = segObj.cats as { cat: string; items: FilingItem[] }[];
    return {
      summary:
        `Filings catalog: ${total} regulatory filing types across ${TAX.length} segment(s). ` +
        (term
          ? `Searching all segments for "${term}" — ${results.length} match(es).`
          : `The "${TAX.find((s) => s.seg === seg)?.label ?? seg}" segment is open, ` +
            `${cats.length} category(ies).`) +
        (sel ? ` "${sel.it.n}" (${sel.segLabel} · ${sel.catLabel}) is open in the detail pane.` : ''),
      facts: {
        totalFilingTypes: total,
        openSegment: seg,
        searchTerm: term || null,
        searchMatches: term ? results.length : null,
        categoriesInSegment: cats.map((c) => ({ category: c.cat, filingTypes: c.items.length })),
        selectedFiling: sel
          ? {
              name: sel.it.n, authority: sel.it.a, format: sel.it.f, ctd: sel.it.c,
              workflow: sel.it.wf, description: sel.it.d,
              segment: sel.segLabel, category: sel.catLabel,
              startsIn: FILING_WF_SURFACE[sel.it.wf] ?? null,
            }
          : null,
      },
      availableActions: [
        'Switch segment tab, or search every segment for a filing type',
        'Open a filing type to read its authority, format, CTD mapping and workflow',
        'Start a filing, which routes into that filing type\u2019s execution workflow',
      ],
    };
  }, [TAX, total, seg, segObj, term, results.length, sel]);
  usePublishSurfaceContext('filings-catalog', anaContext);

  const startFiling = (it: FilingItem) => {
    /*
     * `localStorage.setItem('C2C_PATHWAY', pw)` used to run here, first.
     *
     * `C2C_PATHWAY` has exactly one writer — this line — and has never had a
     * reader, in any file, in any commit. That alone makes it dead. What made
     * it worth removing rather than leaving is that it was the one storage
     * write in this component with no `try/catch` (compare `goSurf` at :52,
     * same file, which wraps), and it ran BEFORE `onNav`. Anywhere
     * localStorage throws — Safari private browsing, storage disabled, quota —
     * the whole handler threw and no filing started at all. A dead write was
     * gating a live navigation.
     */
    const surf = FILING_WF_SURFACE[it.wf];
    if (surf && onNav) onNav(surf);
    else if (onAsk) onAsk('Start a ' + it.n + ' -- set up the document structure and required sections');
  };

  return (
    <div className="fc">
      <div className="fc-head">
        <button className="fc-back" onClick={() => onNav && onNav('projects')}>{I.left} Projects</button>
        <div className="fc-eyebrow">Start a new filing</div>
        <h1 className="fc-title">What are you filing?</h1>
        <div className="fc-sub">Search {total} filing types, or browse by area. Each opens its build workflow.</div>
        <div className="fc-search">
          <span className="fc-search-ic">{I.search}</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search filings" placeholder="Search by name, authority, or pathway — CSR, 510(k), EMA..." autoFocus />
          {q && <button className="fc-search-x" onClick={() => setQ('')}>{I.close}</button>}
        </div>
      </div>

      {term ? (
        <div className="fc-results">
          <div className="fc-result-note">{results.length} filing{results.length === 1 ? '' : 's'} match &ldquo;{q}&rdquo;</div>
          {results.map(({ it, seg: segLabel, cat: catLabel }, i) => (
            <button key={i} className="fc-item" onClick={() => setSel({ it, segLabel, catLabel })}>
              <span className="fc-item-l">
                <span className="fc-item-top"><span className="fc-item-n">{it.n}</span>{it.wf && <span className="fc-item-wf">{FILING_WF_LABEL[it.wf] || it.wf}</span>}<span className="fc-item-seg">{segLabel}</span></span>
                <span className="fc-item-d">{it.d}</span>
              </span>
              <Meta it={it} />
              <span className="fc-item-go">{I.arrowRight}</span>
            </button>
          ))}
          {!results.length && (
            <div className="fc-empty"><span className="fc-empty-ic">{I.search}</span><p>Nothing matches &ldquo;{q}&rdquo;. Try an authority (FDA, EMA), a pathway (510(k), BLA), or a document (CSR, CER).</p></div>
          )}
        </div>
      ) : (
        <>
          <div className="fc-tabs">
            {TAX.map((s) => {
              const n = s.cats.reduce((a, c) => a + c.items.length, 0);
              return (
                <button key={s.seg} className="fc-tab" data-on={seg === s.seg || undefined} onClick={() => { setSeg(s.seg); setOpen(0); }}>
                  <span className="fc-tab-ic">{I[s.icon] || I.fileText}</span>
                  <span className="fc-tab-l">{s.label}</span>
                  <span className="fc-tab-n">{n}</span>
                </button>
              );
            })}
          </div>

          <div className="fc-accordion">
            {segObj.cats.map((c, ci) => {
              const isOpen = open === ci;
              return (
                <section key={c.cat} className="fc-acc" data-open={isOpen || undefined}>
                  <button className="fc-acc-h" onClick={() => setOpen(isOpen ? -1 : ci)}>
                    <span className="fc-acc-chev">{I.chevDown}</span>
                    <span className="fc-acc-t">{c.cat}</span>
                    <span className="fc-acc-n">{c.items.length}</span>
                    <span className="fc-acc-d">{c.desc}</span>
                  </button>
                  {isOpen && (
                    <div className="fc-acc-body">
                      {c.items.map((it, i) => (
                        <button key={i} className="fc-item" onClick={() => setSel({ it, segLabel: segObj.label, catLabel: c.cat })}>
                          <span className="fc-item-l">
                            <span className="fc-item-top"><span className="fc-item-n">{it.n}</span>{it.wf && <span className="fc-item-wf">{FILING_WF_LABEL[it.wf] || it.wf}</span>}</span>
                            <span className="fc-item-d">{it.d}</span>
                          </span>
                          <Meta it={it} />
                          <span className="fc-item-go">{I.arrowRight}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {sel && (
        <FilingDetail
          sel={sel}
          hasWf={!!FILING_WF_SURFACE[sel.it.wf]}
          onClose={() => setSel(null)}
          onStart={() => { startFiling(sel.it); setSel(null); }}
          onAsk={onAsk}
          onNav={onNav}
        />
      )}
    </div>
  );
}
