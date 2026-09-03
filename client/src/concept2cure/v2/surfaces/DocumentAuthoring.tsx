/**
 * Document Authoring — the editable regulatory-document canvas.
 *
 * Registry id: `document-authoring` (full: true, ownsConversation: true)
 *
 * Full-bleed 3-pane editor: document tree (left), editable content canvas
 * (center), and a review rail (right) that flips between AnA, the section's
 * revision history, its comment thread and the sources it is drafted from.
 *
 * REAL WIRING (regulated GA product): this surface is driven end-to-end by the
 * governed authoring store at `/api/authoring` (server/routes/authoring.router.ts,
 * tables authoring_documents / authoring_sections / doc_revisions /
 * authoring_comments / authoring_citations):
 *
 *   • tree     — the project's governed filing outline from
 *                GET /api/c2c/documents/:id/outline (rule-pack sections merged
 *                with live status), bound to the authored sections that hold
 *                the text by code. GET /api/authoring/docs?status= lists the
 *                documents, and GET /api/authoring/docs/:docId/sections their
 *                sections.
 *   • canvas   — the selected section opens in the ONE canonical editor
 *                (`v2/editor/RichSectionEditor`, TipTap/ProseMirror), which
 *                replaced the plain <textarea> and the execCommand DocCanvas
 *                in the same change (zero duplication). Saves go through the
 *                SAME governed PATCH /api/authoring/sections/:sectionId; the
 *                server records a revision row for the new content on every
 *                content change, so every save is an auditable revision — no
 *                client-side fabrication of version ids. Rich editing is
 *                fail-closed per section: content whose text the editor's
 *                parse cannot faithfully retain is edited as raw source, never
 *                silently rewritten. Track changes binds the store's
 *                `track_changes` column to real attributed ins/del suggestions
 *                with accept/reject; comments can anchor to text ranges; the
 *                history rail renders a word-level diff between revisions.
 *   • history  — GET /api/authoring/sections/:sectionId/history lists the real
 *                revisions (author + timestamp from the server); Revert POSTs
 *                /revert {rev_id}, which itself snapshots current content first.
 *   • comments — GET /api/authoring/documents/:docId/comments reads the thread;
 *                Add comment POSTs /api/authoring/sections/:sectionId/comment.
 *
 * HONESTY: every pane renders live org-scoped data, an honest empty, or an
 * honest failed-load — never a fixture. Writes are awaited; a success toast
 * fires only after the server confirms, and on failure nothing local is
 * mutated. Author attribution shown in history/comments is the server's
 * (JWT-sourced created_by), never guessed. "Draft with AnA" streams from the
 * real assistant rather than injecting fabricated content.
 *
 * ── Where "Draft with AnA" used to go ────────────────────────────────────────
 * Nowhere. This surface is registered `ownsConversation: true` (was
 * `hideAna: true`), so the shell does not draw its AnA rail here — and the
 * editor cannot give that column back: `.ed` is `220px minmax(420px,1fr)` and
 * gains a third 300px track whenever a rail mode is open, a hard 940px minimum
 * that with the shell's 380px rail needs 1376px before the doc column reaches
 * its own floor. Yet three affordances — "Draft with AnA", DocCanvas's
 * §-drafting and cite-this-claim, and "Ask what changed" on a drifted source —
 * called the shell's `onAsk`. The question went into the rail this screen never
 * renders, `ask()` persisted `anaOpen: true`, and the answer appeared later on
 * whichever surface next drew a rail.
 *
 * The editor answers in place now. The right rail gains a fourth mode beside
 * history / comments / sources, backed by this surface's own named
 * conversation (`useAnaChat`, screen `document-authoring`) and grounded on the
 * open document and section via `authoringContext`. Every ask on this surface
 * opens that pane, so the request and its answer are visible beside the text
 * they are about — and a governed command comes back as the real §11.50
 * sign-off instead of disappearing.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { useAnaChat, type AnaChatMessage } from '../../components/ana/useAnaChat';
import { SignoffList } from '../SignoffList';
import type { PendingSignoff } from '../../components/ana/useGovernedAction';
import type { AuthoringContextPack } from '@shared/types/authoring-context';
import { apiRequest, serverMessage, ApiRequestError, redactInternals } from '@/lib/queryClient';
import { AuthoringFilingBar } from './AuthoringFilingBar';
import { AuthoringPlaceIntoFiling } from './AuthoringPlaceIntoFiling';
import { AuthoringCollab } from './AuthoringCollab';
import { AuthoringCreateExport } from './AuthoringCreateExport';
import { newDocumentAction } from '../newDocumentAction';
import { AuthoringRevisionDiff } from './AuthoringRevisionDiff';
import { AuthoringAiDraft, type AcceptedAttribution } from './AuthoringAiDraft';
import { AuthoringExports } from './AuthoringExports';
import { RichSectionEditor, type RichSectionEditorHandle } from '../editor/RichSectionEditor';
import type { SuggestionDecision } from '../editor/suggestions';
import type { CommentAnchorPayload } from '../editor/commentAnchor';
import { citedSourceIdsInHtml } from '../editor/citationNode';
import { captionedObjectsInHtml } from '../editor/captionNumbering';
import type { CaptionedObject } from '@shared/authoring/captions';
import type { CitationSource } from '@shared/authoring/citations';
import { useAuth } from '@/services/portal/authService';
import { getAuthToken } from '@/utils/authToken';
import { describeRulePackProvenance } from '@shared/rule-pack-provenance';

import { useFilingOutline, findSectionForNode, nodeHasDraft } from '../useFilingOutline';
import {
  EDITOR_TARGET_DOC_LABELS,
  clearEditorTarget,
  describeEditorTarget,
  matchEditorTargetSection,
  peekEditorTarget,
  type EditorTarget,
} from '../editorTarget';
import { consumeNavParams } from '../navParams';
import {
  advertisedScreenActions,
  notifySurfaceActionReady,
  useSurfaceActionHandlers,
} from '../surfaceActions';
import { isFeatureEnabled } from '@/flags/featureFlags';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';
import { AuthoringSignatures } from './AuthoringSignatures';
import { useDialog } from '../useDialog';
import { renderSafeMarkdown } from '../../components/ana/renderSafeMarkdown';
import { AuthoredHtml } from '../editor/AuthoredHtml';

/* ── Server row shapes (mirror server/routes/authoring.router.ts) ── */

interface AuthDoc {
  id: string;
  title: string;
  module: string | null;
  product_code: string | null;
  status: string;
  updated_at: string | null;
  section_count: number | string | null;
}

/**
 * Document-level structural findings (server: shared/regulatory/section-code).
 *
 * Neither is visible from any one section, which is why they travel with the
 * list rather than with a row: a code filed twice puts two 3.2.S in the
 * assembled dossier, and a stored order that disagrees with the codes means it
 * assembles in the wrong order.
 */
interface SectionStructure {
  duplicateCodes: string[];
  outOfOrder: boolean;
  suggestedOrder: string[];
}

interface AuthSection {
  id: string;
  doc_id: string;
  code: string;
  title: string;
  content: string | null;
  order_index: number | null;
  /** The store's own column — the editor binds real suggestions to it. */
  track_changes?: boolean | null;
  comment_count: number | string | null;
  revision_count: number | string | null;
  citation_count: number | string | null;
  updated_at: string | null;
}

interface AuthRevision {
  id: string;
  section_id: string;
  content: string | null;
  created_at: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  /** Ledger columns (null on revisions predating the ledger). */
  content_sha256?: string | null;
  chain_sha256?: string | null;
  origin?: string | null;
}

/** How each ledger origin reads to an author. */
const REVISION_ORIGIN_LABELS: Record<string, string> = {
  genesis: 'created',
  'human-edit': 'edited',
  'ai-draft-accept': 'AI draft accepted',
  revert: 'reverted',
  'template-apply': 'template applied',
  'pre-template-snapshot': 'pre-template snapshot',
};

/** The server's recomputed ledger verdict for a section's history. */
interface LedgerVerdict {
  intact: boolean;
  revisionCount: number;
  chainedCount: number;
  preLedgerCount: number;
  breaks: Array<{ revisionId: string; reason: string }>;
}

/** A row from GET /docs/:docId/audit — the Part 11 audit trail the server has
 *  written on every governed act since the store shipped, readable by no
 *  surface until this rail. Field names are the endpoint's aliases. */
interface AuthAuditEvent {
  id: string;
  section_id: string | null;
  event_type: string | null;
  actor: string | null;
  actor_role: string | null;
  change_reason: string | null;
  content_hash_before: string | null;
  content_hash_after: string | null;
  created_at: string | null;
  /** The endpoint has always returned this and no surface read it, so the
   *  richest part of several governed records — which model produced a draft,
   *  which redline a reviewer refused — was written and unreadable. */
  metadata: Record<string, unknown> | null;
}

/** How each recorded operation reads to a reviewer. Unknown operations are
 *  humanized from the raw value, never hidden. */
const AUDIT_EVENT_LABELS: Record<string, string> = {
  CREATE: 'created',
  EDIT: 'content saved',
  UPDATE: 'updated',
  COMMIT: 'committed to filing',
  REVERT: 'reverted to a prior revision',
  tracked_change_decision: 'tracked change decided',
  tracked_change_bulk_decision: 'tracked changes decided in bulk',
  REORDER_SECTIONS: 'sections reordered',
  RENAME: 'renamed',
  TRACK_CHANGES: 'track changes toggled',
  FREEZE: 'frozen',
  SIGN: 'signed',
  E_SIGN: 'e-signed',
  EXPORT: 'exported',
  EXPORT_HISTORY_DELETED: 'export record deleted',
  SUBMIT: 'submitted',
};

/**
 * The readable part of an audit row's `metadata`, or null when it carries
 * nothing a reviewer would act on.
 *
 * Two recorded shapes were being written and shown to nobody, and both answer
 * the first question an assessor asks:
 *
 *   tracked_change_decision — a reviewer accepted or REFUSED a redline. A
 *     rejection changes no text, so this row is the only place it exists.
 *   ai-draft-accept — which model and provider produced the text, and whether
 *     the author edited it before accepting (so "accepted AI draft" cannot
 *     vouch for words the model never wrote).
 *
 * Unrecognised metadata is left alone rather than dumped as JSON: a rail is a
 * reading surface, and raw payloads are not read.
 */
export function describeAuditMetadata(
  eventType: string | null,
  metadata: Record<string, unknown> | null,
): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const str = (k: string): string | null => {
    const v = (metadata as Record<string, unknown>)[k];
    return typeof v === 'string' && v.trim().length > 0 ? v : null;
  };

  if (eventType === 'tracked_change_decision') {
    const decision = str('decision');
    const kind = str('changeType');
    const text = str('text');
    const proposedBy = str('proposedBy');
    if (!decision) return null;
    const verb = decision === 'accept' ? 'accepted' : 'rejected';
    const what = kind === 'deletion' ? 'a proposed deletion' : kind === 'insertion' ? 'a proposed insertion' : 'a tracked change';
    /* The quoted text is what makes the row resolvable — accepting a
       suggestion strips its mark, so the document no longer holds it. */
    const quoted = text ? ` — “${text.length > 160 ? text.slice(0, 160) + '…' : text}”` : '';
    const by = proposedBy ? ` (proposed by ${proposedBy})` : '';
    return `${verb} ${what}${by}${quoted}`;
  }

  if (eventType === 'tracked_change_bulk_decision') {
    const decision = str('decision');
    const count = typeof metadata.count === 'number' ? metadata.count : null;
    if (!decision || count === null) return null;
    const verb = decision === 'accept' ? 'accepted' : 'rejected';
    const omitted =
      typeof metadata.changesOmittedFromSummary === 'number'
        ? metadata.changesOmittedFromSummary
        : 0;
    const changes = Array.isArray(metadata.changes) ? metadata.changes : [];
    const sample = changes
      .slice(0, 3)
      .map(c => (c && typeof (c as any).text === 'string' ? (c as any).text : null))
      .filter((t): t is string => !!t)
      .map(t => `“${t.length > 80 ? t.slice(0, 80) + '…' : t}”`);
    /* When the stored summary was capped, the row says so. A truncated record
       that reads as complete is worse than one that admits its limit. */
    return (
      `${verb} ${count} tracked change${count === 1 ? '' : 's'} in one action` +
      (sample.length > 0 ? ` — including ${sample.join(', ')}` : '') +
      (omitted > 0 ? ` (${omitted} more not summarised on this row)` : '')
    );
  }

  if (metadata.source === 'section-metadata') {
    /* A rename or a track-changes toggle. Renders what moved, from and to, so
       the row is resolvable without opening the section — the same standard the
       tracked-change rows above hold. */
    const changes = Array.isArray(metadata.changes) ? metadata.changes : [];
    const parts = changes
      .map((c) => {
        const ch = (c ?? {}) as Record<string, unknown>;
        const field = typeof ch.field === 'string' ? ch.field : null;
        const from = ch.from == null ? '—' : String(ch.from);
        const to = ch.to == null ? '—' : String(ch.to);
        if (field === 'title') return `title “${from}” → “${to}”`;
        if (field === 'code') return `code ${from} → ${to}`;
        if (field === 'track_changes') return `track changes turned ${ch.to ? 'on' : 'off'}`;
        return null;
      })
      .filter((p): p is string => !!p);
    return parts.length ? parts.join('; ') : null;
  }

  if (metadata.source === 'ai-draft-accept') {
    const gen = (metadata.generator ?? null) as Record<string, unknown> | null;
    const model = gen && typeof gen.model === 'string' ? gen.model : null;
    const provider = gen && typeof gen.provider === 'string' ? gen.provider : null;
    const who = [model, provider].filter(Boolean).join(' · ');
    const edited = metadata.draft_modified_on_accept === true;
    return (
      'accepted an AI draft' +
      (who ? ` generated by ${who}` : ' whose generating model was not recorded') +
      (edited ? ', edited before accepting — the saved text is not the model’s wording' : '')
    );
  }

  return null;
}

function auditEventLabel(raw: string | null): string {
  if (!raw) return 'recorded';
  return AUDIT_EVENT_LABELS[raw] ?? raw.replace(/_/g, ' ').toLowerCase();
}

/** POST /sections/:id/ai/deficiency-scan — a handful of mechanical checks over the
 *  SAVED section (length, module keywords, tables/figures, placeholders,
 *  structure). The handler itself refuses to call this a compliance
 *  determination (`signal_type: 'heuristic_quality'`); the panel keeps that
 *  framing rather than dressing regexes up as review. */
interface ScanDeficiency {
  type: string;
  severity: 'high' | 'medium' | 'low' | string;
  message: string;
  recommendation?: string | null;
  location?: string | null;
}
interface ScanResults {
  section_id: string;
  section_code?: string;
  quality_score?: number;
  status?: string;
  deficiencies: ScanDeficiency[];
  deficiency_count?: number;
  /** The denominator behind `quality_score`, and how many of those passed. The
   *  panel names the server's count rather than a literal, so the sentence
   *  cannot drift from the checks the handler actually runs. */
  checks_run?: number;
  checks_passed?: number;
  scanned_at?: string;
}

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

interface AuthComment {
  id: string;
  section_id: string | null;
  body: string;
  status: string | null;
  author_name: string | null;
  section_code: string | null;
  section_title: string | null;
  created_at: string | null;
  /** Range anchor recorded at creation (authoring_comments.anchor JSONB). */
  anchor?: unknown;
  /** Threaded replies — the server nests them under each top-level comment
   *  (GET /documents/:id/comments), oldest first. Absent on reply rows. */
  replies?: AuthComment[];
  /** Resolution record — the server has captured all three since the store
   *  shipped (PATCH /comments/:id), and a status chip alone is not a record:
   *  the rail shows WHO resolved a thread, when, and their stated reason. */
  resolved_by?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
}

/** Runtime guard over the JSONB the server returns verbatim. */
function asTextRangeAnchor(v: unknown): CommentAnchorPayload | null {
  if (!v || typeof v !== 'object') return null;
  const a = v as Record<string, unknown>;
  return a.kind === 'text-range' && typeof a.quote === 'string'
    ? (a as unknown as CommentAnchorPayload)
    : null;
}

/* ── AnA's answer, rendered as prose ──────────────────────────────────────
   The pane used to render `m.text` under `white-space: pre-wrap`, so on the
   one surface whose entire job is producing formatted regulatory prose, the
   assistant's prose was the only unformatted text on screen: `## Drug
   Substance`, `**must**` and `| Attribute | Limit |` reached the author as
   their own source.

   TWO STAGES, on purpose.

   Stage 1 is `renderSafeMarkdown` — the codebase's ONE audited markdown path
   (marked → DOMPurify tag/attribute allowlist, covered by its own tests). It is
   reused rather than reimplemented: this repo already deleted three hand-rolled
   `mdToHtml` regexes feeding three injection sinks, and adding a fourth markdown
   parser here would reintroduce exactly that (CLAUDE.md: zero duplication).

   Stage 2 walks the sanitized fragment into REACT ELEMENTS. No
   `dangerouslySetInnerHTML` anywhere on this path, so a model-authored string
   never becomes markup React did not construct — and the render map below is a
   second, independent allowlist: a tag DOMPurify let through that this map does
   not name is dropped to its text. Two allowlists have to fail together before
   anything reaches the DOM, and only `href` survives as an attribute, http(s)
   and mailto only.

   Deliberately NOT rendered as markdown: the author's own turn. Those are their
   words as typed, not a document, and formatting them would rewrite what they
   said back at them. */

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
  // AnA's "# heading" is a heading INSIDE a rail whose own header is the
  // document's h-level; demoting keeps the page outline honest for a screen
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

/** Markdown → React nodes. Returns plain text if anything in the chain fails —
 *  the author sees the answer either way, never a blank where prose was. */
function AnaMarkdown({ text }: { text: string }): React.ReactElement {
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
    <div className="cmt-body ana-md">
      {nodes ?? <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>}
    </div>
  );
}

/**
 * A recorded citation of a canonical source, as the server reports it
 * (server/services/clinical-regulatory-evidence/source-usage.service.ts).
 *
 * `state` is the citation's standing against the source's content TODAY:
 *   current      the checksum recorded at cite time still matches
 *   changed      the source's content moved after this section cited it
 *   unverified   no checksum was recorded — nothing to compare, nothing claimed
 *   unresolved   the source no longer resolves for this tenant
 * Never inferred here; it is computed server-side from stored checksums.
 */
interface SectionSource {
  citationId: string;
  citedAt: string | null;
  citationText: string | null;
  citedChecksum: string | null;
  state: 'current' | 'changed' | 'superseded' | 'unverified' | 'unresolved';
  source: {
    id: number;
    title: string | null;
    checksum: string | null;
    extractionStatus: string | null;
    mimeType: string | null;
  } | null;
}

/** A source in the project's Data Room, for the "add a source" picker. */
interface ProjectSource {
  id: number;
  title: string | null;
  extractionStatus: string | null;
}

/** How each citation state reads to an author. */
function sourceStateLabel(s: SectionSource): {
  text: string;
  tone: 'ok' | 'warn' | 'muted';
  hint: string;
} {
  switch (s.state) {
    case 'current':
      return {
        // Mirrors SourceTracer deliberately — see the note there. The old
        // wording asserted the document was unchanged, which nothing here can
        // establish: a revised document becomes a new source row rather than a
        // changed checksum.
        text: 'Matches the source record as stored',
        tone: 'ok',
        hint: 'The checksum recorded at cite time still matches this source record. That is a statement about the RECORD, not the document: a revised document is ingested as a NEW source, which this citation does not point at, so a revision upstream is not detected here.',
      };
    case 'superseded':
      return {
        text: 'Source has been replaced since cited',
        tone: 'warn',
        hint:
          'A newer version of this document was ingested after this section cited it. The ' +
          'checksum still matches, because a source keeps its bytes and its hash forever — ' +
          'the revision was recorded as a successor, and that is what says this citation ' +
          'points at a superseded version.',
      };
    case 'changed':
      return {
        text: 'Source changed since cited',
        tone: 'warn',
        hint: 'This section was drafted from earlier content. Nothing has been rewritten — re-read the source and decide whether it changes what this section says.',
      };
    case 'unresolved':
      return {
        text: 'Source no longer available',
        tone: 'warn',
        hint: 'The citation is recorded but the source does not resolve in this organization — it may have been deleted.',
      };
    default:
      return {
        text: 'Not checked against content',
        tone: 'muted',
        hint: 'No checksum was recorded for this citation, so no claim is made about whether the source has changed.',
      };
  }
}

/* ── Helpers ── */

