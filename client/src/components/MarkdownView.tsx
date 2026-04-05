import * as React from 'react';
import { useEffect, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Sanitizes HTML content to prevent XSS attacks.
 * Uses DOMPurify with a strict whitelist of allowed tags and attributes.
 */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'ul', 'ol', 'li', 
      'strong', 'em', 'code', 'pre', 'blockquote', 'a', 'img', 'table', 'thead', 
      'tbody', 'tr', 'th', 'td', 'hr', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
  });
}

export default function MarkdownView({ src }: { src: string }) {
  const [html, setHtml] = useState<string>('Loading…');
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(src);
        if (!r.ok) throw new Error(`${src} -> ${r.status}`);
        const md = await r.text();
        if (!alive) return;
        // Parse markdown and sanitize the resulting HTML
        const rawHtml = marked.parse(md) as string;
        setHtml(sanitizeHtml(rawHtml));
      } catch (e: any) {
        // Even error messages are sanitized for safety
        const safeError = DOMPurify.sanitize(e?.message || String(e));
        setHtml(`<div style="color:#44403c">Failed to load: ${DOMPurify.sanitize(src)}<br/>${safeError}</div>`);
      }
    })();
    return () => {
      alive = false;
    };
  }, [src]);
  return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
}
