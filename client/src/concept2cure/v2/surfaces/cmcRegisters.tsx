import React from 'react';
import { I } from '../icons';
import { EmptyState, useLiveRows } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import type { C2CFormConfig } from '../C2CForm';
import { C2CForm } from '../C2CForm';
import { C2CToast, cmcProjectUuid, cmcWriteFailed, cmcWriteThrew, useToast } from './cmcShared';
import {
  methodForm, methodBody,
  qcTestForm, qcTestBody, qcReviewForm, qcReviewBody,
  processValidationForm, processValidationBody,
  changeControlForm, changeControlBody,
  drugSubstanceForm, drugSubstanceBody,
  drugProductForm, drugProductBody,
  comparabilityForm, comparabilityBody,
  asUserId,
} from './cmcRegisterForms';
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
      fireToast(`${create.subject.charAt(0).toUpperCase() + create.subject.slice(1)} saved.`);
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
        return `organization-wide -- ICH Q2 -- ${validated}/${rows.length} validated`;
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
        return `organization-wide -- ${open} open -- ICH Q12`;
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
        return `${rows.length} ${rows.length === 1 ? 'process' : 'processes'} -- ${done} complete -- 3-stage lifecycle`;
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
