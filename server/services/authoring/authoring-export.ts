/**
 * Authoring export rendering — the body of `POST /docs/:docId/export` in
 * server/routes/authoring.router.ts, moved here (WM, 2026-09-21) so that
 * `POST /docs/:docId/file-to-vault` can render the SAME bytes the export route
 * ships without a second renderer. The route keeps the HTTP: the sealed-record
 * gate, the audit event, the headers. This module renders.
 *
 * DOCX and PDF share the rich Word document and strict canonical converter,
 * with one citation registry, caption directory and figure map. XML retains
 * its existing representation. An optional `notice` ahead of the content says
 * when a Vault rendition is an unsealed working draft.
 */

import crypto from 'crypto';
import type { Queryable } from './authoring-evidence';
import { describeSignatureMethod } from '../../../shared/part11/signature-method';
import { verifySavedDraftSourceReferences } from './draft-source-references';
import type { AuthoringActor } from './authoring-documents';
import { assertWorkflowImportRelease, verifyWorkflowImportWorkingCopy } from './workflow-import-governance';
import { sectionsDigest } from './authoring-content-digests';
import type { CompanyDocumentProfile } from '../../../shared/company-documents';
import { correspondenceTemplate, readCorrespondencePresentation } from '../company-documents/correspondence-rendering';
import type { DocxStyle } from '../docx/docxFactory';
import type { ISectionOptions, Paragraph as WordParagraph, Table as WordTable } from 'docx';
import { isConversionCapacityError } from '../conversion-slots';
// Preserve this service's public API while keeping workflow release checks
// independent of the renderer's async initialization (production boot).
export { computeAuthoringSignatureDigest, sectionsDigest } from './authoring-content-digests';

export type ExportFormat = 'docx' | 'pdf' | 'xml';
export const EXPORT_FORMATS: readonly ExportFormat[] = ['docx', 'pdf', 'xml'];

export interface ExportDocRow {
  id: string;
  title: string;
  module?: string | null;
  status?: string | null;
  created_at?: unknown;
  provenance?: unknown;
  client_program_id?: string | null;
  created_by?: unknown;
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
  /**
   * How the file was rendered. 'plain-text-fallback' remains readable for old
   * records and defensive admission checks; new Authoring PDFs use the rich
   * Word converter or refuse before delivery and filing.
   */
  rendering: ExportRendering;
}

/** 'formatted' for every DOCX and XML, and for a PDF the PDF engine rendered. */
export type ExportRendering = 'formatted' | 'plain-text-fallback';

/** A definite conversion refusal; internal converter details remain in cause. */
export class AuthoringPdfRenderingError extends Error {
  readonly status = 503;
  readonly code = 'PDF_RENDERER_UNAVAILABLE';

  constructor(cause: unknown) {
    super('The formatted PDF could not be completed. Nothing was delivered or filed. Download Word or contact an administrator.', { cause });
    this.name = 'AuthoringPdfRenderingError';
  }
}

export interface RenderExportArgs {
  /** Internal: loaded from the immutable company revision, never the HTTP body. */
  companyPresentation?: CompanyDocumentProfile | null;
  executor: Queryable;
  tenantId: number;
  doc: ExportDocRow;
  sections: ExportSectionRow[];
  format: ExportFormat;
  actor?: AuthoringActor;
  /**
   * A statement rendered before the content — e.g. that this is a working
   * draft and not a sealed record. Absent on the export route.
   */
  notice?: string | null;
  /**
   * Signatures the caller has already read — the export route reads them to
   * decide whether to refuse, and passing them here keeps the manifest and that
   * decision on ONE read. Read here when absent.
   */
  signatures?: SignatureRow[];
  /**
   * Render an uncontrolled working copy (docs/design/ONE_ANA_ONE_CANVAS.md
   * §4.5, slice 7): `banner` is printed in the header and footer of EVERY page,
   * and the §11.50(b) signature manifestation is NOT rendered, so a copy of a
   * draft can never print a signature as covering its content. DOCX and PDF
   * only. Absent on the controlled export and the vault filing.
   */
  workingCopy?: { banner: string };
}

