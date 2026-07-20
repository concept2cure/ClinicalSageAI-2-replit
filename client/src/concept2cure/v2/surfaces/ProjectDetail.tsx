/**
 * Project detail surfaces -- kit app/Project2.jsx ported.
 *
 * Contains 4 surfaces:
 *   - DocAuthoring (registry id `document-authoring`, full: true)
 *   - CMC          (registry id `cmc`)
 *   - IND          (registry id `ind-checklist`)
 *   - DossierMap   (registry id `dossier-map`)
 *
 * Named ProjectDetail.tsx (not Project2.tsx) to avoid a collision with the
 * existing Projects.tsx / ProjectHome.tsx surfaces.
 */
import React, { useState } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import type { DocBlock } from '../fixtures/project2-data';
import {
  STATUS_TONE,
  DOC_PROGRAM,
  DOC_TREE,
  DOC_BLOCKS_INIT,
  DOC_COMMENTS,
  DRAFT_TEXT,
  DOSSIER,
} from '../fixtures/project2-data';
import '../styles/project-home-v2.css';

/* ── Local fixture data — kit app/project2-data.jsx CMC + IND globals.
   (DocAuthoring and DossierMap data already live in fixtures/project2-data.) ── */

interface CmcBlueprintItem { id: string; code: string; label: string; pct: number; status: string; docs: number; }
interface CmcSpecRow { attr: string; method: string; accept: string; result: string; status: string; _new?: boolean; }
interface CmcStabilityRow { cond: string; months: string; status: string; tone: string; }

const CMC_BLUEPRINT: CmcBlueprintItem[] = [
  { id: 's', code: '3.2.S', label: 'Drug substance', pct: 88, status: 'review', docs: 47 },
  { id: 'p', code: '3.2.P', label: 'Drug product', pct: 64, status: 'active', docs: 31 },
  { id: 'a', code: '3.2.A', label: 'Appendices', pct: 40, status: 'draft', docs: 9 },
  { id: 'r', code: '3.2.R', label: 'Regional information', pct: 20, status: 'draft', docs: 6 },
];

const CMC_SPECS: CmcSpecRow[] = [
  { attr: 'Appearance', method: 'Visual', accept: 'Clear, colorless to pale yellow', result: 'Conforms', status: 'ok' },
  { attr: 'Identity (peptide map)', method: 'LC-MS', accept: 'Matches reference', result: 'Conforms', status: 'ok' },
  { attr: 'Purity (SEC)', method: 'SE-HPLC', accept: '≥ 95.0% monomer', result: '97.2%', status: 'ok' },
  { attr: 'Charge variants (icIEF)', method: 'icIEF', accept: 'Main 55–75%', result: '68%', status: 'ok' },
  { attr: 'Potency (cell-based)', method: 'Bioassay', accept: '70–130% RP', result: '104%', status: 'ok' },
  { attr: 'Host cell protein', method: 'ELISA', accept: '≤ 100 ng/mg', result: '112 ng/mg', status: 'warn' },
  { attr: 'Endotoxin', method: 'LAL', accept: '≤ 0.5 EU/mg', result: '< 0.1 EU/mg', status: 'ok' },
];

const CMC_STABILITY: CmcStabilityRow[] = [
  { cond: '-70 °C (long-term)', months: '0,3,6,9,12,18,24', status: 'On protocol', tone: 'ok' },
  { cond: '5 °C (long-term)', months: '0,3,6,9,12', status: 'On protocol', tone: 'ok' },
  { cond: '25 °C / 60% RH (accel.)', months: '0,1,3,6', status: 'OOS at 6 mo', tone: 'warn' },
];

interface IndPhase { id: string; label: string; pct: number; status: string; }
interface IndForm { id: string; label: string; status: string; sig: string; }
interface IndChecklistItem { sect: string; status: string; blocker?: boolean; _new?: boolean; }

