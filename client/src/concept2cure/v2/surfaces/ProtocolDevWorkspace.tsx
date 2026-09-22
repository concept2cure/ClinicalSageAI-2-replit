/**
 * Protocol development — the workspace for a loaded protocol document.
 *
 * Split out of ProtocolDev.tsx, which keeps the honest load states, the AnA
 * surface context and the empty state. This file owns the cover page, the tab
 * strip, the two governed drawers (the create forms in
 * `ProtocolRegisterForms`, and the edit/parameter forms in `ProtocolDevForms`)
 * and the export.
 *
 * Every drawer resolves the same way: the route confirms the write, `onChanged`
 * re-reads GET /api/protocol-dev, and the register renders the server's row.
 * Nothing on this screen is appended locally, so no pane can show a row the
 * record does not hold.
 */
import React, { useState } from 'react';
import * as PG from './ProtocolGov';
import { apiRequest } from '@/lib/queryClient';
import { C2CForm } from '../C2CForm';
import { C2CToast, useToast } from '../toast';
import { downloadBlob, downloadText, safeFileName } from '../download';
import { useSurfaceActionHandlers } from '../surfaceActions';
import { ProtocolRegisterForm, type RegisterKind } from './ProtocolRegisterForms';
import { ProtocolDevForm, type PdevFormKind, type PdevFormTarget } from './ProtocolDevForms';
import { ProtocolSectionPane } from './ProtocolDevSection';
import { AmendmentsTab, DeviationsTab, EligibilityTab, MilestonesTab, ObjectivesTab, Outline } from './ProtocolDevPanes';
import { SoaTab } from './ProtocolDevSoa';
import { BudgetTab, RiskTab } from './ProtocolDevRegisters';
import { ConsentTab, ReviewsTab } from './ProtocolDevReviews';
import { StudyDesignStatisticsTab } from './biostatBridge';
import { StudyDesignTab } from './ProtocolDevDesign';

const Ic = PG.Ic;
type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (v == null ? '' : String(v));

export const TABS = [
  { id: 'document', label: 'Document', icon: 'fileText' },
  { id: 'objectives', label: 'Objectives', icon: 'clipboardList' },
  { id: 'eligibility', label: 'Eligibility', icon: 'checkSquare' },
  { id: 'soa', label: 'Schedule of assessments', icon: 'grid' },
  // The design-as-data spine this protocol is a projection of: the link, the
  // design gates' findings, and the five projections the spine produces
  // (docs/design/PROTOCOL_DESIGN_CONVERGENCE.md steps 1 and 2).
  { id: 'study-design', label: 'Study design', icon: 'network' },
  // The protocol's statistics live on its study design (the design-as-data
  // spine), read through the biostatistics bridge; the tab links into the
  // designer with the design pre-loaded instead of retyped.
  { id: 'statistics', label: 'Statistics', icon: 'sigma' },
  { id: 'risks', label: 'Risk register', icon: 'alertTriangle' },
  { id: 'milestones', label: 'Milestones', icon: 'gitBranch' },
  { id: 'budget', label: 'Budget', icon: 'barChart' },
  { id: 'amendments', label: 'Amendments', icon: 'gitBranch' },
  { id: 'deviations', label: 'Deviations & CAPA', icon: 'shieldAlert' },
  { id: 'reviews', label: 'Reviews', icon: 'checkCircle' },
  { id: 'consent', label: 'Consent', icon: 'scroll' },
];

export interface WorkspaceDocProps {
  doc: Record<string, unknown>;
  onAsk: (msg: string) => void;
  onNav: (id: string) => void;
  /** A re-read of GET /api/protocol-dev is in flight after a confirmed write.
   *  The registers stay on screen; this is reported, not drawn over them. */
  refreshing?: boolean;
  /** The re-read failed. The document below is the last one that loaded, so
   *  saying nothing would present stale rows as current. */
  reloadError?: string;
  onChanged?: () => void;
}

/* ── Cover page ────────────────────────────────────────────────────────── */

