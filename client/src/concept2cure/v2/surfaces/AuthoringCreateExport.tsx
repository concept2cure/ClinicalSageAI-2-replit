/**
 * AuthoringCreateExport — document CREATION and PUBLISHING for the authoring
 * canvas, completing the create → edit → publish loop the platform exists for.
 *
 * Wired to the real authoring store (server/routes/authoring.router.ts,
 * mounted /api/authoring, tenant-scoped, JWT actor attribution):
 *   • GET  /templates       — the org's authoring templates ({ templates })
 *   • POST /docs            — create a document (optionally seeded from a
 *                             template's sections server-side); returns the
 *                             persisted row (real id)
 *   • POST /sections        — create a section in a document (initial revision
 *                             recorded server-side); returns the persisted row
 *   • POST /docs/:id/export — publish: streams the assembled document as a
 *                             binary attachment. Word (.docx), PDF (real PDF —
 *                             the server's pdf branch now renders through the
 *                             platform HTML→PDF engine), and XML are offered.
 *
 * HONESTY: creates are awaited and adopt the server's row (no client-side ids);
 * failures report with nothing persisted; the export download is the exact
 * bytes the server streamed.
 */
import React, { useEffect, useState } from 'react';
import { NEW_DOCUMENT_EVENT } from '../newDocumentAction';
import { I } from '../icons';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { apiRequest, serverMessage, redactInternals, type ApiRequestError } from '@/lib/queryClient';
import { unboundNotice } from '../governanceNotice';
import { downloadBlob, safeFileName } from '../download';

interface AuthoringTemplate { id: string | number; name?: string | null; title?: string | null; }

export interface AuthoringCreateExportProps {
  /** Currently open document (null when none). */
  docId: string | null;
  docTitle: string | null;
  /** The document's lifecycle status. Export of a filing artifact is refused
   *  server-side (409) unless it is FROZEN or APPROVED; the buttons say so
   *  instead of offering an act that can only fail. */
  docStatus?: string | null;
  /** Module filter currently active in the tree (used as the create default). */
  module: string;
  /** BP-W0-6: a failure must not arrive wearing the success tick. */
  fireToast: (m: string, tone?: 'ok' | 'error') => void;
  /** Called with the server's persisted row after a successful create. */
  onDocCreated: (doc: { id: string; title: string }) => void;
  onSectionCreated: (section: { id: string; code: string }) => void;
  /** Fired after the server streamed an export. The export wrote an
   *  `authoring_export_history` row and re-baselined this document, so any
   *  surface showing "changed since the last export" is now stale. */
  onExported?: (format: string) => void;
}

const NONE = '(blank document)';

