import React, { useState, useEffect, useRef } from 'react';
import { I } from '../icons';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { renderSafeMarkdown } from '../../components/ana/renderSafeMarkdown';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { EmptyState, useLiveData, useLiveRows } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { saveToAuthoring } from '../authoringHandoff';
import {
  specRowsFromApi,
  specCreateBody,
  specUpdateBody,
  asProjectUuid,
  type CmcSpecRow,
  type QualitySpecApiRow,
} from './cmcSpec';
import {
  batchRowsFromApi,
  batchCreateBody,
  batchReleaseBody,
  type CmcBatch,
  type BatchApiRow,
} from './cmcBatch';
import { useAuth } from '@/services/portal/authService';
import '../styles/project-home-v2.css';

/* ═══════════════════════════════════════════════════════════════════
   CMC -- Module 3 operating system.

   Real-data standard: a surface renders REAL persisted data, an honest
   EMPTY state, or an honest ERROR state — never an in-file fixture
   presented as content.

   Overview is anchored to the LIVE board (GET /api/cmc/module3-board):
   portfolio ← reg_submissions + the real RPI engine, and the governed
   §3.2 section list ← cmc_module3_sections (per project). The other
   sub-tabs (Specifications / Stability / Batch / Blueprint / Global /
   Program records) have NO faithful org-scoped source in this schema —
   the board returns those slices as explicit null — so their former
   fixtures are replaced with honest empty states rather than fabricated
   content. Canonical config (ICH Q-series / CTD 3.2.S / 3.2.P catalogs,
   market lists) and deterministic generators (the change simulator,
   markdown renderer) are kept.

   Overrides the thin SURFACE_VIEWS['cmc'] with this full module.
   ═══════════════════════════════════════════════════════════════════ */

/* ── Types ── */

interface CmcNavItem { id: string; label: string; icon: string; }
interface CmcPortfolio { sub: string; product: string; region: string; type: string; rpi: number | null; ir: number | null; }
interface CmcSection { key: string; path: string; st: string; _new?: boolean; }
interface CmcChangeType { id: string; label: string; risk: string; }
interface CmcChangeResult { type: CmcChangeType; markets: string[]; desc: string; paths: { m: string; label: string; path: string[] }[]; }

/* ── Live board types (GET /api/cmc/module3-board -> { success, data }) ──
   useLiveData unwraps the { success, data } envelope, so the hook payload is
   the display object directly (portfolio / sections / kpis / meta). rpi / ir /
   rpiAverage / section counts are number | null — honestly null when the
   backend cannot measure them; rendered as "—", never fabricated. */
interface CmcBoardKpis { submissions: number; rpiAverage: number | null; irOverdue: number; sectionsApproved: number | null; sectionsTotal: number | null; readyPercent: number | null; }
interface CmcBoardMeta { projectId: string | null; portfolioProvisioned: boolean; sectionsProvisioned: boolean | null; generatedAt: string; }
interface CmcBoardData { portfolio?: CmcPortfolio[]; sections?: CmcSection[] | null; kpis?: CmcBoardKpis; meta?: CmcBoardMeta; }

/* ── Navigation + AnA prompt starters (UI config / affordances — not data) ── */

const CMC_NAV: CmcNavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'beaker' },
  { id: 'specs', label: 'Specifications', icon: 'clipboardList' },
  { id: 'stability', label: 'Stability', icon: 'barChart' },
  { id: 'batch', label: 'Batch records', icon: 'grid' },
  { id: 'change', label: 'Change simulator', icon: 'gitBranch' },
  { id: 'blueprint', label: 'Blueprint', icon: 'template' },
  { id: 'global', label: 'Global', icon: 'globe' },
  { id: 'pathway', label: 'Program records', icon: 'scroll' },
  { id: 'copilot', label: 'Copilot', icon: 'sparkles' },
];

const CMC_SUGGEST: Record<string, string[]> = {
  overview: ['Run the ICH compliance check and show every gap', 'Generate the drug-substance control strategy', 'What is blocking my shelf-life claim?'],
  specs: ['Justify the release and shelf-life limits for aggregation', 'Flag any specification without a validated method', 'Compare release vs shelf-life limits across DS and DP'],
  stability: ['Project shelf life from the long-term data with an ICH Q1E fit', 'Show every study trending toward a limit', 'Draft the stability summary for §3.2.S.7'],
  batch: ['Summarize deviations across the last 10 batches', 'Show batches still pending release', 'Trend yield across drug-product batches'],
  copilot: ['Explain ICH Q6B expectations for charge-variant specs', 'Draft a method-validation justification for sub-visible particles', 'What evidence supports a 24-month shelf-life claim?'],
};

/* ── Change-simulator canonical config (real regulatory reference — KEEP) ── */

const CMC_CHANGE_TYPES: CmcChangeType[] = [
  { id: 'api_supplier_change', label: 'API supplier change', risk: 'high' },
  { id: 'process_scale_up', label: 'Process scale-up', risk: 'med' },
  { id: 'excipient_replacement', label: 'Excipient replacement', risk: 'high' },
  { id: 'analytical_method_change', label: 'Analytical method change', risk: 'med' },
  { id: 'facility_change', label: 'Facility change', risk: 'high' },
  { id: 'equipment_change', label: 'Equipment change', risk: 'low' },
  { id: 'process_parameter_change', label: 'Process parameter change', risk: 'med' },
  { id: 'specification_change', label: 'Specification change', risk: 'med' },
  { id: 'packaging_change', label: 'Packaging change', risk: 'low' },
];

const CMC_MARKETS: [string, string][] = [['fda', 'FDA'], ['ema', 'EMA'], ['pmda', 'PMDA'], ['nmpa', 'NMPA'], ['health_canada', 'Health Canada'], ['uk_mhra', 'UK MHRA']];

/* ── Inline helpers ── */

