/**
 * How the export and the eCTD leaf read a section's HTML, in one place.
 *
 * node-html-parser reads <pre> as raw text by default. So the markup inside
 * one was printed as text into the filed leaf, the PDF and the Word file: an
 * <img> with its base64 payload, or a <code> with its tags. Every browser and
 * the section editor read the same markup as a figure and as code
 * (refute-review of the figure rule, 2026-10-04, round 3: D2).
 *
 * Here <pre> is markup like any other element. script, noscript and style keep
 * the parser's default, because their text is not document markup.
 *
 * The section save reads sections the same way (exportImageSrcs in
 * services/authoring/authoring-html-sanitizer.ts), so the image list it
 * compares with a browser's is the one the export will act on.
 */
import { parse } from 'node-html-parser';

export function parseSectionHtml(html: string): ReturnType<typeof parse> {
  return parse(html, { blockTextElements: { script: true, noscript: true, style: true } });
}
