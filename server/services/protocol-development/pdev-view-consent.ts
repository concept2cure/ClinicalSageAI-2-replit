/**
 * The protocol's informed consent, read from its project's consent document
 * (P-130, 2026-11-12). Split out of pdev-view-assembler.ts, in its folder.
 *
 * The Consent tab read the consent-form rows behind /api/protocol-consent:
 * a second store beside the editor's document that no screen wrote and the
 * editor could not open, review or approve. P-130 makes the
 * `informed_consent` document the one record, so the tab reads the protocol's
 * project's consent document and the same gate the editor's Check and
 * approval run (consentDocumentGate). It stays read-only: the document is
 * written, reviewed and approved in the editor.
 *
 * A protocol with no project, or a project with no consent document, has no
 * consent view. The tab then says so and prints no figure.
 */
import { sectionReadableText } from '../authoring/authoring-read-render';
import {
  CONSENT_DOCUMENT_TYPES,
  CONSENT_TEMPLATE_IDS,
  consentDocumentGate,
} from '../protocol-consent/protocol-consent-logic';

type Row = Record<string, unknown>;
interface Queryable { query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }> }

/** One project's consent document, newest first, with its sections as text. */
export interface ProjectConsentDocument {
  id: string;
  programId: string;
  title: string;
  version: string;
  status: string;
  sections: { code: string; text: string }[];
}

const str = (v: unknown): string => (v == null ? '' : String(v));

/** The consent documents of these projects, newest first per project. Tenant-scoped. */
export async function loadProjectConsentDocuments(
  executor: Queryable, orgId: number, programIds: string[],
): Promise<Map<string, ProjectConsentDocument[]>> {
  const out = new Map<string, ProjectConsentDocument[]>();
  const programs = [...new Set(programIds.filter(Boolean))];
  if (programs.length === 0) return out;
  const docs = await executor.query(
    `SELECT id::text AS id, client_program_id::text AS program_id, title, version, status
       FROM authoring_documents
      WHERE tenant_id = $1 AND client_program_id::text = ANY($2::text[])
        AND (template_id::text = ANY($3::text[]) OR lower(btrim(coalesce(product_code, ''))) = ANY($4::text[]))
      ORDER BY updated_at DESC, id DESC`,
    [orgId, programs, [...CONSENT_TEMPLATE_IDS], [...CONSENT_DOCUMENT_TYPES]],
  );
  if (docs.rows.length === 0) return out;
  const sections = await executor.query(
    `SELECT doc_id::text AS doc_id, code, content FROM authoring_sections
      WHERE tenant_id = $1 AND doc_id::text = ANY($2::text[]) ORDER BY order_index, code`,
    [orgId, docs.rows.map((d) => str(d.id))],
  );
  const textByDoc = new Map<string, { code: string; text: string }[]>();
  for (const s of sections.rows) {
    const list = textByDoc.get(str(s.doc_id)) ?? [];
    list.push({ code: str(s.code), text: sectionReadableText(s.content == null ? '' : str(s.content)) });
    textByDoc.set(str(s.doc_id), list);
  }
  for (const d of docs.rows) {
    const doc: ProjectConsentDocument = {
      id: str(d.id), programId: str(d.program_id), title: str(d.title), version: str(d.version), status: str(d.status),
      sections: textByDoc.get(str(d.id)) ?? [],
    };
    out.set(doc.programId, [...(out.get(doc.programId) ?? []), doc]);
  }
  return out;
}

/**
 * What the Consent tab shows: the newest consent document's elements, the
 * gate's verdict on its text, and the document itself, to open in the editor.
 * Every field null or empty when the project has no consent document.
 */
export function consentViewFor(docs: ProjectConsentDocument[] | undefined): {
  consent: Row[]; consentGate: Row | null; consentForm: Row | null;
} {
  const latest = docs?.[0];
  if (!latest) return { consent: [], consentGate: null, consentForm: null };
  const { elements, ...gate } = consentDocumentGate(latest.sections);
  return {
    consent: elements.map((e) => ({
      id: e.key, el: e.title, key: e.key, required: e.required, present: e.complete, complete: e.complete, section: e.section,
    })),
    consentGate: gate as unknown as Row,
    consentForm: {
      id: latest.id, documentId: latest.id, programId: latest.programId, title: latest.title,
      version: latest.version, status: latest.status, formsLinked: docs!.length,
    },
  };
}