function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState('');
  const fire = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2400); };
  return [msg, fire];
}
function C2CToast({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="de-toast"><span className="ico">{I.checkCircle}</span>{msg}</div>;
}

/* Markdown rendering is `renderSafeMarkdown` (marked + DOMPurify), the
   codebase's one audited markdown-to-HTML path -- see
   components/ana/renderSafeMarkdown.ts.

   This file used to carry its own 13-line `mdToHtml`: a regex approximation of
   markdown whose first act was a hand-rolled `&`/`<`/`>` escape. Two other
   surfaces carried the same function, two of the three byte-identical. Three
   copies of an escaper feeding three `dangerouslySetInnerHTML` sinks is three
   places to get HTML escaping right and three places for one to drift, in a
   product where the text being rendered is a document the user wrote or
   uploaded.

   The replacement is not merely deduplication. `renderSafeMarkdown` runs a real
   markdown parser and then reduces the result to an explicit tag/attribute
   allowlist, so `<script>`, inline event handlers and `javascript:` URLs are
   removed rather than depended upon never to arrive -- and it is already
   covered by its own tests, which the hand-rolled copies never were. */

/* ── Governed §11.50 e-sign form config ──
   MOCK ACTION (flag): submitting this form captures a signature UI but does NOT
   persist a 21 CFR §11 electronic signature server-side — no approval endpoint is
   wired from this surface yet. The governed copy is softened to say so honestly. */
function signForm(target: string): C2CFormConfig {
  return {
    eyebrow: '21 CFR §11.50 -- e-signature', title: 'Sign to approve', sub: target, submitLabel: 'Sign & approve',
    governed: 'Draft approval only — this is not yet persisted as a 21 CFR §11 electronic signature or audit entry.',
    fields: [
      { key: 'meaning', label: 'Meaning of signature', type: 'select', options: ['Approval', 'Author', 'Reviewer', 'Responsibility'], default: 'Approval', required: true },
      { key: 'reason', label: 'Reason', type: 'textarea', placeholder: 'Reason for this approval...', required: true },
      { key: 'password', label: 'Password', type: 'password', placeholder: 'Re-enter your password', required: true, half: true },
      { key: 'totp', label: 'Authenticator', type: 'text', placeholder: '6-digit code', half: true },
    ],
  };
}

/* ── Cross-surface navigation helpers ── */
function cmcNav(onNav: ((id: string) => void) | undefined, id: string) { onNav && onNav(id); }
function cmcCtx(label: string) { try { if ((window as any).C2C) (window as any).C2C.setContext({ entityType: 'cmc', entityId: label, entityLabel: label }); } catch (_e) { /* noop */ } }
function cmcTask(label: string) { cmcCtx(label); try { if ((window as any).C2C) (window as any).C2C.open('task'); } catch (_e) { /* noop */ } }
function cmcCollab(label: string) { cmcCtx(label); try { if ((window as any).C2C) (window as any).C2C.open('collab'); } catch (_e) { /* noop */ } }

/* ── Shared subcomponents ── */

function CmConnectBar({ nav }: { nav?: (id: string) => void }) {
  return (
    <div className="cm-connect">
      <span className="cm-connect-l">This work flows into</span>
      <button onClick={() => cmcNav(nav, 'dossier')}>{I.folder} Module 3 dossier</button>
      <button onClick={() => cmcNav(nav, 'document-authoring')}>{I.penLine} Document editor</button>
      <button onClick={() => cmcNav(nav, 'vault')}>{I.vault} Vault</button>
      <button onClick={() => cmcNav(nav, 'projects')}>{I.folder} Project</button>
      <button onClick={() => cmcTask('CMC -- Module 3')}>{I.checkSquare} Tasking</button>
      <button onClick={() => cmcCollab('CMC -- Module 3')}>{I.messageSquare} Collaborate</button>
    </div>
  );
}

function CmPush({ label, nav, bar }: { label: string; nav?: (id: string) => void; bar?: boolean }) {
  return (
    <span className={bar ? 'cm-push cm-pushbar' : 'cm-push'}>
      <span className="lbl">Push to</span>
      <button onClick={() => { cmcCtx(label); cmcNav(nav, 'dossier'); }} title="Push into Module 3 documentation">{I.gitBranch} Module 3 doc</button>
      <button onClick={() => { cmcCtx(label); cmcNav(nav, 'vault'); }} title="Save to Vault">{I.vault} Vault</button>
      <button onClick={() => cmcTask(label)} title="Create a task">{I.checkSquare} Task</button>
      <button onClick={() => cmcCollab(label)} title="Collaborate">{I.messageSquare} Discuss</button>
    </span>
  );
}

interface CmHeadProps {
  title: string;
  meta: string;
  ask?: (text: string) => void;
  suggest?: string[];
  actions?: React.ReactNode;
}
function CmHead({ title, meta, ask, suggest, actions }: CmHeadProps) {
  return (
    <>
      <div className="cm-head">
        <div><div className="cm-kicker">CMC -- Module 3 operating system</div><h1 className="cm-title">{title}</h1><div className="cm-meta">{meta}</div></div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}{ask && <button className="reg-cta" onClick={() => ask((suggest && suggest[0]) || 'Help me with Module 3')}>{I.sparkles} Ask AnA</button>}</div>
      </div>
      {suggest && <div className="sp-starters" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>{suggest.map((s, i) => (<button key={i} className="sp-starter" onClick={() => ask && ask(s)}><span className="sk">{I.sparkles}</span><span>{s}</span></button>))}</div>}
    </>
  );
}

function Kpi({ l, v, s, tone }: { l: string; v: React.ReactNode; s?: string; tone?: string }) {
  return <div className="reg-kpi" data-tone={tone}><div className="reg-kpi-v">{v}</div><div className="reg-kpi-l">{l}{s ? ' -- ' + s : ''}</div></div>;
}

/* ═══════════ Overview -- LIVE portfolio + governed section approvals ═══════════ */

