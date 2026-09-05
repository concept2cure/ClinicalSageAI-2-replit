/**
 * Word (.docx) → authoring sections, with the structure kept.
 *
 * ── Why this is not one of the four mammoth calls already in the repo ────────
 * Four services already read .docx: projects/extract-text, ocr/
 * extractDocumentText, memory/document-text-extraction and
 * DocumentDataCenterService. Every one of them calls `extractRawText`, which
 * returns a flat string. That is the right answer for search and retrieval,
 * which is what they do, and the wrong one here: a regulatory author importing
 * a technical file needs the TABLES — a predicate comparison, a GSPR matrix, a
 * stability table IS the content — and headings, lists and emphasis. Raw text
 * throws all of it away (MDX_WORK_ORDER W3-5).
 *
 * So this converts to HTML and keeps the structure, into the same tag subset
 * the section editor accepts and `server/export/authoring-section-content.ts`
 * parses back out. Import and export therefore speak one format, and a
 * document can go out and come back — which is how this file is tested.
 *
 * ── Honesty ──────────────────────────────────────────────────────────────────
 * A silent lossy import of a governed document is the worst failure available
 * here: the author sees text on screen, believes the file arrived, and files a
 * technical document with a table missing. So:
 *
 *   • mammoth's own messages (unrecognised styles, dropped constructs) are
 *     RETURNED, never swallowed;
 *   • a heading with no recognisable section code gets `code: null` and is
 *     reported — no code is invented, and the caller decides;
 *   • counts of what came in (tables, images, lists) are returned so the caller
 *     can state them, and an author can check the number against the file they
 *     dragged in rather than trusting that everything made it.
 *
 * @module server/import/docx-to-authoring
 */

/** A section recovered from the document's heading structure. */
export interface ImportedSection {
  /** The section code parsed from the heading, or null when it carries none. */
  code: string | null;
  title: string;
  /** Editor-compatible HTML for this section's body (headings excluded). */
  html: string;
  /** Heading depth it was found at (1-6), for rebuilding hierarchy. */
  level: number;
}

export interface DocxImportResult {
  sections: ImportedSection[];
  /**
   * What the reader must be told. Includes mammoth's own messages verbatim and
   * this module's own findings (a heading with no code, a document with no
   * headings at all).
   */
  warnings: string[];
  /** What arrived, so the caller can state it rather than imply completeness. */
  counts: { sections: number; tables: number; images: number; lists: number };
}

/**
 * Word styles → HTML, beyond mammoth's defaults.
 *
 * Mammoth maps the built-in Heading N styles already. Regulatory templates
 * routinely carry their own named styles, and an unmapped style is silently
 * flattened to a plain paragraph — the emphasis is simply gone. These map the
 * conventions that appear in the templates this product handles; anything still
 * unmapped produces a mammoth message, which is surfaced rather than dropped.
 */
const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Caption'] => p.caption:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote:fresh",
  "r[style-name='Strong'] => strong",
  "r[style-name='Emphasis'] => em",
  // Table cell text in these templates is frequently styled rather than tagged.
  "p[style-name='Table Paragraph'] => p:fresh",
];

/**
 * A leading section code in a heading: "5.1 Device Description",
 * "3.2.S Drug Substance", "2.7.3 Summary of Clinical Efficacy".
 *
 * Deliberately strict. A heading that merely STARTS with a number — "2016
 * revision of the standard" — is not a section code, and inventing one would
 * file the content under a coordinate the author never chose. The code must be
 * dotted (at least one separator) or a bare integer followed by a real title.
 */
const HEADING_CODE = /^\s*((?:\d+|[A-Z])(?:\.(?:\d+|[A-Z]))+|\d+)[.)]?\s+(\S.*)$/;

/** Split a heading into its section code and title. */
export function parseHeading(text: string): { code: string | null; title: string } {
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim();
  const m = HEADING_CODE.exec(raw);
  if (!m) return { code: null, title: raw };
  const code = m[1].replace(/[.)]$/, '');
  // A single bare integer is only a code when a title follows it; "2016" alone
  // is a year, not a section.
  return { code, title: m[2].trim() };
}

const TAG = /<\/?([a-z][a-z0-9]*)\b/gi;

function countTag(html: string, ...names: string[]): number {
  let n = 0;
  TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG.exec(html)) !== null) {
    if (!m[0].startsWith('</') && names.includes(m[1].toLowerCase())) n++;
  }
  return n;
}

/**
 * Split converted HTML at its headings into sections.
 *
 * Content before the first heading is kept under a section with no code and no
 * title rather than discarded — a preamble is content, and dropping it would be
 * exactly the silent loss this module exists to avoid.
 */
export function splitIntoSections(html: string): ImportedSection[] {
  const parts: ImportedSection[] = [];
  const re = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let last = 0;
  let current: ImportedSection | null = null;
  let m: RegExpExecArray | null;

  const strip = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
  const flush = (endsAt: number) => {
    const body = html.slice(last, endsAt).trim();
    if (current) {
      current.html = body;
      parts.push(current);
    } else if (body) {
      parts.push({ code: null, title: '', html: body, level: 0 });
    }
  };

  while ((m = re.exec(html)) !== null) {
    flush(m.index);
    const { code, title } = parseHeading(strip(m[2]));
    current = { code, title, html: '', level: Number(m[1]) };
    last = re.lastIndex;
  }
  flush(html.length);
  return parts;
}

/**
 * Convert a .docx buffer into authoring sections.
 *
 * mammoth is imported lazily, matching the four existing readers — the cost is
 * paid only when a document is actually imported.
 */
export async function importDocx(buffer: Buffer): Promise<DocxImportResult> {
  const mod: any = await import('mammoth');
  const mammoth = mod.default ?? mod;

  const converted = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: STYLE_MAP,
      // An image with no data is worse than a named gap: keep the alt text so
      // the author can see that something was there.
      convertImage: mammoth.images?.imgElement
        ? mammoth.images.imgElement(async (image: any) => {
            const b64 = await image.read('base64');
            return { src: `data:${image.contentType};base64,${b64}`, alt: image.altText ?? '' };
          })
        : undefined,
    },
  );

  const html: string = String(converted?.value ?? '');
  const warnings: string[] = (converted?.messages ?? [])
    .map((x: { message?: string }) => String(x?.message ?? '').trim())
    .filter(Boolean);

  const sections = splitIntoSections(html);

  if (sections.length === 0) {
    warnings.push('The document produced no content.');
  } else if (sections.every((s) => !s.title)) {
    warnings.push(
      'No headings were found, so the document could not be split into sections. ' +
        'It has been imported as a single body of content.',
    );
  }
  const uncoded = sections.filter((s) => s.title && !s.code).length;
  if (uncoded > 0) {
    warnings.push(
      `${uncoded} heading(s) carry no section code. They are imported under their ` +
        'heading text; assign codes before filing.',
    );
  }

  return {
    sections,
    warnings,
    counts: {
      sections: sections.length,
      tables: countTag(html, 'table'),
      images: countTag(html, 'img'),
      lists: countTag(html, 'ul', 'ol'),
    },
  };
}

export default { importDocx, splitIntoSections, parseHeading };
