/**
 * @fileoverview SafeHtml — sanitized alternative to dangerouslySetInnerHTML
 *
 * Usage:
 *   <SafeHtml html={untrustedContent} />
 *   <SafeHtml html={aiGeneratedHtml} className="prose" />
 *
 * Sanitizes via DOMPurify before rendering. Prevents XSS from
 * user input, AI-generated content, and external data sources.
 */

import React from 'react';
import DOMPurify from 'dompurify';

interface SafeHtmlProps {
  html: string;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
  allowedTags?: string[];
}

// Default allowed tags for regulatory document content
const DEFAULT_ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'pre', 'code',
  'a', 'img', 'hr', 'span', 'div', 'sub', 'sup',
  'dl', 'dt', 'dd', 'figure', 'figcaption',
];

const DEFAULT_ALLOWED_ATTR = [
  'href', 'target', 'rel', 'src', 'alt', 'title',
  'class', 'id', 'style',
  'colspan', 'rowspan', 'width', 'height',
];

export const SafeHtml: React.FC<SafeHtmlProps> = ({
  html,
  className,
  as: Tag = 'div',
  allowedTags,
}) => {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: allowedTags || DEFAULT_ALLOWED_TAGS,
    ALLOWED_ATTR: DEFAULT_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
  });

  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
};

/**
 * Sanitize HTML string without rendering — for use in non-React contexts.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: DEFAULT_ALLOWED_TAGS,
    ALLOWED_ATTR: DEFAULT_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

export default SafeHtml;