function CmOverview({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  /* Live board -- GET /api/cmc/module3-board[?projectId]. useLiveData unwraps the
     { success, data } envelope, so `board.data` is the display payload directly:
     real portfolio + KPIs, an honest empty, or an honest error — never a fixture.
     Portfolio is org-scoped; the governed section list is per-project, so it is
     null until a project is in context. */
  const ctxProjectId = ((): string | undefined => {
    try {
      const p = (window as any).C2C_PROJECT;
      const id = p && p.id != null ? String(p.id).trim() : '';
      return id || undefined;
    } catch (_e) { return undefined; }
  })();
  const boardPath = ctxProjectId
    ? '/api/cmc/module3-board?projectId=' + encodeURIComponent(ctxProjectId)
    : '/api/cmc/module3-board';
  const board = useLiveData<CmcBoardData>(boardPath);
  const data = board.data;

  const port: CmcPortfolio[] = data && Array.isArray(data.portfolio) ? data.portfolio : [];
  /* null = no project in context (sections are inherently per-project); [] = a
     project is in context but has no governed sections yet. */
  const liveSections: CmcSection[] | null = data && Array.isArray(data.sections) ? data.sections : null;
  const kpis = data?.kpis;

  /* Governed section-approval working set — seeded from the live governed store.
     useLiveData memoizes its result in state, so `liveSections` is a stable
     reference between renders (it changes only when the fetch re-resolves), so
     this re-seed effect does not loop. */
  const [secs, setSecs] = useState<CmcSection[]>([]);
  useEffect(() => {
    setSecs((liveSections ?? []).map((s) => ({ ...s })));
  }, [liveSections]);
  const [sign, setSign] = useState<CmcSection | null>(null);
  const [toast, fireToast] = useToast();

  /* rpi / ir are number | null -- honestly null when the backend cannot measure a
     submission. Prefer the backend KPIs (identical guarded computation server-side)
     and guard every reduce/sort so a null never NaNs a value; render "—" for null. */
  const rpiNums = port.map((r) => r.rpi).filter((v): v is number => typeof v === 'number');
  const computedAvgRpi = rpiNums.length ? Math.round(rpiNums.reduce((a, b) => a + b, 0) / rpiNums.length) : null;
  const avgRpi: number | null = kpis ? kpis.rpiAverage : computedAvgRpi;
  const irOverdue: number = kpis ? kpis.irOverdue : port.reduce((a, r) => a + (r.ir ?? 0), 0);

  const approved = secs.filter((s) => s.st === 'approved').length;
  const readyPct = secs.length ? Math.round(100 * approved / secs.length) : 0;
  const readyTone = readyPct >= 80 ? 'ok' : readyPct >= 50 ? 'warn' : 'err';
  const stTone = (s: string) => s === 'approved' ? 'ok' : s === 'review' ? 'warn' : 'dim';

  // doSign — REAL, awaited section approval against the governed Module 3
  // operating-system endpoint (POST /api/cmc/module3-os/sections/:projectId/
  // :sectionKey/approve, server/api/cmc/module3OperatingSystemRoutes.ts). The
  // backend blocks on unresolved critical contradictions (409), snapshots a new
  // approved version, sets approval_state, and writes a cmc_provenance_events
  // audit entry keyed to the authenticated user. The reason + reauth captured by
  // the sign form are forwarded (the endpoint records the reason; server-side
  // re-auth verification is the documented follow-up — see the wiring roadmap).
  // Only reflects approval on a real 2xx; nothing is fabricated on failure.
  const doSign = async (v: Record<string, string>) => {
    if (!sign) return;
    const target = sign;
    if (!ctxProjectId) {
      fireToast('Open a program first — section approval is recorded per project.');
      return;
    }
    try {
      const res = await apiRequest(
        'POST',
        '/api/cmc/module3-os/sections/' +
          encodeURIComponent(ctxProjectId) +
          '/' +
          encodeURIComponent(target.key) +
          '/approve',
        { reason: v.reason, reauth: { password: v.password, totp: v.totp || undefined } },
      );
      const json = await res.json().catch(() => null);
      if (res.status === 409) {
        fireToast('Cannot approve ' + target.key + ' — resolve the critical contradictions first.');
        return;
      }
      if (!res.ok) {
        fireToast('Couldn’t approve section ' + target.key + ' — ' + specErr(json, res.status) + '. Nothing was persisted.');
        return;
      }
      setSecs((ss) => ss.map((x) => (x.key === target.key ? { ...x, st: 'approved', _new: true } : x)));
      const ver = (json as { versionNumber?: number })?.versionNumber;
      const chain = (json as { governance?: { sha256Chain?: string } })?.governance?.sha256Chain;
      fireToast(
        'Section ' + target.key + ' approved and signed' +
          (ver ? ' · v' + ver : '') +
          (chain ? ' · ' + String(chain).slice(0, 12) + '…' : '') + '.',
      );
      setSign(null);
    } catch (e) {
      fireToast('Couldn’t approve section ' + target.key + ' — ' + (e instanceof Error ? e.message : String(e)) + '.');
    }
  };

  const rpiRankable = port.filter((p): p is CmcPortfolio & { rpi: number } => typeof p.rpi === 'number');
  const lowSub = rpiRankable.length ? [...rpiRankable].sort((a, b) => a.rpi - b.rpi)[0] : null;
  const inReview = secs.filter((s) => s.st === 'review');
  const drafts = secs.filter((s) => s.st === 'draft');
  const nextSec = inReview[0] || drafts[0];
  const irSubs = port.filter((p) => (p.ir ?? 0) > 0);
  const cmLead = (
    <AnswerLead
      tone={irOverdue ? 'urgent' : 'calm'}
      eyebrow={'Is your CMC package ready across all ' + port.length + ' submissions'}
      headline={avgRpi != null && lowSub
        ? <>Your Module 3 averages <b>RPI {avgRpi}</b> -- the <b>{lowSub.sub}</b> at {lowSub.rpi} is what's holding the portfolio back.</>
        : <>Your Module 3 spans <b>{port.length}</b> {port.length === 1 ? 'submission' : 'submissions'}{avgRpi != null ? <> at an <b>RPI {avgRpi}</b> average</> : <> -- preparedness is still computing across the portfolio</>}.</>}
      body={irOverdue
        ? <>You have <b>{irOverdue} information {irOverdue === 1 ? 'request' : 'requests'} overdue</b> ({irSubs.map((p) => p.sub).join(', ')}) -- agencies read a late IR response as a readiness signal. {nextSec ? <>And §{nextSec.key} ({nextSec.path}) is still in {nextSec.st}, one of {inReview.length + drafts.length} sections not yet approved.</> : null}</>
        : <>{approved} of {secs.length} sections are approved{nextSec ? <>. §{nextSec.key} ({nextSec.path}) is the next one to move -- clear it{lowSub ? <> and {lowSub.sub} climbs with it</> : null}</> : null}.</>}
      reassure={irOverdue ? "Answer the IRs first -- they're time-boxed. I'll draft the responses and route the sign-offs with you." : "You're building steadily. I'll help you move the next section to approved."}
      action={{ label: irOverdue ? 'Draft the overdue IR responses' : 'Advance the next section', onClick: () => ask(irOverdue ? ('Draft responses to the overdue CMC information requests for ' + irSubs.map((p) => p.sub).join(' and ')) : ('Prepare §' + (nextSec ? nextSec.key : '') + ' ' + (nextSec ? nextSec.path : '') + ' for approval')),
        alt: { label: 'Open change simulator', onClick: () => (window as any).__cmSetTab && (window as any).__cmSetTab('change') } }}
      secondary="Or work the portfolio and build state below."
    />
  );
  return (
    <div className="cm-body">
      <CmHead title="Module 3 overview" meta={`${port.length} submissions -- RPI ${avgRpi == null ? '—' : avgRpi} average`} ask={ask} suggest={CMC_SUGGEST.overview} />
      {board.loading ? (
        <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading the Module 3 board…</div>
      ) : board.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the Module 3 board"
          hint="The org-scoped CMC board didn't respond. It aggregates your regulatory submissions, preparedness index, and governed §3.2 sections — sign in and retry, or check the service is reachable."
        />
      ) : (
        <>
          {cmLead}
          <div className="cm-kpis">
            <Kpi l="Submissions" v={port.length} />
            <Kpi l="RPI average" v={avgRpi == null ? '—' : avgRpi} s="preparedness" />
            <Kpi l="IR overdue" v={irOverdue} tone={irOverdue ? 'warn' : undefined} />
            <Kpi l="Sections approved" v={approved + '/' + secs.length} tone={readyTone} />
          </div>
          <div className="pj-card" style={{ marginBottom: 16 }}>
            <div className="pj-card-h"><span className="t">Portfolio</span><span className="s">{port.length} submissions</span></div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {port.length === 0 ? (
                <div style={{ padding: 12 }}>
                  <EmptyState icon={I.fileText} title="No submissions yet" hint="Your regulatory submissions (BLA / MAA / NDA / J-NDA) appear here with their preparedness index and overdue information requests." />
                </div>
              ) : (
                <table className="reg-tbl"><thead><tr><th>Submission</th><th>Product</th><th>Region</th><th>Type</th><th>RPI</th><th>IR overdue</th></tr></thead>
                <tbody>{port.map((r, i) => (<tr key={i}><td style={{ fontWeight: 600 }}>{r.sub}</td><td>{r.product}</td><td>{r.region}</td><td><span className="reg-pill neutral">{r.type}</span></td><td>{r.rpi == null ? '—' : r.rpi}</td><td>{r.ir == null ? '—' : r.ir}</td></tr>))}</tbody></table>
              )}
            </div>
          </div>
          {secs.length > 0 && (
            <div className="pj-card" style={{ marginBottom: 16 }}>
              <div className="pj-card-h"><span className="t">Module 3 build state</span><span className="s">§3.2.S -- §3.2.P</span></div>
              <div className="pj-card-b">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div className="cm-projbar" style={{ flex: 1 }}><span className="fill" style={{ width: readyPct + '%', background: readyTone === 'ok' ? 'var(--success)' : readyTone === 'warn' ? 'var(--accent-100)' : 'var(--warning)' }} /></div>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>{readyPct}%</b>
                  <span className={'rd-chip tone-' + (readyPct >= 80 ? 'ok' : 'warn')}>{readyPct >= 80 ? 'Export ready' : 'Not export ready'}</span>
                </div>
                <div className="cm-meta">{approved} of {secs.length} sections approved -- {drafts.length} draft</div>
              </div>
            </div>
          )}
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Section approvals</span><span className="s">governed -- 21 CFR §11</span></div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {liveSections === null ? (
                <div style={{ padding: 12 }}>
                  <EmptyState icon={I.fileText} title="Open a project to see its Module 3 sections" hint="The governed §3.2.S / §3.2.P section list is per-project. Select a project to load its approval state." />
                </div>
              ) : secs.length === 0 ? (
                <div style={{ padding: 12 }}>
                  <EmptyState icon={I.fileText} title="No Module 3 sections yet" hint="This project has no governed §3.2 sections yet. They appear here with their approval state once created." />
                </div>
              ) : (
                <table className="reg-tbl"><thead><tr><th>Section</th><th>Path</th><th>State</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
                <tbody>{secs.map((s) => (
                  <tr key={s.key} className={s._new ? 'de-row-new' : undefined}><td className="mono" style={{ fontWeight: 600 }}>{s.key}</td><td>{s.path}</td>
                    <td><span className={'rd-chip tone-' + stTone(s.st)}>{s.st}</span></td>
                    <td style={{ textAlign: 'right' }}>{s.st === 'approved' ? <span className="cm-meta">{I.check} approved</span> : <button className="nda-open" onClick={() => setSign(s)}>{I.lock} Approve section</button>}</td>
                  </tr>))}</tbody></table>
              )}
            </div>
            {secs.length > 0 && <div className="pj-card-b" style={{ paddingTop: 0 }}><CmPush label={'Approved Module 3 sections'} nav={nav} bar /></div>}
          </div>
        </>
      )}
      {sign && <C2CForm config={signForm('Section ' + sign.key + ' -- ' + sign.path)} onCancel={() => setSign(null)} onSubmit={doSign} />}
      <C2CToast msg={toast} />
    </div>
  );
}

