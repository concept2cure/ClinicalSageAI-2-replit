import React, { useState, useRef, useEffect } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Inline fixture types ── */

interface DjStage {
  id: string;
  label: string;
  ic: string;
  when: string;
  who: string;
  ver: string;
  done: boolean;
  active?: boolean;
  sub: string;
  kind: string;
}

interface DjBriefLine {
  mode: 'brief';
  title: string;
  lines: [string, string][];
}

interface DjOutlineSnap {
  mode: 'outline';
  title: string;
  items: string[];
  note: string;
}

interface DjQcCheck {
  mode: 'qc';
  heading: string;
  checks: [string, string, string][];
}

interface DjAssembleSnap {
  mode: 'assemble' | 'submit';
  heading: string;
  lines: [string, string][];
  note: string;
}

interface DjRedlineSpan {
  t: string;
  k: 'add' | 'keep';
}

interface DjComment {
  by: string;
  body: string;
  status: string;
}

interface DjDocSnap {
  mode: 'doc' | 'redline';
  heading: string;
  wm?: string;
  seal?: string;
  body?: (string | { sub: string })[];
  redline?: DjRedlineSpan[];
  comment?: DjComment;
  refs?: string[];
  prov?: string;
}

type DjSnap = DjBriefLine | DjOutlineSnap | DjQcCheck | DjAssembleSnap | DjDocSnap;

/* ── Inline fixture data (verbatim from kit doc-journey.jsx) ── */

const DJ_STAGES: DjStage[] = [
  { id: 'ideate', label: 'Ideation', ic: 'sparkles', when: 'May 28', who: 'AnA + J. Chen', ver: '—', done: true, sub: 'Need identified', kind: 'brief' },
  { id: 'outline', label: 'Outline', ic: 'list', when: 'May 29', who: 'AnA', ver: 'v0.1', done: true, sub: 'CTD §2.5 template (ICH M4E)', kind: 'outline' },
  { id: 'draft', label: 'AnA draft', ic: 'penLine', when: 'May 30', who: 'AnA', ver: 'v0.2', done: true, sub: 'Drafted from clinical + safety files', kind: 'draft' },
  { id: 'revise', label: 'Author revision', ic: 'edit', when: 'Jun 4', who: 'A. Müller', ver: 'v0.4', done: true, sub: 'Human edits · tracked', kind: 'revise' },
  { id: 'review', label: 'Internal review', ic: 'messageSquare', when: 'Jun 9', who: 'Clinical · Biostat · Reg', ver: 'v0.9', done: true, sub: '3 reviewers · 7 comments resolved', kind: 'review' },
  { id: 'qc', label: 'QC / preflight', ic: 'shieldCheck', when: 'Jun 12', who: 'AnA', ver: 'v0.9', done: true, sub: 'Consistency + citations validated', kind: 'qc' },
  { id: 'approve', label: 'Approval · e-sign', ic: 'checkCircle', when: 'Jun 14', who: 'D. Okafor (VP RA)', ver: 'v1.0', done: true, sub: '21 CFR §11 e-signature', kind: 'approve' },
  { id: 'assemble', label: 'Assemble', ic: 'layers', when: 'Jun 16', who: 'AnA', ver: 'v1.0', done: true, sub: 'eCTD leaf m2.5 · operator "new"', kind: 'assemble' },
  { id: 'submit', label: 'Submission', ic: 'rocket', when: 'Jun 18', who: 'Reg ops', ver: 'v1.0', done: false, active: true, sub: 'BLA 761xyz · sequence 0000 · FDA ESG', kind: 'submit' },
];

