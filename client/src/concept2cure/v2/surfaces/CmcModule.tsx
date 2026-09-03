import { serverMessage } from '@/lib/queryClient';
import React, { useState, useEffect, useRef } from 'react';
import { I } from '../icons';
import { AnswerLead } from '../AnswerLead';
import { assessmentState, mayReassure } from '../assessmentState';
import type { SurfaceViewProps } from '../surfaceViews';
import { renderSafeMarkdown } from '../../components/ana/renderSafeMarkdown';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { EmptyState, liveGetOrNull, useLiveData, useLiveRows } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { saveToAuthoring } from '../authoringHandoff';
import { setEditorTarget } from '../editorTarget';
import {
  specRowsFromApi,
  specCreateBody,
  specUpdateBody,
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
/* CMC registers bound to org-scoped endpoints that already existed server-side,
   read AND written. Kept in a sibling module so the loading/error/empty triage
   and the create/edit write path are each written once rather than per card —
   see ./cmcRegisters. */
import {
  CmMethodLibrary,
  CmQcTesting,
  CmContainerClosures,
  CmReferenceStandards,
  CmImpurityProfiles,
  CmDissolutionProfiles,
  CmMaterialSpecs,
  CmFormulationRecords,
  CmManufacturingProcesses,
  CmCharacterizationStudies,
  CmChangeRegister,
  CmComparabilityStudies,
  CmProcessValidation,
  CmDrugSubstances,
  CmDrugProducts,
  type ChangeControlApiRow,
} from './cmcRegisters';
import { CmModule3Build } from './CmcModule3Build';
import { CmQuality } from './CmcQuality';
import {
  stabilityForm,
  stabilityBody,
  stabilityResultForm,
  stabilityResultBody,
  stabilityCloseoutForm,
  stabilityCloseoutBody,
  readStabilityResults,
  type StabilityResult,
} from './cmcRegisterForms';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers } from '../surfaceActions';
import { ceremonyOpen } from '../ceremony';
import {
  cmcProjectId,
  cmcProjectUuid,
  cmcWriteError,
  cmcWriteFailed,
  cmcWriteThrew,
} from './cmcShared';
import { openProgramAction } from '../programAction';
import { C2CToast, useToast } from '../toast';
import { useAuth } from '@/services/portal/authService';
import '../styles/project-home-v2.css';

/* ═══════════════════════════════════════════════════════════════════
   CMC -- Module 3 operating system.

   Real-data standard: a surface renders REAL persisted data, an honest
   EMPTY state, or an honest ERROR state — never an in-file fixture
   presented as content.

   ── The shape of this module ──────────────────────────────────────
   The CMC surfaces were readers. Overview was anchored to the live board
   (GET /api/cmc/module3-board), specifications and batch records could be
   written, and everything else — the method library, QC testing, stability,
   process validation, change control, comparability, drug substance, drug
   product — was a read-only register whose create endpoint had existed,
   unbound, since the CMC schema landed. The tabs downstream of that data
   (blueprint, global, program records) were honest empties for the same
   reason: nothing in the product could produce what they needed.

   That is what the module now closes. Each register carries its own entry
   (./cmcRegisterForms, ./cmcRegisters), and because every one of those
   creates upserts a canonical Module 3 source object on write
   (services/cmc-write-through.ts), the data a CMC team records here is
   exactly the source layer POST /api/cmc/module3-os/compile/:projectId
   composes §3.2.S / §3.2.P from. Two new surfaces stand on the other end
   of that pipe: ./CmcModule3Build (build state, compile, contradictions,
   readiness, the fail-closed export gate, provenance) and ./CmcQuality
   (CQAs, CPPs, control strategy, the ICH check).

   What stays an honest empty stays one: agency correspondence has no
   backend, and no shelf life is projected that a study has not been closed
   out with. Canonical config (ICH Q-series / CTD 3.2.S / 3.2.P catalogs,
   market lists) and deterministic generators (the change simulator, the
   markdown renderer) are kept and now run against the real registers.

   Overrides the thin SURFACE_VIEWS['cmc'] with this full module.
   ═══════════════════════════════════════════════════════════════════ */

/* ── Types ── */

interface CmcNavItem { id: string; label: string; icon: string; }
interface CmcPortfolio {
  sub: string; product: string; region: string; type: string;
  rpi: number | null; ir: number | null;
  /** 'spine' = the canonical submission core (real sequences + placed leaves);
      'rpi' = the legacy preparedness store. Spine rows carry the Module 3
      facts; legacy rows carry the engine's score. Neither fakes the other's. */
  source?: 'spine' | 'rpi';
  m3Leaves?: number | null;
  sequences?: number | null;
}
/** One open agency question touching Module 3 (reg_questions, org-scoped). */
interface CmcCorrespondence {
  id: number | string; question: string; sectionRef: string | null;
  priority: string | null; severity: string | null; status: string;
  region: string | null; dueDate: string | null; overdue: boolean;
  assignedTo: string | null;
  /** The authoring document holding the drafted response, when one is linked. */
  responseDocId?: string | null;
  /** Served by the file's GET (the closed-history read); the board omits it. */
  updatedAt?: string | null;
}
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
interface CmcBoardData {
  portfolio?: CmcPortfolio[];
  sections?: CmcSection[] | null;
  kpis?: CmcBoardKpis;
  /** null = the reg_questions store is unprovisioned (said, not hidden);
      [] = provisioned and genuinely no open Module 3 questions. */
  correspondence?: CmcCorrespondence[] | null;
  meta?: CmcBoardMeta;
}

/* ── Navigation + AnA prompt starters (UI config / affordances — not data) ── */

/* The sub-tabs follow the work, not the schema: each one is where a role on a
   CMC team spends its day, and every one of them now has both halves — the
   register they read and the entry the record is made through.

     Drug substance / Drug product   §3.2.S / §3.2.P owners, formulation
     Specifications                  analytical development and QC
     Stability                       the stability coordinator
     Batch records                   manufacturing science / MSAT
     Change control                  change control and QA
     Quality by design               the control-strategy and ICH-compliance view
     Module 3 build                  regulatory CMC — compile, resolve, export
     Program records                 QA — the provenance chain */
/* Nine destinations, down from twelve.
   • Drug substance + Drug product were two ~40-line wrappers over one register
     each; they are one destination now, exactly as Specifications already
     carries two registers. Both §3.2.S and §3.2.P material is still here.
   • Copilot held nothing but chat entry points — a tab existing to launch chat
     is the pattern chat-first design forbids, and the AnA panel already carries
     CMC actions on EVERY tab via ANA_SURFACE_CTX. Its prompts moved there, so
     they went from reachable on one tab to reachable on all nine.
   • Global filings computed a market matrix from the change-control register and
     owned no object of its own; it is a per-change expansion inside Change
     control now, next to the change it describes. */
const CMC_NAV: CmcNavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'beaker' },
  { id: 'materials', label: 'Substance & product', icon: 'atom' },
  { id: 'specs', label: 'Specifications', icon: 'clipboardList' },
  { id: 'stability', label: 'Stability', icon: 'barChart' },
  { id: 'batch', label: 'Batch records', icon: 'grid' },
  { id: 'change', label: 'Change control', icon: 'gitBranch' },
  { id: 'quality', label: 'Quality by design', icon: 'sigma' },
  { id: 'build', label: 'Module 3 build', icon: 'layers' },
  { id: 'pathway', label: 'Program records', icon: 'scroll' },
];

