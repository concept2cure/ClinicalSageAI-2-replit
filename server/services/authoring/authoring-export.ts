/**
 * Authoring export rendering — the body of `POST /docs/:docId/export` in
 * server/routes/authoring.router.ts, moved here (WM, 2026-09-21) so that
 * `POST /docs/:docId/file-to-vault` can render the SAME bytes the export route
 * ships without a second renderer. The route keeps the HTTP: the sealed-record
 * gate, the audit event, the headers. This module renders.
 *
 * Byte-for-byte: the XML, DOCX and PDF branches are the route's own, with the
 * same shared parse (one citation registry, one caption directory, one figure
 * map) so the two filed formats cannot disagree. The only addition is an
 * optional `notice` line rendered ahead of the content — used by the vault
 * filing of an UNSEALED document to say so on page one, and absent on the
 * export route, whose output is unchanged.
 */

import crypto from 'crypto';
import type { Queryable } from './authoring-evidence';

export type ExportFormat = 'docx' | 'pdf' | 'xml';
export const EXPORT_FORMATS: readonly ExportFormat[] = ['docx', 'pdf', 'xml'];

export interface ExportDocRow {
  id: string;
  title: string;
  module?: string | null;
  status?: string | null;
  created_at?: unknown;
}

export interface ExportSectionRow {
  id: string;
  code: string;
  title: string;
  content: string | null;
}

export interface RenderedExport {
  fileContent: Buffer;
  fileName: string;
  contentType: string;
  /** §11.10(b): a hash of the DELIVERED ARTIFACT BYTES. */
  artifactSha256: string;
}