const DJ_SNAP: Record<string, DjSnap> = {
  ideate: {
    mode: 'brief', title: 'Document brief', lines: [
      ['Document', 'Clinical Overview (CTD Module 2.5)'],
      ['Program', 'BX-204 (rezatinib) — BLA, accelerated approval'],
      ['Purpose', 'Integrated benefit-risk summary across the clinical program; the reviewer’s entry point to Module 5.'],
      ['Trigger', 'AnA flagged §2.5 as a required, not-started leaf gating the BLA content plan.'],
      ['Owner', 'A. Müller (Clinical) · reviewed by D. Okafor (VP RA)'],
    ],
  },
  outline: {
    mode: 'outline', title: '2.5  Clinical overview — section skeleton', items: [
      '2.5.1  Product development rationale',
      '2.5.2  Overview of biopharmaceutics',
      '2.5.3  Overview of clinical pharmacology',
      '2.5.4  Overview of efficacy',
      '2.5.5  Overview of safety',
      '2.5.6  Benefits and risks conclusions',
    ], note: 'Template: ICH M4E(R2). Evidence linked: CSR-201, ISS, ISE, locked ADaM.',
  },
  draft: {
    mode: 'doc', wm: 'DRAFT v0.2', heading: '2.5.4  Overview of efficacy', body: [
      'In the pivotal study, the objective response rate was approximately 42%, supporting a meaningful clinical benefit in the intended population. [AnA draft — verify against locked CSR-201]',
      'Responses were durable, with a median duration of response exceeding six months.',
    ], prov: 'Drafted by AnA from §2.5.1–§2.5.5 + CSR-201. Model-assisted; unverified.',
  },
  revise: {
    mode: 'doc', wm: 'DRAFT v0.4', heading: '2.5.4  Overview of efficacy', body: [
      'In pivotal study BX204-201, the objective response rate was 42.1% (95% CI 35.8–48.6; n=214), supporting durable clinical benefit.',
      'The median duration of response was 8.3 months (95% CI 6.1–11.2).',
    ], prov: 'Edited by A. Müller — figures reconciled to the locked CSR-201 primary analysis.',
  },
  review: {
    mode: 'redline', heading: '2.5.4  Overview of efficacy', redline: [
      { t: 'In pivotal study BX204-201, the objective response rate was 42.1% (95% CI 35.8–48.6; n=214), per the locked CSR-201 primary analysis (ADaM ADRS, data lock 18 Apr 2026), ', k: 'add' },
      { t: 'supporting durable clinical benefit.', k: 'keep' },
    ], comment: { by: 'Biostatistics', body: 'Add the data-lock provenance for the ORR claim.', status: 'resolved' },
  },
  qc: {
    mode: 'qc', heading: '2.5.4 — preflight', checks: [
      ['Claim → evidence link', 'ok', 'ORR traces to locked ADaM ADRS'],
      ['Cross-document consistency', 'ok', 'ORR matches §2.7.3 + USPI §14'],
      ['Citation integrity', 'ok', '12 of 12 references resolve'],
      ['Open redlines', 'ok', '0 unresolved'],
      ['Confidence gutter', 'warn', '§2.5.5 safety para below 80% — flagged'],
    ],
  },
  approve: {
    mode: 'doc', seal: 'APPROVED v1.0', heading: '2.5.4  Overview of efficacy', body: [
      { sub: '2.5.4.1  Pivotal efficacy — study BX204-201' },
      'The efficacy of BX-204 was established in BX204-201, a multicenter, single-arm, open-label trial in 214 adult patients with advanced RTK-X–overexpressing solid tumors who had received at least one prior line of systemic therapy. The primary endpoint was objective response rate (ORR) by blinded independent central review (BICR) per RECIST v1.1.',
      'In the primary analysis (ADaM ADRS; data lock 18 April 2026), the confirmed ORR was 42.1% (95% CI: 35.8, 48.6). Responses were durable: the median duration of response (DoR) was 8.3 months (95% CI: 6.1, 11.2), with 61% of responders maintaining response at six months. Results were consistent across pre-specified subgroups, including prior lines of therapy and tumor histology.',
      { sub: '2.5.4.2  Supportive efficacy' },
      'Supportive evidence from the dose-finding study BX204-102 (n=88) demonstrated concordant activity at the recommended Phase 2 dose, with an ORR of 39.8% (95% CI: 29.5, 50.8). The consistency of effect across studies, endpoints, and review methods supports the robustness of the efficacy conclusion under the accelerated-approval framework (21 CFR 601.41).',
    ], refs: [
      'BX204-201 Clinical Study Report, §11 (locked 18 Apr 2026).',
      'Integrated Summary of Efficacy (ISE), Module 2.7.3.',
      'FDA Guidance for Industry: Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics (2018).',
    ], prov: 'E-signed by D. Okafor (VP Regulatory Affairs) · 14 Jun 2026 16:04 EDT · 21 CFR §11 · audit AUD-2.5-0091',
  },
  assemble: {
    mode: 'assemble', heading: 'eCTD assembly', lines: [
      ['Leaf', 'm2/25-clin-over/clinical-overview.pdf'],
      ['Module', '2.5 Clinical Overview'],
      ['Operator', 'new'],
      ['Sequence', '0000 (original BLA)'],
      ['Format', 'PDF/A-1b · bookmarks + hyperlinks validated'],
      ['STF', 'not applicable (Module 2 summary)'],
    ], note: 'Placed into the dossier. eCTD validation: 0 errors, 0 warnings.',
  },
  submit: {
    mode: 'submit', heading: 'Transmission', lines: [
      ['Submission', 'BLA 761xyz — original'],
      ['Sequence', '0000'],
      ['Gateway', 'FDA ESG (AS2) — secure'],
      ['Status', 'In transit · awaiting ACK1 receipt'],
      ['Center', 'CBER'],
    ], note: '§2.5 is part of the assembled sequence now transmitting. ACK1 (receipt) → ACK2 (validation) → ACK3 (Center) will post here.',
  },
};

