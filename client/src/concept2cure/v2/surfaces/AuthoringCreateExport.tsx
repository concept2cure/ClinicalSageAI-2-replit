/**
 * AuthoringCreateExport — document CREATION and EXPORTING for the authoring
 * canvas, completing the create → edit → export loop the platform exists for.
 *
 * Wired to the real authoring store (server/routes/authoring.router.ts,
 * mounted /api/authoring, tenant-scoped, JWT actor attribution):
 *   • GET  /templates       — the org's authoring templates ({ templates })
 *   • POST /docs            — create a document (optionally seeded from a
 *                             template's sections server-side); returns the
 *                             persisted row (real id)
 *   • POST /sections        — create a section in a document (initial revision
 *                             recorded server-side); returns the persisted row
 *   • POST /docs/:id/export — export: streams the assembled document as a
 *                             binary attachment. Word (.docx), PDF (real PDF —
 *                             the server's rich Word converter), and XML are offered.
 *   • POST /docs/:id/working-copy — a working copy of any status, marked
 *                             "DRAFT — uncontrolled copy" on every page.
 *
 * Both sit in ONE Download menu (editor/DownloadMenu.tsx; docs/design/
 * ONE_ANA_ONE_CANVAS.md §4.5): the working copy is always offered; the
 * controlled export only for a FROZEN or APPROVED document, and otherwise is
 * shown disabled with its reason.
 *
 * HONESTY: creates are awaited and adopt the server's row (no client-side ids);
 * export outcomes distinguish refusal, recording, and delivery; the download is the exact
 * bytes the server streamed.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NEW_DOCUMENT_EVENT } from '../newDocumentAction';
import { ceremonyOpen } from '../ceremony';
import { I } from '../icons';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { apiRequest, serverMessage, redactInternals, type ApiRequestError } from '@/lib/queryClient';
import { downloadBlob, safeFileName } from '../download';
import { authoringPdfPrewriteRefusal } from '../authoringPdfRefusal';
import { captureShellProjectGuard, shellProgramId, useShellProject } from '../shellProject';
import { DownloadMenu, CONTROLLED_EXPORT_REASON, isSealedStatus } from '../editor/DownloadMenu';
import { authService } from '@/services/portal/authService';
import { useAuthoringReadSession } from '../editor/authoringCurrentRead';
import { useLiveData, type DataReadOwner } from '../dataConnect';
import { useAuthoringCreation, type AuthoringDocumentStart, type CreationKind, type CreationState } from '../editor/useAuthoringCreation';
import { AuthoringRecoveryNotice } from '../AuthoringRecoveryNotice';
import { AuthoringTemplatePicker, BLANK_DOCUMENT, templateLabel, type AuthoringTemplate, type AuthoringFilingContext, type TemplateCatalogState } from './AuthoringTemplatePicker';

export interface AuthoringCreateExportProps {
  /** Currently open document (null when none). */
  docId: string | null;
  docTitle: string | null;
  /** The editor's effective project; explicit null never follows the shell. */
  programId?: string | null;
  programSwitchHeld?: boolean;
  /** Show/refresh the existing host only after an explicit scoped recovery read. */
  onCheckCreation?: (kind: CreationKind) => boolean | Promise<boolean>;
  /** Existing workbench notice area, outside its touch toolbar scroller. */
  noticeContainer?: HTMLElement | null;
  /** One deliberate source start, kept in this existing creation host. */
  documentStart?: AuthoringDocumentStart | null;
  filingContext?: AuthoringFilingContext | null;
  /** The document's lifecycle status. Export of a filing artifact is refused
   *  server-side (409) unless it is FROZEN or APPROVED; the menu says so
   *  instead of offering an act that can only fail. A working copy is
   *  offered at any status. */
  docStatus?: string | null;
  /** Module filter currently active in the tree (used as the create default). */
  module: string;
  /** BP-W0-6: a failure must not arrive wearing the success tick. */
  fireToast: (m: string, tone?: 'ok' | 'error') => void;
  /** Called with the server's persisted row after a successful create. */
  onDocCreated: (doc: { id: string; title: string }) => void;
  onSectionCreated: (section: { id: string; code: string }) => void;
  /** Fired when the server confirms an export record, even if body delivery
   *  fails. The export wrote an
   *  `authoring_export_history` row and re-baselined this document, so any
   *  surface showing "changed since the last export" is now stale. */
  onExported?: (format: string) => void;
  /** Open and refresh this document’s existing export history for recovery. */
  onCheckExports?: () => void;
}