/** Where a working copy's manifestation would be: said, not omitted silently. */
export const WORKING_COPY_SIGNATURE_STATEMENT =
  'Uncontrolled working copy. No electronic signature applies to this copy: signatures are ' +
  'carried only by a controlled export of a frozen or approved document.';

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
 *
 * ── Every printed hash carries a verdict ─────────────────────────────────────
 * This used to print `Content hash at signing: <hash>` and stop. The export
 * route computed the live hash of the same sections, by the same function, a
 * few lines earlier — and the two were never compared. A filed DOCX could carry
 * "Signed by Rita Okafor / Meaning: Approval / Content hash at signing: <hash>"
 * above prose that hashes to something else, and nothing on the page said so.
 * That is not an incomplete manifestation but a misleading one: the artifact
 * asserts a signature over content it does not contain. 21 CFR 11.70 requires
 * signatures to be linked to their records "to ensure that the signatures
 * cannot be excised, copied, or otherwise transferred to falsify an electronic
 * record"; a printed hash nobody checks is exactly that link not being made.
 *
 * A mismatch is NOT by itself a fault, which is why this states a verdict
 * rather than hiding the signature. The ordinary flow produces one: an AUTHOR
 * signs, editing continues (an AUTHOR signature does not lock the document), an
 * APPROVER signs the final text. The author's signature then legitimately
 * covers earlier content, and a reviewer is entitled to see exactly that rather
 * than a hash they would have to recompute by hand.
 *
 * `authoring_signatures` is insert-and-select only by design — no void or
 * superseded column — so staleness cannot be recorded in the store. It has to
 * be computed here, at render time, against the content being rendered.
 *
 * @param currentHash sectionsDigest() of the sections being rendered. When
 *   absent the line says no check was made, rather than implying one was.
 */
export function signatureManifestLines(sigs: SignatureRow[], currentHash?: string | null): string[][] {
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
    // §11.200: how the signer was authenticated, in the product's one wording.
    lines.push(`Method: ${describeSignatureMethod(s.method, s.pin_verified)}`);
    // §11.70 — which record this signature is linked to.
    lines.push(
      s.covered_freeze_version
        ? `Covers: frozen version ${s.covered_freeze_version}`
        : 'Covers: no frozen snapshot was in force when this was signed',
    );
    if (s.content_hash) {
      lines.push(`Content hash at signing: ${s.content_hash}`);
      lines.push(signatureVerdictLine(s.content_hash, currentHash));
    }
    return lines;
  });
}

/**
 * The verdict for one signature. Both hashes come from {@link sectionsDigest}
 * over the same section rows, so string equality is the whole comparison — no
 * re-derivation and no normalization.
 */
export function signatureVerdictLine(signedHash: string, currentHash?: string | null): string {
  if (!currentHash) return 'Verification: not checked — no hash of the rendered content was computed';
  if (signedHash === currentHash) return 'Verification: this signature covers the content of this document';
  return (
    'Verification: DOES NOT COVER this document — the content has changed since this ' +
    `signature was applied (the rendered content hashes to ${currentHash})`
  );
}