/* ═══════════ Specifications -- create / edit / approve ═══════════ */

/** Extract an honest error string from a failed CMC write response. */
function specErr(json: unknown, status: number): string {
  const j = json as { error?: string; message?: string; details?: Array<{ message?: string }> } | null;
  return j?.error || j?.details?.[0]?.message || j?.message || ('HTTP ' + status);
}

function CmSpecs({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  /* REAL slice: the specifications workbench is bound to the governed
     quality_specifications table (server/api/cmc/specificationRoutes.ts,
     mounted at /api/cmc/specifications). Reads GET /:projectId, creates via
     POST /, edits via the ungoverned PUT /:id, and approves ONLY through the
     governed POST /:id/approve endpoint (§11 re-authentication + hash-chained
     recordGovernedAction). The jsonb ↔ display-column shape gap is crossed by
     the reversible, unit-tested mapping in ./cmcSpec. Specifications are
     per-project, so the surface needs a project in context (window.C2C_PROJECT,
     the same source the board uses); without one it renders an honest prompt,
     never a fixture, and no write is fabricated on failure. */
  const projectId = asProjectUuid(
    (() => {
      try {
        const p = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
        return p && p.id != null ? String(p.id) : null;
      } catch {
        return null;
      }
    })(),
  );
  const live = useLiveRows<QualitySpecApiRow>(
    projectId ? '/api/cmc/specifications/' + encodeURIComponent(projectId) : null,
  );
  const mapped = React.useMemo<CmcSpecRow[]>(
    () => (live.loading || live.error ? [] : specRowsFromApi(live.rows)),
    [live.loading, live.error, live.rows],
  );
  const [rows, setRows] = useState<CmcSpecRow[]>([]);
  // Seed the optimistic store once the live specifications file resolves;
  // `mapped` is a stable reference while loading/errored, so this only fires on
  // a real resolution and never thrashes user-added optimistic rows.
  const seededRef = React.useRef<CmcSpecRow[] | null>(null);
  useEffect(() => {
    if (mapped !== seededRef.current) {
      seededRef.current = mapped;
      setRows(mapped);
    }
  }, [mapped]);
  const [edit, setEdit] = useState<CmcSpecRow | 'new' | null>(null);
  const [sign, setSign] = useState<CmcSpecRow | null>(null);
  const [toast, fireToast] = useToast();
  const stTone = (s: string) => s === 'approved' ? 'ok' : s === 'review' ? 'warn' : s === 'reject' ? 'err' : 'dim';
  const FORM = (row: CmcSpecRow | null): C2CFormConfig => ({
    eyebrow: 'CMC -- 3.2.S.4.1', title: row ? 'Edit specification' : 'New specification', sub: 'Release and shelf-life limits for a drug substance or drug product',
    submitLabel: row ? 'Save changes' : 'Create specification', fields: [
      { key: 'attr', label: 'Quality attribute', type: 'text', required: true, default: row ? row.attr : '', placeholder: 'e.g. Charge variants' },
      { key: 'material', label: 'Material', type: 'select', options: ['Drug substance', 'Drug product'], required: true, default: row ? row.material : 'Drug substance', half: true },
      { key: 'method', label: 'Analytical method', type: 'text', default: row ? row.method : '', placeholder: 'e.g. SE-HPLC', half: true },
      { key: 'release', label: 'Release limit', type: 'text', default: row ? row.release : '', placeholder: 'e.g. <= 2.0%', half: true },
      { key: 'shelf', label: 'Shelf-life limit', type: 'text', default: row ? row.shelf : '', placeholder: 'e.g. <= 3.0%', half: true },
      { key: 'ich', label: 'ICH reference', type: 'text', default: row ? row.ich : 'ICH Q6B', half: true },
      { key: 'st', label: 'Status', type: 'seg', options: ['draft', 'review'], default: row && row.st !== 'approved' ? row.st : 'draft', half: true },
      { key: 'justification', label: 'Justification', type: 'textarea', placeholder: 'Rationale for the limits and method' },
    ],
  });
  // save — REAL, awaited write. POST creates / PUT updates against the governed
  // specifications file and adopts the SERVER's row (real id + persisted values).
  // Nothing is added on failure; the success toast fires only after the write is
  // confirmed. approval_status is never sent here — approval is governed-only.
  const save = async (v: Record<string, string>) => {
    if ((!edit || edit === 'new') && !projectId) {
      fireToast('Open a program first — specifications are recorded per project.');
      return;
    }
    try {
      if (edit && edit !== 'new') {
        const id = edit.id;
        const res = await apiRequest('PUT', '/api/cmc/specifications/' + id, specUpdateBody(v));
        const json = await res.json().catch(() => null);
        if (!res.ok) { fireToast('Couldn’t save the specification — ' + specErr(json, res.status) + '. Nothing was persisted.'); return; }
        const adopted = specRowsFromApi([(json as { data?: QualitySpecApiRow })?.data].filter(Boolean) as QualitySpecApiRow[])[0];
        setRows((rs) => rs.map((x) => x.id === id ? { ...(adopted ?? x), _new: true } : x));
        fireToast('Specification saved · ' + (adopted?.attr ?? v.attr));
      } else {
        const res = await apiRequest('POST', '/api/cmc/specifications', specCreateBody(v, projectId));
        const json = await res.json().catch(() => null);
        if (!res.ok) { fireToast('Couldn’t create the specification — ' + specErr(json, res.status) + '. Nothing was saved.'); return; }
        const adopted = specRowsFromApi([(json as { data?: QualitySpecApiRow })?.data].filter(Boolean) as QualitySpecApiRow[])[0];
        if (!adopted) { fireToast('Saved, but the server returned an unexpected shape — reload to see it.'); return; }
        setRows((rs) => [{ ...adopted, _new: true }, ...rs.filter((r) => r.id !== adopted.id)]);
        fireToast('Specification created · ' + adopted.attr + ' · ' + adopted.st);
      }
      setEdit(null);
    } catch (e) {
      fireToast('Couldn’t save the specification — ' + (e instanceof Error ? e.message : String(e)) + '.');
    }
  };
  // doSign — REAL governed approval. POSTs to the ONLY approval path
  // (/:id/approve), which re-authenticates (password + TOTP) and records a
  // hash-chained governed action before flipping approval_status. Adopts the
  // server's approved row; a failed re-auth (401) is surfaced honestly and the
  // specification stays unapproved. No local "approved" flip is fabricated.
  const doSign = async (v: Record<string, string>) => {
    if (!sign) return;
    const target = sign;
    try {
      const res = await apiRequest('POST', '/api/cmc/specifications/' + target.id + '/approve', {
        reason: v.reason,
        reauth: { password: v.password, totp: v.totp || undefined },
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401) { fireToast('Approval not signed — re-authentication failed. The specification was not approved.'); return; }
      if (!res.ok) { fireToast('Couldn’t approve the specification — ' + specErr(json, res.status) + '. Nothing was persisted.'); return; }
      const adopted = specRowsFromApi([(json as { data?: QualitySpecApiRow })?.data].filter(Boolean) as QualitySpecApiRow[])[0];
      setRows((rs) => rs.map((x) => x.id === target.id ? { ...(adopted ?? { ...x, st: 'approved' }), _new: true } : x));
      const chain = (json as { governance?: { sha256Chain?: string } })?.governance?.sha256Chain;
      fireToast('Specification "' + target.attr + '" approved and signed' + (chain ? ' · ' + String(chain).slice(0, 12) + '…' : '') + '.');
      setSign(null);
    } catch (e) {
      fireToast('Couldn’t approve the specification — ' + (e instanceof Error ? e.message : String(e)) + '.');
    }
  };
  const noMethodCount = rows.filter((r) => r.noMethod).length;
  return (
    <div className="cm-body">
      <CmHead title="Specifications" meta="Release and shelf-life limits -- drug substance and drug product" ask={ask} suggest={CMC_SUGGEST.specs}
        actions={<button className="nda-open" onClick={() => setEdit('new')} disabled={!projectId} title={!projectId ? 'Open a program to record specifications' : ''}>{I.plus} New specification</button>} />
      {noMethodCount > 0 && <div className="pj-con" style={{ marginBottom: 14 }}><span className="ico">{I.alertTriangle}</span><div><div className="pj-con-t">{noMethodCount} specification without a validated method</div><div className="pj-con-d">A specification cannot be approved until its analytical method is validated (ICH Q2). Add the method, or ask AnA to draft the validation justification.</div></div></div>}
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Specification table</span><span className="s">{rows.length} attributes</span></div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div style={{ padding: 12 }}>
              {!projectId ? (
                <EmptyState icon={I.clipboardList} title="Open a program to manage its specifications" hint="Release and shelf-life limits are recorded per project in the governed specifications file (§3.2.S.4.1 / §3.2.P.5.1). Open a program, then create or review its specifications here." />
              ) : live.loading ? (
                <EmptyState icon={I.clipboardList} title="Loading specifications…" />
              ) : live.error ? (
                <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load specifications" hint="The governed specifications file (GET /api/cmc/specifications) didn’t respond. Sign in to your tenant and retry." />
              ) : (
                <EmptyState icon={I.clipboardList} title="No specifications yet" hint="Release and shelf-life limits for your drug substance and drug product appear here. Use New specification to record the first one — it is persisted to the governed specifications file." />
              )}
            </div>
          ) : (
            <table className="reg-tbl"><thead><tr><th>Attribute</th><th>Material</th><th>Method</th><th>Release</th><th>Shelf life</th><th>ICH</th><th>Status</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className={r._new ? 'de-row-new' : undefined}>
                <td style={{ fontWeight: 600 }}>{r.attr}</td><td>{r.material}</td>
                <td>{r.method || <span className="sp-tone-warn">no method</span>}</td>
                <td>{r.release || '--'}</td><td>{r.shelf || '--'}</td><td className="mono">{r.ich}</td>
                <td><span className={'rd-chip tone-' + stTone(r.st)}>{r.st}</span></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="nda-open" onClick={() => setEdit(r)}>{I.penLine} Edit</button>
                  {r.st !== 'approved' && <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => setSign(r)} disabled={r.noMethod} title={r.noMethod ? 'Validate the method before approval' : ''}>{I.lock} Approve</button>}
                </td>
              </tr>))}</tbody></table>
          )}
        </div>
        {rows.length > 0 && <div className="pj-card-b" style={{ paddingTop: 0 }}><CmPush label={'Approved specifications -> §3.2.S.4.1'} nav={nav} bar /></div>}
      </div>
      {edit && <C2CForm config={FORM(edit === 'new' ? null : edit)} onCancel={() => setEdit(null)} onSubmit={save} />}
      {sign && <C2CForm config={signForm(sign.attr + ' -- ' + sign.material)} onCancel={() => setSign(null)} onSubmit={doSign} />}
      <C2CToast msg={toast} />
    </div>
  );
}