const NONE = BLANK_DOCUMENT;
const RETIRED_FORM_REASON = 'The project or filing changed, or your signed-in session changed. Close this form and open New document again before choosing a template.';
function creationModule(template: AuthoringTemplate | undefined, entered: string): string | null {
  return template?.module === undefined ? entered || null : template.module;
}

function templateStartDescription(template: AuthoringTemplate | undefined): string | undefined {
  if (template?.filingContext) {
    return 'Creates an empty working copy. Confirm product and jurisdiction; retain original forms, data and signed records. Read the full applicability limits and any missing-outline notices in “Template guidance and source requirements” in the editor.';
  }
  return template?.limitations?.join(' ');
}

function creationProgress(state: CreationState | undefined, kind: CreationKind) {
  return { busy: state?.phase === 'pending' ? `Creating ${kind}…` : undefined,
    notice: state?.phase === 'failed' ? state.message : undefined };
}

function sectionCreationForm(title: string | null, state: CreationState | undefined): C2CFormConfig {
  return { eyebrow: 'Authoring · ' + (title ?? ''), title: 'New section',
    sub: 'Adds a section to this document; the initial (empty) revision is recorded server-side.',
    submitLabel: 'Create section', ...creationProgress(state, 'section'), fields: [
      { key: 'code', label: 'Section code', type: 'text', required: true, half: true, placeholder: 'e.g. 3.2.S.1' },
      { key: 'title', label: 'Section title', type: 'text', required: true, placeholder: 'e.g. General Information' },
    ] };
}

function documentCreationForm({ templates, selectedTemplate, module, globalCatalog, state, documentStart }: {
  templates: AuthoringTemplate[]; selectedTemplate?: AuthoringTemplate; module: string;
  globalCatalog: string; state?: CreationState; documentStart: AuthoringDocumentStart | null;
}): C2CFormConfig {
  const progress = creationProgress(state, 'document');
  const sourceNotice = documentStart ? `This start uses ${documentStart.sourceCount} selected source${documentStart.sourceCount === 1 ? '' : 's'}. Creating the working document does not build it; preview and build later in the editor, with or without AnA.` : undefined;
  return {
    eyebrow: 'Authoring · ' + module,
    title: 'New document',
    sub:
      'Creates a governed document in the authoring store. Choosing a template seeds its sections server-side.' +
      (globalCatalog === 'unavailable'
        ? ' The shared reference store did not load; organization and built-in regulatory templates remain available.'
        : globalCatalog === 'failed'
          ? ' The template list didn’t load — only a blank document can be started right now. This is a failed read, not an empty catalog.'
          : ''),
    submitLabel: 'Create document',
    ...progress,
    notice: [progress.notice, sourceNotice].filter(Boolean).join(' ') || undefined,
    fields: [
      { key: 'title', label: 'Document title', type: 'text', required: true, placeholder: 'e.g. 2.6.6 Toxicology Written Summary' },
      { key: 'module', label: 'CTD module', type: selectedTemplate?.module === undefined ? 'seg' : 'text', options: [{ value: '', label: 'No CTD placement' }, 'M1', 'M2', 'M3', 'M4', 'M5'], default: '', half: true,
        derive: values => { const selected = templates.find(t => String(t.id) === values.template);
          return selected?.module === undefined ? null : selected.module ?? 'No CTD placement (preparation)'; } },
      { key: 'template', label: 'Start from', type: 'select', options: [{ value: NONE, label: NONE },
        ...templates.map(t => ({ value: String(t.id), label: templateLabel(t) }))], default: NONE,
        desc: templateStartDescription(selectedTemplate) },
    ],
  };
}

/** A refused command is consumed, so unrelated later work cannot reopen it. */
function useDocumentStartCommand(start: AuthoringDocumentStart | null | undefined, dialogOpen: boolean,
  mayStart: (request: AuthoringDocumentStart) => boolean, accept: (request: AuthoringDocumentStart) => void) {
  const consumed = useRef(new WeakSet<AuthoringDocumentStart>());
  useEffect(() => {
    if (!start || consumed.current.has(start)) return;
    consumed.current.add(start);
    if (dialogOpen || ceremonyOpen() || !mayStart(start)) return;
    accept(start);
  }, [start, dialogOpen, mayStart, accept]);
}

