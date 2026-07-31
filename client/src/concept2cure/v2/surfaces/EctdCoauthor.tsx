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
import { SampleTag, connected, liveGetOrNull, liveMutateOrNull } from '../dataConnect';
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
  /**
   * Server-issued Part 11 audit id. OPTIONAL and never fabricated client-side —
   * a real audit id is minted by the server when the governed record is
   * persisted (assemblyService), and client fixtures MUST leave this absent
   * rather than invent one. The provenance renderer hides the "Audit …" line
   * when audit is falsy so a fixture cannot pretend to reference an audit row
   * that does not exist.
   */
  audit?: string | null;
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
    { type: 'p', conf: 'hi', text: 'BX-301 is a humanized IgG1κ monoclonal antibody targeting B-cell maturation antigen (BCMA), developed for adults with relapsed or refractory multiple myeloma who have received at least three prior lines of therapy. The development program was designed to establish benefit-risk in a population with limited remaining options.', cite: '2.4', prov: { src: 'Nonclinical Overview §2.4', model: 'AnA -- Maximum', conf: '0.94' } },
    { type: 'p', conf: 'hi', text: 'The clinical pharmacology and efficacy conclusions in this overview are integrated from the pivotal study BX301-301 and the supporting Phase 1 study BX301-101, with exposure-response characterized across the studied dose range.', cite: '5.3.5', prov: { src: 'CSR BX301-301 §11 -- CSR BX301-101 §11', model: 'AnA -- Maximum', conf: '0.91' } },
    { type: 'h2', text: '2.5.4 Overview of Efficacy' },
    { type: 'p', conf: 'hi', text: 'In the pivotal single-arm study BX301-301 (N=128), the overall response rate was 38.6% (95% CI 30.2–47.5) by independent review committee assessment per IMWG criteria, with a median duration of response not yet reached at the data cutoff.', cite: '5.3.5.2', prov: { src: 'CSR BX301-301 §11.4.1 (locked)', model: 'AnA -- Maximum', conf: '0.96' } },
    { type: 'table', head: ['Endpoint', 'Result', '95% CI'], rows: [
      ['Overall response rate', '38.6%', '30.2–47.5', 'ok'],
      ['Very good partial response or better', '24.2%', '17.2–32.4', 'ok'],
      ['Median duration of response', 'Not reached', '—', 'warn'],
      ['Median overall survival', 'HR 0.62', '0.44–0.87', 'ok'],
    ] },
    { type: 'h2', text: '2.5.5 Overview of Safety' },
    { type: 'p', conf: 'med', text: 'The safety profile was consistent with the mechanism of action and the heavily pretreated population. Cytokine release syndrome occurred in 42% of subjects (Grade ≥3 in 3%), was predominantly confined to the first cycle, and was managed with the protocol-specified mitigation strategy.', cite: '2.7.4', prov: { src: 'Clinical Summary §2.7.4 (draft)', model: 'AnA -- Maximum', conf: '0.83' } },
    { type: 'p', conf: 'lo', text: 'Long-term safety follow-up is ongoing; the description of delayed neurotoxicity below the reporting threshold is provisional pending the Day-120 safety update and should be reconciled with the integrated summary of safety before lock.', cite: null, prov: { src: 'Unresolved -- pending ISS lock', model: 'AnA -- Maximum', conf: '0.61' } },
  ],
};

/* The thread starts empty.
   It was previously seeded with a fabricated exchange in which AnA reported
   two COMPLETED tool calls (`attach_sources_to_document` against "CSR
   BX301-301 §11 (locked)" and `run_validation`) and claimed to have drafted
   §2.5.4 from a locked dataset. No request was ever issued and no sources were
   ever attached — the ticks were literals. Showing a finished governed action
   that never ran is the one thing a provenance surface must never do. */
const ECTD_THREAD: EctdThreadMessage[] = [];

/* ---- Validation / compliance actions ----

   These call the real coauthor endpoints and return nothing when the endpoint
   is unreachable or returns no payload.

   They previously fell back to a hardcoded `local()` result — invented eCTD
   findings ("Required eCTD section 3.2.P is missing content") and an invented
   ICH M4 compliance score of 78%, rendered identically to a real server
   response. A reviewer had no way to tell a genuine validation failure from a
   fixture, which is exactly the kind of claim that must never be fabricated on
   a regulatory surface. The UI now renders an explicit unavailable state
   instead. */

function runValidateAction(docId: number): Promise<ValidationResult | null> {
  // Was `window.C2C_API`, assigned nowhere — so this returned null before ever
  // issuing a request, and the panel showed "unavailable" for a reason that had
  // nothing to do with the server. Its sibling runComplianceAction below was
  // already ported to liveGetOrNull; this is the same file carrying both forms.
  return liveMutateOrNull<{ validation?: ValidationResult }>(
    'POST', '/api/coauthor/documents/' + docId + '/validate', {},
  ).then((r) => r.data?.validation || null);
}

