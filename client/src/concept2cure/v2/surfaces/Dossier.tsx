import React, { useState, useRef, useEffect } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  getDossierSpine,
  flattenDocs,
  pathTo,
  rollup,
  isLeaf,
  type DossierDoc,
  type DossierFolder,
  type DossierNode,
  type DossierSpine,
} from '../fixtures/dossier-data';
import '../styles/project-home-v2.css';

/* ── Constants ── */

const DSR_ST: Record<string, string> = { final: 'ok', approved: 'ok', complete: 'ok', review: 'warn', draft: 'neutral', not_started: 'neutral' };
const DSR_STL: Record<string, string> = { final: 'Final', approved: 'Approved', complete: 'Complete', review: 'In review', draft: 'Draft', not_started: 'Not started' };
const DSR_STAGES = [
  { id: 'outline', label: 'Outline', ic: 'list' },
  { id: 'drafting', label: 'AnA drafting', ic: 'sparkles' },
  { id: 'draft', label: 'Draft', ic: 'penLine' },
  { id: 'review', label: 'In review', ic: 'messageSquare' },
  { id: 'final', label: 'Approved', ic: 'shieldCheck' },
];
const DSR_REACHED: Record<string, number> = { not_started: 0, draft: 2, complete: 2, review: 3, approved: 4, final: 4 };

function naturalStage(st: string): string {
  return (st === 'final' || st === 'approved' || st === 'complete') ? 'final' : st === 'review' ? 'review' : st === 'not_started' ? 'outline' : 'draft';
}

/* ── Inline data room (verbatim from kit) ── */

interface DataRoomSource {
  id: string;
  title: string;
  kind: string;
  size: string;
  when: string;
  cites: number;
  ic: string;
}

const DATA_ROOM: DataRoomSource[] = [
  { id: 's1', title: 'CSR — pivotal study.pdf', kind: 'Study report', size: '14.2 MB', when: 'locked', cites: 8, ic: 'fileText' },
  { id: 's2', title: 'Performance / accuracy dataset', kind: 'Dataset', size: '40.1 MB', when: 'locked', cites: 5, ic: 'database' },
  { id: 's3', title: 'Predicate / equivalent device file', kind: 'Reference', size: '2.1 MB', when: '6d ago', cites: 3, ic: 'fileText' },
  { id: 's4', title: 'Risk management file (ISO 14971)', kind: 'Risk', size: '8.7 MB', when: '2w ago', cites: 6, ic: 'alertTriangle' },
  { id: 's5', title: 'Literature corpus', kind: 'Literature', size: '—', when: 'live', cites: 24, ic: 'search' },
];

/* ── Document body builder (faithful hero content) ── */

interface BodySubsec {
  n: string;
  t: string;
  paras: string[];
  table?: { cap: string; cols: string[]; rows: string[][] };
}

interface DocBody {
  heading: string;
  subsecs: BodySubsec[];
  refs?: string[];
}

const DSR_BODY_25: DocBody = {
  heading: '2.5  Clinical Overview',
  subsecs: [
    {
      n: '2.5.1', t: 'Product Development Rationale', paras: [
        'BX-204 is a humanized IgG1κ monoclonal antibody targeting RTK-X, developed for advanced RTK-X–overexpressing solid tumors in patients who have received at least one prior line of systemic therapy.',
        'The clinical development program comprises one pivotal single-arm study (BX204-201) and one dose-finding study (BX204-102), supported by a comprehensive nonclinical package and Module 3 quality data.',
      ],
    },
    {
      n: '2.5.4', t: 'Overview of Efficacy', paras: [
        'In the pivotal study BX204-201, the objective response rate (ORR) by independent central review was 42.1% (95% CI 35.8–48.6; n=214), per the locked CSR-201 primary analysis (data lock 18 Apr 2026). Median duration of response was 11.2 months.',
        'Efficacy results are consistent across pre-specified subgroups, supporting a favourable benefit–risk profile under the accelerated-approval framework.',
      ],
      table: {
        cap: 'Table 2.5.4-1  Key efficacy results — BX204-201 (ITT, n=214)',
        cols: ['Endpoint', 'Result', '95% CI'],
        rows: [
          ['Objective response rate', '42.1%', '35.8–48.6'],
          ['Complete response', '9.3%', '5.9–13.9'],
          ['Median duration of response', '11.2 mo', '9.1–14.0'],
          ['Median progression-free survival', '7.8 mo', '6.4–9.2'],
        ],
      },
    },
    {
      n: '2.5.5', t: 'Overview of Safety', paras: [
        'The integrated safety population (n=176 at the RP2D) showed a manageable, on-target profile. The most common Grade ≥3 events were hypertension (8.0%) and transaminase elevation (5.1%); no new safety signals were identified.',
      ],
    },
  ],
  refs: [
    'CSR-201 — Clinical Study Report, BX204-201 (locked 18 Apr 2026), §7.4',
    'ADaM ADRS (locked) — primary efficacy analysis dataset',
    'ICH M4E(R2) — Common Technical Document',
  ],
};