export interface RenderExportArgs {
  executor: Queryable;
  tenantId: number;
  doc: ExportDocRow;
  sections: ExportSectionRow[];
  format: ExportFormat;
  /**
   * A statement rendered before the content — e.g. that this is a working
   * draft and not a sealed record. Absent on the export route.
   */
  notice?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// §11.50(b) manifestation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §11.50(a)(3) wording for a stored meaning token. The store holds AUTHOR /
 * REVIEWER / APPROVER. An unrecognised value is printed verbatim rather than
 * mapped to a guess — inventing a meaning is worse than showing an unfamiliar
 * one.
 */
const MEANING_LABEL: Record<string, string> = {
  AUTHOR: 'Authorship',
  REVIEWER: 'Review',
  APPROVER: 'Approval',
};
const meaningLabel = (m: string | null | undefined): string =>
  !m ? 'Not recorded' : (MEANING_LABEL[String(m).toUpperCase()] ?? String(m));

export interface SignatureRow {
  signer_email: string | null;
  signer_name: string | null;
  meaning: string | null;
  reason: string | null;
  method: string | null;
  content_hash: string | null;
  covered_freeze_version: string | null;
  pin_verified: boolean | null;
  signed_at: Date | string | null;
}

/**
 * The §11.50(b) manifestation, as ordered lines, for a human-readable export.
 * One function for three formats: DOCX, PDF and XML are three renderings of
 * ONE regulated statement, differing in markup, never in what they say.
 * `signer_name` is NULL precisely when no printed name is on record, and the
 * line says so rather than substituting the email.
 */
export function signatureManifestLines(sigs: SignatureRow[]): string[][] {
  return sigs.map((s) => {
    const when = s.signed_at ? new Date(s.signed_at).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'Not recorded';
    const lines = [
      // §11.50(a)(1)
      s.signer_name
        ? `Signed by: ${s.signer_name}${s.signer_email ? ` (${s.signer_email})` : ''}`
        : `Signed by: ${s.signer_email ?? 'Unknown signer'} — no printed name on record`,
      // §11.50(a)(3)
      `Meaning: ${meaningLabel(s.meaning)}`,
      // §11.50(a)(2)
      `Executed: ${when}`,
    ];
    if (s.reason) lines.push(`Reason: ${s.reason}`);
    lines.push(`Method: ${s.method ?? 'Not recorded'}${s.pin_verified ? ' (PIN verified)' : ''}`);
    // §11.70 — which record this signature is linked to.
    lines.push(
      s.covered_freeze_version
        ? `Covers: frozen version ${s.covered_freeze_version}`
        : 'Covers: no frozen snapshot was in force when this was signed',
    );
    if (s.content_hash) lines.push(`Content hash at signing: ${s.content_hash}`);
    return lines;
  });
}

/** The signatures on a document, tenant-scoped, oldest first for a manifest. */
export async function readSignaturesForExport(
  executor: Queryable,
  docId: string,
  tenantId: number,
): Promise<SignatureRow[]> {
  const r = await executor.query(
    `SELECT signer_email, signer_name, meaning, reason, method, content_hash,
            covered_freeze_version, pin_verified, signed_at
       FROM authoring_signatures
      WHERE doc_id = $1 AND tenant_id = $2
      ORDER BY signed_at ASC`,
    [docId, tenantId],
  );
  return r.rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// The shared parse every format consumes
// ─────────────────────────────────────────────────────────────────────────────

type SharedRender = Awaited<ReturnType<typeof prepareShared>>;

/**
 * Figures, cross-references, citations and captions are resolved ONCE, above
 * the format branches, so DOCX and PDF of the same frozen document cannot
 * disagree about which figures they carry, what a reference says, what "[3]"
 * means or which table is Table 3. XML keeps raw references inside CDATA and
 * needs none of it.
 */
async function prepareShared(args: RenderExportArgs) {
  const { executor, tenantId, doc, sections, format } = args;
  const manifest = signatureManifestLines(await readSignaturesForExport(executor, String(doc.id), tenantId));
  const binary = format === 'docx' || format === 'pdf';

  const { resolveAuthoringImages } = await import('../../export/authoring-images.js');
  const exportImages = binary
    ? await resolveAuthoringImages(sections.map((s) => s.content), tenantId)
    : new Map();

  const { crossReferenceLookupFor, crossReferenceAnchorId } = await import('@shared/authoring/cross-references');
  const sectionTargets = sections.map((s) => ({ id: String(s.id), code: s.code, title: s.title }));

  const { sectionContentToBlocks, countPendingSuggestions, collectCitedSourceIds, collectCaptionTargets } =
    await import('../../export/authoring-section-content.js');
  const { makeCitationRegistry, citationLookupFor } = await import('@shared/authoring/citations');
  const parsedSections = binary
    ? sections.map((section) => ({ section, blocks: sectionContentToBlocks(section.content) }))
    : [];
  const { makeCaptionNumbering } = await import('@shared/authoring/captions');
  const captionDirectory = makeCaptionNumbering();
  const captionTargets = parsedSections.flatMap((p) => collectCaptionTargets(p.blocks, captionDirectory));
  const crossRefs = crossReferenceLookupFor([...sectionTargets, ...captionTargets]);

  const citedSourceIds = parsedSections.flatMap((p) => collectCitedSourceIds(p.blocks));
  const citationSources = citedSourceIds.length
    ? await (async () => {
        const { listCitationSources } = await import(
          '../../services/clinical-regulatory-evidence/source-usage.service.js'
        );
        return listCitationSources(tenantId, citedSourceIds);
      })()
    : [];
  const citations = makeCitationRegistry(citationLookupFor(citationSources));

  let pendingIns = 0;
  let pendingDel = 0;
  for (const { blocks } of parsedSections) {
    const pending = countPendingSuggestions(blocks);
    pendingIns += pending.insertions;
    pendingDel += pending.deletions;
  }
  return {
    manifest,
    exportImages,
    parsedSections,
    crossRefs,
    crossReferenceAnchorId,
    citations,
    makeCaptionNumbering,
    pendingIns,
    pendingDel,
  };
}

const safeFileStem = (title: string) => title.replace(/[^a-zA-Z0-9]/g, '_');

// ─────────────────────────────────────────────────────────────────────────────
// XML
// ─────────────────────────────────────────────────────────────────────────────

function renderXml(args: RenderExportArgs, shared: SharedRender): { content: Buffer; fileName: string; contentType: string } {
  const { doc, sections } = args;
  /* Nothing here was escaped once; signer names carry apostrophes and reasons
     carry ampersands, so every value is escaped and CDATA is split on `]]>`. */
  const xe = (v: unknown) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const cdata = (v: unknown) => String(v ?? '').replace(/]]>/g, ']]]]><![CDATA[>');
  const notice = args.notice ? `\n  <notice>${xe(args.notice)}</notice>` : '';
  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<document>
  <metadata>
    <id>${xe(doc.id)}</id>
    <title>${xe(doc.title)}</title>
    <module>${xe(doc.module)}</module>
    <status>${xe(doc.status)}</status>
    <created_at>${xe(doc.created_at)}</created_at>
  </metadata>${notice}
  <sections>
${sections
  .map(
    (s) => `    <section code="${xe(s.code)}">
      <title>${xe(s.title)}</title>
      <content><![CDATA[${cdata(s.content)}]]></content>
    </section>`,
  )
  .join('\n')}
  </sections>
  <electronic_signatures count="${shared.manifest.length}">
${shared.manifest.length === 0
  ? '    <!-- No electronic signatures are recorded against this document. -->'
  : shared.manifest
      .map(
        (lines) => `    <signature>
${lines.map((l) => `      <line>${xe(l)}</line>`).join('\n')}
    </signature>`,
      )
      .join('\n')}
  </electronic_signatures>
</document>`;
  return {
    content: Buffer.from(xmlContent, 'utf-8'),
    fileName: `${safeFileStem(doc.title)}.xml`,
    contentType: 'application/xml',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCX
// ─────────────────────────────────────────────────────────────────────────────

async function renderDocx(args: RenderExportArgs, shared: SharedRender): Promise<{ content: Buffer; fileName: string; contentType: string }> {
  const { doc } = args;
  /* `await import`, not `require`: package.json declares "type": "module". */
  const docxNs = await import('docx');
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = docxNs;
  const { blocksToDocx, orderedListNumbering, sectionHeadingParagraph, referenceListParagraphs } =
    await import('../../export/authoring-blocks-to-docx.js');

  const exportedAt = new Date().toISOString();
  const children = [];
  children.push(new Paragraph({ text: doc.title, heading: HeadingLevel.TITLE }));
  if (args.notice) {
    children.push(new Paragraph({ children: [new TextRun({ text: args.notice, italics: true, bold: true })] }));
  }
  /* An unresolved suggestion exports as a REAL Word revision (w:ins / w:del)
     with an up-front notice — settling it silently either way at export time
     would fabricate a decision nobody made. */
  if (shared.pendingIns + shared.pendingDel > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text:
              `This document contains unresolved tracked changes ` +
              `(${shared.pendingIns} proposed insertion(s), ${shared.pendingDel} proposed deletion(s)), ` +
              `rendered below as redline.`,
            italics: true,
          }),
        ],
      }),
    );
  }
  /* Word holds footnotes on the DOCUMENT, keyed by an id the referencing run
     cites; one counter for the whole export guarantees unique ids. Identical
     note text cited twice reuses its id, as Word does natively. */
  const footnoteText = new Map<string, number>();
  const footnoteSink = (noteText: string): number => {
    const hit = footnoteText.get(noteText);
    if (hit !== undefined) return hit;
    const id = footnoteText.size + 1;
    footnoteText.set(noteText, id);
    return id;
  };
  /* ONE caption counter for the whole file: a submission's tables run 1..n. */
  const captions = shared.makeCaptionNumbering();
  for (const { section, blocks } of shared.parsedSections) {
    /* The heading carries the Word bookmarks every REF field to this section
       cites — emitted for EVERY section so a resolved reference always finds
       its anchor. */
    children.push(sectionHeadingParagraph(docxNs, section));
    children.push(
      ...blocksToDocx(docxNs, blocks, shared.exportImages, {
        revisionDate: exportedAt,
        footnoteSink,
        crossRefs: shared.crossRefs,
        citations: shared.citations,
        captions,
      }),
    );
  }
  /* The reference list: nothing is emitted when nothing was cited. */
  children.push(...referenceListParagraphs(docxNs, shared.citations));

  /* §11.50(b) manifestation, after the content. */
  children.push(new Paragraph({ text: 'Electronic signatures', heading: HeadingLevel.HEADING_1 }));
  if (shared.manifest.length === 0) {
    children.push(new Paragraph({ text: 'No electronic signatures are recorded against this document.' }));
  } else {
    for (const lines of shared.manifest) {
      for (const line of lines) children.push(new Paragraph({ text: line }));
      children.push(new Paragraph({ text: '' }));
    }
  }

  const docxDoc = new Document({
    /* Without a declared numbering definition the ordered-list reference is
       inert and numbered steps silently render unnumbered. */
    numbering: orderedListNumbering(docxNs),
    ...(footnoteText.size > 0
      ? {
          footnotes: Object.fromEntries(
            [...footnoteText.entries()].map(([text, id]) => [String(id), { children: [new Paragraph({ text })] }]),
          ),
        }
      : {}),
    sections: [{ children }],
  });
  return {
    content: await Packer.toBuffer(docxDoc),
    fileName: `${safeFileStem(doc.title)}.docx`,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF
// ─────────────────────────────────────────────────────────────────────────────

async function renderPdf(args: RenderExportArgs, shared: SharedRender): Promise<{ content: Buffer; fileName: string; contentType: string }> {
  const { doc } = args;
  // Real PDF via the platform's HTML→PDF renderer (the same engine the
  // template render path uses).
  const { renderHtmlToPdf } = await import('../../export/renderers');
  const { blocksToHtml, renderReferenceListHtml, escapeHtml: esc, PRINT_STYLES } =
    await import('../../export/authoring-blocks-to-html.js');
  /* Section content parsed to typed runs and re-emitted as a WHITELISTED
     structure with every text node escaped — stored markup never reaches the
     renderer raw. Same parse and SAME citation registry as the DOCX branch. */
  const pdfCaptions = shared.makeCaptionNumbering();
  const pdfSections = shared.parsedSections.map(({ section: s, blocks }) => {
    const body = blocksToHtml(blocks, shared.exportImages, {
      crossRefs: shared.crossRefs,
      citations: shared.citations,
      captions: pdfCaptions,
    });
    // The heading is the anchor a resolved cross-reference links to.
    return `<h2 id="${esc(shared.crossReferenceAnchorId(String(s.id)))}">${esc(s.code)} — ${esc(s.title)}</h2>${body}`;
  });
  const referenceListHtml = renderReferenceListHtml(shared.citations);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
          body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; margin: 1in; }
          h1 { font-size: 18pt; } h2 { font-size: 14pt; margin-top: 1.2em; } h3 { font-size: 12.5pt; margin-top: 1em; }
          p { white-space: pre-wrap; } p.li { margin: 0 0 0 1.2em; }
          ${PRINT_STYLES}
          ins { color: #067647; text-decoration: underline; }
          del { color: #b42318; text-decoration: line-through; }
          .redline-note { font-style: italic; }
        </style></head><body>
        <h1>${esc(doc.title)}</h1>${args.notice ? `\n        <p class="redline-note"><strong>${esc(args.notice)}</strong></p>` : ''}
        ${
          shared.pendingIns + shared.pendingDel > 0
            ? `<p class="redline-note">This document contains unresolved tracked changes (${shared.pendingIns} proposed insertion(s), ${shared.pendingDel} proposed deletion(s)), rendered below as redline.</p>`
            : ''
        }
        ${pdfSections.join('\n')}
        ${referenceListHtml}
        <h2>Electronic signatures</h2>
        ${shared.manifest.length === 0
          ? '<p>No electronic signatures are recorded against this document.</p>'
          : shared.manifest
              .map((lines) => `<p>${lines.map(esc).join('<br/>')}</p>`)
              .join('\n')}
        </body></html>`;
  return {
    content: await renderHtmlToPdf(html),
    fileName: `${safeFileStem(doc.title)}.pdf`,
    contentType: 'application/pdf',
  };
}