const CMC_SUGGEST: Record<string, string[]> = {
  overview: ['Run the ICH compliance check and show every gap', 'Generate the drug-substance control strategy', 'What is blocking my shelf-life claim?'],
  materials: ['Draft the §3.2.S.2.2 manufacturing process description', 'Summarise the impurity profile for this substance', 'Draft the §3.2.P.1 composition table', 'What does §3.2.P.2 pharmaceutical development still need?'],
  specs: ['Justify the release and shelf-life limits for aggregation', 'Flag any specification without a validated method', 'Compare release vs shelf-life limits across DS and DP'],
  stability: ['Project shelf life from the long-term data with an ICH Q1E fit', 'Are my primary batches combinable for one shelf-life claim?', 'Show every study trending toward a limit', 'Draft the stability summary for §3.2.S.7'],
  batch: ['Summarize deviations across the last 10 batches', 'Show batches still pending release', 'Trend yield across drug-product batches'],
  change: ['Classify this change and give me the filing path per market', 'Which of my open changes needs a prior-approval supplement?', 'Summarise the filing burden of these changes across all six markets', 'Which markets can I implement in before approval?'],
  pathway: ['Summarise every governed action taken on this Module 3', 'Which contradictions were resolved, and how?', 'Draft an audit-trail summary for an inspector'],
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

/* The CTD sections each change type refiles. Type decides the sections; risk
   only decides the filing category — a low-risk equipment change still rewrites
   §3.2.S.2 / §3.2.P.3. Both spellings of each address are listed because the
   correspondence store records both, exactly as CmCorrNotice's other callers
   match them ('3.2.S.4' and the leaf-coded 'm3.2.S.4'). */
const SECTIONS_FOR_CHANGE: Record<string, string[]> = {
  api_supplier_change: ['3.2.S.2', 'm3.2.S.2'],
  process_scale_up: ['3.2.S.2', '3.2.P.3', 'm3.2.S.2', 'm3.2.P.3'],
  excipient_replacement: ['3.2.P.1', '3.2.P.2', '3.2.P.4', 'm3.2.P.1', 'm3.2.P.2', 'm3.2.P.4'],
  analytical_method_change: ['3.2.S.4', '3.2.P.5', 'm3.2.S.4', 'm3.2.P.5'],
  facility_change: ['3.2.S.2', '3.2.P.3', 'm3.2.S.2', 'm3.2.P.3'],
  equipment_change: ['3.2.S.2', '3.2.P.3', 'm3.2.S.2', 'm3.2.P.3'],
  process_parameter_change: ['3.2.S.2', '3.2.P.3', 'm3.2.S.2', 'm3.2.P.3'],
  specification_change: ['3.2.S.4', '3.2.P.5', 'm3.2.S.4', 'm3.2.P.5'],
  packaging_change: ['3.2.P.7', 'm3.2.P.7'],
};

const CMC_MARKETS: [string, string][] = [['fda', 'FDA'], ['ema', 'EMA'], ['pmda', 'PMDA'], ['nmpa', 'NMPA'], ['health_canada', 'Health Canada'], ['uk_mhra', 'UK MHRA']];

/* ── Inline helpers ──
   `useToast` / `C2CToast` / the project-in-context read / the write-error
   reader now live in ./cmcShared: the CMC module is nine surfaces across four
   files, and a toast that reports a failure is not something to reimplement
   per file. */

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
   The note this carried ("Draft approval only — this is not yet persisted as a
   21 CFR §11 electronic signature or audit entry") was written when the form had
   no approval endpoint behind it. Both of its callers now have one, and both of
   those endpoints re-authenticate the signer before any write and record a
   hash-chained governed action:

     specifications  POST /api/cmc/specifications/:id/approve
                     verifyReauth + recordGovernedAction, then approval_status
     §3.2 sections   POST /api/cmc/module3-os/sections/:pid/:key/approve
                     verifyReauth, refuses on an unresolved critical
                     contradiction, snapshots an approved version, writes a
                     cmc_provenance_events entry keyed to the signer

   Leaving the old note in place is not the safe side of the honesty rule. It
   tells a signer their signature is not being recorded at the moment it is —
   which is exactly the misunderstanding §11.50 exists to prevent, and it invites
   someone to sign more casually than the record deserves. The copy now states
   what actually happens. */
function signForm(target: string): C2CFormConfig {
  return {
    eyebrow: '21 CFR §11.50 — e-signature', title: 'Sign to approve', sub: target, submitLabel: 'Sign & approve',
    governed: 'Your credentials are verified before this is written, and the signature, its meaning and your reason are recorded to the hash-chained audit trail against your account.',
    fields: [
      /* The values are the tokens the approve endpoints record, not display
         strings: the meaning is part of the signed record, so what the signer
         chooses and what an inspector later reads must be the same word. */
      { key: 'meaning', label: 'Meaning of signature', type: 'select', options: [
        { value: 'approval', label: 'Approval' },
        { value: 'review', label: 'Review' },
        { value: 'responsibility', label: 'Responsibility' },
        { value: 'authorship', label: 'Authorship' },
      ], default: 'approval', required: true },
      { key: 'reason', label: 'Reason', type: 'textarea', placeholder: 'Reason for this approval...', required: true },
      { key: 'password', label: 'Password', type: 'password', placeholder: 'Re-enter your password', required: true, half: true },
      { key: 'totp', label: 'Authenticator', type: 'text', placeholder: '6-digit code', half: true },
    ],
  };
}

/* ── Cross-surface navigation helpers ── */
function cmcNav(onNav: ((id: string) => void) | undefined, id: string) { onNav && onNav(id); }
function cmcCtx(label: string) { try { if ((window as any).C2C) (window as any).C2C.setContext({ entityType: 'cmc', entityId: label, entityLabel: label }); } catch { /* noop */ } }
function cmcTask(label: string) { cmcCtx(label); try { if ((window as any).C2C) (window as any).C2C.open('task'); } catch { /* noop */ } }
function cmcCollab(label: string) { cmcCtx(label); try { if ((window as any).C2C) (window as any).C2C.open('collab'); } catch { /* noop */ } }

/* ── Shared subcomponents ── */

function CmConnectBar({ nav }: { nav?: (id: string) => void }) {
  return (
    <div className="cm-connect">
      <span className="cm-connect-l">This work flows into</span>
      <button onClick={() => cmcNav(nav, 'dossier')}>{I.folder} Module 3 dossier</button>
      <button onClick={() => cmcNav(nav, 'document-authoring')}>{I.penLine} Document editor</button>
      <button onClick={() => cmcNav(nav, 'vault')}>{I.vault} Vault</button>
      <button onClick={() => cmcNav(nav, 'projects')}>{I.folder} Project</button>
      <button onClick={() => cmcTask('CMC — Module 3')}>{I.checkSquare} Tasking</button>
      <button onClick={() => cmcCollab('CMC — Module 3')}>{I.messageSquare} Collaborate</button>
    </div>
  );
}

/* "Open in", not "Push to": these buttons navigate with context — they write
   nothing. The data itself flows without them: every register save
   write-throughs to the canonical §3.2 source layer, and each compile files a
   governed artifact the Vault's "Module 3 (CMC)" branch lists. A button
   claiming to "save to Vault" while saving nothing was the dishonest copy the
   relabel removes. */
function CmPush({ label, nav, bar }: { label: string; nav?: (id: string) => void; bar?: boolean }) {
  return (
    <span className={bar ? 'cm-push cm-pushbar' : 'cm-push'}>
      <span className="lbl">Open in</span>
      <button onClick={() => { cmcCtx(label); cmcNav(nav, 'dossier'); }} title="Open the Module 3 dossier with this in context">{I.gitBranch} Module 3 doc</button>
      <button onClick={() => { cmcCtx(label); cmcNav(nav, 'vault'); }} title="Open the Vault — compiled §3.2 artifacts are filed there automatically">{I.vault} Vault</button>
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
        <div><div className="cm-kicker">CMC — Module 3 operating system</div><h1 className="cm-title">{title}</h1><div className="cm-meta">{meta}</div></div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}{ask && <button className="reg-cta" onClick={() => ask((suggest && suggest[0]) || 'Help me with Module 3')}>{I.sparkles} Ask AnA</button>}</div>
      </div>
      {suggest && <div className="sp-starters" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>{suggest.map((s, i) => (<button key={i} className="sp-starter" onClick={() => ask && ask(s)}><span className="sk">{I.sparkles}</span><span>{s}</span></button>))}</div>}
    </>
  );
}

/* A KPI is a figure first; `onClick` makes it a door as well. The interactive
   variant is a real <button> carrying the SAME class and children — the
   .c2c-v2 button reset (app-v2.css) zeroes the chrome and .reg-kpi supplies
   the identical box — so the tile looks the same, reads as a control to a
   screen reader, and gains the focus ring. A tile with nothing behind it stays
   a plain <div>: a clickable dead end is noise, not an affordance. */
function Kpi({ l, v, s, tone, onClick, title }: { l: string; v: React.ReactNode; s?: string; tone?: string; onClick?: () => void; title?: string }) {
  const body = <><div className="reg-kpi-v">{v}</div><div className="reg-kpi-l">{l}{s ? ' -- ' + s : ''}</div></>;
  if (onClick) return <button type="button" className="reg-kpi" data-tone={tone} title={title} onClick={onClick}>{body}</button>;
  return <div className="reg-kpi" data-tone={tone}>{body}</div>;
}

/* ═══════════ Overview -- LIVE portfolio + governed section approvals ═══════════ */

export function CmOverview({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  /* Live board -- GET /api/cmc/module3-board[?projectId]. useLiveData unwraps the
     { success, data } envelope, so `board.data` is the display payload directly:
     real portfolio + KPIs, an honest empty, or an honest error — never a fixture.
     Portfolio is org-scoped; the governed section list is per-project, so it is
     null until a project is in context. */
  const ctxProjectId = cmcProjectId();
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
  /* The overdue ATTRIBUTION comes from the same read as the COUNT. The lead
     used to count from the correspondence KPI but name submissions from the
     legacy per-row store — two sources, and when the legacy store was empty
     the sentence attributed the count to "()" — an empty list. */
  const overdueQs = (board.data?.correspondence ?? []).filter((c) => c.overdue);
  const overdueSecs = [...new Set(overdueQs.map((c) => c.sectionRef).filter((s): s is string => !!s))];

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
  // the sign form are forwarded, and the server VERIFIES the re-auth before any
  // write (verifyReauth, module3OperatingSystemRoutes.ts — fail closed, same as
  // spec-approve and batch-release).
  // Only reflects approval on a real 2xx; nothing is fabricated on failure.
  const doSign = async (v: Record<string, string>) => {
    if (!sign) return;
    const target = sign;
    if (!ctxProjectId) {
      fireToast('Open a program first — section approval is recorded per project.', 'error');
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
        {
          reason: v.reason,
          // §11.50(a)(3) — the meaning the signer chose, recorded with the
          // signature rather than collected and dropped.
          meaning: v.meaning,
          reauth: { password: v.password, totp: v.totp || undefined },
        },
      );
      const json = await res.json().catch(() => null);
      if (res.status === 409) {
        fireToast('Cannot approve ' + target.key + ' — resolve the critical contradictions first.', 'error');
        return;
      }
      if (!res.ok) {
        fireToast('Couldn’t approve section ' + target.key + ' — ' + specErr(json, res.status) + '. Nothing was persisted.', 'error');
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
      fireToast('Couldn’t approve section ' + target.key + ' — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
    }
  };

  const rpiRankable = port.filter((p): p is CmcPortfolio & { rpi: number } => typeof p.rpi === 'number');
  const lowSub = rpiRankable.length ? [...rpiRankable].sort((a, b) => a.rpi - b.rpi)[0] : null;
  const inReview = secs.filter((s) => s.st === 'review');
  const drafts = secs.filter((s) => s.st === 'draft');
  const nextSec = inReview[0] || drafts[0];
  /* ── BP-W0-3, the same defect as the NDA cockpit ───────────────────────────
     With zero submissions this lead read "Your Module 3 spans 0 submissions --
     preparedness is still computing across the portfolio" over a board that had
     finished loading and had nothing to compute, and then reassured with
     "You're building steadily" over nothing being built. `not-assessed` was
     wearing the vocabulary of work in progress.

     Here `assessmentRan` CAN be true, unlike the RtF log: a governed section
     carries a state (draft / review / approved) that only exists because
     someone moved it, so a non-empty section set is positive evidence that the
     package is genuinely being assessed. The gate is `secs.length`, not
     `approved === 0`. */
  const cmcState = assessmentState({
    loading: board.loading,
    unreadable: Boolean(board.error),
    scopeExists: port.length > 0,
    findingCount: irOverdue,
    assessmentRan: secs.length > 0,
  });
  const cmLead = (
    <AnswerLead
      /* Both arms of the inner ternary used to resolve to 'calm', so the
         'good' tone AnswerLead provides was unreachable here while the
         NDA cockpit — same session, same assessmentState taxonomy — used it
         for the identical state. Two sibling surfaces rendering one state in
         two visual languages is the drift this work is meant to remove. */
      tone={irOverdue ? 'urgent' : cmcState === 'assessed-clear' ? 'good' : 'calm'}
      eyebrow={cmcState === 'not-assessed' && port.length === 0
        ? 'Is your CMC package ready'
        : 'Is your CMC package ready across all ' + port.length + ' submissions'}
      headline={cmcState === 'unreadable'
        ? <>The Module 3 board could not be read.</>
        : cmcState === 'loading'
          ? <>Reading your Module 3 portfolio&hellip;</>
          : port.length === 0
            ? <>No CMC submissions are in scope yet.</>
            : avgRpi != null && lowSub
              ? <>Your Module 3 averages <b>RPI {avgRpi}</b> -- the <b>{lowSub.sub}</b> at {lowSub.rpi} is what's holding the portfolio back.</>
              : <>Your Module 3 spans <b>{port.length}</b> {port.length === 1 ? 'submission' : 'submissions'}{avgRpi != null ? <> at an <b>RPI {avgRpi}</b> average</> : <>, with no preparedness index computed for {port.length === 1 ? 'it' : 'any of them'} yet</>}.</>}
      body={cmcState === 'unreadable'
        ? <>This is a failed read, not an empty portfolio. Nothing shown here should be taken as the state of your CMC package. Sign in to your tenant and retry.</>
        : cmcState === 'loading'
          ? <>Nothing is being asserted about readiness until the read settles.</>
          : port.length === 0
            ? <>Module 3 readiness is measured across an organization's submissions, and there are none recorded. Nothing about this package has been assessed. Create a submission and add its CMC sections, and its specifications, batch analyses, stability data and change control appear here.</>
            : irOverdue
              ? <>You have <b>{irOverdue} information {irOverdue === 1 ? 'request' : 'requests'} overdue</b>{overdueSecs.length ? <> (§{overdueSecs.join(', §')})</> : null}. {nextSec ? <>And §{nextSec.key} ({nextSec.path}) is still in {nextSec.st}, one of {inReview.length + drafts.length} sections not yet approved.</> : null}</>
              : secs.length === 0
                ? <>No governed CMC sections have been authored for {port.length === 1 ? 'this submission' : 'these submissions'} yet, so section approval has nothing to report.</>
                : <>{approved} of {secs.length} sections are approved{nextSec ? <>. §{nextSec.key} ({nextSec.path}) is the next one to move — clear it{lowSub ? <> and {lowSub.sub} climbs with it</> : null}</> : null}.</>}
      /* "You're building steadily" is a claim about work in progress, so it
         requires evidence that work is in progress. mayReassure gates it on the
         assessed-clear state and on a non-zero readiness percentage; every
         other state renders no reassurance rather than a softened one. */
      reassure={irOverdue
        ? "Answer the IRs first — they're time-boxed. I'll draft the responses and route the sign-offs with you."
        : mayReassure(cmcState, readyPct)
          ? "You're building steadily. I'll help you move the next section to approved."
          : undefined}
      action={{ label: irOverdue ? 'Draft the overdue IR responses' : 'Advance the next section', onClick: () => ask(irOverdue ? ('Draft responses to the overdue Module 3 information requests' + (overdueSecs.length ? ' citing §' + overdueSecs.join(', §') : '')) : ('Prepare §' + (nextSec ? nextSec.key : '') + ' ' + (nextSec ? nextSec.path : '') + ' for approval')),
        /* The second action goes where the section actually moves: the build
           board, which is the only surface that can compile it, show what is
           blocking it and clear the export gate. */
        alt: { label: 'Open the Module 3 build board', onClick: () => (window as any).__cmSetTab && (window as any).__cmSetTab('build') } }}
      secondary="Or work the portfolio and build state below."
    />
  );
  return (
    <div className="cm-body">
      <CmHead title="Module 3 overview" meta={`${port.length} submissions — RPI ${avgRpi == null ? '—' : avgRpi} average`} ask={ask} suggest={CMC_SUGGEST.overview} />
      {board.loading ? (
        <EmptyState icon={I.beaker} title="Loading the Module 3 board…" busy testId="cmc-board-loading" />
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
          {/* No KPI strip here. `cmLead` immediately above narrates the same
              four numbers — submissions, RPI, overdue IRs, sections approved —
              in a sentence that also says which one to act on, and "sections
              approved" appears a third time in the build-state bar below.
              Repeating a figure three times does not make it more true.
              The ONE tile that returns is IR overdue, and it returns as a
              door, not a repeat: the questions behind the count live on the
              Program records tab, so a positive count jumps there. At zero it
              stays a plain figure, and over an empty portfolio it does not
              render at all — "0 overdue" across no submissions is a claim
              nothing has assessed. */}
          {port.length > 0 && (
            <div className="cm-kpis" style={{ gridTemplateColumns: 'minmax(150px, 240px)' }}>
              <Kpi
                l="IR overdue"
                v={irOverdue}
                tone={irOverdue ? 'err' : 'ok'}
                onClick={irOverdue > 0
                  ? () => (window as unknown as { __cmSetTab?: (id: string) => void }).__cmSetTab?.('pathway')
                  : undefined}
                title={irOverdue > 0 ? 'Open the agency correspondence — overdue first' : undefined}
              />
            </div>
          )}
          {/* Section approvals first: it is the only content on this page a
              CMC lead can act on. The portfolio and build-state cards below
              are reference material, and reference material does not go
              above the thing you came here to do. */}
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Section approvals</span><span className="s">governed — 21 CFR §11</span></div>
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
          <div className="pj-card" style={{ marginBottom: 16 }}>
            <div className="pj-card-h"><span className="t">Portfolio</span><span className="s">{port.length} submissions</span></div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {port.length === 0 ? (
                <div style={{ padding: 12 }}>
                  <EmptyState icon={I.fileText} title="No submissions yet" hint="Your regulatory submissions (BLA / MAA / NDA / J-NDA) appear here with their preparedness index and overdue information requests." />
                </div>
              ) : (
                <table className="reg-tbl"><thead><tr><th>Submission</th><th>Product</th><th>Region</th><th>Type</th><th>Module 3</th><th>RPI</th><th>IR overdue</th></tr></thead>
                <tbody>{port.map((r, i) => (<tr key={i}><td style={{ fontWeight: 600 }}>{r.sub}</td><td>{r.product}</td><td>{r.region}</td><td><span className="reg-pill neutral">{r.type}</span></td>
                  {/* Spine rows carry the facts a CMC lead reads first: placed
                      Module 3 leaves and sequences from the REAL submission
                      core. Legacy preparedness rows honestly show none. */}
                  <td>{r.source === 'spine' ? <span className="cm-meta">{r.m3Leaves ?? 0} placed · {r.sequences ?? 0} seq</span> : <span className="cm-meta">—</span>}</td>
                  <td>{r.rpi == null ? '—' : r.rpi}</td><td>{r.ir == null ? '—' : r.ir}</td></tr>))}</tbody></table>
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
  const j = json as { details?: Array<{ message?: string }> } | null;
  // A named field beats any generic sentence, so the zod detail stays first.
  const detail = j?.details?.[0]?.message;
  if (typeof detail === 'string' && detail.trim()) return detail;
  // `j?.error` used to lead, which rendered the enum instead of the sentence.
  return serverMessage(json) ?? `The server did not accept the change (HTTP ${status}).`;
}

/* ── Correspondence signpost — open agency questions citing THIS tab's work ──
   The record of truth (with loading/error/empty states) is the Program-records
   card; this bar is an extra signpost rendered only when questions EXIST that
   reference the sections this tab owns. It asserts presence, never absence —
   on load failure it stays silent and the primary card reports the failure. */
function CmCorrNotice({ prefixes, noun }: { prefixes: string[]; noun: string }) {
  const board = useLiveData<CmcBoardData>('/api/cmc/module3-board');
  const rows = (board.data?.correspondence ?? []).filter((c) =>
    prefixes.some((pfx) => (c.sectionRef ?? '').toLowerCase().startsWith(pfx.toLowerCase())),
  );
  if (rows.length === 0) return null;
  const overdue = rows.filter((c) => c.overdue).length;
  return (
    <div className={'pj-con' + (overdue ? '' : ' is-ok')} style={{ marginBottom: 12 }} data-testid="cmc-corr-notice">
      <span className="ico">{overdue ? I.alertTriangle : I.globe}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div className="pj-con-t">
            {rows.length} open agency {rows.length === 1 ? 'question references' : 'questions reference'} {noun}
            {overdue ? ` — ${overdue} overdue` : ''}
          </div>
          <div className="pj-con-d">{rows[0].sectionRef ?? 'Module 3'} · {rows[0].question.slice(0, 90)}{rows[0].question.length > 90 ? '…' : ''}</div>
        </div>
        <button
          className="nda-open"
          onClick={() => (window as unknown as { __cmSetTab?: (id: string) => void }).__cmSetTab?.('pathway')}
        >
          {I.scroll} Open correspondence
        </button>
      </div>
    </div>
  );
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
  const projectId = cmcProjectUuid();
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
    eyebrow: 'CMC — 3.2.S.4.1', title: row ? 'Edit specification' : 'New specification', sub: 'Release and shelf-life limits for a drug substance or drug product',
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
      fireToast('Open a program first — specifications are recorded per project.', 'error');
      return;
    }
    try {
      if (edit && edit !== 'new') {
        const id = edit.id;
        const res = await apiRequest('PUT', '/api/cmc/specifications/' + id, specUpdateBody(v));
        const json = await res.json().catch(() => null);
        if (!res.ok) { fireToast('Couldn’t save the specification — ' + specErr(json, res.status) + '. Nothing was persisted.', 'error'); return; }
        const adopted = specRowsFromApi([(json as { data?: QualitySpecApiRow })?.data].filter(Boolean) as QualitySpecApiRow[])[0];
        setRows((rs) => rs.map((x) => x.id === id ? { ...(adopted ?? x), _new: true } : x));
        fireToast('Specification saved · ' + (adopted?.attr ?? v.attr));
      } else {
        const res = await apiRequest('POST', '/api/cmc/specifications', specCreateBody(v, projectId));
        const json = await res.json().catch(() => null);
        if (!res.ok) { fireToast('Couldn’t create the specification — ' + specErr(json, res.status) + '. Nothing was saved.', 'error'); return; }
        const adopted = specRowsFromApi([(json as { data?: QualitySpecApiRow })?.data].filter(Boolean) as QualitySpecApiRow[])[0];
        if (!adopted) { fireToast('Saved, but the server returned an unexpected shape — reload to see it.', 'error'); return; }
        setRows((rs) => [{ ...adopted, _new: true }, ...rs.filter((r) => r.id !== adopted.id)]);
        fireToast('Specification created · ' + adopted.attr + ' · ' + adopted.st);
      }
      setEdit(null);
    } catch (e) {
      fireToast('Couldn’t save the specification — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
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
        meaning: v.meaning,
        reauth: { password: v.password, totp: v.totp || undefined },
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401) { fireToast('Approval not signed — re-authentication failed. The specification was not approved.', 'error'); return; }
      if (!res.ok) { fireToast('Couldn’t approve the specification — ' + specErr(json, res.status) + '. Nothing was persisted.', 'error'); return; }
      const adopted = specRowsFromApi([(json as { data?: QualitySpecApiRow })?.data].filter(Boolean) as QualitySpecApiRow[])[0];
      setRows((rs) => rs.map((x) => x.id === target.id ? { ...(adopted ?? { ...x, st: 'approved' }), _new: true } : x));
      const chain = (json as { governance?: { sha256Chain?: string } })?.governance?.sha256Chain;
      fireToast('Specification "' + target.attr + '" approved and signed' + (chain ? ' · ' + String(chain).slice(0, 12) + '…' : '') + '.');
      setSign(null);
    } catch (e) {
      fireToast('Couldn’t approve the specification — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
    }
  };
  const noMethodCount = rows.filter((r) => r.noMethod).length;
  return (
    <div className="cm-body">
      <CmHead title="Specifications" meta="Release and shelf-life limits — drug substance and drug product" ask={ask} suggest={CMC_SUGGEST.specs}
        actions={<button className="nda-open" onClick={() => setEdit('new')} disabled={!projectId} title={!projectId ? 'Open a program to record specifications' : ''}>{I.plus} New specification</button>} />
      <CmCorrNotice prefixes={['3.2.S.4', '3.2.P.5', 'm3.2.S.4', 'm3.2.P.5']} noun="these specifications" />
      {noMethodCount > 0 && <div className="pj-con" style={{ marginBottom: 14 }}><span className="ico">{I.alertTriangle}</span><div><div className="pj-con-t">{noMethodCount} specification without a validated method</div><div className="pj-con-d">A specification cannot be approved until its analytical method is validated (ICH Q2). Add the method, or ask AnA to draft the validation justification.</div></div></div>}
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Specification table</span><span className="s">{rows.length} attributes</span></div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div style={{ padding: 12 }}>
              {!projectId ? (
                <EmptyState icon={I.clipboardList} title="Open a program to manage its specifications" hint="Release and shelf-life limits are recorded per project in the governed specifications file (§3.2.S.4.1 / §3.2.P.5.1). Open a program, then create or review its specifications here." />
              ) : live.loading ? (
                <EmptyState icon={I.clipboardList} title="Loading specifications…" busy />
              ) : live.error ? (
                <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load specifications" hint="The governed specifications file didn’t respond. Sign in to your tenant and retry." />
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
      {/* specification (the limit) -> method (how it is measured) -> QC test
          (the measurement actually performed against it) -> reference standard
          (what the measurement is reported against). */}
      <CmMethodLibrary />
      <CmQcTesting />
      <CmReferenceStandards />
      {/* The impurity file and the dissolution profile are both specification
          content: §3.2.S.3.2 / §3.2.P.5.5 set the impurity limits a release
          test is judged against, and §3.2.P.5 carries the dissolution
          criterion. */}
      <CmImpurityProfiles />
      <CmDissolutionProfiles />
      {edit && <C2CForm config={FORM(edit === 'new' ? null : edit)} onCancel={() => setEdit(null)} onSubmit={save} />}
      {sign && <C2CForm config={signForm(sign.attr + ' -- ' + sign.material)} onCancel={() => setSign(null)} onSubmit={doSign} />}
      <C2CToast msg={toast} />
    </div>
  );
}

/* ═══════════ Stability -- study register, pull-point results, shelf life ═══════════ */

/* ── Stability study (org-scoped GET /api/cmc/stability-studies -> { success, data }) ──
   useLiveRows unwraps the { success, data } envelope, so each row is the display
   object directly. This is the REAL, org-scoped stability register
   (shared/schema.ts stabilityStudies).

   ── What changed here ────────────────────────────────────────────────────────
   The register was read-only and the GET projected six columns, so the surface
   could describe a study and never its data — and the ICH Q1E shelf-life panel
   said, correctly, that it had no per-timepoint series to project from. It had
   none because nothing in the product could record one: `stability_data`,
   `time_points`, `test_parameters` and `shelf_life` are columns on this table
   that no screen ever wrote, and `start_date` (NOT NULL) could not cross the
   JSON boundary at all until the route learned to coerce an ISO string.

   So the series is now entered where the study lives: register a study with its
   pull schedule, record each pull-point result against it, and close it out with
   the shelf life the data support. The projection panel reports what is
   RECORDED — the measured series and how it sits against its acceptance
   criteria — and still refuses to extrapolate a shelf life the studies do not
   yet justify. An ICH Q1E regression over three primary batches is a statistical
   claim about a submission; it is not something to infer from one study's
   points, and a shelf-life number invented here would be the single most
   dangerous fabricated value in the product. */
interface StabilityStudyApiRow {
  id: number;
  studyTitle: string | null;
  productName: string;
  batchNumber?: string | null;
  strength?: string | null;
  scope?: string | null;
  climaticZone?: string | null;
  studyType: string | null;
  storageConditions: string[] | null;
  duration: number | null;
  testParameters?: string[] | null;
  timePoints?: string[] | null;
  stabilityData?: unknown;
  shelfLife?: string | null;
  notes?: string | null;
  status: string | null;
  startDate?: string | null;
  plannedEndDate?: string | null;
}

const STAB_STORAGE_LABEL: Record<string, string> = {
  LT: 'Long-term', ACC: 'Accelerated', INT: 'Intermediate', REF: 'Refrigerated', STR: 'Stress',
};
function stabStorage(codes: string[] | null): string {
  if (!Array.isArray(codes) || codes.length === 0) return '--';
  return codes.map((c) => STAB_STORAGE_LABEL[c] || c).join(', ');
}
function stabStatusTone(s: string | null): string {
  const v = String(s || '').toUpperCase();
  if (v === 'ACTIVE' || v === 'COMPLETED') return 'ok';
  if (v === 'PAUSED' || v === 'ON-HOLD') return 'warn';
  if (v === 'CANCELLED') return 'err';
  return 'dim';
}

/** The condition string a study was placed at, for labelling its results. */
function stabConditionText(codes: string[] | null | undefined): string | undefined {
  if (!Array.isArray(codes)) return undefined;
  const named = codes.find((c) => !STAB_STORAGE_LABEL[c]);
  return named || (codes[0] ? STAB_STORAGE_LABEL[codes[0]] : undefined);
}

/* ── ICH Q1E estimate (POST /api/cmc/stability-studies/:id/shelf-life) ──
   The estimator itself is `services/cmc/shelf-life.ts`: an ordinary
   least-squares fit of the attribute against time, solved to where the
   one-sided 95% confidence limit meets the specification limit. It is
   deterministic and tested, and it had no HTTP route in the CMC family until
   now — so the single calculation a stability programme exists to produce could
   not be reached from the product.

   Every field below can say "not estimable, and here is why": a parameter with
   too few numeric points, or with no recorded acceptance criterion for the
   confidence bound to intersect, is reported as such rather than dropped or
   given a default limit. */
interface Q1eEstimate {
  parameter: string;
  estimable: boolean;
  reason?: string;
  shelfLife?: number;
  specLimit?: number;
  direction?: 'increasing' | 'decreasing';
  pointsUsed?: number;
  pointsRecorded?: number;
  pointsUsable?: number;
  exceedsEvaluatedRange?: boolean;
  regression?: { slope: number; intercept: number; r2: number; residualSd: number; n: number; df: number };
  notes?: string[];
}
interface Q1eReport {
  basis: string;
  scopeLimit: string;
  maxTimeEvaluated: number;
  limitingParameter: string | null;
  supportedShelfLife: number | null;
  estimates: Q1eEstimate[];
}

/* ── Batch poolability (POST /api/cmc/stability-studies/poolability) ──
   The question a single-study fit cannot answer: may these batches be combined
   into ONE registered shelf life, or must the claim fall back to the shortest?
   ICH Q1E answers it with two sequential ANCOVA F-tests at α = 0.25 — equality
   of slopes, then, only if that passes, equality of intercepts.

   The engine (`services/cmc/shelf-life-poolability.ts`) was reachable only as
   an AnA tool taking hand-typed numbers, so the decision could not be run
   against the studies of record.

   Like the single-study fit, every field can say "not assessable, and why":
   batches that disagree on the acceptance criterion, an attribute only one
   batch recorded, a batch with too few numeric points. Each is named. */
interface AncovaTest {
  f: number;
  pValue: number;
  poolable: boolean;
  dfNumerator: number;
  dfDenominator: number;
}
interface PoolAssessment {
  parameter: string;
  assessable: boolean;
  reason?: string;
  specLimit?: number;
  direction?: 'increasing' | 'decreasing';
  contributingBatches?: string[];
  excludedBatches?: Array<{ batchId: string; reason: string }>;
  conflictingCriteria?: Array<{ batchId: string; limit: number; direction: string }>;
  slopeTest?: AncovaTest;
  interceptTest?: AncovaTest | null;
  poolable?: boolean;
  decision?: 'pooled' | 'minimum-of-batches';
  shelfLife?: number;
  perBatchShelfLives?: Array<{ batchId: string; shelfLife: number; exceedsEvaluatedRange: boolean }>;
  pooledShelfLife?: number | null;
  notes?: string[];
}
interface PoolReport {
  basis: string;
  scopeLimit: string;
  storageCondition: string | null;
  batches: string[];
  limitingParameter: string | null;
  supportedShelfLife: number | null;
  limitingDecision: string | null;
  assessments: PoolAssessment[];
}

/** An F-test rendered as what it decided, with the statistic kept visible. */
function AncovaCell({ test }: { test: AncovaTest | null | undefined }) {
  if (!test) return <span className="cm-meta">not reached</span>;
  return (
    <>
      <span className={'rd-chip tone-' + (test.poolable ? 'ok' : 'err')}>
        {test.poolable ? 'equal' : 'differ'}
      </span>
      <div className="cm-meta">
        F({test.dfNumerator},{test.dfDenominator}) = {test.f} · p = {test.pValue}
      </div>
    </>
  );
}

/** Sort pull points numerically — '12' must follow '9', not precede it. */
function byTimePoint(a: StabilityResult, b: StabilityResult): number {
  const na = parseFloat(a.timePoint);
  const nb = parseFloat(b.timePoint);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(a.timePoint).localeCompare(String(b.timePoint));
}

function CmStability({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  const projectId = cmcProjectUuid();
  const live = useLiveRows<StabilityStudyApiRow>('/api/cmc/stability-studies');
  const [rows, setRows] = useState<StabilityStudyApiRow[]>([]);
  const seededRef = useRef<StabilityStudyApiRow[] | null>(null);
  useEffect(() => {
    if (live.loading || live.error) return;
    if (live.rows !== seededRef.current) {
      seededRef.current = live.rows;
      setRows(live.rows);
    }
  }, [live.loading, live.error, live.rows]);

  const [registering, setRegistering] = useState(false);
  const [recording, setRecording] = useState<StabilityStudyApiRow | null>(null);
  const [closing, setClosing] = useState<StabilityStudyApiRow | null>(null);
  /* ICH Q1E estimates, keyed by study. Held per study rather than globally
     because the estimate belongs to the batch and condition it was fitted from —
     a shelf life is not a property of the programme. */
  const [q1e, setQ1e] = useState<Record<number, Q1eReport>>({});
  const [estimating, setEstimating] = useState<number | null>(null);
  /* Poolability is a property of a SET of batches, so unlike the per-study fit
     there is one selection and one result at a time. */
  const [poolPick, setPoolPick] = useState<number[]>([]);
  const [pool, setPool] = useState<PoolReport | null>(null);
  const [pooling, setPooling] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [toast, fireToast] = useToast();
  const { user } = useAuth();
  const recordedBy = user?.displayName || user?.email || undefined;

  const active = rows.filter((r) => String(r.status || '').toUpperCase() === 'ACTIVE').length;

  /* Every recorded result across the programme, and the ones that fell outside
     their acceptance criteria — the number a stability coordinator is actually
     tracking, computed from the recorded series and nothing else. */
  const allResults = rows.flatMap((r) => readStabilityResults(r.stabilityData));
  const oos = allResults.filter((r) => !r.withinSpecification);

  /** Adopt the server's row after a write; never the values that were typed. */
  const adopt = (json: unknown): StabilityStudyApiRow | null => {
    const row = (json as { data?: StabilityStudyApiRow } | null)?.data;
    return row && typeof row === 'object' ? row : null;
  };

  const registerStudy = async (v: Record<string, string>) => {
    try {
      const res = await apiRequest('POST', '/api/cmc/stability-studies', stabilityBody(v, projectId));
      const json = await res.json().catch(() => null);
      if (!res.ok) { fireToast(cmcWriteFailed('stability study', json, res.status), 'error'); return; }
      const row = adopt(json);
      if (!row) { fireToast('Saved, but the server returned an unexpected shape — reload to see it.', 'error'); return; }
      setRows((rs) => [row, ...rs]);
      setRegistering(false);
      fireToast(`Study registered · ${row.studyTitle || row.productName} · batch ${row.batchNumber || '--'}.`);
    } catch (e) {
      fireToast(cmcWriteThrew('stability study', e), 'error');
    }
  };

  const recordResult = async (v: Record<string, string>) => {
    if (!recording) return;
    const study = recording;
    try {
      // The existing series is read from the study and the new point appended,
      // so a pull recorded today never overwrites the pulls before it.
      const body = stabilityResultBody(v, study.stabilityData, {
        condition: stabConditionText(study.storageConditions),
        recordedBy,
      });
      const res = await apiRequest('PUT', '/api/cmc/stability-studies/' + study.id, {
        ...body,
        ...(projectId ? { projectId } : {}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { fireToast(cmcWriteFailed('stability result', json, res.status), 'error'); return; }
      const row = adopt(json);
      if (!row) { fireToast('Saved, but the server returned an unexpected shape — reload to see it.', 'error'); return; }
      setRows((rs) => rs.map((r) => (r.id === study.id ? row : r)));
      setRecording(null);
      setExpanded(study.id);
      const within = v.withinSpecification !== 'no';
      fireToast(
        `${v.parameter} at ${v.timePoint} months recorded: ${v.result}` +
          (within ? '.' : ' — OUTSIDE the acceptance criteria. Raise this through your OOS procedure.'),
      );
    } catch (e) {
      fireToast(cmcWriteThrew('stability result', e), 'error');
    }
  };

  /**
   * Run the ICH Q1E fit over what this study has actually recorded.
   *
   * The result is EVIDENCE, not a claim: it is never written to the study's
   * `shelf_life` column. That column holds the shelf life the organisation
   * claims, which is a regulatory decision a person makes on the close-out form
   * after reading this.
   */
  const estimateQ1e = async (study: StabilityStudyApiRow) => {
    if (estimating != null) return;
    setEstimating(study.id);
    try {
      const res = await apiRequest('POST', '/api/cmc/stability-studies/' + study.id + '/shelf-life', {});
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        fireToast(cmcWriteError(json, res.status), 'error');
        return;
      }
      const report = (json as { data?: Q1eReport })?.data;
      if (!report) { fireToast('The estimate returned an unexpected shape — reload and retry.', 'error'); return; }
      setQ1e((m) => ({ ...m, [study.id]: report }));
      const notEstimable = report.estimates.filter((e) => !e.estimable).length;
      fireToast(
        report.supportedShelfLife != null
          ? `Q1E: ${report.supportedShelfLife} months supported, limited by ${report.limitingParameter}` +
            (notEstimable ? ` · ${notEstimable} parameter${notEstimable === 1 ? '' : 's'} not estimable` : '') + '.'
          : 'Q1E could not estimate any parameter on this study — see the reason against each below.',
        report.supportedShelfLife != null ? 'ok' : 'error',
      );
    } catch (e) {
      fireToast(cmcWriteThrew('shelf-life estimate', e), 'error');
    } finally {
      setEstimating(null);
    }
  };

  /**
   * Run the ICH Q1E combinability test across the selected batches.
   *
   * Like the single-study fit this is EVIDENCE. A "pooled" verdict does not set
   * a shelf life; it establishes that one figure may be claimed for all the
   * batches rather than the shortest. The claim is still made on the close-out.
   *
   * The server owns every eligibility rule (one product, one storage condition,
   * distinct batches) and returns the reason it refused. Those rules are not
   * re-implemented here — a client copy would drift, and the copy that drifts
   * is the one that lets an invalid assessment through.
   */
  const assessPoolability = async () => {
    if (pooling || poolPick.length < 2) return;
    setPooling(true);
    try {
      const res = await apiRequest('POST', '/api/cmc/stability-studies/poolability', {
        studyIds: poolPick,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setPool(null);
        fireToast(cmcWriteError(json, res.status), 'error');
        return;
      }
      const report = (json as { data?: PoolReport })?.data;
      if (!report) { fireToast('The assessment returned an unexpected shape — reload and retry.', 'error'); return; }
      setPool(report);
      const notAssessable = report.assessments.filter((a) => !a.assessable).length;
      fireToast(
        report.supportedShelfLife != null
          ? `${report.limitingDecision === 'pooled' ? 'Batches are combinable' : 'Batches are not combinable'} — ${report.supportedShelfLife} months supported, limited by ${report.limitingParameter}` +
            (notAssessable ? ` · ${notAssessable} attribute${notAssessable === 1 ? '' : 's'} not assessable` : '') + '.'
          : 'No attribute could be assessed across these batches — see the reason against each below.',
        report.supportedShelfLife != null ? 'ok' : 'error',
      );
    } catch (e) {
      fireToast(cmcWriteThrew('poolability assessment', e), 'error');
    } finally {
      setPooling(false);
    }
  };

  const closeOut = async (v: Record<string, string>) => {
    if (!closing) return;
    const study = closing;
    try {
      const res = await apiRequest('PUT', '/api/cmc/stability-studies/' + study.id, {
        ...stabilityCloseoutBody(v),
        ...(projectId ? { projectId } : {}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { fireToast(cmcWriteFailed('shelf life', json, res.status), 'error'); return; }
      const row = adopt(json);
      if (!row) { fireToast('Saved, but the server returned an unexpected shape — reload to see it.', 'error'); return; }
      setRows((rs) => rs.map((r) => (r.id === study.id ? row : r)));
      setClosing(null);
      fireToast(`Shelf life recorded for ${row.studyTitle || row.productName}: ${row.shelfLife}.`);
    } catch (e) {
      fireToast(cmcWriteThrew('shelf life', e), 'error');
    }
  };

  return (
    <div className="cm-body">
      <CmHead
        title="Stability program"
        meta="ICH Q1A(R2) / Q1E — long-term, intermediate, accelerated and stress studies"
        ask={ask}
        suggest={CMC_SUGGEST.stability}
        actions={<button className="nda-open" onClick={() => setRegistering(true)}>{I.plus} Register study</button>}
      />
      <CmCorrNotice prefixes={['3.2.S.7', '3.2.P.8', 'm3.2.S.7', 'm3.2.P.8']} noun="the stability program" />
      <div className="cm-kpis">
        {/* Two tiles, not six. "Studies", "Long-term" and "Accelerated" were
            classification counts nobody acts on — the register below is sorted
            and filterable and answers them better. "Results recorded" is a
            volume metric, and the shelf-life evidence card already states it in
            context. What is left is the pair a stability coordinator actually
            decides on: how much is running, and how much is out of limits. */}
        <Kpi l="Active studies" v={active} tone={active ? 'ok' : undefined} />
        <Kpi l="Outside limits" v={oos.length} tone={oos.length ? 'err' : 'ok'} />
      </div>
      {oos.length > 0 && (
        <div className="pj-con" style={{ marginBottom: 14 }}>
          <span className="ico">{I.alertTriangle}</span>
          <div>
            <div className="pj-con-t">{oos.length} stability {oos.length === 1 ? 'result is' : 'results are'} outside the acceptance criteria</div>
            <div className="pj-con-d">
              {oos.slice(0, 3).map((r) => `${r.parameter} at ${r.timePoint} mo (${r.result})`).join(', ')}
              {oos.length > 3 ? ` and ${oos.length - 3} more` : ''}. A result outside its limit is an OOS event before it is a shelf-life question — it belongs in your OOS procedure, and it constrains what §3.2.S.7 / §3.2.P.8 can claim.
            </div>
          </div>
        </div>
      )}
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Stability register</span>
          {/* The register table carries no project column — it is the
              ORGANIZATION's study register by design, while §3.2.S.7/P.8
              compose from the project-scoped canonical layer the write-through
              feeds. Say which scope this list is, so this tab and the build
              tab cannot appear to disagree about what "this project's
              stability" contains. */}
          <span className="s">
            {rows.length} studies — ICH Q1A(R2) · organization-wide register
            {projectId
              ? ' — new results are linked to the open program'
              : ' — open a program to link new results to its Module 3'}
          </span>
        </div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div style={{ padding: 12 }}>
              {live.loading ? (
                <EmptyState icon={I.barChart} title="Loading stability studies…" busy />
              ) : live.error ? (
                <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load stability studies" hint="The org-scoped stability register didn’t respond. Sign in to your tenant and retry." />
              ) : (
                <EmptyState icon={I.barChart} title="No stability studies yet" hint="Register a study with the batch it is run on, the ICH condition it is placed at and its pull schedule. Each pull-point result you then record against it is the evidence §3.2.S.7 / §3.2.P.8 is written from." />
              )}
            </div>
          ) : (
            <table className="reg-tbl">
              <thead>
                <tr>
                  <th>Study</th><th>Product</th><th>Batch</th><th>Scope</th><th>Type</th>
                  <th>Storage</th><th>Duration</th><th>Results</th><th>Shelf life</th><th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const results = readStabilityResults(r.stabilityData);
                  const failing = results.filter((x) => !x.withinSpecification).length;
                  const isOpen = expanded === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr>
                        <td style={{ fontWeight: 600 }}>{r.studyTitle || <span className="cm-meta">Untitled study</span>}</td>
                        <td>{r.productName}</td>
                        <td className="mono">{r.batchNumber || '--'}</td>
                        <td>{r.scope === 'DS' ? '§3.2.S.7' : '§3.2.P.8'}</td>
                        <td>{r.studyType || '--'}</td>
                        <td>{stabStorage(r.storageConditions)}</td>
                        <td>{r.duration != null ? r.duration + ' mo' : '--'}</td>
                        <td>
                          {results.length === 0 ? (
                            <span className="cm-meta">none</span>
                          ) : (
                            <button className="cm-linkish" onClick={() => setExpanded(isOpen ? null : r.id)}>
                              {results.length} recorded{failing ? <span className="sp-tone-warn"> · {failing} OOS</span> : null}
                            </button>
                          )}
                        </td>
                        <td>{r.shelfLife || <span className="cm-meta">not set</span>}</td>
                        <td><span className={'rd-chip tone-' + stabStatusTone(r.status)}>{r.status || 'draft'}</span></td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="nda-open" onClick={() => setRecording(r)}>{I.plus} Result</button>
                          <button
                            className="nda-open"
                            style={{ marginLeft: 6 }}
                            onClick={() => void estimateQ1e(r)}
                            disabled={estimating != null || results.length === 0}
                            title={results.length === 0 ? 'Record pull-point results first — there is nothing to fit' : 'Fit ICH Q1E over this study’s recorded results'}
                          >
                            {I.sigma} {estimating === r.id ? 'Fitting…' : 'Estimate Q1E'}
                          </button>
                          <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => setClosing(r)}>{I.checkCircle} Shelf life</button>
                        </td>
                      </tr>
                      {isOpen && results.length > 0 && (
                        <tr>
                          <td colSpan={11} style={{ background: 'var(--bg-050)' }}>
                            <table className="reg-tbl cm-subtable">
                              <thead>
                                <tr><th>Pull (months)</th><th>Parameter</th><th>Result</th><th>Specification</th><th>Within limits</th><th>Tested</th><th>Recorded by</th></tr>
                              </thead>
                              <tbody>
                                {[...results].sort(byTimePoint).map((x, i) => (
                                  <tr key={i}>
                                    <td className="mono">{x.timePoint}</td>
                                    <td>{x.parameter}</td>
                                    <td style={{ fontWeight: 600 }}>{x.result}</td>
                                    <td>{x.specification || '--'}</td>
                                    <td>
                                      <span className={'rd-chip tone-' + (x.withinSpecification ? 'ok' : 'err')}>
                                        {x.withinSpecification ? 'within' : 'OOS'}
                                      </span>
                                    </td>
                                    <td>{x.testedOn ? new Date(x.testedOn).toLocaleDateString() : '--'}</td>
                                    <td>{x.recordedBy || '--'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {rows.length > 0 && <div className="pj-card-b" style={{ paddingTop: 0 }}><CmPush label={'Stability register -> §3.2.S.7'} nav={nav} bar /></div>}
      </div>
      <div className="pj-card" style={{ marginTop: 16 }}>
        <div className="pj-card-h"><span className="t">Shelf-life evidence</span><span className="s">ICH Q1E</span></div>
        <div className="pj-card-b">
          {allResults.length === 0 ? (
            <EmptyState
              icon={I.barChart}
              title="No pull-point results recorded yet"
              hint="Record results against a registered study and they are summarised here as the evidence behind a shelf-life claim."
            />
          ) : (
            <>
              <div className="cm-meta" style={{ marginBottom: 10 }}>
                {allResults.length} {allResults.length === 1 ? 'result' : 'results'} across {rows.filter((r) => readStabilityResults(r.stabilityData).length > 0).length} {rows.filter((r) => readStabilityResults(r.stabilityData).length > 0).length === 1 ? 'study' : 'studies'} ·
                {' '}{allResults.length - oos.length} within acceptance criteria, {oos.length} outside ·
                {' '}longest pull point recorded: {Math.max(...allResults.map((r) => parseFloat(r.timePoint) || 0))} months
              </div>
              <table className="reg-tbl">
                <thead><tr><th>Pool</th><th>Study</th><th>Batch</th><th>Condition</th><th>Longest pull</th><th>Within limits</th><th>Q1E estimate</th><th>Recorded shelf life</th></tr></thead>
                <tbody>
                  {rows.filter((r) => readStabilityResults(r.stabilityData).length > 0).map((r) => {
                    const res = readStabilityResults(r.stabilityData);
                    const longest = Math.max(...res.map((x) => parseFloat(x.timePoint) || 0));
                    const bad = res.filter((x) => !x.withinSpecification).length;
                    const fit = q1e[r.id];
                    return (
                      <tr key={r.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={poolPick.includes(r.id)}
                            aria-label={`Include ${r.studyTitle || r.productName}${r.batchNumber ? ` (batch ${r.batchNumber})` : ''} in the poolability assessment`}
                            onChange={(e) =>
                              setPoolPick((p) => (e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id)))
                            }
                          />
                        </td>
                        <td style={{ fontWeight: 600 }}>{r.studyTitle || r.productName}</td>
                        <td>{r.batchNumber || <span className="cm-meta">--</span>}</td>
                        <td>{stabConditionText(r.storageConditions) || '--'}</td>
                        <td>{longest} mo</td>
                        <td><span className={'rd-chip tone-' + (bad ? 'err' : 'ok')}>{res.length - bad}/{res.length}</span></td>
                        <td>
                          {!fit ? (
                            <span className="cm-meta">not run</span>
                          ) : fit.supportedShelfLife == null ? (
                            <span className="sp-tone-warn">not estimable</span>
                          ) : (
                            <>
                              <b>{fit.supportedShelfLife} mo</b>
                              <div className="cm-meta">limited by {fit.limitingParameter}</div>
                            </>
                          )}
                        </td>
                        <td>{r.shelfLife || <span className="cm-meta">not set</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Per-parameter detail for every study that has been fitted —
                  including, explicitly, the parameters that could NOT be fitted
                  and the reason each one could not. A Q1E table that silently
                  omits the attributes it failed on reads as a cleaner result
                  than the data support. */}
              {rows.filter((r) => q1e[r.id]).map((r) => {
                const fit = q1e[r.id];
                return (
                  <div key={r.id} style={{ marginTop: 14 }}>
                    <div className="cm-sub-head">
                      ICH Q1E — {r.studyTitle || r.productName} · batch {r.batchNumber || '--'}
                    </div>
                    <table className="reg-tbl cm-subtable">
                      <thead>
                        <tr><th>Parameter</th><th>Estimate</th><th>Spec limit</th><th>Trend</th><th>Points</th><th>R²</th><th>Detail</th></tr>
                      </thead>
                      <tbody>
                        {fit.estimates.map((e, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{e.parameter}</td>
                            <td>
                              {e.estimable ? (
                                <>
                                  <b>{e.shelfLife} mo</b>
                                  {e.exceedsEvaluatedRange && (
                                    <div className="cm-meta">stays within spec across the whole {fit.maxTimeEvaluated}-month search</div>
                                  )}
                                </>
                              ) : (
                                <span className="sp-tone-warn">not estimable</span>
                              )}
                            </td>
                            <td>{e.estimable ? e.specLimit : '--'}</td>
                            <td>{e.estimable ? e.direction : '--'}</td>
                            <td>{e.estimable ? e.pointsUsed : `${e.pointsUsable ?? 0}/${e.pointsRecorded ?? 0}`}</td>
                            <td>{e.regression ? e.regression.r2 : '--'}</td>
                            <td className="cm-meta">{e.estimable ? (e.notes ?? []).join(' ') : e.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="cm-meta">{fit.basis}. {fit.scopeLimit}</div>
                  </div>
                );
              })}

              {/* ── Batch poolability ──
                  Sits under the same table its selection is made in, because
                  the decision to pool is made while reading the per-study fits,
                  not on a separate screen. */}
              <div className="cm-sub-head" style={{ marginTop: 18 }}>Batch poolability — ICH Q1E ANCOVA</div>
              <div className="cm-meta" style={{ marginBottom: 8 }}>
                Tick two or more batches of the same product at the same storage condition, then
                assess whether they may be combined into one shelf-life claim. If the slopes or
                intercepts differ, the claim falls back to the shortest batch.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className="nda-open"
                  disabled={poolPick.length < 2 || pooling}
                  onClick={assessPoolability}
                  title={poolPick.length < 2 ? 'Select at least two batches' : 'Run the ICH Q1E combinability test'}
                >
                  {I.sigma} {pooling ? 'Assessing…' : 'Assess poolability'}
                </button>
                <span className="cm-meta">
                  {poolPick.length === 0
                    ? 'No batches selected.'
                    : `${poolPick.length} batch${poolPick.length === 1 ? '' : 'es'} selected${poolPick.length < 2 ? ' — poolability compares batches, so it needs at least two' : ''}.`}
                </span>
                {poolPick.length > 0 && (
                  <button className="cm-linkish" onClick={() => { setPoolPick([]); setPool(null); }}>
                    Clear selection
                  </button>
                )}
              </div>

              {pool && (
                <div style={{ marginTop: 14 }}>
                  <div className="cm-meta" style={{ marginBottom: 8 }}>
                    {pool.batches.join(', ')} · {pool.storageCondition || 'condition not recorded'} ·
                    {' '}{pool.supportedShelfLife != null
                      ? <>supported shelf life <b>{pool.supportedShelfLife} months</b>, limited by {pool.limitingParameter} ({pool.limitingDecision === 'pooled' ? 'pooled' : 'shortest batch'})</>
                      : <>no attribute could be assessed</>}
                  </div>
                  <table className="reg-tbl cm-subtable">
                    <thead>
                      <tr>
                        <th>Parameter</th><th>Slopes</th><th>Intercepts</th><th>Decision</th>
                        <th>Shelf life</th><th>Batches</th><th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pool.assessments.map((a, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{a.parameter}</td>
                          <td>{a.assessable ? <AncovaCell test={a.slopeTest} /> : <span className="cm-meta">--</span>}</td>
                          <td>{a.assessable ? <AncovaCell test={a.interceptTest} /> : <span className="cm-meta">--</span>}</td>
                          <td>
                            {!a.assessable ? (
                              <span className="sp-tone-warn">not assessable</span>
                            ) : (
                              <span className={'rd-chip tone-' + (a.decision === 'pooled' ? 'ok' : 'warn')}>
                                {a.decision === 'pooled' ? 'combinable' : 'shortest batch'}
                              </span>
                            )}
                          </td>
                          <td>
                            {a.assessable ? (
                              <>
                                <b>{a.shelfLife} mo</b>
                                {a.decision === 'minimum-of-batches' && a.perBatchShelfLives && (
                                  <div className="cm-meta">
                                    per batch: {a.perBatchShelfLives.map((p) => `${p.batchId} ${p.shelfLife}`).join(', ')} mo
                                  </div>
                                )}
                              </>
                            ) : '--'}
                          </td>
                          <td className="cm-meta">
                            {(a.contributingBatches ?? []).join(', ') || '--'}
                            {(a.excludedBatches ?? []).length > 0 && (
                              <div>
                                excluded: {a.excludedBatches!.map((e) => `${e.batchId} (${e.reason})`).join('; ')}
                              </div>
                            )}
                          </td>
                          <td className="cm-meta">
                            {a.assessable
                              ? (a.notes ?? []).join(' ')
                              : <>
                                  {a.reason}
                                  {(a.conflictingCriteria ?? []).length > 0 && (
                                    <div>
                                      {a.conflictingCriteria!.map((c) => `${c.batchId}: ${c.direction === 'increasing' ? '≤' : '≥'} ${c.limit}`).join(' vs ')}
                                    </div>
                                  )}
                                </>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="cm-meta">{pool.basis}. {pool.scopeLimit}</div>
                </div>
              )}

              <div className="cm-meta" style={{ marginTop: 10 }}>
                Both figures are <b>evidence, not a claim</b>: they are computed from the recorded
                results and are never written to a study’s shelf life. Setting the shelf life the
                organisation stands behind is a regulatory decision made on the close-out form.
              </div>
            </>
          )}
        </div>
        <div className="pj-card-b" style={{ paddingTop: 0 }}><CmPush label={'§3.2.S.7 stability summary'} nav={nav} bar /></div>
      </div>
      {registering && <C2CForm config={stabilityForm()} onCancel={() => setRegistering(false)} onSubmit={registerStudy} />}
      {recording && (
        <C2CForm
          config={stabilityResultForm({ timePoints: recording.timePoints, testParameters: recording.testParameters })}
          onCancel={() => setRecording(null)}
          onSubmit={recordResult}
        />
      )}
      {closing && (
        <C2CForm
          config={stabilityCloseoutForm({ shelfLife: closing.shelfLife })}
          onCancel={() => setClosing(null)}
          onSubmit={closeOut}
        />
      )}
      <C2CToast msg={toast} />
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
  const projectId = cmcProjectUuid();
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
    if (!projectId) { fireToast('Open a program first — batch records are logged per project.', 'error'); return; }
    try {
      const res = await apiRequest('POST', '/api/cmc/batch-records', batchCreateBody(v, projectId));
      const json = await res.json().catch(() => null);
      if (!res.ok) { fireToast('Couldn’t log the batch — ' + specErr(json, res.status) + '. Nothing was saved.', 'error'); return; }
      const adopted = batchRowsFromApi([(json as { data?: BatchApiRow })?.data].filter(Boolean) as BatchApiRow[])[0];
      if (!adopted) { fireToast('Saved, but the server returned an unexpected shape — reload to see it.', 'error'); return; }
      setRows((rs) => [{ ...adopted, _new: true }, ...rs.filter((r) => r.dbId !== adopted.dbId)]);
      setForm(false);
      fireToast('Batch ' + adopted.id + ' logged · ' + adopted.st);
    } catch (e) {
      fireToast('Couldn’t log the batch — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
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
    if (target.dbId == null) { fireToast('This batch isn’t in the governed file yet — reload before releasing it.', 'error'); return; }
    try {
      const res = await apiRequest('POST', '/api/cmc/batch-records/' + target.dbId + '/release', batchReleaseBody(v, releasedByName));
      const json = await res.json().catch(() => null);
      if (res.status === 401) { fireToast('Release not signed — re-authentication failed. The batch was not released.', 'error'); return; }
      if (!res.ok) { fireToast('Couldn’t release the batch — ' + specErr(json, res.status) + '. Nothing was persisted.', 'error'); return; }
      const adopted = batchRowsFromApi([(json as { data?: BatchApiRow })?.data].filter(Boolean) as BatchApiRow[])[0];
      setRows((rs) => rs.map((x) => x.dbId === target.dbId ? { ...(adopted ?? { ...x, st: 'released' }), _new: true } : x));
      const chain = (json as { governance?: { sha256Chain?: string } })?.governance?.sha256Chain;
      fireToast('Batch ' + target.id + ' ' + (adopted?.st ?? 'released') + (chain ? ' · signed ' + String(chain).slice(0, 12) + '…' : '') + '.');
      setReleasing(null);
    } catch (e) {
      fireToast('Couldn’t release the batch — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
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
                <EmptyState icon={I.grid} title="Loading batch records…" busy />
              ) : live.error ? (
                <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load batch records" hint="The governed batch file didn’t respond. Sign in to your tenant and retry." />
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
      {/* Batch records are the process as run; process validation is the
          evidence that the process is capable of running that way. */}
      <CmProcessValidation />
      {form && <C2CForm config={{ eyebrow: 'Batch — new', title: 'Log a batch record', sub: 'Recorded to the governed batch file for this program', submitLabel: 'Log batch', fields: [
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

export function CmChange({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  const [type, setType] = useState('api_supplier_change');
  const [markets, setMarkets] = useState(['fda', 'ema']);
  const [desc, setDesc] = useState('');
  const [result, setResult] = useState<CmcChangeResult | null>(null);
  const [toast, fireToast] = useToast();
  const toggle = (id: string) => setMarkets((m) => m.includes(id) ? m.filter((x) => x !== id) : [...m, id]);
  const ct = CMC_CHANGE_TYPES.find((c) => c.id === type)!;
  const simulate = () => { if (!desc.trim() || !markets.length) return; setResult({ type: ct, markets: [...markets], desc: desc.trim(), paths: markets.map((m) => ({ m, label: CMC_MARKETS.find((x) => x[0] === m)![1], path: filingPath(type, ct.risk, m) })) }); };
  const riskTone = ct.risk === 'high' ? 'err' : ct.risk === 'med' ? 'warn' : 'ok';
  /* The sections the SIMULATED change refiles — keyed by the result's own type,
     not the select's current value, so the signpost describes the assessment on
     screen even after the form moves on. */
  const collides = result ? SECTIONS_FOR_CHANGE[result.type.id] ?? [] : [];

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
      if (!res.ok) { fireToast(res.message, 'error'); return; }
      if (nav) nav('document-authoring');
      else fireToast(res.message);
    } finally {
      openingRef.current = false; setOpening(false);
    }
  };

  return (
    <div className="cm-body">
      <CmHead title="Change control" meta="Model a CMC change -> filing path across markets — SUPAC / ICH Q12" ask={ask} suggest={CMC_SUGGEST.change} />
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
      <CmChangeRegister />
      {/* A change of consequence carries a comparability obligation (ICH Q5E),
          so the assessments raised against those changes sit with them. */}
      <CmComparabilityStudies />
      {result && (
        <div className="cm-change-out">
          {/* A change colliding with an open agency question is exactly what a
              regulatory lead must see before implementing: the sections this
              change refiles are the sections the agency is already asking
              about, and refiling under an open question is a decision to make,
              not an accident to discover. Same signpost, same rules as the
              Specifications and Stability tabs — presence only; on a failed
              read the Program-records card reports the failure. */}
          {collides.length > 0 && (
            <CmCorrNotice prefixes={collides} noun="the sections this change refiles" />
          )}
          <div className="cm-doc">
            <div className="cm-doc-bar">
              <div><span className="cm-doc-kind">Regulatory Change Impact Assessment</span><span className="cm-doc-prov">SUPAC — ICH Q12 — draft</span></div>
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
      {/* The market matrix over these same changes — one screen, because "what
          did I change" and "what does each market require for it" is one
          question. */}
      <CmGlobal nav={nav} />
      <C2CToast msg={toast} />
    </div>
  );
}

/* ═══════════ Substance & product -- Global matrix -- Program records ═══════════ */

/**
 * §3.2.S and §3.2.P — the substance and the product, and the two registers whose
 * evidence each section's control depends on.
 *
 * These were two separate tabs, each a wrapper over one register plus a push
 * bar. They are one destination because they are one question a formulation or
 * substance scientist works through together, and because Specifications
 * already establishes the pattern of a tab carrying more than one register.
 * Nothing was removed: all four registers below are the same components bound to
 * the same endpoints.
 */
function CmMaterials({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  return (
    <div className="cm-body">
      <CmHead
        title="Substance & product"
        meta="CTD §3.2.S / §3.2.P — the active substance and the finished product, their manufacture and control"
        ask={ask}
        suggest={CMC_SUGGEST.materials}
      />
      <div className="cm-sub-head">Drug substance — §3.2.S</div>
      <CmDrugSubstances />
      {/* The method library sits with the substance because §3.2.S.4.2 is the
          analytical procedures section: the substance's control depends on it. */}
      <CmMethodLibrary />
      {/* What the substance IS (§3.2.S.3.1) and how it is MADE (§3.2.S.2.2).
          Both sections have been demanded by the composer since it was written
          and had no producer: characterisation had no table at all, and the
          process wrote into a table the compliance checker read and no screen
          filled. Each row states which side of the dossier it files under, so
          one register serves the drug product's §3.2.P.3.3 too. */}
      <CmCharacterizationStudies />
      <CmManufacturingProcesses />

      <div className="cm-sub-head">Drug product — §3.2.P</div>
      <CmDrugProducts />
      {/* Process validation is the §3.2.P.3.5 evidence that the product's
          process does what its description says. */}
      <CmProcessValidation />

      {/* The formulation IS the product's composition (§3.2.P.1), and the
          materials are what it is made of and what each is controlled to
          (§3.2.P.4 for an excipient, §3.2.S.2.3 for a raw material). */}
      <CmFormulationRecords />
      <CmMaterialSpecs />

      <div className="cm-sub-head">Container closure — §3.2.S.6 / §3.2.P.7</div>
      {/* The system that holds the material, and the extractables/leachables
          package behind it. Both sections composed from nothing until this
          register existed; each row states which of the two it files under. */}
      <CmContainerClosures />

      <div className="pj-card" style={{ marginTop: 16 }}>
        <div className="pj-card-b" style={{ paddingTop: 4 }}>
          <CmPush label={'Substance & product data -> §3.2.S / §3.2.P'} nav={nav} bar />
        </div>
      </div>
    </div>
  );
}

/* ═══════════ Global filings ═══════════
   COMPUTED, not fabricated. The former fixture here (CMC_GLOBAL) invented a
   per-region readiness percentage and a gap list; it was rightly deleted, and
   the tab has been an honest empty ever since because no backend reports
   regional readiness.

   What CAN be answered honestly is the question this tab is actually for: for
   every change already under control, what does each market require? That is
   the same deterministic SUPAC / ICH Q12 / Reg. 1234/2008 rule set the change
   simulator runs, applied to the REAL change-control register instead of to a
   hypothetical. Nothing is projected: a change with no assessed risk level is
   shown as unassessed rather than defaulted into a category, and the filing
   category already recorded on the change is shown next to what the rules say,
   so a disagreement between the two is visible instead of hidden. */

/**
 * What each market requires for the changes already under control.
 *
 * This was its own tab, and it owned no object: it reads the SAME
 * change-control register the tab above it reads and reruns the SAME
 * deterministic rule set the change simulator runs. A market matrix about a set
 * of changes belongs beside those changes, not one navigation step away from
 * them — so it renders inside Change control now. Every column, every market and
 * the comparability register that travelled with it are unchanged; only the
 * heading it used to carry as a destination is gone.
 */
function CmGlobal({ nav }: { nav?: (id: string) => void }) {
  const live = useLiveRows<ChangeControlApiRow>('/api/cmc/change-control');
  const CLOSED = ['implemented', 'closed', 'rejected'];
  const open = live.rows.filter((r) => !CLOSED.includes(String(r.status || '').toLowerCase()));

  return (
    <>
      <div className="cm-sub-head">Filing path by market — SUPAC / ICH Q12 / Reg. 1234-2008</div>
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Filing path by market</span>
          <span className="s">{open.length} open {open.length === 1 ? 'change' : 'changes'} -- {CMC_MARKETS.length} markets</span>
        </div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {open.length === 0 ? (
            <div style={{ padding: 12 }}>
              {live.loading ? (
                <EmptyState icon={I.globe} title="Loading the change register…" busy />
              ) : live.error ? (
                <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load the change register" hint="The change register didn’t respond, so the per-market filing paths cannot be computed. Sign in to your tenant and retry." />
              ) : (
                <EmptyState
                  icon={I.globe}
                  title="No open changes to file"
                  hint="Raise a change in Change control and its reporting category in every market is computed here from the same rules the simulator uses. Nothing is projected for a change that does not exist."
                />
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="reg-tbl">
                <thead>
                  <tr>
                    <th>Change</th><th>Type</th><th>Risk</th><th>Recorded filing</th>
                    {CMC_MARKETS.map(([id, label]) => <th key={id}>{label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {open.map((c) => {
                    const risk = String(c.riskAssessment?.level ?? '').toLowerCase();
                    const modelled = risk === 'high' ? 'high' : risk === 'medium' || risk === 'med' ? 'med' : risk === 'low' ? 'low' : null;
                    return (
                      <tr key={c.id}>
                        <td className="mono" style={{ fontWeight: 600 }}>{c.changeNumber}</td>
                        <td>{c.changeType || '--'}</td>
                        <td>
                          {modelled
                            ? <span className={'rd-chip tone-' + (modelled === 'high' ? 'err' : modelled === 'med' ? 'warn' : 'ok')}>{risk}</span>
                            : <span className="sp-tone-warn">not assessed</span>}
                        </td>
                        <td>{c.regulatoryFiling || <span className="cm-meta">not set</span>}</td>
                        {CMC_MARKETS.map(([id]) => (
                          <td key={id}>
                            {modelled ? (
                              <>
                                <div style={{ fontWeight: 600 }}>{filingPath(String(c.changeType || ''), modelled, id)[0]}</div>
                                <div className="cm-meta">{filingPath(String(c.changeType || ''), modelled, id)[1]}</div>
                              </>
                            ) : (
                              <span className="cm-meta">assess the risk first</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {open.length > 0 && (
          <div className="pj-card-b" style={{ paddingTop: 0 }}>
            <div className="cm-meta" style={{ marginBottom: 8 }}>
              Reporting categories are computed from the modelled rules for each market and the risk recorded on
              the change. They are a starting position for a regulatory assessment, not a filed determination —
              where a market’s rule is not modelled the cell says so rather than guessing.
            </div>
            <CmPush label={'Global filing matrix'} nav={nav} bar />
          </div>
        )}
      </div>
      {/* The comparability register is NOT rendered here. It travelled with this
          matrix when Global filings was its own tab, but Change control — which
          now hosts the matrix — already carries it above. Mounting it twice
          would give the tab two create buttons over one table and two local row
          states that desync after the first write. */}
    </>
  );
}

/* ═══════════ Program records ═══════════
   The audit chain, for real. This tab said "No audit activity yet" while
   GET /api/cmc/module3-os/provenance/:projectId/:sectionKey served the events
   and GET /api/cmc/module3-os/contradictions/:projectId served the open
   findings. Agency correspondence genuinely has no backend — the Module 3 board
   returns correspondence:null — so that half stays an honest empty rather than
   being filled with something adjacent. */

interface ProvenanceRow {
  eventType: string;
  eventPayload: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: string | null;
  sectionKey: string;
}

export function CmPathway({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  const projectId = cmcProjectId();
  /* Open Module 3 agency questions — the org-scoped board serves them from
     reg_questions. This card was a permanent empty state ("once a
     correspondence source is connected") while the same rows fed an Overview
     KPI; the source was connected all along. */
  /* corrEpoch bumps after every correspondence WRITE (log / close), refetching
     the board so the card shows the server's list — never a locally invented
     row. useLiveData refetches when its deps change; the path never does. */
  const [corrEpoch, setCorrEpoch] = useState(0);
  const board = useLiveData<CmcBoardData>('/api/cmc/module3-board', ['/api/cmc/module3-board', corrEpoch]);
  const corr = board.data?.correspondence;
  const [toast, fireToast] = useToast();

  /* ── Log an agency question ──
     The board READS reg_questions; until this, nothing in the product could
     WRITE it — questions arrived only through the email ingest, so an IR
     received by phone or portal (how most agencies actually deliver them)
     could not be recorded at all. POST /api/cmc/agency-questions stamps the
     org from the verified session; the card reloads from the server. */
  const [logOpen, setLogOpen] = useState(false);
  /* A second submit while the POST is in flight would write a second
     PERMANENT row (questions close, never delete) — same guard idiom as the
     change memo's openingRef. */
  const loggingRef = useRef(false);
  const LOG_FORM: C2CFormConfig = {
    eyebrow: 'CMC — agency correspondence',
    title: 'Log an agency question',
    sub: 'Records an open information request in the correspondence file. Triage, drafting and closure all work from this record.',
    submitLabel: 'Log question',
    fields: [
      { key: 'questionText', label: 'Question, as received', type: 'textarea', required: true, placeholder: 'Quote the agency’s question verbatim — never a paraphrase.' },
      { key: 'sectionReference', label: 'Module 3 section (optional)', type: 'text', half: true, placeholder: 'e.g. 3.2.S.4.1 — this file holds 3.x questions' },
      { key: 'region', label: 'Agency / region', type: 'text', half: true, placeholder: 'e.g. FDA' },
      { key: 'priority', label: 'Priority', type: 'seg', options: ['low', 'medium', 'high'], default: 'medium', half: true },
      { key: 'dueDate', label: 'Response due', type: 'date', half: true },
      { key: 'assignedTo', label: 'Assigned to', type: 'text', placeholder: 'Who owns the response (optional)' },
    ],
  };
  const logQuestion = async (v: Record<string, string>) => {
    if (loggingRef.current) return;
    loggingRef.current = true;
    try {
      const res = await apiRequest('POST', '/api/cmc/agency-questions', {
        questionText: v.questionText,
        ...(v.sectionReference?.trim() ? { sectionReference: v.sectionReference.trim() } : {}),
        ...(v.region?.trim() ? { region: v.region.trim() } : {}),
        ...(v.priority ? { priority: v.priority } : {}),
        ...(v.dueDate ? { dueDate: v.dueDate } : {}),
        ...(v.assignedTo?.trim() ? { assignedTo: v.assignedTo.trim() } : {}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        fireToast('Couldn’t log the question — ' + (serverMessage(json) ?? `HTTP ${res.status}`) + '. Nothing was recorded.', 'error');
        return;
      }
      setLogOpen(false);
      const row = (json as { data?: { sectionRef?: string | null } })?.data;
      fireToast('Agency question logged' + (row?.sectionRef ? ' · §' + row.sectionRef : '') + ' — open in the correspondence file.');
      setCorrEpoch((e) => e + 1);
    } catch (e) {
      fireToast('Couldn’t log the question — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
    } finally {
      loggingRef.current = false;
    }
  };

  /* The CLOSED file — the record the board's open filter deliberately leaves
     out, readable at last. Loaded on demand (the open list is the working
     set; the answered history is a look-up before the next agency
     interaction and at inspection), with honest loading/error/empty states.
     Reopening a mistaken close was legal in the API from day one and
     impossible from every screen; the Reopen door closes that. */
  const [closedOpen, setClosedOpen] = useState(false);
  const [closedRows, setClosedRows] = useState<CmcCorrespondence[]>([]);
  const [closedState, setClosedState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const loadClosed = async () => {
    setClosedState('loading');
    try {
      const res = await apiRequest('GET', '/api/cmc/agency-questions?status=CLOSED');
      const pj = (await res.json().catch(() => null)) as { success?: boolean; data?: unknown } | null;
      if (!res.ok || !pj?.success) throw new Error(serverMessage(pj) ?? `HTTP ${res.status}`);
      setClosedRows(Array.isArray(pj.data) ? (pj.data as CmcCorrespondence[]) : []);
      setClosedState('ready');
    } catch {
      // A failed read is an ERROR, never an empty history claiming nothing
      // was ever closed.
      setClosedState('error');
      setClosedRows([]);
    }
  };
  const toggleClosed = () => {
    const next = !closedOpen;
    setClosedOpen(next);
    if (next) void loadClosed();
  };
  const reopenQuestion = async (c: CmcCorrespondence) => {
    try {
      /* Reopen to the truthful state: DRAFTED when a response draft is linked
         (that draft still exists), OPEN otherwise. Guarded — only a row still
         CLOSED reopens; a 409 means someone already moved it. */
      await apiRequest('PATCH', '/api/cmc/agency-questions/' + encodeURIComponent(String(c.id)), {
        status: c.responseDocId ? 'DRAFTED' : 'OPEN',
        expectedStatus: 'CLOSED',
      });
      fireToast('Question reopened' + (c.sectionRef ? ' · §' + c.sectionRef : '') + ' — back on the open list.');
    } catch (e) {
      fireToast('Couldn’t reopen the question — ' + (e instanceof Error ? e.message : String(e)), 'error');
    }
    setCorrEpoch((e) => e + 1);
    void loadClosed();
  };

  /* Close = the question is answered and submitted; the row leaves the OPEN
     list but stays in the record. Inline confirm — a closed row disappears
     from this view, so a misclick must not do that silently. */
  const [closingId, setClosingId] = useState<string | number | null>(null);
  const closeQuestion = async (c: CmcCorrespondence) => {
    try {
      // expectedStatus: closing applies to the row THIS screen read — if
      // someone else already moved it, the server answers 409 with the
      // current status instead of this click silently overwriting it.
      const res = await apiRequest('PATCH', '/api/cmc/agency-questions/' + encodeURIComponent(String(c.id)), { status: 'CLOSED', expectedStatus: c.status });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        fireToast('Couldn’t close the question — ' + (serverMessage(json) ?? `HTTP ${res.status}`) + '. It stays open.', 'error');
        return;
      }
      fireToast('Question closed' + (c.sectionRef ? ' · §' + c.sectionRef : '') + ' — it leaves the open list and stays in the record.');
      setClosingId(null);
      setCorrEpoch((e) => e + 1);
      // The closed file is on screen? Then the row must appear there NOW.
      if (closedOpen) void loadClosed();
    } catch (e) {
      fireToast('Couldn’t close the question — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
      setCorrEpoch((e) => e + 1);
    }
  };

  /* Inline re-assignment. The Assigned column rendered the owner but only the
     Log dialog could ever set one — changing who owns the response mid-life,
     the everyday triage act, forced a raw API call. A blank value clears the
     owner (the server stores NULL, the cell says so honestly). */
  const [assigningId, setAssigningId] = useState<string | number | null>(null);
  const [assignVal, setAssignVal] = useState('');
  const saveAssignee = async (c: CmcCorrespondence) => {
    const next = assignVal.trim();
    if ((c.assignedTo ?? '') === next) {
      setAssigningId(null);
      return;
    }
    try {
      await apiRequest(
        'PATCH',
        '/api/cmc/agency-questions/' + encodeURIComponent(String(c.id)),
        { assignedTo: next || null },
      );
      fireToast(next ? 'Assigned to ' + next + '.' : 'Assignment cleared.');
      setAssigningId(null);
      setCorrEpoch((e) => e + 1);
    } catch (e) {
      fireToast(
        'Couldn’t update the assignment — ' + (e instanceof Error ? e.message : String(e)),
        'error',
      );
    }
  };

  /* The REVIEW leg of the lifecycle. IN_REVIEW has always been in the store's
     status set and on the board's chips, but nothing in the product could SET
     it — a drafted response went to its reviewer by email while the file
     stayed DRAFTED, and a reviewer could not hand it back. Guarded like every
     status write here: the transition applies only from the status this
     screen read; a concurrent move answers 409 with the current status. */
  const moveStatus = async (
    c: CmcCorrespondence,
    to: 'IN_REVIEW' | 'DRAFTED',
    said: string,
  ) => {
    try {
      await apiRequest(
        'PATCH',
        '/api/cmc/agency-questions/' + encodeURIComponent(String(c.id)),
        { status: to, expectedStatus: c.status },
      );
      fireToast(said + (c.sectionRef ? ' · §' + c.sectionRef : '') + '.');
    } catch (e) {
      fireToast(
        'Couldn’t update the question — ' + (e instanceof Error ? e.message : String(e)),
        'error',
      );
    }
    // Refetch on success AND failure: a 409 means this screen's row is
    // stale, and the honest next state is the server's.
    setCorrEpoch((e) => e + 1);
  };

  /* "Draft response" — the same real handoff as the change memo's editor
     button: the response document is CREATED (POST document + section via
     saveToAuthoring) and we navigate only on a clean write. The skeleton
     quotes the actual question and leaves [DATA NEEDED] markers — a scaffold
     for the responder, never a fabricated answer. One draft at a time; a
     second click while a write is in flight must not create a second document. */
  const draftingRef = useRef(false);
  const [draftingId, setDraftingId] = useState<string | number | null>(null);
  /* The skeleton is EDITOR HTML, not markdown: the authoring store holds the
     canonical editor's serialization, and a markdown string saved there
     renders as literal `#`/`**` characters in the canvas and the document
     view. Only tags the editor round-trips (h1/h2, blockquote, p, ul/li,
     strong, em, hr) so the section opens rich, never in source mode. */
  const draftHtml = (c: CmcCorrespondence) => {
    const esc = (t: string) =>
      t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const sec = c.sectionRef ? `§${c.sectionRef}` : 'Module 3';
    const due = c.dueDate ? new Date(c.dueDate).toLocaleDateString() : 'no deadline recorded';
    return (
      `<h1>Response to Agency Question — ${esc(sec)}</h1>` +
      `<blockquote><p>${esc(c.question)}</p></blockquote>` +
      `<ul>` +
      `<li><strong>Region</strong>: ${esc(c.region ?? 'not recorded')}</li>` +
      `<li><strong>Due</strong>: ${esc(due)}${c.overdue ? ' — <strong>overdue</strong>' : ''}</li>` +
      `<li><strong>Priority</strong>: ${esc(c.priority ?? c.severity ?? 'not recorded')}</li>` +
      `<li><strong>Status</strong>: ${esc(c.status)}</li>` +
      `</ul>` +
      `<h2>Response</h2>` +
      `<p>[DATA NEEDED] State the position first, then the evidence. Cite the governed record (specification, method, batch, stability study) by identifier — the reviewer will trace it.</p>` +
      `<h2>Supporting evidence</h2>` +
      `<ul>` +
      `<li>[ ] Approved Module 3 section(s) covering ${esc(sec)}</li>` +
      `<li>[ ] Specification / analytical method records cited in the response</li>` +
      `<li>[ ] Batch or stability data referenced, with lot numbers</li>` +
      `<li>[ ] Comparability or justification memo, if the answer relies on one</li>` +
      `</ul>` +
      `<hr>` +
      `<p><em>Drafted from open agency question ${esc(String(c.id))}. Route through review and e-signature before it goes to the agency.</em></p>`
    );
  };
  const draftResponse = async (c: CmcCorrespondence) => {
    if (draftingRef.current) return;
    draftingRef.current = true; setDraftingId(c.id);
    try {
      const res = await saveToAuthoring({
        title: 'Response to agency question — ' + (c.sectionRef ? '§' + c.sectionRef : 'Module 3'),
        module: 'M3', code: 'agency_question_response',
        content: draftHtml(c), subject: 'the draft response',
      });
      // Navigate only on a clean write — see authoringHandoff.
      if (!res.ok) { fireToast(res.message, 'error'); return; }
      /* The draft EXISTS now, so the question's lifecycle can say so: OPEN →
         DRAFTED, the status the board already renders and the open filter
         keeps. Only an OPEN question is advanced — a reviewer's IN_REVIEW is
         not downgraded by re-drafting. A failed status write does not undo
         the draft; it is stated, and we stay here so the statement is seen. */
      /* ONE guarded write for every status the board serves. An OPEN question
         flips to DRAFTED because the draft now exists; DRAFTED and IN_REVIEW
         keep their status (a reviewer's IN_REVIEW is never downgraded) while
         the LINK follows the newest draft — the file must point at the draft
         the responder is actually working in, whatever the lifecycle says.
         expectedStatus makes the write conditional SERVER-side: this row was
         read when the screen loaded, and if it moved on (someone closed the
         question), the PATCH answers 409 instead of silently rewriting a
         closed record. responseDocId is refused unless the document exists
         in this org — the recorded link is a door that opens.
         EVERY failure is surfaced: "draft created, file not updated" is a
         split state the responder must hear about, so we stay on the card
         where the statement is visible instead of navigating away from it. */
      // apiRequest THROWS on a non-2xx (except 401) with the server's own
      // sentence on the error — keep it, or the 409's "the question is CLOSED
      // now" would be replaced by a vaguer line.
      let thrownMsg: string | null = null;
      const patch = await apiRequest(
        'PATCH',
        '/api/cmc/agency-questions/' + encodeURIComponent(String(c.id)),
        {
          ...(c.status === 'OPEN' ? { status: 'DRAFTED' } : {}),
          expectedStatus: c.status,
          responseDocId: res.docId,
        },
      ).catch((e: unknown) => {
        thrownMsg = e instanceof Error && e.message ? e.message : null;
        return null;
      });
      if (!patch?.ok) {
        const pj = patch ? await patch.json().catch(() => null) : null;
        fireToast(
          'The draft was created, but the correspondence file was not updated — ' +
            (serverMessage(pj) ?? thrownMsg ?? 'the question could not be updated; it is unchanged in the file.') +
            ' Open the draft from the Document editor.',
          'error',
        );
        setCorrEpoch((e) => e + 1);
        return;
      }
      if (nav) {
        /* Open the editor ON the new draft — the deep-link channel names the
           exact document, so the editor cannot land on "first doc in the
           list". Set only when a navigation follows: the channel is one-shot
           and a target nothing consumes is a stray claim. */
        setEditorTarget({ docType: null, docId: res.docId });
        nav('document-authoring');
      } else {
        fireToast(res.message);
        setCorrEpoch((e) => e + 1);
      }
    } finally {
      draftingRef.current = false; setDraftingId(null);
    }
  };

  const sections = useLiveRows<{ sectionKey: string; sectionPath: string; approvalState: string; stale: boolean; updatedAt: string }>(
    projectId ? '/api/cmc/module3-os/sections/' + encodeURIComponent(projectId) : null,
  );
  const contradictions = useLiveRows<{ id: string; severity: string; contradictionType: string; details: string; status: string; updatedAt: string }>(
    projectId ? '/api/cmc/module3-os/contradictions/' + encodeURIComponent(projectId) : null,
  );

  /* The provenance chain is served per section, so the programme-wide view is
     the union across the sections this project actually has. Sections are
     fetched first and their event streams are then read in parallel; a section
     whose stream fails is reported rather than silently dropped, because a
     missing link in an audit chain is exactly the thing not to hide. */
  const [events, setEvents] = useState<ProvenanceRow[]>([]);
  const [chainState, setChainState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [chainError, setChainError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || sections.loading) return;
    if (sections.error) { setChainState('error'); setChainError(sections.error); return; }
    if (sections.rows.length === 0) { setEvents([]); setChainState('ready'); return; }
    let cancelled = false;
    setChainState('loading');
    setChainError(null);
    void (async () => {
      const failures: string[] = [];
      const all: ProvenanceRow[] = [];
      await Promise.all(
        sections.rows.map(async (s) => {
          const r = await liveGetOrNull<ProvenanceRow[]>(
            '/api/cmc/module3-os/provenance/' + encodeURIComponent(projectId) + '/' + encodeURIComponent(s.sectionKey),
          );
          if (r.error) { failures.push(s.sectionKey); return; }
          for (const e of Array.isArray(r.data) ? r.data : []) all.push({ ...e, sectionKey: s.sectionKey });
        }),
      );
      if (cancelled) return;
      all.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setEvents(all);
      setChainError(failures.length ? `${failures.length} section${failures.length === 1 ? '' : 's'} (${failures.join(', ')}) could not be read — this chain is incomplete.` : null);
      setChainState('ready');
    })();
    return () => { cancelled = true; };
  }, [projectId, sections.loading, sections.error, sections.rows]);

  const resolved = contradictions.rows.filter((c) => c.status === 'resolved');
  const open = contradictions.rows.filter((c) => c.status !== 'resolved');

  /* Org-wide by design: agency questions do not require an open program. */
  const corrCard = (
          <div className="pj-card" style={{ marginBottom: 16 }}>
        <div className="pj-card-h">
          <span className="t">Open agency correspondence</span>
          <span className="s">Module 3 questions, organization-wide — triage by deadline</span>
          <button
            className="nda-open"
            style={{ marginLeft: 'auto' }}
            title="Record an information request the agency sent — by letter, portal or call"
            onClick={() => setLogOpen(true)}
          >
            {I.plus} Log question
          </button>
        </div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {board.loading ? (
            <div style={{ padding: 12 }}><EmptyState icon={I.globe} title="Loading agency correspondence…" busy /></div>
          ) : board.error ? (
            <div style={{ padding: 12 }}>
          <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load agency correspondence" hint={board.error} />
            </div>
          ) : corr == null ? (
            <div style={{ padding: 12 }}>
          <EmptyState
            icon={I.globe}
            title="Correspondence store not provisioned"
            hint="The agency-question store is not provisioned in this environment — nothing is shown because nothing could be read, not because nothing is open."
          />
            </div>
          ) : corr.length === 0 ? (
            <div style={{ padding: 12 }}>
          <EmptyState
            icon={I.shieldCheck}
            title="No open Module 3 agency questions"
            hint="Open information requests and LoQs referencing §3.x appear here with their deadline, priority and assignee, nearest deadline first."
          />
            </div>
          ) : (
            <table className="reg-tbl">
          <thead><tr><th>Due</th><th>Section</th><th>Question</th><th>Priority</th><th>Status</th><th>Assigned</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>
            {corr.map((c) => (
              <tr key={c.id}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {c.dueDate ? (
                    <span className={'rd-chip tone-' + (c.overdue ? 'err' : 'dim')}>
                      {new Date(c.dueDate).toLocaleDateString()}{c.overdue ? ' · overdue' : ''}
                    </span>
                  ) : (
                    <span className="cm-meta">no deadline</span>
                  )}
                </td>
                <td className="mono">{c.sectionRef ?? '—'}</td>
                <td title={c.question}>{c.question.length > 120 ? c.question.slice(0, 120) + '…' : c.question}</td>
                <td>
                  <span className={'rd-chip tone-' + (String(c.priority).toLowerCase() === 'high' || String(c.severity).toLowerCase() === 'critical' ? 'err' : String(c.priority).toLowerCase() === 'medium' ? 'warn' : 'dim')}>
                    {c.priority ?? c.severity ?? '—'}
                  </span>
                </td>
                <td className="mono">{c.status}</td>
                <td>
                  {assigningId === c.id ? (
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <input
                        value={assignVal}
                        autoFocus
                        aria-label="Who owns the response — blank clears the assignment"
                        placeholder="name or email"
                        style={{ width: 150 }}
                        onChange={(e) => setAssignVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveAssignee(c);
                          if (e.key === 'Escape') setAssigningId(null);
                        }}
                      />
                      <button className="nda-open" onClick={() => void saveAssignee(c)}>Save</button>
                      <button className="nda-open" onClick={() => setAssigningId(null)}>Cancel</button>
                    </span>
                  ) : (
                    <button
                      className="nda-open"
                      title={c.assignedTo ? 'Change who owns the response' : 'Assign an owner for the response'}
                      onClick={() => {
                        setAssigningId(c.id);
                        setAssignVal(c.assignedTo ?? '');
                      }}
                    >
                      {c.assignedTo ?? 'Assign'}
                    </button>
                  )}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    {/* The linked draft is a recorded fact on the row — the
                        door renders only when the file names a document AND a
                        navigator exists to honour it. */}
                    {c.responseDocId && nav ? (
                      <button
                        className="nda-open"
                        // Held while ANY draft write is in flight: navigating
                        // to the editor mid-write would leave that write's
                        // own editor target unconsumed on the channel.
                        disabled={draftingId != null}
                        title="Open the drafted response in the document editor"
                        onClick={() => {
                          setEditorTarget({ docType: null, docId: c.responseDocId });
                          nav('document-authoring');
                        }}
                      >
                        {I.fileText} Open draft
                      </button>
                    ) : null}
                    <button
                      className="nda-open"
                      disabled={draftingId != null}
                      title="Create a governed response draft quoting this question and open it in the editor"
                      onClick={() => void draftResponse(c)}
                    >
                      {draftingId === c.id ? <>Creating…</> : c.responseDocId ? <>{I.fileText} Re-draft</> : <>{I.fileText} Draft response</>}
                    </button>
                    <button
                      className="nda-open"
                      title="Ask AnA about this question"
                      onClick={() => ask('An agency question is open against ' + (c.sectionRef ? '§' + c.sectionRef : 'Module 3') + ': "' + c.question + '" — what evidence from our specifications, batch records and stability program answers it, and what is missing?')}
                    >
                      {I.sparkles} Ask AnA
                    </button>
                    <button
                      className="nda-open"
                      title="Create a task for this question"
                      onClick={() => cmcTask('Agency question ' + (c.sectionRef ? '§' + c.sectionRef : 'Module 3'))}
                    >
                      {I.checkSquare} Create task
                    </button>
                    {/* The review leg: only the transition the row's CURRENT
                        status allows is offered — the guard on the write is
                        mirrored by the door that proposes it. */}
                    {c.status === 'DRAFTED' ? (
                      <button
                        className="nda-open"
                        title="Send the drafted response for review — the file shows IN_REVIEW"
                        onClick={() => void moveStatus(c, 'IN_REVIEW', 'Sent for review')}
                      >
                        Send for review
                      </button>
                    ) : null}
                    {c.status === 'IN_REVIEW' ? (
                      <button
                        className="nda-open"
                        title="Hand the question back to drafting"
                        onClick={() => void moveStatus(c, 'DRAFTED', 'Returned to drafting')}
                      >
                        Return to drafting
                      </button>
                    ) : null}
                    {/* Close leaves the open list (the record keeps the row),
                        so a misclick must confirm before it disappears. */}
                    {closingId === c.id ? (
                      <>
                        <span className="cm-meta">Close this question?</span>
                        <button className="nda-open" onClick={() => setClosingId(null)}>
                          Cancel
                        </button>
                        <button className="nda-open" onClick={() => void closeQuestion(c)}>
                          {I.check} Close
                        </button>
                      </>
                    ) : (
                      <button
                        className="nda-open"
                        title="Close this question — it leaves the open list and stays in the record"
                        onClick={() => setClosingId(c.id)}
                      >
                        Close
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
            </table>
          )}
          {/* ── The closed file ──
              Rendered under BOTH branches above: a fresh screen with no open
              questions still has (or will have) an answered history. */}
          <div style={{ borderTop: '1px solid var(--c2c-line,#eef0f3)', marginTop: 10, paddingTop: 8 }}>
            <button className="nda-open" onClick={toggleClosed}>
              {closedOpen ? 'Hide the closed file' : 'Show the closed file'}
            </button>
            {closedOpen ? (
              closedState === 'loading' ? (
                <div className="cm-meta" style={{ marginTop: 8 }}>Loading the closed file…</div>
              ) : closedState === 'error' ? (
                <div className="sp-tone-err" style={{ marginTop: 8, fontSize: 12.5 }}>
                  Couldn’t read the closed file — it didn’t load, and this list would be a lie if it rendered empty. Toggle to retry.
                </div>
              ) : closedRows.length === 0 ? (
                <div className="cm-meta" style={{ marginTop: 8 }}>
                  No closed questions yet — the answered file builds as questions close.
                </div>
              ) : (
                <table className="reg-tbl" style={{ marginTop: 8 }}>
                  <thead><tr><th>Closed</th><th>Section</th><th>Question</th><th>Assigned</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                  <tbody>
                    {closedRows.map((c) => (
                      <tr key={'cl-' + c.id}>
                        <td style={{ whiteSpace: 'nowrap' }} className="cm-meta">
                          {c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="mono">{c.sectionRef ?? '—'}</td>
                        <td title={c.question}>{c.question.length > 120 ? c.question.slice(0, 120) + '…' : c.question}</td>
                        <td>{c.assignedTo ?? '—'}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            {c.responseDocId && nav ? (
                              <button
                                className="nda-open"
                                title="Open the response that answered this question"
                                onClick={() => {
                                  setEditorTarget({ docType: null, docId: c.responseDocId });
                                  nav('document-authoring');
                                }}
                              >
                                {I.fileText} Open response
                              </button>
                            ) : null}
                            <button
                              className="nda-open"
                              title="Reopen this question — it returns to the open list"
                              onClick={() => void reopenQuestion(c)}
                            >
                              Reopen
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : null}
          </div>
        </div>
      </div>
  );

  return (
    <div className="cm-body">
      <CmHead title="Program records" meta="Agency correspondence, approval gates and the audit chain" ask={ask} suggest={CMC_SUGGEST.pathway} />
      {corrCard}
      {!projectId ? (
        <div className="pj-card">
          <div className="pj-card-b">
            <EmptyState
              icon={I.scroll}
              title="Open a program to see its records"
              hint="The Module 3 audit chain and the contradiction history are recorded per project."
              action={openProgramAction(nav)}
              regulation="Serves the per-program audit history (21 CFR Part 11 §11.10(e))"
            />
          </div>
        </div>
      ) : (
        <>
          <div className="cm-kpis">
            <Kpi l="Governed events" v={events.length} />
            <Kpi l="Sections tracked" v={sections.rows.length} />
            <Kpi l="Contradictions resolved" v={resolved.length} tone={resolved.length ? 'ok' : undefined} />
            <Kpi l="Still open" v={open.length} tone={open.length ? 'warn' : 'ok'} />
          </div>


          <div className="pj-card" style={{ marginBottom: 16 }}>
            <div className="pj-card-h">
              <span className="t">Audit chain</span>
              <span className="s">governed actions across every §3.2 section</span>
            </div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {chainError && (
                <div style={{ padding: '10px 12px 0' }}>
                  <div className="pj-con">
                    <span className="ico">{I.alertTriangle}</span>
                    <div><div className="pj-con-t">Part of the chain could not be read</div><div className="pj-con-d">{chainError}</div></div>
                  </div>
                </div>
              )}
              {events.length === 0 ? (
                <div style={{ padding: 12 }}>
                  {chainState === 'loading' || sections.loading ? (
                    <EmptyState icon={I.scroll} title="Reading the provenance chain…" />
                  ) : chainState === 'error' ? (
                    <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load the audit chain" hint={chainError ?? 'The Module 3 section list did not respond.'} />
                  ) : (
                    <EmptyState
                      icon={I.scroll}
                      title="No governed activity yet"
                      hint="Compiles, refreshes, approvals and contradiction resolutions are written to the provenance store as they happen. Compile Module 3 and the chain starts here."
                    />
                  )}
                </div>
              ) : (
                <table className="reg-tbl">
                  <thead><tr><th>When</th><th>Section</th><th>Event</th><th>Actor</th><th>Detail</th></tr></thead>
                  <tbody>
                    {events.slice(0, 200).map((e, i) => (
                      <tr key={i}>
                        <td className="cm-meta">{e.createdAt ? new Date(e.createdAt).toLocaleString() : '--'}</td>
                        <td className="mono">{e.sectionKey}</td>
                        <td><span className={'rd-chip tone-' + (e.eventType === 'approved' ? 'ok' : e.eventType === 'refreshed' ? 'warn' : 'dim')}>{e.eventType}</span></td>
                        <td>{e.createdBy || 'system'}</td>
                        <td className="cm-meta">{provenanceDetail(e.eventPayload)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {events.length > 200 && (
              <div className="pj-card-b" style={{ paddingTop: 0 }}>
                <div className="cm-meta">Showing the 200 most recent of {events.length} events.</div>
              </div>
            )}
          </div>

          <div className="pj-card">
            <div className="pj-card-h">
              <span className="t">Contradiction history</span>
              <span className="s">{resolved.length} resolved -- {open.length} open</span>
            </div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {contradictions.rows.length === 0 ? (
                <div style={{ padding: 12 }}>
                  {contradictions.loading ? (
                    <EmptyState icon={I.shieldAlert} title="Loading contradiction history…" busy />
                  ) : contradictions.error ? (
                    <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load contradiction history" hint={contradictions.error} />
                  ) : (
                    <EmptyState icon={I.shieldCheck} title="No contradictions recorded" hint="Run the sweep from the Module 3 build tab; every finding and its resolution is kept here." />
                  )}
                </div>
              ) : (
                <table className="reg-tbl">
                  <thead><tr><th>Severity</th><th>Type</th><th>Detail</th><th>Status</th><th>Last change</th></tr></thead>
                  <tbody>
                    {contradictions.rows.map((c) => (
                      <tr key={c.id}>
                        <td><span className={'rd-chip tone-' + (String(c.severity).toLowerCase() === 'critical' ? 'err' : 'warn')}>{c.severity}</span></td>
                        <td className="mono">{c.contradictionType}</td>
                        <td>{c.details}</td>
                        <td><span className={'rd-chip tone-' + (c.status === 'resolved' ? 'ok' : 'warn')}>{c.status}</span></td>
                        <td className="cm-meta">{c.updatedAt ? new Date(c.updatedAt).toLocaleString() : '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="pj-card-b" style={{ paddingTop: 0 }}><CmPush label={'Module 3 audit chain'} nav={nav} bar /></div>
          </div>
        </>
      )}
      {logOpen && <C2CForm config={LOG_FORM} onCancel={() => setLogOpen(false)} onSubmit={logQuestion} />}
      <C2CToast msg={toast} />
    </div>
  );
}

/** A provenance payload summarised for a table cell, never stringified raw. */
function provenanceDetail(payload: Record<string, unknown> | null): string {
  if (!payload || typeof payload !== 'object') return '--';
  const parts: string[] = [];
  const push = (label: string, value: unknown) => {
    if (value == null || value === '') return;
    parts.push(`${label} ${Array.isArray(value) ? value.join(', ') : String(value)}`);
  };
  push('completeness', payload.completeness != null ? `${payload.completeness}%` : null);
  push('missing', Array.isArray(payload.missingInputs) && payload.missingInputs.length ? payload.missingInputs : null);
  push('reason', payload.reason);
  push('note', payload.resolutionNote);
  push('version', payload.versionNumber);
  if (!parts.length) {
    const keys = Object.keys(payload);
    return keys.length ? keys.slice(0, 4).join(', ') : '--';
  }
  return parts.join(' · ');
}

/* ═══════════ CmcModule shell — sub-tab router ═══════════ */

const CMC_SURF: Record<string, React.ComponentType<{ ask: (text: string) => void; nav?: (id: string) => void }>> = {
  overview: CmOverview,
  materials: CmMaterials,
  specs: CmSpecs,
  stability: CmStability,
  batch: CmBatch,
  change: CmChange,
  quality: CmQuality,
  build: CmModule3Build,
  pathway: CmPathway,
};

export function CmcModule({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;
  const [tab, setTab] = useState('overview');
  /* The Overview's answer-lead offers "Open change simulator" and the Module 3
     build tab is reachable from Overview the same way, so the setter is
     published for those cross-tab jumps. Assigned in an effect rather than
     during render: a render-phase side effect on a global is exactly the kind
     of write React may run twice or discard. */
  useEffect(() => {
    (window as unknown as { __cmSetTab?: (id: string) => void }).__cmSetTab = setTab;
    return () => {
      delete (window as unknown as { __cmSetTab?: (id: string) => void }).__cmSetTab;
    };
  }, []);

  /* AnA's hands on this screen — the surface-action bus (shared registry:
     cmc.open-tab, identity-resolved). The handler drives the SAME setter the
     sub-tab buttons and __cmSetTab drive. The tab list is a static constant,
     so there is deliberately NO loading guard, NO retry, and NO ready signal —
     a not-ready refusal here would be dishonest. The wave-2 limitation
     (pane forms child-local and invisible here) is closed by the ceremony
     channel: the pane forms — spec edits, batch e-sign releases, stability
     registrations — all render through C2CForm, which reports itself, so a
     switch that would unmount a person's half-completed ceremony refuses.
     The human's own tab buttons still carry no guard; AnA acting on someone's
     behalf holds a higher bar than their own hands. */
  useSurfaceActionHandlers('cmc', {
    'cmc.open-tab': (params) => {
      const target = (params.tab ?? '').trim();
      const meta = CMC_NAV.find((n) => n.id === target);
      if (!meta) return { ok: false, reason: `No CMC tab named "${params.tab}".` };
      if (tab === target) return { ok: true, detail: `Already on ${meta.label}` };
      if (ceremonyOpen()) {
        return {
          ok: false,
          reason:
            'A governed form is open on this screen — switching tabs would discard it. ' +
            'Let the person finish or cancel it first.',
        };
      }
      setTab(target);
      return { ok: true, detail: `Opened ${meta.label}` };
    },
  });

  /* ── What AnA is told about this screen ──
     `useAnaChat` forwards a surface's published context to the orchestrator as
     `module_context`, so this is what makes a generic question ("what should I
     do next?") answerable here without the user restating their situation. The
     shell alone knows only that the surface is "cmc" — not which of the twelve
     sub-tabs is open, nor what is on it.

     Readiness is READ, never assembled: GET /api/cmc/module3-os/readiness is the
     same endpoint the build board renders, so AnA and the board cannot disagree.
     While that fetch is loading or errored the facts are simply ABSENT — telling
     her a percentage nobody measured would make her confidently wrong, which is
     the failure this channel is most able to cause.

     Per surfaceContext's own budget rule: the nouns and numbers a user could
     point at, never raw API bodies, and never anything the screen is hiding. */
  const anaProjectId = cmcProjectId();
  const anaReadiness = useLiveData<{
    totalSections: number; approvedSections: number; staleSections: number;
    openCriticalContradictions: number; exportReady: boolean;
  }>(anaProjectId ? '/api/cmc/module3-os/readiness/' + encodeURIComponent(anaProjectId) : null);
  const tabLabel = CMC_NAV.find((n) => n.id === tab)?.label ?? 'Overview';
  const r = anaReadiness.loading || anaReadiness.error ? null : anaReadiness.data;
  const anaContext = React.useMemo(
    () => ({
      summary:
        `The user is on the ${tabLabel} tab of the CMC Module 3 operating system` +
        (r
          ? `. ${r.approvedSections} of ${r.totalSections} §3.2 sections are approved` +
            (r.staleSections ? `, ${r.staleSections} went stale after approval` : '') +
            (r.openCriticalContradictions ? `, ${r.openCriticalContradictions} critical contradiction(s) are unresolved` : '') +
            `. Final export ${r.exportReady ? 'would pass' : 'is blocked'}.`
          : '.'),
      facts: {
        tab,
        tabLabel,
        /* Spread only once measured, so a fact is never a guess. */
        ...(r
          ? {
              sectionsApproved: r.approvedSections,
              sectionsTotal: r.totalSections,
              staleSections: r.staleSections,
              openCriticalContradictions: r.openCriticalContradictions,
              exportReady: r.exportReady,
            }
          : {}),
      },
      /* Her vocabulary for "drive this screen" requests: the tabs by name, plus
         the governed actions this module actually performs. */
      availableActions: [
        ...CMC_NAV.map((n) => `open the ${n.label} tab`),
        'compile Module 3 from the canonical sources',
        'run the contradiction sweep',
        'check the final-export gate',
        'run the ICH compliance check',
        'generate the control strategy',
        'estimate shelf life from the recorded stability results (ICH Q1E)',
        'assess whether stability batches are combinable (ICH Q1E ANCOVA poolability)',
      ],
    }),
    [tab, tabLabel, r?.totalSections, r?.approvedSections, r?.staleSections, r?.openCriticalContradictions, r?.exportReady],
  );
  usePublishSurfaceContext('cmc', anaContext);

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