/**
 * The document's `updated_at`, as a date a reviewer can read.
 *
 * The read model carries it as the raw column value, which reaches the client
 * as "Tue Sep 22 2026 00:25:13 GMT+0000 (Coordinated Universal Time)" — 58
 * characters of timezone prose in a header slot. An unparseable value is shown
 * as it was received rather than dropped: the header must not go quiet about a
 * field the record holds.
 */
function updatedSuffix(raw: unknown): string {
  const s = str(raw);
  if (!s) return '';
  const t = new Date(s);
  if (Number.isNaN(t.getTime())) return ' · updated ' + s;
  return ' · updated ' + t.toISOString().slice(0, 10);
}

interface HeaderProps {
  doc: Record<string, unknown>;
  canWrite: boolean;
  exporting: boolean;
  refreshing?: boolean;
  onAsk: (msg: string) => void;
  onExport: () => void;
  onEditCover: () => void;
}

function ProtocolHeader({ doc, canWrite, exporting, refreshing, onAsk, onExport, onEditCover }: HeaderProps) {
  const sponsor = str(doc.sponsor);
  const pi = str(doc.pi) || str(doc.principalInvestigator);
  return (
    <div className="pd-head">
      <div className="pd-head-l">
        <span className="pd-kind">{(doc.kind ? PG.labelize(str(doc.kind)) + ' ' : '') + 'protocol'}</span>
        <div className="pd-titrow"><h1 className="pd-title">{str(doc.title)}</h1><span className="pd-short">{str(doc.shortTitle)}</span></div>
        <div className="pd-subrow">
          <span>{sponsor || 'Sponsor not recorded'}</span>
          <span className="pd-dot" />
          <span>{pi ? 'PI ' + pi : 'Principal investigator not recorded'}</span>
          <span className="pd-dot" />
          <PG.StatusBadge status={str(doc.status)} />
          {canWrite && (
            <button type="button" className="pde-rowbtn" onClick={onEditCover}>
              Edit sponsor and principal investigator
            </button>
          )}
        </div>
      </div>
      <div className="pd-head-r">
        <span className="pd-autosave">{'v' + (str(doc.version) || '—') + updatedSuffix(doc.updated)}</span>
        {refreshing && <span className="pd-autosave" role="status">Re-reading the record…</span>}
        <PG.Btn icon="sparkles" variant="outline"
          onClick={() => onAsk('Review ' + str(doc.shortTitle) + ' for completeness and list what blocks finalization.')}>
          Ask AnA
        </PG.Btn>
        <PG.Btn icon="fileText" variant="outline" onClick={onExport}>{exporting ? 'Exporting…' : 'Export'}</PG.Btn>
      </div>
    </div>
  );
}

/* ── Export ────────────────────────────────────────────────────────────── */

/**
 * The assembled protocol, rendered. GET /api/protocol-export/:id returns the
 * governed document plus its Markdown; nothing is re-derived on the client and
 * nothing AnA wrote is substituted for the record.
 */
/** The server's refusal, in its own words. */
function refusal(body: unknown, status: number): string {
  const err = (body as { error?: unknown } | null)?.error;
  if (typeof err === 'string') return err;
  const obj = err as { message?: string; code?: string } | undefined;
  return obj?.message || obj?.code || `HTTP ${status}`;
}

/** The governed assembly, as Markdown. Throws with the route's own refusal. */
async function assembledMarkdown(documentId: number): Promise<string> {
  const res = await apiRequest('GET', `/api/protocol-export/${documentId}`);
  const j = (await res.json().catch(() => null)) as { markdown?: string } | null;
  if (!res.ok || !j?.markdown) {
    throw new Error('The protocol was not exported — ' + refusal(j, res.status) + '. No file was produced.');
  }
  return j.markdown;
}

