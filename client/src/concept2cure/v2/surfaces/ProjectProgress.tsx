/**
 * Project progress surfaces -- kit app/Project3.jsx ported.
 *
 * Contains 5 surfaces:
 *   - Biopharma    (registry id `biopharma`)
 *   - CSR          (registry id `csr-workflow`)
 *   - RegWorkspace (registry id `regulatory-workspace`, full: true)
 *   - EctdCoauthor (registry id `ectd-coauthor`)
 *   - PDEV         (registry id `pdev`)
 *
 * Named ProjectProgress.tsx (not Project3.tsx) to avoid a collision with the
 * existing Projects.tsx / ProjectHome.tsx surfaces.
 */
import React, { useState } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  STATUS_TONE,
  BIO_PROGRAM,
  BIO_PHASES,
  BIO_MODULES,
  BIO_BLA,
  CSR_PROGRAM,
  CSR_SECTIONS,
  RW_TREE,
  RW_INTEL,
} from '../fixtures/project3-data';
import '../styles/project-home-v2.css';

/* ── Local fixture data — kit app/project3-data.jsx eCTD + PDEV globals.
   (Biopharma, CSR and RegWorkspace data already live in fixtures/project3-data.) ── */

interface EctdTreeItem { m: string; label: string; n: number; status: string; }
interface EctdPipelineStage { id: string; label: string; desc: string; status: string; }

const ECTD_TREE: EctdTreeItem[] = [
  { m: '1', label: 'Administrative & PI', n: 24, status: 'review' },
  { m: '2', label: 'CTD summaries', n: 18, status: 'active' },
  { m: '3', label: 'Quality', n: 62, status: 'active' },
  { m: '4', label: 'Nonclinical', n: 41, status: 'complete' },
  { m: '5', label: 'Clinical', n: 88, status: 'active' },
];

const ECTD_PIPELINE: EctdPipelineStage[] = [
  { id: 'author', label: 'Author', desc: 'Section content', status: 'active' },
  { id: 'format', label: 'Format', desc: 'eCTD granularity', status: 'active' },
  { id: 'assemble', label: 'Assemble', desc: 'Backbone + leaf', status: 'idle' },
  { id: 'validate', label: 'Validate', desc: 'EU/US profile', status: 'idle' },
  { id: 'transmit', label: 'Transmit', desc: 'Gateway send', status: 'idle' },
];

interface PdevActivity {
  id: string; activity: string; artifact: string; ws: string; state: string;
  who: string; evidence: string; section: string | null;
}
interface PdevWorkstream { id: string; label: string; readiness: number; owner: string; }
interface PdevStateMetaEntry { label: string; tone: string; }
interface PdevInteraction { type: string; label: string; when: string; status: string; }

const PDEV_ACTIVITIES: PdevActivity[] = [
  { id: 'AC-91', activity: 'Tox study TOX-204 completed', artifact: 'Nonclinical overview §2.4', ws: 'nonclinical', state: 'evidence_linked', who: 'AnA · Maximum', evidence: 'TOX-204 final report · 2 SEND datasets', section: 'm24' },
  { id: 'AC-88', activity: 'DRF study report finalized', artifact: 'IB update §5', ws: 'nonclinical', state: 'human_review_required', who: 'R. Nair', evidence: 'DRF-118 report', section: 'm421' },
  { id: 'AC-84', activity: 'CMC batch 3 released', artifact: 'Module 3.2.P.3', ws: 'cmc', state: 'ai_draft_generated', who: 'AnA · Maximum', evidence: 'Batch record BR-3 · CoA', section: 'm32p3' },
  { id: 'AC-79', activity: 'Pre-IND (Type B) meeting minutes', artifact: 'Meeting package', ws: 'regulatory', state: 'approved', who: 'J. Chen', evidence: 'FDA minutes · 14 Apr', section: null },
  { id: 'AC-77', activity: 'Phase 1 protocol synopsis', artifact: 'Clinical protocol §5.3.1', ws: 'clinical', state: 'in_review', who: 'M. Okafor', evidence: 'Protocol v2.1', section: 'm531' },
  { id: 'AC-72', activity: 'Stability 6-month pull', artifact: 'Module 3.2.S.7', ws: 'cmc', state: 'submission_ready', who: 'AnA · Maximum', evidence: 'Stability dataset', section: 'm32s7' },
];

const PDEV_WORKSTREAMS: PdevWorkstream[] = [
  { id: 'cmc', label: 'CMC / Manufacturing', readiness: 62, owner: 'A. Müller' },
  { id: 'nonclinical', label: 'Nonclinical', readiness: 78, owner: 'R. Nair' },
  { id: 'clinical', label: 'Clinical', readiness: 44, owner: 'M. Okafor' },
  { id: 'regulatory', label: 'Regulatory', readiness: 71, owner: 'J. Chen' },
];