/* ═══════════ Stability -- shelf-life projection ═══════════ */

function CmStability({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  /* DATA: fixture removed (was CMC_STAB_SEED, a fabricated aggregate time-series).
     No faithful org-scoped stability series is available: GET /api/cmc/module3-board
     returns stability:null, and GET /api/cmc/stability-studies returns study
     metadata (title / product / storage conditions / duration / status), NOT a
     measurement time-series with limits — so the ICH Q1E projection cannot be
     sourced without fabricating the points. The deterministic linear-fit projection
     and chart were removed with the fixture; honest empty until a stability-series
     backend is connected. */
  return (
    <div className="cm-body">
      <CmHead title="Stability program" meta="ICH Q1A(R2) / Q1E -- shelf-life projection from long-term data" ask={ask} suggest={CMC_SUGGEST.stability} />
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Stability & shelf-life projection</span><span className="s">ICH Q1E</span></div>
        <div className="pj-card-b">
          <EmptyState icon={I.barChart} title="No stability data yet" hint="Long-term stability results and the ICH Q1E shelf-life projection appear here once a stability-series data source is connected for your organization." />
        </div>
        <div className="pj-card-b" style={{ paddingTop: 0 }}><CmPush label={'§3.2.S.7 stability summary'} nav={nav} bar /></div>
      </div>
    </div>
  );
}

/* ═══════════ Batch records -- release eligibility ═══════════ */

function CmBatch({ ask }: { ask: (text: string) => void }) {
  /* REAL slice: bound to the governed cmc_batch_records table
     (server/api/cmc/batchRecordRoutes.ts, mounted at /api/cmc/batch-records).
     Reads GET /:projectId, logs a batch via POST /, and releases ONLY through
     the governed POST /:id/release endpoint (§11 re-authentication + hash-chained
     recordGovernedAction, carrying a disposition decision). The jsonb yield/
     deviation columns are crossed by the reversible, unit-tested mapping in
     ./cmcBatch. Batches are per-project; without a project in context the
     surface renders an honest prompt, never a fixture, and no write is
     fabricated on failure. */
  const projectId = asProjectUuid(
    (() => {
      try {
        const p = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
        return p && p.id != null ? String(p.id) : null;
      } catch {
        return null;
      }
    })(),
  );
  const live = useLiveRows<BatchApiRow>(
    projectId ? '/api/cmc/batch-records/' + encodeURIComponent(projectId) : null,
  );
  const mapped = React.useMemo<CmcBatch[]>(
    () => (live.loading || live.error ? [] : batchRowsFromApi(live.rows)),
    [live.loading, live.error, live.rows],
  );
  const [rows, setRows] = useState<CmcBatch[]>([]);
  const seededRef = React.useRef<CmcBatch[] | null>(null);
  useEffect(() => {
    if (mapped !== seededRef.current) {
      seededRef.current = mapped;
      setRows(mapped);
    }
  }, [mapped]);
  const [form, setForm] = useState(false);
  const [releasing, setReleasing] = useState<CmcBatch | null>(null);
  const [toast, fireToast] = useToast();
  const { user } = useAuth();
  const releasedByName = user?.displayName || user?.email || 'current user';
  const eligible = (r: CmcBatch) => r.dev === 0 && r.yield >= 90;
  const pending = rows.filter((r) => r.st === 'pending').length;
  const devs = rows.reduce((a, r) => a + r.dev, 0);
  const avgY = rows.length ? Math.round(rows.reduce((a, r) => a + r.yield, 0) / rows.length) : 0;
  // add — REAL, awaited create against the governed batch file; adopts the
  // SERVER's row (real db id + persisted values). Nothing is added on failure.
  const add = async (v: Record<string, string>) => {
    if (!projectId) { fireToast('Open a program first — batch records are logged per project.'); return; }
    try {
      const res = await apiRequest('POST', '/api/cmc/batch-records', batchCreateBody(v, projectId));
      const json = await res.json().catch(() => null);
      if (!res.ok) { fireToast('Couldn’t log the batch — ' + specErr(json, res.status) + '. Nothing was saved.'); return; }
      const adopted = batchRowsFromApi([(json as { data?: BatchApiRow })?.data].filter(Boolean) as BatchApiRow[])[0];
      if (!adopted) { fireToast('Saved, but the server returned an unexpected shape — reload to see it.'); return; }
      setRows((rs) => [{ ...adopted, _new: true }, ...rs.filter((r) => r.dbId !== adopted.dbId)]);
      setForm(false);
      fireToast('Batch ' + adopted.id + ' logged · ' + adopted.st);
    } catch (e) {
      fireToast('Couldn’t log the batch — ' + (e instanceof Error ? e.message : String(e)) + '.');
    }
  };
  // doRelease — REAL governed release. POSTs to the ONLY release path
  // (/:id/release): re-authenticates (password + TOTP) and records a
  // hash-chained governed action with the disposition decision before setting
  // the batch status. Adopts the server's row; a failed re-auth (401) is
  // surfaced honestly and the batch stays unreleased.
  const doRelease = async (v: Record<string, string>) => {
    if (!releasing) return;
    const target = releasing;
    if (target.dbId == null) { fireToast('This batch isn’t in the governed file yet — reload before releasing it.'); return; }
    try {
      const res = await apiRequest('POST', '/api/cmc/batch-records/' + target.dbId + '/release', batchReleaseBody(v, releasedByName));
      const json = await res.json().catch(() => null);
      if (res.status === 401) { fireToast('Release not signed — re-authentication failed. The batch was not released.'); return; }
      if (!res.ok) { fireToast('Couldn’t release the batch — ' + specErr(json, res.status) + '. Nothing was persisted.'); return; }
      const adopted = batchRowsFromApi([(json as { data?: BatchApiRow })?.data].filter(Boolean) as BatchApiRow[])[0];
      setRows((rs) => rs.map((x) => x.dbId === target.dbId ? { ...(adopted ?? { ...x, st: 'released' }), _new: true } : x));
      const chain = (json as { governance?: { sha256Chain?: string } })?.governance?.sha256Chain;
      fireToast('Batch ' + target.id + ' ' + (adopted?.st ?? 'released') + (chain ? ' · signed ' + String(chain).slice(0, 12) + '…' : '') + '.');
      setReleasing(null);
    } catch (e) {
      fireToast('Couldn’t release the batch — ' + (e instanceof Error ? e.message : String(e)) + '.');
    }
  };
  return (
    <div className="cm-body">
      <CmHead title="Batch records" meta="Manufacture, yield, deviations and disposition" ask={ask} suggest={CMC_SUGGEST.batch}
        actions={<button className="nda-open" onClick={() => setForm(true)} disabled={!projectId} title={!projectId ? 'Open a program to log batch records' : ''}>{I.plus} Log batch</button>} />
      <div className="cm-kpis">
        <Kpi l="Batches" v={rows.length} />
        <Kpi l="Pending release" v={pending} tone={pending ? 'warn' : 'ok'} />
        <Kpi l="Open deviations" v={devs} tone={devs ? 'warn' : 'ok'} />
        <Kpi l="Avg yield" v={avgY + '%'} />
      </div>
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Batch disposition</span><span className="s">release when deviations = 0 and yield {'>='}  90%</span></div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div style={{ padding: 12 }}>
              {!projectId ? (
                <EmptyState icon={I.grid} title="Open a program to manage its batch records" hint="Manufactured batches with their yield, deviations, and disposition are recorded per project in the governed batch file. Open a program, then log or release its batches here." />
              ) : live.loading ? (
                <EmptyState icon={I.grid} title="Loading batch records…" />
              ) : live.error ? (
                <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load batch records" hint="The governed batch file (GET /api/cmc/batch-records) didn’t respond. Sign in to your tenant and retry." />
              ) : (
                <EmptyState icon={I.grid} title="No batch records yet" hint="Manufactured batches with their yield, deviations, and disposition appear here. Use Log batch to record the first one — it is persisted to the governed batch file." />
              )}
            </div>
          ) : (
            <table className="reg-tbl"><thead><tr><th>Batch</th><th>Stage</th><th>Yield</th><th>Deviations</th><th>Eligible</th><th>Status</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.dbId ?? r.id} className={r._new ? 'de-row-new' : undefined}>
                <td className="mono" style={{ fontWeight: 600 }}>{r.id}</td><td>{r.stage}</td>
                <td className={r.yield < 90 ? 'sp-tone-warn' : ''}>{r.yield}%</td>
                <td className={r.dev ? 'sp-tone-warn' : ''}>{r.dev}</td>
                <td>{eligible(r) ? <span className="rd-chip tone-ok">yes</span> : <span className="rd-chip tone-warn">no</span>}</td>
                <td><span className={'rd-chip tone-' + (r.st === 'released' ? 'ok' : r.st === 'rejected' ? 'err' : 'warn')}>{r.st}</span></td>
                <td style={{ textAlign: 'right' }}>{r.st === 'pending' && <button className="nda-open" onClick={() => setReleasing(r)} disabled={!eligible(r)} title={!eligible(r) ? 'Resolve deviations / low yield first' : ''}>{I.check} Release</button>}</td>
              </tr>))}</tbody></table>
          )}
        </div>
      </div>
      {form && <C2CForm config={{ eyebrow: 'Batch -- new', title: 'Log a batch record', sub: 'Recorded to the governed batch file for this program', submitLabel: 'Log batch', fields: [
        { key: 'id', label: 'Batch number', type: 'text', placeholder: 'e.g. BX204-DP-2407', required: true },
        { key: 'stage', label: 'Stage', type: 'select', options: ['Drug substance', 'Drug product'], required: true, half: true },
        { key: 'yield', label: 'Yield (%)', type: 'number', min: 0, max: 100, required: true, half: true },
        { key: 'dev', label: 'Open deviations', type: 'number', min: 0, default: '0' },
      ] }} onCancel={() => setForm(false)} onSubmit={add} />}
      {releasing && <C2CForm config={{ eyebrow: 'Batch disposition -- §11 e-signature', title: 'Release batch ' + releasing.id, sub: 'Signed disposition recorded to the hash-chained audit trail. Released by ' + releasedByName + '.', submitLabel: 'Sign & release', fields: [
        { key: 'decision', label: 'Disposition', type: 'seg', options: ['approved', 'conditional', 'rejected'], default: 'approved', half: true },
        { key: 'reason', label: 'Reason', type: 'textarea', placeholder: 'Disposition rationale (recorded with the signature)…', required: true },
        { key: 'password', label: 'Password', type: 'password', placeholder: 'Re-enter your password', required: true, half: true },
        { key: 'totp', label: 'Authenticator', type: 'text', placeholder: '6-digit code', half: true },
      ] }} onCancel={() => setReleasing(null)} onSubmit={doRelease} />}
      <C2CToast msg={toast} />
    </div>
  );
}

