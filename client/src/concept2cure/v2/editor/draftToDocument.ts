/**
 * An AnA draft that is not yet a document becomes one, in the editor's store
 * (2026-10-01, D2 canvas → editor, step 4).
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 * Only `draft_authoring_document` writes the authoring store. Every other tool
 * that drafts a document — the briefing book, the plans, the statistical
 * documents, the rest of the `status: 'generated'` family — still produces a
 * markdown draft. That draft appears as a side-panel card, and the card's Edit
 * went to the authoring workspace with no document
 * (docs/design/ANA_DOCUMENT_CANVAS.md names that as the defect). So most
 * document types AnA drafts could never reach the canvas or the editor.
 *
 * ── How ─────────────────────────────────────────────────────────────────────
 * Through the one door that turns a draft into an authoring document,
 * `POST /api/authoring/docs/from-draft`. No second store and no second
 * converter on the server. The draft is split into sections at its own
 * headings. The server sanitizes every section on the way in, as it does for
 * the tool.
 *
 * ── Once per turn ───────────────────────────────────────────────────────────
 * The conversion is recorded as provenance: source `ana`, the conversation,
 * and the turn that drafted it. Before creating, the project's documents with
 * the same title are read, and one whose provenance names the same
 * conversation and turn is opened instead. So opening the same draft again,
 * after a reload, gives the same document, not a second copy. If that check
 * cannot run, nothing is created: a duplicate in a controlled store is worse
 * than asking again.
 */

import { apiCall, apiErrorText } from '../apiCall';
import { renderSafeMarkdown } from '../../components/ana/renderSafeMarkdown';