function AuthoringRecoveryNotices({ creation, recovery }: {
  creation: ReturnType<typeof useAuthoringCreation>; recovery: ReturnType<typeof useAuthoringExport>['recovery'];
}) {
  return <>
    <ExportRecoveryNotice {...recovery} />
    {(['document', 'section'] as const).map(kind => <CreationRecoveryNotice key={kind} kind={kind}
      state={creation.state(kind)} disabled={!!creation.refusal} onCheck={() => creation.check(kind)} onOpen={() => creation.open(kind)} />)}
  </>;
}

function useCreationFilingScope(programId: string | null | undefined, openProject: string | null, context?: AuthoringFilingContext | null) {
  const session = useAuthoringReadSession(authService.getUser());
  const effectiveProgram = programId === undefined ? openProject : programId;
  const currentFiling = context?.projectId === effectiveProgram ? context : null;
  const scope = JSON.stringify([effectiveProgram, openProject, currentFiling?.registryId, currentFiling?.filingDocumentId, session.actor, session.key]);
  const visit = useRef({ scope, generation: 0, projectCurrent: captureShellProjectGuard() });
  if (visit.current.scope !== scope || !visit.current.projectCurrent()) {
    visit.current = { scope, generation: visit.current.generation + 1, projectCurrent: captureShellProjectGuard() };
  }
  const currentVisit = visit.current;
  const [formVisit, setFormVisit] = useState<object | null>(null);
  const current = () => visit.current === currentVisit && session.sameRevision() && currentVisit.projectCurrent();
  return { programId: effectiveProgram, filingContext: currentFiling,
    owner: { key: JSON.stringify([scope, currentVisit.generation]), current }, retired: formVisit !== currentVisit || !current(),
    formCurrent: () => formVisit === currentVisit && current(), capture: () => { if (current()) setFormVisit(currentVisit); } };
}

function useCreationTemplateCatalog(owner: DataReadOwner) {
  const read = useLiveData<{ templates: AuthoringTemplate[]; globalCatalog?: string }>('/api/authoring/templates', ['/api/authoring/templates'],
    (body): body is { templates: AuthoringTemplate[]; globalCatalog?: string } => Boolean(body && typeof body === 'object' && Array.isArray((body as { templates?: unknown }).templates)), owner);
  const catalog: TemplateCatalogState = read.loading ? 'loading' : read.error ? 'failed' : read.data?.globalCatalog === 'unavailable' ? 'unavailable' : 'ok';
  return { templates: read.data?.templates ?? [], catalog };
}