/* ═══════════ Change simulator -- computes the filing path ═══════════
   Deterministic, rule-backed computed output (SUPAC / ICH Q12) over canonical
   config — no fixture data slice. KEEP. */

function filingPath(changeType: string, risk: string, mkt: string): string[] {
  const high = risk === 'high', med = risk === 'med';
  const map: Record<string, string[]> = {
    fda: high ? ['Prior-Approval Supplement (PAS)', 'Reviewed before implementation'] : med ? ['CBE-30', 'Implement 30 days after filing'] : ['Annual Report', 'Report in next annual report'],
    ema: high ? ['Type II variation', 'Assessed by CHMP/RMS'] : med ? ['Type IB variation', 'Tell-wait 30 days'] : ['Type IA (IN)', 'Immediate notification'],
    pmda: high ? ['Partial change application (PCA)', 'Prior approval required'] : med ? ['Minor change notification', '30-day notification'] : ['Minor change notification', 'Notification'],
    nmpa: high ? ['Supplemental application', 'Prior approval'] : ['Filing / record-keeping', 'Record-keeping change'],
    health_canada: high ? ['Level I (PAS-equivalent)', 'Prior approval'] : med ? ['Level II (notifiable)', 'Notify'] : ['Level III/IV', 'Annual notification'],
    uk_mhra: high ? ['Type II variation', 'Prior approval'] : med ? ['Type IB', 'Tell-wait'] : ['Type IA', 'Notify'],
  };
  return map[mkt] || ['Assess locally', 'Region rule not modelled'];
}