/** GET via apiRequest without throwing — honest {ok,status,body}. */
async function readJson<T = any>(
  path: string
): Promise<{ ok: boolean; status: number; body: T | null }> {
  try {
    const res = await apiRequest('GET', path);
    const body = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

function num(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Coarse relative time from an ISO timestamp; '' when absent. */
function relTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days} d ago`;
  if (hrs > 0) return `${hrs} h ago`;
  if (mins > 0) return `${mins} min ago`;
  return 'just now';
}

/* BP-W0-7. This listed three states and the document lifecycle has five. Freeze
   writes FROZEN and there was no option that could select it, so a sealed
   document — the one a reviewer most needs to open — could not be listed at all.

   `all` is first and is the default. A status filter that silently hides records
   is worse than no filter on a surface whose job is to find a document, and the
   previous default of `draft` meant the editor opened onto a view that excluded
   everything already submitted. Selecting a state is now a deliberate narrowing
   rather than the starting position. */
const STATUSES = ['all', 'draft', 'in_review', 'approved', 'frozen'];

/* ════ Document Authoring surface ════ */

/** The REAL Part 11 sign-off prompts AnA returned for governed commands issued
 *  from the editor's pane, each resolving through GovernedActionSignoff
 *  (POST /api/ana-ri/governed-action) to the server's confirmation. */
function AuthoringSignoffs({ signoffs }: { signoffs: PendingSignoff[] }) {
  return (
    <SignoffList
      signoffs={signoffs}
      style={{ display: 'grid', gap: 8, marginTop: 8 }}
      doneClassName="cmt-body"
    />
  );
}

function AnaActivity({
  message,
  onSuggestedAction,
}: {
  message: AnaChatMessage;
  onSuggestedAction: (action: string) => void;
}) {
  const toolCalls = message.toolCalls ?? [];
  const evidence = message.evidence;
  const groundingSources = message.groundingSources ?? [];
  const warnings = message.warnings ?? [];
  const suggestedActions = message.suggestedActions ?? [];
  const hasMeta =
    message.detectedLens ||
    message.effortUsed ||
    message.fallback ||
    (!message.streaming && message.latencyMs != null) ||
    message.stopped;

  if (
    !hasMeta &&
    toolCalls.length === 0 &&
    !evidence &&
    groundingSources.length === 0 &&
    warnings.length === 0 &&
    suggestedActions.length === 0
  ) {
    return null;
  }

  return (
    <div className="ana-activity" aria-label="AnA activity and evidence">
      {hasMeta && (
        <div className="ana-meta" aria-label="AnA response details">
          {message.detectedLens && (
            <span className="ana-meta-chip">Lens: {message.detectedLens}</span>
          )}
          {message.effortUsed && (
            <span className="ana-meta-chip">Effort: {message.effortUsed}</span>
          )}
          {message.fallback && (
            <span className="ana-meta-chip ana-meta-chip-warn">Fallback provider</span>
          )}
          {!message.streaming && message.latencyMs != null && (
            <span className="ana-meta-chip">
              Response: {(message.latencyMs / 1000).toFixed(1)}s
            </span>
          )}
          {message.stopped && (
            <span className="ana-meta-chip ana-meta-chip-warn">Stopped before completion</span>
          )}
        </div>
      )}

      {toolCalls.length > 0 && (
        <details className="ana-activity-group" open={message.streaming || undefined}>
          <summary className="ana-activity-summary">
            <span>{I.workflow} Work log</span>
            <span className="ana-activity-count">
              {toolCalls.length} step{toolCalls.length === 1 ? '' : 's'}
            </span>
          </summary>
          <div className="ana-tool-list" role="list">
            {toolCalls.map((tool, toolIndex) => {
              const stateLabel =
                tool.status === 'running'
                  ? 'Running'
                  : tool.status === 'error'
                  ? 'Failed'
                  : 'Complete';
              return (
                <div
                  key={`${tool.name}-${toolIndex}`}
                  className="ana-tool"
                  data-status={tool.status}
                  role="listitem"
                >
                  <span className="ana-tool-state" aria-hidden="true">
                    {tool.status === 'error'
                      ? I.alertTriangle
                      : tool.status === 'running'
                      ? I.clock
                      : I.check}
                  </span>
                  <span className="ana-tool-label">{tool.label}</span>
                  <span className="ana-tool-status">{stateLabel}</span>
                  {tool.round != null && <span className="ana-tool-round">Round {tool.round}</span>}
                  {tool.result && (
                    <details className="ana-tool-result">
                      <summary>View result</summary>
                      <pre>{tool.result}</pre>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {evidence && (
        <div
          className="ana-evidence"
          data-validated={evidence.validated}
          role="status"
          aria-live="polite"
        >
          <div className="ana-evidence-head">
            <span>{evidence.validated ? I.shieldCheck : I.alertTriangle}</span>
            <strong>{evidence.validated ? 'Evidence grounded' : 'Evidence needs review'}</strong>
          </div>
          <div className="ana-evidence-summary">
            {evidence.sourceCount} source{evidence.sourceCount === 1 ? '' : 's'} ·{' '}
            {evidence.groundedClaims} grounded claim{evidence.groundedClaims === 1 ? '' : 's'} ·{' '}
            {evidence.weakClaims} weak
          </div>
          {evidence.riskSummary && <div className="ana-evidence-risk">{evidence.riskSummary}</div>}
          {evidence.flaggedClaims && evidence.flaggedClaims.length > 0 && (
            <details className="ana-flagged-claims">
              <summary>
                {evidence.flaggedClaims.length} flagged claim
                {evidence.flaggedClaims.length === 1 ? '' : 's'}
              </summary>
              <ul>
                {evidence.flaggedClaims.map((claim, claimIndex) => (
                  <li key={`${claim.kind}-${claimIndex}`}>
                    <strong>{claim.kind}</strong>: {claim.text}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {groundingSources.length > 0 && (
        <details className="ana-activity-group">
          <summary className="ana-activity-summary">
            <span>{I.link} Context used</span>
            <span className="ana-activity-count">{groundingSources.length}</span>
          </summary>
          <ul className="ana-context-list">
            {groundingSources.map(source => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </details>
      )}

      {warnings.map((warning, warningIndex) => (
        <div
          key={`${warning}-${warningIndex}`}
          className="ana-warning"
          role="status"
          aria-live="polite"
        >
          {I.alertTriangle}
          <span>{warning}</span>
        </div>
      ))}

      {suggestedActions.length > 0 && (
        <div className="ana-next-actions">
          <div className="ana-next-label">Next actions</div>
          <div className="ana-next-list">
            {suggestedActions.map(action => (
              <button
                key={action}
                type="button"
                className="ana-next-action"
                disabled={message.streaming}
                title={
                  message.streaming
                    ? 'Available after AnA finishes this response'
                    : `Ask AnA: ${action}`
                }
                onClick={() => onSuggestedAction(action)}
              >
                {I.arrowRight}
                <span>{action}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DocumentAuthoring({ onNav, liveDrive }: OwnedSurfaceViewProps) {
  // `module` is no longer a filter the user drives — the filing outline is. It
  // survives only as the value AuthoringCreateExport needs when creating a new
  // document, and it now follows the selected section instead of a dropdown
  // that defaulted every filing type to "M3".
  const [module, setModule] = useState('M3');
  // BP-W0-7: was 'draft', so the editor opened onto a list that excluded every
  // document already submitted, approved or frozen.
  const [status, setStatus] = useState('all');

  /* ── The project's governed filing outline ──
     The tree this canvas navigates by. A project's structure is fixed at
     creation: the wizard writes program_type + primary_agency, and
     scaffoldProjectDocuments() inserts the matching rule pack's whole section
     tree. A BLA is 71 nested sections, a 510(k) is A/B/C/D/E, a CER is A0–A8.
     Until now none of it reached here — the canvas showed a Module × status
     dropdown pair, defaulted to M3, identical for every filing type. */
  const projectIdForOutline = (() => {
    const p = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
    return p && typeof p.id === 'string' ? p.id : null;
  })();
  const filing = useFilingOutline(projectIdForOutline);

  // Documents for the current filter.
  const [docs, setDocs] = useState<AuthDoc[]>([]);
  const [docsState, setDocsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  // Sections of the active document.
  const [sections, setSections] = useState<AuthSection[]>([]);
  const [sectionsState, setSectionsState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle'
  );
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  // The canonical editor owns the in-flight buffer; the section row in
  // `sections` is the last-saved server truth (saves adopt the returned row).
  // `editorDirty` mirrors unsaved-changes state for the header Save button and
  // the leave-guard on filing actions.
  const [editorDirty, setEditorDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  /* ── REASON FOR CHANGE — stated once per section, carried on every save ──
   *
   * §11.10(d)/(e) wants to know WHY a governed record changed. Nothing on this
   * surface ever asked: only the AI-draft dialog sent `changeReason`, so every
   * ordinary save arrived without one and the filing's version ledger recorded
   * that it was not stated.
   *
   * Sticky rather than per-save, which is the shape this repo already settled
   * on for the same problem in ProtocolDev's schedule-of-assessments grid: the
   * governed router wants a reason on every write, and "prompting per tick
   * would be unusable — so the reason is stated ONCE for the editing session…
   * what the regulation does not ask for is the same sentence retyped forty
   * times." Save and ⌘S can each fire many times while working through one
   * section, and each one is a real write.
   *
   * It gates SAVE, not editing. The SoA grid can sit read-only until a reason
   * is given because it is one small governed table; this is the surface a
   * writer spends the day in, and locking the canvas would make the editor
   * hostile to the work it exists for. So: type freely, and state why before
   * the record moves.
   *
   * Cleared on section change, because it describes THAT section's edit. A
   * reason carried silently from one section to the next would attach one
   * author's stated intent to a different part of the filing — a fabrication
   * of exactly the kind the absent-reason handling was built to avoid.
   *
   * The ref exists because `saveSectionContent` is a useCallback that
   * `RichSectionEditor` holds across renders; reading state through it
   * directly would capture whatever the reason was when the callback was
   * built. */
  const [changeReason, setChangeReason] = useState('');
  const changeReasonRef = useRef('');
  useEffect(() => {
    changeReasonRef.current = changeReason;
  }, [changeReason]);
  /* A reason describes the edit to ONE section. Carrying it across a section
     change would attach one stated intent to a different part of the filing. */
  useEffect(() => {
    setChangeReason('');
  }, [activeSectionId]);
  /** Bumped when the server replaces content out from under the editor
   *  (revert) so the canvas remounts on the new truth. */
  const [contentEpoch, setContentEpoch] = useState(0);
  /* The RAG-grounded drafting panel. Open state only — the panel owns the
     draft, because a draft that outlives its own panel is a draft whose
     section scope nobody is enforcing. */
  const [aiDraftOpen, setAiDraftOpen] = useState(false);
  const editorRef = useRef<RichSectionEditorHandle | null>(null);
  /** The signed-in author, for suggestion attribution and comment anchors. */
  const { user } = useAuth();

  /* ── A comment being anchored to a text range ──
     The editor's Comment button hands over the selection's anchor and waits;
     the comments rail collects the body and posts, and the server-issued
     comment id resolves the wait so the editor can apply the highlight mark.
     One pending request at a time; superseding or leaving resolves null. */
  const pendingAnchorRef = useRef<{
    anchor: CommentAnchorPayload;
    resolve: (id: string | null) => void;
  } | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<CommentAnchorPayload | null>(null);
  /** The comment whose anchored range was last clicked in the canvas. */
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);

  /* Section view edits ONE section in a box. Document view assembles every
     section into one continuous read, which is the thing an author is actually
     building and the thing a reviewer receives. Editing stays section-scoped —
     clicking a section in the document takes you to it. */
  const [viewMode, setViewMode] = useState<'section' | 'document'>('section');

  // Right rail: AnA, revision history, comments, or the section's sources.
  const [rail, setRail] = useState<
    'ana' | 'history' | 'comments' | 'sources' | 'signatures' | 'audit' | 'exports' | null
  >('ana');
  /* Bumped after a save or an export so the Exports rail re-reads. A save
     changes the live content hash, which is exactly what its verdict compares
     against — a rail left stale would keep saying "matches the last export"
     about text that no longer matches it. */
  const [exportsEpoch, setExportsEpoch] = useState(0);
  /** The open section, readable from the tracked-change callback. That callback
   *  is configured once per editor mount, so closing over the state value would
   *  attribute a decision to whichever section was open when the canvas
   *  mounted. */
  const activeSectionIdRef = useRef<string | null>(null);
  /** Decisions awaiting their coalesced flush, and whether one is scheduled. */
  const pendingDecisionsRef = useRef<SuggestionDecision[]>([]);
  const decisionFlushRef = useRef(false);
  useEffect(() => {
    activeSectionIdRef.current = activeSectionId ?? null;
  });
  const [revisions, setRevisions] = useState<AuthRevision[]>([]);
  // 'error' is a distinct state on purpose: an empty list because the read
  // failed and an empty list because there are no revisions are the same value
  // and opposite facts.
  /* 'loading' was missing: the rail rendered "No prior revisions" for the whole
     of every GET, and kept the PREVIOUS section's revisions — with a live Revert
     button — under the next section's header until its response landed. */
  const [revisionsState, setRevisionsState] = useState<'loading' | 'ready' | 'error'>('ready');
  const historySectionRef = useRef<string | null>(null);
  const [comments, setComments] = useState<AuthComment[]>([]);
  const [commentsState, setCommentsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [newComment, setNewComment] = useState('');
  /* The document's Part 11 audit trail. 'error' is distinct from empty on
     purpose: a failed read of the compliance record must never render as "no
     governed acts have occurred". */
  const [auditEvents, setAuditEvents] = useState<AuthAuditEvent[]>([]);
  const [auditState, setAuditState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  /* The revision ledger's recomputed verdict — null until asked, 'error' on a
     failed read (which is a failure to CHECK, never a claim about the chain). */
  const [ledger, setLedger] = useState<LedgerVerdict | 'error' | 'checking' | null>(null);

  // What the active section is drafted from, plus the project's Data Room for the
  // picker. Both are live reads; neither has a fixture fallback.
  const [sources, setSources] = useState<SectionSource[]>([]);
  const [sourcesState, setSourcesState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [projectSources, setProjectSources] = useState<ProjectSource[]>([]);
  /** Citations the last document-wide re-read could NOT refresh, with the
   *  server's reason. Held rather than toasted away: "3 could not be re-read"
   *  is the finding, and a message that fades in four seconds is not where a
   *  finding belongs. */
  const [skippedRefreshes, setSkippedRefreshes] = useState<
    Array<{ cite_id: string; reason: string }>
  >([]);
  const [picking, setPicking] = useState(false);

  const [toast, fireToast] = useToast();

  /* ── Editor deep-link target (window.C2C_EDITOR_TARGET) ──
     Set by a workbench click ("Open §11 in editor", a CER Generator row) via
     v2/editorTarget.ts, the same set-navigate-consume idiom as C2C_CONVO.
     Peeked in the initializer (pure — safe under StrictMode double-render),
     CLEARED on mount: the channel is one-shot, so a target that isn't honoured
     now can never ambush a later, unrelated visit to the editor. */
  const [editorTarget] = useState<EditorTarget | null>(() => peekEditorTarget());
  /* ── Navigation-directive target (window.C2C_NAV_PARAMS) ──
     AnA's navigate_to (Live Drive or a chip click) can name a sectionCode
     ('section-workspace' / 'authoring' registry targets, e.g. "3.2.P.8").
     Consumed once on mount; resolved through the SAME bounded search and
     honest-miss notices as an editor-target hand-off — one resolution flow,
     two senders. Carries no docType/program claim, so those guards below
     simply don't apply to it. */
  const [navHandOff] = useState<{ sectionCode: string | null; docQuery: string | null }>(() => {
    const p = consumeNavParams('document-authoring');
    const code = p?.sectionCode?.trim();
    const doc = p?.authoringDocType?.trim();
    return {
      sectionCode: code && code.length > 0 ? code : null,
      docQuery: doc && doc.length > 0 ? doc : null,
    };
  });
  const navSectionCode = navHandOff.sectionCode;
  /** Unified open-on-mount target: a workbench editor-target wins (it carries
   *  the stronger claim); otherwise the navigation directive's section. */
  const sectionOpenTarget = useMemo(
    () =>
      editorTarget ??
      (navSectionCode
        ? {
            docType: null,
            docId: null,
            sectionCode: navSectionCode,
            sectionLabel: null,
            programId: null,
            programTitle: null,
          }
        : null),
    [editorTarget, navSectionCode],
  );
  /** The honest miss: why the deep-link did not open what it named. Rendered
   *  as a dismissible notice over the DEFAULT view — never a silent
   *  wrong-document open. */
  const [targetNotice, setTargetNotice] = useState<string | null>(null);
  /** The section the deep-link resolved, consumed by loadSections so the
   *  refetch that follows a document switch selects the target section
   *  instead of the document's first. Doc-scoped: a stale in-flight load of a
   *  DIFFERENT document must neither consume it nor act on it. */
  const targetSectionRef = useRef<{ docId: string; sectionId: string } | null>(null);
  useEffect(() => {
    clearEditorTarget();
  }, []);

  const activeDoc = docs.find(d => d.id === activeDocId) ?? null;
  const activeSection = sections.find(s => s.id === activeSectionId) ?? null;
  const docSealed =
    activeDoc != null && ['FROZEN', 'APPROVED'].includes(String(activeDoc.status).toUpperCase());
  const dirty = activeSection != null && editorDirty && !docSealed;
  const docScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const pane = docScrollRef.current;
    if (pane) pane.scrollTop = 0;
  }, [activeSectionId, activeDocId, contentEpoch]);

  /* ── Navigating away from unsaved work ────────────────────────────────────
     Clicking another section used to call setActiveSectionId directly. The
     canvas is keyed on the section id, so that unmounted it — and with it the
     only copy of everything typed since the last save. Nothing asked, nothing
     said; the work was simply not there on return unless the author happened
     to notice the device-cache restore offer.

     It is NOT fixed by saving on the way out. This surface's save is
     PATCH /api/authoring/sections/:id, which mints a doc_revisions row, writes
     a Part 11 audit record and commits the text into the filing. A save the
     author did not ask for is an attributable act they did not perform — the
     same defect as losing the text, pointed the other way. So the navigation is
     HELD and the author decides: save (deliberate, attributable), leave it on
     this device, or stay. */
  type LeaveTarget =
    | { kind: 'section'; id: string; module?: string }
    | { kind: 'document'; id: string; module?: string };
  const [pendingLeave, setPendingLeave] = useState<LeaveTarget | null>(null);
  const [leaving, setLeaving] = useState(false);

  const applyNav = useCallback((target: LeaveTarget) => {
    // The editor's dirty flag belongs to the mount that is going away; clear
    // it first so the guard cannot re-fire against the section just left.
    setEditorDirty(false);
    // The create/export module follows where the author actually IS, so it
    // moves with the navigation and not with the click that proposed one.
    if (target.module) setModule(target.module);
    if (target.kind === 'section') setActiveSectionId(target.id);
    else setActiveDocId(target.id);
  }, []);

  /** Every in-surface navigation that unmounts the canvas goes through here. */
  const requestLeave = useCallback(
    (target: LeaveTarget): boolean => {
      const alreadyThere =
        target.kind === 'section' ? target.id === activeSectionId : target.id === activeDocId;
      if (alreadyThere) return true;
      if (!dirty) {
        applyNav(target);
        return true;
      }
      /* Held by the unsaved-work guard: the author can still cancel, so a
         caller must not announce the open as done. Returns false so it knows. */
      setPendingLeave(target);
      return false;
    },
    [dirty, activeSectionId, activeDocId, applyNav]
  );

  /** Save through the editor's one save path, then move. A refused save keeps
   *  the author here with the text intact — the toast says why. */
  const saveAndLeave = useCallback(async () => {
    const target = pendingLeave;
    if (!target) return;
    setLeaving(true);
    try {
      const saved = await editorRef.current?.save();
      if (!saved) return; // stay put; the failure has already been reported
      setPendingLeave(null);
      applyNav(target);
    } finally {
      setLeaving(false);
    }
  }, [pendingLeave, applyNav]);

  /** Leave it unsaved. The editor's device cache (`dc::<sectionId>`) still
   *  holds the text and offers it back explicitly on return. */
  const leaveUnsaved = useCallback(() => {
    const target = pendingLeave;
    if (!target) return;
    setPendingLeave(null);
    applyNav(target);
  }, [pendingLeave, applyNav]);

  /* ── The editor's own conversation ──
     Grounded on what is open: `authoringContext` is the contract the server's
     orchestrator uses to resolve project / document / section instead of
     guessing from the message text, so "tighten this" means this section. */
  const [anaDraft, setAnaDraft] = useState('');
  const anaScrollRef = useRef<HTMLDivElement>(null);
  const authoringContext = useMemo<AuthoringContextPack | null>(
    () =>
      projectIdForOutline
        ? {
            projectId: projectIdForOutline,
            workflowStage: 'section-workspace',
            artifactId: activeDocId ?? undefined,
            artifactStatus: activeDoc?.status ?? undefined,
            moduleCode: activeDoc?.module ?? undefined,
            sectionCode: activeSection?.code ?? undefined,
            sectionTitle: activeSection?.title ?? undefined,
          }
        : null,
    [
      projectIdForOutline,
      activeDocId,
      activeDoc?.status,
      activeDoc?.module,
      activeSection?.code,
      activeSection?.title,
    ]
  );
  /* With no project open there is no AuthoringContextPack to build (it requires
     a projectId), so the document/section identity still travels as module
     context rather than being dropped. */
  const moduleContext = useMemo(() => {
    const base: Record<string, unknown> = {
      surface: 'document-authoring',
      documentId: activeDocId,
      documentTitle: activeDoc?.title ?? null,
      sectionId: activeSectionId,
      sectionCode: activeSection?.code ?? null,
      sectionTitle: activeSection?.title ?? null,
    };
    /* The screen's OPERABLE vocabulary from the shared surface-action registry
       (aliases applied), folded exactly as the shell folds it for railed
       surfaces (V2App) — this surface owns its conversation, so its own chat
       must advertise what the rail would have. Omitted entirely when empty
       rather than sending an empty claim. */
    const screenActions = advertisedScreenActions('document-authoring');
    return screenActions.length > 0 ? { ...base, screen_actions: screenActions } : base;
  }, [activeDocId, activeDoc?.title, activeSectionId, activeSection?.code, activeSection?.title]);
  const ana = useAnaChat({
    screenName: 'document-authoring',
    projectId: projectIdForOutline,
    authoringContext,
    moduleContext,
    /* Live Drive rides the shell's bridge (SurfaceViewProps.liveDrive): this
       dock's turns carry the same opt-in and feed the same shell-level
       apply/take-over machine as the rail's turns. */
    liveDrive: liveDrive?.on,
    onDriveEvent: liveDrive?.onDriveEvent,
    onArtifactSaved: liveDrive?.onWorkSaved,
  });
  const anaComposerRef = useRef<HTMLTextAreaElement>(null);
  const anaReturnFocusRef = useRef<HTMLElement | null>(null);
  const anaWasOpenRef = useRef(false);
  /* The pane ships open, so the first paint is not an "open" the user asked
     for: moving focus there would take the caret out of the document before
     they have typed a word. Every later open still focuses the composer. */
  const anaFirstPaintRef = useRef(true);

  const rememberAnaTrigger = useCallback(() => {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      !active.closest('[aria-label="AnA — document authoring"]')
    ) {
      anaReturnFocusRef.current = active;
    }
  }, []);

  const openAna = useCallback(
    (trigger?: HTMLElement | null) => {
      if (trigger) {
        anaReturnFocusRef.current = trigger;
      } else {
        rememberAnaTrigger();
      }
      setRail('ana');
    },
    [rememberAnaTrigger]
  );

  const closeAna = useCallback(() => {
    setRail(null);
  }, []);

  /* Every ask on this surface goes here. It OPENS the pane first — the whole
     defect was a question with no visible destination, so a silent send would
     only move the silence. */
  const askAna = useCallback(
    (text: string) => {
      const clean = (text ?? '').trim();
      if (!clean) return;
      openAna();
      void ana.send(clean);
    },
    [ana, openAna]
  );

  useEffect(() => {
    if (rail !== 'ana') return;
    const el = anaScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rail, ana.messages.length, ana.isStreaming]);

  useEffect(() => {
    if (rail !== 'ana') return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeAna();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [closeAna, rail]);

  useEffect(() => {
    if (anaFirstPaintRef.current) {
      anaFirstPaintRef.current = false;
      anaWasOpenRef.current = rail === 'ana';
      return;
    }
    if (rail === 'ana') {
      anaComposerRef.current?.focus({ preventScroll: true });
    } else if (anaWasOpenRef.current) {
      anaReturnFocusRef.current?.focus({ preventScroll: true });
      anaReturnFocusRef.current = null;
    }
    anaWasOpenRef.current = rail === 'ana';
  }, [rail]);

  /* ── Load documents for the current module/status ── */
  const loadDocs = useCallback(async () => {
    setDocsState('loading');
    // Scope to the open project when one is set on the runtime channel
    // (window.C2C_PROJECT — the same convention every project-aware surface
    // reads). A string id is a regulatory_programs UUID; absent or non-string →
    // org-wide, so the editor still works with no project open.
    const proj = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
    const programId = proj && typeof proj.id === 'string' ? proj.id : null;
    // No `module` filter. Every filter on this route is optional server-side,
    // and pinning one hid the rest of the dossier behind a dropdown — the
    // outline is what selects a section now, so the document list must span
    // all modules for it to select into.
    const url =
      `/api/authoring/docs?status=${encodeURIComponent(status)}` +
      (programId ? `&programId=${encodeURIComponent(programId)}` : '');
    const { ok, body } = await readJson<{ documents?: AuthDoc[] }>(url);
    if (!ok || !body) {
      setDocsState('error');
      setDocs([]);
      return;
    }
    const list = Array.isArray(body.documents) ? body.documents : [];
    setDocs(list);
    setDocsState('ready');
    // Keep the active doc if it survives the new filter; else pick the first.
    setActiveDocId(cur => (cur && list.some(d => d.id === cur) ? cur : list[0]?.id ?? null));
  }, [status]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  /* ── Load sections when the active document changes ──
     Doc-scoped like the comments/audit loaders below: the ref stamps the
     LATEST requested doc, and a response for any other doc is dropped whole.
     Without it, a fast doc switch (the docId deep-link resolving while the
     default document's larger section list was still in flight) let the
     STALE response land last — the header named the linked document while
     the outline and canvas held the other one's sections, and a save from
     there would have written the wrong governed document. */
  /** Document-level structural findings from GET …/sections. */
  const [structure, setStructure] = useState<SectionStructure | null>(null);
  const sectionsDocRef = useRef<string | null>(null);
  const loadSections = useCallback(async (docId: string) => {
    sectionsDocRef.current = docId;
    setSectionsState('loading');
    const { ok, body } = await readJson<{ sections?: AuthSection[]; structure?: SectionStructure }>(
      `/api/authoring/docs/${encodeURIComponent(docId)}/sections`
    );
    if (sectionsDocRef.current !== docId) return;
    if (!ok || !body) {
      setSectionsState('error');
      setSections([]);
      setStructure(null);
      return;
    }
    const list = Array.isArray(body.sections) ? body.sections : [];
    setSections(list);
    /* Two document-level facts no single section can show: a code filed twice,
       and a stored order that disagrees with the codes. Null when the server
       did not send them, so an older server renders no claim either way. */
    setStructure(body.structure ?? null);
    setSectionsState('ready');
    // A deep-link resolution may have named the section this load should land
    // on. Selected HERE, after setSections, so the buffer-sync effect below
    // reads the section's real content — selecting it before the list arrived
    // would sync an empty buffer over a section that has text. Consumed only
    // by a load of the document it names: a stale in-flight load of another
    // document must not swallow the target.
    const target = targetSectionRef.current;
    const landTarget =
      target != null && target.docId === docId && list.some(s => s.id === target.sectionId);
    if (target != null && target.docId === docId) targetSectionRef.current = null;
    setActiveSectionId(cur => {
      if (landTarget) return target!.sectionId;
      return cur && list.some(s => s.id === cur) ? cur : list[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    if (!activeDocId) {
      setSections([]);
      setSectionsState('idle');
      setActiveSectionId(null);
      return;
    }
    void loadSections(activeDocId);
  }, [activeDocId, loadSections]);

  /* ── Reset editor bookkeeping on section switch ──
     The canonical editor remounts per section (key includes the id) and reads
     its content from the section row, so there is no separate draft buffer to
     sync — only the dirty mirror and any pending comment anchor to clear. */
  useEffect(() => {
    setEditorDirty(false);
    pendingAnchorRef.current?.resolve(null);
    pendingAnchorRef.current = null;
    setPendingAnchor(null);
  }, [activeSectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Honour the deep-link target ──
     One attempt per mount, once the document list is ready and the governed
     outline has settled. FAIL CLOSED at every step: a target scoped to a
     different program, a target whose family contradicts this project's
     governed dossier, or a section no document in scope holds, all land on
     the DEFAULT view with a notice that says so — resolving a near-miss into
     the wrong document would be worse than an honest miss.

     One-shot via refs rather than by nulling the state inside the effect:
     a dep-change cleanup would cancel the in-flight search the moment the
     state write re-ran the effect. `aliveRef` guards only real unmount. */
  const targetAttemptedRef = useRef(false);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const [treeScrollNonce, setTreeScrollNonce] = useState(0);
  useEffect(() => {
    if (targetAttemptedRef.current) return;
    if (!sectionOpenTarget || docsState === 'loading') return;
    const t = sectionOpenTarget;
    if (docsState === 'error') {
      /* A failed docs read must NOT spend the one attempt: the ref stays
         unlatched, so when the list does load (a retry, a status-filter
         change) this effect re-fires and the target still resolves — the
         retry this notice promises actually exists. The tree pane already
         reports the failed read; this says what it cost. */
      setTargetNotice(
        `Couldn’t open ${t.docId ? 'the linked document' : describeEditorTarget(t)} — ` +
          'the document list failed to load, so nothing was resolved. ' +
          'It opens automatically once documents load.'
      );
      return;
    }
    /* A doc-id target is the strongest claim a sender can make: it holds the
       EXACT document (the correspondence card's linked response draft). No
       search, no near-miss — the document is in the list or the miss is
       stated. Resolved before the section flow because a sender with the id
       has nothing to search for — and WITHOUT waiting on the filing outline
       (only the section flow's docType/program guards consult it; waiting
       here widened the window in which an author could type into the
       default document before the switch landed). */
    if (t.docId) {
      targetAttemptedRef.current = true;
      const linked = docs.find((d) => d.id === t.docId);
      if (linked) {
        // A docs-error notice posted moments ago must not outlive the open.
        setTargetNotice(null);
        /* Through the unsaved-work gate, not a bare setActiveDocId: a doc
           switch unmounts the section-keyed canvas, and if the author typed
           anything while this resolution was pending, the guard dialog gets
           to hold the navigation (see requestLeave above). */
        const opened = requestLeave({ kind: 'document', id: linked.id });
        setTreeScrollNonce(n => n + 1);
        /* "Opened …" used to fire regardless — including when the guard held
           the navigation and the author then cancelled it. */
        if (opened) fireToast(`Opened “${linked.title}” — the linked document.`);
        else fireToast(`“${linked.title}” will open once you decide about the unsaved work here.`);
      } else {
        setTargetNotice(
          'Couldn’t open the linked document — it isn’t in the documents in scope ' +
            `(status filter: ${status.replace('_', ' ')}). It may sit under another ` +
            'status or another project. Showing the editor’s default view instead.'
        );
      }
      return;
    }
    // Only the section flow consults the governed outline; its guards below
    // need the filing settled before the one attempt is spent.
    if (filing.loading) return;
    targetAttemptedRef.current = true;
    // A hand-off that named no section carried only program scope, which
    // window.C2C_PROJECT already delivered. Nothing more was claimed.
    if (!t.sectionCode && !t.sectionLabel) return;
    // A navigation-directive target claims no document family; the guards and
    // notices below only speak of one when the sender actually named it.
    const family = t.docType ? EDITOR_TARGET_DOC_LABELS[t.docType] : null;
    const wanted = describeEditorTarget(t);
    if (t.programId && t.programId !== projectIdForOutline) {
      setTargetNotice(
        `Couldn’t open ${wanted} — it belongs to ${t.programTitle ?? 'a different program'}, ` +
          'which is not the project this editor is scoped to. Open that project and retry. ' +
          'Showing the editor’s default view instead.'
      );
      return;
    }
    if (t.docType && filing.document && filing.document.doc_type !== t.docType) {
      setTargetNotice(
        `Couldn’t open ${wanted} — this project’s governed dossier is ` +
          `${filing.document.doc_type.toUpperCase()}, not ${family}. ` +
          'Showing the editor’s default view instead.'
      );
      return;
    }
    void (async () => {
      // The docs list is program-scoped (or the org's current filter); a
      // program's dossier is one or a few documents, so the search is bounded
      // defensively rather than paged.
      for (const d of docs.slice(0, 8)) {
        const { ok, body } = await readJson<{ sections?: AuthSection[] }>(
          `/api/authoring/docs/${encodeURIComponent(d.id)}/sections`
        );
        if (!aliveRef.current) return;
        if (!ok || !body) continue;
        const match = matchEditorTargetSection(
          Array.isArray(body.sections) ? body.sections : [],
          t
        );
        if (match) {
          // Route the selection through loadSections (via targetSectionRef) so
          // the section is selected only once its list — and therefore its
          // content — is in state. Selecting directly here could sync an empty
          // buffer over a section that has text.
          targetSectionRef.current = { docId: d.id, sectionId: match.id };
          if (d.id === activeDocId) void loadSections(d.id);
          else setActiveDocId(d.id);
          // A docs-error notice from before the list loaded must not outlive
          // the successful open.
          setTargetNotice(null);
          setTreeScrollNonce(n => n + 1);
          fireToast(
            `Opened ${match.code} · ${match.title}` +
              (family ? ` — from the ${family} workspace.` : ' — as requested in chat.')
          );
          return;
        }
      }
      if (!aliveRef.current) return;
      setTargetNotice(
        `Couldn’t find ${wanted} in the ${family ? `${family} ` : ''}documents in scope ` +
          `(status filter: ${status.replace('_', ' ')}). Showing the editor’s default view — ` +
          'the section may not be drafted here yet, or may sit under another status.'
      );
    })();
  }, [
    sectionOpenTarget,
    docsState,
    docs,
    filing.loading,
    filing.document,
    projectIdForOutline,
    status,
    activeDocId,
    loadSections,
    requestLeave,
    fireToast,
  ]);

  /* ── Open-by-document-type hand-off (navigate_to `authoringDocType`) ──
     "AnA, open the Clinical Overview for authoring" → the directive names a
     document, not a section. Matched against the REAL documents in scope by
     title (normalized exact first, then containment) — never a fabricated
     document, and an honest notice on a miss. A section hand-off wins when
     both were named: its bounded search already spans every document. */
  const docQueryAttemptedRef = useRef(false);
  useEffect(() => {
    if (docQueryAttemptedRef.current) return;
    if (!navHandOff.docQuery || sectionOpenTarget || docsState === 'loading') return;
    docQueryAttemptedRef.current = true;
    const wanted = navHandOff.docQuery;
    if (docsState === 'error') {
      setTargetNotice(
        `Couldn’t open “${wanted}” — the document list failed to load, so nothing was resolved. ` +
          'Retry once documents load.'
      );
      return;
    }
    const norm = (s: string) => s.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const want = norm(wanted);
    const match =
      docs.find(d => norm(d.title) === want) ?? docs.find(d => norm(d.title).includes(want));
    if (match) {
      if (match.id !== activeDocId) setActiveDocId(match.id);
      setTreeScrollNonce(n => n + 1);
      fireToast(`Opened “${match.title}” — as requested in chat.`);
      return;
    }
    setTargetNotice(
      `Couldn’t find a document matching “${wanted}” in scope ` +
        `(status filter: ${status.replace('_', ' ')}). Showing the editor’s default view — ` +
        'it may not be drafted here yet, or may sit under another status.'
    );
  }, [navHandOff.docQuery, sectionOpenTarget, docsState, docs, activeDocId, status, fireToast]);

  /* Bring the deep-linked section's tree row into view once it is active.
     Re-runs as the tree fills in; a no-op when nothing is active yet. */
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!treeScrollNonce) return;
    const row = rootRef.current?.querySelector<HTMLElement>('.ed-tree-row[data-active]');
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
  }, [treeScrollNonce, activeSectionId, sections]);

  /* ── AnA's hands on this screen — the surface-action bus ──────────────────
     Registered under this surface's OWN surfaceViews id ('document-authoring');
     the bus alias-resolves the registry's 'authoring' surfaceId onto it, the
     same resolution nav() applies. Both handlers drive the SAME path the
     human's own tree clicks drive — requestLeave (the unsaved-work gate) plus
     the tree-scroll nonce — never a second navigation path, and both answer
     honest refusals instead of discarding a person's typing or resolving a
     near-miss into the wrong document. */
  /* One guard for both handlers: while a dialog or a write owns the canvas, an
     AnA-driven switch would discard or race the person's work. Specific per
     flag, because "busy" tells the subscriber nothing they can act on. */
  const authoringGuard = (): { ok: false; reason: string } | null => {
    if (pendingLeave)
      return { ok: false, reason: 'An unsaved-changes dialog is open — resolve it first.' };
    if (leaving)
      return { ok: false, reason: 'A save-and-leave is in progress — let it finish first.' };
    if (saving) return { ok: false, reason: 'A save is in progress — let it finish first.' };
    if (picking)
      return { ok: false, reason: 'The source picker is open — finish or cancel it first.' };
    if (pendingAnchor)
      return { ok: false, reason: 'A comment is being anchored — post or cancel it first.' };
    return null;
  };
  /* Separate from the busy flags because it needs the honest specifics: AnA
     never discards typing, and the refusal names the section holding it. */
  const dirtyGuard = (): { ok: false; reason: string } | null => {
    if (!dirty) return null;
    const where = activeSection?.code ? `§${activeSection.code}` : 'the open section';
    return { ok: false, reason: `There are unsaved edits in ${where} — save or leave them first.` };
  };
  useSurfaceActionHandlers('document-authoring', {
    'authoring.open-document': params => {
      const guarded = authoringGuard() ?? dirtyGuard();
      if (guarded) return guarded;
      const raw = (params.title ?? '').trim();
      if (!raw) return { ok: false, reason: 'No document named.' };
      // Not-ready, not failed: the bus holds the directive and re-attempts on
      // this surface's ready signal below — the navigate→act gap.
      if (docsState === 'loading')
        return { ok: false, reason: 'The document list is still loading.', retry: true };
      if (docsState === 'error') return { ok: false, reason: 'The document list could not be read.' };
      /* The same resolution idiom as the deep-link hand-off above — normalized
         exact, then containment — except that MULTIPLE containment hits are an
         honest refusal here. The legacy inline path silently took the first;
         an AnA-driven open must not guess between documents. */
      const norm = (s: string) =>
        s.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
      const want = norm(raw);
      const exact = docs.filter(d => norm(d.title) === want);
      const pool = exact.length > 0 ? exact : docs.filter(d => norm(d.title).includes(want));
      if (pool.length === 0) {
        return {
          ok: false,
          reason: `No document matching "${raw}" in scope (status filter: ${status.replace('_', ' ')}).`,
        };
      }
      if (pool.length > 1) {
        return { ok: false, reason: `"${raw}" matches ${pool.length} documents — name one exactly.` };
      }
      const match = pool[0];
      if (match.id === activeDocId) return { ok: true, detail: 'Already open' };
      requestLeave({ kind: 'document', id: match.id });
      setTreeScrollNonce(n => n + 1);
      return { ok: true, detail: `Opened “${match.title}”` };
    },
    'authoring.open-section': params => {
      const guarded = authoringGuard() ?? dirtyGuard();
      if (guarded) return guarded;
      const code = (params.sectionCode ?? '').trim();
      if (!code) return { ok: false, reason: 'No section code given.' };
      if (activeDocId == null || sectionsState === 'idle') {
        return { ok: false, reason: 'No document is open — open one first.' };
      }
      if (sectionsState === 'loading')
        return { ok: false, reason: 'The document’s sections are still loading.', retry: true };
      if (sectionsState === 'error')
        return { ok: false, reason: 'The document’s sections could not be read.' };
      /* Resolved ONLY within the open document's loaded sections — the
         cross-document search belongs to navigate_to, and the refusal says so
         instead of quietly widening the scope. */
      const match = matchEditorTargetSection(sections, { sectionCode: code, sectionLabel: null });
      if (!match) {
        const docName = activeDoc ? `“${activeDoc.title}”` : 'the open document';
        return {
          ok: false,
          reason: `§${code} is not in ${docName} — for another document, ask me to navigate to authoring with that section code.`,
        };
      }
      if (match.id === activeSectionId) return { ok: true, detail: 'Already open' };
      requestLeave({ kind: 'section', id: match.id });
      setTreeScrollNonce(n => n + 1);
      return { ok: true, detail: `Opened §${match.code} · ${match.title}` };
    },
    'authoring.find': params => {
      /* Read-only affordance: dirtyGuard deliberately does NOT apply — the
         person's own Ctrl/⌘-F works over unsaved edits and opening the bar
         discards nothing. The dialog/save guards still do. */
      const guarded = authoringGuard();
      if (guarded) return guarded;
      if (docsState === 'loading' || sectionsState === 'loading')
        return { ok: false, reason: 'The document is still loading.', retry: true };
      const handle = editorRef.current;
      if (!handle) {
        return { ok: false, reason: 'No section is open in the editor — open a document first.' };
      }
      const q = (params.query ?? '').trim();
      if (!handle.openFind(q || undefined)) {
        return {
          ok: false,
          reason:
            'This section is in raw-HTML source mode — the find bar is unavailable there (the browser\'s own find works).',
        };
      }
      return { ok: true, detail: q ? `Find bar open — searching for "${q}"` : 'Find bar opened' };
    },
  });
  /* The ready signal for the retry contract above: when the reads settle
     (sections 'idle' — no document open — counts as settled; the handler
     answers that case honestly), a held not-ready directive gets its one
     re-attempt. */
  useEffect(() => {
    if (docsState !== 'loading' && sectionsState !== 'loading') {
      notifySurfaceActionReady('document-authoring');
    }
  }, [docsState, sectionsState]);

  /* ── Load the right-rail data for the active section on demand ── */
  const loadHistory = useCallback(async (sectionId: string) => {
    historySectionRef.current = sectionId;
    setRevisionsState('loading');
    setRevisions([]);
    // `ok` is honoured because a read FAILURE must never be rendered as an
    // assertion about the record. This destructured only `body`, so a 500 —
    // which this endpoint returned on every single call while its join was
    // `u.id = r.created_by::uuid` (integer = uuid, 42883 at parse time) —
    // produced an empty array and the rail said "No prior revisions". An
    // author who had saved five times was told her edits were never versioned,
    // and a reviewer was told the section had never changed.
    const { ok, body } = await readJson<{ revisions?: AuthRevision[] }>(
      `/api/authoring/sections/${encodeURIComponent(sectionId)}/history`
    );
    if (historySectionRef.current !== sectionId) return; // a later section is on screen
    if (!ok) {
      setRevisionsState('error');
      setRevisions([]);
      return;
    }
    setRevisionsState('ready');
    setRevisions(Array.isArray(body?.revisions) ? body!.revisions! : []);
  }, []);

  /* Same contract as loadSources below: a failed read is an ERROR, never an
     empty list. This loader used to discard `ok` and render every failure as
     "No comments yet" — on a rail consulted to decide whether a document is
     clear of open review threads before freezing it, that conflation is the
     dangerous one.

     Doc-scoped, same as the section loader's targetSectionRef: the ref stamps
     the LATEST requested doc, and a response for any other doc is dropped.
     Without it, switching documents while a slow comments fetch was in flight
     rendered document A's review threads under document B — and a reply or a
     resolution made there acted on threads of a document not on screen. */
  const commentsDocRef = useRef<string | null>(null);
  const loadComments = useCallback(async (docId: string) => {
    commentsDocRef.current = docId;
    setCommentsState('loading');
    /* The ref above stops a stale RESPONSE landing; nothing stopped the stale
       DISPLAY. On a document switch the previous document's threads stayed on
       screen — with live Resolve / Reply controls that write by comment id —
       until the new read returned. Cleared here, with the thread focus. */
    setComments([]);
    setFocusedCommentId(null);
    setReplyTo(null);
    setResolveFor(null);
    const { ok, body } = await readJson<{ comments?: AuthComment[] }>(
      `/api/authoring/documents/${encodeURIComponent(docId)}/comments`
    );
    if (commentsDocRef.current !== docId) return;
    if (!ok || !body) {
      setCommentsState('error');
      setComments([]);
      return;
    }
    setCommentsState('ready');
    setComments(Array.isArray(body.comments) ? body.comments : []);
  }, []);

  /* ── The document's audit trail ──
     GET /docs/:docId/audit has served these rows — actor, role, operation,
     reason, before/after content hashes — since the authoring store shipped,
     and no surface ever called it: the record §11.10(e) exists for was being
     written and could not be read. Newest first, as the server returns it. */
  const auditDocRef = useRef<string | null>(null);
  const loadAudit = useCallback(async (docId: string) => {
    // Doc-scoped like loadComments above: a Part 11 trail rendered under the
    // wrong document is worse than a late one.
    auditDocRef.current = docId;
    setAuditState('loading');
    const { ok, body } = await readJson<{ events?: AuthAuditEvent[] }>(
      `/api/authoring/docs/${encodeURIComponent(docId)}/audit?limit=100`
    );
    if (auditDocRef.current !== docId) return;
    if (!ok || !body) {
      setAuditState('error');
      setAuditEvents([]);
      return;
    }
    setAuditEvents(Array.isArray(body.events) ? body.events : []);
    setAuditState('ready');
  }, []);

  /* ── The sources this section is drafted from ──
     Live read, honest failure. An error is reported as an error rather than as
     an empty list: "we could not load what this section cites" and "this section
     cites nothing" are different facts, and on a regulated surface conflating
     them is the more dangerous mistake. */
  const sourcesSectionRef = useRef<string | null>(null);
  const loadSources = useCallback(async (sectionId: string) => {
    /* Section-scoped like the other loaders: without the ref, fast section
       switching let §A's citation list resolve last and render as §B's
       "Drafted from" — with Re-read / Remove buttons that then posted §A's
       citation ids against §B — and fed the editor's citation picker the
       wrong section's library for the same window. */
    sourcesSectionRef.current = sectionId;
    setSourcesState('loading');
    setSources([]);
    const { ok, body } = await readJson<{ sources?: SectionSource[] }>(
      `/api/authoring/sections/${encodeURIComponent(sectionId)}/sources`
    );
    if (sourcesSectionRef.current !== sectionId) return;
    if (!ok || !body) {
      setSourcesState('error');
      setSources([]);
      return;
    }
    setSources(Array.isArray(body.sources) ? body.sources : []);
    setSourcesState('ready');
  }, []);

  /* ── The project's Data Room, for the picker ──
     The project comes from window.C2C_PROJECT, the same runtime channel the
     sibling surfaces use. With no project in context there is nothing to offer,
     and the picker says so instead of listing every source in the org. */
  const loadProjectSources = useCallback(async () => {
    const p = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
    const pid = p?.id == null ? null : String(p.id);
    if (!pid) {
      setProjectSources([]);
      return;
    }
    const { ok, body } = await readJson<{ sources?: ProjectSource[] }>(
      `/api/c2c/projects/${encodeURIComponent(pid)}/sources`
    );
    setProjectSources(ok && Array.isArray(body?.sources) ? body!.sources! : []);
  }, []);

  /* ── Recompute the revision ledger server-side ──
     The server walks the section's revision chain oldest-first and recomputes
     every hash from stored content. "Verified" here is a computation result,
     never a cached flag. */
  const verifyLedger = useCallback(async (sectionId: string) => {
    setLedger('checking');
    const { ok, body } = await readJson<LedgerVerdict & { success?: boolean }>(
      `/api/authoring/sections/${encodeURIComponent(sectionId)}/history/verify`
    );
    if (!ok || !body) {
      setLedger('error');
      return;
    }
    setLedger(body);
  }, []);

  useEffect(() => {
    setLedger(null);
  }, [activeSectionId]);

  useEffect(() => {
    if (rail === 'history' && activeSectionId) void loadHistory(activeSectionId);
    if (rail === 'comments' && activeDocId) void loadComments(activeDocId);
    if (rail === 'audit' && activeDocId) void loadAudit(activeDocId);
    /* Loaded whenever a section is open, not only when the Sources rail is:
       the editor's citation picker offers this library, and a writer citing a
       source mid-sentence should not have to open a rail first to make the
       list exist. The rail re-reads on open through the same callbacks. */
    if (activeSectionId) {
      void loadSources(activeSectionId);
      void loadProjectSources();
    }
  }, [
    rail,
    activeSectionId,
    activeDocId,
    loadHistory,
    loadComments,
    loadAudit,
    loadSources,
    loadProjectSources,
  ]);

  /* ── The source library the editor's citation picker offers ──
     The sources this section already cites, then the rest of the project's Data
     Room. Merged rather than kept apart because a writer citing mid-sentence is
     choosing a source, not choosing between two lists; de-duplicated on the
     source's identity so a source already cited appears once.

     Only the id and the title travel here. That is all the canvas needs — the
     picker's label and the node's cached name — and the reference list a
     reviewer reads is assembled server-side at export, where the source
     registry's sponsor, date and identifier are available. Nothing here is
     invented to fill a field the client cannot see. */
  const citationLibrary = useMemo<CitationSource[]>(() => {
    const out: CitationSource[] = [];
    const seen = new Set<string>();
    const add = (id: unknown, title: string | null | undefined) => {
      if (id == null) return;
      const key = String(id);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ id: key, title: title ?? null });
    };
    for (const s of sources) if (s.source) add(s.source.id, s.source.title);
    for (const p of projectSources) add(p.id, p.title);
    return out;
  }, [sources, projectSources]);

  /* ── Where this section's citation numbering continues from ──
     A citation's number is its position in the DOCUMENT's reference list, and
     the editor holds one section. Without the sources cited above it, the canvas
     would number from 1 and show "[1]" for a claim the filed document prints as
     "[7]" — a plausible-looking wrong number, which is the failure the whole
     design exists to remove. Read from the sections' SAVED content, in the
     document's own order, which is what the export will read too. */
  const precedingSourceIds = useMemo<string[]>(() => {
    if (!activeSectionId) return [];
    const ids: string[] = [];
    for (const sec of sections) {
      if (sec.id === activeSectionId) break;
      ids.push(...citedSourceIdsInHtml(sec.content ?? ''));
    }
    return ids;
  }, [sections, activeSectionId]);

  /* ── The document's tables and figures, either side of the open section ──
     A caption's number is the object's POSITION among the document's tables
     (or figures), and the editor holds one section. Without the objects above
     it the canvas would number from 1 and show "Table 1" for an object the
     filing prints as "Table 7" — a plausible-looking wrong number, which is
     the failure this design exists to remove. The ones BELOW are supplied too,
     because "as shown in Table 9" is routinely written above the table it
     names and must resolve.

     Read from the sections' SAVED content, in the document's own order, which
     is what the export will read too. The open section's own objects are not
     here: the canvas numbers those from its live document, so a table gets its
     number the moment it is captioned rather than at the next save. */
  const captionsAround = useMemo<{
    before: CaptionedObject[];
    after: CaptionedObject[];
  }>(() => {
    const before: CaptionedObject[] = [];
    const after: CaptionedObject[] = [];
    let seen = false;
    for (const sec of sections) {
      if (sec.id === activeSectionId) {
        seen = true;
        continue;
      }
      (seen ? after : before).push(...captionedObjectsInHtml(sec.content ?? ''));
    }
    return { before, after };
  }, [sections, activeSectionId]);

  /* ── Record that this section is drafted from a source ── */
  const citeSource = useCallback(
    async (sourceId: number) => {
      if (!activeSectionId) return;
      try {
        const res = await apiRequest(
          'POST',
          `/api/authoring/sections/${activeSectionId}/cite-source`,
          {
            source_id: sourceId,
          }
        );
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          fireToast(
            'Couldn’t record the source — ' +
              ((json as any)?.error ?? `HTTP ${res.status}`) +
              '. Nothing was saved.',
            'error'
          );
          return;
        }
        fireToast(
          (json as any)?.created
            ? 'Source recorded — this section now cites it, with the source’s current checksum.'
            : 'Source re-resolved against its current content.'
        );
        setPicking(false);
        void loadSources(activeSectionId);
      } catch (e) {
        fireToast(
          'Couldn’t record the source — ' + (e instanceof Error ? e.message : String(e)) + '.',
          'error'
        );
      }
    },
    [activeSectionId, fireToast, loadSources]
  );

  /* ── Stop citing a source ── */
  const uncite = useCallback(
    async (sourceId: number) => {
      if (!activeSectionId) return;
      /* apiRequest THROWS on the server's actual refusal (404 "a frozen
         citation is immutable") and RETURNS a 401. The old shape had no catch,
         so the real refusal was an unhandled rejection with no toast and a row
         that just sat there — while the only reachable message, on 401, blamed
         freeze-immutability for an expired session. */
      try {
        const res = await apiRequest(
          'DELETE',
          `/api/authoring/sections/${activeSectionId}/cite-source/${sourceId}`
        );
        if (res.status === 401) {
          fireToast('Not removed — your session isn’t authenticated. Nothing was changed.', 'error');
          return;
        }
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          fireToast('Couldn’t remove the citation — ' + (serverMessage(json) ?? 'the server refused it') + '. Nothing was changed.', 'error');
          return;
        }
        fireToast('Citation removed.');
        void loadSources(activeSectionId);
      } catch (e) {
        fireToast(
          'Couldn’t remove the citation — ' + redactInternals(e instanceof Error ? e.message : '', 'the server refused it') + '. Nothing was changed.',
          'error'
        );
      }
    },
    [activeSectionId, fireToast, loadSources]
  );

  /* ── Re-read the source and record what it says now ──
     The server re-resolves against the stored source; it does not invent a hash.
     A citation whose source is gone, or which is frozen, is refused with a reason. */
  const reresolve = useCallback(
    async (citationId: string) => {
      if (!activeSectionId) return;
      /* The route refuses with a phrased reason (frozen citation, source no
         longer resolves) as a 404/409 — which apiRequest THROWS, and this
         handler had no catch: "Re-read source" was a silent no-op on exactly
         the cases the comment above promises a reason for. */
      try {
        const res = await apiRequest(
          'POST',
          `/api/authoring/sections/${activeSectionId}/refresh-token`,
          {
            cite_id: citationId,
          }
        );
        const json = await res.json().catch(() => null);
        if (res.status === 401) {
          fireToast('Not re-read — your session isn’t authenticated. Nothing was changed.', 'error');
          return;
        }
        if (!res.ok) {
          fireToast('Couldn’t re-read the source — ' + (serverMessage(json) ?? 'the server refused it') + '. Nothing was changed.', 'error');
          return;
        }
        fireToast(serverMessage(json) ?? 'Source re-read.');
        void loadSources(activeSectionId);
      } catch (e) {
        fireToast(
          'Couldn’t re-read the source — ' + redactInternals(e instanceof Error ? e.message : '', 'the server refused it') + '. Nothing was changed.',
          'error'
        );
      }
    },
    [activeSectionId, fireToast, loadSources]
  );

  /* ── Re-read every source in the DOCUMENT ──
     The per-citation "re-read" above answers one claim at a time, which is the
     wrong granularity before an export or a sign-off: the question there is
     "has anything I cite moved?", across the whole document.

     The server re-resolves each unfrozen citation against its stored source and
     reports three separate numbers — how many it refreshed, how many of those
     actually CHANGED, and which it could not refresh and why. All three are
     said. Collapsing `skipped` into the success count is the tempting summary
     and the dishonest one: a citation whose source no longer exists is exactly
     what the person about to file this needs to see. */
  const [refreshingAll, setRefreshingAll] = useState(false);
  const refreshAllSources = useCallback(async () => {
    if (!activeDocId) return;
    setRefreshingAll(true);
    try {
      const res = await apiRequest('POST', `/api/authoring/docs/${activeDocId}/refresh-all`, {});
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        refreshed?: number;
        changed?: number;
        skipped?: Array<{ cite_id: string; reason: string }>;
      } | null;
      if (!res.ok || json?.ok !== true) {
        fireToast(
          'Couldn’t re-read this document’s sources — ' +
            (serverMessage(json) ?? `HTTP ${res.status}`) +
            '. Nothing was changed.',
          'error',
        );
        return;
      }
      const refreshed = typeof json.refreshed === 'number' ? json.refreshed : 0;
      const changed = typeof json.changed === 'number' ? json.changed : 0;
      const skipped = Array.isArray(json.skipped) ? json.skipped : [];
      setSkippedRefreshes(skipped);
      /* A refresh that changed nothing is a real and useful outcome — it means
         the citations still say what they said. It is reported as that, not as
         a bare "done". */
      fireToast(
        `Re-read ${refreshed} citation${refreshed === 1 ? '' : 's'}: ` +
          (changed === 0
            ? 'none had changed'
            : `${changed} had changed since they were recorded`) +
          (skipped.length > 0
            ? `. ${skipped.length} could not be re-read — see Sources.`
            : '.'),
        skipped.length > 0 ? 'error' : 'ok',
      );
      if (activeSectionId) void loadSources(activeSectionId);
    } catch (e) {
      fireToast(
        'Couldn’t re-read this document’s sources — ' +
          (e instanceof Error ? e.message : String(e)) +
          '. Nothing was changed.',
        'error',
      );
    } finally {
      setRefreshingAll(false);
    }
  }, [activeDocId, activeSectionId, loadSources, fireToast]);

  /* ── Save the section content (real, awaited, auto-revisioned) ──
     The ONE save path: the canonical editor serializes and calls this; the
     header Save button and Cmd/Ctrl-S route through the editor's own save so
     the footer save-state, the device cache and this governed PATCH cannot
     disagree. Throwing on failure lets the editor report the truth. */
  const saveSectionContent = useCallback(
    async (serialized: string, systemReason?: string) => {
      if (!activeSection) throw new Error('No section open');

      /* THE FUNNEL. Every content save arrives here — the Save button, ⌘S, and
         the unsaved-work guard's Save — so the reason is required here rather
         than only on the button, which is the one path a disabled attribute
         can cover. Without this, ⌘S saved silently with no reason and the
         button's requirement was decorative.
         Refused visibly, never silently: an author who pressed ⌘S and saw
         nothing happen would reasonably conclude their work was saved. */
      if (!systemReason && !changeReasonRef.current.trim()) {
        fireToast(
          'Not saved — say why this section changed. It is recorded with the ' +
            'revision, and the filing keeps it.',
          'error',
        );
        throw new Error('reason-for-change required');
      }

      setSaving(true);
      try {
        /* Authors whose insertions this reviewer accepted since the last save.
           Accepting a suggestion strips the mark that named its author, so
           without this the revision would attribute an AnA draft entirely to
           whoever pressed accept. Read-and-clear: an author counts once, for
           the save that carried their text in. */
        const acceptedAuthors = editorRef.current?.takeAcceptedAuthors?.() ?? [];
        /* The concurrency token. `updated_at` is the value THIS editor loaded;
           the server refuses with 409 SECTION_CHANGED if the row has moved
           since. Without it the PATCH is a blind last-write-wins, and two
           authors on one CTD section — a writer and a reviewer on the same
           §3.2.P.5 — end with the second save replacing the first's entire
           section, recorded in the revision ledger as an ordinary edit. */
        /* §11.10(d)/(e) reason for change. Stated once per section per editing
           session and carried on every save of that section — see
           `changeReason` below for why it is sticky rather than per-save.
           When it is absent the server records that it was NOT STATED; it does
           not invent one. */
        const reasonForChange = systemReason ?? changeReasonRef.current.trim();
        const res = await apiRequest('PATCH', `/api/authoring/sections/${activeSection.id}`, {
          content: serialized,
          ...(activeSection.updated_at ? { expectedUpdatedAt: activeSection.updated_at } : {}),
          ...(acceptedAuthors.length ? { acceptedAuthors } : {}),
          ...(reasonForChange ? { changeReason: reasonForChange } : {}),
        });
        const json = await res.json().catch(() => null);
        if (res.status === 401) {
          fireToast('Not saved — your session isn’t authenticated. Sign in and retry.', 'error');
          throw new Error('unauthenticated');
        }
        /* The `!res.ok` branch that used to live here was UNREACHABLE, and with
           it every sentence this surface had for a refused save.
           `apiRequest` throws an ApiRequestError on any non-2xx except 401
           (client/src/lib/queryClient.ts), so execution never arrived at a
           non-ok `res`. The throw escaped this function — which has
           try/finally and no catch — into RichSectionEditor's unbound
           `catch { setSaveState('error') }`, where the error object, its
           message and its correlation id were all discarded. The author saw
           `Save failed — kept on this device` at 10px, in grey, and nothing
           else.
           On a Part 11 authoring surface that is the wrong failure to blur.
           The server distinguishes these deliberately and phrases each one:
             403 DOCUMENT_FROZEN     — with the lock's own reason
             403                     — no edit permission for this section
             500 LINEAGE_REQUIRED    — "the section was not saved: its data
                                        lineage could not be recorded"
           A frozen record and a flaky network need completely different
           actions from the author, and they were indistinguishable.
           The catch is in `doSave` below; this line documents why there is no
           `!res.ok` test here any more. */
        void json;
        const adopted = (json as { section?: AuthSection })?.section;
        const persisted = adopted?.content ?? serialized;
        // Adopt the server row (revision counter, updated_at) into the tree.
        setSections(ss =>
          ss.map(s =>
            s.id === activeSection.id ? { ...s, ...(adopted ?? {}), content: persisted } : s
          )
        );
        fireToast('Section saved — a revision was recorded (' + activeSection.code + ').');
        // Keep the history and audit rails fresh if open — a save writes both.
        if (rail === 'history') void loadHistory(activeSection.id);
        if (rail === 'audit' && activeDocId) void loadAudit(activeDocId);
        /* A save changes the document's content hash, which is precisely what
           the Exports rail compares against the last export. Unconditional:
           the rail re-reads on mount, so bumping while it is closed simply
           means it opens on the truth rather than on a cached verdict. */
        setExportsEpoch(e => e + 1);
      } catch (err) {
        /* THE AUTHOR IS TOLD WHY THE RECORD REFUSED THEIR WORK.
           `apiRequest` throws ApiRequestError for every non-2xx except 401, so
           this is where a frozen document, a permission refusal and a lineage
           failure actually arrive. `message` has already been through
           `extractApiError`, so it is the server's own sentence with SQL,
           relation names, routes and env vars filtered out — safe to render
           verbatim, which is the point: "This document is frozen. Its content
           is sealed under a content hash" tells the author to create a new
           version, and "HTTP 403" tells them to file a bug.
           `correlationId` is the X-Request-Id the server echoed; it is the one
           string that makes an outage diagnosable without describing the
           schema to whoever is looking.
           Re-thrown either way: the editor's own save-state must still go to
           'error' and keep the text cached on the device. This adds the
           explanation; it does not swallow the failure. */
        const e = err as Partial<ApiRequestError> & { message?: string };
        /* A collision is not a failure to report like the others. The author's
           text is intact on this device and nothing of theirs was lost — what
           they must NOT do is press save again expecting it to work, and what
           they must know is that someone else's version is now the record.
           Reloading is the only safe next step, so the message says so instead
           of offering a retry that would either fail again or clobber. */
        if (e?.status === 409) {
          fireToast(
            `Not saved — ${activeSection.code} was changed by someone else while you were editing. ` +
              'Your text is still here and theirs was not overwritten. Reload the section to see ' +
              'their version, then reapply your changes.',
            'error',
          );
          throw err;
        }
        const why = redactInternals(e?.message, 'the server did not accept the change');
        fireToast(
          `Couldn’t save ${activeSection.code} — ${why} Nothing was persisted.` +
            (e?.correlationId ? ` Reference ${e.correlationId}.` : ''),
          'error',
        );
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [activeSection, rail, loadHistory, fireToast]
  );

  /* ── Upload a figure into the governed image store ──
     Multipart, because apiRequest is JSON-only, with the Bearer attached
     explicitly — cookies alone never authenticate /api/authoring. The editor
     inserts the returned REFERENCE; section HTML never carries image bytes,
     so the revision ledger stays lean and the device cache stays inside its
     quota. Thrown reasons surface in the editor's own notice bar. */
  const uploadSectionImage = useCallback(async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const token = getAuthToken();
    const res = await fetch('/api/authoring/images', {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    const json = (await res.json().catch(() => null)) as {
      image?: { id?: unknown; url?: unknown };
      error?: unknown;
    } | null;
    if (!res.ok || typeof json?.image?.url !== 'string') {
      // The envelope's error goes through the canonical reader, which drops an
      // enum token or internal text before it reaches the thrown message a toast
      // will show. A hand-rolled `typeof error === 'string'` skips both filters.
      throw new Error(serverMessage(json) ?? `the image store returned HTTP ${res.status}`);
    }
    return { id: String(json.image.id), url: json.image.url };
  }, []);

  /* ── Track changes: the store's own column drives the suggestion engine ──
     The server column is flipped FIRST; the editor enables suggestion capture
     only after the PATCH confirms, so the canvas never claims a mode the
     record does not hold. */
  const toggleTrackChanges = useCallback(
    async (on: boolean) => {
      if (!activeSection) throw new Error('No section open');
      const res = await apiRequest('PATCH', `/api/authoring/sections/${activeSection.id}`, {
        track_changes: on,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        fireToast(
          'Couldn’t change track changes — ' +
            ((json as any)?.error ?? `HTTP ${res.status}`) +
            '. The mode is unchanged.',
          'error'
        );
        throw new Error('track toggle refused');
      }
      setSections(ss => ss.map(s => (s.id === activeSection.id ? { ...s, track_changes: on } : s)));
      fireToast(
        on
          ? 'Track changes on — edits are captured as attributed suggestions until accepted or rejected.'
          : 'Track changes off — edits apply directly. Existing suggestions remain until resolved.'
      );
    },
    [activeSection, fireToast]
  );

  /* ── Comment anchoring hand-off (editor → comments rail → editor) ── */
  const requestAnchoredComment = useCallback((anchor: CommentAnchorPayload) => {
    return new Promise<string | null>(resolve => {
      pendingAnchorRef.current?.resolve(null); // supersede any prior request
      pendingAnchorRef.current = { anchor, resolve };
      setPendingAnchor(anchor);
      setRail('comments');
    });
  }, []);

  const cancelAnchoredComment = useCallback(() => {
    pendingAnchorRef.current?.resolve(null);
    pendingAnchorRef.current = null;
    setPendingAnchor(null);
  }, []);

  /** A click on annotated text in the canvas opens its thread in the rail. */
  const openCommentFromAnchor = useCallback((commentId: string) => {
    setFocusedCommentId(commentId);
    setRail('comments');
  }, []);

  /** Live co-editing rides the server's /collab Hocuspocus socket. Dark by
   *  default: both this client flag AND the server's ENABLE_COLLAB_CRDT must
   *  be on. When the socket is absent the editor reports "editing solo" and
   *  the governed PATCH path is unaffected. */
  const liveCoedit = isFeatureEnabled('ENABLE_LIVE_COEDITING');

  /* ── Revert to a prior revision (server snapshots current first) ── */
  const revert = useCallback(
    async (revId: string) => {
      if (!activeSection) return;
      try {
        const res = await apiRequest('POST', `/api/authoring/sections/${activeSection.id}/revert`, {
          rev_id: revId,
        });
        const json = await res.json().catch(() => null);
        if (res.status === 401) {
          fireToast('Not reverted — your session isn’t authenticated.', 'error');
          return;
        }
        if (!res.ok) {
          fireToast(
            'Couldn’t revert — ' + ((json as any)?.error ?? `HTTP ${res.status}`) + '.',
            'error'
          );
          return;
        }
        const adopted = (json as { section?: AuthSection })?.section;
        const content = adopted?.content ?? '';
        setSections(ss =>
          ss.map(s => (s.id === activeSection.id ? { ...s, ...(adopted ?? {}), content } : s))
        );
        // The server replaced the content out from under the editor — remount
        // the canvas on the new truth rather than leaving a stale buffer.
        setContentEpoch(e => e + 1);
        setEditorDirty(false);
        setExportsEpoch(e => e + 1);
        fireToast('Section reverted to the selected revision.');
        void loadHistory(activeSection.id);
      } catch (e) {
        fireToast(
          'Couldn’t revert — ' + (e instanceof Error ? e.message : String(e)) + '.',
          'error'
        );
      }
    },
    [activeSection, loadHistory, fireToast]
  );

  /* ── Add a comment on the active section ──
     When a text-range anchor is pending (the editor's Comment button), it is
     recorded into the row's `anchor` JSONB and the server-issued comment id is
     resolved back to the editor so the highlight mark can be applied — the row
     is the thread, the mark is the anchor. */
  const addComment = useCallback(async () => {
    if (!activeSection || !activeDocId || !newComment.trim()) return;
    const pending = pendingAnchorRef.current;
    try {
      const res = await apiRequest('POST', `/api/authoring/sections/${activeSection.id}/comment`, {
        body: newComment.trim(),
        doc_id: activeDocId,
        ...(pending ? { anchor: pending.anchor } : {}),
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401) {
        fireToast('Comment not posted — your session isn’t authenticated. Sign in and retry.', 'error');
        return;
      }
      if (!res.ok) {
        fireToast(
          'Couldn’t post the comment — ' + ((json as any)?.error ?? `HTTP ${res.status}`) + '.',
          'error'
        );
        return;
      }
      setNewComment('');
      const created = (json as { comment?: { id?: string } })?.comment;
      if (pending) {
        pending.resolve(typeof created?.id === 'string' ? created.id : null);
        pendingAnchorRef.current = null;
        setPendingAnchor(null);
        fireToast('Comment anchored to the selected text.');
      } else {
        fireToast('Comment added.');
      }
      void loadComments(activeDocId);
    } catch (e) {
      fireToast(
        'Couldn’t post the comment — ' + (e instanceof Error ? e.message : String(e)) + '.',
        'error'
      );
    }
  }, [activeSection, activeDocId, newComment, loadComments, fireToast]);

  /* ── Reply into a comment thread ──
     The write endpoint has accepted `parent_comment_id` and the read has
     returned nested `replies` since the duplicate-route collapse — and the
     rail rendered neither, so every review "thread" was a guestbook: a
     reviewer's question could only be answered by a NEW top-level comment
     above it. One reply box open at a time; the reply posts against the
     THREAD's section (not the section the author happens to have open), and
     nothing local changes until the server confirms. */
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  /* Resolve opens a small confirm with an OPTIONAL reason — the platform's
     reason-for-change convention, kept optional here because resolving a
     comment is not an edit to governed content. Whatever is stated is
     recorded as the thread's resolution_note and shown with the record. */
  const [resolveFor, setResolveFor] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const addReply = useCallback(
    async (parent: AuthComment) => {
      if (!activeDocId || !replyText.trim() || !parent.section_id) return;
      try {
        const res = await apiRequest(
          'POST',
          `/api/authoring/sections/${encodeURIComponent(parent.section_id)}/comment`,
          { body: replyText.trim(), doc_id: activeDocId, parent_comment_id: parent.id }
        );
        const json = await res.json().catch(() => null);
        if (res.status === 401) {
          fireToast('Reply not posted — your session isn’t authenticated. Sign in and retry.', 'error');
          return;
        }
        if (!res.ok) {
          fireToast(
            'Couldn’t post the reply — ' + ((json as any)?.error ?? `HTTP ${res.status}`) + '.',
            'error'
          );
          return;
        }
        setReplyText('');
        setReplyTo(null);
        fireToast('Reply added to the thread.');
        void loadComments(activeDocId);
      } catch (e) {
        fireToast(
          'Couldn’t post the reply — ' + (e instanceof Error ? e.message : String(e)) + '.',
          'error'
        );
      }
    },
    [activeDocId, replyText, loadComments, fireToast]
  );

  /* ── Resolve / reopen a comment thread ──
     PATCH /api/authoring/comments/:id has recorded status changes with resolver
     attribution (JWT actor, resolved_at) since the store shipped — and no
     surface ever called it, so review threads could only accumulate. The row
     is never deleted by this: a resolved comment stays in the record with who
     resolved it; reopen is the honest undo. */
  const setCommentStatus = useCallback(
    async (commentId: string, statusTo: 'resolved' | 'open', note?: string) => {
      if (!activeDocId) return;
      try {
        const res = await apiRequest(
          'PATCH',
          `/api/authoring/comments/${encodeURIComponent(commentId)}`,
          {
            status: statusTo,
            // The server has kept resolution_note since the store shipped; the
            // UI never sent one, so every resolution closed without a stated
            // disposition. Optional — an empty note is not fabricated into one.
            ...(statusTo === 'resolved' && note?.trim() ? { resolution_note: note.trim() } : {}),
          }
        );
        const json = await res.json().catch(() => null);
        if (res.status === 401) {
          fireToast('Not changed — your session isn’t authenticated. Sign in and retry.', 'error');
          return;
        }
        if (!res.ok) {
          fireToast(
            'Couldn’t update the comment — ' +
              ((json as any)?.error ?? `HTTP ${res.status}`) +
              '. Its status is unchanged.',
            'error'
          );
          return;
        }
        fireToast(
          statusTo === 'resolved'
            ? 'Comment resolved — recorded under your name. The thread stays in the record.'
            : 'Comment reopened.'
        );
        void loadComments(activeDocId);
      } catch (e) {
        fireToast(
          'Couldn’t update the comment — ' + (e instanceof Error ? e.message : String(e)) + '.',
          'error'
        );
      }
    },
    [activeDocId, fireToast, loadComments]
  );

  /* ── Rename the open section (code and title) ──
     PATCH /sections/:id has accepted `title` and `code` since the route was
     written; only `content` ever had UI. A mistyped section title was
     permanent unless someone edited the database. Renaming is metadata — the
     server records no content revision for it — and it is held to the same
     honesty contract: awaited, adopted from the server's row, nothing local
     mutated on failure. */
  const [renaming, setRenaming] = useState(false);
  const [renameCode, setRenameCode] = useState('');
  const [renameTitle, setRenameTitle] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  useEffect(() => {
    setRenaming(false);
  }, [activeSectionId]);

  const openRename = useCallback(() => {
    if (!activeSection) return;
    setRenameCode(activeSection.code);
    setRenameTitle(activeSection.title);
    setRenaming(true);
  }, [activeSection]);

  const saveRename = useCallback(async () => {
    if (!activeSection) return;
    const code = renameCode.trim();
    const title = renameTitle.trim();
    if (!code || !title) {
      fireToast('Both the section code and the title are required.', 'error');
      return;
    }
    if (code === activeSection.code && title === activeSection.title) {
      setRenaming(false);
      return;
    }
    setRenameBusy(true);
    try {
      const res = await apiRequest('PATCH', `/api/authoring/sections/${activeSection.id}`, {
        code,
        title,
      });
      const json = await res.json().catch(() => null);
      /* apiRequest THROWS on any non-2xx EXCEPT 401 — which it returns. This
         handler's comment used to say so and then forgot it: a 401 landed here,
         `adopted` was undefined, the CLIENT's code/title were written into the
         section list, and the toast said "Section renamed" over a rename the
         server refused. Section code drives eCTD placement, so the tree and
         the cross-reference resolvers then ran against a code the record did
         not hold. The 401 is handled here, before anything is adopted. */
      if (res.status === 401) {
        fireToast('Not renamed — your session isn’t authenticated. Nothing was changed.', 'error');
        return;
      }
      if (!res.ok) {
        fireToast('Couldn’t rename the section — ' + (serverMessage(json) ?? 'the server refused it') + '. Nothing was changed.', 'error');
        return;
      }
      const adopted = (json as { section?: AuthSection })?.section;
      setSections(ss =>
        ss.map(s => (s.id === activeSection.id ? { ...s, ...(adopted ?? { code, title }) } : s))
      );
      setRenaming(false);
      fireToast(`Section renamed — ${code} · ${title}. Its content and history are unchanged.`);
    } catch (e) {
      const err = e as Partial<ApiRequestError> & { message?: string };
      if (err?.status === 401) {
        fireToast('Not renamed — your session isn’t authenticated.', 'error');
        return;
      }
      /* The code is locked to the filing on a bound document — the server sent
         a complete sentence explaining why, so show it as-is rather than
         wrapping it in a second "couldn't rename" clause. */
      if (err?.code === 'CODE_LOCKED_TO_FILING') {
        fireToast(
          redactInternals(err.message, 'This section’s code cannot be changed on a filed document.'),
          'error',
        );
        return;
      }
      fireToast(
        'Couldn’t rename the section — ' +
          redactInternals(err?.message, 'the server did not accept it') +
          ' Nothing was changed.',
        'error'
      );
    } finally {
      setRenameBusy(false);
    }
  }, [activeSection, renameCode, renameTitle, fireToast]);

  /* ── Move the open section within its document ──
     `order_index` is what the tree AND the export assembler order by, and
     until the reorder endpoint existed nothing could change it — a document
     whose sections were created out of order assembled out of order,
     permanently. The server validates the full permutation and renumbers in
     one transaction; the tree redraws from the canonical GET afterwards,
     never from a local echo. */
  const [reordering, setReordering] = useState(false);
  const moveSection = useCallback(
    async (dir: -1 | 1) => {
      if (!activeDocId || !activeSection || sections.length < 2) return;
      const idx = sections.findIndex(s => s.id === activeSection.id);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= sections.length) return;
      const ids = sections.map(s => s.id);
      [ids[idx], ids[to]] = [ids[to], ids[idx]];
      setReordering(true);
      try {
        const res = await apiRequest(
          'POST',
          `/api/authoring/docs/${encodeURIComponent(activeDocId)}/sections/reorder`,
          { section_ids: ids }
        );
        const json = await res.json().catch(() => null);
        if (res.status === 401) {
          fireToast('Not moved — your session isn’t authenticated.', 'error');
          return;
        }
        if (!res.ok) {
          fireToast(
            'Couldn’t move the section — ' +
              ((json as any)?.error ?? `HTTP ${res.status}`) +
              ' The order is unchanged.',
            'error'
          );
          // A 409 means the section list moved under us — adopt the truth.
          if (res.status === 409) void loadSections(activeDocId);
          return;
        }
        await loadSections(activeDocId);
        fireToast(
          `${activeSection.code} moved ${dir === -1 ? 'up' : 'down'} — the document assembles and exports in this order.`
        );
      } catch (e) {
        fireToast(
          'Couldn’t move the section — ' + (e instanceof Error ? e.message : String(e)) + '.',
          'error'
        );
      } finally {
        setReordering(false);
      }
    },
    [activeDocId, activeSection, sections, fireToast, loadSections]
  );

  /* ── Heuristic section check ──
     The endpoint has existed, worked, and needed no AI provider since it was
     written — and no surface called it. Results describe the SAVED content
     (the handler reads the stored row), so the panel says so when the canvas
     is dirty rather than implying unsaved edits were checked. Cleared on
     section switch: another section's flags must never linger. */
  const [check, setCheck] = useState<ScanResults | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    setCheck(null);
  }, [activeSectionId]);

  const runCheck = useCallback(async () => {
    if (!activeSection) return;
    setChecking(true);
    try {
      const res = await apiRequest(
        'POST',
        `/api/authoring/sections/${activeSection.id}/ai/deficiency-scan`,
        {}
      );
      const json = (await res.json().catch(() => null)) as {
        scan_results?: ScanResults;
        error?: unknown;
      } | null;
      if (!res.ok || !json?.scan_results) {
        fireToast(
          'Couldn’t check the section — ' +
            (serverMessage(json) ?? `HTTP ${res.status}`) +
            '. No result is shown because none was produced.',
          'error'
        );
        return;
      }
      setCheck(json.scan_results);
    } catch (e) {
      fireToast(
        'Couldn’t check the section — ' + (e instanceof Error ? e.message : String(e)) + '.',
        'error'
      );
    } finally {
      setChecking(false);
    }
  }, [activeSection, fireToast]);

  /* ── An accepted AI draft landed ──
     The server replaced the section content AND recorded span-level source
     lineage for it in one transaction, so this mirrors `revert`: adopt the
     returned row as the new truth, remount the canvas on it (a stale editor
     buffer would silently re-save over text that now has citations behind
     it), and refresh the rails the write actually touched — history gained a
     revision, the audit trail gained a row, and sources gained the citations
     that are the whole point of accepting this way rather than saving. */
  const onAiDraftAccepted = useCallback(
    (section: Record<string, unknown>, attribution: AcceptedAttribution | null) => {
      if (!activeSectionId) return;
      const content = typeof section.content === 'string' ? section.content : '';
      setSections(ss =>
        ss.map(x => (x.id === activeSectionId ? { ...x, ...(section as Partial<AuthSection>), content } : x)),
      );
      setContentEpoch(e => e + 1);
      setEditorDirty(false);
      setExportsEpoch(e => e + 1);
      /* The server's own count, not a claim of correctness: how much of the
         saved text is a verified quote from a source, and how much is recorded
         as author-original. Both numbers are the record, so both are said —
         and when the server sent no summary, that is said instead of a zero. */
      fireToast(
        attribution
          ? `Draft accepted and saved. ${attribution.sourceSpans} verified citation(s) across ` +
            `${attribution.distinctSources} source(s); ${attribution.coverage}% of the content is ` +
            'quoted from evidence, the rest recorded as author-original.'
          : 'Draft accepted and saved. The server reported no lineage summary for it — open Sources to see what was recorded.',
      );
      void loadHistory(activeSectionId);
      void loadSources(activeSectionId);
      if (activeDocId) void loadAudit(activeDocId);
    },
    [activeSectionId, activeDocId, loadHistory, loadSources, loadAudit, fireToast],
  );

  /** Post one reviewer action — one decision, or a whole accept/reject-all.
   *
   *  Split by size rather than by caller: a batch of one is a single decision
   *  however it arrived, and a batch of many is one bulk act however it was
   *  produced. Both carry the change TEXT, because accepting a suggestion
   *  strips its mark and the id alone would name something no longer in the
   *  document. */
  const flushDecisions = useCallback(
    async (docId: string, batch: SuggestionDecision[]) => {
      const sectionId = activeSectionIdRef.current ?? undefined;
      const context = (d: SuggestionDecision) => ({
        changeId: d.changeId,
        changeType: d.changeType,
        text: d.text,
        authorId: d.authorId ?? undefined,
        authorName: d.authorName ?? undefined,
        at: d.at ?? undefined,
      });
      const decision = batch[0].decision;
      try {
        const res =
          batch.length === 1
            ? await apiRequest(
                'POST',
                `/api/authoring/documents/${docId}/tracked-change-decisions`,
                { decision, sectionId, ...context(batch[0]) },
              )
            : await apiRequest(
                'POST',
                `/api/authoring/documents/${docId}/tracked-change-decisions/bulk`,
                {
                  decision,
                  changeIds: batch.map(d => d.changeId),
                  changes: batch.map(context),
                  sectionId,
                },
              );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        /* The audit rail gained a row. Refresh it if the reviewer is looking. */
        if (rail === 'audit') void loadAudit(docId);
      } catch (e) {
        /* The decision is already applied to the document — undoing the edit
           because a POST failed would be worse than the missing row. But a
           compliance record that vanishes quietly is not acceptable either, so
           the gap is stated and counted. */
        fireToast(
          `${batch.length === 1 ? 'That decision was' : `${batch.length} decisions were`} applied ` +
            'to the document but NOT recorded on the audit trail — ' +
            (e instanceof Error ? e.message : String(e)) +
            '. The content is still saved on the next save; report the missing record.',
          'error',
        );
      }
    },
    [rail, loadAudit, fireToast],
  );

  /* ── A reviewer decided a tracked change ──
     Posted per decision, accept AND reject. The rejection is the one that has
     had no home in the record: refusing a proposed deletion changes no text,
     writes no revision, and until now left nothing behind saying a reviewer
     considered it.

     Deliberately fire-and-forget with a VISIBLE failure. It must not block the
     editor action the reviewer just took — the decision is already applied to
     the document, and undoing it because a POST failed would be worse than the
     missing row. But a silently-dropped compliance record is not acceptable
     either, so a failure says so and names what was not recorded. */
  const recordTrackedChangeDecision = useCallback(
    (d: SuggestionDecision) => {
      if (!activeDocId) return;
      /* "Accept all" resolves every suggestion in one synchronous loop, so the
         callback fires N times in a single tick. Posting per call would send
         fifty requests for one click. Queue and flush on the microtask so one
         reviewer action becomes one write — the bulk endpoint exists for
         exactly this and records it as the single act it was. */
      pendingDecisionsRef.current.push(d);
      if (decisionFlushRef.current) return;
      decisionFlushRef.current = true;
      queueMicrotask(() => {
        decisionFlushRef.current = false;
        const batch = pendingDecisionsRef.current.splice(0);
        if (batch.length > 0) void flushDecisions(activeDocId, batch);
      });
    },
    [activeDocId, flushDecisions],
  );

  const draftPrompt = activeSection
    ? `Draft ${activeSection.code} ${activeSection.title} from the linked section evidence.`
    : 'Draft this section from the linked section evidence.';

  // What the filing outline was built FROM, in the words the filer sees.
  // Null only when there is no governed document, in which case there is no
  // outline to qualify either.
  const provenance = filing.document
    ? describeRulePackProvenance(filing.document.provenance)
    : null;

  return (
    <div className="ed" ref={rootRef} data-comments={rail != null || undefined}>
      {/* ── Left: document + section tree ── */}
      <aside className="ed-tree">
        <div className="ed-tree-h">
          <div className="ed-tree-t">
            {filing.document ? filing.document.title : 'Document tree'}
          </div>
          <div className="ed-tree-m">
            {filing.document
              ? `${filing.document.doc_type.toUpperCase()} · ${filing.document.agency.toUpperCase()} · ${
                  filing.flat.length
                } sections`
              : docsState === 'ready'
                ? `${docs.length} document${docs.length === 1 ? '' : 's'} · ${status.replace('_', ' ')}`
                : docsState === 'error'
                  ? /* was "0 documents · all", directly above "Couldn't load documents" */
                    `documents not read · ${status.replace('_', ' ')}`
                  : `reading documents… · ${status.replace('_', ' ')}`}
          </div>
          {/* A failed outline read used to degrade this pane, silently, to the
              flat document list — indistinguishable from a project with no
              rule pack. The failure and the wait are now said. */}
          {filing.loading && (
            <div className="scaf-note" style={{ padding: '4px 0' }}>Reading the governed filing outline…</div>
          )}
          {filing.error && (
            <div className="scaf-note" role="alert" style={{ padding: '4px 0' }}>
              The governed filing outline could not be read — what is listed below is the document list, not the filing outline.
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {/* The Module select is gone. It defaulted every filing type to
                "M3" and hid the rest of the dossier behind a dropdown; the
                filing outline below is the navigation now. Status stays — it
                is a view filter, not a definition of the tree. */}
            <select
              className="c2c-input"
              style={{ height: 28, flex: 1 }}
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── What the outline below was built FROM ──
            Until this shipped, a tree transcribed from 21 CFR 814.20(b) and a
            tree constructed by reasoning about a regulation with no enumerated
            annex rendered identically, so a filer could not tell which one
            they were drafting against. The provenance columns recorded the
            difference; this is where it becomes visible. */}
        {provenance && filing.tree.length > 0 && (
          <div className="ed-basis">
            <div className="ed-basis-h">
              <span className="ed-basis-chip" data-tone={provenance.tone}>
                {provenance.headline}
              </span>
              <span className="ed-basis-l">outline basis</span>
            </div>
            <p className="ed-basis-d">{provenance.detail}</p>
          </div>
        )}

        {/* ── The governed filing outline, when this project has one ──
            Derived from (doc_type × agency) via c2c_rule_packs, so a BLA shows
            its 71 nested sections and a 510(k) shows A/B/C/D/E. Nodes bind to
            the authored section that holds the text by code. */}
        {filing.tree.length > 0 && (
          <div
            className="ed-tree-scroll"
            style={{ flex: '0 0 auto', maxHeight: '46%', borderBottom: '1px solid var(--border)' }}
          >
            {filing.flat.map(node => {
              /* `sections` is [] while the read is in flight and after it
                 failed, so every node rendered dimmed, "not started in this
                 document yet", with its "required" chip and a "no draft yet"
                 toast on click — drafting-status claims produced by a read that
                 had not happened. Unread is now its own state. */
              const sectionsUnread = sectionsState !== 'ready';
              const bound = sectionsUnread ? null : findSectionForNode(sections, node.key);
              const isActive = bound != null && bound.id === activeSectionId;
              return (
                <button
                  key={node.key}
                  className="ed-tree-row"
                  data-active={isActive || undefined}
                  style={{ paddingLeft: 10 + node.depth * 12, opacity: bound || sectionsUnread ? 1 : 0.62 }}
                  title={
                    sectionsUnread
                      ? `${node.label} — this document’s sections have not been read yet`
                      : bound
                        ? `${node.label} — open`
                        : `${node.label} — not started in this document yet`
                  }
                  onClick={() => {
                    if (sectionsUnread) {
                      fireToast(
                        sectionsState === 'error'
                          ? 'This document’s sections could not be read, so nothing is known about whether this part is drafted. Retry from the tree.'
                          : 'This document’s sections are still being read.',
                        'error'
                      );
                    } else if (bound) {
                      // The module rides with the navigation: a nav the guard
                      // holds must not move the create/export default to a
                      // section the author never opened.
                      const m = /^(\d)/.exec(node.key)?.[1];
                      requestLeave({
                        kind: 'section',
                        id: bound.id,
                        module: m ? `M${m}` : undefined,
                      });
                    } else {
                      fireToast(
                        `${node.key} ${node.label} — no draft yet in this document.`,
                        'error'
                      );
                    }
                  }}
                >
                  <span className="ed-num">{node.key}</span>
                  <span className="ed-lbl" style={{ fontWeight: node.depth === 0 ? 600 : 400 }}>
                    {node.label}
                  </span>
                  {node.mandatory && !bound && !sectionsUnread && (
                    <span
                      className="rd-chip tone-idle"
                      style={{ marginLeft: 'auto' }}
                      title="Required by the rule pack"
                    >
                      required
                    </span>
                  )}
                  {/* Asked of BOTH stores. node.has_content reads the governed
                      c2c_document_sections; this editor writes authoring_sections,
                      so on its own the dot could never light for anything drafted
                      here. See nodeHasDraft. */}
                  {nodeHasDraft(node, bound) && (
                    <span className="ed-dot" data-s="ok" title={node.status} />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Why there is no outline, said plainly rather than as a blank pane.
            A project with no governed document is usually not a fault: program
            types ivd/device/ide/biologic/anda have no rule pack, and the
            scaffolder skips them deliberately. */}
        {filing.reason === 'no-governed-document' && (
          <div className="scaf-note" style={{ padding: '10px 12px', fontSize: 12 }}>
            This project has no governed filing document, so there is no section outline to show.
            Projects created before scaffolding — and program types with no rule pack — fall here.
          </div>
        )}

        <div className="ed-tree-scroll">
          {docsState === 'loading' ? (
            <div className="scaf-note" style={{ padding: 16 }}>
              Loading documents…
            </div>
          ) : docsState === 'error' ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn’t load documents"
              hint="The document list didn’t respond. Sign in to your tenant and retry."
            />
          ) : docs.length === 0 ? (
            <>
            {/* Was: `No ${status.replace('_',' ')} documents in this project.
                Switch the status filter above.` — which renders "No ALL
                documents in this project" on the default filter, because the
                filter's own value is interpolated into the middle of a
                sentence. It then instructed the reader to change a filter that
                was already showing everything, so following the instruction
                changed nothing.
                The action that actually resolves this is New document. It
                existed, in the toolbar directly above, and could not be reached
                from here — see ../newDocumentAction.ts. */}
            <EmptyState
              icon={I.fileText}
              title={status === 'all' ? 'No documents yet' : `Nothing at this stage`}
              hint={status === 'all'
                ? 'Documents you create in this project appear here.'
                : `This project has no ${status.replace('_', ' ')} documents. Clear the filter to see the rest.`}
              action={status === 'all'
                ? newDocumentAction()
                : { label: 'Show all documents', onAct: () => setStatus('all') }}
            />
            </>
          ) : (
            docs.map(d => {
              const open = d.id === activeDocId;
              return (
                <div key={d.id} className="ed-vol">
                  <button
                    className="ed-tree-row"
                    data-active={open || undefined}
                    onClick={() => requestLeave({ kind: 'document', id: d.id })}
                    style={{ fontWeight: 600 }}
                  >
                    <span className="ed-num">{d.module ?? '—'}</span>
                    <span className="ed-lbl">{d.title}</span>
                    <span className="rd-chip tone-idle" style={{ marginLeft: 'auto' }}>
                      {num(d.section_count)}
                    </span>
                  </button>
                  {open &&
                    (sectionsState === 'loading' ? (
                      <div className="scaf-note" style={{ padding: '6px 12px' }}>
                        Loading sections…
                      </div>
                    ) : sectionsState === 'error' ? (
                      <div
                        className="scaf-note"
                        style={{ padding: '6px 12px', color: 'var(--c2c-err,#b42318)' }}
                      >
                        Couldn’t load sections.
                      </div>
                    ) : sections.length === 0 ? (
                      <div className="scaf-note" style={{ padding: '6px 12px' }}>
                        No sections yet in this document.
                      </div>
                    ) : (
                      <>
                        {/* Document-level structure. Stated where the order is
                            actually read, because that is where it misleads:
                            the tree looks authoritative, and nothing in it
                            shows that two sections share a code or that the
                            order is not the one the dossier assembles in. */}
                        {structure?.duplicateCodes.length ? (
                          <div
                            className="scaf-note"
                            style={{ padding: '6px 12px', color: 'var(--c2c-err,#b42318)' }}
                          >
                            {structure.duplicateCodes.length === 1
                              ? `Section code ${structure.duplicateCodes[0]} is used by more than one section.`
                              : `${structure.duplicateCodes.length} section codes are each used by more than one section: ${structure.duplicateCodes.join(', ')}.`}{' '}
                            A filed dossier cannot say which one a reference means.
                          </div>
                        ) : null}
                        {structure?.outOfOrder ? (
                          <div className="scaf-note" style={{ padding: '6px 12px' }}>
                            These sections are stored in an order that differs from their
                            section codes, and they assemble and export in the stored order.
                            Reorder them if the stored order is not deliberate.
                          </div>
                        ) : null}
                        {sections.map(s => (
                        <button
                          key={s.id}
                          className="ed-tree-row"
                          data-active={activeSectionId === s.id || undefined}
                          onClick={() => requestLeave({ kind: 'section', id: s.id })}
                          style={{ paddingLeft: 22 }}
                        >
                          <span className="ed-num">{s.code}</span>
                          <span className="ed-lbl">{s.title}</span>
                          {num(s.comment_count) > 0 && (
                            <span
                              className="ed-dot"
                              data-s="review"
                              title={`${num(s.comment_count)} comments`}
                            />
                          )}
                        </button>
                        ))}
                      </>
                    ))}
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Center: editable canvas ── */}
      <section className="ed-doc">
        <header className="ed-doc-h">
          <div className="ed-crumbs">
            <span className="sep-first">{activeDoc?.module ?? 'eCTD'}</span>
            <span className="sep" aria-hidden="true">›</span>
            <span className="doc-title" title={activeDoc?.title ?? undefined}>
              {activeDoc?.title ?? 'No document'}
            </span>
            {activeSection && (
              <>
                <span className="sep" aria-hidden="true">›</span>
                <span className="here">{activeSection.code}</span>
              </>
            )}
          </div>
          <div className="ed-doc-actions">
            <AuthoringCreateExport
              docId={activeDoc?.id ?? null}
              docTitle={activeDoc?.title ?? null}
              module={module}
              fireToast={fireToast}
              onDocCreated={d => {
                // Adopt the server's document: refetch the tree and open it.
                // Through the leave guard — creating a document is a deliberate
                // act, but it must not be the thing that discards the paragraph
                // the author had half-written in the section they were in.
                void loadDocs().then(() => requestLeave({ kind: 'document', id: d.id }));
              }}
              onSectionCreated={s => {
                if (activeDocId)
                  void loadSections(activeDocId).then(() =>
                    requestLeave({ kind: 'section', id: s.id })
                  );
              }}
              /* A successful export re-baselines this document, so the Exports
                 rail's "changed since the last export" verdict is now stale. */
              onExported={() => setExportsEpoch(e => e + 1)}
            />
            {/* Section / Document. An author writes a section but SHIPS a
                document, and until now the whole document was never on screen
                at any point in the workflow. */}
            <div className="ed-viewtoggle" role="group" aria-label="Editor view">
              <button
                className="btn ghost"
                style={{ height: 30 }}
                onClick={() => setViewMode('section')}
                data-active={viewMode === 'section' || undefined}
                aria-pressed={viewMode === 'section'}
                title="Edit one section"
              >
                {I.penLine} Section
              </button>
              <button
                className="btn ghost"
                style={{ height: 30 }}
                onClick={() => setViewMode('document')}
                data-active={viewMode === 'document' || undefined}
                aria-pressed={viewMode === 'document'}
                title="Read the whole document"
                disabled={!activeDocId}
              >
                {I.fileText} Document
              </button>
            </div>
            <button
              className="btn ghost"
              style={{ height: 30 }}
              onClick={event => (rail === 'ana' ? closeAna() : openAna(event.currentTarget))}
              data-active={rail === 'ana' || undefined}
            >
              {I.sparkles} AnA{ana.messages.length > 0 ? ' ' + ana.messages.length : ''}
            </button>
            <button
              className="btn ghost"
              style={{ height: 30 }}
              onClick={() => setRail(rail === 'comments' ? null : 'comments')}
              data-active={rail === 'comments' || undefined}
            >
              {I.checkCircle} Comments
              {activeSection && num(activeSection.comment_count) > 0
                ? ' ' + num(activeSection.comment_count)
                : ''}
            </button>
            <button
              className="btn ghost"
              style={{ height: 30 }}
              onClick={() => setRail(rail === 'history' ? null : 'history')}
              data-active={rail === 'history' || undefined}
            >
              {I.clock} History
              {activeSection && num(activeSection.revision_count) > 0
                ? ' ' + num(activeSection.revision_count)
                : ''}
            </button>
            <button
              className="btn ghost"
              style={{ height: 30 }}
              onClick={() => setRail(rail === 'sources' ? null : 'sources')}
              data-active={rail === 'sources' || undefined}
              data-testid="sources-rail-open"
            >
              {I.fileText} Sources
              {activeSection && num(activeSection.citation_count) > 0
                ? ' ' + num(activeSection.citation_count)
                : ''}
            </button>
            {/* §11.50(b): the signature record was stored, exposed by
                GET /docs/:docId/signatures, and read by nothing. The only
                manifestation a signer saw was a toast that fades in 4.2s. */}
            <button
              className="btn ghost"
              style={{ height: 30 }}
              onClick={() => setRail(rail === 'signatures' ? null : 'signatures')}
              data-active={rail === 'signatures' || undefined}
            >
              {I.shieldCheck} Signatures
            </button>
            {/* §11.10(e): the audit trail has been WRITTEN on every governed
                act since the store shipped — and readable by nothing. A
                record that cannot be reviewed satisfies no regulation. */}
            <button
              className="btn ghost"
              style={{ height: 30 }}
              onClick={() => setRail(rail === 'audit' ? null : 'audit')}
              data-active={rail === 'audit' || undefined}
            >
              {I.activity} Audit
            </button>
            {/* Every export writes an authoring_export_history row — actor,
                time, format, and the document's content hash at that moment.
                Three endpoints read that table and none had a caller, so the
                product could hand someone a Word file and never tell them it
                had gone out of date. */}
            <button
              className="btn ghost"
              style={{ height: 30 }}
              onClick={() => setRail(rail === 'exports' ? null : 'exports')}
              data-active={rail === 'exports' || undefined}
              data-testid="exports-rail-open"
            >
              {I.fileDown} Exports
            </button>
            {/* Reason for change, stated once per section and carried on every
                save of it. Inline beside Save rather than a dialog: there is no
                autosave here, but Save and ⌘S each fire many times while
                working through a section, and a modal on each would be the
                friction the regulation does not ask for. */}
            {dirty && !docSealed && (
              <input
                className="de-input"
                style={{ height: 30, width: 260 }}
                value={changeReason}
                onChange={e => setChangeReason(e.target.value)}
                placeholder="Why this changed (required to save)"
                aria-label="Reason for change"
                data-testid="change-reason"
              />
            )}
            <button
              className="btn primary"
              style={{ height: 30 }}
              onClick={() => void editorRef.current?.save()}
              disabled={!dirty || saving || docSealed || !changeReason.trim()}
              title={
                docSealed
                  ? 'This document is frozen — its content cannot be edited.'
                  : dirty && !changeReason.trim()
                    ? 'Say why this section changed — it is recorded with the revision.'
                    : undefined
              }
              data-testid="save-section"
            >
              {I.check} {saving ? 'Saving…' : docSealed ? 'Frozen' : dirty ? 'Save' : 'Saved'}
            </button>
            <button
              className="btn ghost"
              style={{ height: 30 }}
              onClick={() => askAna(draftPrompt)}
              disabled={docSealed}
              title={
                docSealed ? 'This document is frozen — new drafts cannot be inserted.' : undefined
              }
            >
              {I.sparkles} Draft with AnA
            </button>
            {/* Distinct from "Draft with AnA" on purpose, and named for the
                difference: AnA is a conversation whose text you insert as a
                tracked suggestion (author lineage). This retrieves the Data
                Room and accepts through the ONE endpoint that records verified
                span-level source citations alongside the content, in the same
                transaction. Same act, different record — so it gets its own
                control rather than being folded into the other. */}
            <button
              className="btn ghost"
              style={{ height: 30 }}
              onClick={() => {
                /* The panel lives in the section view — document view assembles
                   sections for reading and edits none of them. Toggling open
                   state from here would be a click with no visible effect, so
                   it goes to the section it is about to draft instead. */
                if (viewMode === 'document') {
                  setViewMode('section');
                  setAiDraftOpen(true);
                  return;
                }
                setAiDraftOpen(o => !o);
              }}
              data-active={(aiDraftOpen && viewMode === 'section') || undefined}
              disabled={!activeSection || docSealed}
              data-testid="ai-draft-open"
              title={
                docSealed
                  ? 'This document is frozen — its content cannot be edited.'
                  : 'Draft this section from Data Room evidence and accept it with recorded citations.'
              }
            >
              {I.wand} Draft from sources
            </button>
            {activeDoc && (
              <AuthoringCollab
                documentId={activeDoc.id}
                sectionId={activeSectionId}
                fireToast={fireToast}
              />
            )}
            {activeDoc && (
              <AuthoringFilingBar
                docId={activeDoc.id}
                docTitle={activeDoc.title}
                docStatus={activeDoc.status}
                onChanged={() => {
                  void loadDocs();
                  if (activeDocId) void loadSections(activeDocId);
                }}
                fireToast={fireToast}
              />
            )}
            {/* The authoring → filing seam: place the OPEN document into an
                eCTD sequence of the canonical submission core. Beside the
                freeze/e-sign bar because it is the same family of act — the
                document leaving the editor for the governed record. */}
            {activeDoc && (
              <AuthoringPlaceIntoFiling
                docId={activeDoc.id}
                docTitle={activeDoc.title}
                activeSectionCode={activeSection?.code ?? null}
                dirty={dirty}
                onNav={onNav}
                fireToast={fireToast}
              />
            )}
          </div>
        </header>

        {/* ── The deep-link's honest miss ──
            A workbench click named a section this canvas could not open. The
            DEFAULT view renders underneath — stated, dismissible, and never a
            silently-wrong document. */}
        {targetNotice && (
          <div
            className="scaf-note"
            role="status"
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'baseline',
              padding: '8px 16px',
              fontSize: 12,
              borderBottom: '1px solid var(--c2c-line,#e4e7ec)',
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>{targetNotice}</span>
            <button className="nda-open" onClick={() => setTargetNotice(null)}>
              Dismiss
            </button>
          </div>
        )}

        <div className="ed-doc-scroll" ref={docScrollRef}>
          <div className="ed-doc-inner">
            {viewMode === 'document' && activeDoc ? (
              /* The whole document, in order, as one read. Sections are shown,
                 not edited: editing is section-scoped because a revision, a
                 signature and a lock are all section-scoped, and a view that
                 let you type across all of them would be lying about what a
                 save records. Click a section to go and edit it. */
              <div className="ed-full" aria-label={`${activeDoc.title} — full document`}>
                <div className="ed-full-mast">
                  <div className="ed-mast-num">{activeDoc.module}</div>
                  <h1 className="ed-mast-t">{activeDoc.title}</h1>
                  <div className="ed-mast-meta">
                    {/* "0 sections" printed over a failed or in-flight read,
                        directly above a body that said the read failed. */}
                    {sectionsState === 'ready'
                      ? `${sections.length} section${sections.length === 1 ? '' : 's'}`
                      : sectionsState === 'error'
                        ? 'sections not read'
                        : 'reading sections…'}
                    {docSealed ? ' · frozen' : ''}
                  </div>
                </div>
                {sectionsState === 'error' ? (
                  <EmptyState
                    tone="error"
                    icon={I.alertTriangle}
                    title="Couldn’t read this document’s sections"
                    hint="The document is not empty — the read failed. Retry from the tree."
                  />
                ) : sectionsState !== 'ready' ? (
                  /* Every document open, and every reorder, passes through
                     'loading' — and this pane said "This document has no
                     sections yet" for the whole of it. The tree pane had the
                     loading branch; the assembled document, the thing a
                     reviewer receives, did not. */
                  <EmptyState icon={I.fileText} title="Reading this document’s sections…" busy />
                ) : sections.length === 0 ? (
                  <EmptyState
                    icon={I.fileText}
                    title="This document has no sections yet"
                    hint="Add a section to begin drafting."
                  />
                ) : (
                  sections.map(sec => {
                    const html = (sec.content ?? '').trim();
                    return (
                      <section
                        key={sec.id}
                        className="ed-full-sec"
                        data-active={sec.id === activeSectionId || undefined}
                        aria-label={`${sec.code} ${sec.title}`}
                      >
                        <div className="ed-full-sec-h">
                          <span className="ed-full-sec-num">{sec.code}</span>
                          <h2 className="ed-full-sec-t">{sec.title}</h2>
                          <button
                            className="btn ghost ed-full-edit"
                            style={{ height: 26 }}
                            onClick={() => {
                              setViewMode('section');
                              requestLeave({ kind: 'section', id: sec.id });
                            }}
                          >
                            {I.penLine} Edit
                          </button>
                        </div>
                        {html ? (
                          /* AuthoredHtml, not sanitizeChatHtml: the chat
                             allowlist strips figures, so the assembled read
                             showed a DIFFERENT document from the canvas when
                             a section carried one. Same audited sanitiser
                             module, authoring variant, auth-resolved refs. */
                          <AuthoredHtml className="ed-full-sec-body" html={html} />
                        ) : (
                          /* Not "empty" as a finding — nothing has been written
                             here yet, and the document view says which. */
                          <p className="ed-full-sec-empty">Not drafted yet.</p>
                        )}
                      </section>
                    );
                  })
                )}
              </div>
            ) : !activeSection ? (
              <div style={{ paddingTop: 48 }}>
                {/* THE OTHER HALF OF THE CIRCLE. This said "Choose a document
                    from the tree" while the tree said "no documents — switch
                    the filter". Two empty states pointing at each other, on a
                    project where the honest answer is that nothing has been
                    created yet, next to a New document button neither of them
                    offered. When there are no documents at all this now offers
                    the action; when there IS a document open, "choose a
                    section" is genuinely correct — the tree beside it is full. */}
                <EmptyState
                  icon={I.fileText}
                  title={activeDoc ? 'Select a section to edit' : docs.length === 0 ? 'Nothing to edit yet' : 'Select a document'}
                  hint={activeDoc
                    ? 'Choose a section from the tree to open its content in the editor. Every save records an auditable revision.'
                    : docs.length === 0
                      ? 'Create the first document for this project and its sections open here.'
                      : 'Choose a document from the tree to open its sections.'}
                  action={!activeDoc && docs.length === 0 ? newDocumentAction() : undefined}
                  regulation={!activeDoc && docs.length === 0
                    ? 'Every save records an auditable revision (21 CFR Part 11)'
                    : undefined}
                />
              </div>
            ) : (
              <>
                <div className="ed-mast">
                  {renaming ? (
                    <div
                      role="group"
                      aria-label={`Rename section ${activeSection.code}`}
                      style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setRenaming(false);
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          void saveRename();
                        }
                      }}
                    >
                      <input
                        className="c2c-input"
                        style={{ width: 110, height: 30 }}
                        aria-label="Section code"
                        value={renameCode}
                        autoFocus
                        onChange={e => setRenameCode(e.target.value)}
                      />
                      <input
                        className="c2c-input"
                        style={{ flex: 1, minWidth: 200, height: 30 }}
                        aria-label="Section title"
                        value={renameTitle}
                        onChange={e => setRenameTitle(e.target.value)}
                      />
                      <button
                        className="btn primary"
                        style={{ height: 30 }}
                        disabled={renameBusy || !renameCode.trim() || !renameTitle.trim()}
                        onClick={() => void saveRename()}
                      >
                        {renameBusy ? 'Renaming…' : 'Rename'}
                      </button>
                      <button
                        className="btn ghost"
                        style={{ height: 30 }}
                        disabled={renameBusy}
                        onClick={() => setRenaming(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="ed-mast-num">{activeSection.code}</div>
                      <h1 className="ed-mast-t" style={{ display: 'inline' }}>
                        {activeSection.title}
                      </h1>
                      {!docSealed && (
                        <button
                          className="nda-open"
                          style={{ marginLeft: 8, verticalAlign: 'middle' }}
                          title="Rename this section's code and title — its content and history are unchanged"
                          onClick={openRename}
                        >
                          {I.penLine} Rename
                        </button>
                      )}
                      {!docSealed &&
                        sections.length > 1 &&
                        (() => {
                          const idx = sections.findIndex(s => s.id === activeSection.id);
                          return (
                            <span style={{ marginLeft: 4, verticalAlign: 'middle' }}>
                              <button
                                className="nda-open"
                                disabled={reordering || idx <= 0}
                                title="Move this section up — the document assembles and exports in tree order"
                                aria-label={`Move ${activeSection.code} up`}
                                onClick={() => void moveSection(-1)}
                              >
                                {I.arrowUp}
                              </button>
                              <button
                                className="nda-open"
                                disabled={reordering || idx >= sections.length - 1}
                                title="Move this section down"
                                aria-label={`Move ${activeSection.code} down`}
                                onClick={() => void moveSection(1)}
                              >
                                {I.arrowDown}
                              </button>
                            </span>
                          );
                        })()}
                      <button
                        className="nda-open"
                        style={{ marginLeft: 4, verticalAlign: 'middle' }}
                        disabled={checking}
                        title="Mechanical checks over the saved section — length, module keywords, CTD elements, tables, placeholders, structure. Heuristic signals, not a compliance determination."
                        onClick={() => void runCheck()}
                      >
                        {I.checkCircle} {checking ? 'Checking…' : 'Check'}
                      </button>
                    </>
                  )}
                  <div className="ed-mast-meta">
                    {activeDoc?.title ?? ''}
                    {num(activeSection.revision_count) > 0
                      ? ` · ${num(activeSection.revision_count)} revisions`
                      : ''}
                    {num(activeSection.citation_count) > 0
                      ? ` · ${num(activeSection.citation_count)} citations`
                      : ''}
                    {/* "unsaved changes" alone reads as "the app will get to
                        it". It will not — nothing on this surface leaves the
                        device until the author saves, because a save here mints
                        a Part 11 revision. Say which of the two it is. */}
                    {dirty
                      ? ' · unsaved changes — on this device only'
                      : activeSection.updated_at
                      ? ` · saved ${relTime(activeSection.updated_at)}`
                      : ''}
                  </div>
                </div>
                {/* ── Heuristic check results ──
                    Framed exactly as the server frames them: mechanical
                    signals over the SAVED content. Zero flags is reported as
                    "passed N of M mechanical checks", never as "compliant" — and
                    N and M come from the server's own count, so the sentence
                    cannot drift from the checks the code actually runs. */}
                {check && check.section_id === activeSection.id && (
                  <div
                    className="scaf-note"
                    role="status"
                    style={{ marginBottom: 12, display: 'grid', gap: 6 }}
                    data-testid="section-check"
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <b style={{ fontSize: 12 }}>
                        Section check — heuristic signals, not a compliance determination
                      </b>
                      <span style={{ flex: 1 }} />
                      {dirty && (
                        <span style={{ fontSize: 11, color: 'var(--warning,#b54708)' }}>
                          checked the last saved content — unsaved edits are not in it
                        </span>
                      )}
                      <button className="nda-open" onClick={() => setCheck(null)}>
                        Dismiss
                      </button>
                    </div>
                    {check.deficiencies.length === 0 ? (
                      <span style={{ fontSize: 12 }}>
                        {typeof check.checks_run === 'number' && check.checks_run > 0
                          ? `No flags. The section passed all ${check.checks_run} mechanical checks `
                          : 'No flags. The section passed the mechanical checks '}
                        (length, module keywords, CTD elements where defined, tables,
                        placeholders, structure) — this is not a review.
                      </span>
                    ) : (
                      [...check.deficiencies]
                        .sort(
                          (a, b) =>
                            (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
                        )
                        .map((d, i) => (
                          <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                            <span
                              className={
                                d.severity === 'high'
                                  ? 'sp-tone-warn'
                                  : d.severity === 'medium'
                                    ? 'sp-tone-warn'
                                    : undefined
                              }
                              style={{
                                flexShrink: 0,
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                fontSize: 10,
                                paddingTop: 2,
                                ...(d.severity === 'high' ? { color: 'var(--c2c-err,#b42318)' } : {}),
                              }}
                            >
                              {d.severity}
                            </span>
                            <span style={{ minWidth: 0 }}>
                              {d.message}
                              {d.recommendation && (
                                <span style={{ opacity: 0.75 }}> — {d.recommendation}</span>
                              )}
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                )}
                {docSealed && (
                  <div className="scaf-note" role="status" style={{ marginBottom: 12 }}>
                    {I.lock}{' '}
                    {String(activeDoc?.status).toUpperCase() === 'APPROVED'
                      ? 'This document has been approved and frozen. Its content is part of the signed record and cannot be edited.'
                      : 'This document is frozen. Its content is sealed under a content hash and cannot be edited.'}{' '}
                    Create a new version to make further changes.
                  </div>
                )}
                {/* Above the canvas, at reading width: the accept decision is
                    made by reading a full section of regulatory prose, which
                    is not a thing the 300px rail can carry. Keyed to the
                    section so switching sections rebuilds it empty — the
                    panel's own effect discards the draft, and the key makes
                    that structural rather than dependent on effect ordering. */}
                {aiDraftOpen && !docSealed && (
                  <AuthoringAiDraft
                    key={activeSection.id}
                    sectionId={activeSection.id}
                    sectionCode={activeSection.code}
                    sectionTitle={activeSection.title}
                    docSealed={docSealed}
                    editorDirty={dirty}
                    onAccepted={onAiDraftAccepted}
                    onClose={() => setAiDraftOpen(false)}
                    fireToast={fireToast}
                  />
                )}
                <div
                  style={{
                    minHeight: 460,
                    border: '1px solid var(--c2c-line,#e4e7ec)',
                    borderRadius: 10,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <RichSectionEditor
                    /* contentEpoch remounts the canvas when the server
                       replaces content out from under it (revert). */
                    key={activeSection.id + ':' + contentEpoch}
                    ref={editorRef}
                    value={activeSection.content ?? ''}
                    format="html"
                    onSave={saveSectionContent}
                    /* ── Why there is no timed autosave here ──────────────
                       RichSectionEditor supports one, and the MDX dossier
                       drawer uses it (600ms). This surface must not.

                       `saveSectionContent` PATCHes /api/authoring/sections/:id,
                       and that handler is not a content write — it is a
                       governed transaction. In one BEGIN/COMMIT it appends a
                       `doc_revisions` row to a per-section hash chain whose
                       UPDATE/DELETE the database refuses outright, records the
                       Part 11 audit row (before/after with a SHA-256 of each
                       side, actor, IP, session), asserts author lineage per
                       clause, and commits the working copy into `c2c_documents`
                       — the filing itself.

                       A debounce against that would append a chain link per
                       typing pause, so a section's history would read as
                       hundreds of "edits" by one author within a minute, none
                       of them an act that author performed; and half-typed
                       sentences would be committed into the filing between
                       them. Under §11.10(e) a record entry has to be traceable
                       to a deliberate, attributable act. A debounce timer is
                       not one.

                       Coalescing into an open revision instead (updating the
                       latest row within a time window) is not available and
                       should not be: the ledger's immutability trigger refuses
                       UPDATE by engine rule, and `…/history/verify` recomputes
                       the whole chain — a revision that could be rewritten
                       after the fact is the thing that check exists to prove
                       impossible.

                       So continuous protection is provided WITHOUT a server
                       write: the editor caches every keystroke to
                       `dc::<sectionId>` on this device and offers it back
                       explicitly on return, arms the browser's discard prompt
                       while dirty, and this surface holds any navigation that
                       would unmount unsaved work (see `requestLeave`). The
                       author saves; the ledger records authors, not timers. */
                    autosaveMs={null}
                    showSaveButton={false}
                    onDirtyChange={setEditorDirty}
                    readOnly={docSealed}
                    placeholder="Write the section content here. Cmd/Ctrl-S saves and records a revision."
                    storageKey={activeSection.id}
                    ariaLabel={`Section ${activeSection.code} — ${activeSection.title}`}
                    onAsk={askAna}
                    /* The text this section's lineage was recorded against —
                       the last SAVED content, not the in-flight draft. With
                       it, "Data Origins" refuses to answer once the canvas
                       has drifted from what lineage describes, rather than
                       reporting the provenance of the wrong words. */
                    lineage={{
                      documentTable: 'authoring_sections',
                      documentId: activeSection.id,
                      documentTitle: activeSection.title,
                      canonicalText: activeSection.content ?? '',
                    }}
                    track={{
                      enabled: !!activeSection.track_changes,
                      author: {
                        id: user?.email ?? 'unknown',
                        name: user?.displayName || user?.email || 'Unknown author',
                      },
                      onToggle: toggleTrackChanges,
                      onResolve: recordTrackedChangeDecision,
                    }}
                    commentsApi={{
                      onCreate: requestAnchoredComment,
                      onOpen: openCommentFromAnchor,
                    }}
                    imagesApi={{ upload: uploadSectionImage }}
                    /* The document's own sections, as they stand right now.
                       A cross-reference stores the target's id and resolves its
                       number and title from this list, so renumbering or
                       retitling a section corrects every reference to it in
                       place — no referring section is edited, and no revision
                       is minted for a change nobody made to its words. The
                       same list the export resolves against server-side, so
                       the canvas and the filed document say the same thing. */
                    crossRefsApi={{
                      sections: sections.map(s => ({
                        id: s.id,
                        code: s.code,
                        title: s.title,
                      })),
                      /* And the document's captioned tables and figures, which
                         are cross-reference targets exactly as sections are —
                         "Table 3" is a rendering of where a table currently
                         sits, so a reference to one stores its identity and
                         resolves its number from this ordering. Split at the
                         open section because the number is positional. */
                      captionsBefore: captionsAround.before,
                      captionsAfter: captionsAround.after,
                    }}
                    /* The governed sources this document can cite, and the
                       numbering already used above this section. A citation
                       stores the source's id and derives its number from
                       position, so inserting one earlier renumbers the rest
                       with no section's stored content touched. Inserting one
                       also records the section→source link the Sources rail
                       and the change report already read, so the prose and the
                       recorded lineage cannot drift apart. */
                    citationsApi={{
                      sources: citationLibrary,
                      precedingSourceIds,
                      onCite: (sourceId: string) => {
                        /* Only when the link is not already recorded: citing
                           the same source a second time in the prose is not a
                           new fact about this section's lineage, and re-posting
                           it would announce a record that did not change. */
                        const already = sources.some(
                          s => s.source && String(s.source.id) === sourceId
                        );
                        const numeric = Number(sourceId);
                        if (!already && Number.isInteger(numeric) && numeric > 0) {
                          void citeSource(numeric);
                        }
                      },
                    }}
                    collab={
                      liveCoedit && activeDoc
                        ? {
                            docName: `authoring:${activeDoc.id}:${activeSection.id}`,
                            token: getAuthToken(),
                          }
                        : null
                    }
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Right: AnA — this surface's own conversation ──
          The editor holds the AnA rail's column (see the header note), so this
          is where an ask on this surface is answered. Real streamed turns from
          /api/ana-ri/stream grounded on the open document and section; nothing
          is composed locally, and a governed command renders its real §11.50
          sign-off here rather than in a rail this screen does not draw. */}
      {rail === 'ana' && (
        <aside className="ed-comments" aria-label="AnA — document authoring">
          <div className="ed-comments-h ed-comments-h-row">
            <span>
              AnA
              {activeSection
                ? ` · ${activeSection.code}`
                : activeDoc
                ? ` · ${activeDoc.title}`
                : ''}
            </span>
            <button
              type="button"
              className="ed-comments-close"
              aria-label="Close AnA panel"
              title="Close AnA panel"
              onClick={closeAna}
            >
              {I.close}
            </button>
          </div>
          <div
            ref={anaScrollRef}
            role="log"
            aria-label="AnA conversation"
            aria-live="polite"
            aria-relevant="additions text"
            aria-busy={ana.isStreaming}
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '10px 12px',
              display: 'grid',
              gap: 12,
              alignContent: 'start',
            }}
          >
            {ana.messages.length === 0 ? (
              <EmptyState
                icon={I.sparkles}
                title="Ask AnA about this section"
                hint={
                  activeSection
                    ? `Draft, tighten or cite ${activeSection.code}. AnA answers here, grounded on the saved document — it proposes; you accept and save, and every save records an auditable revision.`
                    : 'Select a section, then ask AnA to draft, tighten or cite it. AnA answers here, grounded on the saved document.'
                }
              />
            ) : (
              ana.messages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className="cmt">
                    <div className="cmt-meta">
                      <b>You</b>
                    </div>
                    <div className="cmt-body">{m.text}</div>
                  </div>
                ) : (
                  <div key={i} className="cmt">
                    <div className="cmt-meta">
                      <b>AnA</b>
                    </div>
                    {/* Until the first token lands the server's status phase
                        stands in — never an invented sentence. The phase is a
                        server-authored label, not a document, so it is not put
                        through the markdown path. */}
                    {m.text ? (
                      <AnaMarkdown text={m.text} />
                    ) : (
                      <div className="cmt-body">
                        {m.streaming ? m.statusPhase || 'Thinking…' : ''}
                      </div>
                    )}
                    <AnaActivity message={m} onSuggestedAction={askAna} />
                    {/* AI output enters the record ONLY as an attributed
                        in-text suggestion — struck-in green, pending until a
                        human accepts or rejects each edit in the canvas.
                        Never as settled text. */}
                    {!m.streaming && m.text && activeSection && (
                      <div style={{ marginTop: 6 }}>
                        <button
                          className="nda-open"
                          onClick={() => {
                            const ok = editorRef.current?.insertSuggestion(m.text, {
                              id: 'ana',
                              name: 'AnA (AI draft)',
                            });
                            if (ok) {
                              fireToast(
                                'Draft inserted as tracked suggestions — review each edit in the canvas, then save.'
                              );
                            } else {
                              fireToast(
                                'Couldn’t insert — the canvas is not editable right now.',
                                'error'
                              );
                            }
                          }}
                        >
                          {I.penLine} Insert into {activeSection.code} as tracked suggestion
                        </button>
                      </div>
                    )}
                    {Array.isArray(m.executedActions) && m.executedActions.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {m.executedActions.map((a, ai) => (
                          <span key={ai} className="rd-chip tone-ok" title={a.error || a.label}>
                            {a.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {Array.isArray(m.pendingSignoffs) && m.pendingSignoffs.length > 0 && (
                      <AuthoringSignoffs signoffs={m.pendingSignoffs} />
                    )}
                  </div>
                )
              )
            )}
          </div>
          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--c2c-line,#e4e7ec)' }}>
            <textarea
              className="c2c-input"
              ref={anaComposerRef}
              aria-label={activeSection ? `Ask AnA about ${activeSection.code}` : 'Ask AnA'}
              value={anaDraft}
              onChange={e => setAnaDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const t = anaDraft.trim();
                  if (!t || ana.isStreaming) return;
                  setAnaDraft('');
                  askAna(t);
                }
              }}
              placeholder={activeSection ? `Ask about ${activeSection.code}…` : 'Ask AnA…'}
              style={{ width: '100%', minHeight: 56, resize: 'vertical', fontSize: 13 }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                marginTop: 6,
              }}
            >
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                {I.lock} AnA proposes; you accept and save.
              </span>
              <button
                className="btn primary"
                style={{ height: 28 }}
                disabled={!anaDraft.trim() || ana.isStreaming}
                onClick={() => {
                  const t = anaDraft.trim();
                  if (!t) return;
                  setAnaDraft('');
                  askAna(t);
                }}
              >
                {ana.isStreaming ? 'Answering…' : 'Send'}
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* ── Right: history / comments rail ── */}
      {rail === 'history' && (
        <aside className="ed-comments">
          <div className="ed-comments-h">Revision history</div>
          {/* ── The ledger: history as a checkable fact ──
              Every revision is a link in a hash chain the database refuses to
              edit; this control recomputes the whole chain from stored content
              and reports exactly what it found. */}
          {activeSection && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                gap: 8,
                padding: '0 2px',
                fontSize: 11.5,
              }}
            >
              <button
                className="nda-open"
                onClick={() => void verifyLedger(activeSection.id)}
                disabled={ledger === 'checking'}
              >
                {I.shieldCheck} {ledger === 'checking' ? 'Recomputing ledger…' : 'Verify ledger'}
              </button>
              {ledger === 'error' && (
                <span style={{ color: 'var(--c2c-err,#b42318)' }}>
                  Couldn’t recompute the ledger — this is a failed check, not a verdict about the
                  record.
                </span>
              )}
              {ledger != null &&
                ledger !== 'error' &&
                ledger !== 'checking' &&
                (ledger.intact ? (
                  <span className="sp-tone-ok">
                    Ledger intact — {ledger.chainedCount} chained revision
                    {ledger.chainedCount === 1 ? '' : 's'} recomputed and verified
                    {ledger.preLedgerCount > 0 ? `; ${ledger.preLedgerCount} pre-ledger` : ''}.
                  </span>
                ) : (
                  <span style={{ color: 'var(--c2c-err,#b42318)', fontWeight: 600 }}>
                    Ledger BROKEN at {ledger.breaks.length} point
                    {ledger.breaks.length === 1 ? '' : 's'} —{' '}
                    {ledger.breaks.map(b => b.reason).join(', ')}. The history has been altered or
                    forked; treat this section’s record as disputed.
                  </span>
                ))}
            </div>
          )}
          {!activeSection ? (
            <EmptyState
              icon={I.clock}
              title="No section selected"
              hint="Select a section to see its revision history."
            />
          ) : revisionsState === 'error' ? (
            <EmptyState
              icon={I.alertTriangle}
              title="Revision history unavailable"
              hint="The history could not be loaded. This is a failure to read the record — it does not mean the section has no revisions."
            />
          ) : revisionsState === 'loading' ? (
            <EmptyState icon={I.clock} title="Reading revision history…" busy />
          ) : revisions.length === 0 ? (
            <EmptyState
              icon={I.clock}
              title="No prior revisions"
              hint="Each save records the new content here under its author, so you can compare and revert."
            />
          ) : (
            revisions.map((r, i) => (
              <div key={r.id} className="cmt">
                <div className="cmt-meta">
                  <span className="cmt-av">
                    {(r.created_by_name ?? '·')
                      .split(' ')
                      .map(x => x[0])
                      .join('')
                      .slice(0, 2)}
                  </span>
                  <b>{r.created_by_name ?? r.created_by_email ?? 'Unknown author'}</b>
                  {/* Which write path produced this state — the input's kind,
                      from the ledger, never inferred. */}
                  {r.origin && (
                    <span className="cmt-role">{REVISION_ORIGIN_LABELS[r.origin] ?? r.origin}</span>
                  )}
                  <span className="cmt-when">· {relTime(r.created_at)}</span>
                  {r.chain_sha256 && (
                    <span
                      className="cmt-when"
                      style={{ fontFamily: 'var(--font-mono, monospace)' }}
                      title={`Ledger link ${r.chain_sha256}`}
                    >
                      · {r.chain_sha256.slice(0, 8)}
                    </span>
                  )}
                  <button
                    className="nda-open"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => revert(r.id)}
                  >
                    {I.rotateCcw} Revert
                  </button>
                </div>
                <div
                  className="cmt-body"
                  style={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'hidden' }}
                >
                  {(r.content ?? '').slice(0, 400) || <span style={{ opacity: 0.6 }}>(empty)</span>}
                </div>
                {/* The word-level redline against the revision before this
                    one (the list is newest-first, so that is the next row).
                    Computed from the two stored contents already loaded —
                    nothing fetched, nothing inferred. */}
                <AuthoringRevisionDiff
                  current={r.content ?? ''}
                  previous={revisions[i + 1]?.content ?? ''}
                />
              </div>
            ))
          )}
        </aside>
      )}

      {/* ── Right: what this section is drafted from ──
          The source context that had to be held in the author's head. Every row
          is a citation someone recorded, with its standing against the source's
          content today computed server-side from stored checksums — nothing here
          is inferred from the draft text. */}
      {rail === 'signatures' && (
        <aside className="ed-comments">
          <div className="ed-comments-h">Electronic signatures</div>
          <AuthoringSignatures docId={activeDocId} />
        </aside>
      )}

      {/* ── Right: what left this document, and whether it is still current ──
          Two drifts, reported separately because they answer different
          questions: the section text against the last export's content hash,
          and the citations added since that export. A single "out of date"
          badge would have merged them. */}
      {rail === 'exports' && (
        <aside className="ed-comments">
          <div className="ed-comments-h">Exports{activeDoc ? ` · ${activeDoc.title}` : ''}</div>
          <AuthoringExports docId={activeDocId} refreshKey={exportsEpoch} />
        </aside>
      )}

      {/* ── Right: the document's Part 11 audit trail ──
          Every row is a governed act the SERVER recorded — actor and role
          from the verified JWT, operation, reason, and the content hashes on
          either side of the change. Nothing here is composed client-side. */}
      {rail === 'audit' && (
        <aside className="ed-comments">
          <div className="ed-comments-h ed-comments-h-row">
            <span>Audit trail{activeDoc ? ` · ${activeDoc.title}` : ''}</span>
            <button
              type="button"
              className="nda-open"
              onClick={() => activeDocId && void loadAudit(activeDocId)}
              disabled={!activeDocId || auditState === 'loading'}
            >
              {auditState === 'loading' ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {!activeDocId ? (
            <EmptyState
              icon={I.activity}
              title="No document selected"
              hint="Select a document to review its audit trail."
            />
          ) : auditState === 'error' ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn’t load the audit trail"
              hint="The read failed. This is a failure to READ the record — it does not mean no governed acts occurred. Retry, or check the service is reachable."
            />
          ) : auditState === 'loading' && auditEvents.length === 0 ? (
            <div className="scaf-note" style={{ padding: 12 }}>
              Loading the audit trail…
            </div>
          ) : auditEvents.length === 0 ? (
            <EmptyState
              icon={I.activity}
              title="No audit events yet"
              hint="Governed acts on this document — saves, reverts, reorders, freezes, signatures, exports — are recorded here by the server as they happen."
            />
          ) : (
            auditEvents.map(ev => {
              const section = ev.section_id
                ? sections.find(s => s.id === ev.section_id) ?? null
                : null;
              return (
                <div key={ev.id} className="cmt">
                  <div className="cmt-meta">
                    <span className="cmt-av">
                      {(ev.actor ?? '·')
                        .split(/[@\s.]/)
                        .filter(Boolean)
                        .map(x => x[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <b
                      style={{
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ev.actor ?? 'Unknown actor'}
                    </b>
                    {ev.actor_role && <span className="cmt-role">{ev.actor_role}</span>}
                    <span className="cmt-when">· {relTime(ev.created_at)}</span>
                  </div>
                  <div className="cmt-body" style={{ display: 'grid', gap: 3 }}>
                    <span>
                      {auditEventLabel(ev.event_type)}
                      {section && (
                        <>
                          {' — '}
                          <button
                            className="nda-open"
                            title={`Open ${section.code} ${section.title}`}
                            onClick={() => requestLeave({ kind: 'section', id: section.id })}
                          >
                            §{section.code}
                          </button>
                        </>
                      )}
                    </span>
                    {/* The metadata the endpoint has always returned and no
                        surface read — the redline a reviewer refused, the model
                        that produced an accepted draft. */}
                    {(() => {
                      const detail = describeAuditMetadata(ev.event_type, ev.metadata);
                      return detail ? (
                        <span
                          style={{ fontSize: 12, opacity: 0.85 }}
                          data-testid="audit-metadata"
                        >
                          {detail}
                        </span>
                      ) : null;
                    })()}
                    {ev.change_reason && (
                      <span style={{ fontSize: 12, opacity: 0.85 }}>{ev.change_reason}</span>
                    )}
                    {(ev.content_hash_before || ev.content_hash_after) && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono, monospace)',
                          fontSize: 10.5,
                          opacity: 0.7,
                        }}
                        title={`Content hash before: ${ev.content_hash_before ?? '—'}\nContent hash after: ${ev.content_hash_after ?? '—'}`}
                      >
                        {(ev.content_hash_before ?? '—').slice(0, 8)} →{' '}
                        {(ev.content_hash_after ?? '—').slice(0, 8)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </aside>
      )}

      {rail === 'sources' && (
        <aside className="ed-comments">
          <div className="ed-comments-h ed-comments-h-row">
            <span>Drafted from</span>
            {/* Document-wide, not section-wide, because the question before an
                export or a sign-off is "has anything I cite moved?" across the
                whole document — not one claim at a time. */}
            <button
              className="nda-open"
              onClick={() => void refreshAllSources()}
              disabled={!activeDocId || refreshingAll}
              data-testid="refresh-all-sources"
              title="Re-read every unfrozen citation in this document against its stored source. Frozen citations are left alone."
            >
              {refreshingAll ? 'Re-reading…' : 'Re-read all'}
            </button>
          </div>
          {/* The findings from the last document-wide re-read. Kept on the rail
              rather than in a toast: a citation whose source is gone is the
              thing the person about to file this needs to see, and it must not
              fade after four seconds. */}
          {skippedRefreshes.length > 0 && (
            <div
              className="scaf-note"
              role="alert"
              data-testid="refresh-skipped"
              style={{ margin: 12, fontSize: 12, borderLeftColor: 'var(--c2c-err,#b42318)' }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <b>
                  {skippedRefreshes.length} citation
                  {skippedRefreshes.length === 1 ? '' : 's'} could not be re-read
                </b>
                <span style={{ flex: 1 }} />
                <button className="nda-open" onClick={() => setSkippedRefreshes([])}>
                  Dismiss
                </button>
              </div>
              {skippedRefreshes.slice(0, 8).map(sk => (
                <div key={sk.cite_id} style={{ marginTop: 4 }}>
                  {sk.reason}
                </div>
              ))}
              {skippedRefreshes.length > 8 && (
                <div style={{ marginTop: 4, opacity: 0.75 }}>
                  and {skippedRefreshes.length - 8} more.
                </div>
              )}
            </div>
          )}
          {!activeSection ? (
            <EmptyState
              icon={I.fileText}
              title="No section selected"
              hint="Select a section to see the sources it is drafted from."
            />
          ) : sourcesState === 'loading' ? (
            <div className="scaf-note" style={{ padding: 12 }}>
              Loading this section’s sources…
            </div>
          ) : sourcesState === 'error' ? (
            <EmptyState
              icon={I.alertTriangle}
              title="Couldn’t load this section’s sources"
              hint="The read failed, so nothing is shown — this is not the same as the section citing nothing. Sign in and retry, or check the service is reachable."
            />
          ) : (
            <>
              <div
                style={{ padding: '10px 12px', borderBottom: '1px solid var(--c2c-line,#e4e7ec)' }}
              >
                {!picking ? (
                  <button
                    className="btn ghost"
                    style={{ height: 28, fontSize: 12 }}
                    onClick={() => setPicking(true)}
                  >
                    {I.plus} Record a source
                  </button>
                ) : projectSources.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    No project sources available. Add documents to the project’s data room first, or
                    open this document from its project so the data room is in context.
                    <button
                      className="nda-open"
                      style={{ marginLeft: 8 }}
                      onClick={() => setPicking(false)}
                    >
                      Close
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 11.5, opacity: 0.75 }}>
                      Choose a source from this project’s data room. Its current checksum is
                      recorded with the citation.
                    </span>
                    {projectSources.map(ps => (
                      <button
                        key={ps.id}
                        className="nda-open"
                        style={{ textAlign: 'left' }}
                        disabled={ps.extractionStatus !== 'extracted'}
                        title={
                          ps.extractionStatus === 'extracted'
                            ? 'Record this section as drafted from this source'
                            : 'This source has no readable text, so it cannot ground a draft'
                        }
                        onClick={() => void citeSource(ps.id)}
                      >
                        {ps.title || `Source ${ps.id}`}
                        {ps.extractionStatus !== 'extracted' ? ' — text not readable' : ''}
                      </button>
                    ))}
                    <button className="nda-open" onClick={() => setPicking(false)}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {sources.length === 0 ? (
                <EmptyState
                  icon={I.fileText}
                  title="No sources recorded for this section"
                  hint="Record the documents this section is written from. Each citation stores the source’s content identity, so if the source later changes this section is flagged rather than quietly left behind."
                />
              ) : (
                sources.map(s => {
                  const st = sourceStateLabel(s);
                  return (
                    <div key={s.citationId} className="cmt">
                      <div className="cmt-meta">
                        <b
                          style={{
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {s.source?.title ?? `Source ${s.citationId.slice(0, 8)}`}
                        </b>
                        <span className="cmt-when">· cited {relTime(s.citedAt)}</span>
                      </div>
                      <div className="cmt-body" style={{ display: 'grid', gap: 4 }}>
                        <span
                          className={
                            st.tone === 'ok'
                              ? 'sp-tone-ok'
                              : st.tone === 'warn'
                              ? 'sp-tone-warn'
                              : undefined
                          }
                          style={{ fontSize: 12 }}
                          title={st.hint}
                        >
                          {st.text}
                        </span>
                        {s.citationText && (
                          <span style={{ fontSize: 12, opacity: 0.85 }}>{s.citationText}</span>
                        )}
                        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="nda-open" onClick={() => void reresolve(s.citationId)}>
                            {I.rotateCcw} Re-read source
                          </button>
                          {s.source && (
                            <button className="nda-open" onClick={() => void uncite(s.source!.id)}>
                              Remove
                            </button>
                          )}
                          {s.state === 'changed' && (
                            <button
                              className="nda-open"
                              onClick={() =>
                                askAna(
                                  `The source "${
                                    s.source?.title ?? 'this document'
                                  }" changed after section ${
                                    activeSection.code
                                  } was drafted from it. Read the current source and tell me what in this section no longer matches. Do not rewrite it yet.`
                                )
                              }
                            >
                              {I.sparkles} Ask what changed
                            </button>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </aside>
      )}

      {rail === 'comments' && (
        <aside className="ed-comments">
          <div className="ed-comments-h">Comments</div>
          {activeSection && (
            <div
              style={{ padding: '10px 12px', borderBottom: '1px solid var(--c2c-line,#e4e7ec)' }}
            >
              {/* The range being commented on, handed over by the editor's
                  Comment button. Posting resolves the server id back to the
                  canvas so the highlight mark can be applied and saved. */}
              {pendingAnchor && (
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'baseline',
                    marginBottom: 6,
                    fontSize: 12,
                  }}
                >
                  <span className="rd-chip tone-idle" style={{ flexShrink: 0 }}>
                    Anchoring to
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontStyle: 'italic',
                    }}
                  >
                    “{pendingAnchor.quote}”
                  </span>
                  <button className="nda-open" onClick={cancelAnchoredComment}>
                    Cancel
                  </button>
                </div>
              )}
              <textarea
                className="c2c-input"
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder={
                  pendingAnchor
                    ? 'Comment on the selected text…'
                    : `Comment on ${activeSection.code}…`
                }
                style={{ width: '100%', minHeight: 56, resize: 'vertical', fontSize: 13 }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <button
                  className="btn primary"
                  style={{ height: 28 }}
                  onClick={addComment}
                  disabled={!newComment.trim()}
                >
                  {I.plus} Add comment
                </button>
              </div>
            </div>
          )}
          {comments.length === 0 ? (
            /* Three different facts, three different renders: still reading,
               the read FAILED, and genuinely no comments. This rail used to
               render every failure as "No comments yet" — on the panel a
               reviewer consults before freezing a document, the most dangerous
               conflation on the surface. */
            commentsState === 'loading' ? (
              <EmptyState icon={I.checkCircle} title="Loading comments…" busy />
            ) : commentsState === 'error' ? (
              <EmptyState
                tone="error"
                icon={I.alertTriangle}
                title="Couldn’t load this document’s comments"
                hint="The document may have open review threads that did not load — this is a failed read, not an empty record. Reopen the rail to retry."
              />
            ) : (
              <EmptyState
                icon={I.checkCircle}
                title="No comments yet"
                hint="Comments on this document appear here. Add one above."
              />
            )
          ) : (
            comments.map(c => {
              const anchor = asTextRangeAnchor(c.anchor);
              return (
                <div
                  key={c.id}
                  className="cmt"
                  data-active={focusedCommentId === c.id || undefined}
                  style={
                    focusedCommentId === c.id
                      ? {
                          background:
                            'color-mix(in srgb, var(--accent-100,#2563eb) 7%, transparent)',
                        }
                      : undefined
                  }
                >
                  <div className="cmt-meta">
                    <span className="cmt-av">
                      {(c.author_name ?? '·')
                        .split(' ')
                        .map(x => x[0])
                        .join('')
                        .slice(0, 2)}
                    </span>
                    <b>{c.author_name ?? 'Unknown'}</b>
                    {c.section_code && <span className="cmt-role">{c.section_code}</span>}
                    <span className="cmt-when">· {relTime(c.created_at)}</span>
                    {/* The thread's lifecycle. Resolving records the resolver
                        and keeps the row; reopen is the honest undo. Neither
                        deletes anything. */}
                    {c.status && c.status !== 'open' ? (
                      <>
                        <span className="rd-chip tone-ok" style={{ marginLeft: 'auto' }}>
                          {c.status}
                        </span>
                        <button
                          className="nda-open"
                          title="Reopen this comment thread"
                          onClick={() => void setCommentStatus(c.id, 'open')}
                        >
                          Reopen
                        </button>
                      </>
                    ) : (
                      <button
                        className="nda-open"
                        style={{ marginLeft: 'auto' }}
                        title="Mark this comment resolved — recorded under your name; the thread stays in the record"
                        onClick={() => {
                          setResolveFor(c.id);
                          setResolveNote('');
                        }}
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                  {/* The resolution RECORD, not just a chip: who closed the
                      thread, when, and their stated reason — the facts the
                      server has kept all along and the rail never showed. */}
                  {c.status === 'resolved' && (c.resolved_by || c.resolved_at) && (
                    <div className="cmt-resolution">
                      Resolved{c.resolved_by ? ` by ${c.resolved_by}` : ''}
                      {c.resolved_at ? ` · ${relTime(c.resolved_at)}` : ''}
                      {c.resolution_note ? <em> — “{c.resolution_note}”</em> : null}
                    </div>
                  )}
                  {resolveFor === c.id && (
                    <div style={{ margin: '4px 0 6px' }}>
                      <textarea
                        className="c2c-input"
                        value={resolveNote}
                        autoFocus
                        onChange={e => setResolveNote(e.target.value)}
                        placeholder="Reason for resolving (optional)"
                        aria-label="Reason for resolving"
                        style={{ width: '100%', minHeight: 40, resize: 'vertical', fontSize: 13 }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                        <button className="nda-open" onClick={() => setResolveFor(null)}>
                          Cancel
                        </button>
                        <button
                          className="btn primary"
                          style={{ height: 26 }}
                          onClick={() => {
                            setResolveFor(null);
                            void setCommentStatus(c.id, 'resolved', resolveNote);
                          }}
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  )}
                  {/* The quoted range this thread is anchored to, with a jump
                      into the canvas. An anchor whose text no longer exists is
                      reported as exactly that — never silently repointed. */}
                  {anchor && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 6,
                        alignItems: 'baseline',
                        margin: '2px 0 4px',
                        fontSize: 11.5,
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontStyle: 'italic',
                          opacity: 0.8,
                        }}
                      >
                        “{anchor.quote}”
                      </span>
                      {c.section_id === activeSectionId && (
                        <button
                          className="nda-open"
                          onClick={() => {
                            setFocusedCommentId(c.id);
                            const found = editorRef.current?.selectCommentAnchor(c.id);
                            if (!found) {
                              fireToast(
                                'The annotated text no longer exists in the current draft — the comment is kept, its highlight is gone.',
                                'error'
                              );
                            }
                          }}
                        >
                          Show in text
                        </button>
                      )}
                    </div>
                  )}
                  <div className="cmt-body">{c.body}</div>
                  {/* The thread under its head: replies the server nests,
                      oldest first, each with its own server-side attribution. */}
                  {(c.replies?.length ?? 0) > 0 && (
                    <div className="cmt-replies">
                      {c.replies!.map(r => (
                        <div key={r.id} className="cmt-reply">
                          <div className="cmt-meta">
                            <span className="cmt-av">
                              {(r.author_name ?? '·')
                                .split(' ')
                                .map(x => x[0])
                                .join('')
                                .slice(0, 2)}
                            </span>
                            <b>{r.author_name ?? 'Unknown'}</b>
                            <span className="cmt-when">· {relTime(r.created_at)}</span>
                          </div>
                          <div className="cmt-body">{r.body}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Reply — posts into THIS thread (parent_comment_id), against
                      the thread's own section. One box open at a time. */}
                  {c.section_id &&
                    (replyTo === c.id ? (
                      <div style={{ marginTop: 6 }}>
                        <textarea
                          className="c2c-input"
                          value={replyText}
                          autoFocus
                          onChange={e => setReplyText(e.target.value)}
                          placeholder={`Reply to ${c.author_name ?? 'this thread'}…`}
                          aria-label={`Reply to ${c.author_name ?? 'this thread'}`}
                          style={{ width: '100%', minHeight: 44, resize: 'vertical', fontSize: 13 }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                          <button
                            className="nda-open"
                            onClick={() => {
                              setReplyTo(null);
                              setReplyText('');
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            className="btn primary"
                            style={{ height: 26 }}
                            disabled={!replyText.trim()}
                            onClick={() => void addReply(c)}
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="nda-open"
                        style={{ marginTop: 4 }}
                        title="Reply into this thread"
                        onClick={() => {
                          setReplyTo(c.id);
                          setReplyText('');
                        }}
                      >
                        {I.messageSquare} Reply
                      </button>
                    ))}
                </div>
              );
            })
          )}
        </aside>
      )}

      {pendingLeave && activeSection && (
        <UnsavedWorkGuard
          sectionCode={activeSection.code}
          sectionTitle={activeSection.title}
          destination={
            pendingLeave.kind === 'document'
              ? docs.find(d => d.id === pendingLeave.id)?.title ?? 'another document'
              : sections.find(s => s.id === pendingLeave.id)?.code ?? 'another section'
          }
          saving={leaving}
          onSave={() => void saveAndLeave()}
          onLeave={leaveUnsaved}
          onCancel={() => setPendingLeave(null)}
        />
      )}

      <C2CToast msg={toast} />
    </div>
  );
}

/* ── The unsaved-work decision ────────────────────────────────────────────
   Three outcomes, all of them stated. The one thing this dialog must never do
   is decide for the author: saving mints an attributable Part 11 revision, and
   discarding loses text. Both are the author's call, so both are a button and
   neither is the default action of walking away. */
function UnsavedWorkGuard({
  sectionCode,
  sectionTitle,
  destination,
  saving,
  onSave,
  onLeave,
  onCancel,
}: {
  sectionCode: string;
  sectionTitle: string;
  destination: string;
  saving: boolean;
  onSave: () => void;
  onLeave: () => void;
  onCancel: () => void;
}) {
  // Escape cancels (the safe outcome — it changes nothing either way) and
  // focus returns to the tree row that was clicked.
  const ref = useDialog(onCancel);
  return (
    <div
      className="ed-guard-bd"
      onMouseDown={e => {
        if (e.target === e.currentTarget && !saving) onCancel();
      }}
    >
      <div
        className="ed-guard"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ed-guard-t"
        aria-describedby="ed-guard-d"
        tabIndex={-1}
        ref={ref}
      >
        <h2 className="ed-guard-t" id="ed-guard-t">
          Unsaved changes in {sectionCode}
        </h2>
        <p className="ed-guard-d" id="ed-guard-d">
          Your edits to {sectionCode} {sectionTitle} are cached on this device and are not in the
          record. Opening {destination} closes this section.
        </p>
        <p className="ed-guard-d">
          Saving records an auditable revision attributed to you. Leaving keeps the edits on this
          device only — this browser, on this machine — and offers them back when you return to the
          section.
        </p>
        <div className="ed-guard-acts">
          <button className="btn ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn ghost" onClick={onLeave} disabled={saving}>
            Leave without saving
          </button>
          <button className="btn primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save and continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