export function AuthoringCreateExport({ docId, docTitle, docStatus, module, fireToast, onDocCreated, onSectionCreated, onExported, onCheckExports, programId, programSwitchHeld = false, onCheckCreation, noticeContainer, documentStart, filingContext }: AuthoringCreateExportProps) {
  /* Sealed, or not offered. An unknown status used to count as exportable,
     which offered the controlled act on a document whose status nobody had
     read; the server would refuse it, and the working copy is the act that
     fits a document of unknown status. */
  const exportable = isSealedStatus(docStatus);
  const [dialog, setDialog] = useState<'doc' | 'section' | null>(null);
  const [formDocumentStart, setFormDocumentStart] = useState<AuthoringDocumentStart | null>(null);
  const closeDialog = () => { setDialog(null); setFormDocumentStart(null); };
  // Re-renders when a surface opens or switches project, so the control follows.
  const openProject = shellProgramId(useShellProject());
  const filingScope = useCreationFilingScope(programId, openProject, filingContext);
  const creation = useAuthoringCreation({ programId: filingScope.programId,
    openProject, docId, programSwitchHeld, fireToast, onDocCreated, onSectionCreated, onCheckCreation, documentStart: formDocumentStart });
  const openDocument = () => {
    if (creation.blocked('document')) {
      fireToast(creation.refusal ?? creation.state('document')?.message ?? 'Wait for the current creation request.', 'error');
      return;
    }
    filingScope.capture(); setFormDocumentStart(null); setDialog('doc');
  };
  useDocumentStartCommand(documentStart, dialog !== null, creation.canStartDocument,
    request => { filingScope.capture(); setFormDocumentStart(request); setDialog('doc'); });
  const { exportDoc, blockedReason, recovery } = useAuthoringExport({
    docId, docTitle, exportable, openProject, fireToast, onExported, onCheckExports,
  });

  /* The dialog is owned here, and the panels that most need it — the empty
     document tree and the empty canvas — are siblings with no way to reach it.
     Rather than lift this state up through DocumentAuthoring so two empty
     states can call it, they raise an event and this listens. Same idiom as
     ../programAction.ts; see ../newDocumentAction.ts for what it fixes. */
  useEffect(() => {
    // The same rule as the button (PF-07): with no project open, the form is
    // not opened only to be refused at submit; the reason is said instead.
    window.addEventListener(NEW_DOCUMENT_EVENT, openDocument);
    return () => window.removeEventListener(NEW_DOCUMENT_EVENT, openDocument);
  });
  const { templates, catalog: globalCatalog } = useCreationTemplateCatalog(filingScope.owner);
  const [templateChoice, setTemplateChoice] = useState('');
  const [templateQuery, setTemplateQuery] = useState('');
  useEffect(() => { if (dialog !== 'doc') { setTemplateChoice(''); setTemplateQuery(''); } }, [dialog]);

  const selectedTemplate = templates.find(t => String(t.id) === templateChoice);

  const DOC_FORM = documentCreationForm({ templates, selectedTemplate, module, globalCatalog, state: creation.state('document'), documentStart: formDocumentStart });
  const retiredForm = dialog === 'doc' && filingScope.retired;
  if (retiredForm) DOC_FORM.notice = RETIRED_FORM_REASON;
  const SECTION_FORM = sectionCreationForm(docTitle, creation.state('section'));

  const createDoc = (values: Record<string, string>) => {
    if (retiredForm || !filingScope.formCurrent()) { fireToast(RETIRED_FORM_REASON, 'error'); return; }
    const template = templates.find(row => String(row.id) === values.template);
    if (values.template && values.template !== NONE && !template) {
      fireToast('The selected template is unavailable. Choose a listed template before creating the document.', 'error');
      return;
    }
    creation.create('document', { title: values.title, module: creationModule(template, values.module),
      ...(template ? { template_id: template.id } : {}) }, closeDialog, template ? templateLabel(template) : undefined);
  };
  const createSection = (values: Record<string, string>) => {
    creation.create('section', { code: values.code, title: values.title }, closeDialog);
  };
  const notices = <AuthoringRecoveryNotices creation={creation} recovery={recovery} />;

  return (
    <>
      <button className="btn ghost" style={{ height: 30 }} onClick={openDocument}
        disabled={creation.blocked('document')}
        title={creation.refusal ?? creation.state('document')?.message}
      >
        {I.plus} New document
      </button>
      {creation.refusal && <span className="sp-row-s">{creation.refusal}</span>}
      {docId && (
        <>
          <button className="btn ghost" style={{ height: 30 }} disabled={creation.blocked('section')}
            title={creation.refusal ?? creation.state('section')?.message} onClick={() => setDialog('section')}>
            {I.plus} New section
          </button>
          {/* One Download menu where three export buttons stood, all three
              disabled for a draft — so a document AnA had just built could
              not be pulled down at all. "Publish" was the wrong verb before
              that: nothing is transmitted; both acts are local downloads. */}
          <DownloadMenu
            docId={docId}
            docTitle={docTitle}
            fireToast={fireToast}
            controlled={{ run: (f) => void exportDoc(f), blockedReason }}
            testId="ed-download"
          />
        </>
      )}
      {noticeContainer ? createPortal(notices, noticeContainer) : notices}
      {dialog === 'doc' && <C2CForm config={DOC_FORM} onCancel={closeDialog} onSubmit={createDoc}
        onFieldChange={(key, value) => { if (key === 'template') setTemplateChoice(value); }}
        renderField={(field, control) => field.key === 'template'
          ? <AuthoringTemplatePicker templates={templates} catalog={globalCatalog} query={templateQuery} onQueryChange={setTemplateQuery} control={control} filingContext={filingScope.filingContext} />
          : undefined} />}
      {dialog === 'section' && docId && <C2CForm config={SECTION_FORM} onCancel={closeDialog} onSubmit={createSection} />}
    </>
  );
}