function CmChange({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  const [type, setType] = useState('api_supplier_change');
  const [markets, setMarkets] = useState(['fda', 'ema']);
  const [desc, setDesc] = useState('');
  const [result, setResult] = useState<CmcChangeResult | null>(null);
  const [toast, fireToast] = useToast();
  const toggle = (id: string) => setMarkets((m) => m.includes(id) ? m.filter((x) => x !== id) : [...m, id]);
  const ct = CMC_CHANGE_TYPES.find((c) => c.id === type)!;
  const simulate = () => { if (!desc.trim() || !markets.length) return; setResult({ type: ct, markets: [...markets], desc: desc.trim(), paths: markets.map((m) => ({ m, label: CMC_MARKETS.find((x) => x[0] === m)![1], path: filingPath(type, ct.risk, m) })) }); };
  const riskTone = ct.risk === 'high' ? 'err' : ct.risk === 'med' ? 'warn' : 'ok';

  const memoMd = (r: CmcChangeResult) => {
    const compBy = r.type.risk === 'high' ? 'A prospective comparability protocol (ICH Q5E) with pre-defined acceptance criteria and side-by-side characterization of the pre- and post-change material is required before implementation.'
      : r.type.risk === 'med' ? 'A comparability assessment (ICH Q5E) covering critical quality attributes is required; a reduced protocol may suffice where the change is well-understood.'
      : 'A risk-based comparability check against release and stability data is sufficient; full protocol not expected.';
    const rec = r.type.risk === 'high' ? 'Do not implement until the highest-tier filing in scope is approved. Sequence the comparability work first.'
      : r.type.risk === 'med' ? 'Prepare the moderate-change filing(s) and implement per each market\'s reporting category; some markets allow do-and-tell.'
      : 'Implement under the annual/notification category; document in the next periodic report.';
    let s = `# Regulatory Change Impact Assessment\n\n*${r.type.label} -- ${r.markets.map((m) => m.toUpperCase()).join(', ')} -- ${r.type.risk} impact*\n\n`;
    s += `## 1. Change Description\n\n${r.desc}\n\n## 2. Classification\n\n- **Change type**: ${r.type.label}\n- **Assessed risk**: ${r.type.risk}\n- **Frameworks applied**: SUPAC, ICH Q12 (post-approval change management), ICH Q5E (comparability)\n\n## 3. Filing Path by Market\n\n| Market | Reporting category | Regulatory basis |\n|---|---|---|\n`;
    r.paths.forEach((p) => { s += `| ${p.label} | ${p.path[0]} | ${p.path[1]} |\n`; });
    s += `\n## 4. Comparability Requirement\n\n${compBy}\n\n## 5. Supporting Data Expected\n\n- Side-by-side release testing (pre/post change) against the approved specification\n- Stability commitment on the first post-change ${r.type.risk === 'low' ? 'batch' : 'batches'} (ICH Q1A)\n- Updated §3.2.S / §3.2.P sections and, where applicable, method (re)validation\n\n## 6. Recommendation\n\n${rec}\n\n---\n*Generated from the CMC change model (SUPAC / ICH Q12 rules). Route through change control and e-signature before implementation.*\n`;
    return s;
  };

  /*
   * "Open in editor" — a real handoff. See the long note on the same handler in
   * Biostatistics.tsx. This inline onClick wrote {title, md} into
   * localStorage['c2c_biostat_doc'] and navigated; nothing has ever read that
   * key, so the assessment did not travel and the editor opened on whatever it
   * would have opened on anyway.
   *
   * The payload is CONTENT, not an id, so it is created rather than referenced:
   * POST the document, POST the section holding the memo, then navigate. On any
   * failure we stay put with the assessment still on screen and say why.
   */
  const openingRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const openEditor = async (r: CmcChangeResult) => {
    if (openingRef.current) return; // a second click must not create a second document
    const title = 'Regulatory Change Impact Assessment';
    openingRef.current = true; setOpening(true);
    try {
      // A CMC change assessment is quality documentation — Module 3.
      const res = await saveToAuthoring({
        title, module: 'M3', code: 'regulatory_change_impact_assessment',
        content: memoMd(r), subject: 'the assessment',
      });
      // Navigate only on a clean write — see authoringHandoff.
      if (!res.ok) { fireToast(res.message); return; }
      if (nav) nav('document-authoring');
      else fireToast(res.message);
    } finally {
      openingRef.current = false; setOpening(false);
    }
  };

  return (
    <div className="cm-body">
      <CmHead title="Change simulator" meta="Model a CMC change -> filing path across markets -- SUPAC / ICH Q12" ask={ask} />
      <div className="pj-card">
        <div className="pj-card-b">
          <div className="de-field"><label className="de-label">Change type</label>
            <select className="de-select" value={type} onChange={(e) => { setType(e.target.value); setResult(null); }}>{CMC_CHANGE_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          </div>
          <div className="de-field"><label className="de-label">Describe the change<span className="req">*</span></label>
            <textarea className="de-textarea" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. switch the drug-substance supplier from A to B; comparable process, new site" />
          </div>
          <div className="de-field"><label className="de-label">Markets</label>
            <div className="cm-mkt">{CMC_MARKETS.map(([id, l]) => (<button key={id} type="button" className="cm-mkt-opt" data-on={markets.includes(id) || undefined} onClick={() => toggle(id)}>{markets.includes(id) ? I.check : I.plus}{l}</button>))}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <button className="reg-cta" onClick={simulate} disabled={!desc.trim() || !markets.length}>{I.zap} Simulate change</button>
            <span className={'rd-chip tone-' + riskTone}>{ct.risk} impact</span>
          </div>
        </div>
      </div>
      {result && (
        <div className="cm-change-out">
          <div className="cm-doc">
            <div className="cm-doc-bar">
              <div><span className="cm-doc-kind">Regulatory Change Impact Assessment</span><span className="cm-doc-prov">SUPAC -- ICH Q12 -- draft</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="bs-da" onClick={() => ask('Refine the change-control assessment and draft the comparability protocol for: ' + result.desc)}>{I.sparkles} Refine with AnA</button>
                <button className="bs-da primary" onClick={() => void openEditor(result)} disabled={opening}>{I.penLine} {opening ? 'Saving to the editor…' : 'Open in editor'}</button>
              </div>
            </div>
            <div className="cm-doc-page"><div className="cm-doc-render" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(memoMd(result)) }} /></div>
          </div>
          <CmPush label={'Change-control package -- ' + result.type.label} nav={nav} bar />
        </div>
      )}
      <C2CToast msg={toast} />
    </div>
  );
}