/** True when at least one signature was applied to exactly this content. */
export function anySignatureCovers(sigs: SignatureRow[], currentHash: string): boolean {
  return sigs.some((s) => !!s.content_hash && s.content_hash === currentHash);
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
  /* The manifest verifies against the sections being RENDERED, not a second
     read of the table — so the verdict describes exactly the bytes it sits in. */
  const signatures = args.signatures ?? (await readSignaturesForExport(executor, String(doc.id), tenantId));
  const manifest = signatureManifestLines(signatures, sectionsDigest(sections));
  const binary = format === 'docx' || format === 'pdf';

  const { resolveAuthoringImages } = await import('../../export/authoring-images.js');
  const exportImages = binary
    ? await resolveAuthoringImages(sections.map((s) => s.content), tenantId,
      args.actor ? { userId: Number(args.actor.id) } : undefined)
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

  const { listCitationSources } = await import('../../services/clinical-regulatory-evidence/source-usage.service.js');
  const citationSourcesBySection = new Map<string, Awaited<ReturnType<typeof listCitationSources>>>();
  for (const { section, blocks } of parsedSections) {
    citationSourcesBySection.set(String(section.id), await listCitationSources(tenantId, collectCitedSourceIds(blocks),
      { documentId: String(doc.id), sectionId: String(section.id), userId: args.actor ? Number(args.actor.id) : undefined }, executor));
  }
  const citationSources = [...citationSourcesBySection.values()].flat();
  const citations = makeCitationRegistry(citationLookupFor(citationSources));
  const citationsForSection = (sectionId: string): typeof citations => {
    const allowed = new Set((citationSourcesBySection.get(sectionId) ?? []).map(source => source.id));
    return { cite: id => id && allowed.has(id) ? citations.cite(id) : { found: false }, entries: citations.entries };
  };

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
    citationsForSection,
    makeCaptionNumbering,
    pendingIns,
    pendingDel,
  };
}

const safeFileStem = (title: string) => title.replace(/[^a-zA-Z0-9]/g, '_');

// ─────────────────────────────────────────────────────────────────────────────
// XML
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A section's content as the XML carries it: the stored HTML, with every image
 * the DOCX and PDF would not file replaced by the same "[Figure not exported:
 * …]" placeholder they print (unfiledFigureLabel), so the three formats of one
 * document agree. A figure (a governed reference, or an inline PNG, JPEG or
 * GIF) is kept as written. A section whose images a browser and the export
 * read differently files none of them, as in the other formats.
 *
 * Until 2026-10-05 the XML wrote the stored HTML verbatim, so an older
 * section's external image URL or WebP payload appeared in the exported file
 * though DOCX and PDF refused it (refute-review of the figure rule, round 3:
 * O3; work-orders item 18).
 */
async function xmlSectionContent(content: string | null | undefined): Promise<string> {
  const html = String(content ?? '');
  if (!/<img/i.test(html)) return html;
  const [{ parseSectionHtml }, { unfiledFigureLabel }, { imageReadingsDiffer }, { isFigureSrc }] = await Promise.all([
    import('../../export/section-html-parse.js'),
    import('../../export/authoring-images.js'),
    import('./authoring-html-sanitizer.js'),
    import('@shared/authoring/figure-refs'),
  ]);
  const disagree = (await imageReadingsDiffer(html)) !== null;
  const root = parseSectionHtml(html);
  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    if (!disagree && isFigureSrc(src)) continue;
    const label = unfiledFigureLabel({ src: src ?? undefined, alt: img.getAttribute('alt') ?? undefined });
    img.replaceWith(`[Figure not exported: ${label}]`.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  }
  return root.toString();
}