const IND_PHASES: IndPhase[] = [
  { id: 'pre', label: 'Pre-IND', pct: 100, status: 'complete' },
  { id: 'open', label: 'Original IND', pct: 100, status: 'complete' },
  { id: 'safe', label: 'Safe to proceed', pct: 100, status: 'complete' },
  { id: 'amend', label: 'Amendments', pct: 60, status: 'active' },
  { id: 'annual', label: 'Annual report', pct: 30, status: 'active' },
  { id: 'safety', label: 'Safety reports', pct: 45, status: 'active' },
];

const IND_FORMS: IndForm[] = [
  { id: '1571', label: 'Form FDA 1571 — IND application', status: 'complete', sig: 'signed' },
  { id: '1572', label: 'Form FDA 1572 — Statement of investigator', status: 'review', sig: 'pending' },
  { id: '3674', label: 'Form FDA 3674 — ClinicalTrials.gov certification', status: 'complete', sig: 'signed' },
  { id: '3454', label: 'Form FDA 3454 — Financial disclosure', status: 'draft', sig: 'queued' },
];

const IND_CHECKLIST: IndChecklistItem[] = [
  { sect: 'Cover letter', status: 'complete' },
  { sect: 'Table of contents', status: 'complete' },
  { sect: 'Introductory statement & general plan', status: 'review' },
  { sect: "Investigator's brochure", status: 'review' },
  { sect: 'Clinical protocol', status: 'draft', blocker: true },
  { sect: 'CMC information', status: 'draft' },
  { sect: 'Pharmacology & toxicology', status: 'complete' },
  { sect: 'Previous human experience', status: 'complete' },
];

/* ── Inline helpers ── */

function PageHead({ eyebrow, title, sub, actions }: {
  eyebrow: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="ph">
      <div>
        <div className="ph-eyebrow">{eyebrow}</div>
        <h1 className="ph-title">{title}</h1>
        {sub && <div className="ph-sub">{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}

function useRows<T extends { _new?: boolean }>(initial: T[]): [T[], (row: T) => void] {
  const [rows, setRows] = useState<T[]>(initial);
  const add = (row: T) => setRows((rs) => [...rs, { ...row, _new: true }]);
  return [rows, add];
}

function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState('');
  const fire = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2600); };
  return [msg, fire];
}