/* ═══════════ Blueprint -- Global -- Program records -- Copilot ═══════════ */

function CmBlueprint({ ask }: { ask: (text: string) => void }) {
  /* DATA: fixture removed (was CMC_BP, a fabricated §3.2 readiness list, plus a
     fake "Generate" action). There is no org-scoped GET that returns which §3.2
     sections are ready to generate — GET /api/cmc/module3-board returns
     blueprint:null, and section generation is a POST action
     (/api/cmc/generate-enhanced-blueprint), not a readiness readout. Honest empty
     until a blueprint-readiness backend is connected. */
  return (
    <div className="cm-body">
      <CmHead title="Blueprint generator" meta="Compose CTD §3.2 sections from the quality data" ask={ask} suggest={CMC_SUGGEST.overview} />
      <div className="pj-card"><div className="pj-card-h"><span className="t">§3.2 sections</span><span className="s">CTD Module 3</span></div>
        <div className="pj-card-b">
          <EmptyState icon={I.template} title="No blueprint sections yet" hint="CTD §3.2.S / §3.2.P section drafts are generated on demand from your quality data. A per-project §3.2 readiness list appears here once connected." />
        </div>
      </div>
    </div>
  );
}

function CmGlobal({ ask }: { ask: (text: string) => void }) {
  /* DATA: fixture removed (was CMC_GLOBAL, fabricated per-region readiness % + gaps).
     GET /api/cmc/module3-board returns global:null; /api/cmc/global-compliance is a
     document-transform action plus a static market catalog, not a readiness
     projection. Honest empty until a regional-readiness backend is connected. */
  return (
    <div className="cm-body">
      <CmHead title="Global compliance" meta="FDA -- EMA -- PMDA Module 3 readiness and regional gaps" ask={ask} />
      <div className="pj-card"><div className="pj-card-h"><span className="t">Regional readiness</span><span className="s">FDA -- EMA -- PMDA</span></div>
        <div className="pj-card-b">
          <EmptyState icon={I.globe} title="No regional readiness yet" hint="Per-market Module 3 readiness and the gaps blocking each region appear here once computed from your submissions." />
        </div>
      </div>
    </div>
  );
}

function CmPathway({ ask }: { ask: (text: string) => void }) {
  /* DATA: fixtures removed (was CMC_CORR agency correspondence + inline hardcoded
     "audit chain" rows). GET /api/cmc/module3-board returns correspondence:null and
     exposes no correspondence or audit-trail readout; overdue information requests
     are aggregated only into the Overview KPIs. Honest empty until correspondence /
     audit-trail backends are connected. */
  return (
    <div className="cm-body">
      <CmHead title="Program records" meta="Agency correspondence, approval gates and the audit chain" ask={ask} />
      <div className="pj-card" style={{ marginBottom: 16 }}><div className="pj-card-h"><span className="t">Open agency correspondence</span><span className="s">triage by deadline</span></div>
        <div className="pj-card-b">
          <EmptyState icon={I.globe} title="No open agency correspondence" hint="Information requests, Day-120 LoQs, and consultations appear here. Overdue information requests currently feed only the Overview KPIs." />
        </div>
      </div>
      <div className="pj-card"><div className="pj-card-h"><span className="t">Audit chain</span><span className="s">governed actions</span></div>
        <div className="pj-card-b">
          <EmptyState icon={I.scroll} title="No audit activity yet" hint="Governed actions — signatures, edits, and data changes — appear here once an audit-trail source is connected for this surface." />
        </div>
      </div>
    </div>
  );
}

function CmCopilot({ ask }: { ask: (text: string) => void }) {
  return (
    <div className="cm-body">
      <CmHead title="CMC copilot" meta="Ask the Module 3 expert -- grounded in ICH Q-series and your quality data" ask={ask} />
      <div className="pj-card"><div className="pj-card-b">
        {CMC_SUGGEST.copilot.concat(['Reconcile drug-substance specs across CSR-201 and §3.2.S.4.1', 'Which markets need a prior-approval supplement for the scale-up?']).map((q, i) => (
          <button key={i} className="cm-copilot-q" onClick={() => ask(q)}><span className="ico">{I.sparkles}</span><span className="t">{q}</span></button>
        ))}
      </div></div>
    </div>
  );
}

/* ═══════════ CmcModule shell — sub-tab router ═══════════ */

const CMC_SURF: Record<string, React.ComponentType<{ ask: (text: string) => void; nav?: (id: string) => void }>> = {
  overview: CmOverview,
  specs: CmSpecs,
  stability: CmStability,
  batch: CmBatch,
  change: CmChange,
  blueprint: CmBlueprint,
  global: CmGlobal,
  pathway: CmPathway,
  copilot: CmCopilot,
};

export function CmcModule({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;
  const [tab, setTab] = useState('overview');
  (window as any).__cmSetTab = setTab;
  const Surf = CMC_SURF[tab] || CmOverview;
  return (
    <div className="cm">
      <div className="cm-sub">
        {CMC_NAV.map((n) => (<button key={n.id} className="cm-subtab" data-on={tab === n.id || undefined} onClick={() => setTab(n.id)}>{I[n.icon] || I.grid}{n.label}</button>))}
      </div>
      <CmConnectBar nav={onNav} />
      <Surf ask={ask} nav={onNav} />
    </div>
  );
}
