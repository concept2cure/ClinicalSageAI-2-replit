/**
 * eCTD Co-Author — kit app/ectd-coauthor.jsx ported (registry id
 * `ectd-coauthor`, full:true, hideAna:true).
 *
 * System-aware 3-pane artifact architecture: eCTD tree drawer (M1--5),
 * intelligence (AnA) pane, and the live provenance-traced section artifact.
 * Grounded in coauthor.ts (validate/compile/compliance) and contentAssembly
 * routes. The ARTIFACT (the live-rendered, provenance-traced section) is the
 * hero -- not a dashboard. Registers full-height + hides shell AnA (has its
 * own inline intelligence pane).
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import '../styles/ectd-v2.css';

/* ---- Types ---- */

interface EctdSection {
  id: string;
  title: string;
  status: string;
  active?: boolean;
}

interface EctdModule {
  m: string;
  title: string;
  open: boolean;
  sections: EctdSection[];
}

interface EctdProvenance {
  src: string;
  model: string;
  conf: string;
  audit: string;
}

interface EctdBlock {
  type: string;
  text?: string;
  conf?: string;
  cite?: string | null;
  prov?: EctdProvenance;
  head?: string[];
  rows?: string[][];
}

interface EctdArtifactData {
  docId: number;
  sectionId: string;
  module: string;
  title: string;
  num: string;
  program: string;
  product: string;
  app: string;
  version: string;
  savedAt: string;
  masthead: [string, string][];
  blocks: EctdBlock[];
}

interface EctdThreadTool {
  label: string;
  detail: string;
  done: boolean;
}

interface EctdThreadArtifact {
  title: string;
  meta: string;
}

interface EctdThreadMessage {
  role: 'user' | 'ai';
  text?: string;
  body?: string;
  tools?: EctdThreadTool[];
  artifact?: EctdThreadArtifact;
}

interface ValidationFinding {
  type: string;
  severity: string;
  module?: string;
  sectionId?: string;
  message: string;
}

interface ValidationResult {
  isValid: boolean;
  errorCount: number;
  warningCount: number;
  totalSections: number;
  validatedAt: string;
  findings: ValidationFinding[];
}

interface ComplianceCheck {
  ruleId: string;
  description: string;
  status: string;
  module?: string;
}

interface ComplianceResult {
  standard: string;
  complianceScore: number;
  totalChecks: number;
  compliantCount: number;
  nonCompliantCount: number;
  checkedAt: string;
  checks: ComplianceCheck[];
}

/* ---- Fixture data (from kit window globals) ---- */

const ECTD_TREE: EctdModule[] = [
  { m: '1', title: 'Administrative Information and Prescribing Information', open: true, sections: [
    { id: '1.1', title: 'Forms (356h)', status: 'approved' },
    { id: '1.2', title: 'Cover letter', status: 'approved' },
    { id: '1.3', title: 'Administrative information', status: 'review' },
    { id: '1.14', title: 'Labeling (PI / PLLR)', status: 'draft' },
  ] },
  { m: '2', title: 'Common Technical Document Summaries', open: true, sections: [
    { id: '2.2', title: 'Introduction', status: 'approved' },
    { id: '2.3', title: 'Quality overall summary', status: 'review' },
    { id: '2.4', title: 'Nonclinical overview', status: 'approved' },
    { id: '2.5', title: 'Clinical overview', status: 'draft', active: true },
    { id: '2.6', title: 'Nonclinical written & tabulated summaries', status: 'review' },
    { id: '2.7', title: 'Clinical summary', status: 'draft' },
  ] },
  { m: '3', title: 'Quality', open: false, sections: [
    { id: '3.2.S', title: 'Drug substance', status: 'review' },
    { id: '3.2.P', title: 'Drug product', status: 'blocked' },
  ] },
  { m: '4', title: 'Nonclinical Study Reports', open: false, sections: [
    { id: '4.2.1', title: 'Pharmacology', status: 'approved' },
    { id: '4.2.2', title: 'Pharmacokinetics', status: 'approved' },
    { id: '4.2.3', title: 'Toxicology', status: 'approved' },
  ] },
  { m: '5', title: 'Clinical Study Reports', open: false, sections: [
    { id: '5.2', title: 'Tabular listing of studies', status: 'approved' },
    { id: '5.3', title: 'Clinical study reports', status: 'draft' },
  ] },
];