function C2CToast({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="de-toast"><span className="ico">{I.checkCircle}</span>{msg}</div>;
}

/* ════ Document authoring — full-bleed 3-pane editor ════ */

export function DocAuthoring({ onAsk }: SurfaceViewProps) {
  const [active, setActive] = useState('m25');
  const [showComments, setShowComments] = useState(false);
  const prog = DOC_PROGRAM;
  const band = (c: number) => (c >= 0.9 ? 'hi' : c >= 0.75 ? 'med' : 'lo');

  const [blocks, setBlocks] = useState<DocBlock[]>(DOC_BLOCKS_INIT);
  const [stream, setStream] = useState('');
  const [busy, setBusy] = useState(false);

  const generate = () => {
    if (busy) return;
    setBusy(true);
    setStream('');
    let i = 0;
    const tick = () => {
      i = Math.min(DRAFT_TEXT.length, i + 3);
      setStream(DRAFT_TEXT.slice(0, i));
      if (i < DRAFT_TEXT.length) {
        setTimeout(tick, 16);
      } else {
        setTimeout(() => {
          setBlocks((b) => [
            ...b,
            {
              id: 'g' + Date.now(),
              kind: 'p',
              conf: 0.86,
              spans: [{ t: DRAFT_TEXT }],
              prov: { source: 'Drafted by AnA from §2.5.1–§2.5.5 + linked evidence', model: 'Maximum', audit: 'AUD-' + (Math.floor(Math.random() * 9000) + 1000) },
            },
          ]);
          setStream('');
          setBusy(false);
        }, 250);
      }
    };
    tick();
  };

  return (
    <div className="ed" data-comments={showComments || undefined}>
      <aside className="ed-tree">
        <div className="ed-tree-h">
          <div className="ed-tree-t">Document tree</div>
          <div className="ed-tree-m">{prog.readiness != null ? prog.readiness + '% ready' : 'Readiness pending'}{prog.due ? ' · ' + prog.due.replace('FDA filing · ', '') : ''}</div>
        </div>
        <div className="ed-tree-scroll">
          {DOC_TREE.map((v) => (
            <div key={v.vol} className="ed-vol">
              <div className="ed-vol-l">{v.vol}</div>
              {v.items.map((s) => (
                <button key={s.id} className="ed-tree-row" data-active={active === s.id || undefined} data-blocker={s.blocker || undefined} onClick={() => setActive(s.id)}>
                  <span className="ed-num">{s.num}</span><span className="ed-lbl">{s.label}</span><span className="ed-dot" data-s={s.status} />
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>
      <section className="ed-doc">
        <header className="ed-doc-h">
          <div className="ed-crumbs"><span>{prog.code}</span><span className="sep">›</span><span className="here">{prog.section}</span></div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn ghost" style={{ height: 30 }} onClick={() => setShowComments(!showComments)}>{I.checkCircle} Comments {DOC_COMMENTS.length}</button>
            <button className="btn primary" style={{ height: 30 }} onClick={generate} disabled={busy}>{I.sparkles} {busy ? 'Generating...' : 'Draft with AnA'}</button>
            <button className="btn ghost" style={{ height: 30 }}>{I.lock} Lock</button>
          </div>
        </header>
        <div className="ed-doc-scroll">
          <div className="ed-doc-inner">
            <div className="ed-mast"><div className="ed-mast-num">§2.5</div><h1 className="ed-mast-t">Clinical overview</h1><div className="ed-mast-meta">{prog.title} · last edited 12 min ago by A. Müller</div></div>
            {blocks.map((b) => b.kind === 'h2'
              ? <h2 key={b.id} className="ed-h2">{b.text}</h2>
              : (
                <div key={b.id} className="ed-block" data-conf={band(b.conf!)}>
                  <span className="ed-gutter" />
                  <p className="ed-p">{b.spans!.map((s, i) => s.cite ? <a key={i} className="ed-cite" onClick={(e) => e.preventDefault()}>{s.cite}</a> : <React.Fragment key={i}>{s.t}</React.Fragment>)}</p>
                  {b.flag && <div className="ed-flag" data-sev={b.flag.sev}><span className="ico">{I.alertTriangle}</span><span>{b.flag.msg}</span></div>}
                  <span className="ed-prov">
                    <span className="ed-prov-r"><span className="k">Source</span><span className="v">{b.prov!.source}</span></span>
                    <span className="ed-prov-r"><span className="k">Model</span><span className="v">{b.prov!.model}</span></span>
                    <span className="ed-prov-r"><span className="k">Confidence</span><span className="v">{b.conf!.toFixed(2)}</span></span>
                    <span className="ed-prov-r"><span className="k">Audit</span><span className="v">{b.prov!.audit}</span></span>
                  </span>
                </div>
              ))}
            {stream && (
              <div className="ed-block" data-conf="med">
                <span className="ed-gutter" />
                <p className="ed-p">{stream}<span className="ed-caret" /></p>
                <span className="ed-genlbl">* AnA is drafting from the section evidence...</span>
              </div>
            )}
            <div className="ed-foot"><button className="btn primary" onClick={generate} disabled={busy}>{I.sparkles} {busy ? 'Generating...' : 'Draft next section'}</button></div>
          </div>
        </div>
      </section>
      {showComments && (
        <aside className="ed-comments">
          <div className="ed-comments-h">Comments</div>
          {DOC_COMMENTS.map((c) => (
            <div key={c.id} className="cmt" data-ai={c.ai || undefined}>
              <div className="cmt-meta"><span className="cmt-av">{c.ai ? '*' : c.author.split(' ').map((x) => x[0]).join('')}</span><b>{c.author}</b><span className="cmt-role">{c.role}</span><span className="cmt-when">· {c.when}</span></div>
              <div className="cmt-body">{c.body}</div>
              {c.ai && <div className="cmt-actions"><button className="btn primary" style={{ height: 26 }}>Apply</button><button className="btn ghost" style={{ height: 26 }}>Dismiss</button></div>}
            </div>
          ))}
        </aside>
      )}
    </div>
  );
}

/* ════ CMC / Module 3 ════ */

export function CMC({ onAsk }: SurfaceViewProps) {
  const [specs, addSpec] = useRows<CmcSpecRow>(CMC_SPECS);
  const [form, setForm] = useState(false);
  const [toast, fireToast] = useToast();

  const SPEC_FORM: C2CFormConfig = {
    eyebrow: 'CMC · 3.2.S.4.1', title: 'Add a specification',
    governed: 'Specifications are governed quality records (ICH Q6A) — added attributes are audited and feed the release panel.',
    submitLabel: 'Add specification',
    fields: [
      { key: 'attr', label: 'Quality attribute', type: 'text', placeholder: 'e.g. Charge variants (icIEF)', required: true },
      { key: 'method', label: 'Analytical method', type: 'text', placeholder: 'e.g. icIEF', required: true, half: true },
      { key: 'accept', label: 'Acceptance criterion', type: 'text', placeholder: 'e.g. Main peak ≥ 60%', required: true, half: true },
      { key: 'result', label: 'Latest result', type: 'text', placeholder: 'e.g. 64%', half: true },
      { key: 'status', label: 'Result', type: 'seg', options: ['ok', 'warn'], default: 'ok', half: true },
    ],
  };
  const submitSpec = (v: Record<string, string>) => {
    addSpec({ attr: v.attr, method: v.method, accept: v.accept, result: v.result || '—', status: v.status });
    setForm(false);
    fireToast('Specification added · ' + v.attr);
  };

  return (
    <div className="page-inner">
      <SampleTag sample={true} />
      <PageHead eyebrow="Project · quality-cmc" title="CMC / Module 3"
        sub="Module 3 operating system — blueprint, specifications, stability, batch records, convergence."
        actions={<button className="btn ghost" onClick={() => onAsk('Where are the Module 3 gaps?')}>{I.sparkles} Ask AnA</button>} />
      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Module 3 blueprint</div><div className="sec-sub">4 sections · 93 documents</div></div>
        <div className="cmc-blueprint">
          {CMC_BLUEPRINT.map((s) => (
            <div key={s.id} className="cmc-card">
              <div className="cmc-card-top"><span className="mono cmc-code">{s.code}</span><span className={`rd-chip tone-${STATUS_TONE[s.status]}`}>{s.status}</span></div>
              <div className="cmc-card-l">{s.label}</div>
              <div className="cmc-bar"><div className="cmc-bar-f" style={{ width: s.pct + '%' }} /></div>
              <div className="cmc-card-foot"><span>{s.pct}% mapped</span><span>{s.docs} docs</span></div>
            </div>
          ))}
        </div>
      </div>
      <div className="split2">
        <div className="sec">
          <div className="sec-hdr"><div className="sec-title">Specifications · 3.2.S.4.1</div><div className="sec-sub">drug substance release</div>
            <button className="sp-addbtn" style={{ marginLeft: 'auto' }} onClick={() => setForm(true)}>{I.plus} Add specification</button></div>
          <div className="ctable">
            <div className="ct-head" style={{ gridTemplateColumns: '1.4fr 1fr 1.4fr 1fr 70px' }}><div>Attribute</div><div>Method</div><div>Acceptance</div><div>Result</div><div /></div>
            {specs.map((r, i) => (
              <div key={i} className={'ct-row' + (r._new ? ' de-row-new' : '')} style={{ gridTemplateColumns: '1.4fr 1fr 1.4fr 1fr 70px' }}>
                <div className="ct-strong">{r.attr}</div><div style={{ color: 'var(--text-400)' }}>{r.method}</div><div>{r.accept}</div><div className="mono">{r.result}</div>
                <div><span className={`rd-chip tone-${STATUS_TONE[r.status]}`}>{r.status === 'ok' ? 'pass' : 'OOS'}</span></div>
              </div>
            ))}
          </div>
        </div>
        <div className="sec">
          <div className="sec-hdr"><div className="sec-title">Stability program</div><div className="sec-sub">ICH Q1A(R2)</div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CMC_STABILITY.map((s, i) => (
              <div key={i} className="stab-row">
                <div><div className="stab-cond">{s.cond}</div><div className="stab-months mono">{s.months}</div></div>
                <span className={`rd-chip tone-${s.tone}`}>{s.status}</span>
              </div>
            ))}
            <div className="scaf-note" style={{ marginTop: 4 }}>AnA flagged the 25 °C / 6-month HCP result above the 100 ng/mg limit — open a deviation and link to 3.2.S.4.5.</div>
          </div>
        </div>
      </div>
      {form && <C2CForm config={SPEC_FORM} onCancel={() => setForm(false)} onSubmit={submitSpec} />}
      <C2CToast msg={toast} />
    </div>
  );
}

/* ════ IND lifecycle ════ */

export function IND({ onAsk }: SurfaceViewProps) {
  const [checklist, addChk] = useRows<IndChecklistItem>(IND_CHECKLIST);
  const [form, setForm] = useState(false);
  const [toast, fireToast] = useToast();

  const AMD_FORM: C2CFormConfig = {
    eyebrow: 'IND · amendment', title: 'New IND amendment',
    governed: 'IND amendments are governed submissions (21 CFR 312.30/31) — recorded with an audit entry and routed for e-signature.',
    submitLabel: 'Create amendment',
    fields: [
      { key: 'kind', label: 'Amendment type', type: 'select', options: ['Protocol amendment', 'Information amendment', 'New protocol', 'IND safety report', 'Annual report', 'Chemistry amendment'], required: true },
      { key: 'sect', label: 'Affected section', type: 'text', placeholder: 'e.g. 5 · Clinical protocol', required: true },
      { key: 'reason', label: 'Reason', type: 'textarea', placeholder: 'Basis for the amendment...', required: true },
    ],
  };
  const submitAmd = (v: Record<string, string>) => {
    addChk({ sect: v.kind + ' · ' + v.sect, status: 'draft', blocker: false });
    setForm(false);
    fireToast('Amendment created · ' + v.kind);
  };

  const ask = onAsk || (() => {});
  const phases = IND_PHASES;
  const curPhase = phases.find((p) => p.status === 'active' || p.status === 'current' || p.status === 'progress')
    || phases.find((p) => p.pct > 0 && p.pct < 100) || phases[0];
  const blockers = checklist.filter((s) => s.blocker);
  const topBlocker = blockers[0];
  const formsPending = IND_FORMS.filter((f) => f.sig !== 'signed');

  const indLead = (
    <AnswerLead
      tone={blockers.length ? 'urgent' : 'calm'}
      eyebrow="Is your IND ready to submit — and what has to happen first"
      headline={blockers.length
        ? <>One thing is standing between you and submitting: <b>{topBlocker?.sect}</b>.</>
        : <>Your IND is moving through <b>{curPhase ? curPhase.label.toLowerCase() : 'assembly'}</b> — {formsPending.length ? <>{formsPending.length} {formsPending.length === 1 ? 'form' : 'forms'} still need signature.</> : <>forms are signed and the checklist is clean.</>}</>}
      body={blockers.length
        ? <>The 21 CFR 312.23 checklist has {blockers.length} blocking {blockers.length === 1 ? 'item' : 'items'}. Clear {topBlocker?.sect.toLowerCase()} and the rest of the content set is in good shape. {formsPending.length ? <>Forms {formsPending.map((f) => f.id).join(', ')} also need signature before you file.</> : null}</>
        : <>You're in {curPhase ? curPhase.label.toLowerCase() : 'assembly'} at {curPhase ? curPhase.pct : 0}%. {formsPending.length ? <>Get {formsPending.map((f) => f.id).join(', ')} signed and you're ready to assemble the sequence.</> : <>The content set and forms are complete — assemble the sequence when you're ready.</>}</>}
      reassure={blockers.length ? "This is a short list, not a wall. I'll draft each blocking section and route the forms for signature with you." : "You're close to filing. I'll help you assemble and validate the sequence."}
      action={{
        label: blockers.length ? 'Resolve the blocking items' : 'Draft the next IND section',
        onClick: () => ask(blockers.length ? ('Draft and resolve the blocking IND checklist item: ' + topBlocker?.sect) : 'Draft the next IND lifecycle section and prepare forms for signature'),
        alt: formsPending.length ? { label: 'Route forms for e-signature', onClick: () => ask('Route IND forms ' + formsPending.map((f) => f.id).join(', ') + ' for e-signature') } : undefined,
      }}
      secondary="Or work the checklist and forms below."
    />
  );

  return (
    <div className="page-inner">
      <SampleTag sample={true} />
      <PageHead eyebrow="Project · submission" title="IND lifecycle"
        sub="IND checklist, forms (1571/1572/3674), autodraft, amendments, annual & safety reports."
        actions={<button className="btn primary" onClick={() => setForm(true)}>{I.plus} New amendment</button>} />
      {indLead}
      <div className="phases">
        {IND_PHASES.map((p, i) => (
          <div key={p.id} className={`phase ${p.status}`}>
            <div className="phase-l">{i + 1}. {p.label}</div>
            <div className="phase-bar"><div className="phase-bar-f" style={{ width: p.pct + '%' }} /></div>
            <div className="phase-pct"><span>{p.pct}%</span><span className="kdot" data-tone={STATUS_TONE[p.status]} /></div>
          </div>
        ))}
      </div>
      <div className="split2">
        <div className="sec">
          <div className="sec-hdr"><div className="sec-title">IND content checklist</div><div className="sec-sub">21 CFR 312.23</div></div>
          <div className="ctable">
            {checklist.map((s, i) => (
              <div key={i} className={'ct-row' + (s._new ? ' de-row-new' : '')} style={{ gridTemplateColumns: '1fr 100px' }} data-blocker={s.blocker || undefined}>
                <div className="vn">{s.blocker && <span className="esig" style={{ color: 'var(--error)' }}>{I.alertTriangle}</span>}<span className="ct-strong">{s.sect}</span></div>
                <div><span className={`rd-chip tone-${STATUS_TONE[s.status]}`}>{s.status}</span></div>
              </div>
            ))}
          </div>
        </div>
        <div className="sec">
          <div className="sec-hdr"><div className="sec-title">Forms</div><div className="sec-sub">e-signature required</div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {IND_FORMS.map((f) => (
              <div key={f.id} className="form-row">
                <span className="mono form-id">{f.id}</span>
                <span className="form-l">{f.label.replace(/^Form FDA \d+ — /, '')}</span>
                <span className={`rd-chip tone-${STATUS_TONE[f.status]}`}>{f.status}</span>
                <span className={`rd-chip tone-${f.sig === 'signed' ? 'ok' : f.sig === 'pending' ? 'warn' : 'idle'}`}>{f.sig}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {form && <C2CForm config={AMD_FORM} onCancel={() => setForm(false)} onSubmit={submitAmd} />}
      <C2CToast msg={toast} />
    </div>
  );
}

/* ════ Dossier map ════ */

export function DossierMap({ onAsk }: SurfaceViewProps) {
  return (
    <div className="page-inner">
      <SampleTag sample={true} />
      <PageHead eyebrow="Project · submission" title="Dossier map"
        sub="CTD / eCTD module map with completeness and readiness overlay."
        actions={<button className="btn ghost" onClick={() => onAsk('What is the critical path to filing?')}>{I.sparkles} Ask AnA</button>} />
      <div className="dossier">
        {DOSSIER.map((m) => (
          <div key={m.m} className="dmod">
            <div className="dmod-h"><span className="dmod-m">M{m.m}</span><span className="dmod-l">{m.label}</span><span className={`rd-chip tone-${m.tone}`}>{m.pct}%</span></div>
            <div className="dmod-bar"><div className="dmod-bar-f" data-tone={m.tone} style={{ width: m.pct + '%' }} /></div>
            <div className="dmod-sec">{m.sections.map((s) => <span key={s} className="dmod-chip">{s}</span>)}</div>
          </div>
        ))}
      </div>
      <div className="scaf-note" style={{ marginTop: 18, maxWidth: 760 }}>Critical path: Module 2.5 (clinical overview) and 3.2.P (drug product) are the two below-target modules gating the Q3 filing. AnA can sequence the remaining sections by reviewer-risk.</div>
    </div>
  );
}
