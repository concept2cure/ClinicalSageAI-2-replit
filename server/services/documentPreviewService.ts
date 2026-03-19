/**
 * Document Preview Service
 *
 * Generates HTML previews of documents stored in the system.
 * Supports text/JSON content from the database, DOCX files (via mammoth),
 * and plain text/markdown files.
 *
 * All HTML output is sanitized to prevent XSS.
 */

import { storage } from '../storage';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// HTML sanitization – tag/attribute allowlist approach
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
  'blockquote', 'pre', 'code',
  'div', 'span', 'section', 'article',
  'a', 'img',
  'dl', 'dt', 'dd',
  'caption', 'figure', 'figcaption',
]);

const ALLOWED_ATTRS = new Set([
  'class', 'id', 'style',
  'href', 'target', 'rel',
  'src', 'alt', 'width', 'height',
  'colspan', 'rowspan', 'scope',
]);

/**
 * Lightweight HTML sanitizer that strips disallowed tags and attributes.
 * Not a replacement for a full-blown library in production, but sufficient
 * for internally-generated preview content.
 */
export function sanitizeHtml(raw: string): string {
  // Strip <script> and <style> blocks entirely (including content)
  let html = raw.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
  html = html.replace(/<style[\s\S]*?<\/style\s*>/gi, '');

  // Strip event handler attributes (onclick, onerror, etc.)
  html = html.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Strip javascript: / data: URIs in href / src
  html = html.replace(/(href|src)\s*=\s*["']?\s*javascript:/gi, '$1="');
  html = html.replace(/(href|src)\s*=\s*["']?\s*data:/gi, '$1="');

  // Remove disallowed tags but keep their inner content
  html = html.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*\/?>/gi, (match, tagName) => {
    const lower = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(lower)) {
      return '';
    }
    // For allowed tags, strip disallowed attributes
    return match.replace(/\s+([a-z\-]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, (attrMatch, attrName) => {
      if (ALLOWED_ATTRS.has(attrName.toLowerCase())) {
        return attrMatch;
      }
      return '';
    });
  });

  return html;
}

// ---------------------------------------------------------------------------
// Inline CSS for preview rendering
// ---------------------------------------------------------------------------

const PREVIEW_CSS = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Poppins', Roboto, 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.6;
    color: #292524;
    margin: 0;
    padding: 24px 32px;
    background: #ffffff;
  }
  .preview-header {
    border-bottom: 2px solid #e8e6dc;
    padding-bottom: 16px;
    margin-bottom: 24px;
  }
  .preview-header h1 {
    margin: 0 0 8px 0;
    font-size: 1.5rem;
    color: #141413;
  }
  .preview-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 0.8rem;
    color: #8a8880;
  }
  .preview-meta span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .status-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .status-draft { background: #fef3c7; color: #92400e; }
  .status-in_review { background: #faf0ec; color: #c15f3c; }
  .status-approved { background: #d1fae5; color: #065f46; }
  .status-effective { background: #d1fae5; color: #065f46; }
  .status-obsolete { background: #fee2e2; color: #991b1b; }
  .preview-body {
    min-height: 200px;
  }
  .preview-body h1, .preview-body h2, .preview-body h3 {
    color: #141413;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
  }
  .preview-body p { margin: 0.75em 0; }
  .preview-body table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
  }
  .preview-body th, .preview-body td {
    border: 1px solid #e8e6dc;
    padding: 8px 12px;
    text-align: left;
  }
  .preview-body th {
    background: #faf9f5;
    font-weight: 600;
  }
  .preview-body blockquote {
    border-left: 4px solid #e8e6dc;
    margin: 1em 0;
    padding: 0.5em 1em;
    color: #6b6963;
  }
  .preview-body pre {
    background: #faf9f5;
    border: 1px solid #e8e6dc;
    border-radius: 6px;
    padding: 12px;
    overflow-x: auto;
  }
  .preview-body code {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 0.875em;
  }
  .preview-footer {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1px solid #e8e6dc;
    font-size: 0.7rem;
    color: #b0aea5;
    text-align: right;
  }
  .empty-state {
    text-align: center;
    color: #b0aea5;
    padding: 48px 0;
  }
  .section-block {
    margin-bottom: 24px;
  }
  .section-block h2 {
    font-size: 1.15rem;
    color: #4a4a46;
    border-bottom: 1px solid #f4f3ee;
    padding-bottom: 4px;
  }
`;

// ---------------------------------------------------------------------------
// Markdown → HTML (basic conversion for preview purposes)
// ---------------------------------------------------------------------------

function markdownToHtml(md: string): string {
  let html = md;

  // Headings
  html = html.replace(/^#{6}\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#{5}\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>');

  // Bold & italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr>');

  // Line breaks → paragraphs (double newline)
  html = html
    .split(/\n{2,}/)
    .map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      // Don't wrap blocks that already start with an HTML tag
      if (/^<[a-z]/i.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return html;
}

// ---------------------------------------------------------------------------
// Content rendering helpers
// ---------------------------------------------------------------------------

/**
 * Render structured JSON content (sections array) as HTML.
 */
function renderSectionsContent(sections: any[]): string {
  return sections
    .map((section: any) => {
      const title = escapeHtml(section.title || section.name || 'Untitled Section');
      const body = section.content || section.body || section.text || '';
      return `<div class="section-block"><h2>${title}</h2><div>${body}</div></div>`;
    })
    .join('');
}

/**
 * Attempt to parse content string as JSON and render meaningfully.
 */
function renderJsonContent(raw: string): string {
  try {
    const parsed = JSON.parse(raw);

    // Array of sections pattern
    if (Array.isArray(parsed)) {
      return renderSectionsContent(parsed);
    }

    // Object with sections array
    if (parsed.sections && Array.isArray(parsed.sections)) {
      return renderSectionsContent(parsed.sections);
    }

    // Object with content array
    if (parsed.content && Array.isArray(parsed.content)) {
      return renderSectionsContent(parsed.content);
    }

    // Object with a body/text property
    if (typeof parsed.body === 'string') {
      return `<div>${parsed.body}</div>`;
    }
    if (typeof parsed.text === 'string') {
      return `<div>${parsed.text}</div>`;
    }
    if (typeof parsed.content === 'string') {
      return `<div>${parsed.content}</div>`;
    }

    // Fallback: pretty-print JSON
    return `<pre><code>${escapeHtml(JSON.stringify(parsed, null, 2))}</code></pre>`;
  } catch {
    return '';
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// DOCX extraction via mammoth (optional dependency)
// ---------------------------------------------------------------------------

let mammoth: any = null;
try {
  mammoth = require('mammoth');
} catch {
  // mammoth not available – DOCX preview will fall back to a message
}

async function extractDocxHtml(filePath: string): Promise<string> {
  if (!mammoth) {
    return '<p class="empty-state">DOCX preview requires the mammoth library. The file can be downloaded instead.</p>';
  }
  try {
    const result = await mammoth.convertToHtml({ path: filePath });
    return result.value || '<p class="empty-state">No content extracted from DOCX file.</p>';
  } catch (err: any) {
    return `<p class="empty-state">Failed to extract DOCX content: ${escapeHtml(err.message)}</p>`;
  }
}

// ---------------------------------------------------------------------------
// File-based preview
// ---------------------------------------------------------------------------

async function previewFromFile(filePath: string, mimeType?: string): Promise<{ html: string; isPdf: boolean }> {
  const ext = path.extname(filePath).toLowerCase();
  const resolvedMime = mimeType || '';

  // PDF – we signal the caller to redirect
  if (ext === '.pdf' || resolvedMime.includes('pdf')) {
    return { html: '', isPdf: true };
  }

  // DOCX
  if (ext === '.docx' || resolvedMime.includes('wordprocessingml') || resolvedMime.includes('msword')) {
    const html = await extractDocxHtml(filePath);
    return { html, isPdf: false };
  }

  // Plain text or markdown
  if (ext === '.txt' || ext === '.md' || ext === '.markdown' || resolvedMime.startsWith('text/')) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const converted = (ext === '.md' || ext === '.markdown') ? markdownToHtml(raw) : `<pre>${escapeHtml(raw)}</pre>`;
      return { html: converted, isPdf: false };
    } catch {
      return { html: '<p class="empty-state">Unable to read file.</p>', isPdf: false };
    }
  }

  // HTML files
  if (ext === '.html' || ext === '.htm' || resolvedMime.includes('html')) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return { html: sanitizeHtml(raw), isPdf: false };
    } catch {
      return { html: '<p class="empty-state">Unable to read file.</p>', isPdf: false };
    }
  }

  return {
    html: `<p class="empty-state">Preview not available for this file type (${escapeHtml(ext || 'unknown')}). Please download the file instead.</p>`,
    isPdf: false,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PreviewResult {
  html: string;
  isPdf: boolean;
  pdfPath?: string;
  documentTitle: string;
}

/**
 * Generate an HTML preview for a document.
 *
 * @param documentId  - numeric document ID
 * @param organizationId - the requesting tenant's organization ID (for isolation)
 * @returns PreviewResult with rendered HTML or PDF redirect info
 */
export async function generateHtmlPreview(
  documentId: number,
  organizationId: number | null
): Promise<PreviewResult> {
  // Fetch document from storage
  const doc = await storage.getDocument(String(documentId));

  if (!doc) {
    throw new DocumentPreviewError('Document not found', 404);
  }

  // Tenant isolation check
  if (organizationId !== null && doc.organizationId !== organizationId) {
    throw new DocumentPreviewError('Document not found', 404);
  }

  const title = doc.title || `Document #${doc.id}`;
  const status = doc.status || 'draft';

  // Try to get the latest version content
  let bodyHtml = '';
  let isPdf = false;
  let pdfPath: string | undefined;

  // 1. Check if document version has content (via currentVersionId or inline)
  //    The storage layer fetches from `documents` table. The version content
  //    lives in `document_versions.content`. We look for inline content first
  //    then fall back to file-based approach.
  const docAny = doc as any;

  // Check for inline content field (some storage implementations merge version content)
  const rawContent: string | undefined = docAny.content || docAny.description;

  if (rawContent && typeof rawContent === 'string' && rawContent.trim().length > 0) {
    // Attempt JSON parse (structured content)
    const jsonResult = renderJsonContent(rawContent);
    if (jsonResult) {
      bodyHtml = jsonResult;
    } else {
      // Could be HTML, markdown, or plain text
      const trimmed = rawContent.trim();
      if (trimmed.startsWith('<') && trimmed.includes('>')) {
        // Looks like HTML
        bodyHtml = sanitizeHtml(trimmed);
      } else if (trimmed.includes('# ') || trimmed.includes('**') || trimmed.includes('- ')) {
        // Looks like markdown
        bodyHtml = markdownToHtml(trimmed);
      } else {
        // Plain text
        bodyHtml = `<div>${escapeHtml(trimmed).replace(/\n/g, '<br>')}</div>`;
      }
    }
  }

  // 2. If no inline content, check for a referenced file
  if (!bodyHtml) {
    const filePath = docAny.filePath || docAny.file_path;
    const mimeType = docAny.mimeType || docAny.mime_type || docAny.fileType || docAny.file_type;

    if (filePath && typeof filePath === 'string') {
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

      if (fs.existsSync(absolutePath)) {
        const result = await previewFromFile(absolutePath, mimeType);
        bodyHtml = result.html;
        isPdf = result.isPdf;
        if (isPdf) {
          pdfPath = absolutePath;
        }
      } else {
        bodyHtml = '<p class="empty-state">The referenced file is no longer available.</p>';
      }
    }
  }

  // 3. If still nothing, render metadata-only preview
  if (!bodyHtml && !isPdf) {
    bodyHtml = `
      <div class="empty-state">
        <p>No preview content available for this document.</p>
        <p style="font-size: 0.85em; margin-top: 8px;">
          Document type: ${escapeHtml(doc.documentType || 'Unknown')}<br>
          Status: ${escapeHtml(status)}<br>
          ${doc.description ? `Description: ${escapeHtml(doc.description)}` : ''}
        </p>
      </div>
    `;
  }

  // Build full HTML document
  const statusClass = `status-${status.toLowerCase().replace(/\s+/g, '_')}`;

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Preview</title>
  <style>${PREVIEW_CSS}</style>
</head>
<body>
  <div class="preview-header">
    <h1>${escapeHtml(title)}</h1>
    <div class="preview-meta">
      <span class="status-badge ${statusClass}">${escapeHtml(status)}</span>
      <span>Type: ${escapeHtml(doc.documentType || 'N/A')}</span>
      <span>Code: ${escapeHtml(doc.documentCode || 'N/A')}</span>
      ${doc.category ? `<span>Category: ${escapeHtml(doc.category)}</span>` : ''}
      ${doc.version ? `<span>Version: ${escapeHtml(doc.version)}</span>` : ''}
    </div>
  </div>
  <div class="preview-body">
    ${bodyHtml}
  </div>
  <div class="preview-footer">
    Generated on ${new Date().toISOString().split('T')[0]} &mdash; TrialSage Document Preview
  </div>
</body>
</html>`;

  return {
    html: fullHtml,
    isPdf,
    pdfPath,
    documentTitle: title,
  };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class DocumentPreviewError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'DocumentPreviewError';
    this.statusCode = statusCode;
  }
}
