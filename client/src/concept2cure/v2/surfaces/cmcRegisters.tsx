import React from 'react';
import { I } from '../icons';
import { EmptyState, useLiveRows } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import type { C2CFormConfig } from '../C2CForm';
import { C2CForm } from '../C2CForm';
import { cmcProjectUuid, cmcWriteFailed, cmcWriteThrew } from './cmcShared';
import { C2CToast, useToast } from '../toast';
import {
  methodForm, methodBody,
  qcTestForm, qcTestBody, qcReviewForm, qcReviewBody,
  processValidationForm, processValidationBody,
  changeControlForm, changeControlBody,
  drugSubstanceForm, drugSubstanceBody,
  drugProductForm, drugProductBody,
  comparabilityForm, comparabilityBody,
  containerClosureForm, containerClosureBody, containerClosurePatch,
  referenceStandardForm, referenceStandardBody, referenceStandardPatch,
  impurityProfileForm, impurityProfileBody, impurityProfilePatch,
  dissolutionProfileForm, dissolutionProfileBody, dissolutionProfilePatch,
  materialSpecForm, materialSpecBody, materialSpecPatch,
  formulationRecordForm, formulationRecordBody, formulationRecordPatch,
  manufacturingProcessForm, manufacturingProcessBody, manufacturingProcessPatch,
  characterizationStudyForm, characterizationStudyBody, characterizationStudyPatch,
  qualifyForm, qualifyBody,
  asUserId,
} from './cmcRegisterForms';
import type {
  ContainerClosureRow,
  ReferenceStandardBody,
  ImpurityProfileBody,
  DissolutionProfileBody,
  MaterialSpecBody,
  FormulationRecordBody,
  ManufacturingProcessBody,
  CharacterizationStudyBody,
} from './cmcRegisterForms';
import { dissolutionPurposeSection } from '@shared/cmc/dissolution-purpose';
/* The SAME scope resolver the composer uses. A register that matched the three
   canonical strings exactly showed "--" for a row the composer was at that
   moment filing into §3.2.S.6 — the screen disagreeing with the dossier about
   one record. */
import {
  HUMAN_OR_ANIMAL_ORIGINS,
  isExcipientRole,
  isReviewRequiredOrigin,
  materialRoleSection,
  materialScopeSections,
} from '@shared/cmc/material-scope';
import { CHARACTERIZATION_TYPE_LABEL, characterizationTypeSection, normalizeCharacterizationType } from '@shared/cmc/characterization-type';
import { useAuth } from '@/services/portal/authService';

/* ═══════════════════════════════════════════════════════════════════
   CMC registers — real org-scoped data, read AND written honestly.

   Every card here is bound to an endpoint in server/api/cmc/routes.ts that
   ALREADY existed and already filters on organizationId server-side. These
   surfaces add no query, no route and no schema; they stop the UI from hiding
   data the backend was already serving.

   ── The half that was missing ─────────────────────────────────────────────
   These registers were read-only. Every one of the endpoints they read has had
   a matching create endpoint since the CMC schema landed, and each of those
   creates upserts a canonical Module 3 source object on write
   (services/cmc-write-through.ts) — the source layer
   POST /api/cmc/module3-os/compile/:projectId later composes §3.2.S / §3.2.P
   from. Binding only the GET half meant an analytical scientist could read the
   method library but not add a method, a QC analyst could see the testing file
   but not log a result, and the source layer Module 3 is built from could only
   ever be filled by something other than this product.

   `RegisterCard` therefore takes an optional `create` and optional
   `rowActions`. A register with neither behaves exactly as before. A register
   with them gets the whole write path — drawer, validation, awaited write,
   adoption of the SERVER's row, honest failure — written once here rather than
   eight times.

   Real-data standard (regulated product): a register renders REAL persisted
   rows, an honest EMPTY state, or an honest ERROR state — never an in-file
   fixture presented as content, and never a fabricated value.

   WHAT IS DELIBERATELY NOT RENDERED. Several of these endpoints return columns
   that cannot be shown faithfully in a table cell, so they are excluded rather
   than stringified into something that reads like content:
     • json/jsonb blobs (manufacturingProcess, specifications, testResults,
       criticalProcessParameters, …) — free-form documents, not table values.
     • user foreign keys (analyst, reviewedBy, leadValidator, approvedBy) —
       integer user ids that are meaningless on screen and would need a join.
     • Two of these handlers (`/qc-testing`, `/process-validation`) use a bare
       `db.select()`, so the payload carries EVERY column of the table. The
       column lists below are an explicit allowlist over that payload, not an
       assumption that the endpoint is already narrow.

   The one shared table renderer (RegisterCard) exists so the loading / error /
   empty triage is written once. Seven copies of that triage is seven chances
   for one of them to drift into claiming "nothing here yet" when the real
   answer was "the request failed".
   ═══════════════════════════════════════════════════════════════════ */

/* ── Shared status vocabulary ──
   Each CMC table carries its own status wording (validated / released / pass /
   implemented / …). They collapse onto three meanings; anything unrecognised
   stays neutral rather than being guessed into a green or red chip. */
export function cmcStatusTone(value: unknown): string {
  const v = String(value ?? '').toLowerCase().replace(/[\s-]/g, '_');
  if (['approved', 'implemented', 'closed', 'completed', 'validated', 'released', 'pass', 'passed', 'active', 'verification'].includes(v)) return 'ok';
  if (['review', 'in_review', 'pending', 'paused', 'on_hold', 'planning', 'qualification', 'validation', 'development', 'design', 'draft'].includes(v)) return 'warn';
  if (['rejected', 'fail', 'failed', 'retired', 'cancelled', 'canceled'].includes(v)) return 'err';
  return 'dim';
}

/** Status chip. Renders the backend's own wording — never a relabelled value. */
function chip(value: unknown, fallback = '--') {
  const text = value == null || value === '' ? fallback : String(value);
  return <span className={'rd-chip tone-' + cmcStatusTone(value)}>{text}</span>;
}

/**
 * An assessed risk level. Risk runs the OPPOSITE way to the status vocabulary —
 * "high" is the alarming end, not the good one — so it cannot share
 * cmcStatusTone, which would have rendered a high-risk change as a neutral grey
 * chip because "high" is in none of its lists.
 */
function riskChip(level: unknown): React.ReactNode {
  const v = String(level ?? '').toLowerCase();
  if (!v) return '--';
  const tone = v === 'high' ? 'err' : v === 'medium' || v === 'med' ? 'warn' : v === 'low' ? 'ok' : 'dim';
  return <span className={'rd-chip tone-' + tone}>{v}</span>;
}

/** A timestamp rendered as a plain date, or "--" when absent/unparseable. */
function fmtDate(value: unknown): string {
  if (value == null || value === '') return '--';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? '--' : d.toLocaleDateString();
}

/** Plain text cell that degrades to an em dash rather than "null"/"undefined". */
function text(value: unknown, fallback = '--'): React.ReactNode {
  return value == null || value === '' ? fallback : String(value);
}

export interface RegisterColumn<T> {
  header: string;
  render: (row: T) => React.ReactNode;
  mono?: boolean;
  bold?: boolean;
}

/** Creating a row in a register: the drawer, the endpoint, and the mapping. */
export interface RegisterCreate {
  /** Button label, e.g. "Add method". */
  label: string;
  /** What the toast calls this record, e.g. "analytical method". */
  subject: string;
  /** POST endpoint. */
  path: string;
  form: () => C2CFormConfig;
  /** Form values → request body. `projectId` is the project in context. */
  toBody: (values: Record<string, string>, projectId?: string) => unknown;
  /**
   * When true the create button is disabled without a project in context.
   * Only for endpoints whose write-through to the Module 3 canonical layer is
   * keyed by project — a create without one silently loses that linkage.
   */
  needsProject?: boolean;
}

/** A per-row action: a second drawer that PUTs against one row. */
export interface RegisterRowAction<T> {
  label: string;
  icon?: React.ReactNode;
  subject: string;
  /** Hide the action for rows it does not apply to. */
  when?: (row: T) => boolean;
  /** Disabled-with-reason, for rows where the action exists but is not allowed. */
  disabledReason?: (row: T) => string | null;
  form: (row: T) => C2CFormConfig;
  path: (row: T) => string;
  method?: 'PUT' | 'POST' | 'PATCH';
  toBody: (values: Record<string, string>, row: T, projectId?: string) => unknown;
}

interface RegisterCardProps<T> {
  /** Endpoint path. useLiveRows unwraps the { success, data } envelope. */
  path: string;
  title: string;
  /** Sub-header, computed from the loaded rows (counts, ratios). */
  meta: (rows: T[]) => React.ReactNode;
  icon: React.ReactNode;
  loadingTitle: string;
  emptyTitle: string;
  emptyHint: React.ReactNode;
  errorTitle: string;
  errorHint: React.ReactNode;
  columns: RegisterColumn<T>[];
  rowKey: (row: T, index: number) => React.Key;
  style?: React.CSSProperties;
  create?: RegisterCreate;
  rowActions?: RegisterRowAction<T>[];
  /** Called with the adopted server row after any successful write. */
  onWrite?: (row: T) => void;
}

/**
 * One register: a real table, or one of the three honest states, plus the
 * write path when the register has one.
 *
 * `rows` from useLiveRows is always an array (empty on error too), so the
 * zero-row branch must distinguish loading / error / genuinely-empty — an
 * error rendered as "nothing here yet" would be a lie about the data.
 *
 * Writes are AWAITED and the SERVER's row is adopted — the persisted id and the
 * values the database actually accepted, not the values that were typed. On any
 * failure nothing is added to the table and the toast says so: a register that
 * optimistically shows a row the database rejected is the worst of the three
 * states, because it looks like the honest one.
 */