function runComplianceAction(docId: number): Promise<ComplianceResult | null> {
  // liveGetOrNull is the fixture-free helper (dataConnect's "real-data
  // standard"): it returns null rather than substituting sample data.
  return liveGetOrNull<{ compliance?: ComplianceResult }>(
    '/api/coauthor/documents/' + docId + '/compliance',
  )
    .then((r) => r.data?.compliance || null)
    .catch(() => null);
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
          {p.audit ? (
            <span className="ec-prov-foot">Audit <b>{p.audit}</b> · 21 CFR Part 11 audit trail</span>
          ) : (
            <span className="ec-prov-foot">Audit id issued on server persist · 21 CFR Part 11 audit trail</span>
          )}
        </span>
      )}
    </p>
  );
}

/* ---- Component ---- */

export function EctdCoauthor({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;
  const live = connected();
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
  // Distinguishes "ran and the endpoint gave us nothing" from "not run yet".
  // Without this the panels would show their idle prompt after a failed call,
  // which reads as "no problems found".
  const [validationUnavailable, setValidationUnavailable] = useState(false);
  const [complianceUnavailable, setComplianceUnavailable] = useState(false);
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
    runValidateAction(art.docId).then((v) => {
      setValidation(v);
      setValidationUnavailable(v === null);
      setBusy('');
    });
  };
  const runCompliance = () => {
    setBusy('compliance');
    setTab('compliance');
    runComplianceAction(art.docId).then((c) => {
      setCompliance(c);
      setComplianceUnavailable(c === null);
      setBusy('');
    });
  };

  const send = () => {
    const q = draft.trim();
    if (!q) return;
    // Hand the question to the real AnA surface rather than answering it here.
    //
    // This used to append a canned assistant turn claiming it had drafted
    // against linked evidence, together with a fake completed
    // `attach_sources_to_document` tool chip — no request was ever made and no
    // sources were ever attached. A user could not tell that reply from a real
    // one. Until this pane is wired to /api/ana-ri/stream, routing to AnA is
    // the only honest behaviour.
    setThread((t) => [...t, { role: 'user', text: q }]);
    setDraft('');
    ask?.(q + ' (eCTD §' + activeId + ')');
    setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 60);
  };

  const _setSectionStatus = (_id: string, _status: string) =>
    setTree((prev) => prev.map((m) => ({ ...m, sections: m.sections.map((s) => s.id === _id ? { ...s, status: _status } : s) })));

  return (
    <div className="ec-shell" data-tree-collapsed={treeCollapsed} data-focus={focus}>
      {/* Top bar */}
      <div className="ec-topbar">
        <button className="ec-topbtn" onClick={() => setTreeCollapsed((v) => !v)} title="Toggle eCTD tree">{I.sidebar || I.menu || I.layers}</button>
        {/* The eCTD tree, the artifact and its provenance are module-level
            fixtures, not project data — `SampleTag` was imported here but
            never rendered, so fabricated content (including audit ids and
            trial results) displayed exactly like live data. Marked with the
            platform's standard sample pill until this surface reads from the
            real content-assembly routes. */}
        <div className="ec-crumbs"><b>{art.program}</b><span className="sep">/</span>{art.app}<span className="sep">/</span><b>&sect;{art.sectionId} {art.title}</b> <SampleTag sample /></div>
        <div className="ec-spacer"></div>
        <span className="ec-autosave">{I.check} Sample artifact -- {art.version}</span>
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
            {thread.length === 0 && (
              <div className="ec-empty">Ask a question about &sect;{activeId} and it opens in AnA, where the answer is generated and traced. This pane does not draft on its own.</div>
            )}
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
          <SampleTag sample />
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
              {!validation && !validationUnavailable && busy !== 'validate' && <div className="ec-empty">Run validation to check module structure, cross-references and section status against the eCTD backbone.</div>}
              {validationUnavailable && busy !== 'validate' && (
                <div className="ec-empty sp-tone-warn">
                  The validation service did not return a result. No findings are shown because none were produced — this is not a clean result.
                </div>
              )}
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
              {!compliance && !complianceUnavailable && busy !== 'compliance' && <div className="ec-empty">Run the ICH M4 compliance check across the organisation of the CTD.</div>}
              {complianceUnavailable && busy !== 'compliance' && (
                <div className="ec-empty sp-tone-warn">
                  The compliance service did not return a result. No score is shown because none was computed — this is not a passing score.
                </div>
              )}
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