function renderXml(
  args: RenderExportArgs,
  shared: SharedRender,
  contents: readonly string[],
): { content: Buffer; fileName: string; contentType: string } {
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
    (s, i) => `    <section code="${xe(s.code)}">
      <title>${xe(s.title)}</title>
      <content><![CDATA[${cdata(contents[i])}]]></content>
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

async function companyWordPresentation(args: RenderExportArgs, docxNs: typeof import('docx')) {
  if (!args.companyPresentation) return { style: null, prefix: [] as WordParagraph[] };
  const { templateSpecToDocxStyle } = await import('../templates/templateRenderAdapter');
  const style = templateSpecToDocxStyle(correspondenceTemplate(args.companyPresentation));
  if (style.logo?.placement !== 'cover') return { style, prefix: [] as WordParagraph[] };
  const logo = (await import('../docx/docxFactory')).logoImageRun(style.logo, 220, 90);
  if (!logo) throw new Error('The retained company logo could not be rendered. Nothing was exported.');
  return { style, prefix: [new docxNs.Paragraph({ children: [logo] })] };
}
async function authoringWordSection(args: RenderExportArgs, style: DocxStyle | null,
  children: Array<WordParagraph | WordTable>, docxNs: typeof import('docx')): Promise<ISectionOptions> {
  if (style) return { ...(await import('../docx/docxFactory')).regulatoryLetterheadSection(style,
    { title: args.doc.title, submissionType: 'Correspondence' }, true, args.workingCopy?.banner), children };
  if (!args.workingCopy) return { children };
  const bannerText = args.workingCopy.banner;
  const banner = () => new docxNs.Paragraph({ children: [new docxNs.TextRun({ text: bannerText, bold: true })] });
  return { headers: { default: new docxNs.Header({ children: [banner()] }) },
    footers: { default: new docxNs.Footer({ children: [banner()] }) }, children };
}

async function renderDocx(args: RenderExportArgs, shared: SharedRender): Promise<{ content: Buffer; fileName: string; contentType: string }> {
  const { doc } = args;
  /* `await import`, not `require`: package.json declares "type": "module". */
  const docxNs = await import('docx');
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = docxNs;
  const { blocksToDocx, orderedListNumbering, sectionHeadingParagraph, referenceListParagraphs } =
    await import('../../export/authoring-blocks-to-docx.js');

  const exportedAt = new Date().toISOString();
  const { style: companyStyle, prefix } = await companyWordPresentation(args, docxNs);
  const children: Array<WordParagraph | WordTable> = [...prefix];
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
        citations: shared.citationsForSection(String(section.id)),
        captions,
      }),
    );
  }
  /* The reference list: nothing is emitted when nothing was cited. */
  children.push(...referenceListParagraphs(docxNs, shared.citations));

  /* §11.50(b) manifestation, after the content. A working copy carries none. */
  children.push(new Paragraph({ text: 'Electronic signatures', heading: HeadingLevel.HEADING_1 }));
  if (args.workingCopy) {
    children.push(new Paragraph({ text: WORKING_COPY_SIGNATURE_STATEMENT }));
  } else if (shared.manifest.length === 0) {
    children.push(new Paragraph({ text: 'No electronic signatures are recorded against this document.' }));
  } else {
    for (const lines of shared.manifest) {
      for (const line of lines) children.push(new Paragraph({ text: line }));
      children.push(new Paragraph({ text: '' }));
    }
  }

  const docxDoc = new Document({
    ...(companyStyle ? { styles: { default: { document: { run: { font: companyStyle.fonts.body, size: companyStyle.fontSizes.body } } } } } : {}),
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
    sections: [await authoringWordSection(args, companyStyle, children, docxNs)],
  });
  return {
    content: await Packer.toBuffer(docxDoc),
    fileName: `${safeFileStem(doc.title)}${args.workingCopy ? '_working_copy' : ''}.docx`,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF
// ─────────────────────────────────────────────────────────────────────────────

async function renderPdf(
  args: RenderExportArgs,
  shared: SharedRender,
): Promise<{ content: Buffer; fileName: string; contentType: string; rendering: ExportRendering }> {
  const { doc } = args;
  // Preserve Word-building/source refusals; only conversion failures get the
  // safe PDF refusal. Ordinary and historical company documents use one path.
  const source = await renderDocx(args, shared);
  try {
    const { convertDocxToPdf } = await import('../pdf-converter');
    const converted = await convertDocxToPdf(source.content, { backend: 'libreoffice' });
    return { content: converted.pdf, fileName: `${safeFileStem(doc.title)}${args.workingCopy ? '_working_copy' : ''}.pdf`,
      contentType: 'application/pdf', rendering: 'formatted' };
  } catch (error) {
    if (isConversionCapacityError(error)) throw error;
    throw new AuthoringPdfRenderingError(error);
  }
}

/** Render one authoring document in one format. Throws on a renderer failure. */
export async function renderAuthoringExport(args: RenderExportArgs): Promise<RenderedExport> {
  // Always resolve internally: callers cannot override a historical reference with current branding.
  args = { ...args, companyPresentation: await readCorrespondencePresentation(args.executor, args.tenantId, args.doc) };
  if (args.workingCopy && args.format === 'xml') throw new Error('A working copy is rendered as DOCX or PDF only');
  await verifySavedDraftSourceReferences(args.doc, args.executor, args.tenantId, args.actor);
  if (!args.workingCopy) await assertWorkflowImportRelease(args.executor, {
    organizationId: args.tenantId, doc: args.doc, sections: args.sections, actor: args.actor,
  });
  else {
    const workflow = await verifyWorkflowImportWorkingCopy(args.executor, {
      organizationId: args.tenantId, doc: args.doc, sections: args.sections, actor: args.actor,
    });
    if (workflow) args = { ...args,
      workingCopy: { banner: `${args.workingCopy.banner} · workflow qualification not established` },
      notice: `Workflow review copy — NOT FINAL. Original authorship remains as recorded. ` +
        `Model qualification and scientific source support are not established by this import. ` +
        `${workflow.knownMachineRemains ? 'Stored machine content remains on release hold. ' : 'Human review and explicit adoption are required before release. '}` +
        `Retained source ${workflow.origin.kind} ${workflow.origin.id}, fingerprint ${workflow.origin.fingerprint}.`,
    };
  }
  const shared = await prepareShared(args);
  const out: { content: Buffer; fileName: string; contentType: string; rendering?: ExportRendering } =
    args.format === 'xml'
      ? renderXml(args, shared, await Promise.all(args.sections.map((s) => xmlSectionContent(s.content))))
      : args.format === 'docx'
        ? await renderDocx(args, shared)
        : await renderPdf(args, shared);
  return {
    fileContent: out.content,
    fileName: out.fileName,
    contentType: out.contentType,
    artifactSha256: crypto.createHash('sha256').update(out.content).digest('hex'),
    rendering: out.rendering ?? 'formatted',
  };
}

/**
 * The SOURCE digest of a document: sha256 over its section rows in order.
 * Was the router's `computeDocHash` (the router keeps a wrapper). Stored as
 * `doc_sha256` on every export record so GET /docs/:docId/exports can answer
 * content_changed_since_last_export source-to-source.
 *
 * 2026-10-18 (P-29, D-29-A): the ORDER BY is a TOTAL order, and it is signing's.
 * This read was `ORDER BY order_index` alone, while everything this digest is
 * compared against was computed over `order_index, created_at, id`:
 *
 *  - GET /docs/:docId/exports compares it with the `doc_sha256` on the last
 *    export row, and both writers of that column (authoring-file-to-vault.ts
 *    and the router's controlled export) compute `sectionsDigest` over a read
 *    in signing's total order;
 *  - the document-delete audit row records it as "the same section digest the
 *    signatures store as content_hash".
 *
 * `order_index` is `INTEGER DEFAULT 0` with no unique constraint
 * (db/migrations/20260725_authoring_document_loop_tables.sql:65) and
 * `placeNewSection` honours a client-supplied index as given, so a tie is
 * reachable from the product — and over a tie group PostgreSQL may return the
 * rows in any sequence. So for a tied document the export verdict compared two
 * different orders and could report a change nobody made, which is the harm the
 * route's own comment warns of, and the delete row's claim of equivalence was
 * untrue.
 *
 * `order_index, created_at, id` is what `sectionsDigest`'s own contract
 * requires of every recomputation ("Rows are already in the caller's recorded
 * order … exports and release checks must recompute the identical bytes") and
 * what every other reader of these rows already uses: `lockedSigningContent`
 * (which is where /freeze, /e-sign and /sign get the digest they sign — none of
 * them calls this function), authoring-file-to-vault.ts,
 * services/c2c/filing-section-target.ts and the QMS controlled-document read.
 * This was the one outlier. Pinned by
 * __tests__/authoring-doc-hash-total-order.pglite.test.ts.
 */
export async function computeDocHash(
  executor: Queryable,
  docId: string | string[] | undefined,
  tenantId: number,
): Promise<string> {
  const sections = await executor.query(
    `SELECT code, content FROM authoring_sections
      WHERE doc_id = $1 AND tenant_id = $2
      ORDER BY order_index, created_at, id`,
    [docId, tenantId],
  );
  return sectionsDigest(sections.rows);
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