/* ── Sub-component: snapshot renderer ── */

function DJSnapshot({ snap }: { snap: DjSnap }) {
  const m = snap.mode;

  if (m === 'brief') {
    const s = snap as DjBriefLine;
    return (
      <div className="dj-card">
        <div className="dj-card-h">{s.title}</div>
        <table className="dj-brief">
          <tbody>
            {s.lines.map((r, i) => (
              <tr key={i}><td>{r[0]}</td><td>{r[1]}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (m === 'outline') {
    const s = snap as DjOutlineSnap;
    return (
      <div className="dj-card">
        <div className="dj-card-h">{s.title}</div>
        <div className="dj-outline">
          {s.items.map((t, i) => (
            <div key={i} className="dj-ol-row"><span>{I.fileText}</span>{t}</div>
          ))}
        </div>
        <div className="dj-note">{I.sparkles} {s.note}</div>
      </div>
    );
  }

  if (m === 'qc') {
    const s = snap as DjQcCheck;
    return (
      <div className="dj-card">
        <div className="dj-card-h">{s.heading}</div>
        <div className="dj-qc">
          {s.checks.map((c, i) => (
            <div key={i} className="dj-qc-row" data-st={c[1]}>
              <span className="dj-qc-ic">{c[1] === 'ok' ? I.check : I.alertTriangle}</span>
              <span className="dj-qc-l">{c[0]}</span>
              <span className="dj-qc-d">{c[2]}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (m === 'assemble' || m === 'submit') {
    const s = snap as DjAssembleSnap;
    return (
      <div className="dj-card">
        <div className="dj-card-h">{s.heading}</div>
        <table className="dj-brief">
          <tbody>
            {s.lines.map((r, i) => (
              <tr key={i}><td>{r[0]}</td><td>{r[1]}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="dj-note">{m === 'submit' ? I.rocket : I.layers} {s.note}</div>
      </div>
    );
  }

  /* document page modes: draft / doc / redline */
  const s = snap as DjDocSnap;
  return (
    <>
      <div className="dj-toolbar">
        <select className="dj-tb-sel" defaultValue="h" title="Paragraph style">
          <option value="t">Title</option>
          <option value="h">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="b">Body text</option>
        </select>
        <span className="dj-tb-sep" />
        <button className="dj-tb-b" title="Bold" onMouseDown={(e) => { e.preventDefault(); document.execCommand('bold'); }}><b>B</b></button>
        <button className="dj-tb-b" title="Italic" onMouseDown={(e) => { e.preventDefault(); document.execCommand('italic'); }}><i>I</i></button>
        <button className="dj-tb-b" title="Underline" onMouseDown={(e) => { e.preventDefault(); document.execCommand('underline'); }}><span style={{ textDecoration: 'underline' }}>U</span></button>
        <span className="dj-tb-sep" />
        <button className="dj-tb-b" title="Bulleted list" onMouseDown={(e) => { e.preventDefault(); document.execCommand('insertUnorderedList'); }}>{I.list}</button>
        <button className="dj-tb-b" title="Numbered list" onMouseDown={(e) => { e.preventDefault(); document.execCommand('insertOrderedList'); }}>1.</button>
        <span className="dj-tb-sep" />
        <button className="dj-tb-b" title="Insert citation">{I.quote}</button>
        <button className="dj-tb-b" title="Insert table">{I.grid}</button>
        <span className="dj-tb-sep" />
        <button className="dj-tb-tc" title="Toggle track changes"><span className="dj-tb-dot" />Track changes</button>
        <span className="dj-tb-save">{I.check} Autosaved · {s.seal ? 'v1.0' : s.wm ? s.wm.replace('DRAFT ', '') : 'v0.x'}</span>
      </div>
      <div className={'dj-page' + (s.wm ? ' has-wm' : '')} contentEditable suppressContentEditableWarning={true} spellCheck={false}>
        {s.wm && <div className="dj-wm" contentEditable={false}>{s.wm}</div>}
        <div className="dj-doc-mast">
          <div className="dj-doc-spon">Concept2Cure Biosciences, Inc.</div>
          <div className="dj-doc-title">2.5 Clinical Overview</div>
          <div className="dj-doc-meta">BX-204 (rezatinib) · BLA 761xyz · CTD Module 2.5 · ICH M4E(R2) · {s.seal ? 'Final v1.0' : s.wm || 'Draft'}</div>
        </div>
        {s.seal && <div className="dj-seal">{I.checkCircle} {s.seal}</div>}
        <div className="dj-page-h">{s.heading}</div>
        {s.mode === 'redline' && s.redline
          ? <p className="dj-page-p">{s.redline.map((r, i) => <span key={i} className={r.k === 'add' ? 'dj-ins' : ''}>{r.t}</span>)}</p>
          : (s.body || []).map((p, i) => {
            if (p && typeof p === 'object' && 'sub' in p) return <div key={i} className="dj-page-sh">{p.sub}</div>;
            const txt = typeof p === 'string' ? p : '';
            return <p key={i} className="dj-page-p">{txt}</p>;
          })}
        {s.refs && (
          <div className="dj-page-refs">
            <div className="dj-page-sh">References</div>
            {s.refs.map((r, i) => <div key={i} className="dj-ref">{(i + 1) + '. ' + r}</div>)}
          </div>
        )}
        {s.comment && (
          <div className="dj-cmt" data-resolved={s.comment.status === 'resolved' || undefined}>
            <span className="dj-cmt-by">{s.comment.by}</span>
            <span className="dj-cmt-b">{s.comment.body}</span>
            {s.comment.status === 'resolved' && <span className="dj-cmt-st">{I.check} resolved</span>}
          </div>
        )}
        {s.prov && <div className="dj-prov">{I.shieldCheck} {s.prov}</div>}
      </div>
    </>
  );
}

/* ════ DocJourney — one document, ideation → submission ════ */

export function DocJourney({ onAsk, onNav }: SurfaceViewProps) {
  const openEditor = () =>
    onNav ? onNav('document-authoring') : onAsk && onAsk('Open §2.5 Clinical Overview in the editor');

  const [active, setActive] = useState('approve');

  const stage = DJ_STAGES.find((s) => s.id === active) || DJ_STAGES[0];
  const snap = DJ_SNAP[active];
  const doneCount = DJ_STAGES.filter((s) => s.done).length;

  return (
    <div className="reg-wrap dj">
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow">Workspace · authoring</div>
          <h1 className="reg-title">Document journey</h1>
          <p className="reg-sub">
            One document, ideation → submission. §2.5 Clinical Overview · BX-204 (rezatinib) BLA — every stage, with the document itself in view.
          </p>
        </div>
        <button className="reg-cta" onClick={() => onAsk && onAsk('Advance §2.5 Clinical Overview to the next stage')}>
          {I.sparkles} Continue with AnA
        </button>
      </div>

      <div className="reg-kpis">
        <div className="reg-kpi">
          <div className="reg-kpi-v">{doneCount}/9</div>
          <div className="reg-kpi-l">Stages complete</div>
        </div>
        <div className="reg-kpi">
          <div className="reg-kpi-v">v1.0</div>
          <div className="reg-kpi-l">Approved · e-signed</div>
        </div>
        <div className="reg-kpi" data-tone="ok">
          <div className="reg-kpi-v">21 days</div>
          <div className="reg-kpi-l">Ideation → approval</div>
        </div>
        <div className="reg-kpi" data-tone="warn">
          <div className="reg-kpi-v">In transit</div>
          <div className="reg-kpi-l">BLA seq 0000 · ESG</div>
        </div>
      </div>

      <div className="dj-split">
        <aside className="dj-rail">
          {DJ_STAGES.map((s, i) => (
            <button
              key={s.id}
              className={'dj-step' + (s.id === active ? ' on' : '')}
              data-state={s.done ? 'done' : s.active ? 'active' : 'pending'}
              onClick={() => setActive(s.id)}
            >
              <span className="dj-step-rail">
                <span className="dj-step-dot">{s.done ? I.check : (I[s.ic] || String(i + 1))}</span>
                {i < DJ_STAGES.length - 1 && <span className="dj-step-line" />}
              </span>
              <span className="dj-step-b">
                <span className="dj-step-top">
                  <span className="dj-step-l">{s.label}</span>
                  <span className="dj-step-v">{s.ver}</span>
                </span>
                <span className="dj-step-sub">{s.sub}</span>
                <span className="dj-step-meta">{s.when} · {s.who}</span>
              </span>
            </button>
          ))}
        </aside>

        <div className="dj-stagepane">
          <div className="dj-stage-h">
            <div>
              <span className="dj-stage-ic">{I[stage.ic] || I.fileText}</span>
              <span className="dj-stage-t">{stage.label}</span>
              <span className="dj-stage-v">{stage.ver}</span>
            </div>
            <div className="dj-stage-acts">
              <button className="reg-mini">{I.fileText} PDF</button>
              <button className="reg-mini" onClick={openEditor}>{I.penLine} Open in editor</button>
            </div>
          </div>
          {snap && <DJSnapshot snap={snap} />}
        </div>
      </div>
    </div>
  );
}
