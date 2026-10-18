/** One deterministic stored-source → copy rule, shared by creation and release.
 * Markdown structure uses the installed deterministic parser; source hashes describe the
 * original, while genesis/lineage hashes describe these sanitized copy bytes. */
import { looksLikeHtml } from '../../../shared/authoring/plain-text-html';
import { marked, Renderer } from 'marked';
import { sanitizeMachineDraftSectionHtml } from './authoring-html-sanitizer';

export function workflowCopySectionContent(source: string): string {
  const renderer = new Renderer();
  renderer.html = ({ text }) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = looksLikeHtml(source) ? source : marked.parse(source, { async: false, gfm: true, renderer });
  // A copied image has no verified figure-upload receipt. Keep a named gap,
  // rather than silently dropping it or declaring the importer uploaded it.
  const withFigureGaps = html.replace(/<img\b[^>]*>/gi, tag => {
    const alt = /\balt=["']([^"']*)["']/i.exec(tag)?.[1];
    const label = alt ? `: ${alt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}` : '';
    return `<p>[Source figure${label}; verify and add the original figure in the editor.]</p>`;
  });
  return sanitizeMachineDraftSectionHtml(withFigureGaps);
}