function CreationRecoveryNotice({ kind, state, disabled, onCheck, onOpen }: {
  kind: CreationKind; state?: CreationState; disabled: boolean; onCheck: () => void; onOpen: () => void;
}) {
  if (!state || state.phase === 'pending') return null;
  const actions = [];
  if (state.phase === 'unknown') actions.push({
    label: state.checking ? 'Checking…' : kind === 'document' ? 'Check working documents' : 'Check document sections',
    onClick: onCheck, disabled: disabled || state.checking,
  });
  if (state.canOpenRecovered) actions.push({ label: `Open identified ${kind}`, onClick: onOpen, disabled });
  if (state.phase === 'created') actions.push({ label: `Open created ${kind}`, onClick: onOpen, disabled });
  return <AuthoringRecoveryNotice role={state.phase === 'created' ? 'status' : 'alert'} actions={actions}
    message={state.phase === 'created' ? `${kind === 'document' ? 'Document' : 'Section'} created.` : state.message} />;
}

/** Keep the export confirmation state scoped to one open document/project. */
function useAuthoringExport({ docId, docTitle, exportable, openProject, fireToast, onExported, onCheckExports }: {
  docId: string | null;
  docTitle: string | null;
  exportable: boolean;
  openProject: string | null;
  fireToast: AuthoringCreateExportProps['fireToast'];
  onExported: AuthoringCreateExportProps['onExported'];
  onCheckExports: AuthoringCreateExportProps['onCheckExports'];
}) {
  const [exporting, setExporting] = useState(false);
  const [exportIssue, setExportIssue] = useState<string | null>(null);
  const [exportUnconfirmed, setExportUnconfirmed] = useState(false);
  const exportGeneration = useRef(0);
  const exportPending = useRef(false);
  const exportNeedsCheck = useRef(false);
  useEffect(() => {
    setExporting(false);
    setExportIssue(null);
    setExportUnconfirmed(false);
    exportPending.current = false;
    exportNeedsCheck.current = false;
    // A late reply for a prior selection must not download, toast, refresh, or
    // release a new document's pending export. Also guards an A → B → A switch.
    return () => { exportGeneration.current += 1; };
  }, [docId, openProject]);

  const fileBase = safeFileName(docTitle ?? 'document');
  const exportDoc = async (format: 'docx' | 'pdf' | 'xml') => {
    if (!docId || !exportable || exportPending.current || exportNeedsCheck.current) return;
    const generation = exportGeneration.current;
    const current = () => generation === exportGeneration.current;
    exportPending.current = true;
    setExporting(true);
    setExportIssue(null);
    let recorded = false;
    const reportUnconfirmed = () => {
      exportNeedsCheck.current = true;
      setExportUnconfirmed(true);
      const text = 'We cannot confirm whether this export was recorded. Check export history before retrying; no download is confirmed.';
      setExportIssue(text);
      fireToast(text, 'error');
    };
    const reportUndelivered = () => {
      const text = 'The export was recorded, but the complete file was not received. Check export history and your downloads before retrying; retrying creates another export record.';
      setExportIssue(text);
      fireToast(text, 'error');
    };
    const reportRefusal = (status: number, message?: string) => {
      fireToast(status === 401
        ? 'Export not run — your session isn’t authenticated. Sign in and retry; no export was recorded.'
        : 'Export refused — ' + redactInternals(message, 'the server refused it') + '. No export was recorded.', 'error');
    };
    const reportFailure = (status?: number, code?: string, message?: string, body?: unknown) => {
      const kind = exportFailureKind(status, recorded ? 'EXPORT_DELIVERY_FAILED' : code, body);
      if (kind === 'recorded') { recorded = true; reportUndelivered(); }
      else if (kind === 'refused') reportRefusal(status ?? 500, message);
      else reportUnconfirmed();
    };
    try {
      const result = await receiveAuthoringExport(docId, format);
      if (!current()) return;
      if (result.kind === 'failed') {
        reportFailure(result.status, result.code, result.message, result.body);
        return;
      }
      recorded = true;
      if (!result.blob) { reportUndelivered(); return; }
      const delivered = downloadBlob(fileBase + '.' + format, result.blob);
      if (delivered) {
        fireToast(...deliveredExportToast(format, result.plainTextFallback === true));
      } else {
        const text = 'The ' + format.toUpperCase() + ' was assembled and recorded in the export history, but your browser blocked the download request. Check your downloads before retrying; retrying creates another export record.';
        setExportIssue(text);
        fireToast(text, 'error');
      }
    } catch {
      if (!current()) return;
      if (recorded) reportUndelivered();
      else reportUnconfirmed();
    } finally {
      if (current()) {
        exportPending.current = false;
        setExporting(false);
        if (recorded) onExported?.(format);
      }
    }
  };

  const checkExports = () => {
    if (!onCheckExports) return;
    onCheckExports();
    // The author chose reconciliation; a subsequent retry is explicit and
    // creates a fresh record. Merely refreshing cannot confirm the old request.
    exportNeedsCheck.current = false;
    setExportUnconfirmed(false);
  };

  return {
    exportDoc,
    recovery: { message: exportIssue, onCheck: onCheckExports ? checkExports : undefined },
    /* Why the controlled export cannot run now, shown beside it; null when it can. */
    blockedReason: !exportable
      ? CONTROLLED_EXPORT_REASON
      : exporting
        ? 'An export is in progress.'
        : exportUnconfirmed ? 'Check the export history before exporting again.' : null,
  };
}

