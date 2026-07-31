/**
 * eCTD Co-Author — fixture-free (GA real-data standard).
 *
 * System-aware 3-pane artifact architecture: eCTD tree drawer (M1--5),
 * intelligence (AnA) pane, and the live section artifact.
 *
 * Every rendered value is REAL org-scoped data or an honest empty/error state:
 *   • the eCTD backbone tree is the org's REAL coauthor documents
 *     (GET /api/coauthor/documents), bucketed into ICH M4 modules M1--5 by each
 *     document's moduleNumber — never a codebase tree;
 *   • the artifact renders the SELECTED document's real persisted content
 *     (coauthor_documents.content, HTML) through the audited DOMPurify path;
 *   • structural validation (POST …/validate) and ICH M4 compliance
 *     (GET …/compliance) are computed on the server from that document and its
 *     sections;
 *   • the AnA pane routes every typed question to the real AnA surface
 *     (/api/ana-ri/stream) via onAsk — it never drafts or reports tool calls
 *     on its own.
 *
 * No fixture, no "Sample data" pill, no fabricated provenance/audit id, no
 * local stand-in. An org with no documents sees an honest empty affordance.
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { I } from '../icons';
import { connected, liveGetOrNull, liveMutateOrNull, EmptyState } from '../dataConnect';
import { sanitizeChatHtml } from '../../components/ana/renderSafeMarkdown';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import '../styles/ectd-v2.css';

/* ---- Render-contract types ---- */

/** A row from GET /api/coauthor/documents (coauthor_documents). */
interface CoauthorDoc {
  id: number;
  title: string;
  content?: string | null;
  status: string;
  moduleNumber?: string | null;
  moduleName?: string | null;
  completionPercentage?: number | null;
  regulatoryComplianceScore?: number | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
}

/** A turn in the AnA hand-off pane. Only user turns are ever appended here —
 *  the answer is generated and traced in the real AnA surface, not inline. */