function getDocBody(doc: DossierDoc): DocBody {
  if (doc.id === 'd25') return DSR_BODY_25;
  return {
    heading: `${doc.num && doc.num !== '—' ? doc.num + '  ' : ''}${doc.title}`,
    subsecs: [{
      n: doc.num || '§',
      t: doc.title,
      paras: [
        doc.preview,
        'This section is compiled from the linked source records in the data room and maintained under version control with full provenance to each underlying study, dataset, and quality record.',
        'All quantitative claims are traced to locked source data; figures and tables regenerate on source update and are flagged for re-review before promotion.',
      ],
    }],
    refs: ['Linked source records — see Data room', '21 CFR Part 11 audit trail'],
  };
}

/* ── Recursive tree node ── */

interface TreeNodeProps {
  node: DossierNode;
  depth: number;
  docId: string;
  onPick: (id: string) => void;
  expanded: Record<string, boolean>;
  toggle: (id: string) => void;
}

function TreeNode({ node, depth, docId, onPick, expanded, toggle }: TreeNodeProps) {
  if (isLeaf(node)) {
    return (
      <button
        className={'dsr2-leaf' + (node.id === docId ? ' on' : '')}
        style={{ paddingLeft: (10 + depth * 14) + 'px' }}
        onClick={() => onPick(node.id)}
      >
        <span className="dsr2-leaf-dot" data-st={node.status} />
        {node.num && node.num !== '—' && <span className="dsr2-leaf-num">{node.num}</span>}
        <span className="dsr2-leaf-t">{node.title}</span>
        <span className={'reg-pill ' + (DSR_ST[node.status] || 'neutral') + ' dsr2-leaf-pill'}>
          {DSR_STL[node.status] || node.status}
        </span>
      </button>
    );
  }

  const folder = node as DossierFolder;
  const open = expanded[folder.id];
  const r = rollup(folder);

  return (
    <div className="dsr2-folder">
      <button
        className="dsr2-fold"
        style={{ paddingLeft: (8 + depth * 14) + 'px' }}
        onClick={() => toggle(folder.id)}
      >
        <span className="dsr2-chev">{open ? '▾' : '▸'}</span>
        <span className="dsr2-fold-ic">{I.folder}</span>
        <span className="dsr2-fold-mid">
          <span className="dsr2-fold-code">{folder.code}</span>
          <span className="dsr2-fold-label">{folder.label}</span>
        </span>
        <span className="dsr2-fold-meta">
          {r.n}
          <span className="dsr2-fold-pct">{r.pct}%</span>
        </span>
      </button>
      {open && (
        <div className="dsr2-children">
          {folder.children.map((c) => (
            <TreeNode key={c.id} node={c} depth={depth + 1} docId={docId} onPick={onPick} expanded={expanded} toggle={toggle} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── AnA co-author conversation (prominent, builds documents) ── */

interface AnaMsg {
  role: 'user' | 'ana';
  text: string;
}

function DossierAna({ doc, spine, onStage }: { doc: DossierDoc; spine: string; onStage: (s: string) => void }) {
  const seed = (d: DossierDoc): AnaMsg[] => [
    {
      role: 'ana',
      text: `I'm bound to ${d.num && d.num !== '—' ? d.num + ' — ' : ''}${d.title}. It's ${(DSR_STL[d.status] || d.status).toLowerCase()} at ${d.pct || 0}%. I can draft it from the linked source evidence, reconcile a flag, or compare to the last approved version.`,
    },
  ];
  const [msgs, setMsgs] = useState<AnaMsg[]>(() => seed(doc));
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { setMsgs(seed(doc)); setVal(''); }, [doc.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [msgs]);

  const prompts = [
    { label: 'Draft this section from the linked evidence', go: () => run('draft') },
    doc.flag
      ? { label: 'Reconcile the open flag', go: () => run('reconcile') }
      : { label: 'Check completeness & gaps', go: () => run('gaps') },
    { label: 'Compare to the last approved version', go: () => run('compare') },
  ];

  function push(role: 'user' | 'ana', text: string) {
    setMsgs((m) => [...m, { role, text }]);
  }

  function run(kind: string) {
    const ask =
      kind === 'draft' ? `Draft ${doc.num || ''} ${doc.title} from the linked source evidence.`
        : kind === 'reconcile' ? `Reconcile: ${doc.flag}`
          : kind === 'gaps' ? `What is missing in ${doc.title} before it can be promoted?`
            : kind === 'compare' ? `Compare the current ${doc.title} to the last approved version.`
              : val.trim();
    if (!ask) return;
    push('user', ask);
    setVal('');
    setBusy(true);
    if (kind === 'draft') onStage('drafting');
    setTimeout(() => {
      const reply =
        kind === 'draft'
          ? `Drafting ${doc.title} now — pulling from ${spine}. I'm grounding each quantitative claim to the locked source records and tracking confidence + provenance per paragraph. The draft is rendering into the document beside us; review the flagged claims before promotion.`
          : kind === 'reconcile'
            ? `To clear "${doc.flag}", I'll align the acceptance criteria against the three linked records and surface the deltas as tracked changes for your sign-off.`
            : kind === 'gaps'
              ? `${doc.title} is ${doc.pct || 0}% complete. Outstanding: required evidence links, one open claim-flag, and a reviewer pass. I can draft the missing subsections and route for review.`
              : `Comparing to the last approved version — I'll summarize the deltas (added claims, changed figures, new citations) and mark anything that needs re-review.`;
      push('ana', reply);
      setBusy(false);
      if (kind === 'draft') setTimeout(() => onStage('draft'), 900);
    }, 650);
  }

  return (
    <div className="dsr2-ana">
      <div className="dsr2-ana-h">
        <span className="dsr2-ana-mark">{I.sparkles}</span>
        <div>
          <div className="dsr2-ana-title">AnA · co-author</div>
          <div className="dsr2-ana-ctx">{doc.num && doc.num !== '—' ? doc.num + ' · ' : ''}{doc.title}</div>
        </div>
      </div>
      <div className="dsr2-ana-scroll" ref={scroller}>
        {msgs.map((m, i) => (
          <div key={i} className={'dsr2-msg ' + m.role}>
            {m.role === 'ana' && <span className="dsr2-msg-av">{I.sparkles}</span>}
            <div className="dsr2-msg-b">{m.text}</div>
          </div>
        ))}
        {busy && (
          <div className="dsr2-msg ana">
            <span className="dsr2-msg-av">{I.sparkles}</span>
            <div className="dsr2-msg-b dsr2-typing"><span /><span /><span /></div>
          </div>
        )}
      </div>
      <div className="dsr2-prompts">
        {prompts.map((p, i) => (
          <button key={i} className="dsr2-prompt" onClick={p.go} disabled={busy}>{p.label}</button>
        ))}
      </div>
      <div className="dsr2-composer">
        <input
          className="dsr2-input"
          value={val}
          placeholder="Ask AnA to draft, revise, or check this document…"
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run('free'); }}
        />
        <button className="dsr2-send" disabled={busy || !val.trim()} onClick={() => run('free')}>
          {I.arrowRight}
        </button>
      </div>
    </div>
  );
}

/* ════ Dossier — document-first workspace, segment-aware + global ════ */

export function Dossier({ onAsk, onNav, segment }: SurfaceViewProps) {
  const segs = [
    { id: 'medtech', label: 'Medical Device' },
    { id: 'diagnostics', label: 'Diagnostics (IVD)' },
    { id: 'biotech', label: 'Biotech' },
    { id: 'pharma', label: 'Pharma' },
  ];

  const initSeg = segment && getDossierSpine(segment).tree.length > 0 ? segment : 'medtech';
  const [seg, setSeg] = useState(initSeg);
  const spine = getDossierSpine(seg);
  const allDocs = flattenDocs(spine.tree);
  const [view, setView] = useState<'dossier' | 'dataroom'>('dossier');
  const [docId, setDocId] = useState(allDocs[0].id);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const e: Record<string, boolean> = {};
    spine.tree.forEach((n) => { e[n.id] = true; });
    return e;
  });
  const [stageOv, setStageOv] = useState<Record<string, string>>({});

  const switchSeg = (id: string) => {
    const sp = getDossierSpine(id);
    const docs = flattenDocs(sp.tree);
    setSeg(id);
    setDocId(docs[0].id);
    const e: Record<string, boolean> = {};
    sp.tree.forEach((n) => { e[n.id] = true; });
    setExpanded(e);
  };

  const toggle = (id: string) => setExpanded((x) => ({ ...x, [id]: !x[id] }));

  const pick = (id: string) => {
    setDocId(id);
    const path = pathTo(spine.tree, id);
    if (path) setExpanded((x) => { const n = { ...x }; path.forEach((p) => (n[p] = true)); return n; });
  };

  const doc = allDocs.find((d) => d.id === docId) || allDocs[0];
  const body = getDocBody(doc);
  const stage = stageOv[doc.id] || naturalStage(doc.status);
  const setStage = (s: string) => setStageOv((o) => ({ ...o, [doc.id]: s }));

  const openEditor = () => {
    const target = seg === 'medtech' ? 'device-510k' : seg === 'diagnostics' ? 'device-diagnostics' : 'document-authoring';
    try { localStorage.setItem('c2c_open_surface', target); } catch (_e) { /* noop */ }
    onNav && onNav(target);
  };

  return (
    <div className="dsr">
      <div className="dsr-head">
        <div>
          <div className="reg-eyebrow">Workspace · documents</div>
          <h1 className="dsr-title">Dossier</h1>
          <p className="dsr-sub">
            {spine.program} · {spine.spine} — the full document architecture, every folder and submission document in process, with the document and its AnA co-author in view.
          </p>
        </div>
        <div className="dsr-head-acts">
          <div className="dsr-toggle">
            <button data-on={view === 'dossier' || undefined} onClick={() => setView('dossier')}>
              {I.folder} Dossier
            </button>
            <button data-on={view === 'dataroom' || undefined} onClick={() => setView('dataroom')}>
              {I.database} Data room
            </button>
          </div>
        </div>
      </div>

      {/* segment switcher — the dossier architecture follows the client type */}
      <div className="dsr2-segs">
        {segs.map((s) => (
          <button
            key={s.id}
            className={'dsr2-seg' + (seg === s.id ? ' on' : '')}
            onClick={() => switchSeg(s.id)}
          >
            {s.label}
            <span className="dsr2-seg-std">
              {getDossierSpine(s.id).standard === 'eCTD' ? 'eCTD' : getDossierSpine(s.id).standard}
            </span>
          </button>
        ))}
      </div>

      {view === 'dossier' ? (
        <div className="dsr-grid v2">
          {/* hierarchical tree */}
          <aside className="dsr2-tree">
            <div className="dsr2-tree-h">{spine.spine}</div>
            {spine.tree.map((n) => (
              <TreeNode key={n.id} node={n} depth={0} docId={docId} onPick={pick} expanded={expanded} toggle={toggle} />
            ))}
          </aside>

          {/* the document -- hero */}
          <div className="dsr-doc-view">
            <div className="dsr-dv-bar">
              <div className="dsr-dv-id">
                {(doc.num && doc.num !== '—' ? doc.num + ' · ' : '') + doc.title}
                <span className={'reg-pill ' + (DSR_ST[doc.status] || 'neutral')}>
                  {DSR_STL[doc.status] || doc.status}
                </span>
              </div>
              <div className="dsr-dv-acts">
                <button className="dsr-dv-btn" title="Export PDF">{I.download} PDF</button>
                <button className="dsr-dv-btn" title="Export .docx">{I.fileText} Word</button>
                <button className="dsr-dv-btn pri" onClick={openEditor}>{I.penLine} Open in editor</button>
              </div>
            </div>

            <div className="dsr-stages">
              {DSR_STAGES.map((s, i) => {
                const reached = i <= (DSR_REACHED[doc.status] || 0);
                return (
                  <button
                    key={s.id}
                    className="dsr-stage"
                    data-on={stage === s.id || undefined}
                    data-reached={reached || undefined}
                    onClick={() => setStage(s.id)}
                  >
                    <span className="dsr-stage-ic">{I[s.ic] || I.dot}</span> {s.label}
                  </button>
                );
              })}
            </div>

            <div className="dsr-page-scroll">
              <div className={'dsr-doc-page stage-' + stage}>
                <div className="dsr-pg-conf">CONFIDENTIAL · {spine.program}</div>
                <div className="dsr-pg-title">
                  <div className="dsr-pg-docnum">
                    {spine.spine} · {doc.num && doc.num !== '—' ? doc.num + ' · ' : ''}{doc.type}
                  </div>
                  <h2 className="dsr-pg-h">{body.heading}</h2>
                  <div className="dsr-pg-metaline">
                    {doc.ver} · {doc.owner} · edited {doc.updated} · Status: {DSR_STL[doc.status] || doc.status}
                  </div>
                </div>

                {stage === 'drafting' && (
                  <div className="dsr-pg-drafting">
                    {I.sparkles} AnA is drafting {doc.num || doc.title} from the linked source evidence…
                  </div>
                )}

                {stage === 'outline' ? (
                  <div className="dsr-pg-outline">
                    {body.subsecs.map((ss) => (
                      <div key={ss.n} className="dsr-pg-ol-row"><span>{ss.n}</span> {ss.t}</div>
                    ))}
                    <div className="dsr-pg-ol-note">
                      Section skeleton — headings approved, content pending. Ask AnA to draft from linked evidence.
                    </div>
                  </div>
                ) : (
                  body.subsecs.map((ss, si) => {
                    const show = stage === 'drafting' ? si === 0 : true;
                    if (!show) return null;
                    return (
                      <div key={ss.n} className="dsr-pg-sec">
                        <h3 className="dsr-pg-sh">{ss.n}  {ss.t}</h3>
                        {ss.paras.map((p, pi) => {
                          const last = stage === 'drafting' && si === 0 && pi === ss.paras.length - 1;
                          return (
                            <p key={pi} className="dsr-pg-p">
                              {p}
                              {last && <span className="dsr-caret" />}
                            </p>
                          );
                        })}
                        {ss.table && stage !== 'drafting' && (
                          <div className="dsr-pg-tbl-wrap">
                            <div className="dsr-pg-tbl-cap">{ss.table.cap}</div>
                            <table className="dsr-pg-tbl">
                              <thead>
                                <tr>{ss.table.cols.map((c, ci) => <th key={ci}>{c}</th>)}</tr>
                              </thead>
                              <tbody>
                                {ss.table.rows.map((r, ri) => (
                                  <tr key={ri}>{r.map((c, ci) => <td key={ci}>{c}</td>)}</tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {stage !== 'outline' && stage !== 'drafting' && body.refs && (
                  <div className="dsr-pg-refs">
                    <div className="dsr-pg-refs-h">References</div>
                    {body.refs.map((r, ri) => (
                      <div key={ri} className="dsr-pg-ref"><span>{ri + 1}.</span> {r}</div>
                    ))}
                  </div>
                )}

                {doc.flag && stage !== 'outline' && (
                  <div className="dsr-page-flag">
                    {I.alertTriangle} {doc.flag} — AnA can reconcile this before promotion.
                  </div>
                )}

                {stage === 'draft' && <div className="dsr-wm">DRAFT</div>}
                {stage === 'final' && (
                  <div className="dsr-seal">
                    {I.shieldCheck} APPROVED
                    <span>{doc.owner} · 21 CFR §11 e-signature</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* prominent AnA co-author */}
          <DossierAna doc={doc} spine={spine.spine} onStage={setStage} />
        </div>
      ) : (
        <div className="dsr-room">
          <div className="dsr-room-h">
            Data room · source files feeding the dossier{' '}
            <span>{DATA_ROOM.length} sources · semantic search · AI-extracted metadata</span>
          </div>
          <div className="dsr-room-grid">
            {DATA_ROOM.map((s) => (
              <div key={s.id} className="dsr-src">
                <span className="dsr-src-ic">{I[s.ic] || I.fileText}</span>
                <span className="dsr-src-mid">
                  <span className="dsr-src-title">{s.title}</span>
                  <span className="dsr-src-meta">{s.kind} · {s.size} · {s.when}</span>
                </span>
                <span className="dsr-src-cites" title="Sections citing this source">{s.cites} cites</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