function exportFailureKind(status?: number, code?: string, body?: unknown): 'recorded' | 'refused' | 'unknown' {
  if (code === 'EXPORT_DELIVERY_FAILED') return 'recorded';
  if (code === 'EXPORT_OUTCOME_UNKNOWN') return 'unknown';
  if (code === 'EXPORT_NOT_RECORDED') return 'refused';
  if (authoringPdfPrewriteRefusal(status, code, body)) return 'refused';
  if (typeof status === 'number' && [400, 401, 403, 404, 409, 422].includes(status)) return 'refused';
  return 'unknown';
}

function ExportRecoveryNotice({ message, onCheck }: { message: string | null; onCheck?: () => void }) {
  if (!message) return null;
  return <div role="alert" className="sp-row-s">
    <span>{message}</span>
    {onCheck && <button className="btn ghost" onClick={onCheck}>Check export history</button>}
  </div>;
}

type ExportReceipt =
  | { kind: 'recorded'; blob: Blob | null; plainTextFallback?: boolean }
  | { kind: 'failed'; status?: number; code?: string; message?: string; body?: unknown };

/**
 * What a delivered export says. QA 2026-10-08 (j4): with no PDF engine the
 * server renders the plain-text fallback; the file says so on page one, and so
 * does this, in the error tone, because it must not be filed as the formatted
 * copy. It used to read "Exported PDF — assembled from the governed sections".
 */
function deliveredExportToast(format: string, plainTextFallback: boolean): [string, 'error'?] {
  if (plainTextFallback) {
    return [
      'Exported PDF as a plain-text rendering, not the formatted document: the document styling could not be applied on the server. ' +
        'The text is complete and the export history records it as a plain-text rendering. Do not file this file as the formatted document.',
      'error',
    ];
  }
  return ['Exported ' + format.toUpperCase() + ' — assembled from the governed sections and recorded in the export history. Download requested in your browser.'];
}

/** The server's X-Export-Rendering: true when the PDF is the plain-text fallback. */
function isPlainTextFallback(res: Response): boolean {
  try {
    return res.headers?.get?.('X-Export-Rendering') === 'plain-text-fallback';
  } catch {
    return false;
  }
}

/** A 2xx confirms recording before body transfer completes. Keep that fact
 * even when the stream fails; a transport refusal has no such confirmation. */
async function receiveAuthoringExport(docId: string, format: string): Promise<ExportReceipt> {
  try {
    const res = await apiRequest('POST', `/api/authoring/docs/${encodeURIComponent(docId)}/export`, { format });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      return { kind: 'failed', status: res.status, code: json?.code, message: serverMessage(json) ?? undefined, body: json };
    }
    const plainTextFallback = isPlainTextFallback(res);
    try {
      const blob = await res.blob();
      return { kind: 'recorded', blob: blob.size > 0 ? blob : null, plainTextFallback };
    } catch { return { kind: 'recorded', blob: null, plainTextFallback }; }
  } catch (e) {
    const err = e as Partial<ApiRequestError> & { message?: string };
    return { kind: 'failed', status: err?.status, code: err?.code, message: err?.message, body: err?.payload };
  }
}