export function AuthoringCreateExport({ docId, docTitle, docStatus, module, fireToast, onDocCreated, onSectionCreated, onExported }: AuthoringCreateExportProps) {
  const exportable = docStatus == null || docStatus === 'FROZEN' || docStatus === 'APPROVED';
  const [dialog, setDialog] = useState<'doc' | 'section' | null>(null);

  /* The dialog is owned here, and the panels that most need it — the empty
     document tree and the empty canvas — are siblings with no way to reach it.
     Rather than lift this state up through DocumentAuthoring so two empty
     states can call it, they raise an event and this listens. Same idiom as
     ../programAction.ts; see ../newDocumentAction.ts for what it fixes. */
  useEffect(() => {
    const open = () => setDialog('doc');
    window.addEventListener(NEW_DOCUMENT_EVENT, open);
    return () => window.removeEventListener(NEW_DOCUMENT_EVENT, open);
  }, []);
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
    try {
      const tpl = templates.find((t) => templateLabel(t) === v.template);
      // Tag the new document to the open project (window.C2C_PROJECT) when one
      // is set, so it lands in that project's authoring tree. A string id is a
      // regulatory_programs UUID; absent or non-string → org-wide (unchanged).
      const proj = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
      const clientProgramId = proj && typeof proj.id === 'string' ? proj.id : null;
      const res = await apiRequest('POST', '/api/authoring/docs', {
        title: v.title, module: v.module || module,
        ...(tpl ? { template_id: tpl.id } : {}),
        ...(clientProgramId ? { client_program_id: clientProgramId } : {}),
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

  const exportDoc = async (format: 'docx' | 'pdf' | 'xml') => {
    if (!docId) return;
    try {
      const res = await apiRequest('POST', `/api/authoring/docs/${docId}/export`, { format });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        /* Every other failure in this file says what was NOT done and what to
           do next; these two stopped at the status code. Nothing partial is
           written on a failed export — the assembler streams or it does not —
           so saying so is accurate and is the thing the author needs to know
           before retrying. */
        /* apiRequest returns only a 401 here; every other refusal throws. */
        fireToast(
          res.status === 401
            ? 'Export not run — your session isn’t authenticated. Sign in and retry; no file was produced and the document is unchanged.'
            : 'Export failed — ' + (serverMessage(json) ?? 'the server refused it') + '. No file was produced; the document is unchanged.',
          'error',
        );
        return;
      }
      const delivered = downloadBlob(safeFileName(docTitle ?? 'document') + '.' + format, await res.blob());
      /* The server assembled the file and recorded the export — that much a
         2xx proves (the history row is written before the stream). Whether the
         BROWSER wrote it to disk is downloadBlob's answer, and it used to be
         discarded: "Published DOCX" over a blocked save, and the Exports rail
         re-baselined to a file the author never received. */
      if (delivered) {
        fireToast('Exported ' + format.toUpperCase() + ' — assembled from the governed sections and recorded in the export history.');
      } else {
        fireToast('The ' + format.toUpperCase() + ' was assembled and recorded in the export history, but your browser blocked the download — nothing was saved to your device. Retry the download.', 'error');
      }
      // The row is real either way; the rail's baseline follows the record.
      onExported?.(format);
    } catch (e) {
      /* Every non-401 refusal lands here — including the 409 for a document
         that is not FROZEN/APPROVED. That is a Part 11 state refusal, not a
         transport problem, so the retry advice follows the status. */
      const err = e as Partial<ApiRequestError> & { message?: string };
      const why = redactInternals(err?.message, 'the server refused it');
      const transport = typeof err?.status !== 'number';
      fireToast(
        'Export failed — ' + why + '. No file was produced; the document is unchanged.' +
          (transport ? ' Check your connection and try again.' : ''),
        'error',
      );
    }
  };

  return (
    <>
      <button className="btn ghost" style={{ height: 30 }} onClick={() => setDialog('doc')}>
        {I.plus} New document
      </button>
      {docId && (
        <>
          <button className="btn ghost" style={{ height: 30 }} onClick={() => setDialog('section')}>
            {I.plus} New section
          </button>
          {/* "Publish" was the wrong verb — nothing is transmitted; this is a
              local download of the assembled artifact. And the server refuses
              it (409) unless the document is frozen or approved, which the
              buttons now say instead of offering an act that can only fail. */}
          <button className="btn ghost" style={{ height: 30 }} onClick={() => exportDoc('docx')} disabled={!exportable} title={exportable ? 'Export the assembled document as Word' : 'Freeze or approve this document before exporting a filing artifact'}>
            {I.download} Word
          </button>
          <button className="btn ghost" style={{ height: 30 }} onClick={() => exportDoc('pdf')} disabled={!exportable} title={exportable ? 'Export the assembled document as PDF (rendered server-side)' : 'Freeze or approve this document before exporting a filing artifact'}>
            {I.download} PDF
          </button>
          <button className="btn ghost" style={{ height: 30 }} onClick={() => exportDoc('xml')} disabled={!exportable} title={exportable ? 'Export the assembled document as XML' : 'Freeze or approve this document before exporting a filing artifact'}>
            {I.download} XML
          </button>
        </>
      )}
      {dialog === 'doc' && <C2CForm config={DOC_FORM} onCancel={() => setDialog(null)} onSubmit={createDoc} />}
      {dialog === 'section' && docId && <C2CForm config={SECTION_FORM} onCancel={() => setDialog(null)} onSubmit={createSection} />}
    </>
  );
}
