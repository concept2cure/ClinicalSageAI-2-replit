/**
 * AnaMarkdown — AnA's answer, rendered as prose. The ONE markdown → React
 * renderer for the v2 shell.
 *
 * It lived inside DocumentAuthoring.tsx (the editor's AnA pane) and nowhere
 * else, so ConversationThread rendered `m.text` as plain text under
 * `white-space: pre-wrap` — the thread, the product's front door, showed
 * `## Drug Substance`, `**must**` and `| Attribute | Limit |` to the reader as
 * the model's own source. Moved here (2026-09-21, the document-canvas change)
 * so the thread and the workbench render an answer the same way, from the
 * same allowlists, and a second renderer never has to be written.
 *
 * TWO STAGES, on purpose.
 *
 * Stage 1 is `renderSafeMarkdown` — the codebase's ONE audited markdown path
 * (marked → DOMPurify tag/attribute allowlist, covered by its own tests). It is
 * reused rather than reimplemented: this repo already deleted three hand-rolled
 * `mdToHtml` regexes feeding three injection sinks, and adding a fourth markdown
 * parser here would reintroduce exactly that (CLAUDE.md: zero duplication).
 *
 * Stage 2 walks the sanitized fragment into REACT ELEMENTS. No
 * `dangerouslySetInnerHTML` anywhere on this path, so a model-authored string
 * never becomes markup React did not construct — and the render map below is a
 * second, independent allowlist: a tag DOMPurify let through that this map does
 * not name is dropped to its text. Two allowlists have to fail together before
 * anything reaches the DOM, and only `href` survives as an attribute, http(s)
 * and mailto only.
 *
 * Deliberately NOT applied to the person's own turn. Those are their words as
 * typed, not a document, and formatting them would rewrite what they said back
 * at them.
 */
import React, { useMemo } from 'react';
import { renderSafeMarkdown } from '../components/ana/renderSafeMarkdown';

const MD_TAGS: Record<string, keyof React.JSX.IntrinsicElements> = {
  P: 'p',
  BR: 'br',
  STRONG: 'strong',
  B: 'strong',
  EM: 'em',
  I: 'em',
  U: 'u',
  CODE: 'code',
  PRE: 'pre',
  UL: 'ul',
  OL: 'ol',
  LI: 'li',
  H1: 'h3',
  H2: 'h4',
  // AnA's "# heading" is a heading INSIDE a rail or a turn whose own header is
  // the page's h-level; demoting keeps the page outline honest for a screen
  // reader instead of scattering h1s through a log.
  H3: 'h5',
  H4: 'h5',
  H5: 'h6',
  H6: 'h6',
  BLOCKQUOTE: 'blockquote',
  HR: 'hr',
  TABLE: 'table',
  THEAD: 'thead',
  TBODY: 'tbody',
  TR: 'tr',
  TH: 'th',
  TD: 'td',
  A: 'a',
  SUP: 'sup',
  SUB: 'sub',
  SPAN: 'span',
  DIV: 'div',
};
/** Elements that must not be given children (React throws otherwise). */
const MD_VOID = new Set(['br', 'hr']);

/** Only a link that goes somewhere a link may go. */
function safeHref(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const v = raw.trim();
  return /^(https?:|mailto:)/i.test(v) ? v : undefined;
}

function mdChildren(parent: Node, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  parent.childNodes.forEach((node, i) => {
    const key = `${keyPrefix}.${i}`;
    if (node.nodeType === 3) {
      if (node.nodeValue) out.push(node.nodeValue);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = MD_TAGS[el.tagName];
    if (!tag) {
      // Not in the render allowlist: keep the words, drop the element.
      const text = el.textContent;
      if (text) out.push(<React.Fragment key={key}>{text}</React.Fragment>);
      return;
    }
    if (MD_VOID.has(tag)) {
      out.push(React.createElement(tag, { key }));
      return;
    }
    const props: Record<string, unknown> = { key };
    if (tag === 'a') {
      const href = safeHref(el.getAttribute('href'));
      if (!href) {
        // A link with nowhere legitimate to go is text, not a link.
        out.push(<React.Fragment key={key}>{el.textContent}</React.Fragment>);
        return;
      }
      props.href = href;
      props.target = '_blank';
      props.rel = 'noopener noreferrer';
    }
    out.push(React.createElement(tag, props, ...mdChildren(el, key)));
  });
  return out;
}

/**
 * Markdown → React nodes. Returns plain text if anything in the chain fails —
 * the reader sees the answer either way, never a blank where prose was.
 *
 * `className` is the host's: the editor pane wraps it as a comment body
 * (`cmt-body ana-md`), the thread as its answer block (`ct-ana-text ana-md`).
 * `.ana-md` carries the prose rhythm in authoring-v2.css and is shared.
 */
export function AnaMarkdown({
  text,
  className = 'cmt-body ana-md',
}: {
  text: string;
  className?: string;
}): React.ReactElement {
  const nodes = useMemo(() => {
    if (!text) return null;
    try {
      const html = renderSafeMarkdown(text);
      if (!html) return null;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return mdChildren(doc.body, 'md');
    } catch {
      return null;
    }
  }, [text]);
  return (
    <div className={className}>
      {nodes ?? <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>}
    </div>
  );
}
