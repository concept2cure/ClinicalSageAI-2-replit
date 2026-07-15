/**
 * Biopharma project surfaces -- kit app/Project3.jsx ported.
 *
 * Contains 3 surfaces:
 *   - BiopharmaProject  (registry id `biopharma`)
 *   - CsrWorkflow       (registry id `csr-workflow`)
 *   - RegulatoryWorkspace (registry id `regulatory-workspace`, full: true)
 */
import React, { useState } from 'react';
import { I } from '../icons';
import { SampleTag, useLiveList } from '../dataConnect';
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

function GateCell({ ok, k, v }: { ok?: boolean; k: string; v: string }) {
  return (
    <div className="gate-cell" data-ok={ok}>
      <span className="gate-ico">{ok ? I.check : I.alertTriangle}</span>
      <div>
        <div className="gate-k">{k}</div>
        <div className="gate-v">{v}</div>
      </div>
    </div>
  );
}

/* ════ Biopharma — BLA / CTD surface ════ */

export function BiopharmaProject({ onAsk, onNav }: SurfaceViewProps) {
  const p = BIO_PROGRAM;
  const bla = BIO_BLA;
  const [tab, setTab] = useState('similarity');
  const liveModules = useLiveList<(typeof BIO_MODULES)[number]>('/api/biopharma/ctd', BIO_MODULES);

  return (
    <div className="page-inner">
      <SampleTag sample={liveModules.sample} />
      <PageHead
        eyebrow="Project · submission"
        title="Biopharma — BLA / CTD"
        sub={`${p.title} · ${p.code} · ${p.due}`}
        actions={
          <>
            <button className="btn ghost" onClick={() => onAsk('What is gating the BLA filing?')}>
              {I.sparkles} Ask AnA
            </button>
            <button className="btn primary" onClick={() => onNav && onNav('document-authoring')}>
              {I.layers} Open CTD editor
            </button>
          </>
        }
      />

      <div className="phases" style={{ gridTemplateColumns: 'repeat(10,1fr)' }}>
        {BIO_PHASES.map((ph, i) => (
          <div key={ph.id} className={`phase ${ph.status}`}>
            <div className="phase-l" style={{ minHeight: 38, fontSize: 10.5 }}>{i + 1}. {ph.label}</div>
            <div className="phase-bar"><div className="phase-bar-f" style={{ width: ph.pct + '%' }} /></div>
            <div className="phase-pct">
              <span>{ph.pct}%</span>
              <span className="kdot" data-tone={STATUS_TONE[ph.status]} />
            </div>
          </div>
        ))}
      </div>

      <div className="split2" style={{ gridTemplateColumns: '1.1fr 1fr', alignItems: 'start' }}>
        <div className="sec">
          <div className="sec-hdr">
            <div className="sec-title">CTD modules</div>
            <div className="sec-sub">233 documents</div>
          </div>
          <div className="cmc-blueprint" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            {liveModules.data.map((m) => (
              <button key={m.code} className="cmc-card" style={{ textAlign: 'left' }} onClick={() => onNav && onNav('document-authoring')}>
                <div className="cmc-card-top">
                  <span className="mono cmc-code">{m.code}</span>
                  <span className={`rd-chip tone-${STATUS_TONE[m.status]}`}>{m.status}</span>
                </div>
                <div className="cmc-card-l">{m.label}</div>
                <div className="cmc-bar"><div className="cmc-bar-f" style={{ width: m.pct + '%' }} /></div>
                <div className="cmc-card-foot"><span>{m.pct}% mapped</span><span>{m.docs} docs</span></div>
              </button>
            ))}
          </div>
        </div>

        <div className="sec">
          <div className="sec-hdr">
            <div className="sec-title">BLA biologics workbench</div>
            <div className="sec-sub">351(a) analytical package</div>
          </div>
          <div className="tabs">
            {([['similarity', 'Analytical similarity'], ['comparability', 'Comparability'], ['immunogenicity', 'Immunogenicity']] as const).map(([x, l]) => (
              <button key={x} className={`tab${tab === x ? ' on' : ''}`} onClick={() => setTab(x)}>{l}</button>
            ))}
          </div>
          <div className="tab-body">
            {tab === 'similarity' && (
              <div className="ctable">
                <div className="ct-head" style={{ gridTemplateColumns: '1.1fr 1fr 1fr 70px' }}>
                  <div>Attribute</div><div>Method</div><div>Result</div><div></div>
                </div>
                {bla.similarity.map((r, i) => (
                  <div key={i} className="ct-row" style={{ gridTemplateColumns: '1.1fr 1fr 1fr 70px' }}>
                    <div className="ct-strong">{r.attr}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-400)' }}>{r.method}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-300)' }}>{r.result}</div>
                    <div><span className={`rd-chip tone-${r.verdict}`}>{r.verdict === 'ok' ? 'Pass' : 'Review'}</span></div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'comparability' && (
              <div className="ctable">
                <div className="ct-head" style={{ gridTemplateColumns: '1fr 1fr 110px' }}>
                  <div>Change</div><div>Scope</div><div>Verdict</div>
                </div>
                {bla.comparability.map((r, i) => (
                  <div key={i} className="ct-row" style={{ gridTemplateColumns: '1fr 1fr 110px' }}>
                    <div className="ct-strong">{r.lot}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-400)' }}>{r.scope}</div>
                    <div><span className={`rd-chip tone-${r.tone}`}>{r.status}</span></div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'immunogenicity' && (
              <div className="gate-grid">
                <GateCell ok k="ADA incidence" v={bla.immunogenicity.adaRate} />
                <GateCell ok k="NAb incidence" v={bla.immunogenicity.nabRate} />
                <GateCell ok k="Assay" v={bla.immunogenicity.assay} />
                <GateCell ok k="Clinical impact" v={bla.immunogenicity.impact} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════ CSR Workflow — ICH E3 surface ════ */

export function CsrWorkflow({ onAsk }: SurfaceViewProps) {
  const p = CSR_PROGRAM;

  return (
    <div className="page-inner">
      <SampleTag sample={true} />
      <PageHead
        eyebrow="Project · clinical"
        title="CSR workflow"
        sub={`${p.title} · ${p.code} · ${p.readiness}% ready`}
        actions={
          <button className="btn primary" onClick={() => onAsk('Draft CSR §11 efficacy evaluation')}>
            {I.sparkles} Draft section
          </button>
        }
      />

      <div className="ctable" style={{ maxWidth: 760 }}>
        <div className="ct-head" style={{ gridTemplateColumns: '70px 1fr 100px 60px' }}>
          <div>§</div><div>ICH E3 section</div><div>Status</div><div></div>
        </div>
        {CSR_SECTIONS.map((s, i) => (
          <button
            key={i}
            className="ct-row"
            style={{ gridTemplateColumns: '70px 1fr 100px 60px' }}
            data-blocker={s.blocker || undefined}
            onClick={() => onAsk(`Open CSR §${s.num} in the editor`)}
          >
            <div className="mono" style={{ color: 'var(--accent-200)' }}>{s.num}</div>
            <div className="vn">
              {s.blocker && <span className="esig" style={{ color: 'var(--error)' }}>{I.alertTriangle}</span>}
              <span className="ct-strong">{s.label}</span>
            </div>
            <div><span className={`rd-chip tone-${STATUS_TONE[s.status]}`}>{s.status}</span></div>
            <div style={{ color: 'var(--text-400)' }}>{I.arrowRight}</div>
          </button>
        ))}
      </div>

      <div className="scaf-note" style={{ marginTop: 16, maxWidth: 760 }}>
        §11 Efficacy evaluation is the gating section — open it in the document editor to draft from the SAP and TLF shells with provenance.
      </div>
    </div>
  );
}

/* ════ Regulatory Workspace — generic 3-pane substrate (full: true) ════ */

export function RegulatoryWorkspace({ onAsk }: SurfaceViewProps) {
  const [active, setActive] = useState('r1');
  const sec = RW_TREE.find((s) => s.id === active) || RW_TREE[0];

  return (
    <div className="ed">
      <aside className="ed-tree">
        <div className="ed-tree-h">
          <div className="ed-tree-t">Sections</div>
          <div className="ed-tree-m">Generic authoring substrate</div>
        </div>
        <div className="ed-tree-scroll">
          <div className="ed-vol">
            {RW_TREE.map((s) => (
              <button
                key={s.id}
                className="ed-tree-row"
                data-active={active === s.id || undefined}
                onClick={() => setActive(s.id)}
              >
                <span className="ed-num">{s.num}</span>
                <span className="ed-lbl">{s.label}</span>
                <span className="ed-dot" data-s={s.status} />
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="ed-doc">
        <header className="ed-doc-h">
          <div className="ed-crumbs">
            <span>Regulatory workspace</span>
            <span className="sep">›</span>
            <span className="here">{sec.num} {sec.label}</span>
          </div>
          <button className="btn primary" style={{ height: 30 }} onClick={() => onAsk(`Open ${sec.num} in the document editor`)}>
            {I.penLine} Open in editor
          </button>
        </header>
        <div className="ed-doc-scroll">
          <div className="ed-doc-inner">
            <div className="ed-mast">
              <div className="ed-mast-num">§{sec.num}</div>
              <h1 className="ed-mast-t">{sec.label}</h1>
              <div className="ed-mast-meta">Canvas · tree · intelligence — the substrate documents and editors specialize.</div>
            </div>
            <p className="ed-p" style={{ color: 'var(--text-300)' }}>
              This is the canonical three-pane workspace: the section tree (left), the editable canvas (here), and the intelligence panel (right). Document authoring, 510(k) and CSR all specialize this same shell — selecting a section routes into the full editor with provenance, flags and comments.
            </p>
            <div className="ed-foot">
              <button className="btn ghost" onClick={() => onAsk('Draft this section')}>
                {I.sparkles} Draft with AnA
              </button>
            </div>
          </div>
        </div>
      </section>

      <aside className="ed-comments">
        <div className="ed-comments-h">Intelligence</div>
        {RW_INTEL.map((x, i) => (
          <div key={i} className="gate-cell" style={{ alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div className="gate-k">{x.k}</div>
              <div className="gate-v" style={{ fontSize: 12 }}>{x.v}</div>
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
