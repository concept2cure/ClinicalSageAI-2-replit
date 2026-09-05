/**
 * RichSectionEditor — THE section editing canvas.
 *
 * One implementation for every editable document surface (CLAUDE.md: zero
 * duplication). It replaces, in the same change that introduced it:
 *   - the Document Authoring plain <textarea> (whole-section string PATCH),
 *   - DocCanvas (`EditorCanvas.tsx`) — contentEditable driven by the
 *     deprecated `document.execCommand`, deleted with this file's adoption,
 *   - the MDX dossier drawer's bare contentEditable (`PathwayPanes.tsx`).
 *
 * Built on TipTap v3 / ProseMirror — dependencies that sat in package.json
 * with zero importers while three hand-rolled canvases shipped.
 *
 * What it preserves from the canvases it replaces:
 *   - honest save-state labels: server-persisted, in-flight, failed-but-cached,
 *     and device-only are distinct states with distinct words (DocCanvas);
 *   - a device-local crash cache (`dc::<key>`) so a reload never loses
 *     in-progress work — offered back via an explicit restore notice, never
 *     silently loaded over the server's content (fixes DocCanvas, which
 *     hydrated stale localStorage OVER newer server content);
 *   - the Data Origins right-click with the drift refusal contract
 *     (`lineage.canonicalText`);
 *   - per-store serialization: `format: 'html'` for the authoring store,
 *     `format: 'text'` for the c2c dossier store (plain-text column).
 *
 * What it adds (previously impossible in any canvas):
 *   - real track changes bound to `authoring_sections.track_changes` — see
 *     `./suggestions.ts`;
 *   - range-anchored comments — see `./commentAnchor.ts`;
 *   - optional live co-editing over the server's Hocuspocus `/collab` socket
 *     (Yjs CRDT sync; server-side auth + persistence already live behind
 *     ENABLE_COLLAB_CRDT).
 *
 * FAIL-CLOSED FIDELITY GATE (the round-trip precondition the old
 * ENABLE_RICH_SECTION_EDITOR flag said must be verified before rich editing
 * ships): before a section becomes rich-editable, the stored content's text is
 * compared against what the schema parse retained (`roundTrip.ts`). On any
 * mismatch the editor refuses rich mode for that section and edits the raw
 * stored string in source mode instead — the governed record is never
 * silently rewritten by a lossy parse.
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { generateJSON } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { Collaboration } from '@tiptap/extension-collaboration';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { redactInternals } from '@/lib/queryClient';
import * as Y from 'yjs';
import { structuralSignatureFromDom, structuralSignatureFromDoc, signatureDrift, docToPlainText } from './roundTrip';

import { DataOriginsMenu } from '../../lineage';
import {
  TrackChanges,
  collectSuggestions,
  type SuggestionAuthor,
  type SuggestionDecision,
  type SuggestionRange,
} from './suggestions';
import {
  CommentAnchor,
  collectCommentAnchors,
  type CommentAnchorPayload,
} from './commentAnchor';
import {
  assessFidelity,
  looksLikeHtml,
  plainTextToHtml,
  htmlVisibleText,
  assessPasteFidelity,
  editorHeldDoc,
  type StructuralSignature,
} from './roundTrip';
import { FindReplace, getFindState } from './findReplace';
import { AuthoringImage } from './imageNode';
import { CrossReference } from './crossReferenceNode';
import { Citation, citationOrderKey } from './citationNode';
import {
  CaptionNumbering,
  CaptionedTable,
  captionAt,
  captionOrderKey,
  captionTargets,
} from './captionNumbering';
import type { CaptionedObject } from '@shared/authoring/captions';
import type { Node as PMNode } from '@tiptap/pm/model';
import {
  crossReferenceLookupFor,
  crossReferenceText,
  normalizeCrossReferenceDisplay,
  type CrossReferenceDisplay,
  type CrossReferenceLookup,
} from '@shared/authoring/cross-references';
import {
  citationLookupFor,
  citationSourceName,
  type CitationLookup,
  type CitationSource,
} from '@shared/authoring/citations';
import { I } from '../icons';
import '../styles/rich-section-editor.css';

/* ── Public contract ──────────────────────────────────────────── */

export interface RichSectionEditorHandle {
  /** Serialize and persist through `onSave`. Resolves true on confirmed save. */
  save: () => Promise<boolean>;
  /** Insert proposed text at the caret as a tracked suggestion. */
  insertSuggestion: (text: string, author: SuggestionAuthor) => boolean;
  /** Current serialized content (unsaved included). */
  getContent: () => string;
  /**
   * Authors whose insertions were ACCEPTED since the last call, then cleared.
   *
   * Accepting an insertion strips the mark that named its author, so after the
   * click nothing in the content says an AI drafted the words. The host reads
   * this at save time and sends it with the write, so the revision records who
   * the accepted text came from instead of attributing it to whoever pressed
   * accept.
   */
  takeAcceptedAuthors: () => SuggestionAuthor[];
  /** Select + scroll to a comment's anchored range. False when the annotated
   *  text no longer exists in the current draft. */
  selectCommentAnchor: (commentId: string) => boolean;
  /** Open the find bar, pre-seeded with `query` when given (otherwise from the
   *  current selection). False in source mode, where the bar deliberately does
   *  not render — the browser's own find works on a plain textarea. */
  openFind: (query?: string) => boolean;
  focus: () => void;
}

export interface RichSectionEditorProps {
  /** The stored section content — HTML or textarea-era plain text. */
  value: string;
  /** Serialization contract of the backing store. Default 'html'. */
  format?: 'html' | 'text';
  /** Governed write-through. Throw/reject on failure — the footer reports it. */
  /** Persist the serialized content.
   *
   *  `systemReason` is set only when the SAVE ITSELF is a mechanism acting,
   *  not a person editing prose — today, applying a comment anchor. The host
   *  requires the author to state a reason for their own edits, and a comment
   *  anchor is not one of those: the author is leaving a note, and the save is
   *  a consequence of that. Asking "why did this section change" there would
   *  be a question about an act they did not perform.
   *
   *  It is a SYSTEM reason, never a substitute for the author's: it names the
   *  mechanism and cannot be mistaken for something a person wrote. */
  onSave: (serialized: string, systemReason?: string) => void | Promise<void>;
  /** Debounced autosave in ms, or null for explicit save (button / Mod-S). */
  autosaveMs?: number | null;
  onDirtyChange?: (dirty: boolean) => void;
  readOnly?: boolean;
  placeholder?: string;
  /** Device crash-cache key (stored under `dc::<storageKey>`). Null disables. */
  storageKey?: string | null;
  ariaLabel?: string;
  /** 'full' draws ribbon + footer; 'bare' is just the canvas (host owns chrome). */
  chrome?: 'full' | 'bare';
  /** Hide the footer's own Save control when the host surface renders one —
   *  two visible Save buttons for one save path is duplicated affordance. */
  showSaveButton?: boolean;
  /** Ask AnA — powers the cite-selection and empty-state draft affordances. */
  onAsk?: ((prompt: string) => void) | null;
  /** Span-lineage right-click contract (see DataOriginsMenu). */
  lineage?: {
    documentTable: string;
    documentId: string;
    documentTitle?: string;
    canonicalText?: string;
  } | null;
  /** Track changes. Omit to hide the capability entirely. */
  track?: {
    enabled: boolean;
    author: SuggestionAuthor;
    /** Persist the toggle (PATCH track_changes). Reject to refuse the flip. */
    onToggle?: (enabled: boolean) => void | Promise<void>;
    /** Every accept/reject, so the host can record it as a governed act.
     *  Rejections in particular change no text and are otherwise unrecorded
     *  anywhere. Fire-and-forget: it must not block or undo the edit. */
    onResolve?: (decision: SuggestionDecision) => void;
  } | null;
  /** Range-anchored comments. Omit to hide the capability. */
  commentsApi?: {
    /** Create the thread server-side; resolve the server comment id. */
    onCreate: (anchor: CommentAnchorPayload) => Promise<string | null>;
    /** A click on annotated text — open the thread in the host's rail. */
    onOpen?: (commentId: string) => void;
    /** The anchor's fate: `saved` is whether the section save that carries the
     *  anchor mark succeeded. A thread can exist while its highlight does not. */
    onAnchored?: (commentId: string, saved: boolean) => void;
  } | null;
  /** Image insertion. The host owns the upload (the governed image store is
   *  the authoring API's; the MDX drawer's plain-text store has none). Omit
   *  to hide the capability — existing images still display read-only. */
  imagesApi?: {
    /** Upload the file to the tenant's image store; resolve the reference the
     *  section's HTML will carry. Reject with a reason on refusal. */
    upload: (file: File) => Promise<{ id: string; url: string }>;
  } | null;
  /**
   * Cross-references to other sections of the same document.
   *
   * The host owns the list because the host owns the document — this component
   * never fetches one. `sections` is LIVE: renumber or retitle a section and
   * every reference to it in the canvas re-renders, because a reference stores
   * the target's id and resolves its text, which is the entire point of the
   * capability. Omit to hide it; references already in the content still
   * render, and say plainly that they could not be checked.
   */
  crossRefsApi?: {
    sections: { id: string; code?: string | null; title?: string | null }[];
    /**
     * The document's captioned tables and figures OUTSIDE this section, split
     * at it: everything in the sections ordered above, and everything below.
     *
     * Two lists rather than one because the ordinal is positional. This
     * section's own objects are numbered BETWEEN them, so a table here shows
     * the number the filing prints rather than restarting at 1 — the same
     * reason the citation canvas is told which sources are cited above it.
     * Both halves are also offered as reference targets, so "as shown in
     * Table 7" can point at a table in another section.
     *
     * Omit to reference sections only; a reference already in the content that
     * points at a table outside this section then says plainly that it could
     * not be checked, rather than printing a number that would look right.
     */
    captionsBefore?: readonly CaptionedObject[];
    captionsAfter?: readonly CaptionedObject[];
  } | null;
  /**
   * Citations of the platform's governed sources.
   *
   * The host owns the library because the host owns the document and the
   * tenant's source registry — this component never fetches one. `sources` is
   * LIVE: a citation stores the source's id and resolves its number and name
   * from this list, so a source that leaves the library makes every citation of
   * it say so rather than print a number for something that is gone.
   *
   * `precedingSourceIds` is the source ids already cited by the sections
   * ORDERED ABOVE this one, in reading order. It exists because the reference
   * list belongs to the DOCUMENT while this editor holds one section: without
   * it the canvas would number its own citations from 1 and show "[1]" for a
   * claim the filing prints as "[7]", which is the plausible-looking wrong
   * number the whole design exists to remove.
   *
   * `onCite` records the section→source link the platform already keeps (the
   * Sources rail, and the change-propagation report that reads it), so an
   * in-text citation and the section's recorded lineage cannot drift apart.
   *
   * Omit to hide the capability; citations already in the content still render,
   * and say plainly that they could not be checked.
   */
  citationsApi?: {
    sources: CitationSource[];
    precedingSourceIds: readonly string[];
    onCite?: (sourceId: string) => void | Promise<void>;
  } | null;
  /** Live co-editing over the server's /collab Hocuspocus socket. */
  collab?: {
    /** Server grammar: `authoring:<docUuid>` or `authoring:<docUuid>:<sectionUuid>`. */
    docName: string;
    /** Verified access JWT; the socket refuses anything else. */
    token: string | null;
    /** ws(s) URL; defaults to same-origin `/collab`. */
    url?: string;
  } | null;
}