export interface DraftSection {
  code: string;
  title: string;
  content: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A project id the authoring store files documents under (a program UUID). */
export function isProgramId(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

/** "2.5.1 Rationale", "3. Methods", "A) Background": the code and the rest. */
const SECTION_CODE = /^((?:\d+\.)*\d+|[A-Z])[.):]?\s+(\S.*)$/;
const SPLIT_TAGS = ['H1', 'H2', 'H3'] as const;

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Markdown as HTML; a draft that is already HTML passes through (the server sanitizes it). */
function draftHtml(content: string): string {
  return /^\s*<(p|h[1-6]|div|section|table|ul|ol)\b/i.test(content) ? content : renderSafeMarkdown(content);
}

function nodeHtml(n: Node): string {
  if (n.nodeType === 1) return (n as Element).outerHTML;
  const text = (n.textContent ?? '').trim();
  return text ? `<p>${escapeText(text)}</p>` : '';
}

/** Drop the document's own title heading: it is the document's title, not a section. */
function withoutTitleHeading(nodes: Node[]): Node[] {
  const first = nodes.find(n => n.nodeType === 1 || (n.textContent ?? '').trim());
  const h1s = nodes.filter(n => n.nodeName === 'H1').length;
  return first?.nodeName === 'H1' && h1s === 1 ? nodes.filter(n => n !== first) : nodes;
}

interface Group {
  heading: string | null;
  html: string;
}

function groupAt(nodes: Node[], tag: string): Group[] {
  const groups: Group[] = [];
  let cur: Group = { heading: null, html: '' };
  for (const n of nodes) {
    if (n.nodeName === tag) {
      if (cur.heading !== null || cur.html.trim()) groups.push(cur);
      cur = { heading: (n.textContent ?? '').trim(), html: '' };
    } else {
      cur.html += nodeHtml(n);
    }
  }
  if (cur.heading !== null || cur.html.trim()) groups.push(cur);
  return groups;
}

/**
 * The sections of a draft, split at its top heading level. A heading that
 * carries its own number ("2.5.1 Rationale") keeps it as the section code when
 * every heading has a distinct one. Otherwise sections are numbered in order
 * and the heading is the title. Text before the first heading is a section of
 * its own, under the document's title. A draft with no headings is one section.
 */
export function draftSections(title: string, content: string): DraftSection[] {
  const doc = new DOMParser().parseFromString(`<body>${draftHtml(content)}</body>`, 'text/html');
  const nodes = withoutTitleHeading(Array.from(doc.body.childNodes));
  const tag = SPLIT_TAGS.find(t => nodes.some(n => n.nodeName === t));
  if (!tag) return [{ code: '1', title, content: nodes.map(nodeHtml).join('') }];

  const groups = groupAt(nodes, tag);
  const parsed = groups.map(g => (g.heading ? SECTION_CODE.exec(g.heading) : null));
  const ownCodes = groups.map((g, i) => (g.heading === null ? '0' : parsed[i]?.[1] ?? null));
  const coded = ownCodes.every(c => c !== null) && new Set(ownCodes).size === ownCodes.length;
  return groups.map((g, i) => {
    const own = parsed[i];
    if (coded && own) return { code: own[1], title: own[2].trim(), content: g.html };
    return { code: coded ? '0' : String(i + 1), title: g.heading || title, content: g.html };
  });
}

/** The draft to convert, as the conversation holds it. */
export interface DraftToOpen {
  title: string;
  content: string;
  documentType?: string | null;
}

/** Where it came from: the conversation and the turn that drafted it. */
export interface DraftOrigin {
  programId: string;
  conversationId: string | null;
  turnId: string | null;
}

export type OpenDraftOutcome =
  | { ok: true; docId: string; programId: string; reused: boolean }
  | { ok: false; message: string };

interface ListedDoc {
  id?: unknown;
  title?: unknown;
}
interface Provenance {
  source?: unknown;
  conversationId?: unknown;
  turnId?: unknown;
}

/** A document already made from this turn's draft, or null; undefined when that cannot be checked. */
async function findOpened(draft: DraftToOpen, origin: DraftOrigin): Promise<string | null | undefined> {
  const { programId, conversationId, turnId } = origin;
  if (!conversationId || !turnId) return null;
  const list = await apiCall<{ documents?: ListedDoc[] }>('GET', `/api/authoring/docs?programId=${encodeURIComponent(programId)}`);
  if (!list.ok) return undefined;
  const same = (list.body?.documents ?? []).filter(d => d.title === draft.title && typeof d.id === 'string');
  for (const d of same.slice(0, 10)) {
    const r = await apiCall<{ document?: { provenance?: Provenance | null } }>('GET', `/api/authoring/docs/${encodeURIComponent(String(d.id))}`);
    if (!r.ok) return undefined;
    const p = r.body?.document?.provenance;
    if (p?.source === 'ana' && p.conversationId === conversationId && p.turnId === turnId) return String(d.id);
  }
  return null;
}

/**
 * Open an AnA draft as an authoring document in the project: the one already
 * made from this turn's draft, or a new one through `from-draft`.
 */
export async function openDraftAsDocument(draft: DraftToOpen, origin: DraftOrigin): Promise<OpenDraftOutcome> {
  const { programId, conversationId, turnId } = origin;
  const existing = await findOpened(draft, origin);
  if (existing === undefined) {
    return { ok: false, message: 'Couldn’t check whether this draft is already a document in the project, so nothing was created. Try again.' };
  }
  if (existing) return { ok: true, docId: existing, programId, reused: true };

  const r = await apiCall<{ data?: { doc?: { id?: unknown } } }>('POST', '/api/authoring/docs/from-draft', {
    programId,
    title: draft.title,
    ...(draft.documentType ? { documentType: draft.documentType } : {}),
    sections: draftSections(draft.title, draft.content),
    provenance: {
      source: 'ana',
      ...(conversationId ? { conversationId } : {}),
      ...(turnId ? { turnId } : {}),
      note: 'Opened as a document from AnA’s draft in the conversation',
    },
  });
  const id = r.body?.data?.doc?.id;
  if (!r.ok || typeof id !== 'string') {
    return { ok: false, message: apiErrorText(r, 'The document was not created.') };
  }
  return { ok: true, docId: id, programId, reused: false };
}
