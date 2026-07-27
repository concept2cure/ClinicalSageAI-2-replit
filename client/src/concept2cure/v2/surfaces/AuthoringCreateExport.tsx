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
import { I } from '../icons';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { apiRequest } from '@/lib/queryClient';

interface AuthoringTemplate { id: string | number; name?: string | null; title?: string | null; }

export interface AuthoringCreateExportProps {
  /** Currently open document (null when none). */
  docId: string | null;
  docTitle: string | null;
  /** Module filter currently active in the tree (used as the create default). */
  module: string;
  fireToast: (m: string) => void;
  /** Called with the server's persisted row after a successful create. */
  onDocCreated: (doc: { id: string; title: string }) => void;
  onSectionCreated: (section: { id: string; code: string }) => void;
}

const NONE = '(blank document)';

export function AuthoringCreateExport({ docId, docTitle, module, fireToast, onDocCreated, onSectionCreated }: AuthoringCreateExportProps) {
  const [dialog, setDialog] = useState<'doc' | 'section' | null>(null);
  const [templates, setTemplates] = useState<AuthoringTemplate[]>([]);

  // Template roster for create-from-template; an unavailable list simply means
  // the picker offers only a blank document — never a fabricated template.
  useEffect(() => {
    void (async () => {
      try {
        const res = await apiRequest('GET', '/api/authoring/templates');
        const body = await res.json().catch(() => null);
        if (res.ok && Array.isArray(body?.templates)) setTemplates(body.templates as AuthoringTemplate[]);
      } catch { /* picker stays blank-only */ }
    })();
  }, []);

  const templateLabel = (t: AuthoringTemplate) => String(t.name ?? t.title ?? 'Template ' + t.id);

  const DOC_FORM: C2CFormConfig = {
    eyebrow: 'Authoring · ' + module,
    title: 'New document',
    sub: 'Creates a governed document in the authoring store. Choosing a template seeds its sections server-side.',
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
      const res = await apiRequest('POST', '/api/authoring/docs', {
        title: v.title, module: v.module || module,
        ...(tpl ? { template_id: tpl.id } : {}),
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401) { fireToast('Not created — your session isn’t authenticated.'); return; }
      if (!res.ok || !json?.document?.id) { fireToast('Couldn’t create the document — ' + ((json as any)?.error ?? `HTTP ${res.status}`) + '. Nothing was persisted.'); return; }
      setDialog(null);
      fireToast('Document created · ' + json.document.title + (tpl ? ' (seeded from ' + templateLabel(tpl) + ')' : ''));
      onDocCreated({ id: String(json.document.id), title: String(json.document.title) });
    } catch (e) {
      fireToast('Couldn’t create the document — ' + (e instanceof Error ? e.message : String(e)) + '.');
    }
  };

  const createSection = async (v: Record<string, string>) => {
    if (!docId) return;
    try {
      const res = await apiRequest('POST', '/api/authoring/sections', {
        doc_id: docId, code: v.code, title: v.title, content: '',
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401) { fireToast('Not created — your session isn’t authenticated.'); return; }
      if (!res.ok || !json?.section?.id) { fireToast('Couldn’t create the section — ' + ((json as any)?.error ?? `HTTP ${res.status}`) + '. Nothing was persisted.'); return; }
      setDialog(null);
      fireToast('Section created · ' + json.section.code + ' (initial revision recorded)');
      onSectionCreated({ id: String(json.section.id), code: String(json.section.code) });
    } catch (e) {
      fireToast('Couldn’t create the section — ' + (e instanceof Error ? e.message : String(e)) + '.');
    }
  };

  const exportDoc = async (format: 'docx' | 'pdf' | 'xml') => {
    if (!docId) return;
    try {
      const res = await apiRequest('POST', `/api/authoring/docs/${docId}/export`, { format });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        fireToast('Export failed — ' + ((json as any)?.error ?? `HTTP ${res.status}`) + '.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (docTitle ?? 'document').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_') + '.' + format;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      fireToast('Published ' + format.toUpperCase() + ' — assembled from the governed sections and recorded in the export history.');
    } catch (e) {
      fireToast('Export failed — ' + (e instanceof Error ? e.message : String(e)) + '.');
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
          <button className="btn ghost" style={{ height: 30 }} onClick={() => exportDoc('docx')} title="Publish the assembled document as Word">
            {I.download} Word
          </button>
          <button className="btn ghost" style={{ height: 30 }} onClick={() => exportDoc('pdf')} title="Publish the assembled document as PDF (rendered server-side)">
            {I.download} PDF
          </button>
          <button className="btn ghost" style={{ height: 30 }} onClick={() => exportDoc('xml')} title="Publish the assembled document as XML">
            {I.download} XML
          </button>
        </>
      )}
      {dialog === 'doc' && <C2CForm config={DOC_FORM} onCancel={() => setDialog(null)} onSubmit={createDoc} />}
      {dialog === 'section' && docId && <C2CForm config={SECTION_FORM} onCancel={() => setDialog(null)} onSubmit={createSection} />}
    </>
  );
}