const ECTD_ARTIFACT: EctdArtifactData = {
  docId: 4021, sectionId: '2.5', module: '2',
  title: 'Clinical Overview', num: 'CTD Module 2.5 -- ICH M4E(R2)',
  program: 'BX-301', product: 'BX-301 (anti-BCMA)', app: 'BLA -- 351(a)',
  version: 'v0.7', savedAt: '2 sec ago',
  masthead: [
    ['Program', 'BX-301'], ['Application', 'BLA 351(a)'],
    ['Indication', 'Relapsed multiple myeloma'], ['Sponsor', 'Concept2Cure'],
  ],
  blocks: [
    { type: 'h2', text: '2.5.1 Product Development Rationale' },
    { type: 'p', conf: 'hi', text: 'BX-301 is a humanized IgG1κ monoclonal antibody targeting B-cell maturation antigen (BCMA), developed for adults with relapsed or refractory multiple myeloma who have received at least three prior lines of therapy. The development program was designed to establish benefit-risk in a population with limited remaining options.', cite: '2.4', prov: { src: 'Nonclinical Overview §2.4', model: 'AnA -- Maximum', conf: '0.94', audit: 'AUD-2.5-0012' } },
    { type: 'p', conf: 'hi', text: 'The clinical pharmacology and efficacy conclusions in this overview are integrated from the pivotal study BX301-301 and the supporting Phase 1 study BX301-101, with exposure-response characterized across the studied dose range.', cite: '5.3.5', prov: { src: 'CSR BX301-301 §11 -- CSR BX301-101 §11', model: 'AnA -- Maximum', conf: '0.91', audit: 'AUD-2.5-0013' } },
    { type: 'h2', text: '2.5.4 Overview of Efficacy' },
    { type: 'p', conf: 'hi', text: 'In the pivotal single-arm study BX301-301 (N=128), the overall response rate was 38.6% (95% CI 30.2–47.5) by independent review committee assessment per IMWG criteria, with a median duration of response not yet reached at the data cutoff.', cite: '5.3.5.2', prov: { src: 'CSR BX301-301 §11.4.1 (locked)', model: 'AnA -- Maximum', conf: '0.96', audit: 'AUD-2.5-0014' } },
    { type: 'table', head: ['Endpoint', 'Result', '95% CI'], rows: [
      ['Overall response rate', '38.6%', '30.2–47.5', 'ok'],
      ['Very good partial response or better', '24.2%', '17.2–32.4', 'ok'],
      ['Median duration of response', 'Not reached', '—', 'warn'],
      ['Median overall survival', 'HR 0.62', '0.44–0.87', 'ok'],
    ] },
    { type: 'h2', text: '2.5.5 Overview of Safety' },
    { type: 'p', conf: 'med', text: 'The safety profile was consistent with the mechanism of action and the heavily pretreated population. Cytokine release syndrome occurred in 42% of subjects (Grade ≥3 in 3%), was predominantly confined to the first cycle, and was managed with the protocol-specified mitigation strategy.', cite: '2.7.4', prov: { src: 'Clinical Summary §2.7.4 (draft)', model: 'AnA -- Maximum', conf: '0.83', audit: 'AUD-2.5-0015' } },
    { type: 'p', conf: 'lo', text: 'Long-term safety follow-up is ongoing; the description of delayed neurotoxicity below the reporting threshold is provisional pending the Day-120 safety update and should be reconciled with the integrated summary of safety before lock.', cite: null, prov: { src: 'Unresolved -- pending ISS lock', model: 'AnA -- Maximum', conf: '0.61', audit: 'AUD-2.5-0016' } },
  ],
};

const ECTD_THREAD: EctdThreadMessage[] = [
  { role: 'user', text: 'Draft Section 2.5 efficacy from the locked pivotal CSR.' },
  { role: 'ai',
    tools: [
      { label: 'attach_sources_to_document', detail: 'CSR BX301-301 §11 (locked)', done: true },
      { label: 'run_validation', detail: 'eCTD structure -- ICH M4E(R2)', done: true },
    ],
    body: 'I drafted §2.5.4 from the locked BX301-301 dataset -- overall response rate 38.6% (95% CI 30.2–47.5) by IRC. Every claim is traced to the source paragraph; hover any paragraph in the artifact to see provenance.',
    artifact: { title: 'Clinical Overview -- §2.5', meta: 'v0.7 -- 6 paragraphs -- 4 citations' },
  },
];

