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
import { apiRequest } from '@/lib/queryClient';
import { AuthoringFilingBar } from './AuthoringFilingBar';
import { AuthoringPlaceIntoFiling } from './AuthoringPlaceIntoFiling';
import { AuthoringCollab } from './AuthoringCollab';
import { AuthoringCreateExport } from './AuthoringCreateExport';
import { AuthoringRevisionDiff } from './AuthoringRevisionDiff';
import { RichSectionEditor, type RichSectionEditorHandle } from '../editor/RichSectionEditor';
import type { CommentAnchorPayload } from '../editor/commentAnchor';
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
import { isFeatureEnabled } from '@/flags/featureFlags';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';
import { AuthoringSignatures } from './AuthoringSignatures';
import { useDialog } from '../useDialog';
import { renderSafeMarkdown } from '../../components/ana/renderSafeMarkdown';

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
  state: 'current' | 'changed' | 'unverified' | 'unresolved';
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
        text: 'Content unchanged since cited',
        tone: 'ok',
        hint: 'The checksum recorded when this section cited the source still matches the source today.',
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
  } catch (e) {
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

export function DocumentAuthoring({ onNav }: OwnedSurfaceViewProps) {
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
  /** Bumped when the server replaces content out from under the editor
   *  (revert) so the canvas remounts on the new truth. */
  const [contentEpoch, setContentEpoch] = useState(0);
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

  // Right rail: AnA, revision history, comments, or the section's sources.
  const [rail, setRail] = useState<
    'ana' | 'history' | 'comments' | 'sources' | 'signatures' | null
  >('ana');
  const [revisions, setRevisions] = useState<AuthRevision[]>([]);
  // 'error' is a distinct state on purpose: an empty list because the read
  // failed and an empty list because there are no revisions are the same value
  // and opposite facts.
  const [revisionsState, setRevisionsState] = useState<'ready' | 'error'>('ready');
  const [comments, setComments] = useState<AuthComment[]>([]);
  const [newComment, setNewComment] = useState('');
  /* The revision ledger's recomputed verdict — null until asked, 'error' on a
     failed read (which is a failure to CHECK, never a claim about the chain). */
  const [ledger, setLedger] = useState<LedgerVerdict | 'error' | 'checking' | null>(null);

  // What the active section is drafted from, plus the project's Data Room for the
  // picker. Both are live reads; neither has a fixture fallback.
  const [sources, setSources] = useState<SectionSource[]>([]);
  const [sourcesState, setSourcesState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [projectSources, setProjectSources] = useState<ProjectSource[]>([]);
  const [picking, setPicking] = useState(false);

  const [toast, fireToast] = useToast();

  /* ── Editor deep-link target (window.C2C_EDITOR_TARGET) ──
     Set by a workbench click ("Open §11 in editor", a CER Generator row) via
     v2/editorTarget.ts, the same set-navigate-consume idiom as C2C_CONVO.
     Peeked in the initializer (pure — safe under StrictMode double-render),
     CLEARED on mount: the channel is one-shot, so a target that isn't honoured
     now can never ambush a later, unrelated visit to the editor. */
  const [editorTarget] = useState<EditorTarget | null>(() => peekEditorTarget());
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
    (target: LeaveTarget) => {
      const alreadyThere =
        target.kind === 'section' ? target.id === activeSectionId : target.id === activeDocId;
      if (alreadyThere) return;
      if (!dirty) {
        applyNav(target);
        return;
      }
      setPendingLeave(target);
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
  const moduleContext = useMemo(
    () => ({
      surface: 'document-authoring',
      documentId: activeDocId,
      documentTitle: activeDoc?.title ?? null,
      sectionId: activeSectionId,
      sectionCode: activeSection?.code ?? null,
      sectionTitle: activeSection?.title ?? null,
    }),
    [activeDocId, activeDoc?.title, activeSectionId, activeSection?.code, activeSection?.title]
  );
  const ana = useAnaChat({
    screenName: 'document-authoring',
    projectId: projectIdForOutline,
    authoringContext,
    moduleContext,
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

  /* ── Load sections when the active document changes ── */
  const loadSections = useCallback(async (docId: string) => {
    setSectionsState('loading');
    const { ok, body } = await readJson<{ sections?: AuthSection[] }>(
      `/api/authoring/docs/${encodeURIComponent(docId)}/sections`
    );
    if (!ok || !body) {
      setSectionsState('error');
      setSections([]);
      return;
    }
    const list = Array.isArray(body.sections) ? body.sections : [];
    setSections(list);
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
    if (!editorTarget || docsState === 'loading' || filing.loading) return;
    targetAttemptedRef.current = true;
    const t = editorTarget;
    // A hand-off that named no section carried only program scope, which
    // window.C2C_PROJECT already delivered. Nothing more was claimed.
    if (!t.sectionCode && !t.sectionLabel) return;
    const family = EDITOR_TARGET_DOC_LABELS[t.docType];
    const wanted = describeEditorTarget(t);
    if (docsState === 'error') {
      // The tree pane already reports the failed read; this says what it cost.
      setTargetNotice(
        `Couldn’t open ${wanted} — the document list failed to load, so nothing was resolved. ` +
          'Retry once documents load.'
      );
      return;
    }
    if (t.programId && t.programId !== projectIdForOutline) {
      setTargetNotice(
        `Couldn’t open ${wanted} — it belongs to ${t.programTitle ?? 'a different program'}, ` +
          'which is not the project this editor is scoped to. Open that project and retry. ' +
          'Showing the editor’s default view instead.'
      );
      return;
    }
    if (filing.document && filing.document.doc_type !== t.docType) {
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
          setTreeScrollNonce(n => n + 1);
          fireToast(`Opened ${match.code} · ${match.title} — from the ${family} workspace.`);
          return;
        }
      }
      if (!aliveRef.current) return;
      setTargetNotice(
        `Couldn’t find ${wanted} in the ${family} documents in scope ` +
          `(status filter: ${status.replace('_', ' ')}). Showing the editor’s default view — ` +
          'the section may not be drafted here yet, or may sit under another status.'
      );
    })();
  }, [
    editorTarget,
    docsState,
    docs,
    filing.loading,
    filing.document,
    projectIdForOutline,
    status,
    activeDocId,
    loadSections,
    fireToast,
  ]);

  /* Bring the deep-linked section's tree row into view once it is active.
     Re-runs as the tree fills in; a no-op when nothing is active yet. */
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!treeScrollNonce) return;
    const row = rootRef.current?.querySelector<HTMLElement>('.ed-tree-row[data-active]');
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
  }, [treeScrollNonce, activeSectionId, sections]);

  /* ── Load the right-rail data for the active section on demand ── */
  const loadHistory = useCallback(async (sectionId: string) => {
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
    if (!ok) {
      setRevisionsState('error');
      setRevisions([]);
      return;
    }
    setRevisionsState('ready');
    setRevisions(Array.isArray(body?.revisions) ? body!.revisions! : []);
  }, []);

  const loadComments = useCallback(async (docId: string) => {
    const { body } = await readJson<{ comments?: AuthComment[] }>(
      `/api/authoring/documents/${encodeURIComponent(docId)}/comments`
    );
    setComments(Array.isArray(body?.comments) ? body!.comments! : []);
  }, []);

  /* ── The sources this section is drafted from ──
     Live read, honest failure. An error is reported as an error rather than as
     an empty list: "we could not load what this section cites" and "this section
     cites nothing" are different facts, and on a regulated surface conflating
     them is the more dangerous mistake. */
  const loadSources = useCallback(async (sectionId: string) => {
    setSourcesState('loading');
    const { ok, body } = await readJson<{ sources?: SectionSource[] }>(
      `/api/authoring/sections/${encodeURIComponent(sectionId)}/sources`
    );
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
    if (rail === 'sources' && activeSectionId) {
      void loadSources(activeSectionId);
      void loadProjectSources();
    }
  }, [
    rail,
    activeSectionId,
    activeDocId,
    loadHistory,
    loadComments,
    loadSources,
    loadProjectSources,
  ]);

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
      const res = await apiRequest(
        'DELETE',
        `/api/authoring/sections/${activeSectionId}/cite-source/${sourceId}`
      );
      if (!res.ok) {
        fireToast(
          'Couldn’t remove the citation — a frozen citation is immutable. Nothing was changed.',
          'error'
        );
        return;
      }
      fireToast('Citation removed.');
      void loadSources(activeSectionId);
    },
    [activeSectionId, fireToast, loadSources]
  );

  /* ── Re-read the source and record what it says now ──
     The server re-resolves against the stored source; it does not invent a hash.
     A citation whose source is gone, or which is frozen, is refused with a reason. */
  const reresolve = useCallback(
    async (citationId: string) => {
      if (!activeSectionId) return;
      const res = await apiRequest(
        'POST',
        `/api/authoring/sections/${activeSectionId}/refresh-token`,
        {
          cite_id: citationId,
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        fireToast(
          (json as any)?.message ?? 'Couldn’t re-read the source. Nothing was changed.',
          'error'
        );
        return;
      }
      fireToast((json as any)?.message ?? 'Source re-read.');
      void loadSources(activeSectionId);
    },
    [activeSectionId, fireToast, loadSources]
  );

  /* ── Save the section content (real, awaited, auto-revisioned) ──
     The ONE save path: the canonical editor serializes and calls this; the
     header Save button and Cmd/Ctrl-S route through the editor's own save so
     the footer save-state, the device cache and this governed PATCH cannot
     disagree. Throwing on failure lets the editor report the truth. */
  const saveSectionContent = useCallback(
    async (serialized: string) => {
      if (!activeSection) throw new Error('No section open');
      setSaving(true);
      try {
        const res = await apiRequest('PATCH', `/api/authoring/sections/${activeSection.id}`, {
          content: serialized,
        });
        const json = await res.json().catch(() => null);
        if (res.status === 401) {
          fireToast('Not saved — your session isn’t authenticated. Sign in and retry.', 'error');
          throw new Error('unauthenticated');
        }
        if (!res.ok) {
          fireToast(
            'Couldn’t save the section — ' +
              ((json as any)?.error ?? `HTTP ${res.status}`) +
              '. Nothing was persisted.',
            'error'
          );
          throw new Error('save failed');
        }
        const adopted = (json as { section?: AuthSection })?.section;
        const persisted = adopted?.content ?? serialized;
        // Adopt the server row (revision counter, updated_at) into the tree.
        setSections(ss =>
          ss.map(s =>
            s.id === activeSection.id ? { ...s, ...(adopted ?? {}), content: persisted } : s
          )
        );
        fireToast('Section saved — a revision was recorded (' + activeSection.code + ').');
        // Keep the history rail fresh if it's open.
        if (rail === 'history') void loadHistory(activeSection.id);
      } finally {
        setSaving(false);
      }
    },
    [activeSection, rail, loadHistory, fireToast]
  );

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
        fireToast('Comment not posted — your session isn’t authenticated.', 'error');
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
              : `${docs.length} document${docs.length === 1 ? '' : 's'} · ${status.replace(
                  '_',
                  ' '
                )}`}
          </div>
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
              const bound = findSectionForNode(sections, node.key);
              const isActive = bound != null && bound.id === activeSectionId;
              return (
                <button
                  key={node.key}
                  className="ed-tree-row"
                  data-active={isActive || undefined}
                  style={{ paddingLeft: 10 + node.depth * 12, opacity: bound ? 1 : 0.62 }}
                  title={
                    bound
                      ? `${node.label} — open`
                      : `${node.label} — not started in this document yet`
                  }
                  onClick={() => {
                    if (bound) {
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
                  {node.mandatory && !bound && (
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
            <EmptyState
              icon={I.fileText}
              title="No documents here"
              hint={`No ${status.replace(
                '_',
                ' '
              )} documents in this project. Switch the status filter above.`}
            />
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
                      sections.map(s => (
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
                      ))
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
            <span className="sep">›</span>
            <span className="doc-title" title={activeDoc?.title ?? undefined}>
              {activeDoc?.title ?? 'No document'}
            </span>
            {activeSection && (
              <>
                <span className="sep">›</span>
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
            />
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
            <button
              className="btn primary"
              style={{ height: 30 }}
              onClick={() => void editorRef.current?.save()}
              disabled={!dirty || saving || docSealed}
              title={
                docSealed ? 'This document is frozen — its content cannot be edited.' : undefined
              }
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
            {!activeSection ? (
              <div style={{ paddingTop: 48 }}>
                <EmptyState
                  icon={I.fileText}
                  title={activeDoc ? 'Select a section to edit' : 'Select a document'}
                  hint={
                    activeDoc
                      ? 'Choose a section from the tree to open its content in the editor. Every save records an auditable revision.'
                      : 'Choose a document from the tree to open its sections.'
                  }
                />
              </div>
            ) : (
              <>
                <div className="ed-mast">
                  <div className="ed-mast-num">{activeSection.code}</div>
                  <h1 className="ed-mast-t">{activeSection.title}</h1>
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
                {docSealed && (
                  <div className="scaf-note" role="status" style={{ marginBottom: 12 }}>
                    {I.lock}{' '}
                    {String(activeDoc?.status).toUpperCase() === 'APPROVED'
                      ? 'This document has been approved and frozen. Its content is part of the signed record and cannot be edited.'
                      : 'This document is frozen. Its content is sealed under a content hash and cannot be edited.'}{' '}
                    Create a new version to make further changes.
                  </div>
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
                    }}
                    commentsApi={{
                      onCreate: requestAnchoredComment,
                      onOpen: openCommentFromAnchor,
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

      {rail === 'sources' && (
        <aside className="ed-comments">
          <div className="ed-comments-h">Drafted from</div>
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
            <EmptyState
              icon={I.checkCircle}
              title="No comments yet"
              hint="Review comments on this document appear here."
            />
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
                    {c.status && c.status !== 'open' && (
                      <span className="rd-chip tone-ok" style={{ marginLeft: 'auto' }}>
                        {c.status}
                      </span>
                    )}
                  </div>
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