/* ── Honest save states ───────────────────────────────────────── */

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
const SAVE_META: Record<SaveState, { dot: string; label: string }> = {
  saved: { dot: 'var(--success)', label: 'All changes saved' },
  dirty: { dot: 'var(--warning)', label: 'Unsaved changes — cached on this device' },
  saving: { dot: 'var(--warning)', label: 'Saving…' },
  error: { dot: 'var(--error)', label: 'Save failed — kept on this device' },
};

const cacheKeyFor = (storageKey: string) => 'dc::' + storageKey;

/** One shared empty list, so an absent caption directory does not produce a new
 *  array identity on every render and re-run the memos that key on it. */
const EMPTY_CAPTION_LIST: readonly CaptionedObject[] = Object.freeze([]);

/** What the image store accepts — the formats a Word export can embed. SVG is
 *  deliberately absent (a script container, not a picture) and so is WebP
 *  (DOCX cannot carry it; refusing at upload beats dropping at export). */
const IMG_MIME = /^image\/(png|jpeg|gif)$/;
const IMG_MAX_BYTES = 8 * 1024 * 1024;

function wordsOf(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

/** Serialize an editor per the backing store's contract. Module-level so
 *  `onCreate` (which fires during editor construction) can use it without
 *  touching component bindings that are not initialized yet. */
function serializeEditor(
  ed: { getHTML: () => string; getText: (o?: any) => string },
  format: 'html' | 'text',
): string {
  return format === 'text'
    ? ed.getText({
        blockSeparator: '\n\n',
        // Without this, a hard break serializes to nothing and the stored
        // plain text silently loses its single newlines.
        textSerializers: { hardBreak: () => '\n' },
      })
    : ed.getHTML();
}

/**
 * Turn the structural drift the fidelity gate reported into the phrase the
 * source-mode notice shows. Says WHAT changed, so a writer sees why rich mode
 * was refused — a heading rank, a table's shape, a caption, a definition list —
 * rather than a bare "the check failed".
 */
const STRUCTURAL_DRIFT_PHRASE: Record<keyof StructuralSignature, string> = {
  headingLevels: 'a heading level',
  tables: 'a table',
  rows: 'a table row',
  cells: 'a table cell',
  captions: 'a table caption',
  headerCells: 'a table header row',
  defItems: 'a definition list',
  images: 'an image',
};
function structuralDriftLabel(drift: (keyof StructuralSignature)[]): string {
  const phrases = Array.from(new Set(drift.map((k) => STRUCTURAL_DRIFT_PHRASE[k])));
  if (phrases.length === 0) return 'its structure';
  if (phrases.length === 1) return phrases[0];
  return phrases.slice(0, -1).join(', ') + ' and ' + phrases[phrases.length - 1];
}

/* ── Component ────────────────────────────────────────────────── */

/**
 * A ribbon button.
 *
 * ── Why this lives OUTSIDE the component ─────────────────────────────────────
 * It was declared inside the render body, so every render produced a new
 * component TYPE and React tore down and rebuilt all twelve-to-seventeen ribbon
 * buttons' DOM nodes. `onUpdate` fires four state setters per keystroke, so
 * that was every character typed — and because the pressed button's node was
 * destroyed under the pointer, focus fell to `<body>`. Measured: after one
 * keystroke the Bold button is a different DOM node and `document.activeElement`
 * is BODY.
 *
 * ── Why `onClick`, not `onMouseDown` ─────────────────────────────────────────
 * It bound `onMouseDown` and nothing else. Keyboard activation of a <button>
 * (Enter or Space) dispatches only `click`, so every one of these controls was
 * MOUSE-ONLY. TipTap's own keymaps happen to rescue nine of them (⌘B, ⌘I, ⌘U,
 * the lists, undo/redo), which is why this went unnoticed — but Insert table,
 * Cite the selected claim, Comment on the selection, and all six table controls
 * had no keyboard path at all. On a surface for authoring CTD modules, "build a
 * table" being pointer-exclusive fails WCAG 2.1.1 outright.
 *
 * `onMouseDown` with `preventDefault` was doing one necessary job: keeping the
 * editor selection from collapsing when the button takes focus. That is
 * preserved — the mousedown handler now ONLY prevents the default, and `click`
 * does the work, so both input methods run the same path exactly once.
 *
 * `aria-pressed` is `false` rather than absent when off: omitting it tells a
 * screen reader "not a toggle" instead of "not pressed".
 */
const RB = React.memo(function RB({
  onClick,
  active,
  title,
  shortcut,
  children,
  disabled,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  /** Shown in the tooltip so the shortcut is discoverable. */
  shortcut?: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const label = shortcut ? `${title} (${shortcut})` : title;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active ?? false}
      disabled={disabled}
      /* Keeps the editor selection alive when focus moves to the button; the
         activation itself is `click`, so keyboard and pointer agree. */
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => { if (!disabled) onClick(); }}
      className="rse-rb"
      data-active={active || undefined}
      data-testid={`rse-rb-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
    >
      {children}
    </button>
  );
});

export const RichSectionEditor = forwardRef<RichSectionEditorHandle, RichSectionEditorProps>(
  function RichSectionEditor(
    {
      value,
      format = 'html',
      onSave,
      autosaveMs = null,
      onDirtyChange,
      readOnly = false,
      placeholder,
      storageKey = null,
      ariaLabel,
      chrome = 'full',
      showSaveButton = true,
      onAsk = null,
      lineage = null,
      track = null,
      commentsApi = null,
      imagesApi = null,
      crossRefsApi = null,
      citationsApi = null,
      collab = null,
    },
    ref,
  ) {
    const [saveState, setSaveState] = useState<SaveState>('saved');
    const [dirty, setDirty] = useState(false);
    const [words, setWords] = useState(0);
    // `words` starts at 0 and is only real once TipTap has parsed the content
    // in onCreate. Reading "0 words" as "this section is empty" before then
    // means the empty-state CTA below is offered over a section that may be
    // full — an empty state asserted before anything was read, which is the
    // one kind this repo does not ship. It also made the ambiguity that failed
    // authoringAnaPane's test in CI: two buttons named "Draft with AnA" on
    // screen at once, the second of which should not have been there at all.
    const [editorReady, setEditorReady] = useState(false);
    /** TipTap's own emptiness verdict, not "0 words": a section holding only
     *  a figure has zero words and is NOT empty — offering "Draft with AnA"
     *  over it would assert an empty state that is false. */
    const [docEmpty, setDocEmpty] = useState(false);
    const [trackOn, setTrackOn] = useState<boolean>(track?.enabled ?? false);
    const [suggestions, setSuggestions] = useState<SuggestionRange[]>([]);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [collabStatus, setCollabStatus] = useState<
      'off' | 'connecting' | 'connected' | 'disconnected' | 'denied'
    >(collab ? 'connecting' : 'off');
    /* The canvas is not a document until the first sync lands. Before that it
       is EMPTY — and every status line used to agree with it: "All changes
       saved · 0 words" and a Draft-with-AnA invitation over a section that has
       content, permanently if the socket was refused. */
    const [collabSynced, setCollabSynced] = useState(false);
    const syncedOnceRef = useRef(false);
    const [restoreOffer, setRestoreOffer] = useState<string | null>(null);
    /* ── Find & replace bar state ──
       The query text lives here; the matches and the focused index live in
       the editor's plugin state (the one source of truth for what is
       highlighted) and are mirrored into `findInfo` for the counter. */
    const [findOpen, setFindOpen] = useState(false);
    const [findQuery, setFindQuery] = useState('');
    const [findCase, setFindCase] = useState(false);
    const [replaceWith, setReplaceWith] = useState('');
    const [findInfo, setFindInfo] = useState({ count: 0, active: -1 });
    const findInputRef = useRef<HTMLInputElement>(null);
    const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedRef = useRef<string>(value ?? '');
    const editorHostRef = useRef<HTMLDivElement>(null);
    /** Content a debounced autosave has been armed for but not yet written.
     *  Held so an unmount inside the debounce window flushes it instead of
     *  dropping it — see the unmount effect below. */
    const pendingAutosaveRef = useRef<string | null>(null);
    /** `onSave` as of the last render, readable from the unmount cleanup
     *  (which closes over the first render's props otherwise). */
    const onSaveRef = useRef(onSave);
    useEffect(() => {
      onSaveRef.current = onSave;
    });

    /** `track.onResolve` as of the last render. The extension list is built
     *  once per mount, so configuring the callback directly would freeze the
     *  first render's closure and post decisions against a stale document id. */
    const onResolveRef = useRef(track?.onResolve);
    useEffect(() => {
      onResolveRef.current = track?.onResolve;
    });

    /* ── Cross-reference directory ──
       The extension set is built once per mount, but the document's sections
       change WHILE the editor is open — renumbering one is exactly what every
       reference to it has to survive. So the node reads the directory through
       a ref on each resolve, and every live reference in the canvas is
       repainted when the list changes. Nothing about the stored content is
       touched by a repaint: the reference holds the target's id, and only its
       displayed text is recomputed. */
    const crossRefSections = crossRefsApi?.sections ?? null;
    /* Keyed on the CONTENT of the directory, not the array's identity: the host
       re-derives its list on every render, and repainting every reference on
       every keystroke because of that would be a pointless cost. What matters
       is whether a code or a title actually changed. */
    const crossRefKey = crossRefSections
      ? crossRefSections
          .map((sec) => `${sec.id}\u0000${sec.code ?? ''}\u0000${sec.title ?? ''}`)
          .join('\u0001')
      : '';

    /* ── Captioned tables and figures ──
       A caption's number is its POSITION among the document's tables (or
       figures), and this editor holds one section — so the host says what sits
       above and below, and this section's objects are numbered between them.
       Read through refs for the same reason the section directory is: the
       extension set is built once per mount and these lists change while the
       editor is open. */
    const EMPTY_CAPTIONS: readonly CaptionedObject[] = EMPTY_CAPTION_LIST;
    const captionsBefore = crossRefsApi?.captionsBefore ?? EMPTY_CAPTIONS;
    const captionsAfter = crossRefsApi?.captionsAfter ?? EMPTY_CAPTIONS;
    const captionsBeforeRef = useRef<readonly CaptionedObject[]>(captionsBefore);
    captionsBeforeRef.current = captionsBefore;
    const captionsAfterRef = useRef<readonly CaptionedObject[]>(captionsAfter);
    captionsAfterRef.current = captionsAfter;
    const captionsOutsideKey = [...captionsBefore, ...captionsAfter]
      .map((o) => `${o.kind}\u0000${o.id ?? ''}\u0000${o.caption}`)
      .join('\u0001');
    /** This section's document as of the last transaction — what the live half
     *  of the numbering is computed from. */
    const liveDocRef = useRef<PMNode | null>(null);
    /** The editor itself, for the effects declared above its construction. */
    const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);
    /** This section's caption order, so a reference repaints when a table moves
     *  and not on every keystroke. */
    const [captionOrder, setCaptionOrder] = useState('');

    const crossRefLookup = useMemo<CrossReferenceLookup | null>(() => {
      if (!crossRefSections) return null;
      const sections = crossReferenceLookupFor(crossRefSections);
      return (targetId: string) => {
        const section = sections(targetId);
        if (section) return section;
        /* A captioned TABLE or FIGURE is a cross-reference target exactly as a
           section is — "Table 3" is its code and its caption is its title. The
           same resolver, the same failure state, no second mechanism: see
           @shared/authoring/captions. Recomputed per call because the live half
           comes from the document being edited. */
        const id = String(targetId);
        return (
          captionTargets(
            captionsBeforeRef.current,
            liveDocRef.current,
            captionsAfterRef.current,
          ).find((t) => t.id === id) ?? null
        );
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [crossRefKey]);
    const crossRefLookupRef = useRef<CrossReferenceLookup | null>(crossRefLookup);
    crossRefLookupRef.current = crossRefLookup;
    /** Live node views to repaint when the directory changes — including when a
     *  table is inserted or captioned, which moves every number after it. */
    const crossRefRepaint = useRef<Set<() => void>>(new Set());
    useEffect(() => {
      for (const paint of crossRefRepaint.current) paint();
    }, [crossRefKey, captionsOutsideKey, captionOrder]);

    /* The canvas's numbers are drawn by a decoration, and decorations are
       recomputed from EDITOR STATE — so a change to the objects OUTSIDE this
       section (a colleague captions a table in an earlier section during a
       live co-edit) would leave the numbers here stale until the next
       keystroke. A meta-only transaction redraws them; it changes no content,
       so it marks nothing dirty and mints no revision. */
    useEffect(() => {
      if (!editorRef.current || editorRef.current.isDestroyed) return;
      const view = editorRef.current.view;
      view.dispatch(editorRef.current.state.tr.setMeta('captionNumbering', true));
    }, [captionsOutsideKey]);

    /** The tables and figures this section can point at, numbered as the
     *  document numbers them. What the reference picker offers. */
    const captionTargetList = useMemo(
      () =>
        captionTargets(captionsBefore, liveDocRef.current, captionsAfter),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [captionsOutsideKey, captionOrder],
    );

    /* ── Citation library and numbering ──
       Same shape as the cross-reference directory above, and for the same
       reason: the extension set is built once per mount while the library and
       the sections above this one change WHILE the editor is open, and a
       citation's number is derived from position rather than stored.

       A citation renumbers on more occasions than a cross-reference does: any
       citation inserted or deleted anywhere earlier in the DOCUMENT moves it.
       So the views are repainted when the library changes, when the sections
       above this one change, and when this section's own citation order
       changes — and not on every keystroke, which is what the order key is
       for. */
    const citationSources = citationsApi?.sources ?? null;
    const citationKeyOfSources = citationSources
      ? citationSources
          .map((src) => `${src.id}\u0000${citationSourceName(src)}`)
          .join('\u0001')
      : '';
    const citationLookup = useMemo<CitationLookup | null>(
      () => (citationSources ? citationLookupFor(citationSources) : null),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [citationKeyOfSources],
    );
    const citationLookupRef = useRef<CitationLookup | null>(citationLookup);
    citationLookupRef.current = citationLookup;

    /** The sources cited above this section — where this section's numbering
     *  continues from. Read through a ref for the same reason the lookup is. */
    const precedingKey = (citationsApi?.precedingSourceIds ?? []).join('\u0001');
    const precedingRef = useRef<readonly string[]>(citationsApi?.precedingSourceIds ?? []);
    precedingRef.current = citationsApi?.precedingSourceIds ?? [];

    /** Live citation node views, and the order they were last painted in. */
    const citationRepaint = useRef<Set<() => void>>(new Set());
    const [citationOrder, setCitationOrder] = useState('');
    useEffect(() => {
      for (const paint of citationRepaint.current) paint();
    }, [citationKeyOfSources, precedingKey, citationOrder]);

    /* ── Live co-editing runtime (one Y.Doc + provider per mount) ── */
    const collabRuntime = useMemo(() => {
      if (!collab) return null;
      const doc = new Y.Doc();
      const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws';
      const url =
        collab.url ??
        (typeof window !== 'undefined' ? `${proto}://${window.location.host}/collab` : '');
      const provider = new HocuspocusProvider({
        url,
        name: collab.docName,
        token: collab.token ?? '',
        document: doc,
        onStatus: ({ status }) => {
          setCollabStatus(status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting' : 'disconnected');
        },
        onAuthenticationFailed: () => setCollabStatus('denied'),
      });
      return { doc, provider };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collab?.docName]);

    useEffect(
      () => () => {
        collabRuntime?.provider.destroy();
        collabRuntime?.doc.destroy();
      },
      [collabRuntime],
    );

    /* ── Extension set (stable per mount) ── */
    const extensions = useMemo(() => {
      const exts: any[] = [
        StarterKit.configure({
          /* CTD sections nest to five levels — 2.7.3.1.2 — and the schema
             stopped at three, so a writer could not build the hierarchy the
             document is navigated by. The parser clamped anything deeper with
             Math.min(3, …), which flattened an H4 that was already stored and
             passed the round-trip fidelity gate untouched: that gate compares
             TEXT, and a demoted heading keeps every character. */
          heading: { levels: [1, 2, 3, 4, 5] },
          // A link in the canvas is a mark being edited, not a navigation:
          // clicking it must place the caret, and the ribbon's Link control
          // is where the href is read or changed.
          link: { openOnClick: false, autolink: true },
          // Yjs owns undo/redo when live co-editing is on.
          ...(collabRuntime ? { undoRedo: false } : {}),
        }),
        /* The kit's own `table` node is switched off and replaced by the one
           that can hold a caption. Two table nodes in one schema would be two
           documents' worth of ambiguity — `prosemirror-tables` resolves every
           command through `tableRole`, which both would claim. */
        TableKit.configure({ table: false }),
        CaptionedTable.configure({ resizable: false }),
        CaptionNumbering.configure({ before: () => captionsBeforeRef.current }),
        // CTD text is dense with cm², t½, CO₂ — these were declared in
        // package.json and imported nowhere, so sup/sub in stored content
        // flattened to plain text (BP-W1-1).
        Superscript,
        Subscript,
        // Same defect class as sup/sub: installed, declared, imported nowhere —
        // so an author could not centre a table caption and stored <mark>
        // highlights flattened to plain text on the next save.
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        Highlight,
        // The schema can hold a figure now; the fidelity gate stops refusing
        // rich mode for content that contains one (see `boot` below).
        AuthoringImage,
        CrossReference.configure({
          lookup: () => crossRefLookupRef.current,
          repaint: crossRefRepaint.current,
        }),
        Citation.configure({
          lookup: () => citationLookupRef.current,
          preceding: () => precedingRef.current,
          repaint: citationRepaint.current,
        }),
        TrackChanges.configure({
          enabled: (track?.enabled ?? false) && !readOnly,
          author: track?.author ?? { id: 'unknown', name: 'Unknown author' },
          // Stable identity reading the latest handler — see onResolveRef.
          onResolve: (d: SuggestionDecision) => onResolveRef.current?.(d),
        }),
        CommentAnchor.configure({
          onAnchorClick: commentsApi?.onOpen ?? null,
        }),
        FindReplace,
      ];
      if (placeholder) exts.push(Placeholder.configure({ placeholder }));
      if (collabRuntime) exts.push(Collaboration.configure({ document: collabRuntime.doc }));
      return exts;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ── Fail-closed fidelity gate, assessed once per mount ── */
    const boot = useMemo(() => {
      const stored = value ?? '';
      if (format === 'text') {
        /* "Plain text is always faithfully representable" was false for
           whitespace: the parse collapses runs of spaces and tabs, and three
           blank lines become one break — a space-aligned table in a plain-text
           section was silently rewritten on the first save. Round-trip it
           exactly; on any difference, edit the raw string in source mode. */
        const html = plainTextToHtml(stored);
        try {
          const back = docToPlainText(generateJSON(html, extensions));
          if (back !== stored.replace(/\r\n/g, '\n')) {
            return { mode: 'source' as const, html: null, verdict: null };
          }
        } catch {
          return { mode: 'source' as const, html: null, verdict: null };
        }
        return { mode: 'rich' as const, html, verdict: null };
      }
      const html = looksLikeHtml(stored) ? stored : plainTextToHtml(stored);
      // The fidelity gate below compares TEXT, so markup that carries no text
      // passes the gate, is dropped by the parse, and is silently rewritten
      // out of the record on the next save. <img> is representable now — the
      // schema holds an image node backed by the governed image store — but
      // figure/svg/video/embed/object still are not, so content holding one
      // of those is edited in source mode, where the raw string round-trips
      // byte-for-byte.
      if (/<(figure|svg|video|embed|object)[\s/>]/i.test(stored)) {
        return { mode: 'source' as const, html: null, verdict: null };
      }
      try {
        const json = generateJSON(html, extensions);
        // Compare against the doc the LIVE editor will hold, not the raw parse.
        // generateJSON runs no plugins; the editor runs fixTables on first edit,
        // padding a ragged table and clamping rowspan overflow into the record.
        const held = editorHeldDoc(json, extensions);
        const base = assessFidelity(stored, held.doc);
        // A padded table shows as a cell-count drift; a rowspan/colspan clamp
        // changes only an attribute and is invisible to every counter — so the
        // rewrite boolean is ORed in, and when it is the only signal the notice
        // names the table.
        const verdict =
          held.tablesRewritten && !base.lossy
            ? { ...base, lossy: true, structuralDrift: ['tables' as const] }
            : base;
        if (verdict.lossy) return { mode: 'source' as const, html: null, verdict };
        return { mode: 'rich' as const, html, verdict };
      } catch {
        // A parse that throws proves the content is not representable.
        return { mode: 'source' as const, html: null, verdict: null };
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ── Source mode state (raw stored string, same save path) ── */
    const [sourceText, setSourceText] = useState<string>(value ?? '');

    /* The footer's word count comes from the TipTap editor, which in source
       mode is constructed EMPTY — so a 120-word section under the fidelity
       gate reported "0 words". Fabricated metadata, on exactly the sections the
       gate flagged as most delicate. In source mode the textarea is the
       document, so it is what gets counted. */
    const displayWords = boot.mode === 'source' ? wordsOf(htmlVisibleText(sourceText)) : words;
    /* Before the first live sync the canvas holds nothing; no status may
       describe it as a document. */
    const canvasSettled = !collabRuntime || collabSynced;

    const editor = useEditor(
      {
        extensions,
        /* THE RIBBON HAS TO FOLLOW THE CARET.
           Without this, TipTap re-renders the component only when the DOCUMENT
           changes — never on a bare selection move — so every control that
           reflects where the caret IS was stale until you typed a character:
           click into a table and the +Row/+Col/Hdr/delete controls never
           appeared (while "Insert table" stayed on offer, so pressing it nested
           a table inside a cell); select bold text and B did not light; put the
           caret in an H2 and the style picker still read "Paragraph"; arm bold
           on a collapsed caret and nothing indicated it.
           This option is a boolean in TipTap 3, so the cost is a re-render per
           transaction — including caret movement. That is affordable now and
           was not before: `RB` is hoisted to module scope and memoized, so a
           re-render no longer tears down and rebuilds every ribbon button's DOM
           (it did, on every keystroke, dropping focus to <body>). If this ever
           needs to be cheaper, the answer is to memoize what the ribbon reads,
           not to go back to a toolbar that does not know where the caret is. */
        shouldRerenderOnTransaction: true,
        editable: !readOnly && boot.mode === 'rich',
        editorProps: {
          attributes: {
            role: 'textbox',
            'aria-multiline': 'true',
            ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
          },
          // A pasted or dropped image file goes through the same validated
          // upload as the ribbon button. When images are not enabled here,
          // fall through to the default handling instead of swallowing it.
          /* Runs before the parse: keep what the clipboard actually carried. */
          transformPastedHTML: (html) => {
            pastedHtmlRef.current = html;
            return html;
          },
          /* Runs after the parse, on the slice actually about to be inserted.
             Reports; never blocks or rewrites a paste — a writer mid-thought must
             not be interrupted by a refusal, and the comparison is a count rather
             than a diff, so it cannot say WHAT was dropped. */
          transformPasted: (slice) => {
            const html = pastedHtmlRef.current;
            pastedHtmlRef.current = '';
            if (html) {
              const { expected, lost } = assessPasteFidelity(
                html,
                slice.content.textBetween(0, slice.content.size, ' ', ' '),
              );
              /* Words are one dimension. A Word table flattened into paragraphs,
                 a heading demoted, a definition list collapsed — every word
                 survives and the count says clean, and the next save writes the
                 drifted structure into the record. The mount gate compares a
                 structural signature; the paste gate now does too. */
              let drift: (keyof StructuralSignature)[] = [];
              try {
                const dom = new DOMParser().parseFromString(html, 'text/html');
                drift = signatureDrift(
                  structuralSignatureFromDom(dom),
                  structuralSignatureFromDoc({ type: 'doc', content: slice.content.toJSON() ?? [] }),
                );
              } catch {
                drift = [];
              }
              if (lost > 0 || drift.length > 0) {
                setPasteNotice(
                  (lost > 0 ? `About ${lost} of ${expected} pasted words could not be kept. ` : '') +
                    (drift.length > 0
                      ? `The paste changed ${structuralDriftLabel(drift)} — the pasted content used structure this editor cannot store as it was. `
                      : '') +
                    'Check the pasted passage against your source before relying on it.',
                );
              }
            }
            return slice;
          },
          handlePaste: (_view, event) => {
            if (!imagesEnabledRef.current) return false;
            const file = Array.from(event.clipboardData?.files ?? []).find((f) =>
              f.type.startsWith('image/'),
            );
            if (!file) return false;
            event.preventDefault();
            void insertImageFileRef.current(file);
            return true;
          },
          handleDrop: (_view, event) => {
            if (!imagesEnabledRef.current) return false;
            const file = Array.from(event.dataTransfer?.files ?? []).find((f) =>
              f.type.startsWith('image/'),
            );
            if (!file) return false;
            event.preventDefault();
            void insertImageFileRef.current(file);
            return true;
          },
        },
        // With Yjs, content comes from the synced doc (seeded below), never
        // from props — passing it here would duplicate on every join.
        ...(collabRuntime ? {} : { content: boot.html ?? '' }),
        onUpdate: ({ editor: ed }) => {
          const serialized = serialize(ed);
          const isDirty = serialized !== lastSavedRef.current;
          setDirty(isDirty);
          /* Never leave 'saving' from a keystroke: editing back to the baseline
             while a PATCH is in flight used to print "All changes saved" over
             an unsettled write. The write's own settle recomputes the state. */
          setSaveState((s) => (s === 'saving' ? s : isDirty ? 'dirty' : 'saved'));
          setWords(wordsOf(ed.getText()));
          setDocEmpty(ed.isEmpty);
          setSuggestions(collectSuggestions(ed.state.doc));
          /* A citation added, deleted or moved renumbers the ones after it.
             Comparing the order key rather than repainting unconditionally
             keeps a keystroke from repainting every marker in the section. */
          setCitationOrder(citationOrderKey(ed.state.doc));
          /* A table or figure captioned, inserted, deleted or moved renumbers
             the objects after it and every reference to them. Same order-key
             comparison the citations use, and for the same reason: a keystroke
             must not repaint the section. */
          liveDocRef.current = ed.state.doc;
          setCaptionOrder(captionOrderKey(ed.state.doc));
          cacheDraft(serialized);
          if (autosaveMs != null && isDirty) {
            if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
            pendingAutosaveRef.current = serialized;
            autosaveTimer.current = setTimeout(() => void doSave(), autosaveMs);
          }
        },
        onCreate: ({ editor: ed }) => {
          // The clean baseline is this editor's OWN serialization of the
          // parsed content, not the stored string: legacy plain text parses
          // to equivalent HTML that would otherwise read as "unsaved changes"
          // on a canvas nobody has touched. The record itself is only ever
          // rewritten by a real edit followed by a real save.
          if (boot.mode === 'rich' && !collabRuntime) {
            lastSavedRef.current = serializeEditor(ed, format);
          }
          setWords(wordsOf(ed.getText()));
          setDocEmpty(ed.isEmpty);
          setSuggestions(collectSuggestions(ed.state.doc));
          setCitationOrder(citationOrderKey(ed.state.doc));
          liveDocRef.current = ed.state.doc;
          setCaptionOrder(captionOrderKey(ed.state.doc));
          setEditorReady(true);
        },
      },
      [],
    );

    editorRef.current = editor;

    /* THE EDITOR MUST STOP ACCEPTING KEYSTROKES WHEN THE RECORD SEALS.
     *
     * `editable` above is read ONCE, at construction, and never again. With an
     * empty dependency array TipTap re-applies changed options on each render
     * but deliberately pins editability to its current value
     * (@tiptap/react: `setOptions({ ...options, editable: editor.isEditable })`),
     * so a later `readOnly` prop change had no effect whatsoever. Nothing
     * remounts the editor on a freeze either: the host keys it on
     * `sectionId + contentEpoch`, and freezing bumps neither.
     *
     * What the author saw: they freeze or e-sign the open document — or a
     * colleague does and the list refreshes — the banner appears, the ribbon
     * disappears, the Save button greys out, AND THE CANVAS KEEPS TAKING TEXT.
     * They write into a signed record that no longer has any way to accept it,
     * and the save path is refused server-side, so every word is lost.
     *
     * DocumentAuthoring carries a 16-line comment asserting this was fixed and
     * that "the canvas stops accepting keystrokes rather than accepting them
     * and losing them at save time". It did not; this is that fix. */
    useEffect(() => {
      if (!editor || editor.isDestroyed) return;
      const shouldEdit = !readOnly && boot.mode === 'rich' && (!collabRuntime || collabSynced);
      if (editor.isEditable !== shouldEdit) editor.setEditable(shouldEdit);
    }, [editor, readOnly, boot.mode, collabRuntime, collabSynced]);

    /* Seed a first-ever collab doc from the stored content once synced. */
    useEffect(() => {
      if (!collabRuntime || !editor) return;
      const onSynced = () => {
        /* A reconnect fires `synced` again. It used to re-declare the buffer
           saved every time — flipping the footer to "All changes saved" over
           unsaved work and disarming the unsaved-work guards, so a dropped
           socket lost filing text on the next navigation. Transport events do
           not touch the save state; only the FIRST sync sets the baseline. */
        if (syncedOnceRef.current) return;
        syncedOnceRef.current = true;
        const frag = collabRuntime.doc.getXmlFragment('default');
        if (frag.length === 0 && boot.html) {
          editor.commands.setContent(boot.html);
        }
        // Whether seeded here or adopted from peers, what the synced doc
        // holds now is the clean baseline for dirty-tracking.
        lastSavedRef.current = serializeEditor(editor, format);
        setDirty(false);
        setSaveState('saved');
        setWords(wordsOf(editor.getText()));
        setDocEmpty(editor.isEmpty);
        setCollabSynced(true);
      };
      collabRuntime.provider.on('synced', onSynced);
      return () => {
        collabRuntime.provider.off('synced', onSynced);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collabRuntime, editor]);

    /* Live sync refused before the first sync: the socket will never seed the
       canvas. Seed it from the stored content and edit solo — said plainly in
       the footer — instead of leaving an empty, editable canvas forever. */
    useEffect(() => {
      if (!collabRuntime || !editor || editor.isDestroyed || collabSynced || collabStatus !== 'denied') return;
      syncedOnceRef.current = true;
      if (boot.html) editor.commands.setContent(boot.html);
      lastSavedRef.current = serializeEditor(editor, format);
      setDirty(false);
      setSaveState('saved');
      setWords(wordsOf(editor.getText()));
      setDocEmpty(editor.isEmpty);
      setCollabSynced(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collabRuntime, editor, collabSynced, collabStatus]);

    /* ── Serialization per the backing store's contract ── */
    const serialize = useCallback(
      (ed: NonNullable<typeof editor>): string => serializeEditor(ed, format),
      [format],
    );

    /* ── Device crash cache: offered back explicitly, never auto-loaded ── */
    const cacheDraft = useCallback(
      (serialized: string) => {
        if (!storageKey) return;
        try {
          if (serialized === lastSavedRef.current) localStorage.removeItem(cacheKeyFor(storageKey));
          else localStorage.setItem(cacheKeyFor(storageKey), serialized);
        } catch {
          /* storage full — the server save path is unaffected */
        }
      },
      [storageKey],
    );

    useEffect(() => {
      if (!storageKey) return;
      try {
        const cached = localStorage.getItem(cacheKeyFor(storageKey));
        if (cached != null && cached !== (value ?? '')) setRestoreOffer(cached);
      } catch {
        /* unreadable storage — nothing to offer */
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey]);

    const restoreCached = useCallback(() => {
      if (restoreOffer == null) return;
      if (boot.mode === 'source') {
        setSourceText(restoreOffer);
        setDirty(true);
        setSaveState('dirty');
      } else if (editor) {
        const html =
          format === 'text' || !looksLikeHtml(restoreOffer)
            ? plainTextToHtml(restoreOffer)
            : restoreOffer;
        editor.commands.setContent(html);
      }
      setRestoreOffer(null);
    }, [restoreOffer, editor, boot.mode, format]);

    const discardCached = useCallback(() => {
      if (storageKey) {
        try {
          localStorage.removeItem(cacheKeyFor(storageKey));
        } catch {
          /* ignore */
        }
      }
      setRestoreOffer(null);
    }, [storageKey]);

    /* ── The one save path ── */
    const doSave = useCallback(async (systemReason?: string): Promise<boolean> => {
      const serialized =
        boot.mode === 'source' ? sourceText : editor ? serialize(editor) : null;
      if (serialized == null) return false;
      // Whatever a debounce was armed for, this write supersedes it.
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      pendingAutosaveRef.current = null;
      if (serialized === lastSavedRef.current) {
        // Nothing outstanding — a stale "Save failed" from an earlier attempt
        // must not keep standing over a buffer that matches the record.
        setDirty(false);
        setSaveState('saved');
        return true;
      }
      setSaveState('saving');
      try {
        await onSave(serialized, systemReason);
        lastSavedRef.current = serialized;
        const nowSerialized = boot.mode === 'source' ? sourceText : editor ? serialize(editor) : serialized;
        const stillDirty = nowSerialized !== serialized;
        setDirty(stillDirty);
        onDirtyChange?.(stillDirty);
        setSaveState(stillDirty ? 'dirty' : 'saved');
        if (storageKey) {
          try {
            localStorage.removeItem(cacheKeyFor(storageKey));
          } catch {
            /* ignore */
          }
        }
        return true;
      } catch {
        // The host surface reports the server's reason; this footer reports
        // the state truthfully: not persisted, still cached on this device.
        setSaveState('error');
        return false;
      }
    }, [boot.mode, sourceText, editor, serialize, onSave, onDirtyChange, storageKey]);

    useEffect(() => {
      onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    /* ── Leaving the page over unsaved work ──
       The device crash cache above survives a reload, but it is device-local:
       it is not the record, it does not travel to another machine, and a
       colleague opening the section sees the last SAVED text. Closing the tab
       on an unsaved paragraph therefore loses it from everywhere that matters,
       silently. The browser's own discard prompt is the only guard that fires
       before the decision is irreversible, so it is armed here — in the one
       component that knows whether there is unsaved work — rather than in each
       host surface. Armed only while genuinely dirty: a page that always
       refuses to close teaches people to click through the dialog. */
    useEffect(() => {
      if (!dirty || readOnly) return;
      const onBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        // Older engines show the prompt only when returnValue is set; the
        // string itself has been ignored by every browser for years.
        e.returnValue = '';
        return '';
      };
      window.addEventListener('beforeunload', onBeforeUnload);
      return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [dirty, readOnly]);

    /* ── A pending autosave must not die with the mount ──
       Hosts that pass `autosaveMs` (the MDX dossier drawer) debounce their
       write. Unmounting inside that window — closing the drawer, switching
       what is open — used to clear nothing and fire nothing: the timer was
       dropped with the component and the last edits never reached the server.
       Flush it directly instead of through `doSave`, which sets state on a
       component that is going away. A rejection has no on-screen outcome at
       this point — the component is gone. When `storageKey` is set, the device
       cache still holds the text and the next mount offers it back; a host that
       sets `autosaveMs` without `storageKey` has no such net, and its last
       edits are lost with no notice anywhere. */
    useEffect(
      () => () => {
        if (autosaveTimer.current) {
          clearTimeout(autosaveTimer.current);
          autosaveTimer.current = null;
        }
        const pending = pendingAutosaveRef.current;
        pendingAutosaveRef.current = null;
        if (pending != null && pending !== lastSavedRef.current) {
          void (async () => {
            try {
              await onSaveRef.current(pending);
            } catch {
              /* kept on this device; offered back on the next mount */
            }
          })();
        }
      },
      [],
    );

    /* ── Track changes toggle (server column first, then the plugin) ── */
    const toggleTrack = useCallback(async () => {
      if (!track || !editor) return;
      const next = !trackOn;
      if (!track.onToggle) {
        /* With no persistence hook the flip would be decorative: a footer
           asserting "Track changes on" for a governed column nothing wrote. */
        setActionNotice('Track changes cannot be switched from this surface — it does not persist the mode, so the checkbox would claim a setting the record does not hold.');
        return;
      }
      try {
        await track.onToggle(next);
        setTrackOn(next);
        editor.commands.setTrackChangesEnabled(next && !readOnly);
      } catch (e) {
        /* Refused server-side — the state stays truthful, and the author is
           told why rather than watching the checkbox snap back in silence. */
        setActionNotice('Track changes unchanged — ' + redactInternals(e instanceof Error ? e.message : '', 'the server refused the change') + '.');
      }
    }, [track, editor, trackOn, readOnly]);

    /* The mode is a governed column that a colleague can change under this
       mount (the row refreshes without a remount). Follow the prop. */
    useEffect(() => {
      const on = !!track?.enabled;
      setTrackOn(on);
      if (editor && !editor.isDestroyed) editor.commands.setTrackChangesEnabled(on && !readOnly);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [track?.enabled]);

    /* ── Comment from selection ──
       The host resolves the server comment id (the thread row must exist
       before anything references it). The anchor mark is then applied and the
       section saved immediately: an anchor that exists only in unsaved state
       is a highlight the next reader would never see. */
    const commentOnSelection = useCallback(async () => {
      if (!commentsApi || !editor) return;
      const { from, to } = editor.state.selection;
      if (from === to) return;
      /* The anchoring save serializes the WHOLE buffer under the system reason
         below. With unsaved prose in it, two paragraphs the author never
         reasoned for would be minted as a revision "Comment anchor applied" —
         bypassing the §11.10(d) reason the save gate exists to require. */
      if (dirty) {
        setActionNotice('Save your edits before commenting on a selection — the comment anchor is saved with the section, and your unsaved edits would be recorded under "Comment anchor applied" instead of your own reason.');
        return;
      }
      const quote = editor.state.doc.textBetween(from, to, ' ');
      let id: string | null = null;
      try {
        id = await commentsApi.onCreate({ kind: 'text-range', quote, from, to });
      } catch (e) {
        setActionNotice('The comment was not created — ' + redactInternals(e instanceof Error ? e.message : '', 'the server refused it') + '. Nothing was anchored.');
        return;
      }
      if (!id) {
        setActionNotice('The comment was not created, so nothing was anchored.');
        return;
      }
      editor.chain().focus().setTextSelection({ from, to }).setCommentAnchor(id).run();
      /* The save is a consequence of leaving a comment, not an edit to the
         prose — so it states its own mechanism rather than borrowing whatever
         reason the author gave for their last content change. */
      const saved = await doSave('Comment anchor applied');
      if (!saved) {
        setActionNotice('The comment thread exists, but its anchor could not be saved with the section — other readers will not see the highlight until the section is saved.');
      }
      commentsApi.onAnchored?.(id, saved);
    }, [commentsApi, editor, doSave, dirty]);

    /* ── Ask the assistant for a source (parity with the retired DocCanvas) ──
       This asks a question in the AnA pane. It is NOT the citation control —
       see the ribbon note where it is rendered. */
    const askForSource = useCallback(() => {
      if (!editor || !onAsk) return;
      const s = editor.state.doc
        .textBetween(editor.state.selection.from, editor.state.selection.to, ' ')
        .trim();
      if (s) onAsk(`Suggest a source for this claim: "${s}"`);
    }, [editor, onAsk]);

    /* ── Find & replace ──
       Declared ahead of the imperative handle, which exposes openFind. Open
       seeds the query from an explicit preset (the handle's caller knows what
       it is looking for) or, absent one, from the current selection (the
       phrase you just noticed is the phrase you want to find). Close clears
       the plugin state so no stale highlight outlives the bar. Focus stays in
       the bar's input throughout — findNext moves the editor SELECTION, not
       the focus, so Enter keeps cycling. Returns false in source mode, where
       the bar does not render, so a caller can refuse honestly instead of
       claiming a find it never opened. */
    const openFind = useCallback((presetQuery?: string) => {
      if (boot.mode !== 'rich') return false;
      let seed: string | null = presetQuery?.trim() ? presetQuery.trim() : null;
      if (seed == null && editor) {
        const { from, to } = editor.state.selection;
        if (to > from && to - from <= 120) {
          const sel = editor.state.doc.textBetween(from, to, ' ').trim();
          if (sel) seed = sel;
        }
      }
      setFindOpen(true);
      const q = seed ?? findQuery;
      if (seed != null) setFindQuery(seed);
      if (q) editor?.commands.setFindQuery(q, findCase);
      return true;
    }, [editor, boot.mode, findQuery, findCase]);

    const closeFind = useCallback(() => {
      setFindOpen(false);
      editor?.commands.clearFind();
      editor?.commands.focus();
    }, [editor]);

    /* ── Imperative handle ── */
    useImperativeHandle(
      ref,
      () => ({
        save: doSave,
        /* REPORTS SUCCESS ONLY IF THE TEXT CAN REACH THE SAVED DOCUMENT.
         *
         * This was `editor ? chain().insertSuggestedContent(…).run() : false`,
         * and both halves lied in source mode. The TipTap instance still EXISTS
         * there — it is constructed empty and non-editable while the raw
         * <textarea> is what the author sees — so `editor` is truthy;
         * `focus()` does not check editability and `insertSuggestedContent`
         * unconditionally returns true, so `run()` returned true as well.
         *
         * Meanwhile `doSave` in source mode serializes `sourceText` and never
         * the editor. So an AnA draft landed in an invisible ProseMirror
         * document that is never rendered and never saved — discarded — and the
         * caller, seeing `true`, told the author "Draft inserted as tracked
         * suggestions — review each edit in the canvas, then save." They were
         * sent to look for regulatory text in a canvas that does not show it,
         * on precisely the sections the fidelity gate flagged as most delicate.
         *
         * The same held for a FROZEN section: this control is not disabled by
         * `docSealed`, unlike the surrounding Draft-with-AnA button, so the
         * insert silently went nowhere there too.
         *
         * The call site has always had an honest failure branch — "Couldn't
         * insert — the canvas is not editable right now." It simply never
         * fired. */
        insertSuggestion: (text: string, author: SuggestionAuthor) => {
          if (!editor || editor.isDestroyed) return false;
          // Source mode: the textarea is the document; the editor is a shell.
          if (boot.mode !== 'rich') return false;
          // Frozen / read-only: the save path would refuse it anyway.
          if (!editor.isEditable) return false;
          return editor.chain().focus().insertSuggestedContent(text, author).run();
        },
        getContent: () =>
          boot.mode === 'source' ? sourceText : editor ? serialize(editor) : '',
        takeAcceptedAuthors: () => {
          /* TipTap types `storage` as a closed map of the extensions it ships
             with, so a custom extension's slot is reached through the record
             shape rather than by property access. */
          const store = (editor?.storage as unknown as
            | Record<string, { acceptedAuthors?: SuggestionAuthor[] } | undefined>
            | undefined)?.c2cTrackChanges;
          const taken = store?.acceptedAuthors ?? [];
          if (store?.acceptedAuthors) store.acceptedAuthors = [];
          return taken;
        },
        selectCommentAnchor: (commentId: string) => {
          if (!editor) return false;
          const range = collectCommentAnchors(editor.state.doc).get(commentId);
          if (!range) return false;
          editor.chain().focus().setTextSelection(range).scrollIntoView().run();
          return true;
        },
        openFind,
        focus: () => editor?.commands.focus(),
      }),
      [doSave, editor, boot.mode, sourceText, serialize, openFind],
    );

    /* Mirror the plugin's matches into the counter — on every transaction
       while the bar is open, because typing, replacing and accepting
       suggestions all move the matches. */
    useEffect(() => {
      if (!findOpen || !editor) return;
      const refresh = () => {
        const st = getFindState(editor.state);
        setFindInfo({ count: st.matches.length, active: st.activeIndex });
      };
      refresh();
      editor.on('transaction', refresh);
      return () => {
        editor.off('transaction', refresh);
      };
    }, [findOpen, editor]);

    useEffect(() => {
      if (findOpen) {
        findInputRef.current?.focus();
        findInputRef.current?.select();
      }
    }, [findOpen]);

    const onFindQueryChange = useCallback(
      (q: string) => {
        setFindQuery(q);
        editor?.commands.setFindQuery(q, findCase);
      },
      [editor, findCase],
    );

    const toggleFindCase = useCallback(() => {
      const next = !findCase;
      setFindCase(next);
      if (findQuery) editor?.commands.setFindQuery(findQuery, next);
    }, [editor, findCase, findQuery]);

    const onKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault();
          void doSave();
        } else if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
          if (boot.mode !== 'rich') return; // source mode: the browser's find works
          e.preventDefault();
          openFind();
        }
      },
      [doSave, openFind, boot.mode],
    );

    /* ── Link bar ──
       The ribbon's Link control opens a small inline bar (no window.prompt):
       the input reads the selection's current href when the caret is on a
       link, Apply writes it back through setLink, Remove unsets it. Only
       http(s) and mailto go in — a scheme-less entry is completed to https,
       anything else is refused with the reason on screen. */
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkHref, setLinkHref] = useState('');
    const [linkError, setLinkError] = useState<string | null>(null);
    const linkInputRef = useRef<HTMLInputElement>(null);

    const openLink = useCallback(() => {
      if (!editor) return;
      const existing = (editor.getAttributes('link').href as string | undefined) ?? '';
      setLinkHref(existing);
      setLinkError(null);
      setLinkOpen(true);
    }, [editor]);

    useEffect(() => {
      if (linkOpen) {
        linkInputRef.current?.focus();
        linkInputRef.current?.select();
      }
    }, [linkOpen]);

    const closeLink = useCallback(() => {
      setLinkOpen(false);
      editor?.commands.focus();
    }, [editor]);

    const applyLink = useCallback(() => {
      if (!editor) return;
      const raw = linkHref.trim();
      if (!raw) {
        setLinkError('Enter a URL.');
        return;
      }
      const href = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : 'https://' + raw;
      if (!/^(https?:|mailto:)/i.test(href)) {
        setLinkError('Only http(s) and mailto links can be inserted.');
        return;
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
      setLinkOpen(false);
    }, [editor, linkHref]);

    const removeLink = useCallback(() => {
      editor?.chain().focus().extendMarkRange('link').unsetLink().run();
      setLinkOpen(false);
    }, [editor]);

    /* ── Cross-reference bar ──
       Insert-by-picking, never by typing a number: the writer chooses a
       SECTION and the editor stores that section's id. There is deliberately no
       field in which to type "2.7.4.2", because a typed number is the unmanaged
       text this replaces.

       The list is the host's live directory, so the codes shown are the codes
       as they stand right now. Choosing a section that has since been removed
       is refused with the reason on screen rather than inserting a reference
       that is broken from the moment it is written. */
    const [xrefOpen, setXrefOpen] = useState(false);
    const [xrefTarget, setXrefTarget] = useState('');
    const [xrefDisplay, setXrefDisplay] = useState<CrossReferenceDisplay>('code-title');
    const [xrefError, setXrefError] = useState<string | null>(null);
    const xrefSelectRef = useRef<HTMLSelectElement>(null);

    /** Everything this section can point at: the document's other sections, and
     *  its captioned tables and figures. One list because a reference to a table
     *  is the same kind of thing as a reference to a section — it stores the
     *  target's identity and prints what the target is called now. */
    const xrefChoices = useMemo(
      () => [...(crossRefSections ?? []), ...captionTargetList],
      [crossRefSections, captionTargetList],
    );

    const openXref = useCallback(() => {
      setXrefError(null);
      setXrefTarget((t) => t || xrefChoices[0]?.id || '');
      setXrefOpen(true);
    }, [xrefChoices]);

    useEffect(() => {
      if (xrefOpen) xrefSelectRef.current?.focus();
    }, [xrefOpen]);

    const closeXref = useCallback(() => {
      setXrefOpen(false);
      editor?.commands.focus();
    }, [editor]);

    /* ── Cite a source ──
       Same shape as the cross-reference picker beside it, deliberately: this is
       the third control in the editor that inserts an identity and renders a
       derived string, and it should read like its siblings rather than invent a
       third idiom. The pinpoint is free text because it is authored content —
       "p. 142, Table 14.2.1" is a judgement about the source, not a value any
       renderer could compute. */
    const [citeOpen, setCiteOpen] = useState(false);
    const [citeSource, setCiteSource] = useState('');
    const [citeLocator, setCiteLocator] = useState('');
    const [citeError, setCiteError] = useState<string | null>(null);
    const citeSelectRef = useRef<HTMLSelectElement>(null);

    const openCite = useCallback(() => {
      setCiteError(null);
      setCiteSource((cur) => cur || citationSources?.[0]?.id || '');
      setCiteOpen(true);
    }, [citationSources]);

    useEffect(() => {
      if (citeOpen) citeSelectRef.current?.focus();
    }, [citeOpen]);

    const closeCite = useCallback(() => {
      setCiteOpen(false);
      setCiteError(null);
    }, []);

    const applyCite = useCallback(() => {
      if (!editor) return;
      if (!citeSource) {
        setCiteError('Choose the source to cite.');
        return;
      }
      const inserted = editor
        .chain()
        .focus()
        .insertCitation({ source: citeSource, locator: citeLocator })
        .run();
      if (!inserted) {
        /* The picker offers the live library, so a refusal means it moved under
           the writer. Inserting a citation that is already broken is not
           something to do quietly. */
        setCiteError(
          'That source is no longer available to this document. Nothing was inserted.',
        );
        return;
      }
      /* Record the section→source link the platform already keeps, so the
         Sources rail and the prose cannot drift apart — and so this citation
         participates in the change report when the source's content moves.
         Fire-and-forget: the citation is in the canvas either way, and the host
         reports its own failure. */
      void citationsApi?.onCite?.(citeSource);
      setCiteLocator('');
      setCiteOpen(false);
      setCiteError(null);
    }, [editor, citeSource, citeLocator, citationsApi]);

    /* ── Caption bar ──
       The one place a table's or a figure's caption can be written. It is
       needed twice over: the editor's schema had no caption at all (a stored
       `<caption>` was parsed into a CELL and written back into the record that
       way), and a figure's caption was whatever the uploaded file happened to
       be named.

       There is deliberately no field in which to type a NUMBER. The number is
       the object's position and is drawn beside the caption from it; a typed
       one is the unmanaged text this replaces. */
    const [captionOpen, setCaptionOpen] = useState(false);
    const [captionText, setCaptionText] = useState('');
    const [captionError, setCaptionError] = useState<string | null>(null);
    const captionInputRef = useRef<HTMLInputElement>(null);

    /** What the caret is on: a table, a selected figure, or neither. */
    const captionSubject = editor ? captionAt(editor.state) : null;

    const openCaption = useCallback(() => {
      setCaptionError(null);
      setCaptionText(editor ? (captionAt(editor.state)?.caption ?? '') : '');
      setCaptionOpen(true);
    }, [editor]);

    useEffect(() => {
      if (captionOpen) captionInputRef.current?.focus();
    }, [captionOpen]);

    const closeCaption = useCallback(() => {
      setCaptionOpen(false);
      setCaptionError(null);
      editor?.commands.focus();
    }, [editor]);

    const applyCaption = useCallback(() => {
      if (!editor) return;
      const applied = editor.chain().focus().setObjectCaption(captionText).run();
      if (!applied) {
        /* The caret moved out of the object while the bar was open. Silently
           captioning whatever it is on now would label the wrong table. */
        setCaptionError(
          'Put the cursor in a table, or select a figure, and try again. Nothing was changed.',
        );
        return;
      }
      setCaptionOpen(false);
      setCaptionError(null);
    }, [editor, captionText]);

    const applyXref = useCallback(() => {
      if (!editor) return;
      if (!xrefTarget) {
        setXrefError('Choose the section to reference.');
        return;
      }
      const inserted = editor
        .chain()
        .focus()
        .insertCrossReference({ target: xrefTarget, display: xrefDisplay })
        .run();
      if (!inserted) {
        setXrefError(
          'That target is no longer in this document. Nothing was inserted — reopen the list and choose again.',
        );
        return;
      }
      setXrefOpen(false);
    }, [editor, xrefTarget, xrefDisplay]);

    /* ── Image insertion (ribbon button, paste, drop) ──
       Validation runs client-side for fast refusal and server-side as the
       authority. FAIL CLOSED: a refused or failed upload inserts nothing and
       says why in the notice bar; success inserts the store's reference at
       the caret. The upload itself is the host's (`imagesApi.upload`) — this
       component never talks to a store directly. */
    const [imgNotice, setImgNotice] = useState<string | null>(null);

    /* ── Paste fidelity ───────────────────────────────────────────────────────
       The fail-closed gate at mount protects STORED content from a lossy parse.
       Paste had no equivalent, and it is the highest-frequency way content
       enters this editor: a medical writer drafts in Word, or lifts three pages
       out of a previous CSR, and pastes. Anything the schema cannot represent is
       dropped by the parse at that instant — the gate never sees it, because by
       the time content is stored the loss has already happened and the stored
       string and the parse agree with each other perfectly.

       Word in particular carries constructs this schema has no node for. The
       writer's own text is the one thing that must not disappear quietly, so the
       paste is compared the same way the gate compares: the words the clipboard
       carried against the words the parse kept. This REPORTS; it never blocks or
       rewrites a paste, because a writer mid-thought must not be interrupted by
       a refusal, and because the comparison is a word count rather than a
       diff — precise enough to say "something was dropped", not to say what. */
    const [pasteNotice, setPasteNotice] = useState<string | null>(null);
    /* Outcomes of governed actions the footer cannot carry: a refused track
       toggle, a comment that was not anchored. Rendered like the paste notice. */
    const [actionNotice, setActionNotice] = useState<string | null>(null);
    const pastedHtmlRef = useRef<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const insertImageFile = useCallback(
      async (file: File): Promise<boolean> => {
        if (!imagesApi || !editor || readOnly) return false;
        if (!IMG_MIME.test(file.type)) {
          setImgNotice(
            `“${file.name}” is ${file.type || 'of unknown type'} — only PNG, JPEG and GIF images can be inserted, because they are the formats a Word export can embed. Nothing was uploaded.`,
          );
          return false;
        }
        if (file.size > IMG_MAX_BYTES) {
          setImgNotice(
            `“${file.name}” is ${(file.size / (1024 * 1024)).toFixed(1)} MB — the image store accepts up to 8 MB. Nothing was uploaded.`,
          );
          return false;
        }
        setImgNotice(null);
        try {
          const { url } = await imagesApi.upload(file);
          editor
            .chain()
            .focus()
            .insertAuthoringImage({ src: url, alt: file.name.replace(/\.[a-z0-9]+$/i, '') })
            .run();
          return true;
        } catch (e) {
          setImgNotice(
            'The image was not uploaded — ' +
              redactInternals(e instanceof Error ? e.message : '', 'the image store refused it') +
              '. Nothing was inserted.',
          );
          return false;
        }
      },
      [imagesApi, editor, readOnly],
    );

    /* Paste/drop handlers are constructed once inside useEditor; these refs
       keep them reading the current props instead of the first render's. */
    const insertImageFileRef = useRef(insertImageFile);
    const imagesEnabledRef = useRef(!!imagesApi && !readOnly);
    useEffect(() => {
      insertImageFileRef.current = insertImageFile;
      imagesEnabledRef.current = !!imagesApi && !readOnly;
    });

    /* ── Suggestion review actions ── */
    const resolveOne = useCallback(
      (r: SuggestionRange, action: 'accept' | 'reject') => {
        editor?.chain().focus().resolveSuggestion(r, action).run();
      },
      [editor],
    );
    const resolveAll = useCallback(
      (action: 'accept' | 'reject') => {
        editor?.chain().focus().resolveAllSuggestions(action).run();
        setReviewOpen(false);
      },
      [editor],
    );
    const jumpTo = useCallback(
      (r: SuggestionRange) => {
        editor?.chain().focus().setTextSelection({ from: r.from, to: r.to }).scrollIntoView().run();
      },
      [editor],
    );

    const isEmpty = editorReady && docEmpty && canvasSettled;
    const full = chrome === 'full';


    const blockValue = !editor
      ? 'p'
      : editor.isActive('heading', { level: 1 })
        ? 'h1'
        : editor.isActive('heading', { level: 2 })
          ? 'h2'
          : editor.isActive('heading', { level: 3 })
            ? 'h3'
            : editor.isActive('heading', { level: 4 })
              ? 'h4'
              : editor.isActive('heading', { level: 5 })
                ? 'h5'
                : 'p';

    return (
      <div className="rse-root" onKeyDown={onKeyDown}>
        {/* ── Fail-closed notice: rich mode refused for this content ── */}
        {boot.mode === 'source' && (
          <div className="rse-gate" role="status">
            Rich editing is off for this section: its stored content could not be
            represented without altering{' '}
            {boot.verdict && boot.verdict.structuralDrift.length > 0
              ? structuralDriftLabel(boot.verdict.structuralDrift)
              : 'text'}{' '}
            (the round-trip check failed), so you are editing the raw source
            instead. Nothing was rewritten.
          </div>
        )}

        {/* ── Image refusal / failure notice (fail closed, stated) ── */}
        {imgNotice && (
          <div className="rse-gate" role="status">
            <span style={{ flex: 1 }}>{imgNotice}</span>
            <button type="button" className="rse-link" onClick={() => setImgNotice(null)}>
              Dismiss
            </button>
          </div>
        )}

        {/* ── Paste fidelity notice (reports, never blocks) ── */}
        {pasteNotice && (
          <div className="rse-gate" role="status">
            <span style={{ flex: 1 }}>{pasteNotice}</span>
            <button type="button" className="rse-link" onClick={() => setPasteNotice(null)}>
              Dismiss
            </button>
          </div>
        )}
        {actionNotice && (
          <div className="rse-gate" role="alert">
            <span style={{ flex: 1 }}>{actionNotice}</span>
            <button type="button" className="rse-link" onClick={() => setActionNotice(null)}>
              Dismiss
            </button>
          </div>
        )}

        {/* ── Crash-cache restore offer (explicit, never silent) ── */}
        {restoreOffer != null && (
          <div className="rse-gate" role="status">
            A draft cached on this device differs from the saved section.
            <button type="button" className="rse-link" onClick={restoreCached}>
              Restore the device draft
            </button>
            <button type="button" className="rse-link" onClick={discardCached}>
              Discard it
            </button>
          </div>
        )}

        {/* ── Ribbon ── */}
        {full && boot.mode === 'rich' && !readOnly && (
          <div className="rse-ribbon" role="toolbar" aria-label="Formatting">
            <select
              className="rse-sel"
              value={blockValue}
              aria-label="Paragraph style"
              onChange={(e) => {
                const v = e.target.value;
                if (!editor) return;
                if (v === 'p') editor.chain().focus().setParagraph().run();
                else editor.chain().focus().toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 | 4 | 5 }).run();
              }}
            >
              <option value="p">Paragraph</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
              <option value="h4">Heading 4</option>
              <option value="h5">Heading 5</option>
            </select>
            <span className="rse-sep" />
            <RB title="Bold" shortcut="⌘B" active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}>
              <b>B</b>
            </RB>
            <RB title="Italic" shortcut="⌘I" active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}>
              <i>I</i>
            </RB>
            <RB title="Underline" shortcut="⌘U" active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
              <span style={{ textDecoration: 'underline' }}>U</span>
            </RB>
            <RB title="Superscript" shortcut="⌘." active={editor?.isActive('superscript')} onClick={() => editor?.chain().focus().toggleSuperscript().run()}>
              <span>
                x<sup>2</sup>
              </span>
            </RB>
            <RB title="Subscript" shortcut="⌘," active={editor?.isActive('subscript')} onClick={() => editor?.chain().focus().toggleSubscript().run()}>
              <span>
                x<sub>2</sub>
              </span>
            </RB>
            <RB title="Highlight" active={editor?.isActive('highlight')} onClick={() => editor?.chain().focus().toggleHighlight().run()}>
              <span className="rse-hl-glyph">ab</span>
            </RB>
            <span className="rse-sep" />
            <RB title="Bullet list" shortcut="⌘⇧8" active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
              {I.listBullet}
            </RB>
            <RB title="Numbered list" shortcut="⌘⇧7" active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
              {I.listOrdered}
            </RB>
            <span className="rse-sep" />
            <RB title="Align left" active={editor?.isActive({ textAlign: 'left' })} onClick={() => editor?.chain().focus().setTextAlign('left').run()}>
              {I.alignLeft}
            </RB>
            <RB title="Align center" active={editor?.isActive({ textAlign: 'center' })} onClick={() => editor?.chain().focus().setTextAlign('center').run()}>
              {I.alignCenter}
            </RB>
            <RB title="Align right" active={editor?.isActive({ textAlign: 'right' })} onClick={() => editor?.chain().focus().setTextAlign('right').run()}>
              {I.alignRight}
            </RB>
            <RB
              title={editor?.isActive('link') ? 'Edit or remove the link' : 'Insert a link'}
              active={editor?.isActive('link') || linkOpen}
              disabled={
                !linkOpen &&
                !editor?.isActive('link') &&
                editor?.state.selection.from === editor?.state.selection.to
              }
              onClick={() => (linkOpen ? closeLink() : openLink())}
            >
              {I.link}
            </RB>
            {crossRefsApi && (
              <RB
                title="Insert a cross-reference to another section"
                active={xrefOpen}
                onClick={() => (xrefOpen ? closeXref() : openXref())}
              >
                § Ref
              </RB>
            )}
            {citationsApi && (
              <RB
                title="Cite a source — inserts a numbered citation and adds the source to this document’s reference list"
                active={citeOpen}
                onClick={() => (citeOpen ? closeCite() : openCite())}
              >
                Cite
              </RB>
            )}
            <span className="rse-sep" />
            {/* A CTD dossier is a tabular document — Module 3 most of all. The
                editor could round-trip and export tables before it could make
                one; this is the making (BP-W1-1). */}
            {!editor?.isActive('table') ? (
              <RB
                title="Insert table (3 columns × 3 rows, header row)"
                onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
              >
                {I.table} Table
              </RB>
            ) : (
              <>
                <RB title="Add row below" onClick={() => editor?.chain().focus().addRowAfter().run()}>
                  +Row
                </RB>
                <RB title="Add column right" onClick={() => editor?.chain().focus().addColumnAfter().run()}>
                  +Col
                </RB>
                <RB title="Delete row" onClick={() => editor?.chain().focus().deleteRow().run()}>
                  −Row
                </RB>
                <RB title="Delete column" onClick={() => editor?.chain().focus().deleteColumn().run()}>
                  −Col
                </RB>
                {/* A CTD specification table is written with spanning headers
                    ("Acceptance criteria" over three columns). The commands
                    shipped with TableKit from day one; the ribbon never
                    offered them. */}
                <RB
                  title="Merge the selected cells"
                  disabled={!editor?.can().mergeCells()}
                  onClick={() => editor?.chain().focus().mergeCells().run()}
                >
                  Merge
                </RB>
                <RB
                  title="Split the merged cell"
                  disabled={!editor?.can().splitCell()}
                  onClick={() => editor?.chain().focus().splitCell().run()}
                >
                  Split
                </RB>
                <RB title="Toggle header row" onClick={() => editor?.chain().focus().toggleHeaderRow().run()}>
                  Hdr
                </RB>
                <RB title="Toggle header column" onClick={() => editor?.chain().focus().toggleHeaderColumn().run()}>
                  HdrCol
                </RB>
                <RB title="Delete table" onClick={() => editor?.chain().focus().deleteTable().run()}>
                  {I.close}
                </RB>
              </>
            )}
            {imagesApi && (
              <RB
                title="Insert an image (PNG, JPEG or GIF — stored in the tenant's governed image store)"
                onClick={() => fileInputRef.current?.click()}
              >
                {I.image}
              </RB>
            )}
            {/* A table and a figure in a CTD document are NUMBERED objects a
                reviewer navigates by. The number is drawn from position; this
                is where the words beside it are written. */}
            <RB
              title={
                captionSubject
                  ? `Caption this ${captionSubject.kind} — it is numbered by its position in the document`
                  : 'Caption a table or figure — put the cursor in a table, or select a figure'
              }
              active={captionOpen}
              disabled={!captionSubject}
              onClick={() => (captionOpen ? closeCaption() : openCaption())}
            >
              Caption
            </RB>
            <select
              className="rse-sel"
              value=""
              aria-label="Insert symbol"
              title="Insert a symbol"
              onChange={(e) => {
                const ch = e.target.value;
                if (ch && editor) editor.chain().focus().insertContent(ch).run();
                e.target.value = '';
              }}
            >
              <option value="">Ω…</option>
              {['±', '°', 'µ', '≤', '≥', '×', '≈', '½', 'α', 'β', 'γ', 'Δ'].map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
            <span className="rse-sep" />
            <RB title="Undo" shortcut="⌘Z" onClick={() => editor?.chain().focus().undo().run()}>
              {I.undo}
            </RB>
            <RB title="Redo" shortcut="⌘⇧Z" onClick={() => editor?.chain().focus().redo().run()}>
              {I.redo}
            </RB>
            <span className="rse-sep" />
            <RB title="Find & replace (Ctrl/⌘-F)" active={findOpen} onClick={() => (findOpen ? closeFind() : openFind())}>
              {I.search}
            </RB>
            {onAsk && (
              <>
                <span className="rse-sep" />
                {/* THIS CONTROL WAS LABELLED "Cite" AND CITED NOTHING. It sends
                    the selected sentence to the assistant pane as a question;
                    it creates no citation, stores nothing, numbers nothing and
                    puts nothing in the reference list. With a control beside it
                    that does cite, a label claiming this one does too is not a
                    naming quibble — it is a writer believing a claim is sourced
                    when the filed document has no record of it. The label now
                    says what it does. */}
                <RB
                  title="Ask AnA to suggest a source for the selected claim — this does not insert a citation"
                  onClick={askForSource}
                >
                  Ask for a source
                </RB>
              </>
            )}
            {commentsApi && (
              <RB title="Comment on the selection" onClick={() => void commentOnSelection()}>
                Comment
              </RB>
            )}
            <span style={{ flex: 1 }} />
            {suggestions.length > 0 && (
              <button
                type="button"
                className="rse-chip"
                onClick={() => setReviewOpen((o) => !o)}
                aria-expanded={reviewOpen}
              >
                {suggestions.length} suggested edit{suggestions.length === 1 ? '' : 's'}
              </button>
            )}
            {track && (
              <label className="rse-track" title="Suggest text edits instead of applying them. Edits within a paragraph are captured as attributed suggestions; structural changes (paragraph joins and splits, table changes) and formatting apply directly and are not tracked.">
                <input type="checkbox" checked={trackOn} onChange={() => void toggleTrack()} />
                Track changes
              </label>
            )}
          </div>
        )}

        {/* ── Suggestion review strip ── */}
        {full && reviewOpen && suggestions.length > 0 && (
          <div className="rse-review" role="region" aria-label="Suggested edits">
            <div className="rse-review-h">
              <span>Suggested edits</span>
              <span style={{ flex: 1 }} />
              <button type="button" className="rse-link" onClick={() => resolveAll('accept')}>
                Accept all
              </button>
              <button type="button" className="rse-link" onClick={() => resolveAll('reject')}>
                Reject all
              </button>
            </div>
            {suggestions.map((s, i) => (
              <div key={`${s.from}-${i}`} className="rse-review-row">
                <button type="button" className="rse-review-jump" onClick={() => jumpTo(s)} title="Show in the text">
                  <span className="rse-review-kind" data-kind={s.kind}>
                    {s.kind === 'insertion' ? 'insert' : 'delete'}
                  </span>
                  <span className="rse-review-by">{s.authorName ?? 'Unknown author'}</span>
                  <span className="rse-review-txt">{s.text.slice(0, 80) || '(formatting)'}</span>
                </button>
                <button type="button" className="rse-link" onClick={() => resolveOne(s, 'accept')}>
                  Accept
                </button>
                <button type="button" className="rse-link" onClick={() => resolveOne(s, 'reject')}>
                  Reject
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Find & replace bar ──
            Works read-only too (finding is not editing); the replace half is
            drawn only when the canvas is editable. Enter finds the next match,
            Shift-Enter the previous, Escape closes and clears the highlights.
            The editor selection follows the focused match; DOM focus stays
            here so the keys keep cycling. */}
        {findOpen && boot.mode === 'rich' && (
          <div
            className="rse-find"
            role="search"
            aria-label="Find in this section"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeFind();
              }
            }}
          >
            <input
              ref={findInputRef}
              className="rse-find-input"
              type="text"
              placeholder="Find in this section…"
              aria-label="Text to find"
              value={findQuery}
              onChange={(e) => onFindQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) editor?.commands.findPrevious();
                  else editor?.commands.findNext();
                }
              }}
            />
            <span className="rse-find-count" aria-live="polite">
              {findQuery
                ? findInfo.count === 0
                  ? 'No matches'
                  : `${findInfo.active + 1} of ${findInfo.count}`
                : ''}
            </span>
            <RB title="Previous match (Shift-Enter)" disabled={findInfo.count === 0} onClick={() => editor?.commands.findPrevious()}>
              ‹
            </RB>
            <RB title="Next match (Enter)" disabled={findInfo.count === 0} onClick={() => editor?.commands.findNext()}>
              ›
            </RB>
            <RB title="Match case" active={findCase} onClick={toggleFindCase}>
              Aa
            </RB>
            {!readOnly && (
              <>
                <span className="rse-sep" />
                <input
                  className="rse-find-input"
                  type="text"
                  placeholder="Replace with…"
                  aria-label="Replacement text"
                  value={replaceWith}
                  onChange={(e) => setReplaceWith(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      editor?.commands.replaceActiveMatch(replaceWith);
                    }
                  }}
                />
                <button
                  type="button"
                  className="rse-link"
                  disabled={findInfo.active < 0}
                  onClick={() => editor?.commands.replaceActiveMatch(replaceWith)}
                >
                  Replace
                </button>
                <button
                  type="button"
                  className="rse-link"
                  disabled={findInfo.count === 0}
                  title="One transaction — a single undo restores everything"
                  onClick={() => editor?.commands.replaceAllMatches(replaceWith)}
                >
                  Replace all{findInfo.count > 1 ? ` (${findInfo.count})` : ''}
                </button>
                {trackOn && findInfo.count > 0 && (
                  <span className="rse-find-note" title="Replacements are captured as attributed suggestions; the replaced text stays visible, struck through, until each edit is accepted or rejected.">
                    replacements are tracked
                  </span>
                )}
              </>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" className="rse-link" aria-label="Close find" onClick={closeFind}>
              {I.close}
            </button>
          </div>
        )}

        {/* ── Link bar ── */}
        {linkOpen && boot.mode === 'rich' && !readOnly && (
          <div
            className="rse-find"
            role="group"
            aria-label="Link"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeLink();
              }
            }}
          >
            <span className="rse-find-label">{I.link} Link</span>
            <input
              ref={linkInputRef}
              className="rse-find-input"
              type="text"
              inputMode="url"
              placeholder="https://…"
              aria-label="Link URL"
              value={linkHref}
              onChange={(e) => {
                setLinkHref(e.target.value);
                setLinkError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyLink();
                }
              }}
            />
            <button type="button" className="rse-link" onClick={applyLink}>
              Apply
            </button>
            {editor?.isActive('link') && (
              <button type="button" className="rse-link" onClick={removeLink}>
                Remove link
              </button>
            )}
            {linkError && (
              <span className="rse-find-err" role="alert">
                {linkError}
              </span>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" className="rse-link" aria-label="Close link editor" onClick={closeLink}>
              {I.close}
            </button>
          </div>
        )}

        {/* ── Caption bar ── */}
        {captionOpen && boot.mode === 'rich' && !readOnly && (
          <div
            className="rse-find"
            role="group"
            aria-label="Caption"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeCaption();
              }
            }}
          >
            <span className="rse-find-label">
              {captionSubject?.kind === 'figure' ? 'Figure caption' : 'Table caption'}
            </span>
            <input
              ref={captionInputRef}
              className="rse-find-input"
              style={{ flex: '1 1 320px' }}
              aria-label="Caption text"
              placeholder="Summary of adverse events"
              value={captionText}
              onChange={(e) => {
                setCaptionText(e.target.value);
                setCaptionError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyCaption();
                }
              }}
            />
            <button type="button" className="rse-link" onClick={applyCaption}>
              Apply
            </button>
            {/* Said here rather than left for the writer to wonder about: the
                number is not typed and cannot be. */}
            <span className="rse-find-note">
              Numbered automatically by position in the document.
            </span>
            {captionError && (
              <span className="rse-find-err" role="alert">
                {captionError}
              </span>
            )}
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="rse-link"
              aria-label="Close caption editor"
              onClick={closeCaption}
            >
              {I.close}
            </button>
          </div>
        )}

        {/* ── Cross-reference bar ── */}
        {xrefOpen && crossRefsApi && boot.mode === 'rich' && !readOnly && (
          <div
            className="rse-find"
            role="group"
            aria-label="Cross-reference"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeXref();
              }
            }}
          >
            <span className="rse-find-label">§ Cross-reference</span>
            {xrefChoices.length > 0 ? (
              <>
                <select
                  ref={xrefSelectRef}
                  className="rse-sel"
                  style={{ flex: '0 1 320px', height: 24 }}
                  aria-label="Section, table or figure to reference"
                  value={xrefTarget}
                  onChange={(e) => {
                    setXrefTarget(e.target.value);
                    setXrefError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyXref();
                    }
                  }}
                >
                  {crossRefSections && crossRefSections.length > 0 && (
                    <optgroup label="Sections">
                      {crossRefSections.map((sec) => (
                        <option key={sec.id} value={sec.id}>
                          {crossReferenceText(sec, 'code-title') || 'Untitled section'}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {/* A captioned table or figure is a target exactly as a
                      section is, and the number shown here is the one the
                      filing prints — it is derived from position, not typed. */}
                  {captionTargetList.length > 0 && (
                    <optgroup label="Tables and figures">
                      {captionTargetList.map((t) => (
                        <option key={t.id} value={t.id}>
                          {crossReferenceText(t, 'code-title')}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <select
                  className="rse-sel"
                  aria-label="How much of the target to show"
                  value={xrefDisplay}
                  onChange={(e) =>
                    setXrefDisplay(normalizeCrossReferenceDisplay(e.target.value))
                  }
                >
                  <option value="code-title">Number and title</option>
                  <option value="code">Number only</option>
                </select>
                <button type="button" className="rse-link" onClick={applyXref}>
                  Insert
                </button>
              </>
            ) : (
              /* Nothing to reference is a real state, said plainly rather
                 than shown as an empty picker that looks broken. */
              <span className="rse-find-note">
                This document has no other sections, tables or figures to reference yet.
              </span>
            )}
            {xrefError && (
              <span className="rse-find-err" role="alert">
                {xrefError}
              </span>
            )}
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="rse-link"
              aria-label="Close cross-reference picker"
              onClick={closeXref}
            >
              {I.close}
            </button>
          </div>
        )}

        {/* ── Citation bar ── */}
        {citeOpen && citationsApi && boot.mode === 'rich' && !readOnly && (
          <div
            className="rse-find"
            role="group"
            aria-label="Cite a source"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeCite();
              }
            }}
          >
            <span className="rse-find-label">Cite</span>
            {citationSources && citationSources.length > 0 ? (
              <>
                <select
                  ref={citeSelectRef}
                  className="rse-sel"
                  style={{ flex: '0 1 320px', height: 24 }}
                  aria-label="Source to cite"
                  value={citeSource}
                  onChange={(e) => {
                    setCiteSource(e.target.value);
                    setCiteError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyCite();
                    }
                  }}
                >
                  {citationSources.map((src) => (
                    <option key={src.id} value={src.id}>
                      {citationSourceName(src) || 'Untitled source'}
                    </option>
                  ))}
                </select>
                <input
                  className="rse-find-input"
                  type="text"
                  style={{ flex: '0 1 180px' }}
                  aria-label="Page or table within the source (optional)"
                  placeholder="p. 142, Table 3 (optional)"
                  value={citeLocator}
                  onChange={(e) => setCiteLocator(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyCite();
                    }
                  }}
                />
                <button type="button" className="rse-link" onClick={applyCite}>
                  Insert
                </button>
              </>
            ) : (
              /* No sources is a real state, said plainly rather than shown as an
                 empty picker that looks broken. */
              <span className="rse-find-note">
                No sources are available to this document yet. Add one in the
                Sources panel, then cite it here.
              </span>
            )}
            {citeError && (
              <span className="rse-find-err" role="alert">
                {citeError}
              </span>
            )}
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="rse-link"
              aria-label="Close the citation picker"
              onClick={closeCite}
            >
              {I.close}
            </button>
          </div>
        )}

        {/* ── Canvas ── */}
        <div className="rse-body" ref={editorHostRef}>
          {boot.mode === 'source' ? (
            <textarea
              className="rse-source"
              value={sourceText}
              readOnly={readOnly}
              aria-label={ariaLabel ?? 'Section source'}
              onChange={(e) => {
                setSourceText(e.target.value);
                const isDirty = e.target.value !== lastSavedRef.current;
                setDirty(isDirty);
                setSaveState(isDirty ? 'dirty' : 'saved');
                if (storageKey) {
                  try {
                    if (isDirty) localStorage.setItem(cacheKeyFor(storageKey), e.target.value);
                    else localStorage.removeItem(cacheKeyFor(storageKey));
                  } catch {
                    /* ignore */
                  }
                }
                if (autosaveMs != null && isDirty) {
                  if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
                  pendingAutosaveRef.current = e.target.value;
                  autosaveTimer.current = setTimeout(() => void doSave(), autosaveMs);
                }
              }}
            />
          ) : (
            <>
              {isEmpty && !readOnly && onAsk && (
                <div className="rse-empty-cta">
                  <button
                    type="button"
                    className="rse-link"
                    onClick={() => onAsk('Draft this section from the linked section evidence.')}
                  >
                    Draft with AnA
                  </button>
                </div>
              )}
              {lineage ? (
                <DataOriginsMenu
                  documentTable={lineage.documentTable}
                  documentId={lineage.documentId}
                  documentTitle={lineage.documentTitle}
                  canonicalText={lineage.canonicalText}
                >
                  <EditorContent editor={editor} aria-label={ariaLabel} />
                </DataOriginsMenu>
              ) : (
                <EditorContent editor={editor} aria-label={ariaLabel} />
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {full && (
          <div className="rse-foot">
            <span className="rse-save">
              <span className="rse-dot" style={{ background: canvasSettled ? SAVE_META[saveState].dot : 'var(--warning)' }} />
              {canvasSettled ? SAVE_META[saveState].label : 'Waiting for live sync — the canvas is locked until this section arrives'}
            </span>
            <span className="rse-foot-sep" aria-hidden="true">{'·'}</span>
            <span>
              {canvasSettled ? `${displayWords.toLocaleString()} words` : 'word count pending'}
              {canvasSettled && suggestions.length > 0 ? ' (including suggested edits)' : ''}
            </span>
            {trackOn && (
              <>
                <span className="rse-foot-sep" aria-hidden="true">{'·'}</span>
                <span style={{ color: 'var(--warning)', fontWeight: 600 }} title="Text edits within a paragraph are captured; structural and formatting changes apply directly">Track changes on (text edits)</span>
              </>
            )}
            {collabStatus !== 'off' && boot.mode === 'source' && (
              <>
                <span className="rse-foot-sep" aria-hidden="true">{'·'}</span>
                {/* The textarea is not bound to the shared document: nothing the
                    author types here is synced, and a save replaces the section
                    wholesale. "Live sync connected" was rendered regardless. */}
                <span data-collab="source">Live sync unavailable in source mode — editing solo; a save replaces the section</span>
              </>
            )}
            {collabStatus !== 'off' && boot.mode === 'rich' && (
              <>
                <span className="rse-foot-sep" aria-hidden="true">{'·'}</span>
                <span data-collab={collabStatus}>
                  {collabStatus === 'connected'
                    ? 'Live sync connected'
                    : collabStatus === 'connecting'
                      ? 'Live sync connecting…'
                      : collabStatus === 'denied'
                        ? 'Live sync refused — editing solo'
                        : 'Live sync offline — editing solo'}
                </span>
              </>
            )}
            <span style={{ flex: 1 }} />
            {autosaveMs == null && !readOnly && showSaveButton && (
              <button type="button" className="rse-link" onClick={() => void doSave()} disabled={!dirty || saveState === 'saving'}>
                {saveState === 'saving' ? 'Saving…' : 'Save (⌘S)'}
              </button>
            )}
          </div>
        )}

        {imagesApi && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif"
            style={{ display: 'none' }}
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void insertImageFile(f);
              e.target.value = '';
            }}
          />
        )}

      </div>
    );
  },
);