export function RegisterCard<T>({
  path, title, meta, icon, loadingTitle, emptyTitle, emptyHint,
  errorTitle, errorHint, columns, rowKey, style, create, rowActions, onWrite,
}: RegisterCardProps<T>) {
  const live = useLiveRows<T>(path);
  const projectId = cmcProjectUuid();
  const [toast, fireToast] = useToast();
  const [creating, setCreating] = React.useState(false);
  const [acting, setActing] = React.useState<{ action: RegisterRowAction<T>; row: T } | null>(null);

  /* The live file seeds a local working set so a write shows immediately
     without a refetch. `live.rows` is a stable reference between renders (it
     changes only when the fetch re-resolves), so this seeding does not loop and
     does not discard rows the user just added. */
  const [rows, setRows] = React.useState<T[]>([]);
  const seededRef = React.useRef<T[] | null>(null);
  React.useEffect(() => {
    if (live.loading || live.error) return;
    if (live.rows !== seededRef.current) {
      seededRef.current = live.rows;
      setRows(live.rows);
    }
  }, [live.loading, live.error, live.rows]);

  const adopt = (json: unknown): T | null => {
    const row = (json as { data?: T } | null)?.data;
    return row && typeof row === 'object' ? row : null;
  };

  const submitCreate = async (values: Record<string, string>) => {
    if (!create) return;
    if (create.needsProject && !projectId) {
      fireToast('Open a program first — this record is filed per project.', 'error');
      return;
    }
    try {
      const res = await apiRequest('POST', create.path, create.toBody(values, projectId));
      const json = await res.json().catch(() => null);
      if (!res.ok) { fireToast(cmcWriteFailed(create.subject, json, res.status), 'error'); return; }
      const row = adopt(json);
      if (!row) { fireToast('Saved, but the server returned an unexpected shape — reload to see it.', 'error'); return; }
      setRows((rs) => [row, ...rs]);
      onWrite?.(row);
      setCreating(false);
      /* A record created with no program in context persists org-wide but the
         Module 3 write-through never fires for it (the server skips canonical
         propagation without a projectId) — a fact the person filing it needs
         at the moment of filing, not one to discover at compile time. */
      fireToast(
        `${create.subject.charAt(0).toUpperCase() + create.subject.slice(1)} saved.` +
          (projectId
            ? ''
            : ' Not linked to a program — it will not feed a Module 3 build until a program links it.'),
      );
    } catch (e) {
      fireToast(cmcWriteThrew(create.subject, e), 'error');
    }
  };

  const submitAction = async (values: Record<string, string>) => {
    if (!acting) return;
    const { action, row: target } = acting;
    try {
      const res = await apiRequest(
        action.method ?? 'PUT',
        action.path(target),
        action.toBody(values, target, projectId),
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) { fireToast(cmcWriteFailed(action.subject, json, res.status), 'error'); return; }
      const updated = adopt(json);
      if (!updated) { fireToast('Saved, but the server returned an unexpected shape — reload to see it.', 'error'); return; }
      const key = rowKey(target, -1);
      setRows((rs) => rs.map((r, i) => (rowKey(r, i) === key ? updated : r)));
      onWrite?.(updated);
      setActing(null);
      fireToast(`${action.subject.charAt(0).toUpperCase() + action.subject.slice(1)} saved.`);
    } catch (e) {
      fireToast(cmcWriteThrew(action.subject, e), 'error');
    }
  };

  const visibleActions = (row: T) => (rowActions ?? []).filter((a) => !a.when || a.when(row));
  const hasActions = rows.some((r) => visibleActions(r).length > 0);

  return (
    <div className="pj-card" style={style ?? { marginTop: 16 }}>
      <div className="pj-card-h">
        <span className="t">{title}</span>
        <span className="s">{meta(rows)}</span>
        {create && (
          <button
            className="nda-open cm-reg-add"
            onClick={() => setCreating(true)}
            disabled={create.needsProject && !projectId}
            title={create.needsProject && !projectId ? 'Open a program to file this record' : ''}
          >
            {I.plus} {create.label}
          </button>
        )}
      </div>
      <div className="pj-card-b" style={{ padding: 0 }}>
        {rows.length === 0 ? (
          <div style={{ padding: 12 }}>
            {live.loading ? (
              <EmptyState icon={icon} title={loadingTitle} busy testId={`register-loading-${title}`} />
            ) : live.error ? (
              <EmptyState tone="error" icon={I.alertTriangle} title={errorTitle} hint={errorHint} testId={`register-error-${title}`} />
            ) : (
              <EmptyState icon={icon} title={emptyTitle} hint={emptyHint} />
            )}
          </div>
        ) : (
          <table className="reg-tbl">
            <thead>
              <tr>
                {columns.map((c, i) => <th key={i}>{c.header}</th>)}
                {hasActions && <th style={{ textAlign: 'right' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={rowKey(r, i)}>
                  {columns.map((c, j) => (
                    <td key={j} className={c.mono ? 'mono' : undefined} style={c.bold ? { fontWeight: 600 } : undefined}>
                      {c.render(r)}
                    </td>
                  ))}
                  {hasActions && (
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {visibleActions(r).map((a, k) => {
                        const blocked = a.disabledReason ? a.disabledReason(r) : null;
                        return (
                          <button
                            key={k}
                            className="nda-open"
                            style={k ? { marginLeft: 6 } : undefined}
                            disabled={Boolean(blocked)}
                            title={blocked ?? ''}
                            onClick={() => setActing({ action: a, row: r })}
                          >
                            {a.icon ?? I.penLine} {a.label}
                          </button>
                        );
                      })}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {creating && create && (
        <C2CForm config={create.form()} onCancel={() => setCreating(false)} onSubmit={submitCreate} />
      )}
      {acting && (
        <C2CForm config={acting.action.form(acting.row)} onCancel={() => setActing(null)} onSubmit={submitAction} />
      )}
      <C2CToast msg={toast} />
    </div>
  );
}

/* ═══════════ Analytical methods — GET /api/cmc/analytical-methods ═══════════ */

/** Projected by the handler: id, methodCode, title, technique, purpose,
 *  analyte, matrix, validationDate, ichQ2Parameters, status. */
export interface AnalyticalMethodApiRow {
  id: number;
  methodCode: string;
  title: string;
  technique: string | null;
  purpose: string | null;
  analyte?: string | null;
  matrix?: string | null;
  validationDate?: string | null;
  ichQ2Parameters?: { characteristics?: string[]; summary?: string } | null;
  status: string | null;
}

/** An API method row → the edit form's defaults, without inventing anything. */
function methodDefaults(r: AnalyticalMethodApiRow) {
  return {
    methodCode: r.methodCode ?? '',
    title: r.title ?? '',
    technique: r.technique ?? '',
    purpose: r.purpose ?? '',
    analyte: r.analyte ?? '',
    matrix: r.matrix ?? '',
    status: r.status ?? 'development',
    validationDate: r.validationDate ?? undefined,
    ichQ2Parameters: {
      characteristics: r.ichQ2Parameters?.characteristics ?? [],
      summary: r.ichQ2Parameters?.summary,
    },
  };
}

/**
 * The org-wide analytical method library (analytical_methods). The
 * Specifications tab warns "no method" per specification and blocks approval
 * until a method is validated (ICH Q2) — this is the inventory that warning
 * points at, and now the place an analytical scientist fills it. Org-scoped,
 * so it needs no project in context; `projectId` is still forwarded when a
 * program is open so the method feeds that project's §3.2.S.4 / §3.2.P.5.
 */
export function CmMethodLibrary() {
  return (
    <RegisterCard<AnalyticalMethodApiRow>
      path="/api/cmc/analytical-methods"
      title="Analytical method library"
      meta={(rows) => {
        const validated = rows.filter((r) => String(r.status || '').toLowerCase() === 'validated').length;
        return `organization-wide — ICH Q2 -- ${validated}/${rows.length} validated`;
      }}
      icon={I.clipboardList}
      loadingTitle="Loading analytical methods…"
      emptyTitle="No analytical methods yet"
      emptyHint="Validated analytical procedures (HPLC, GC, UV-VIS, …) appear here as your organization records them. A specification cannot be approved until its method is validated (ICH Q2) — use Add method to record the first one."
      errorTitle="Couldn’t load analytical methods"
      errorHint="The org-scoped method library didn’t load. Sign in and try again."
      rowKey={(r) => r.id}
      create={{
        label: 'Add method',
        subject: 'analytical method',
        path: '/api/cmc/analytical-methods',
        form: () => methodForm(null),
        toBody: (v, projectId) => methodBody(v, projectId),
      }}
      rowActions={[
        {
          label: 'Edit',
          subject: 'analytical method',
          form: (r) => methodForm(methodDefaults(r)),
          path: (r) => `/api/cmc/analytical-methods/${r.id}`,
          toBody: (v, _r, projectId) => methodBody(v, projectId),
        },
      ]}
      columns={[
        { header: 'Code', render: (r) => r.methodCode, mono: true, bold: true },
        { header: 'Method', render: (r) => r.title },
        { header: 'Technique', render: (r) => text(r.technique) },
        { header: 'Analyte', render: (r) => text(r.analyte) },
        { header: 'Matrix', render: (r) => text(r.matrix) },
        { header: 'Purpose', render: (r) => text(r.purpose) },
        { header: 'Validated', render: (r) => fmtDate(r.validationDate) },
        { header: 'Status', render: (r) => chip(r.status, 'development') },
      ]}
    />
  );
}

/* ═══════════ QC testing — GET /api/cmc/qc-testing ═══════════ */

/* The handler is a bare db.select(), so the payload carries every qc_testing
   column. testResults / specifications (json), and the analyst / reviewedBy
   user ids, are intentionally omitted — see the file header. */
export interface QcTestApiRow {
  id: number;
  sampleId: string;
  sampleType: string;
  testMethod: string;
  passFailStatus: string | null;
  testDate: string | null;
  releaseDate: string | null;
  testResults?: { value?: string; unit?: string; observation?: string } | null;
  specifications?: { acceptanceCriteria?: string } | null;
  certificateOfAnalysis?: string | null;
  analyst?: number | null;
  reviewedBy?: number | null;
}

/** The recorded measurement, rendered with its unit, or an em dash. */
function qcResultValue(r: QcTestApiRow): React.ReactNode {
  const value = r.testResults?.value;
  if (!value) return '--';
  return r.testResults?.unit ? `${value} ${r.testResults.unit}` : value;
}

/**
 * QC testing completes the chain the Specifications tab describes:
 * a specification sets the limit, a method says how it is measured, and a QC
 * test is the measurement actually performed against it.
 *
 * Two roles work this register. The analyst records the result; a second person
 * reviews it and sets the disposition and release date — the `reviewed_by` and
 * `release_date` columns exist for exactly that separation, and the review
 * action is what finally writes them.
 */
export function CmQcTesting() {
  const { user } = useAuth();
  const currentUserId = asUserId(user?.id);
  return (
    <RegisterCard<QcTestApiRow>
      path="/api/cmc/qc-testing"
      title="QC testing"
      meta={(rows) => {
        const pass = rows.filter((r) => String(r.passFailStatus || '').toLowerCase() === 'pass').length;
        const fail = rows.filter((r) => String(r.passFailStatus || '').toLowerCase() === 'fail').length;
        const awaiting = rows.filter((r) => !r.reviewedBy).length;
        return `${rows.length} samples -- ${pass} pass / ${fail} fail -- ${awaiting} awaiting review`;
      }}
      icon={I.microscope}
      loadingTitle="Loading QC testing records…"
      emptyTitle="No QC testing records yet"
      emptyHint="Samples tested against your specifications — raw material, in-process and finished product — appear here with their pass/fail disposition. Use Log result to record the first one."
      errorTitle="Couldn’t load QC testing records"
      errorHint="The org-scoped QC testing file didn’t load. Sign in and try again."
      rowKey={(r) => r.id}
      create={{
        label: 'Log result',
        subject: 'QC result',
        path: '/api/cmc/qc-testing',
        form: qcTestForm,
        toBody: (v, projectId) => qcTestBody(v, currentUserId, projectId),
      }}
      rowActions={[
        {
          label: 'Review',
          icon: I.fileCheck,
          subject: 'QC review',
          form: (r) => qcReviewForm(r.sampleId, String(r.passFailStatus ?? 'pending')),
          path: (r) => `/api/cmc/qc-testing/${r.id}`,
          toBody: (v, _r, projectId) => qcReviewBody(v, currentUserId, projectId),
          /* Second-person review means a different person. The analyst on the
             record is compared against the signed-in user and the action is
             refused — with the reason on the button — rather than accepted and
             recorded as a review it is not. */
          disabledReason: (r) =>
            currentUserId && r.analyst === currentUserId
              ? 'You recorded this result — QC review must be a second person'
              : null,
        },
      ]}
      columns={[
        { header: 'Sample', render: (r) => r.sampleId, mono: true, bold: true },
        { header: 'Type', render: (r) => r.sampleType },
        { header: 'Method', render: (r) => r.testMethod },
        { header: 'Result', render: qcResultValue },
        { header: 'Specification', render: (r) => text(r.specifications?.acceptanceCriteria) },
        { header: 'Disposition', render: (r) => chip(r.passFailStatus, 'pending') },
        { header: 'Reviewed', render: (r) => (r.reviewedBy ? <span className="rd-chip tone-ok">verified</span> : <span className="rd-chip tone-warn">awaiting</span>) },
        { header: 'Tested', render: (r) => fmtDate(r.testDate) },
        { header: 'Released', render: (r) => fmtDate(r.releaseDate) },
      ]}
    />
  );
}

/* ═══════════ Change control — GET /api/cmc/change-control ═══════════ */

export interface ChangeControlApiRow {
  id: number;
  changeNumber: string;
  changeType: string | null;
  description: string | null;
  justification?: string | null;
  regulatoryFiling: string | null;
  status: string | null;
  riskAssessment?: { level?: string } | null;
  impactAssessment?: { summary?: string; impactedSections?: string[] } | null;
  implementationDate?: string | null;
}

/** An API change row → the edit form's defaults. */
function changeDefaults(r: ChangeControlApiRow) {
  return {
    changeNumber: r.changeNumber ?? '',
    changeType: r.changeType ?? '',
    description: r.description ?? '',
    justification: r.justification ?? '',
    regulatoryFiling: r.regulatoryFiling ?? '',
    status: r.status ?? 'draft',
    riskAssessment: { level: r.riskAssessment?.level ?? 'medium' },
    impactAssessment: {
      summary: r.impactAssessment?.summary,
      impactedSections: r.impactAssessment?.impactedSections ?? [],
    },
    implementationDate: r.implementationDate ?? undefined,
  };
}

/**
 * The changes actually logged for the organization (cmc_change_control).
 * The simulator alongside this computes a what-if filing path over canonical
 * SUPAC / ICH Q12 rules; this is the real register behind it.
 */
export function CmChangeRegister() {
  const CLOSED = ['approved', 'implemented', 'closed', 'rejected'];
  return (
    <RegisterCard<ChangeControlApiRow>
      path="/api/cmc/change-control"
      title="Change-control register"
      meta={(rows) => {
        const open = rows.filter((r) => !CLOSED.includes(String(r.status || '').toLowerCase())).length;
        return `organization-wide -- ${open} open — ICH Q12`;
      }}
      icon={I.gitBranch}
      loadingTitle="Loading change-control records…"
      emptyTitle="No change-control records yet"
      emptyHint="Logged CMC changes — with their type, filing category and status — appear here. Use the simulator above to model a change, then Raise change to put it under control."
      errorTitle="Couldn’t load change-control records"
      errorHint="The org-scoped change-control register didn’t load. Sign in and try again."
      rowKey={(r) => r.id}
      create={{
        label: 'Raise change',
        subject: 'change record',
        path: '/api/cmc/change-control',
        form: () => changeControlForm(null),
        toBody: (v, projectId) => changeControlBody(v, projectId),
      }}
      rowActions={[
        {
          label: 'Update',
          subject: 'change record',
          form: (r) => changeControlForm(changeDefaults(r)),
          path: (r) => `/api/cmc/change-control/${r.id}`,
          toBody: (v, _r, projectId) => changeControlBody(v, projectId),
        },
      ]}
      columns={[
        { header: 'Change', render: (r) => r.changeNumber, mono: true, bold: true },
        { header: 'Type', render: (r) => text(r.changeType) },
        { header: 'Description', render: (r) => text(r.description) },
        { header: 'Risk', render: (r) => riskChip(r.riskAssessment?.level) },
        { header: 'Filing', render: (r) => (r.regulatoryFiling ? r.regulatoryFiling : <span className="cm-meta">not set</span>) },
        { header: 'Implementation', render: (r) => fmtDate(r.implementationDate) },
        { header: 'Status', render: (r) => chip(r.status, 'draft') },
      ]}
    />
  );
}

/* ═══════════ Comparability — GET /api/cmc/comparability-studies ═══════════ */

/* Aliased by the handler's SQL: assessment_name→title, changed_element→product,
   change_type→type, affected_process_parameters→methods (jsonb, defaulted to
   [] server-side), justification→outcome, reviewed_by→owner.
   `methods` holds free-form jsonb whose element shape is not guaranteed, so it
   is summarised as a count rather than joined into text that could render as
   "[object Object]". `outcome` (the justification narrative) and `owner` are
   omitted: the first is prose that does not belong in a table cell, the second
   has no guaranteed display form. */
export interface ComparabilityApiRow {
  id: number | string;
  title: string | null;
  product: string | null;
  type: string | null;
  status: string | null;
  methods: unknown[] | null;
  createdAt: string | null;
  /** justification, aliased by the handler. Carried so an edit round-trips
   *  rather than blanking the narrative that is already on file. */
  outcome?: string | null;
}

/**
 * ICH Q5E comparability assessments. Pairs with change control: a change of
 * any consequence carries a comparability obligation, and this is where the
 * assessments raised against those changes are recorded.
 */
export function CmComparabilityStudies() {
  return (
    <RegisterCard<ComparabilityApiRow>
      path="/api/cmc/comparability-studies"
      title="Comparability assessments"
      meta={(rows) => `ICH Q5E -- ${rows.length} ${rows.length === 1 ? 'assessment' : 'assessments'}`}
      icon={I.gitCompare}
      loadingTitle="Loading comparability assessments…"
      emptyTitle="No comparability assessments yet"
      emptyHint="ICH Q5E assessments — the pre- and post-change comparison behind a manufacturing change — appear here once raised for your organization."
      errorTitle="Couldn’t load comparability assessments"
      errorHint="The org-scoped comparability file didn’t load. Sign in and try again."
      rowKey={(r) => String(r.id)}
      create={{
        label: 'Raise assessment',
        subject: 'comparability assessment',
        path: '/api/cmc/comparability-studies',
        form: () => comparabilityForm(null),
        toBody: (v, projectId) => comparabilityBody(v, projectId),
        /* The handler writes `project_id` straight from the body and keys its
           Module 3 write-through off the returned row, so an assessment raised
           without a project in context never reaches §3.2.P.2 / §3.2.P.8. */
        needsProject: true,
      }}
      rowActions={[
        {
          label: 'Edit',
          subject: 'comparability assessment',
          form: (r) => comparabilityForm({
            title: r.title ?? '',
            product: r.product ?? '',
            type: r.type ?? 'process',
            status: r.status ?? 'draft',
            methods: (Array.isArray(r.methods) ? r.methods : []).map((m) => String(m)),
            outcome: r.outcome ?? '',
          }),
          path: (r) => `/api/cmc/comparability-studies/${r.id}`,
          toBody: (v, _r, projectId) => comparabilityBody(v, projectId),
        },
      ]}
      columns={[
        { header: 'Assessment', render: (r) => text(r.title, 'Untitled assessment'), bold: true },
        { header: 'Changed element', render: (r) => text(r.product) },
        { header: 'Change type', render: (r) => text(r.type) },
        {
          header: 'Parameters',
          render: (r) => {
            const n = Array.isArray(r.methods) ? r.methods.length : 0;
            return n === 0 ? '--' : `${n} affected`;
          },
        },
        { header: 'Raised', render: (r) => fmtDate(r.createdAt) },
        { header: 'Status', render: (r) => chip(r.status, 'draft') },
      ]}
    />
  );
}

/* ═══════════ Process validation — GET /api/cmc/process-validation ═══════════ */

/* Bare db.select() — the payload carries every process_validation column. The
   json control-strategy / CPP / CQA columns and the leadValidator / approvedBy
   user ids are intentionally omitted; validationProtocol / validationReport are
   document references rather than table values. */
export interface ProcessValidationApiRow {
  id: number;
  processName: string;
  stage: string;
  batchNumbers: string[] | null;
  status: string;
  approvalDate: string | null;
  criticalProcessParameters?: { parameters?: string[] } | null;
  criticalQualityAttributes?: { attributes?: string[] } | null;
  controlStrategy?: { summary?: string } | null;
  validationProtocol?: string | null;
}

/** An API process-validation row → the edit form's defaults. */
function pvDefaults(r: ProcessValidationApiRow) {
  return {
    processName: r.processName ?? '',
    stage: r.stage ?? 'design',
    status: r.status ?? 'planning',
    batchNumbers: r.batchNumbers ?? [],
    criticalProcessParameters: { parameters: r.criticalProcessParameters?.parameters ?? [] },
    criticalQualityAttributes: { attributes: r.criticalQualityAttributes?.attributes ?? [] },
    controlStrategy: { summary: r.controlStrategy?.summary },
    validationProtocol: r.validationProtocol ?? '',
    approvalDate: r.approvalDate ?? undefined,
  };
}

/**
 * Process validation across the three-stage lifecycle (design →
 * qualification → continued verification). Sits with batch records because
 * both describe the manufacturing process as actually run.
 */
export function CmProcessValidation() {
  return (
    <RegisterCard<ProcessValidationApiRow>
      path="/api/cmc/process-validation"
      title="Process validation"
      meta={(rows) => {
        const done = rows.filter((r) => cmcStatusTone(r.status) === 'ok').length;
        return `${rows.length} ${rows.length === 1 ? 'process' : 'processes'} -- ${done} complete — 3-stage lifecycle`;
      }}
      icon={I.workflow}
      loadingTitle="Loading process validation…"
      emptyTitle="No process validation records yet"
      emptyHint="Validation across the three-stage lifecycle — process design, qualification and continued verification — appears here once recorded for your organization."
      errorTitle="Couldn’t load process validation"
      errorHint="The org-scoped process validation file didn’t load. Sign in and try again."
      rowKey={(r) => r.id}
      create={{
        label: 'Add record',
        subject: 'process validation record',
        path: '/api/cmc/process-validation',
        form: () => processValidationForm(null),
        toBody: (v, projectId) => processValidationBody(v, projectId),
      }}
      rowActions={[
        {
          label: 'Advance',
          icon: I.workflow,
          subject: 'process validation record',
          form: (r) => processValidationForm(pvDefaults(r)),
          path: (r) => `/api/cmc/process-validation/${r.id}`,
          toBody: (v, _r, projectId) => processValidationBody(v, projectId),
        },
      ]}
      columns={[
        { header: 'Process', render: (r) => r.processName, bold: true },
        { header: 'Stage', render: (r) => text(r.stage) },
        {
          header: 'Batches',
          render: (r) => {
            const n = Array.isArray(r.batchNumbers) ? r.batchNumbers.length : 0;
            return n === 0 ? '--' : `${n} ${n === 1 ? 'batch' : 'batches'}`;
          },
        },
        {
          header: 'CPP / CQA',
          render: (r) => {
            const cpp = r.criticalProcessParameters?.parameters?.length ?? 0;
            const cqa = r.criticalQualityAttributes?.attributes?.length ?? 0;
            return cpp || cqa ? `${cpp} / ${cqa}` : '--';
          },
        },
        { header: 'Approved', render: (r) => fmtDate(r.approvalDate) },
        { header: 'Status', render: (r) => chip(r.status, 'planning') },
      ]}
    />
  );
}

/* ═══════════ Drug substance §3.2.S — GET /api/cmc/drug-substances ═══════════ */

/* Projected by the handler: id, substanceName, casNumber, molecularFormula,
   molecularWeight, manufacturingProcess, createdAt, updatedAt. The projection
   carries NO status column, so none is rendered. molecularWeight is a pg
   `decimal`, which the driver returns as a string — never coerced to a number
   for display. manufacturingProcess is json and is omitted. */
export interface DrugSubstanceApiRow {
  id: number;
  substanceName: string;
  casNumber: string | null;
  molecularFormula: string | null;
  molecularWeight: string | number | null;
  inn?: string | null;
  structuralFormula?: string | null;
  manufacturingProcess?: { manufacturer?: string; route?: string; site?: string } | null;
  status?: string | null;
  developmentPhase?: string | null;
}

/** An API drug-substance row → the edit form's defaults. */
function dsDefaults(r: DrugSubstanceApiRow) {
  return {
    substanceName: r.substanceName ?? '',
    inn: r.inn ?? '',
    casNumber: r.casNumber ?? '',
    molecularFormula: r.molecularFormula ?? '',
    // pg returns `decimal` as a string; it is never coerced to a number.
    molecularWeight: r.molecularWeight == null ? '' : String(r.molecularWeight),
    structuralFormula: r.structuralFormula ?? '',
    manufacturingProcess: {
      manufacturer: r.manufacturingProcess?.manufacturer,
      route: r.manufacturingProcess?.route,
      site: r.manufacturingProcess?.site,
    },
    status: r.status ?? 'development',
    developmentPhase: r.developmentPhase ?? '',
  };
}

/** The §3.2.S drug-substance inventory the Module 3 blueprint composes from. */
export function CmDrugSubstances() {
  return (
    <RegisterCard<DrugSubstanceApiRow>
      path="/api/cmc/drug-substances"
      title="Drug substance"
      meta={(rows) => `§3.2.S -- ${rows.length} ${rows.length === 1 ? 'substance' : 'substances'}`}
      icon={I.atom}
      loadingTitle="Loading drug substances…"
      emptyTitle="No drug substances yet"
      emptyHint="Your active substances (§3.2.S) — with CAS number, molecular formula and weight — appear here. They are the quality data the Module 3 blueprint composes from; use Add substance to record the first one."
      errorTitle="Couldn’t load drug substances"
      errorHint="The org-scoped drug-substance file didn’t load. Sign in and try again."
      rowKey={(r) => r.id}
      create={{
        label: 'Add substance',
        subject: 'drug substance',
        path: '/api/cmc/drug-substances',
        form: () => drugSubstanceForm(null),
        toBody: (v, projectId) => drugSubstanceBody(v, projectId),
      }}
      rowActions={[
        {
          label: 'Edit',
          subject: 'drug substance',
          form: (r) => drugSubstanceForm(dsDefaults(r)),
          path: (r) => `/api/cmc/drug-substances/${r.id}`,
          toBody: (v, _r, projectId) => drugSubstanceBody(v, projectId),
        },
      ]}
      columns={[
        { header: 'Substance', render: (r) => r.substanceName, bold: true },
        { header: 'INN', render: (r) => text(r.inn) },
        { header: 'CAS number', render: (r) => text(r.casNumber), mono: true },
        { header: 'Molecular formula', render: (r) => text(r.molecularFormula), mono: true },
        { header: 'Molecular weight', render: (r) => text(r.molecularWeight) },
        { header: 'Phase', render: (r) => text(r.developmentPhase) },
        { header: 'Status', render: (r) => chip(r.status, 'development') },
      ]}
    />
  );
}

/* ═══════════ Drug product §3.2.P — GET /api/cmc/drug-products ═══════════ */

/* Projected by the handler: id, productName, dosageForm, strength,
   routeOfAdministration, manufacturingProcess, createdAt, updatedAt. As with
   drug substance the projection carries no status column, and the json
   manufacturingProcess is omitted. */
export interface DrugProductApiRow {
  id: number;
  productName: string;
  dosageForm: string;
  strength: string;
  routeOfAdministration: string | null;
  composition?: { description?: string } | null;
  manufacturingProcess?: { description?: string; site?: string } | null;
  packagingMaterials?: { containerClosure?: string } | null;
  status?: string | null;
}

/** An API drug-product row → the edit form's defaults. */
function dpDefaults(r: DrugProductApiRow) {
  return {
    productName: r.productName ?? '',
    dosageForm: r.dosageForm ?? '',
    strength: r.strength ?? '',
    routeOfAdministration: r.routeOfAdministration ?? '',
    composition: { description: r.composition?.description },
    manufacturingProcess: {
      description: r.manufacturingProcess?.description,
      site: r.manufacturingProcess?.site,
    },
    packagingMaterials: { containerClosure: r.packagingMaterials?.containerClosure },
    status: r.status ?? 'development',
  };
}

/** The §3.2.P drug-product inventory, the counterpart to drug substance. */
export function CmDrugProducts() {
  return (
    <RegisterCard<DrugProductApiRow>
      path="/api/cmc/drug-products"
      title="Drug product"
      meta={(rows) => `§3.2.P -- ${rows.length} ${rows.length === 1 ? 'product' : 'products'}`}
      icon={I.beaker}
      loadingTitle="Loading drug products…"
      emptyTitle="No drug products yet"
      emptyHint="Your finished products (§3.2.P) — dosage form, strength and route of administration — appear here alongside the substances they are formulated from. Use Add product to record the first one."
      errorTitle="Couldn’t load drug products"
      errorHint="The org-scoped drug-product file didn’t load. Sign in and try again."
      rowKey={(r) => r.id}
      create={{
        label: 'Add product',
        subject: 'drug product',
        path: '/api/cmc/drug-products',
        form: () => drugProductForm(null),
        toBody: (v, projectId) => drugProductBody(v, projectId),
      }}
      rowActions={[
        {
          label: 'Edit',
          subject: 'drug product',
          form: (r) => drugProductForm(dpDefaults(r)),
          path: (r) => `/api/cmc/drug-products/${r.id}`,
          toBody: (v, _r, projectId) => drugProductBody(v, projectId),
        },
      ]}
      columns={[
        { header: 'Product', render: (r) => r.productName, bold: true },
        { header: 'Dosage form', render: (r) => text(r.dosageForm) },
        { header: 'Strength', render: (r) => text(r.strength) },
        { header: 'Route', render: (r) => text(r.routeOfAdministration) },
        { header: 'Container closure', render: (r) => text(r.packagingMaterials?.containerClosure) },
        { header: 'Status', render: (r) => chip(r.status, 'development') },
      ]}
    />
  );
}

/* ═══════════ Container closure systems — GET /api/cmc/container-closures ═════ */

export interface ContainerClosureApiRow {
  id: number;
  projectId?: string | null;
  scope: string;
  systemName: string;
  componentType: string | null;
  containerDescription: string;
  closureDescription: string;
  supplier?: string | null;
  compendialStandards?: string[] | null;
  suitabilityJustification?: string | null;
  materialsOfConstruction?: Array<Record<string, string>> | null;
  extractablesLeachables?: {
    studyType?: string;
    protocol?: string;
    analyticalEvaluationThreshold?: string;
    conclusion?: string;
    results?: Array<Record<string, string>>;
  } | null;
  integrityTesting?: { method?: string; acceptanceCriteria?: string; result?: string } | null;
  status: string;
  qualificationDate?: string | null;
}

/**
 * What the E&L record actually holds — never "yes" for an opened-and-abandoned
 * form. A study with no per-analyte results is reported as a study with no
 * results, which is what the composed section says about it too.
 */
function elSummary(r: ContainerClosureApiRow): React.ReactNode {
  const el = r.extractablesLeachables;
  if (!el || Object.keys(el).length === 0) return '--';
  const results = Array.isArray(el.results) ? el.results.length : 0;
  if (results > 0) return `${results} analyte${results === 1 ? '' : 's'}`;
  return <span className="rd-chip tone-warn">no results</span>;
}

/**
 * The container closure register — the capture path §3.2.S.6 and §3.2.P.7 never
 * had. `Evidence for` is the column that decides which of the two a system
 * files into, so it is shown in the table rather than buried in the record.
 */
export function CmContainerClosures() {
  const projectId = cmcProjectUuid();
  return (
    <RegisterCard<ContainerClosureApiRow>
      /* Scoped to the open program. An org-wide list mixes every program's
         packaging, and the row a staffer then edits may belong to a different
         dossier than the one on screen. Records with no project still appear —
         they are unfiled, not somebody else's. */
      path={`/api/cmc/container-closures${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`}
      title="Container closure systems"
      meta={(rows) => {
        const qualified = rows.filter((r) => String(r.status || '').toLowerCase() === 'qualified').length;
        const withEl = rows.filter((r) => r.extractablesLeachables && Object.keys(r.extractablesLeachables).length > 0).length;
        return `${rows.length} systems -- ${qualified} qualified -- ${withEl} with an E&L study`;
      }}
      icon={I.vault}
      loadingTitle="Loading container closure systems…"
      emptyTitle="No container closure system recorded yet"
      emptyHint="The container, the closure, their materials of construction and the extractables/leachables package behind them. Sections 3.2.S.6 and 3.2.P.7 compose from this register, and stay empty until something is recorded here."
      errorTitle="Couldn’t load container closure systems"
      errorHint="The org-scoped container closure register didn’t load. Sign in and try again."
      rowKey={(r) => r.id}
      create={{
        label: 'Record system',
        subject: 'container closure system',
        path: '/api/cmc/container-closures',
        form: () => containerClosureForm(),
        toBody: (v, pid) => containerClosureBody(v, pid),
        /* Without a project the row is saved but never reaches Module 3 — the
           API says so in its response, and the button says so first. */
        needsProject: true,
      }}
      rowActions={[
        {
          label: 'Update',
          icon: I.penLine,
          subject: 'container closure system',
          /* Seeded from the stored record — the drawer opened blank over a
             populated E&L package, and a staffer adding one line replaced the
             whole column. The patch body then sends every editable field, so a
             value the staffer clears is actually cleared. */
          form: (r) => containerClosureForm(r as ContainerClosureRow),
          path: (r) => `/api/cmc/container-closures/${r.id}`,
          toBody: (v) => containerClosurePatch(v),
        },
        {
          label: 'Qualify',
          icon: I.lock,
          subject: 'qualification',
          /* A Part 11 signature, not a status. The API refuses a self-declared
             'qualified' on an ordinary save, and this is the only path that
             records who qualified the system, when, and why. */
          when: (r) => String(r.status || '').toLowerCase() !== 'qualified',
          form: (r) => qualifyForm('container closure system', r.systemName),
          path: (r) => `/api/cmc/container-closures/${r.id}/qualify`,
          method: 'POST',
          toBody: (v) => qualifyBody(v),
        },
      ]}
      columns={[
        { header: 'System', render: (r) => r.systemName, mono: true, bold: true },
        { header: 'Files under', render: (r) => materialScopeSections(r.scope, 'drug_product', '3.2.S.6', '3.2.P.7') },
        { header: 'Component', render: (r) => text(r.componentType) },
        { header: 'Container', render: (r) => r.containerDescription },
        { header: 'Closure', render: (r) => r.closureDescription },
        { header: 'Supplier', render: (r) => text(r.supplier) },
        {
          /* States the fact, not a verdict. The composed section quotes the
             justification as the applicant's statement and never concludes
             suitability from it; a green "justified" chip over the text
             "TBD - awaiting review" would say the opposite on the same record. */
          header: 'Suitability text',
          render: (r) => (r.suitabilityJustification
            ? <span className="rd-chip tone-ok">recorded</span>
            : <span className="rd-chip tone-warn">not recorded</span>),
        },
        { header: 'E&L', render: elSummary },
        { header: 'Integrity', render: (r) => text(r.integrityTesting?.result) },
        { header: 'Status', render: (r) => chip(r.status, 'draft') },
      ]}
    />
  );
}

/* ═══════════ Reference standards — GET /api/cmc/reference-standards ══════════ */

export interface ReferenceStandardApiRow {
  id: number;
  projectId?: string | null;
  scope: string;
  standardCode: string;
  standardName: string;
  standardType: string;
  materialSource?: string | null;
  lotNumber?: string | null;
  assignedValue?: string | null;
  characterization?: Array<Record<string, string>> | null;
  certificateOfAnalysis?: string | null;
  qualificationProtocol?: string | null;
  storageConditions?: string | null;
  expiryDate?: string | null;
  retestDate?: string | null;
  status: string;
  qualificationDate?: string | null;
}

/**
 * The reference standard register — §3.2.S.5 / §3.2.P.6.
 *
 * Every assay number in the QC register is reported against one of these, and
 * until now the standard itself was recorded nowhere in the product.
 */
export function CmReferenceStandards() {
  const projectId = cmcProjectUuid();
  return (
    <RegisterCard<ReferenceStandardApiRow>
      path={`/api/cmc/reference-standards${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`}
      title="Reference standards"
      meta={(rows) => {
        const qualified = rows.filter((r) => String(r.status || '').toLowerCase() === 'qualified').length;
        const primary = rows.filter((r) => String(r.standardType || '').toLowerCase().includes('primary')).length;
        return `${rows.length} standards -- ${primary} primary -- ${qualified} qualified`;
      }}
      icon={I.scale}
      loadingTitle="Loading reference standards…"
      emptyTitle="No reference standard recorded yet"
      emptyHint="The standard every potency and purity result is reported against, its characterisation and its qualification. Sections 3.2.S.5 and 3.2.P.6 compose from this register."
      errorTitle="Couldn’t load reference standards"
      errorHint="The org-scoped reference standard register didn’t load. Sign in and try again."
      rowKey={(r) => r.id}
      create={{
        label: 'Record standard',
        subject: 'reference standard',
        path: '/api/cmc/reference-standards',
        form: () => referenceStandardForm(),
        toBody: (v, pid) => referenceStandardBody(v, pid),
        needsProject: true,
      }}
      rowActions={[
        {
          label: 'Update',
          icon: I.penLine,
          subject: 'reference standard',
          form: (r) => referenceStandardForm(r as Partial<ReferenceStandardBody>),
          path: (r) => `/api/cmc/reference-standards/${r.id}`,
          toBody: (v) => referenceStandardPatch(v),
        },
        {
          label: 'Qualify',
          icon: I.lock,
          subject: 'qualification',
          when: (r) => String(r.status || '').toLowerCase() !== 'qualified',
          form: (r) => qualifyForm('reference standard', `${r.standardCode} — ${r.standardName}`),
          path: (r) => `/api/cmc/reference-standards/${r.id}/qualify`,
          method: 'POST',
          toBody: (v) => qualifyBody(v),
        },
      ]}
      columns={[
        { header: 'Code', render: (r) => r.standardCode, mono: true, bold: true },
        { header: 'Standard', render: (r) => r.standardName },
        { header: 'Files under', render: (r) => materialScopeSections(r.scope, 'drug_substance', '3.2.S.5', '3.2.P.6') },
        { header: 'Type', render: (r) => r.standardType },
        { header: 'Lot', render: (r) => text(r.lotNumber) },
        { header: 'Assigned value', render: (r) => text(r.assignedValue) },
        {
          header: 'Characterised',
          render: (r) => (Array.isArray(r.characterization) && r.characterization.length > 0
            ? `${r.characterization.length} attribute${r.characterization.length === 1 ? '' : 's'}`
            : <span className="rd-chip tone-warn">none</span>),
        },
        { header: 'CoA', render: (r) => text(r.certificateOfAnalysis) },
        { header: 'Retest / expiry', render: (r) => fmtDate(r.retestDate || r.expiryDate) },
        { header: 'Status', render: (r) => chip(r.status, 'draft') },
      ]}
    />
  );
}

/* ═══════════ Impurity profiles — GET /api/cmc/impurity-profiles ═════════════ */

export interface ImpurityProfileApiRow {
  id: number;
  projectId?: string | null;
  scope: string;
  materialName: string;
  impurityName: string;
  impurityType: string;
  origin?: string | null;
  casNumber?: string | null;
  molecularFormula?: string | null;
  structure?: string | null;
  relativeRetentionTime?: string | null;
  analyticalMethod?: string | null;
  observedLevel?: string | null;
  levelUnit?: string | null;
  specificationLimit?: string | null;
  maximumDailyDose?: string | null;
  routeOfAdministration?: string | null;
  qualificationBasis?: string | null;
  controlStrategy?: string | null;
  batchesObserved?: string[] | null;
  status: string;
  qualificationDate?: string | null;
}

/**
 * The level in the unit it was RECORDED in.
 *
 * The composed §3.2.S.3.2 table used to append a percent sign to whatever
 * number was in the field, so a residual solvent recorded in ppm printed as a
 * percentage. The register shows the same thing the dossier does.
 */
function impurityLevel(r: ImpurityProfileApiRow): React.ReactNode {
  const level = String(r.observedLevel ?? '').trim();
  if (!level) return '--';
  const unit = String(r.levelUnit ?? '').trim();
  return unit ? `${level} ${unit}` : <span className="rd-chip tone-warn">{level} — no unit</span>;
}

/**
 * The impurity register — one row per impurity, which is how ICH Q3A/Q3B reads
 * them: each has its own level, its own threshold at the product's dose, and
 * its own qualification.
 */
export function CmImpurityProfiles() {
  const projectId = cmcProjectUuid();
  return (
    <RegisterCard<ImpurityProfileApiRow>
      path={`/api/cmc/impurity-profiles${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`}
      title="Impurities"
      meta={(rows) => {
        const qualified = rows.filter((r) => String(r.status || '').toLowerCase() === 'qualified').length;
        const withBasis = rows.filter((r) => String(r.qualificationBasis || '').trim()).length;
        const noDose = rows.filter((r) => !String(r.maximumDailyDose || '').trim()).length;
        return `${rows.length} impurities -- ${withBasis} with a qualification basis -- ${qualified} qualified -- ${noDose} with no daily dose recorded`;
      }}
      icon={I.sigma}
      loadingTitle="Loading impurities…"
      emptyTitle="No impurity recorded yet"
      emptyHint="Each impurity, its observed level, and the ICH Q3A/Q3B threshold that governs it at the product's maximum daily dose. Sections 3.2.S.3.2 and 3.2.P.5.5 compose from this register."
      errorTitle="Couldn’t load impurities"
      errorHint="The org-scoped impurity register didn’t load. Sign in and try again."
      rowKey={(r) => r.id}
      create={{
        label: 'Record impurity',
        subject: 'impurity',
        path: '/api/cmc/impurity-profiles',
        form: () => impurityProfileForm(),
        toBody: (v, pid) => impurityProfileBody(v, pid),
        needsProject: true,
      }}
      rowActions={[
        {
          label: 'Update',
          icon: I.penLine,
          subject: 'impurity',
          form: (r) => impurityProfileForm(r as Partial<ImpurityProfileBody>),
          path: (r) => `/api/cmc/impurity-profiles/${r.id}`,
          toBody: (v) => impurityProfilePatch(v),
        },
        {
          label: 'Qualify',
          icon: I.lock,
          subject: 'qualification',
          /* Signed over the recorded basis. The API refuses the signature when
             no basis is recorded, so the button refuses first and says why. */
          when: (r) => String(r.status || '').toLowerCase() !== 'qualified',
          disabledReason: (r) =>
            String(r.qualificationBasis || '').trim()
              ? null
              : 'Record the qualification basis before signing — a signature over an empty basis qualifies nothing',
          form: (r) => qualifyForm('impurity', `${r.impurityName} in ${r.materialName}`),
          path: (r) => `/api/cmc/impurity-profiles/${r.id}/qualify`,
          method: 'POST',
          toBody: (v) => qualifyBody(v),
        },
      ]}
      columns={[
        { header: 'Impurity', render: (r) => r.impurityName, mono: true, bold: true },
        { header: 'Material', render: (r) => r.materialName },
        { header: 'Files under', render: (r) => materialScopeSections(r.scope, 'drug_substance', '3.2.S.3.2', '3.2.P.5.5') },
        { header: 'Class', render: (r) => r.impurityType },
        { header: 'Level', render: impurityLevel },
        { header: 'Spec limit', render: (r) => text(r.specificationLimit) },
        { header: 'Daily dose', render: (r) => (r.maximumDailyDose ? r.maximumDailyDose : <span className="rd-chip tone-warn">not recorded</span>) },
        {
          /* Only an elemental impurity needs it — ICH Q3D keys its permitted
             daily exposure to the route — so the gap is flagged only where it
             actually blocks an assessment. */
          header: 'Route',
          render: (r) => {
            const route = String(r.routeOfAdministration || '').trim();
            if (route) return route;
            const isElemental = /elemental|metal/i.test(String(r.impurityType || ''));
            return isElemental
              ? <span className="rd-chip tone-warn">required for Q3D</span>
              : '--';
          },
        },
        { header: 'Structure', render: (r) => (r.structure || r.molecularFormula ? 'recorded' : <span className="rd-chip tone-warn">none</span>) },
        { header: 'Qualification basis', render: (r) => (r.qualificationBasis ? <span className="rd-chip tone-ok">recorded</span> : <span className="rd-chip tone-warn">none</span>) },
        { header: 'Status', render: (r) => chip(r.status, 'draft') },
      ]}
    />
  );
}

/* ═══════════ Dissolution profiles — GET /api/cmc/dissolution-profiles ════════ */

export interface DissolutionProfileApiRow {
  id: number;
  projectId?: string | null;
  purpose: string;
  productName: string;
  batchNumber?: string | null;
  strength?: string | null;
  apparatus: string;
  rotationSpeed?: string | null;
  medium: string;
  mediumVolume?: string | null;
  temperature?: string | null;
  sinker?: string | null;
  specification?: string | null;
  unitsTested?: number | null;
  results?: Array<Record<string, string>> | null;
  comparisonBatch?: string | null;
  comparisonResults?: Array<Record<string, string>> | null;
  testDate?: string | null;
  status: string;
}

/** How much of a profile is actually on file, stated rather than implied. */
function profileDepth(r: DissolutionProfileApiRow): React.ReactNode {
  const points = Array.isArray(r.results) ? r.results.length : 0;
  if (points === 0) return <span className="rd-chip tone-warn">no timepoints</span>;
  return `${points} timepoint${points === 1 ? '' : 's'}`;
}

/**
 * The dissolution register. `Recorded for` is the column that decides whether a
 * profile is §3.2.P.2 development evidence or the §3.2.P.5 release control —
 * both sections used to read the same record and present it as their own.
 */
export function CmDissolutionProfiles() {
  const projectId = cmcProjectUuid();
  return (
    <RegisterCard<DissolutionProfileApiRow>
      path={`/api/cmc/dissolution-profiles${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`}
      title="Dissolution profiles"
      meta={(rows) => {
        const release = rows.filter((r) => String(r.purpose || '') === 'release-specification').length;
        const noUnits = rows.filter((r) => !r.unitsTested).length;
        return `${rows.length} profiles -- ${release} release specification -- ${noUnits} with no unit count`;
      }}
      icon={I.barChart}
      loadingTitle="Loading dissolution profiles…"
      emptyTitle="No dissolution profile recorded yet"
      emptyHint="The apparatus, the medium, the units tested, and the mean with its variability at each timepoint. Sections 3.2.P.2 and 3.2.P.5 compose from this register, and an f2 comparison is computed from the recorded profiles."
      errorTitle="Couldn’t load dissolution profiles"
      errorHint="The org-scoped dissolution register didn’t load. Sign in and try again."
      rowKey={(r) => r.id}
      create={{
        label: 'Record profile',
        subject: 'dissolution profile',
        path: '/api/cmc/dissolution-profiles',
        form: () => dissolutionProfileForm(),
        toBody: (v, pid) => dissolutionProfileBody(v, pid),
        needsProject: true,
      }}
      rowActions={[
        {
          label: 'Update',
          icon: I.penLine,
          subject: 'dissolution profile',
          form: (r) => dissolutionProfileForm(r as Partial<DissolutionProfileBody>),
          path: (r) => `/api/cmc/dissolution-profiles/${r.id}`,
          toBody: (v) => dissolutionProfilePatch(v),
        },
      ]}
      columns={[
        { header: 'Product', render: (r) => r.productName, bold: true },
        { header: 'Batch', render: (r) => text(r.batchNumber), mono: true },
        { header: 'Files under', render: (r) => dissolutionPurposeSection(r.purpose) },
        { header: 'Purpose', render: (r) => r.purpose },
        { header: 'Apparatus', render: (r) => r.apparatus },
        { header: 'Medium', render: (r) => r.medium },
        { header: 'Units', render: (r) => (r.unitsTested ? String(r.unitsTested) : <span className="rd-chip tone-warn">not recorded</span>) },
        { header: 'Profile', render: profileDepth },
        { header: 'Criterion', render: (r) => text(r.specification) },
        { header: 'Tested', render: (r) => fmtDate(r.testDate) },
        { header: 'Status', render: (r) => chip(r.status, 'draft') },
      ]}
    />
  );
}

/* ═══════════ Material specifications — GET /api/cmc/material-specs ══════════ */

export interface MaterialSpecApiRow {
  id: number;
  projectId?: string | null;
  materialRole: string;
  materialName: string;
  functionInFormulation?: string | null;
  grade?: string | null;
  compendialMonograph?: string | null;
  compendialCompliance?: string | null;
  supplier?: string | null;
  manufacturerSite?: string | null;
  origin?: string | null;
  originDetail?: string | null;
  tseCertificate?: string | null;
  testParameters?: Array<Record<string, string>> | null;
  analyticalProcedures?: string | null;
  novelExcipient: boolean;
  novelExcipientJustification?: string | null;
  status: string;
}

/* The origin list §3.2.A.3 actually uses. The card carried two of its twelve
   tokens, so an excipient recorded as `bovine` rendered as ordinary grey text
   beside a section that treats it as animal-derived. */
const ANIMAL_ORIGINS = HUMAN_OR_ANIMAL_ORIGINS;

/**
 * The origin as RECORDED — and "not recorded" as its own state.
 *
 * §3.2.A.3 has to state whether any excipient is of human or animal origin, and
 * an unrecorded origin is a question it must ask rather than answer. The
 * register shows the same three states the section distinguishes.
 */
function originChip(r: MaterialSpecApiRow): React.ReactNode {
  const v = String(r.origin || '').trim().toLowerCase();
  if (!v) return <span className="rd-chip tone-warn">not recorded</span>;
  if (ANIMAL_ORIGINS.includes(v)) {
    return (
      <span className={r.tseCertificate ? 'rd-chip tone-ok' : 'rd-chip tone-warn'}>
        {v}{r.tseCertificate ? ' — TSE cert' : ' — no TSE cert'}
      </span>
    );
  }
  /* Fermentation is neither an animal origin nor an exclusion: §3.2.A.3 treats
     it as a question, because the culture media can carry animal-derived
     components. The card says the same thing the section does. */
  if (isReviewRequiredOrigin(v)) {
    return <span className="rd-chip tone-warn">{v} — media components?</span>;
  }
  return v;
}

/**
 * The material register — excipients and raw materials in one file, because
 * they are one shape. `Files under` is the column that decides which section a
 * material is evidence for.
 */
export function CmMaterialSpecs() {
  const projectId = cmcProjectUuid();
  return (
    <RegisterCard<MaterialSpecApiRow>
      path={`/api/cmc/material-specs${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`}
      title="Materials"
      meta={(rows) => {
        /* The SAME rule the write-through files the row under. A substring
           test on 'material' read 'reagent' as an excipient where the dossier
           files it as a raw material. */
        const excipients = rows.filter((r) => isExcipientRole(r.materialRole)).length;
        const noOrigin = rows.filter((r) => !String(r.origin || '').trim()).length;
        const novel = rows.filter((r) => r.novelExcipient).length;
        return `${rows.length} materials -- ${excipients} excipients -- ${novel} novel -- ${noOrigin} with no origin recorded`;
      }}
      icon={I.atom}
      loadingTitle="Loading materials…"
      emptyTitle="No material recorded yet"
      emptyHint="Excipients and raw materials, each with the specification it is controlled to and the origin section 3.2.A.3 answers the TSE/BSE question from. Sections 3.2.P.4 and 3.2.S.2.3 compose from this register."
      errorTitle="Couldn’t load materials"
      errorHint="The org-scoped material register didn’t load. Sign in and try again."
      rowKey={(r) => r.id}
      create={{
        label: 'Record material',
        subject: 'material specification',
        path: '/api/cmc/material-specs',
        form: () => materialSpecForm(),
        toBody: (v, pid) => materialSpecBody(v, pid),
        needsProject: true,
      }}
      rowActions={[
        {
          label: 'Update',
          icon: I.penLine,
          subject: 'material specification',
          form: (r) => materialSpecForm(r as Partial<MaterialSpecBody>),
          path: (r) => `/api/cmc/material-specs/${r.id}`,
          toBody: (v) => materialSpecPatch(v),
        },
      ]}
      columns={[
        { header: 'Material', render: (r) => r.materialName, bold: true },
        { header: 'Role', render: (r) => r.materialRole },
        { header: 'Files under', render: (r) => materialRoleSection(r.materialRole) },
        { header: 'Function', render: (r) => text(r.functionInFormulation) },
        { header: 'Grade', render: (r) => text(r.grade) },
        { header: 'Monograph', render: (r) => text(r.compendialMonograph) },
        {
          header: 'Specification',
          render: (r) => (Array.isArray(r.testParameters) && r.testParameters.length > 0
            ? `${r.testParameters.length} test${r.testParameters.length === 1 ? '' : 's'}`
            : r.compendialMonograph ? 'per monograph' : <span className="rd-chip tone-warn">none</span>),
        },
        { header: 'Origin', render: originChip },
        { header: 'Supplier', render: (r) => text(r.supplier) },
        {
          header: 'Novel',
          render: (r) => (r.novelExcipient
            ? <span className={r.novelExcipientJustification ? 'rd-chip tone-ok' : 'rd-chip tone-warn'}>{r.novelExcipientJustification ? 'justified' : 'unjustified'}</span>
            : '--'),
        },
        { header: 'Status', render: (r) => chip(r.status, 'draft') },
      ]}
    />
  );
}

/* ═══════════ Formulation records — GET /api/cmc/formulation-records ══════════ */

export interface FormulationRecordApiRow {
  id: number;
  projectId?: string | null;
  formulationName: string;
  version?: string | null;
  dosageForm?: string | null;
  strength?: string | null;
  batchSize?: string | null;
  components?: Array<Record<string, string>> | null;
  theoreticalYield?: string | null;
  overageJustification?: string | null;
  supersedes?: string | null;
  status: string;
}

/**
 * The formulation register — one row per version, with exactly one current.
 *
 * §3.2.P.1 renders the CURRENT composition; the API refuses a second record
 * claiming it, because two governing compositions is not a state the section
 * can render honestly.
 */
export function CmFormulationRecords() {
  const projectId = cmcProjectUuid();
  return (
    <RegisterCard<FormulationRecordApiRow>
      path={`/api/cmc/formulation-records${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`}
      title="Formulation records"
      meta={(rows) => {
        const current = rows.filter((r) => String(r.status || '') === 'current').length;
        const withOverage = rows.filter((r) => (r.components || []).some((c) => String(c.overage || '').trim())).length;
        return `${rows.length} versions -- ${current} current -- ${withOverage} with a component overage`;
      }}
      icon={I.clipboardList}
      loadingTitle="Loading formulation records…"
      emptyTitle="No formulation recorded yet"
      emptyHint="The batch formula: what goes into the product, how much of each, and what that scales to per unit. Section 3.2.P.1's quantitative composition composes from this register."
      errorTitle="Couldn’t load formulation records"
      errorHint="The org-scoped formulation register didn’t load. Sign in and try again."
      rowKey={(r) => r.id}
      create={{
        label: 'Record formulation',
        subject: 'formulation record',
        path: '/api/cmc/formulation-records',
        form: () => formulationRecordForm(),
        toBody: (v, pid) => formulationRecordBody(v, pid),
        needsProject: true,
      }}
      rowActions={[
        {
          label: 'Update',
          icon: I.penLine,
          subject: 'formulation record',
          form: (r) => formulationRecordForm(r as Partial<FormulationRecordBody>),
          path: (r) => `/api/cmc/formulation-records/${r.id}`,
          toBody: (v) => formulationRecordPatch(v),
        },
      ]}
      columns={[
        { header: 'Formulation', render: (r) => r.formulationName, bold: true },
        { header: 'Version', render: (r) => text(r.version), mono: true },
        { header: 'Dosage form', render: (r) => text(r.dosageForm) },
        { header: 'Strength', render: (r) => text(r.strength) },
        { header: 'Batch size', render: (r) => text(r.batchSize) },
        {
          header: 'Components',
          render: (r) => (Array.isArray(r.components) && r.components.length > 0
            ? String(r.components.length)
            : <span className="rd-chip tone-warn">none</span>),
        },
        {
          header: 'Overages',
          render: (r) => {
            const over = (r.components || []).filter((c) => String(c.overage || '').trim());
            if (over.length === 0) return '--';
            const unjustified = over.filter((c) => !String(c.overageJustification || '').trim() && !String(r.overageJustification || '').trim());
            return unjustified.length > 0
              ? <span className="rd-chip tone-warn">{unjustified.length} unjustified</span>
              : <span className="rd-chip tone-ok">{over.length} justified</span>;
          },
        },
        { header: 'Supersedes', render: (r) => text(r.supersedes) },
        { header: 'Status', render: (r) => chip(r.status, 'draft') },
      ]}
    />
  );
}


/* ═══════════ Manufacturing processes — GET /api/cmc/manufacturing-processes ══ */

export interface ManufacturingProcessApiRow {
  id: string;
  projectId?: string | null;
  processName: string;
  processType?: string | null;
  processDescription?: string | null;
  processSteps?: Array<Record<string, string>> | null;
  criticalProcessParameters?: Array<Record<string, string>> | null;
  processControls?: Array<Record<string, string>> | null;
  equipmentList?: Array<Record<string, string>> | null;
  batchSize?: string | null;
  processDevelopment?: string | null;
  reprocessing?: string | null;
  validationStatus?: string | null;
}

/**
 * The manufacturing process register — §3.2.S.2.2 and §3.2.P.3.3.
 *
 * It writes `manufacturing_processes`, the table the ICH compliance checker and
 * the QbD analyzer have always read and no screen had ever written.
 */
export function CmManufacturingProcesses() {
  const projectId = cmcProjectUuid();
  return (
    <RegisterCard<ManufacturingProcessApiRow>
      path={`/api/cmc/manufacturing-processes${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`}
      title="Manufacturing processes"
      meta={(rows) => {
        const validated = rows.filter((r) => String(r.validationStatus || '') === 'validated').length;
        const withSteps = rows.filter((r) => (r.processSteps || []).length > 0).length;
        return `${rows.length} processes -- ${withSteps} with recorded steps -- ${validated} validated`;
      }}
      icon={I.workflow}
      loadingTitle="Loading manufacturing processes…"
      emptyTitle="No manufacturing process recorded yet"
      emptyHint="The ordered unit operations, their critical parameters and their in-process controls. Sections 3.2.S.2.2 and 3.2.P.3.3 compose from this register."
      errorTitle="Couldn’t load manufacturing processes"
      errorHint="The org-scoped process register didn’t load. Sign in and try again."
      rowKey={(r) => r.id}
      create={{
        label: 'Record process',
        subject: 'manufacturing process',
        path: '/api/cmc/manufacturing-processes',
        form: () => manufacturingProcessForm(),
        toBody: (v, pid) => manufacturingProcessBody(v, pid),
        needsProject: true,
      }}
      rowActions={[
        {
          label: 'Update',
          icon: I.penLine,
          subject: 'manufacturing process',
          form: (r) => manufacturingProcessForm(r as Partial<ManufacturingProcessBody>),
          path: (r) => `/api/cmc/manufacturing-processes/${r.id}`,
          /* The stored row travels with the form values: a step's in-process
             controls have no column in the drawer and must survive the edit. */
          toBody: (v, r) => manufacturingProcessPatch(v, r as Partial<ManufacturingProcessBody>),
        },
        {
          label: 'Validate',
          icon: I.lock,
          subject: 'process validation',
          /* Signed over the recorded steps. The API refuses the signature when
             the process describes none, so the button refuses first and says
             why rather than producing a rejected save. */
          when: (r) => String(r.validationStatus || '').toLowerCase() !== 'validated',
          disabledReason: (r) =>
            (r.processSteps || []).length > 0
              ? null
              : 'Record the unit operations before signing — a validation signature over no steps attests to nothing',
          form: (r) => qualifyForm('manufacturing process', r.processName),
          path: (r) => `/api/cmc/manufacturing-processes/${r.id}/validate`,
          method: 'POST',
          toBody: (v) => qualifyBody(v),
        },
      ]}
      columns={[
        { header: 'Process', render: (r) => r.processName, bold: true },
        { header: 'Files under', render: (r) => materialScopeSections(r.processType, 'drug_substance', '3.2.S.2', '3.2.P.3') },
        {
          header: 'Steps',
          render: (r) => ((r.processSteps || []).length > 0
            ? String((r.processSteps || []).length)
            : <span className="rd-chip tone-warn">none</span>),
        },
        {
          header: 'CPPs',
          render: (r) => {
            const cpps = r.criticalProcessParameters || [];
            if (cpps.length === 0) return <span className="rd-chip tone-warn">none</span>;
            const noRange = cpps.filter((c) => !String(c.rangeLow || '').trim() || !String(c.rangeHigh || '').trim());
            return noRange.length > 0
              ? <span className="rd-chip tone-warn">{noRange.length} of {cpps.length} without a range</span>
              : <span className="rd-chip tone-ok">{cpps.length}</span>;
          },
        },
        {
          header: 'In-process controls',
          render: (r) => {
            const own = (r.processControls || []).length;
            const onSteps = (r.processSteps || []).reduce(
              (n, st) => n + (Array.isArray((st as Record<string, unknown>).inProcessControls)
                ? ((st as unknown as { inProcessControls: unknown[] }).inProcessControls).length
                : 0),
              0,
            );
            const total = own + onSteps;
            return total > 0 ? String(total) : <span className="rd-chip tone-warn">none</span>;
          },
        },
        { header: 'Batch size', render: (r) => text(r.batchSize) },
        { header: 'Equipment', render: (r) => ((r.equipmentList || []).length > 0 ? String((r.equipmentList || []).length) : '--') },
        { header: 'Validation', render: (r) => chip(r.validationStatus, 'not-started') },
      ]}
    />
  );
}

/* ═══════════ Characterisation — GET /api/cmc/characterization-studies ════════ */

export interface CharacterizationStudyApiRow {
  id: number;
  projectId?: string | null;
  scope: string;
  studyType: string;
  studyTitle: string;
  technique?: string | null;
  attribute?: string | null;
  result?: string | null;
  resultUnit?: string | null;
  acceptanceReference?: string | null;
  conclusion?: string | null;
  studyReference?: string | null;
  performedBy?: string | null;
  performedDate?: string | null;
  supportingData?: Array<Record<string, string>> | null;
  status: string;
}

/**
 * The characterisation register — §3.2.S.3.1.
 *
 * The section asks three questions, so the card reports which of them the
 * recorded studies actually answer rather than a count of studies.
 */
export function CmCharacterizationStudies() {
  const projectId = cmcProjectUuid();
  return (
    <RegisterCard<CharacterizationStudyApiRow>
      path={`/api/cmc/characterization-studies${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`}
      title="Characterisation studies"
      meta={(rows) => {
        /* Which of §3.2.S.3.1's three questions are answered — over the studies
           that established something, on the drug substance side. A count of
           studies would say "3 recorded" over three NMR runs and leave the
           reader thinking the section was covered. */
        const live = rows.filter((r) => String(r.status || '').toLowerCase() !== 'retired');
        /* The SAME rule mapCharacterizationStudyPayload uses to decide whether
           a study establishes anything: a technique AND a readout. Counting a
           study with a result but no technique made the card say a question was
           answered while §3.2.S.3 listed it as missing. */
        const answers = (t: string) => live.some(
          (r) => normalizeCharacterizationType(r.studyType) === t
            && String(r.scope || 'drug_substance') !== 'drug_product'
            && String(r.technique || '').trim()
            && (String(r.result || '').trim() || String(r.conclusion || '').trim()),
        );
        const answered = ['structural', 'physicochemical', 'biological'].filter(answers).length;
        return `${live.length} studies -- ${answered} of 3 characterisation questions answered`;
      }}
      icon={I.microscope}
      loadingTitle="Loading characterisation studies…"
      emptyTitle="No characterisation study recorded yet"
      emptyHint="Section 3.2.S.3.1 asks three separate questions — the structure, the physicochemical properties and the biological activity — and each study answers the one it is typed as."
      errorTitle="Couldn’t load characterisation studies"
      errorHint="The org-scoped characterisation register didn’t load. Sign in and try again."
      rowKey={(r) => r.id}
      create={{
        label: 'Record study',
        subject: 'characterisation study',
        path: '/api/cmc/characterization-studies',
        form: () => characterizationStudyForm(),
        toBody: (v, pid) => characterizationStudyBody(v, pid),
        needsProject: true,
      }}
      rowActions={[
        {
          label: 'Update',
          icon: I.penLine,
          subject: 'characterisation study',
          form: (r) => characterizationStudyForm(r as Partial<CharacterizationStudyBody>),
          path: (r) => `/api/cmc/characterization-studies/${r.id}`,
          toBody: (v) => characterizationStudyPatch(v),
        },
        {
          label: 'Qualify',
          icon: I.lock,
          subject: 'qualification',
          when: (r) => String(r.status || '').toLowerCase() !== 'qualified',
          disabledReason: (r) =>
            String(r.result || '').trim() || String(r.conclusion || '').trim()
              ? null
              : 'Record what the study established before signing — a signature over no result attests to nothing',
          form: (r) => qualifyForm('characterisation study', r.studyTitle),
          path: (r) => `/api/cmc/characterization-studies/${r.id}/qualify`,
          method: 'POST',
          toBody: (v) => qualifyBody(v),
        },
      ]}
      columns={[
        { header: 'Study', render: (r) => r.studyTitle, bold: true },
        { header: 'Establishes', render: (r) => CHARACTERIZATION_TYPE_LABEL[normalizeCharacterizationType(r.studyType)] },
        { header: 'Files under', render: (r) => characterizationTypeSection(r.scope) },
        { header: 'Technique', render: (r) => text(r.technique) },
        { header: 'Attribute', render: (r) => text(r.attribute) },
        {
          header: 'Result',
          render: (r) => {
            const value = String(r.result || '').trim();
            if (!value) return <span className="rd-chip tone-warn">none</span>;
            const unit = String(r.resultUnit || '').trim();
            /* A number with no recorded unit is shown as such — the dossier
               says the same thing, and the two must not disagree. */
            return unit ? `${value} ${unit}` : <span className="rd-chip tone-warn">{value} (unit not recorded)</span>;
          },
        },
        { header: 'Conclusion', render: (r) => (String(r.conclusion || '').trim() ? <span className="rd-chip tone-ok">recorded</span> : <span className="rd-chip tone-warn">none</span>) },
        { header: 'Reference', render: (r) => text(r.studyReference), mono: true },
        { header: 'Status', render: (r) => chip(r.status, 'draft') },
      ]}
    />
  );
}