/* ---- Local live-first data + validation/compliance actions ---- */

function isConnected(): boolean {
  return !!((window as any).C2C_API && (window as any).C2C_API.connected());
}

function runValidateAction(docId: number): Promise<ValidationResult> {
  const local = (): ValidationResult => ({
    isValid: false, errorCount: 1, warningCount: 2, totalSections: 19,
    validatedAt: new Date().toISOString(),
    findings: [
      { type: 'missing-section', severity: 'error', module: '3', sectionId: '3.2.P', message: 'Required eCTD section 3.2.P is missing content from Module 3 (Quality).' },
      { type: 'incomplete-section', severity: 'warning', sectionId: '2.7', message: 'Section "Clinical summary" (2.7) has status "draft".' },
      { type: 'broken-reference', severity: 'warning', sectionId: '2.5', message: 'Section "Clinical overview" (2.5) references "2.7.4" which is not yet approved.' },
    ],
  });
  if ((window as any).C2C_API) {
    return (window as any).C2C_API.post('/api/coauthor/documents/' + docId + '/validate', {})
      .then((r: any) => (r && r.validation) || local())
      .catch(local);
  }
  return Promise.resolve(local());
}

function runComplianceAction(docId: number): Promise<ComplianceResult> {
  const local = (): ComplianceResult => ({
    standard: 'ICH M4', complianceScore: 78, totalChecks: 9,
    compliantCount: 7, nonCompliantCount: 2, checkedAt: new Date().toISOString(),
    checks: [
      { ruleId: 'M4-001', description: 'Module 1 regional administrative information present', status: 'compliant', module: '1' },
      { ruleId: 'M4-002', description: 'Module 2 CTD summaries present', status: 'compliant', module: '2' },
      { ruleId: 'M4-003', description: 'Module 3 quality data present', status: 'compliant', module: '3' },
      { ruleId: 'M4-004', description: 'Module 2.5 Clinical Overview or 2.7 Clinical Summary present', status: 'compliant', module: '2.5' },
      { ruleId: 'M4-005', description: 'Module 3.2.S Drug Substance present', status: 'compliant', module: '3.2.S' },
      { ruleId: 'M4-006', description: 'Module 3.2.P Drug Product present', status: 'non-compliant', module: '3.2.P' },
      { ruleId: 'M4-DOC-001', description: 'Document has a title', status: 'compliant' },
      { ruleId: 'M4-DOC-002', description: 'Document has content or sections', status: 'compliant' },
      { ruleId: 'M4-DOC-003', description: 'All sections have assigned module numbers', status: 'non-compliant' },
    ],
  });
  if ((window as any).C2C_API) {
    return (window as any).C2C_API.live('/api/coauthor/documents/' + docId + '/compliance', { compliance: local() })
      .then((r: any) => (r.data && r.data.compliance) || local())
      .catch(local);
  }
  return Promise.resolve(local());
}

/* ---- Provenance-traced paragraph ---- */

function EcPara({ b }: { b: EctdBlock }) {
  const p = b.prov;
  return (
    <p className="ec-p" data-conf={b.conf}>
      <span className="ec-gutter" aria-hidden="true"></span>
      {b.text}
      {b.cite ? <a className="ec-cite" href="#" onClick={(e) => e.preventDefault()}>{b.cite}</a> : null}
      {p && (
        <span className="ec-prov" role="note">
          <span className="ec-prov-row"><span className="ec-prov-lbl">Source</span><span className="ec-prov-val">{p.src}</span></span>
          <span className="ec-prov-row"><span className="ec-prov-lbl">Model</span><span className="ec-prov-val">{p.model}</span></span>
          <span className="ec-prov-row"><span className="ec-prov-lbl">Confidence</span><span className="ec-prov-val">{p.conf}</span></span>
          <span className="ec-prov-foot">Audit <b>{p.audit}</b> -- 21 CFR Part 11</span>
        </span>
      )}
    </p>
  );
}

/* ---- Component ---- */