interface EctdThreadMessage {
  role: 'user' | 'ai';
  text?: string;
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

/* ---- eCTD backbone labels (ICH M4 module titles — standard structure config,
   not org data; these mirror the server's ECTD_MODULE_STRUCTURE titles). ---- */

const ECTD_MODULE_LABELS: Record<string, string> = {
  '1': 'Administrative Information and Prescribing Information',
  '2': 'Common Technical Document Summaries',
  '3': 'Quality',
  '4': 'Nonclinical Study Reports',
  '5': 'Clinical Study Reports',
};
const MODULE_ORDER = ['1', '2', '3', '4', '5'];

/** Top-level eCTD module a document sits in, from its moduleNumber ("2.5" → "2",
 *  "3.2.P" → "3"). Documents without a module land in an "unassigned" bucket. */
function moduleOf(d: CoauthorDoc): string {
  const m = (d.moduleNumber || '').split('.')[0];
  return m || '—';
}

/** Real document status → the CSS status token (ec-tstatus[data-s]). Maps the
 *  persisted coauthor status vocabulary (draft/in-progress/review/approved/
 *  finalized) onto the backbone's dot styles. */
function statusToken(s: string | null | undefined): string {
  const v = (s || '').toLowerCase();
  if (v === 'approved' || v === 'finalized') return 'approved';
  if (v === 'review' || v === 'in-progress' || v === 'in_progress') return 'review';
  if (v === 'draft') return 'draft';
  return 'todo';
}

/* ---- Validation / compliance actions ----

   Both call the real coauthor endpoints and return null (never a fixture) when
   the endpoint is unreachable or returns no payload — a failed governed check
   must not be indistinguishable from a passing one.

   These previously fell back to a hardcoded `local()` result — invented eCTD
   findings and an invented ICH M4 compliance score, rendered identically to a
   real server response — and runValidateAction was additionally gated on the
   ghost `window.C2C_API` (assigned nowhere in the repo), so it returned null
   before ever issuing a request. Both are now on the sanctioned fetch
   convention (liveMutateOrNull / liveGetOrNull, dataConnect's "real-data
   standard"). The UI renders an explicit unavailable state on null. */

function runValidateAction(docId: number): Promise<ValidationResult | null> {
  return liveMutateOrNull<{ validation?: ValidationResult }>(
    'POST', '/api/coauthor/documents/' + docId + '/validate', {},
  )
    .then((r) => r.data?.validation || null)
    .catch(() => null);
}

function runComplianceAction(docId: number): Promise<ComplianceResult | null> {
  return liveGetOrNull<{ compliance?: ComplianceResult }>(
    '/api/coauthor/documents/' + docId + '/compliance',
  )
    .then((r) => r.data?.compliance || null)
    .catch(() => null);
}

/* ---- Component ---- */

export function EctdCoauthor({ onAsk, onNav: _onNav }: SurfaceViewProps) {
  const ask = onAsk;
  const live = connected();

  const [docs, setDocs] = useState<CoauthorDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [focus, setFocus] = useState(false);
  const [tab, setTab] = useState<'document' | 'validation' | 'compliance'>('document');
  const [thread, setThread] = useState<EctdThreadMessage[]>([]);
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

  /* Fixture-free read: adopt the org's REAL coauthor documents. A failed fetch
     is an honest error; a successful zero-row load is an honest empty — never a
     codebase fixture. Each row already carries its content/status/module, so
     the selected artifact renders straight from the list without a second
     round-trip. */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    liveGetOrNull<{ documents: CoauthorDoc[] }>('/api/coauthor/documents').then((res) => {
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }
      const list = Array.isArray(res.data?.documents) ? res.data!.documents : [];
      setDocs(list);
      // Open every module that actually holds a document.
      const open: Record<string, boolean> = {};
      for (const d of list) open[moduleOf(d)] = true;
      setOpenModules(open);
      if (list.length > 0) {
        setActiveId((cur) => (cur != null && list.some((d) => d.id === cur) ? cur : list[0].id));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeDoc = useMemo(() => docs.find((d) => d.id === activeId) || null, [docs, activeId]);
  const activeRef = activeDoc ? activeDoc.moduleNumber || activeDoc.title : '';

  /* Validation + compliance are per-document — clear stale results when the
     active document changes so another document's report is never shown. */
  useEffect(() => {
    setValidation(null);
    setCompliance(null);
    setValidationUnavailable(false);
    setComplianceUnavailable(false);
  }, [activeId]);

  /* eCTD backbone: real documents bucketed into ICH M4 modules, M1..M5 first
     then any unassigned. */
  const treeModules = useMemo(() => {
    const byMod = new Map<string, CoauthorDoc[]>();
    for (const d of docs) {
      const m = moduleOf(d);
      if (!byMod.has(m)) byMod.set(m, []);
      byMod.get(m)!.push(d);
    }
    const keys = [
      ...MODULE_ORDER.filter((k) => byMod.has(k)),
      ...Array.from(byMod.keys()).filter((k) => !MODULE_ORDER.includes(k)),
    ];
    return keys.map((k) => ({
      m: k,
      title: ECTD_MODULE_LABELS[k] || 'Unassigned',
      docs: byMod.get(k)!,
    }));
  }, [docs]);

  /* KPIs derived from the REAL rows only (never hardcoded). Readiness weights
     approved/finalized fully and review/in-progress at half. */
  const total = docs.length;
  const approvedCount = docs.filter((d) => statusToken(d.status) === 'approved').length;
  const reviewCount = docs.filter((d) => statusToken(d.status) === 'review').length;
  const readiness = total ? Math.round(((approvedCount + reviewCount * 0.5) / total) * 100) : 0;

  const toggleModule = (m: string) => setOpenModules((prev) => ({ ...prev, [m]: !prev[m] }));

  const runValidate = () => {
    if (!activeDoc) return;
    setBusy('validate');
    setTab('validation');
    runValidateAction(activeDoc.id).then((v) => {
      setValidation(v);
      setValidationUnavailable(v === null);
      setBusy('');
    });
  };
  const runCompliance = () => {
    if (!activeDoc) return;
    setBusy('compliance');
    setTab('compliance');
    runComplianceAction(activeDoc.id).then((c) => {
      setCompliance(c);
      setComplianceUnavailable(c === null);
      setBusy('');
    });
  };

  const send = () => {
    const q = draft.trim();
    if (!q) return;
    // Hand the question to the real AnA surface rather than answering it here.
    // This pane shows the user's turn, then routes to AnA where the answer is
    // generated and traced — it never manufactures an assistant reply or a
    // completed tool chip. (Until this pane consumes /api/ana-ri/stream inline,
    // routing to AnA is the only honest behaviour.)
    setThread((t) => [...t, { role: 'user', text: q }]);
    setDraft('');
    ask?.(q + (activeRef ? ' (eCTD §' + activeRef + ')' : ''));
    setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 60);
  };

  const artTitle = activeDoc ? activeDoc.title : 'eCTD Co-Author';
  const artMeta = activeDoc
    ? '§' + (activeDoc.moduleNumber || '—') + ' -- ' + (activeDoc.moduleName || ECTD_MODULE_LABELS[moduleOf(activeDoc)] || 'eCTD document')
    : 'No document selected';

  return (
    <div className="ec-shell" data-tree-collapsed={treeCollapsed} data-focus={focus}>
      {/* Top bar */}
      <div className="ec-topbar">
        <button className="ec-topbtn" onClick={() => setTreeCollapsed((v) => !v)} title="Toggle eCTD tree">{I.sidebar || I.menu || I.layers}</button>
        <div className="ec-crumbs">
          {activeDoc ? (
            <>
              <b>{activeDoc.moduleName || ('Module ' + moduleOf(activeDoc))}</b>
              <span className="sep">/</span>{activeDoc.status}
              <span className="sep">/</span><b>&sect;{activeDoc.moduleNumber || '—'} {activeDoc.title}</b>
            </>
          ) : (
            <b>eCTD Co-Author</b>
          )}
        </div>
        <div className="ec-spacer"></div>
        {activeDoc && <span className="ec-autosave">{I.check} {activeDoc.status}</span>}
        <button className="ec-topbtn" onClick={() => setFocus((v) => !v)} title="Focus mode">{focus ? (I.minimize || I.x) : (I.maximize || I.expand || I.layers)}</button>
        <button className="ec-topbtn primary" onClick={runValidate} disabled={!activeDoc}>{I.shieldCheck || I.shield} Validate</button>
      </div>

      {/* eCTD tree */}
      <aside className="ec-tree">
        <div className="ec-tree-head"><b>eCTD backbone</b><span className="mono">M1--5</span></div>
        <div className="ec-tree-search">{I.search}<input placeholder="Find section..." onChange={() => { /* noop */ }} /></div>
        {loading ? (
          <div className="ec-empty">Loading eCTD documents…</div>
        ) : error ? (
          <div className="ec-empty sp-tone-warn">Couldn't load eCTD documents.</div>
        ) : docs.length === 0 ? (
          <div className="ec-empty">No eCTD documents yet.</div>
        ) : (
          treeModules.map((mod) => (
            <div key={mod.m} className="ec-tree-mod">
              <button className="ec-tree-row" onClick={() => toggleModule(mod.m)}>
                <span className="ec-caret" data-open={!!openModules[mod.m]}>{I.chevronRight || '›'}</span>
                <span className="ec-tnum">M{mod.m}</span>
                <span className="ec-tlabel">{mod.title}</span>
              </button>
              {openModules[mod.m] && (
                <div className="ec-tree-children">
                  {mod.docs.map((d) => (
                    <button key={d.id} className="ec-tree-row" data-active={activeId === d.id} onClick={() => { setActiveId(d.id); setTab('document'); }}>
                      <span className="ec-tnum">{d.moduleNumber || '—'}</span>
                      <span className="ec-tlabel">{d.title}</span>
                      <span className="ec-tstatus" data-s={statusToken(d.status)} title={d.status}></span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        <div className="ec-tree-foot">
          <div className="ec-tree-foot-row"><span>Documents</span><b>{total}</b></div>
          <div className="ec-tree-foot-row"><span>Approved</span><b>{approvedCount}</b></div>
          <div className="ec-tree-foot-row"><span>eCTD readiness</span><b>{readiness}%</b></div>
        </div>
      </aside>

      {/* Intelligence (AnA) */}
      <section className="ec-intel">
        <div className="ec-intel-head"><b>AnA</b><span className="hint">co-authoring &sect;{activeRef || '—'} -- {live ? 'live' : 'bound to dossier'}</span></div>
        <div className="ec-intel-scroll" ref={scrollRef}>
          <div className="ec-thread">
            {thread.length === 0 && (
              <div className="ec-empty">Ask a question about {activeRef ? '§' + activeRef : 'this dossier'} and it opens in AnA, where the answer is generated and traced. This pane does not draft on its own.</div>
            )}
            {thread.map((m, i) => m.role === 'user'
              ? <div key={i} className="ec-msg-user">{m.text}</div>
              : <div key={i} className="ec-msg-ai"><span className="ec-avatar">AnA</span><div className="ec-body"><p>{m.text}</p></div></div>
            )}
          </div>
        </div>
        <div className="ec-intel-foot">
          <div className="ec-composer">
            <textarea rows={1} placeholder={'Ask AnA to draft, tighten, or cite ' + (activeRef ? '§' + activeRef : 'a section') + '...'} value={draft}
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
          <span className="ec-art-title">{artTitle}</span>
          <span className="ec-art-meta">{artMeta}</span>
          <span className="ec-spacer"></span>
          <div className="ec-art-tabs">
            {(['document', 'validation', 'compliance'] as const).map((k) => (
              <button key={k} className="ec-art-tab" data-active={tab === k} onClick={() => { setTab(k); if (activeDoc) { if (k === 'compliance' && !compliance) runCompliance(); if (k === 'validation' && !validation) runValidate(); } }}>{k.charAt(0).toUpperCase() + k.slice(1)}</button>
            ))}
          </div>
        </div>

        {tab === 'document' && (
          <div className="ec-art-doc">
            <div className="ec-doc-inner">
              {loading ? (
                <div className="ec-empty">Loading eCTD documents…</div>
              ) : error ? (
                <EmptyState
                  tone="error"
                  icon={I.alertTriangle}
                  title="Couldn't load eCTD documents"
                  hint="These are your organization's co-author documents — sign in and retry, or check the service is reachable."
                />
              ) : !activeDoc ? (
                <EmptyState
                  icon={I.fileText || I.file}
                  title="No eCTD documents yet"
                  hint={
                    <>
                      Create a co-author document to draft it against the eCTD backbone — persisted via{' '}
                      <span className="mono">POST /api/coauthor/documents</span> — or ask AnA to start one.
                    </>
                  }
                />
              ) : (
                <>
                  <AnswerLead
                    tone="calm"
                    eyebrow={'What §' + (activeDoc.moduleNumber || '—') + ' needs before it can promote'}
                    headline={<><b>&sect;{activeDoc.moduleNumber || '—'} {activeDoc.title}</b> is <b>{activeDoc.status}</b>. The dossier is <b>{readiness}%</b> eCTD-ready across {total} document{total === 1 ? '' : 's'}.</>}
                    body={<>Run eCTD structural validation and ICH M4 compliance against the live backbone as you write — both are computed on the server from this document and its sections.</>}
                    reassure="I keep each check traced to the persisted document and re-run eCTD structure and ICH M4 as it changes."
                    action={{ label: 'Run eCTD validation', onClick: runValidate }}
                    secondary="Or keep drafting -- the artifact reflects the saved document."
                  />
                  <h1 className="ec-doc-h1">{activeDoc.title}</h1>
                  <div className="ec-doc-num">&sect;{activeDoc.moduleNumber || '—'}{activeDoc.moduleName ? ' -- ' + activeDoc.moduleName : ''}</div>
                  {activeDoc.content && activeDoc.content.trim() ? (
                    <div className="ec-doc-body" dangerouslySetInnerHTML={{ __html: sanitizeChatHtml(activeDoc.content) }} />
                  ) : (
                    <EmptyState
                      icon={I.fileText || I.file}
                      title="This document has no content yet"
                      hint={<>Draft §{activeDoc.moduleNumber || 'this section'} in the authoring editor, or ask AnA to start it. The body renders the saved document content.</>}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'validation' && (
          <div className="ec-art-panel">
            <div className="ec-doc-inner">
              <div className="ec-panel-head">
                <div><div className="ec-panel-t">eCTD structural validation</div><div className="ec-panel-s">POST /api/coauthor/documents/{activeDoc ? activeDoc.id : '…'}/validate -- ICH M4 eCTD rules {live ? '-- live' : ''}</div></div>
                <button className="ec-topbtn primary" onClick={runValidate} disabled={!activeDoc}>{busy === 'validate' ? 'Validating...' : <>{I.refresh || I.check} Re-validate</>}</button>
              </div>
              {!activeDoc ? (
                <div className="ec-empty">Select an eCTD document to validate its structure against the backbone.</div>
              ) : (
                <>
                  {!validation && !validationUnavailable && busy !== 'validate' && <div className="ec-empty">Run validation to check module structure, cross-references and section status against the eCTD backbone.</div>}
                  {validationUnavailable && busy !== 'validate' && (
                    <div className="ec-empty sp-tone-warn">
                      The validation service did not return a result. No findings are shown because none were produced — this is not a clean result.
                    </div>
                  )}
                  {busy === 'validate' && <div className="ec-empty">Validating {activeDoc.title} against ICH M4 structure...</div>}
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
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'compliance' && (
          <div className="ec-art-panel">
            <div className="ec-doc-inner">
              <div className="ec-panel-head">
                <div><div className="ec-panel-t">ICH M4 compliance</div><div className="ec-panel-s">GET /api/coauthor/documents/{activeDoc ? activeDoc.id : '…'}/compliance {live ? '-- live' : ''}</div></div>
                <button className="ec-topbtn primary" onClick={runCompliance} disabled={!activeDoc}>{busy === 'compliance' ? 'Checking...' : <>{I.refresh || I.check} Re-check</>}</button>
              </div>
              {!activeDoc ? (
                <div className="ec-empty">Select an eCTD document to check its ICH M4 compliance.</div>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
