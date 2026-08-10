import React from 'react';
import { I } from '../icons';
import { EmptyState, useLiveRows } from '../dataConnect';

/* ═══════════════════════════════════════════════════════════════════
   CMC read-only registers — real org-scoped data, rendered honestly.

   Every card here is bound to an endpoint in server/api/cmc/routes.ts that
   ALREADY existed and already filters on organizationId server-side. These
   surfaces add no query, no route and no schema; they stop the UI from hiding
   data the backend was already serving.

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
}

/**
 * One read-only register: a real table, or one of the three honest states.
 * `rows` from useLiveRows is always an array (empty on error too), so the
 * zero-row branch must distinguish loading / error / genuinely-empty — an
 * error rendered as "nothing here yet" would be a lie about the data.
 */
export function RegisterCard<T>({
  path, title, meta, icon, loadingTitle, emptyTitle, emptyHint,
  errorTitle, errorHint, columns, rowKey, style,
}: RegisterCardProps<T>) {
  const live = useLiveRows<T>(path);
  const rows = live.rows;
  return (
    <div className="pj-card" style={style ?? { marginTop: 16 }}>
      <div className="pj-card-h"><span className="t">{title}</span><span className="s">{meta(rows)}</span></div>
      <div className="pj-card-b" style={{ padding: 0 }}>
        {rows.length === 0 ? (
          <div style={{ padding: 12 }}>
            {live.loading ? (
              <EmptyState icon={icon} title={loadingTitle} />
            ) : live.error ? (
              <EmptyState tone="error" icon={I.alertTriangle} title={errorTitle} hint={errorHint} />
            ) : (
              <EmptyState icon={icon} title={emptyTitle} hint={emptyHint} />
            )}
          </div>
        ) : (
          <table className="reg-tbl">
            <thead><tr>{columns.map((c, i) => <th key={i}>{c.header}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={rowKey(r, i)}>
                  {columns.map((c, j) => (
                    <td key={j} className={c.mono ? 'mono' : undefined} style={c.bold ? { fontWeight: 600 } : undefined}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ═══════════ Analytical methods — GET /api/cmc/analytical-methods ═══════════ */

/** Projected by the handler: id, methodCode, title, technique, purpose, status. */
export interface AnalyticalMethodApiRow {
  id: number;
  methodCode: string;
  title: string;
  technique: string | null;
  purpose: string | null;
  status: string | null;
}

/**
 * The org-wide analytical method library (analytical_methods). The
 * Specifications tab warns "no method" per specification and blocks approval
 * until a method is validated (ICH Q2) — this is the inventory that warning
 * points at. Org-scoped, so it needs no project in context.
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
      emptyHint="Validated analytical procedures (HPLC, GC, UV-VIS, …) appear here as your organization records them. A specification cannot be approved until its method is validated (ICH Q2)."
      errorTitle="Couldn’t load analytical methods"
      errorHint="The org-scoped method library (GET /api/cmc/analytical-methods) didn’t respond. Sign in to your tenant and retry."
      rowKey={(r) => r.id}
      columns={[
        { header: 'Code', render: (r) => r.methodCode, mono: true, bold: true },
        { header: 'Method', render: (r) => r.title },
        { header: 'Technique', render: (r) => text(r.technique) },
        { header: 'Purpose', render: (r) => text(r.purpose) },
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
}

/**
 * QC testing completes the chain the Specifications tab describes:
 * a specification sets the limit, a method says how it is measured, and a QC
 * test is the measurement actually performed against it.
 */
export function CmQcTesting() {
  return (
    <RegisterCard<QcTestApiRow>
      path="/api/cmc/qc-testing"
      title="QC testing"
      meta={(rows) => {
        const pass = rows.filter((r) => String(r.passFailStatus || '').toLowerCase() === 'pass').length;
        const fail = rows.filter((r) => String(r.passFailStatus || '').toLowerCase() === 'fail').length;
        return `${rows.length} samples -- ${pass} pass / ${fail} fail`;
      }}
      icon={I.microscope}
      loadingTitle="Loading QC testing records…"
      emptyTitle="No QC testing records yet"
      emptyHint="Samples tested against your specifications — raw material, in-process and finished product — appear here with their pass/fail disposition."
      errorTitle="Couldn’t load QC testing records"
      errorHint="The org-scoped QC testing file (GET /api/cmc/qc-testing) didn’t respond. Sign in to your tenant and retry."
      rowKey={(r) => r.id}
      columns={[
        { header: 'Sample', render: (r) => r.sampleId, mono: true, bold: true },
        { header: 'Type', render: (r) => r.sampleType },
        { header: 'Method', render: (r) => r.testMethod },
        { header: 'Result', render: (r) => chip(r.passFailStatus, 'pending') },
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
  regulatoryFiling: string | null;
  status: string | null;
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
      emptyHint="Logged CMC changes — with their type, filing category and status — appear here. Use the simulator above to model a change before you raise it."
      errorTitle="Couldn’t load change-control records"
      errorHint="The org-scoped change-control register (GET /api/cmc/change-control) didn’t respond. Sign in to your tenant and retry."
      rowKey={(r) => r.id}
      columns={[
        { header: 'Change', render: (r) => r.changeNumber, mono: true, bold: true },
        { header: 'Type', render: (r) => text(r.changeType) },
        { header: 'Description', render: (r) => text(r.description) },
        { header: 'Filing', render: (r) => (r.regulatoryFiling ? r.regulatoryFiling : <span className="cm-meta">not set</span>) },
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
      errorHint="The org-scoped comparability file (GET /api/cmc/comparability-studies) didn’t respond. Sign in to your tenant and retry."
      rowKey={(r) => String(r.id)}
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
      errorHint="The org-scoped process validation file (GET /api/cmc/process-validation) didn’t respond. Sign in to your tenant and retry."
      rowKey={(r) => r.id}
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
      emptyHint="Your active substances (§3.2.S) — with CAS number, molecular formula and weight — appear here. They are the quality data the Module 3 blueprint composes from."
      errorTitle="Couldn’t load drug substances"
      errorHint="The org-scoped drug-substance file (GET /api/cmc/drug-substances) didn’t respond. Sign in to your tenant and retry."
      rowKey={(r) => r.id}
      columns={[
        { header: 'Substance', render: (r) => r.substanceName, bold: true },
        { header: 'CAS number', render: (r) => text(r.casNumber), mono: true },
        { header: 'Molecular formula', render: (r) => text(r.molecularFormula), mono: true },
        { header: 'Molecular weight', render: (r) => text(r.molecularWeight) },
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
      emptyHint="Your finished products (§3.2.P) — dosage form, strength and route of administration — appear here alongside the substances they are formulated from."
      errorTitle="Couldn’t load drug products"
      errorHint="The org-scoped drug-product file (GET /api/cmc/drug-products) didn’t respond. Sign in to your tenant and retry."
      rowKey={(r) => r.id}
      columns={[
        { header: 'Product', render: (r) => r.productName, bold: true },
        { header: 'Dosage form', render: (r) => text(r.dosageForm) },
        { header: 'Strength', render: (r) => text(r.strength) },
        { header: 'Route', render: (r) => text(r.routeOfAdministration) },
      ]}
    />
  );
}