export function EctdCoauthor({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;
  const live = isConnected();
  const art = ECTD_ARTIFACT;
  const [tree, setTree] = useState<EctdModule[]>(ECTD_TREE);
  const [activeId, setActiveId] = useState('2.5');
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [focus, setFocus] = useState(false);
  const [tab, setTab] = useState<'document' | 'validation' | 'compliance'>('document');
  const [thread, setThread] = useState<EctdThreadMessage[]>(ECTD_THREAD);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Section rollup for the answer-first lead + tree footer */
  const allSecs = useMemo(() => tree.flatMap((m) => m.sections.map((s) => ({ ...s, m: m.m }))), [tree]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { approved: 0, review: 0, draft: 0, blocked: 0 };
    allSecs.forEach((s) => { if (c[s.status] != null) c[s.status]++; });
    return c;
  }, [allSecs]);
  const total = allSecs.length;
  const readiness = Math.round((counts.approved + counts.review * 0.5) / total * 100);
  const blocked = allSecs.filter((s) => s.status === 'blocked');

  const runValidate = () => {
    setBusy('validate');
    setTab('validation');
    runValidateAction(art.docId).then((v) => { setValidation(v); setBusy(''); });
  };
  const runCompliance = () => {
    setBusy('compliance');
    setTab('compliance');
    runComplianceAction(art.docId).then((c) => { setCompliance(c); setBusy(''); });
  };

  const send = () => {
    const q = draft.trim();
    if (!q) return;
    setThread((t) => [...t,
      { role: 'user', text: q },
      { role: 'ai', body: 'Working in §' + activeId + ' — I’ll draft against the linked evidence and keep every claim traced. Open the artifact to review the reveal.', tools: [{ label: 'attach_sources_to_document', detail: 'linked evidence for §' + activeId, done: true }] },
    ]);
    setDraft('');
    setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 60);
  };

  const _setSectionStatus = (_id: string, _status: string) =>
    setTree((prev) => prev.map((m) => ({ ...m, sections: m.sections.map((s) => s.id === _id ? { ...s, status: _status } : s) })));

  return (
    <div className="ec-shell" data-tree-collapsed={treeCollapsed} data-focus={focus}>
      {/* Top bar */}
      <div className="ec-topbar">
        <button className="ec-topbtn" onClick={() => setTreeCollapsed((v) => !v)} title="Toggle eCTD tree">{I.sidebar || I.menu || I.layers}</button>
        <div className="ec-crumbs"><b>{art.program}</b><span className="sep">/</span>{art.app}<span className="sep">/</span><b>&sect;{art.sectionId} {art.title}</b></div>
        <div className="ec-spacer"></div>
        <span className="ec-autosave">{I.check} Autosaved -- {art.version} -- {art.savedAt}</span>
        <button className="ec-topbtn" onClick={() => setFocus((v) => !v)} title="Focus mode">{focus ? (I.minimize || I.x) : (I.maximize || I.expand || I.layers)}</button>
        <button className="ec-topbtn primary" onClick={runValidate}>{I.shieldCheck || I.shield} Validate</button>
      </div>

      {/* eCTD tree */}
      <aside className="ec-tree">
        <div className="ec-tree-head"><b>eCTD backbone</b><span className="mono">M1--5</span></div>
        <div className="ec-tree-search">{I.search}<input placeholder="Find section..." onChange={() => { /* noop */ }} /></div>
        {tree.map((mod) => (
          <div key={mod.m} className="ec-tree-mod">
            <button className="ec-tree-row" onClick={() => setTree((prev) => prev.map((x) => x.m === mod.m ? { ...x, open: !x.open } : x))}>
              <span className="ec-caret" data-open={mod.open}>{I.chevronRight || '›'}</span>
              <span className="ec-tnum">M{mod.m}</span>
              <span className="ec-tlabel">{mod.title}</span>
            </button>
            {mod.open && (
              <div className="ec-tree-children">
                {mod.sections.map((s) => (
                  <button key={s.id} className="ec-tree-row" data-active={activeId === s.id} onClick={() => { setActiveId(s.id); setTab('document'); }}>
                    <span className="ec-tnum">{s.id}</span>
                    <span className="ec-tlabel">{s.title}</span>
                    <span className="ec-tstatus" data-s={s.status} title={s.status}></span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="ec-tree-foot">
          <div className="ec-tree-foot-row"><span>Sections</span><b>{total}</b></div>
          <div className="ec-tree-foot-row"><span>Approved</span><b>{counts.approved}</b></div>
          <div className="ec-tree-foot-row"><span>eCTD readiness</span><b>{readiness}%</b></div>
        </div>
      </aside>

      {/* Intelligence (AnA) */}
      <section className="ec-intel">
        <div className="ec-intel-head"><b>AnA</b><span className="hint">co-authoring &sect;{activeId} -- {live ? 'live' : 'bound to dossier'}</span></div>
        <div className="ec-intel-scroll" ref={scrollRef}>
          <div className="ec-thread">
            {thread.map((m, i) => m.role === 'user'
              ? <div key={i} className="ec-msg-user">{m.text}</div>
              : <div key={i} className="ec-msg-ai">
                  <span className="ec-avatar">AnA</span>
                  <div className="ec-body">
                    {(m.tools || []).map((t, j) => (
                      <div key={j} className="ec-tool"><span className="ec-tick">{t.done ? I.check : ''}</span> <b>{t.label}</b> -- {t.detail}</div>
                    ))}
                    {m.body && <p>{m.body}</p>}
                    {m.artifact && (
                      <button className="ec-artchip" onClick={() => { setFocus(false); setTab('document'); }}>
                        <span className="ec-artchip-ico">{I.fileText || I.file}</span>
                        <span><span className="ec-artchip-t">{m.artifact.title}</span><span className="ec-artchip-m">{m.artifact.meta}</span></span>
                      </button>
                    )}
                  </div>
                </div>
            )}
          </div>
        </div>
        <div className="ec-intel-foot">
          <div className="ec-composer">
            <textarea rows={1} placeholder={'Ask AnA to draft, tighten, or cite §' + activeId + '...'} value={draft}
              onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <div className="ec-composer-row">
              <span className="ec-chip">{I.paperclip || I.plus} Sources</span>
              <button className="ec-send" disabled={!draft.trim()} onClick={send}>{I.arrowUp || I.arrowRight || '→'}</button>
            </div>
          </div>
        </div>
      </section>

      {/* Artifact -- the hero */}
      <section className="ec-artifact">
        <div className="ec-art-head">
          <span className="ec-art-title">{art.title}</span>
          <span className="ec-art-meta">&sect;{art.sectionId} -- {art.num}</span>
          <span className="ec-spacer"></span>
          <div className="ec-art-tabs">
            {(['document', 'validation', 'compliance'] as const).map((k) => (
              <button key={k} className="ec-art-tab" data-active={tab === k} onClick={() => { setTab(k); if (k === 'compliance' && !compliance) runCompliance(); if (k === 'validation' && !validation) runValidate(); }}>{k.charAt(0).toUpperCase() + k.slice(1)}</button>
            ))}
          </div>
        </div>

        {tab === 'document' && (
          <div className="ec-art-doc">
            <div className="ec-doc-inner">
              <AnswerLead
                tone={blocked.length ? 'urgent' : 'calm'}
                eyebrow={'What §' + art.sectionId + ' needs before it can promote'}
                headline={blocked.length
                  ? <>The dossier is <b>{readiness}%</b> eCTD-ready -- <b>{blocked[0].id} {blocked[0].title}</b> is blocked and gates Module {blocked[0].m}.</>
                  : <><b>&sect;{art.sectionId} {art.title}</b> is drafted and traced. The dossier is <b>{readiness}%</b> eCTD-ready across {total} sections.</>}
                body={<>Every paragraph below carries provenance (source -- model -- confidence -- audit id) for 21 CFR Part 11 -- hover to inspect. One low-confidence paragraph is still pending the ISS lock.</>}
                reassure="I keep each claim traced to its locked source and re-run eCTD structure and ICH M4 checks as you write."
                action={{ label: 'Run eCTD validation', onClick: runValidate }}
                secondary="Or keep drafting -- the artifact updates live."
              />
              <div className="ec-masthead">
                <div className="ec-mast-grid">
                  {art.masthead.map(([l, v]) => (<div key={l}><div className="ec-mast-l">{l}</div><div className="ec-mast-v">{v}</div></div>))}
                </div>
              </div>
              <h1 className="ec-doc-h1">{art.title}</h1>
              <div className="ec-doc-num">{art.num}</div>
              <div className="ec-stagger">
                {art.blocks.map((b, i) => {
                  if (b.type === 'h2') return <h2 key={i} className="ec-doc-h2">{b.text}</h2>;
                  if (b.type === 'table') return (
                    <table key={i} className="ec-doc-table"><thead><tr>{(b.head || []).map((h) => <th key={h}>{h}</th>)}</tr></thead>
                      <tbody>{(b.rows || []).map((r, ri) => (<tr key={ri}><td>{r[0]}</td><td className="num"><span className={'ec-pill ' + (r[3] || 'ok')}>{r[1]}</span></td><td className="num">{r[2]}</td></tr>))}</tbody>
                    </table>
                  );
                  return <EcPara key={i} b={b} />;
                })}
              </div>
            </div>
          </div>
        )}

        {tab === 'validation' && (
          <div className="ec-art-panel">
            <div className="ec-doc-inner">
              <div className="ec-panel-head">
                <div><div className="ec-panel-t">eCTD structural validation</div><div className="ec-panel-s">POST /api/coauthor/documents/{art.docId}/validate -- ICH M4 eCTD rules {live ? '-- live' : ''}</div></div>
                <button className="ec-topbtn primary" onClick={runValidate}>{busy === 'validate' ? 'Validating...' : <>{I.refresh || I.check} Re-validate</>}</button>
              </div>
              {!validation && busy !== 'validate' && <div className="ec-empty">Run validation to check module structure, cross-references and section status against the eCTD backbone.</div>}
              {busy === 'validate' && <div className="ec-empty">Validating {total} sections against ICH M4 structure...</div>}
              {validation && (
                <>
                  <div className="ec-vstat" data-valid={validation.isValid}>
                    <span className={'ec-vbadge ' + (validation.isValid ? 'ok' : 'err')}>{validation.isValid ? 'Valid' : validation.errorCount + ' error' + (validation.errorCount === 1 ? '' : 's')}</span>
                    <span className="mono">{validation.errorCount} error -- {validation.warningCount} warning -- {validation.totalSections} sections</span>
                  </div>
                  <div className="ec-findings">
                    {validation.findings.map((f, i) => (
                      <div key={i} className="ec-finding" data-sev={f.severity}>
                        <span className="ec-fsev">{f.severity === 'error' ? (I.alertTriangle || I.x) : (I.info || I.alertCircle)}</span>
                        <div><div className="ec-ftype mono">{f.type}{f.sectionId ? ' -- §' + f.sectionId : ''}{f.module ? ' -- M' + f.module : ''}</div><div className="ec-fmsg">{f.message}</div></div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'compliance' && (
          <div className="ec-art-panel">
            <div className="ec-doc-inner">
              <div className="ec-panel-head">
                <div><div className="ec-panel-t">ICH M4 compliance</div><div className="ec-panel-s">GET /api/coauthor/documents/{art.docId}/compliance {live ? '-- live' : ''}</div></div>
                <button className="ec-topbtn primary" onClick={runCompliance}>{busy === 'compliance' ? 'Checking...' : <>{I.refresh || I.check} Re-check</>}</button>
              </div>
              {!compliance && busy !== 'compliance' && <div className="ec-empty">Run the ICH M4 compliance check across the organisation of the CTD.</div>}
              {busy === 'compliance' && <div className="ec-empty">Checking ICH M4 organisation...</div>}
              {compliance && (
                <>
                  <div className="ec-cscore">
                    <div className="ec-cscore-num">{compliance.complianceScore}<span className="u">%</span></div>
                    <div><div className="ec-cscore-l">{compliance.standard} compliance</div><div className="ec-cscore-s mono">{compliance.compliantCount}/{compliance.totalChecks} checks compliant -- {compliance.nonCompliantCount} to resolve</div></div>
                  </div>
                  <div className="ec-checks">
                    {compliance.checks.map((c, i) => (
                      <div key={i} className="ec-check" data-ok={c.status === 'compliant'}>
                        <span className="ec-check-dot">{c.status === 'compliant' ? I.check : (I.x)}</span>
                        <span className="ec-check-id mono">{c.ruleId}</span>
                        <span className="ec-check-desc">{c.description}</span>
                        {c.module && <span className="ec-check-mod mono">M{c.module}</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