const PDEV_STATE_META: Record<string, PdevStateMetaEntry> = {
  not_started: { label: 'Not started', tone: 'idle' }, drafting: { label: 'Drafting', tone: 'ai' },
  ai_draft_generated: { label: 'AI draft', tone: 'ai' }, evidence_linked: { label: 'Evidence linked', tone: 'ai' },
  human_review_required: { label: 'Review required', tone: 'warn' }, in_review: { label: 'In review', tone: 'warn' },
  changes_requested: { label: 'Changes requested', tone: 'err' }, approved: { label: 'Approved', tone: 'ok' },
  locked: { label: 'Locked', tone: 'ok' }, submission_ready: { label: 'Submission-ready', tone: 'ok' },
  submitted: { label: 'Submitted', tone: 'ok' },
};

const PDEV_INTERACTIONS: PdevInteraction[] = [
  { type: 'Type B', label: 'Pre-IND meeting', when: '14 Apr 2026', status: 'complete' },
  { type: 'Type C', label: 'CMC clarification', when: '02 Jun 2026', status: 'requested' },
  { type: 'Milestone', label: 'IND assembly gate', when: 'Target Sep 2026', status: 'gated' },
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

function GateCellB({ ok, k, v }: { ok: boolean; k: string; v: string }) {
  return <div className="gate-cell" data-ok={ok}><span className="gate-ico">{ok ? I.check : I.alertTriangle}</span><div><div className="gate-k">{k}</div><div className="gate-v">{v}</div></div></div>;
}

function GateCellP({ ok, k, v }: { ok: boolean; k: string; v: React.ReactNode }) {
  return <div className="gate-cell" data-ok={ok}><span className="gate-ico">{ok ? I.check : I.alertTriangle}</span><div><div className="gate-k">{k}</div><div className="gate-v">{v}</div></div></div>;
}

/* ════ Biopharma (BLA / CTD) ════ */

export function Biopharma({ onAsk, onNav }: SurfaceViewProps) {
  const p = BIO_PROGRAM; const bla = BIO_BLA;
  const [tab, setTab] = useState<'similarity' | 'comparability' | 'immunogenicity'>('similarity');
  return (
    <div className="page-inner">
      <SampleTag sample={true} />
      <PageHead eyebrow="Project · submission" title="Biopharma — BLA / CTD"
        sub={`${p.title} · ${p.code} · ${p.due}`}
        actions={<><button className="btn ghost" onClick={() => onAsk('What is gating the BLA filing?')}>{I.sparkles} Ask AnA</button><button className="btn primary" onClick={() => onNav && onNav('document-authoring')}>{I.layers} Open CTD editor</button></>} />
      <div className="phases" style={{ gridTemplateColumns: 'repeat(10,1fr)' }}>
        {BIO_PHASES.map((ph, i) => (
          <div key={ph.id} className={`phase ${ph.status}`}>
            <div className="phase-l" style={{ minHeight: 38, fontSize: 10.5 }}>{i + 1}. {ph.label}</div>
            <div className="phase-bar"><div className="phase-bar-f" style={{ width: ph.pct + '%' }} /></div>
            <div className="phase-pct"><span>{ph.pct}%</span><span className="kdot" data-tone={STATUS_TONE[ph.status]} /></div>
          </div>
        ))}
      </div>
      <div className="split2" style={{ gridTemplateColumns: '1.1fr 1fr', alignItems: 'start' }}>
        <div className="sec">
          <div className="sec-hdr"><div className="sec-title">CTD modules</div><div className="sec-sub">233 documents</div></div>
          <div className="cmc-blueprint" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            {BIO_MODULES.map((m) => (
              <button key={m.code} className="cmc-card" style={{ textAlign: 'left' }} onClick={() => onNav && onNav('document-authoring')}>
                <div className="cmc-card-top"><span className="mono cmc-code">{m.code}</span><span className={`rd-chip tone-${STATUS_TONE[m.status]}`}>{m.status}</span></div>
                <div className="cmc-card-l">{m.label}</div>
                <div className="cmc-bar"><div className="cmc-bar-f" style={{ width: m.pct + '%' }} /></div>
                <div className="cmc-card-foot"><span>{m.pct}% mapped</span><span>{m.docs} docs</span></div>
              </button>
            ))}
          </div>
        </div>
        <div className="sec">
          <div className="sec-hdr"><div className="sec-title">BLA biologics workbench</div><div className="sec-sub">351(a) analytical package</div></div>
          <div className="tabs">
            {([['similarity', 'Analytical similarity'], ['comparability', 'Comparability'], ['immunogenicity', 'Immunogenicity']] as const).map(([x, l]) => (
              <button key={x} className={`tab${tab === x ? ' on' : ''}`} onClick={() => setTab(x)}>{l}</button>
            ))}
          </div>
          <div className="tab-body">
            {tab === 'similarity' && (
              <div className="ctable">
                <div className="ct-head" style={{ gridTemplateColumns: '1.1fr 1fr 1fr 70px' }}><div>Attribute</div><div>Method</div><div>Result</div><div /></div>
                {bla.similarity.map((r, i) => (
                  <div key={i} className="ct-row" style={{ gridTemplateColumns: '1.1fr 1fr 1fr 70px' }}>
                    <div className="ct-strong">{r.attr}</div><div style={{ fontSize: 11.5, color: 'var(--text-400)' }}>{r.method}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-300)' }}>{r.result}</div>
                    <div><span className={`rd-chip tone-${r.verdict}`}>{r.verdict === 'ok' ? 'Pass' : 'Review'}</span></div>
                  </div>
                ))}
              </div>
            )}
            {tab === 'comparability' && (
              <div className="ctable">
                <div className="ct-head" style={{ gridTemplateColumns: '1fr 1fr 110px' }}><div>Change</div><div>Scope</div><div>Verdict</div></div>
                {bla.comparability.map((r, i) => (
                  <div key={i} className="ct-row" style={{ gridTemplateColumns: '1fr 1fr 110px' }}>
                    <div className="ct-strong">{r.lot}</div><div style={{ fontSize: 11.5, color: 'var(--text-400)' }}>{r.scope}</div>
                    <div><span className={`rd-chip tone-${r.tone}`}>{r.status}</span></div>
                  </div>
                ))}
              </div>
            )}
            {tab === 'immunogenicity' && (
              <div className="gate-grid">
                <GateCellB ok k="ADA incidence" v={bla.immunogenicity.adaRate} />
                <GateCellB ok k="NAb incidence" v={bla.immunogenicity.nabRate} />
                <GateCellB ok k="Assay" v={bla.immunogenicity.assay} />
                <GateCellB ok k="Clinical impact" v={bla.immunogenicity.impact} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════ CSR workflow ════ */

export function CSR({ onAsk }: SurfaceViewProps) {
  const p = CSR_PROGRAM;
  return (
    <div className="page-inner">
      <SampleTag sample={true} />
      <PageHead eyebrow="Project · clinical" title="CSR workflow"
        sub={`${p.title} · ${p.code} · ${p.readiness}% ready`}
        actions={<button className="btn primary" onClick={() => onAsk('Draft CSR §11 efficacy evaluation')}>{I.sparkles} Draft section</button>} />
      <div className="ctable" style={{ maxWidth: 760 }}>
        <div className="ct-head" style={{ gridTemplateColumns: '70px 1fr 100px 60px' }}><div>§</div><div>ICH E3 section</div><div>Status</div><div /></div>
        {CSR_SECTIONS.map((s, i) => (
          <button key={i} className="ct-row" style={{ gridTemplateColumns: '70px 1fr 100px 60px' }} data-blocker={s.blocker || undefined} onClick={() => onAsk(`Open CSR §${s.num} in the editor`)}>
            <div className="mono" style={{ color: 'var(--accent-200)' }}>{s.num}</div>
            <div className="vn">{s.blocker && <span className="esig" style={{ color: 'var(--error)' }}>{I.alertTriangle}</span>}<span className="ct-strong">{s.label}</span></div>
            <div><span className={`rd-chip tone-${STATUS_TONE[s.status]}`}>{s.status}</span></div>
            <div style={{ color: 'var(--text-400)' }}>{I.arrowRight}</div>
          </button>
        ))}
      </div>
      <div className="scaf-note" style={{ marginTop: 16, maxWidth: 760 }}>§11 Efficacy evaluation is the gating section — open it in the document editor to draft from the SAP and TLF shells with provenance.</div>
    </div>
  );
}

/* ════ Regulatory workspace (generic 3-pane substrate) ════ */

export function RegWorkspace({ onAsk }: SurfaceViewProps) {
  const [active, setActive] = useState('r1');
  const sec = RW_TREE.find((s) => s.id === active) ?? RW_TREE[0];
  return (
    <div className="ed">
      <aside className="ed-tree">
        <div className="ed-tree-h"><div className="ed-tree-t">Sections</div><div className="ed-tree-m">Generic authoring substrate</div></div>
        <div className="ed-tree-scroll">
          <div className="ed-vol">
            {RW_TREE.map((s) => (
              <button key={s.id} className="ed-tree-row" data-active={active === s.id || undefined} onClick={() => setActive(s.id)}>
                <span className="ed-num">{s.num}</span><span className="ed-lbl">{s.label}</span><span className="ed-dot" data-s={s.status} />
              </button>
            ))}
          </div>
        </div>
      </aside>
      <section className="ed-doc">
        <header className="ed-doc-h">
          <div className="ed-crumbs"><span>Regulatory workspace</span><span className="sep">›</span><span className="here">{sec.num} {sec.label}</span></div>
          <button className="btn primary" style={{ height: 30 }} onClick={() => onAsk(`Open ${sec.num} in the document editor`)}>{I.penLine} Open in editor</button>
        </header>
        <div className="ed-doc-scroll">
          <div className="ed-doc-inner">
            <div className="ed-mast"><div className="ed-mast-num">§{sec.num}</div><h1 className="ed-mast-t">{sec.label}</h1><div className="ed-mast-meta">Canvas · tree · intelligence — the substrate documents and editors specialize.</div></div>
            <p className="ed-p" style={{ color: 'var(--text-300)' }}>This is the canonical three-pane workspace: the section tree (left), the editable canvas (here), and the intelligence panel (right). Document authoring, 510(k) and CSR all specialize this same shell — selecting a section routes into the full editor with provenance, flags and comments.</p>
            <div className="ed-foot"><button className="btn ghost" onClick={() => onAsk('Draft this section')}>{I.sparkles} Draft with AnA</button></div>
          </div>
        </div>
      </section>
      <aside className="ed-comments">
        <div className="ed-comments-h">Intelligence</div>
        {RW_INTEL.map((x, i) => (
          <div key={i} className="gate-cell" style={{ alignItems: 'flex-start', marginBottom: 8 }}><div><div className="gate-k">{x.k}</div><div className="gate-v" style={{ fontSize: 12 }}>{x.v}</div></div></div>
        ))}
      </aside>
    </div>
  );
}

/* ════ eCTD co-author ════ */

export function EctdCoauthor({ onAsk }: SurfaceViewProps) {
  return (
    <div className="page-inner">
      <SampleTag sample={true} />
      <PageHead eyebrow="Project · submission" title="eCTD co-author"
        sub="eCTD tree and section authoring. The back-half pipeline — format → assemble → validate → transmit — is production-grade."
        actions={<button className="btn primary" onClick={() => onAsk('Assemble the eCTD backbone')}>{I.gitBranch} Assemble</button>} />
      <div className="split2" style={{ gridTemplateColumns: '300px 1fr' }}>
        <div className="sec">
          <div className="sec-hdr"><div className="sec-title">eCTD modules</div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ECTD_TREE.map((m) => (
              <div key={m.m} className="vt-row" style={{ cursor: 'default' }}>
                <span className="ed-num" style={{ minWidth: 28 }}>M{m.m}</span><span className="l">{m.label}</span>
                <span className={`rd-chip tone-${STATUS_TONE[m.status]}`}>{m.n}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="sec">
          <div className="sec-hdr"><div className="sec-title">Assembly pipeline</div><div className="sec-sub">authoring → transmit</div></div>
          <div className="pipeline" style={{ flexWrap: 'wrap' }}>
            {ECTD_PIPELINE.map((s, i) => (
              <div key={s.id} className="pl-stage" data-state={s.status}><div className="pl-n">{String(i + 1).padStart(2, '0')}</div><div className="pl-l">{s.label}</div><div className="pl-d">{s.desc}</div></div>
            ))}
          </div>
          <div className="scaf-note" style={{ marginTop: 16 }}>Authoring and formatting are in progress; assemble, validate and transmit hand off to the Submission Center back-half once the tree is complete.</div>
        </div>
      </div>
    </div>
  );
}

/* ════ PDEV (Product development → IND) ════ */

export function PDEV({ onAsk, onNav }: SurfaceViewProps) {
  const [sel, setSel] = useState(PDEV_ACTIVITIES[0].id);
  const act = PDEV_ACTIVITIES.find((a) => a.id === sel) || PDEV_ACTIVITIES[0];
  const stageOf = (st: string) => ['not_started', 'drafting', 'ai_draft_generated', 'evidence_linked', 'human_review_required', 'in_review', 'changes_requested', 'approved', 'locked', 'submission_ready', 'submitted'].indexOf(st);
  const flow = [
    { k: 'Activity', on: true },
    { k: 'AI draft', on: stageOf(act.state) >= 2 },
    { k: 'Evidence', on: stageOf(act.state) >= 3 },
    { k: 'Review', on: stageOf(act.state) >= 4 },
    { k: 'Confirm', on: stageOf(act.state) >= 7 },
  ];
  return (
    <div className="page-inner">
      <SampleTag sample={true} />
      <PageHead eyebrow="Project · submission" title="Product development → IND"
        sub="Four workstreams to IND. Capture an activity, AnA drafts the regulated artifact, link the evidence, then confirm under governance."
        actions={<><button className="btn ghost" onClick={() => onAsk('What is blocking IND readiness?')}>{I.sparkles} Ask AnA</button><button className="btn primary" onClick={() => onAsk('Capture a new development activity')}>{I.plus} New activity</button></>} />

      <div className="pdev-ws">
        {PDEV_WORKSTREAMS.map((w) => {
          const n = PDEV_ACTIVITIES.filter((a) => a.ws === w.id).length;
          return (
            <div key={w.id} className="pdev-wscard">
              <div className="pdev-wscard-h"><span>{w.label}</span><span className="pdev-wscard-n">{n}</span></div>
              <div className="cmc-bar"><div className="cmc-bar-f" style={{ width: w.readiness + '%' }} /></div>
              <div className="pdev-wscard-f"><span>{w.readiness}% ready</span><span>{w.owner}</span></div>
            </div>
          );
        })}
      </div>

      <div className="split">
        <div className="split-list">
          {PDEV_ACTIVITIES.map((a) => {
            const sm = PDEV_STATE_META[a.state] || { label: a.state, tone: 'idle' };
            return (
              <button key={a.id} className="lrow" data-on={sel === a.id || undefined} onClick={() => setSel(a.id)}>
                <div className="lrow-top"><span className="mono">{a.id}</span><span className={`rd-chip tone-${sm.tone}`}>{sm.label}</span></div>
                <div className="lrow-title">{a.activity}</div>
                <div className="lrow-meta"><span className="scaf-tag" style={{ margin: 0 }}>{PDEV_WORKSTREAMS.find((w) => w.id === a.ws)?.label}</span><span>{a.artifact}</span></div>
                <div className="lrow-foot"><span style={{ fontSize: 11, color: 'var(--text-400)' }}>{a.who}</span></div>
              </button>
            );
          })}
        </div>
        <div className="split-detail">
          <div className="dt-head">
            <div><div className="dt-eyebrow">{act.id} · {PDEV_WORKSTREAMS.find((w) => w.id === act.ws)?.label}</div><h3 className="dt-title">{act.activity}</h3></div>
            {act.section
              ? <button className="btn primary" onClick={() => onNav && onNav('document-authoring')}>{I.penLine} Open artifact</button>
              : <button className="btn ghost" onClick={() => onAsk('Draft ' + act.artifact)}>{I.sparkles} Draft with AnA</button>}
          </div>
          <div className="pdev-flow2">
            {flow.map((f, i) => (
              <React.Fragment key={f.k}>
                <div className="pdev-step2" data-on={f.on || undefined}><span className="pdev-step2-n">{f.on ? I.check : i + 1}</span><span>{f.k}</span></div>
                {i < flow.length - 1 && <span className="pdev-arrow2" data-on={flow[i + 1].on || undefined}>{I.right}</span>}
              </React.Fragment>
            ))}
          </div>
          <div className="gate-grid" style={{ marginTop: 4 }}>
            <GateCellP ok={true} k="Artifact" v={act.artifact} />
            <GateCellP ok={stageOf(act.state) >= 3} k="Evidence linked" v={act.evidence} />
            <GateCellP ok={stageOf(act.state) >= 7} k="Governance" v={(PDEV_STATE_META[act.state] || { label: '' }).label} />
            <GateCellP ok={stageOf(act.state) >= 9} k="IND-ready" v={stageOf(act.state) >= 9 ? 'Yes' : 'Pending'} />
          </div>
          <div className="dr-seclbl" style={{ marginTop: 18 }}>FDA interactions & assembly gate</div>
          <div className="pdev-intel">
            {PDEV_INTERACTIONS.map((x, i) => (
              <div key={i} className="pdev-int" data-s={x.status}>
                <span className="pdev-int-t">{x.type}</span>
                <span className="pdev-int-l">{x.label}</span>
                <span className="pdev-int-w">{x.when}</span>
                <span className={`rd-chip tone-${x.status === 'complete' ? 'ok' : x.status === 'gated' ? 'warn' : 'ai'}`}>{x.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
