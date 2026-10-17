/**
 * The create-a-controlled-document drawer, shared by the SOP register (the
 * "New controlled document" button and the library cards) and the change-
 * control forms gallery.
 *
 * It posts to POST /api/mdx/qms/documents (qmsWrites.createQmsDocument): the
 * server creates the document as a draft, seeds its section skeleton from the
 * chosen library template, and writes the §11.10(e) row. A new document is
 * never effective; that takes review and a second person's signature. Until
 * 2026-10-17 both buttons asked AnA to "create" one and nothing was written
 * (audit 2026-10-17).
 *
 * A refusal (a duplicate number is the common one) is shown in the drawer and
 * what was typed stays.
 *
 * @module client/src/concept2cure/quality/NewControlledDocumentForm
 */
import * as React from 'react';
import { C2CForm } from '../v2/C2CForm';
import type { SopTemplate } from './data';
import { createQmsDocument, type CreatedQmsDocument } from './qmsWrites';

export interface NewControlledDocumentFormProps {
  /** The server's library (GET /api/mdx/qms/templates). */
  templates: SopTemplate[];
  /** Library entry chosen on open (a template card). */
  initialKey?: string;
  onCancel: () => void;
  onCreated: (doc: CreatedQmsDocument) => void;
}

export function NewControlledDocumentForm({ templates, initialKey, onCancel, onCreated }: NewControlledDocumentFormProps) {
  const [key, setKey] = React.useState(initialKey ?? '');
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const inFlight = React.useRef(false);
  const chosen = templates.find((t) => t.key === key);

  const submit = async (v: Record<string, string>) => {
    if (inFlight.current) return;
    const template = templates.find((t) => t.key === v.templateKey);
    if (!template) {
      setRefusal('Choose a document type from the library.');
      return;
    }
    inFlight.current = true;
    setRefusal(null);
    try {
      const doc = await createQmsDocument({
        template,
        docNumber: v.docNumber.trim(),
        title: v.title.trim(),
        nextReviewDate: v.nextReviewDate || null,
      });
      onCreated(doc);
    } catch (err) {
      setRefusal(`Not created — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <C2CForm
      config={{
        eyebrow: 'Quality system',
        title: 'New controlled document',
        sub: 'Created as a draft with the library’s standard sections. It becomes effective only after review and a second person’s electronic signature.',
        governed: 'Creating a controlled document writes an audit entry under your name.',
        submitLabel: 'Create draft',
        ...(refusal ? { notice: refusal } : {}),
        fields: [
          {
            key: 'templateKey', label: 'Document type', type: 'select', required: true,
            default: initialKey ?? '',
            options: templates.map((t) => ({ value: t.key, label: `${t.label} (${t.numberPrefix})` })),
          },
          {
            key: 'docNumber', label: 'Document number', type: 'text', required: true, half: true,
            placeholder: chosen ? `${chosen.numberPrefix}001` : 'SOP-001',
            desc: 'Unique in your organisation. The library prefix for this type is shown as the example.',
          },
          { key: 'nextReviewDate', label: 'Next periodic review', type: 'date', half: true },
          { key: 'title', label: 'Title', type: 'text', required: true },
        ],
      }}
      onCancel={onCancel}
      onFieldChange={(k, value) => { if (k === 'templateKey') setKey(value); }}
      onSubmit={(v) => { void submit(v); }}
    />
  );
}