/** Render one authoring document in one format. Throws on a renderer failure. */
export async function renderAuthoringExport(args: RenderExportArgs): Promise<RenderedExport> {
  const shared = await prepareShared(args);
  const out =
    args.format === 'xml'
      ? renderXml(args, shared)
      : args.format === 'docx'
        ? await renderDocx(args, shared)
        : await renderPdf(args, shared);
  return {
    fileContent: out.content,
    fileName: out.fileName,
    contentType: out.contentType,
    artifactSha256: crypto.createHash('sha256').update(out.content).digest('hex'),
  };
}

/**
 * The SOURCE digest of a document: sha256 over its section rows in order.
 * Was the router's `computeDocHash` (the router keeps a wrapper). Stored as
 * `doc_sha256` on every export record so GET /docs/:docId/exports can answer
 * content_changed_since_last_export source-to-source.
 */
export async function computeDocHash(
  executor: Queryable,
  docId: string | string[] | undefined,
  tenantId: number,
): Promise<string> {
  const sections = await executor.query(
    'SELECT code, content FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index',
    [docId, tenantId],
  );
  const content = sections.rows.map((s: { code: string; content: string }) => `${s.code}:${s.content}`).join('|||');
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// The durable export record
// ─────────────────────────────────────────────────────────────────────────────

export interface LogExportArgs {
  docId: string;
  format: string;
  /** computeDocHash over the SOURCE section rows (content_changed_since_last_export). */
  docSha256: string;
  exportedBy: string;
  fileName?: string;
  fileSize?: number;
  metadata?: Record<string, unknown>;
  tenantId: number;
}

/**
 * Record an export in `authoring_export_history` — the same table
 * GET /docs/:docId/exports lists and GET /docs/:docId/diff-since-export
 * baselines against. Was the router's `logExport`. The table is provisioned by
 * db/migrations/20260730_authoring_runtime_ddl.sql.
 */
export async function logExport(executor: Queryable, args: LogExportArgs): Promise<{ id: unknown; exported_at: unknown }> {
  const result = await executor.query(
    `INSERT INTO authoring_export_history
      (document_id, export_type, doc_sha256, exported_by, file_name, file_size, metadata, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, exported_at`,
    [
      args.docId,
      args.format,
      args.docSha256,
      args.exportedBy,
      args.fileName,
      args.fileSize,
      args.metadata ? JSON.stringify(args.metadata) : null,
      args.tenantId,
    ],
  );
  return result.rows[0];
}