async function exportProtocol(
  documentId: number, doc: Record<string, unknown>, format: 'docx' | 'pdf' | 'markdown',
): Promise<string> {
  const markdown = await assembledMarkdown(documentId);
  const base = safeFileName(str(doc.shortTitle) || str(doc.title) || 'protocol', 'protocol') + '-v' + (str(doc.version) || '0');
  if (format === 'markdown') {
    if (!downloadText(base + '.md', markdown, 'text/markdown;charset=utf-8')) {
      throw new Error('The browser refused the download. No file was saved.');
    }
    return 'Markdown downloaded — the assembled protocol as the server rendered it.';
  }
  const r2 = await apiRequest('POST', `/api/concept2cure/artifacts/export-${format}`, {
    title: str(doc.title) || str(doc.shortTitle) || 'Protocol',
    content: markdown,
  });
  if (!r2.ok) {
    throw new Error('The protocol was not exported — ' + refusal(await r2.json().catch(() => null), r2.status) + '. No file was produced.');
  }
  if (!downloadBlob(base + '.' + format, await r2.blob())) {
    throw new Error('The file was produced but the browser refused the download.');
  }
  return format.toUpperCase() + ' downloaded — the assembled protocol.';
}

/* ── Tab body ──────────────────────────────────────────────────────────── */

interface BodyProps {
  tab: string;
  doc: Record<string, unknown>;
  sec: Row | undefined;
  canWrite: boolean;
  onAsk: (msg: string) => void;
  onNav: (id: string) => void;
  onReg: (kind: RegisterKind) => void;
  onEdit: (kind: PdevFormKind, target?: PdevFormTarget) => void;
  onSaved: () => void;
  onError: (m: string) => void;
  /** A confirmation in the register's own words, not an error. */
  onToast: (m: string) => void;
  /** Re-read the record after a confirmed write, with no toast of its own —
   *  the pane that wrote says what it wrote. */
  onRefresh: () => void;
}

/**
 * The registers whose pane is a plain read/add list. Split out of `TabBody`
 * when the Study design tab was added: one switch over every tab passed the
 * repo's complexity budget, and suppressing that would have been the wrong
 * trade. Returns null for a tab it does not own, so `TabBody` falls through.
 */
function RegisterTabBody({ tab, doc, canWrite, onReg, onEdit }: BodyProps): React.ReactElement | null {
  switch (tab) {
    case 'objectives': return <ObjectivesTab doc={doc} onAdd={() => onReg('objective')} />;
    case 'eligibility': return <EligibilityTab doc={doc} onAdd={() => onReg('eligibility')} />;
    case 'risks': return <RiskTab doc={doc} onAdd={() => onReg('risk')} onEdit={onEdit} />;
    case 'milestones': return <MilestonesTab doc={doc} onAdd={() => onReg('milestone')} />;
    case 'budget': return <BudgetTab doc={doc} onEdit={canWrite ? onEdit : undefined} />;
    case 'amendments': return <AmendmentsTab doc={doc} onAdd={() => onReg('amendment')} />;
    case 'deviations': return <DeviationsTab doc={doc} onAdd={() => onReg('deviation')} />;
    case 'reviews': return <ReviewsTab doc={doc} onEdit={canWrite ? onEdit : undefined} />;
    case 'consent': return <ConsentTab doc={doc} />;
    default: return null;
  }
}

function TabBody(props: BodyProps) {
  const { tab, doc, sec, canWrite, onAsk, onNav, onEdit, onSaved, onError, onToast, onRefresh } = props;
  const register = RegisterTabBody(props);
  if (register) return register;
  switch (tab) {
    case 'soa': return <SoaTab doc={doc} canWrite={canWrite} onError={onError} onEdit={onEdit} />;
    case 'study-design':
      return <StudyDesignTab doc={doc} canWrite={canWrite} onChanged={onRefresh} onError={onError} onToast={onToast} />;
    case 'statistics': return <StudyDesignStatisticsTab onNav={onNav} />;
    default:
      return sec
        /* Keyed on the section: switching section replaces the pane rather
           than re-using it, so a stated reason, a chosen status and an unsaved
           draft can never carry from one part of the record to another. */
        ? <ProtocolSectionPane key={str(sec.id)} doc={doc as never} sec={sec as never} canWrite={canWrite} onAsk={onAsk} onSaved={onSaved} />
        : <div className="pd-pane"><div className="pg-empty">This protocol has no sections yet.</div></div>;
  }
}

