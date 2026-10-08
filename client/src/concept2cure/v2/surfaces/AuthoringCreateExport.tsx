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
 *                             the server's pdf branch now renders through the
 *                             platform HTML→PDF engine), and XML are offered.
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
import { NEW_DOCUMENT_EVENT } from '../newDocumentAction';
import { I } from '../icons';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { apiRequest, serverMessage, redactInternals, type ApiRequestError } from '@/lib/queryClient';
import { unboundNotice } from '../governanceNotice';
import { downloadBlob, safeFileName } from '../download';
import { shellProgramId, useShellProject } from '../shellProject';
import { DownloadMenu, CONTROLLED_EXPORT_REASON, isSealedStatus } from '../editor/DownloadMenu';

interface AuthoringTemplate { id: string | number; name?: string | null; title?: string | null; }

export interface AuthoringCreateExportProps {
  /** Currently open document (null when none). */
  docId: string | null;
  docTitle: string | null;
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

const NONE = '(blank document)';

export function AuthoringCreateExport({ docId, docTitle, docStatus, module, fireToast, onDocCreated, onSectionCreated, onExported, onCheckExports }: AuthoringCreateExportProps) {
  /* Sealed, or not offered. An unknown status used to count as exportable,
     which offered the controlled act on a document whose status nobody had
     read; the server would refuse it, and the working copy is the act that
     fits a document of unknown status. */
  const exportable = isSealedStatus(docStatus);
  const [dialog, setDialog] = useState<'doc' | 'section' | null>(null);
  // Re-renders when a surface opens or switches project, so the control follows.
  const openProject = shellProgramId(useShellProject());
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
    const open = () => {
      if (!shellProgramId()) {
        fireToast('Open a project first — a document belongs to a project.', 'error');
        return;
      }
      setDialog('doc');
    };
    window.addEventListener(NEW_DOCUMENT_EVENT, open);
    return () => window.removeEventListener(NEW_DOCUMENT_EVENT, open);
  }, [fireToast]);
  const [templates, setTemplates] = useState<AuthoringTemplate[]>([]);
  // 'unavailable' = the server said the shared reference catalog failed to
  // read (its fail-soft still lists the org's own templates). A SHORT list
  // and a FAILED half are different facts; the dialog states which.
  // 'failed' = the whole read failed (401, throw). It used to collapse into
  // the ok/short-list case, so an author started a filing document blank
  // believing the org had no templates.
  const [globalCatalog, setGlobalCatalog] = useState<'ok' | 'unavailable' | 'failed'>('ok');

  // Template roster for create-from-template; an unavailable list simply means
  // the picker offers only a blank document — never a fabricated template.
  useEffect(() => {
    void (async () => {
      try {
        const res = await apiRequest('GET', '/api/authoring/templates');
        const body = await res.json().catch(() => null);
        if (res.ok && Array.isArray(body?.templates)) {
          setTemplates(body.templates as AuthoringTemplate[]);
          if ((body as { globalCatalog?: string })?.globalCatalog === 'unavailable') {
            setGlobalCatalog('unavailable');
          }
        } else {
          setGlobalCatalog('failed');
        }
      } catch { setGlobalCatalog('failed'); }
    })();
  }, []);

  const templateLabel = (t: AuthoringTemplate) => String(t.name ?? t.title ?? 'Template ' + t.id);

  const DOC_FORM: C2CFormConfig = {
    eyebrow: 'Authoring · ' + module,
    title: 'New document',
    sub:
      'Creates a governed document in the authoring store. Choosing a template seeds its sections server-side.' +
      (globalCatalog === 'unavailable'
        ? ' The shared template catalog didn’t load — Start from lists only your organization’s templates right now.'
        : globalCatalog === 'failed'
          ? ' The template list didn’t load — only a blank document can be started right now. This is a failed read, not an empty catalog.'
          : ''),
    submitLabel: 'Create document',
    fields: [
      { key: 'title', label: 'Document title', type: 'text', required: true, placeholder: 'e.g. 2.6.6 Toxicology Written Summary' },
      { key: 'module', label: 'CTD module', type: 'seg', options: ['M1', 'M2', 'M3', 'M4', 'M5'], default: module, half: true },
      { key: 'template', label: 'Start from', type: 'select', options: [NONE, ...templates.map(templateLabel)], default: NONE, half: true },
    ],
  };

  const SECTION_FORM: C2CFormConfig = {
    eyebrow: 'Authoring · ' + (docTitle ?? ''),
    title: 'New section',
    sub: 'Adds a section to this document; the initial (empty) revision is recorded server-side.',
    submitLabel: 'Create section',
    fields: [
      { key: 'code', label: 'Section code', type: 'text', required: true, half: true, placeholder: 'e.g. 3.2.S.1' },
      { key: 'title', label: 'Section title', type: 'text', required: true, placeholder: 'e.g. General Information' },
    ],
  };

  const createDoc = async (v: Record<string, string>) => {
    // A document belongs to a project (PF-07; founder decision 2026-09-26): it
    // is created in the open project, and with none open it is not created. It
    // used to be created org-wide, where no project ever listed it.
    const clientProgramId = shellProgramId();
    if (!clientProgramId) {
      fireToast('Open a project first — a document belongs to a project. Nothing was created.', 'error');
      return;
    }
    try {
      const tpl = templates.find((t) => templateLabel(t) === v.template);
      const res = await apiRequest('POST', '/api/authoring/docs', {
        title: v.title, module: v.module || module,
        ...(tpl ? { template_id: tpl.id } : {}),
        client_program_id: clientProgramId,
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401) { fireToast('Not created — your session isn’t authenticated.', 'error'); return; }
      if (!res.ok || !json?.document?.id) { fireToast('Couldn’t create the document — ' + (serverMessage(json) ?? 'the server refused it') + '. Nothing was persisted.', 'error'); return; }
      setDialog(null);
      // The server reports on every create whether the document attached to the
      // project's governed filing. Unbound is legitimate; unbound and unsaid is
      // how the two document stores drifted apart, so the reason rides along on
      // the confirmation rather than being dropped.
      // The server reports how many sections the template actually seeded —
      // state the count rather than implying a seed that may not have happened.
      const seeded = typeof (json as { sections_seeded?: unknown }).sections_seeded === 'number'
        ? (json as { sections_seeded: number }).sections_seeded
        : null;
      fireToast(
        'Document created · ' + json.document.title +
        (tpl && seeded != null ? ` (${seeded} section${seeded === 1 ? '' : 's'} from ${templateLabel(tpl)})` : '') +
        unboundNotice((json as { governance?: unknown }).governance),
      );
      onDocCreated({ id: String(json.document.id), title: String(json.document.title) });
    } catch (e) {
      fireToast('Couldn’t create the document — ' + redactInternals(e instanceof Error ? e.message : '', 'the server could not be reached') + '.', 'error');
    }
  };

  const createSection = async (v: Record<string, string>) => {
    if (!docId) return;
    try {
      const res = await apiRequest('POST', '/api/authoring/sections', {
        doc_id: docId, code: v.code, title: v.title, content: '',
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401) { fireToast('Not created — your session isn’t authenticated.', 'error'); return; }
      if (!res.ok || !json?.section?.id) { fireToast('Couldn’t create the section — ' + (serverMessage(json) ?? 'the server refused it') + '. Nothing was persisted.', 'error'); return; }
      setDialog(null);
      fireToast('Section created · ' + json.section.code + ' (initial revision recorded)');
      onSectionCreated({ id: String(json.section.id), code: String(json.section.code) });
    } catch (e) {
      fireToast('Couldn’t create the section — ' + redactInternals(e instanceof Error ? e.message : '', 'the server could not be reached') + '.', 'error');
    }
  };


  return (
    <>
      <button
        className="btn ghost"
        style={{ height: 30 }}
        onClick={() => setDialog('doc')}
        disabled={!openProject}
        title={openProject ? undefined : 'Open a project first — a document belongs to a project.'}
      >
        {I.plus} New document
      </button>
      {!openProject && <span className="sp-row-s">Open a project first — a document belongs to a project.</span>}
      {docId && (
        <>
          <button className="btn ghost" style={{ height: 30 }} onClick={() => setDialog('section')}>
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
      <ExportRecoveryNotice {...recovery} />
      {dialog === 'doc' && <C2CForm config={DOC_FORM} onCancel={() => setDialog(null)} onSubmit={createDoc} />}
      {dialog === 'section' && docId && <C2CForm config={SECTION_FORM} onCancel={() => setDialog(null)} onSubmit={createSection} />}
    </>
  );
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
    const reportFailure = (status?: number, code?: string, message?: string) => {
      const kind = exportFailureKind(status, recorded ? 'EXPORT_DELIVERY_FAILED' : code);
      if (kind === 'recorded') { recorded = true; reportUndelivered(); }
      else if (kind === 'refused') reportRefusal(status ?? 500, message);
      else reportUnconfirmed();
    };
    try {
      const result = await receiveAuthoringExport(docId, format);
      if (!current()) return;
      if (result.kind === 'failed') {
        reportFailure(result.status, result.code, result.message);
        return;
      }
      recorded = true;
      if (!result.blob) { reportUndelivered(); return; }
      const delivered = downloadBlob(fileBase + '.' + format, result.blob);
      if (delivered) {
        fireToast('Exported ' + format.toUpperCase() + ' — assembled from the governed sections and recorded in the export history. Download requested in your browser.');
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

function exportFailureKind(status?: number, code?: string): 'recorded' | 'refused' | 'unknown' {
  if (code === 'EXPORT_DELIVERY_FAILED') return 'recorded';
  if (code === 'EXPORT_OUTCOME_UNKNOWN') return 'unknown';
  if (code === 'EXPORT_NOT_RECORDED') return 'refused';
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
  | { kind: 'recorded'; blob: Blob | null }
  | { kind: 'failed'; status?: number; code?: string; message?: string };

/** A 2xx confirms recording before body transfer completes. Keep that fact
 * even when the stream fails; a transport refusal has no such confirmation. */
async function receiveAuthoringExport(docId: string, format: string): Promise<ExportReceipt> {
  try {
    const res = await apiRequest('POST', `/api/authoring/docs/${encodeURIComponent(docId)}/export`, { format });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      return { kind: 'failed', status: res.status, code: json?.code, message: serverMessage(json) ?? undefined };
    }
    try {
      const blob = await res.blob();
      return { kind: 'recorded', blob: blob.size > 0 ? blob : null };
    } catch { return { kind: 'recorded', blob: null }; }
  } catch (e) {
    const err = e as Partial<ApiRequestError> & { message?: string };
    return { kind: 'failed', status: err?.status, code: err?.code, message: err?.message };
  }
}