/* ── Workspace ─────────────────────────────────────────────────────────── */

/** The last read failed, so the rows below are the previous version. Saying
 *  nothing would present them as current. */
function StaleNotice() {
  return (
    <div className="pde-refusal" role="alert">
      The protocol could not be re-read after the last change, so what is below is the
      last version that loaded rather than the current record. Reload the page to retry.
    </div>
  );
}

function TabStrip({ tab, onTab }: { tab: string; onTab: (id: string) => void }) {
  return (
    <div className="pd-tabs">{TABS.map((t) => (
      <button key={t.id} className={'pd-tab' + (tab === t.id ? ' on' : '')} onClick={() => onTab(t.id)}>
        <Ic n={t.icon} s={14} />{t.label}</button>))}</div>
  );
}

export function ProtocolWorkspaceDoc({ doc, onAsk, onNav, refreshing, reloadError, onChanged }: WorkspaceDocProps) {
  const [tab, setTab] = useState('document');
  const [activeSec, setActiveSec] = useState(str(doc.openSection));
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [reg, setReg] = useState<RegisterKind | null>(null);
  const [form, setForm] = useState<{ kind: PdevFormKind; target?: PdevFormTarget } | null>(null);
  const [toast, fireToast] = useToast();

  // The write routers key on the numeric protocol_documents id.
  const numericDocId = Number(doc.id);
  const canWrite = Number.isInteger(numericDocId) && numericDocId > 0;
  const sections = asRows(doc.sections);
  const sec = sections.find((s) => s.id === activeSec) ?? sections[0];
  const onSec = (s: Row) => { setActiveSec(str(s.id)); setTab(str(s.tab) || 'document'); };

  const openReg = (kind: RegisterKind) => {
    if (!canWrite) { fireToast('This protocol row has no numeric document id — governed writes need the governed store.', 'error'); return; }
    setReg(kind);
  };
  const openForm = (kind: PdevFormKind, target?: PdevFormTarget) => {
    if (!canWrite) { fireToast('This protocol row has no numeric document id — governed writes need the governed store.', 'error'); return; }
    setForm({ kind, target });
  };

  /* AnA can open any protocol section by its number or title — the same click
     a person makes. The parent's honest-state reads have already resolved to a
     real document, so there is no not-ready state to gate here. */
  useSurfaceActionHandlers('protocol-dev', {
    'protocol-dev.open-section': (params) => openSectionAction(sections, str(params.section), activeSec, onSec),
  });

  const runExport = async (v: Record<string, string>) => {
    const format = (v.format || 'docx') as 'docx' | 'pdf' | 'markdown';
    if (!canWrite) { fireToast('This protocol row has no numeric document id, so it cannot be assembled for export.', 'error'); return; }
    setExporting(true);
    try {
      fireToast(await exportProtocol(numericDocId, doc, format));
      setExportOpen(false);
    } catch (e) {
      fireToast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="pd-wrap">
      <ProtocolHeader
        doc={doc} canWrite={canWrite} exporting={exporting} refreshing={refreshing} onAsk={onAsk}
        onExport={() => setExportOpen(true)} onEditCover={() => openForm('cover-page', {
          defaults: { sponsor: str(doc.sponsor), principalInvestigator: str(doc.pi) || str(doc.principalInvestigator) },
        })}
      />
      {reloadError && <StaleNotice />}
      <TabStrip tab={tab} onTab={setTab} />
      <div className="pd-grid">
        <Outline doc={doc} activeSec={activeSec} onSec={onSec} onFinalize={() => openReg('finalize')} />
        <div className="pd-work">
          <TabBody
            tab={tab} doc={doc} sec={sec} canWrite={canWrite} onAsk={onAsk} onNav={onNav}
            onReg={openReg} onEdit={openForm}
            onSaved={() => { fireToast('Section saved — the revision is in the audit trail.'); onChanged?.(); }}
            onError={(m) => fireToast(m, 'error')}
            onToast={(m) => fireToast(m)}
            onRefresh={() => onChanged?.()}
          />
        </div>
      </div>
      {exportOpen && (
        <C2CForm
          config={{
            eyebrow: 'Protocol · export',
            title: 'Export protocol',
            sub: 'Assembled server-side from the governed document. Read-only — nothing about the protocol changes.',
            submitLabel: exporting ? 'Exporting…' : 'Export',
            fields: [{ key: 'format', label: 'Format', type: 'seg', options: ['docx', 'pdf', 'markdown'], default: 'docx' }],
          }}
          onCancel={() => setExportOpen(false)}
          onSubmit={runExport}
        />
      )}
      {reg && canWrite && (
        <ProtocolRegisterForm
          kind={reg}
          protocolDocumentId={numericDocId}
          onCancel={() => setReg(null)}
          onDone={(kind, result) => {
            setReg(null);
            fireToast(registerDoneMessage(kind, result));
            onChanged?.();
          }}
          onError={(m) => fireToast(m, 'error')}
        />
      )}
      {form && canWrite && (
        <ProtocolDevForm
          kind={form.kind}
          documentId={numericDocId}
          target={form.target}
          onCancel={() => setForm(null)}
          onDone={(kind) => { setForm(null); fireToast(FORM_DONE[kind]); onChanged?.(); }}
          onError={(m) => fireToast(m, 'error')}
        />
      )}
      <C2CToast msg={toast} />
    </div>);
}

/** What was written, said once, in the register's own words. */
const FORM_DONE: Record<PdevFormKind, string> = {
  'visit-add': 'Visit added — the schedule of assessments is re-read from the record.',
  'visit-rename': 'Visit saved — the schedule of assessments is re-read from the record.',
  'visit-remove': 'Visit removed — the schedule of assessments is re-read from the record.',
  'assessment-add': 'Assessment added — the schedule of assessments is re-read from the record.',
  'assessment-remove': 'Assessment removed — the schedule of assessments is re-read from the record.',
  'risk-residual': 'Residual rating recorded — the risk register is re-read from the record.',
  'budget-item': 'Budget line added — the roll-up is the budget engine’s.',
  'budget-params': 'Feasibility parameters saved — the verdict is the budget engine’s.',
  'review-request': 'Review requested — the reviewer is on the record.',
  'review-disposition': 'Disposition recorded as a signed governed action.',
  'cover-page': 'Cover page saved.',
  'start-protocol': 'Protocol started — its sections are seeded and on the record.',
};

function registerDoneMessage(kind: RegisterKind, result: Record<string, unknown> | null): string {
  if (kind !== 'finalize') return 'Recorded — the ' + kind + ' was written to the governed register.';
  const version = (result as { version?: string } | null)?.version;
  return 'Protocol finalized' + (version ? ' — now v' + version : '') +
    '. The completeness gate passed and the action is in the audit trail.';
}

/** AnA's "open section N" — resolved against the sections actually loaded. */
type SurfaceActionResult = { ok: true; detail?: string } | { ok: false; reason: string };

function openSectionAction(
  sections: Row[], raw: string, activeSec: string, onSec: (s: Row) => void,
): SurfaceActionResult {
  const needle = raw.trim().toLowerCase();
  if (!needle) return { ok: false, reason: 'Name a section by its number or title.' };
  if (sections.length === 0) return { ok: false, reason: 'This protocol has no sections recorded yet.' };
  const byNum = sections.filter((s) => str(s.num).toLowerCase() === needle);
  const hits = byNum.length ? byNum : sections.filter((s) => str(s.title).toLowerCase().includes(needle));
  if (hits.length === 0) return { ok: false, reason: `No protocol section matching "${raw}".` };
  if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} sections — name one exactly.` };
  const s = hits[0];
  if (activeSec === s.id) return { ok: true, detail: `Already on section ${str(s.num)} — ${str(s.title)}` };
  onSec(s);
  return { ok: true, detail: `Opened section ${str(s.num)} — ${str(s.title)}` };
}
