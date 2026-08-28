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
import type { JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { Collaboration } from '@tiptap/extension-collaboration';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';

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
} from './roundTrip';
import { FindReplace, getFindState } from './findReplace';
import { AuthoringImage } from './imageNode';
import { CrossReference } from './crossReferenceNode';
import {
  crossReferenceLookupFor,
  crossReferenceText,
  normalizeCrossReferenceDisplay,
  type CrossReferenceDisplay,
  type CrossReferenceLookup,
} from '@shared/authoring/cross-references';
import { I } from '../icons';

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
  onSave: (serialized: string) => void | Promise<void>;
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

/** Text of a parsed TipTap JSON doc, every element boundary a break — the
 *  comparison normalizes whitespace, so all that matters is that words from
 *  adjacent blocks never fuse. */
function jsonDocText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  /* A cross-reference is a leaf: its text is RESOLVED at render time and is not
     in the parsed content. Without this the fidelity gate would compare the
     stored `<a data-xref>2.7.4.2</a>` against nothing, call the parse lossy,
     and drop every section holding a reference into raw source mode — the
     capability would disable the editor it ships in. The cached label is the
     right thing to compare here precisely because the gate's question is
     "did the parse keep what was stored", not "is the cache current". */
  if (node.type === 'crossReference') return String(node.attrs?.label ?? '');
  const inner = (node.content ?? []).map(jsonDocText).join('');
  return node.type === 'doc' ? inner : inner + '\n';
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
    const crossRefLookup = useMemo<CrossReferenceLookup | null>(
      () => (crossRefSections ? crossReferenceLookupFor(crossRefSections) : null),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [crossRefKey],
    );
    const crossRefLookupRef = useRef<CrossReferenceLookup | null>(crossRefLookup);
    crossRefLookupRef.current = crossRefLookup;
    /** Live node views to repaint when the directory changes. */
    const crossRefRepaint = useRef<Set<() => void>>(new Set());
    useEffect(() => {
      for (const paint of crossRefRepaint.current) paint();
    }, [crossRefKey]);

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
        TableKit.configure({ table: { resizable: false } }),
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
        // Plain text is always faithfully representable.
        return { mode: 'rich' as const, html: plainTextToHtml(stored), verdict: null };
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
        const verdict = assessFidelity(stored, jsonDocText(json));
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
          setSaveState((s) => (isDirty ? (s === 'saving' ? s : 'dirty') : 'saved'));
          setWords(wordsOf(ed.getText()));
          setDocEmpty(ed.isEmpty);
          setSuggestions(collectSuggestions(ed.state.doc));
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
          setEditorReady(true);
        },
      },
      [],
    );

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
      const shouldEdit = !readOnly && boot.mode === 'rich';
      if (editor.isEditable !== shouldEdit) editor.setEditable(shouldEdit);
    }, [editor, readOnly, boot.mode]);

    /* Seed a first-ever collab doc from the stored content once synced. */
    useEffect(() => {
      if (!collabRuntime || !editor) return;
      const onSynced = () => {
        const frag = collabRuntime.doc.getXmlFragment('default');
        if (frag.length === 0 && boot.html) {
          editor.commands.setContent(boot.html);
        }
        // Whether seeded here or adopted from peers, what the synced doc
        // holds now is the clean baseline for dirty-tracking.
        lastSavedRef.current = serializeEditor(editor, format);
        setDirty(false);
        setSaveState('saved');
      };
      collabRuntime.provider.on('synced', onSynced);
      return () => {
        collabRuntime.provider.off('synced', onSynced);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collabRuntime, editor]);

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
    const doSave = useCallback(async (): Promise<boolean> => {
      const serialized =
        boot.mode === 'source' ? sourceText : editor ? serialize(editor) : null;
      if (serialized == null) return false;
      // Whatever a debounce was armed for, this write supersedes it.
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      pendingAutosaveRef.current = null;
      if (serialized === lastSavedRef.current) return true;
      setSaveState('saving');
      try {
        await onSave(serialized);
        lastSavedRef.current = serialized;
        setDirty(false);
        onDirtyChange?.(false);
        setSaveState('saved');
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
       component that is going away. A rejection is not swallowed silently: the
       device cache still holds the text and the next mount offers it back. */
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
      try {
        await track.onToggle?.(next);
        setTrackOn(next);
        editor.commands.setTrackChangesEnabled(next && !readOnly);
      } catch {
        /* refused server-side — state stays truthful */
      }
    }, [track, editor, trackOn, readOnly]);

    /* ── Comment from selection ──
       The host resolves the server comment id (the thread row must exist
       before anything references it). The anchor mark is then applied and the
       section saved immediately: an anchor that exists only in unsaved state
       is a highlight the next reader would never see. */
    const commentOnSelection = useCallback(async () => {
      if (!commentsApi || !editor) return;
      const { from, to } = editor.state.selection;
      if (from === to) return;
      const quote = editor.state.doc.textBetween(from, to, ' ');
      const id = await commentsApi.onCreate({ kind: 'text-range', quote, from, to });
      if (id) {
        editor.chain().focus().setTextSelection({ from, to }).setCommentAnchor(id).run();
        await doSave();
      }
    }, [commentsApi, editor, doSave]);

    /* ── Cite the selection (parity with the retired DocCanvas) ── */
    const citeSelection = useCallback(() => {
      if (!editor || !onAsk) return;
      const { from, to } = editor.state.selection;
      const s = editor.state.doc.textBetween(from, to, ' ').trim();
      if (s) onAsk(`Cite this claim: "${s}"`);
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

    const openXref = useCallback(() => {
      setXrefError(null);
      setXrefTarget((t) => t || crossRefSections?.[0]?.id || '');
      setXrefOpen(true);
    }, [crossRefSections]);

    useEffect(() => {
      if (xrefOpen) xrefSelectRef.current?.focus();
    }, [xrefOpen]);

    const closeXref = useCallback(() => {
      setXrefOpen(false);
      editor?.commands.focus();
    }, [editor]);

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
          'That section is no longer in this document. Nothing was inserted — reopen the list and choose again.',
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
              (e instanceof Error ? e.message : String(e)) +
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

    const isEmpty = editorReady && docEmpty;
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
            represented without altering text (the round-trip check failed), so
            you are editing the raw source instead. Nothing was rewritten.
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
                <RB title="Cite the selected claim" onClick={citeSelection}>
                  Cite
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
              <label className="rse-track" title="Suggest edits instead of applying them — every change is attributed and reviewable">
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
            {crossRefSections && crossRefSections.length > 0 ? (
              <>
                <select
                  ref={xrefSelectRef}
                  className="rse-sel"
                  style={{ flex: '0 1 320px', height: 24 }}
                  aria-label="Section to reference"
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
                  {crossRefSections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {crossReferenceText(sec, 'code-title') || 'Untitled section'}
                    </option>
                  ))}
                </select>
                <select
                  className="rse-sel"
                  aria-label="How much of the section to show"
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
              /* No sections to reference is a real state, said plainly rather
                 than shown as an empty picker that looks broken. */
              <span className="rse-find-note">
                This document has no other sections to reference yet.
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
              <span className="rse-dot" style={{ background: SAVE_META[saveState].dot }} />
              {SAVE_META[saveState].label}
            </span>
            <span className="rse-foot-sep">{'·'}</span>
            <span>{displayWords.toLocaleString()} words</span>
            {trackOn && (
              <>
                <span className="rse-foot-sep">{'·'}</span>
                <span style={{ color: 'var(--warning)', fontWeight: 600 }}>Track changes on</span>
              </>
            )}
            {collabStatus !== 'off' && (
              <>
                <span className="rse-foot-sep">{'·'}</span>
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

        <style>{`
        .rse-root { display:flex; flex-direction:column; min-height:0; background:var(--bg-000,#fff); border-radius:inherit; }
        .rse-gate { display:flex; gap:10px; align-items:baseline; padding:8px 12px; font-size:12px; color:var(--text-300,#475467); background:var(--bg-50,#f9fafb); border-bottom:1px solid var(--border,#e4e7ec); }
        .rse-ribbon { display:flex; align-items:center; gap:2px; padding:4px 8px; background:var(--bg-000,#fff); border-bottom:1px solid var(--border,#e4e7ec); flex-wrap:wrap; }
        .rse-sel { font-size:11px; border:1px solid var(--border-control,#d0d5dd); border-radius:4px; padding:2px 6px; background:var(--bg-50,#f9fafb); color:var(--text-100,#101828); cursor:pointer; height:24px; }
        .rse-sep { width:1px; height:18px; background:var(--border,#e4e7ec); margin:0 3px; }
        .rse-rb { min-width:24px; height:24px; padding:0 4px; font-size:12px; border:1px solid transparent; border-radius:4px; background:transparent; cursor:pointer; color:var(--text-200,#344054); display:inline-flex; align-items:center; justify-content:center; }
        .rse-rb[data-active] { background:var(--bg-100,#f2f4f7); border-color:var(--border,#e4e7ec); }
        .rse-chip { font-size:11px; height:24px; padding:0 10px; border-radius:12px; border:1px solid var(--warning,#b54708); color:var(--warning,#b54708); background:transparent; cursor:pointer; font-weight:600; }
        .rse-track { display:flex; align-items:center; gap:4px; font-size:10px; color:var(--text-400,#667085); cursor:pointer; margin-left:6px; }
        .rse-review { border-bottom:1px solid var(--border,#e4e7ec); background:var(--bg-50,#f9fafb); max-height:200px; overflow-y:auto; }
        .rse-review-h { display:flex; gap:10px; padding:6px 12px; font-size:11px; font-weight:600; color:var(--text-300,#475467); }
        .rse-review-row { display:flex; align-items:center; gap:8px; padding:4px 12px; font-size:12px; }
        .rse-review-jump { display:flex; align-items:baseline; gap:8px; flex:1; min-width:0; background:none; border:none; cursor:pointer; text-align:left; padding:0; }
        .rse-review-kind { font-size:10px; font-weight:700; text-transform:uppercase; }
        .rse-review-kind[data-kind="insertion"] { color:var(--success,#067647); }
        .rse-review-kind[data-kind="deletion"] { color:var(--error,#b42318); }
        .rse-review-by { font-weight:600; color:var(--text-200,#344054); white-space:nowrap; }
        .rse-review-txt { color:var(--text-300,#475467); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .rse-link { font-size:11px; border:none; background:none; color:var(--accent-100,#2563eb); cursor:pointer; padding:2px 4px; }
        .rse-link:disabled { color:var(--text-400,#667085); cursor:default; }
        .rse-find { display:flex; align-items:center; gap:6px; padding:6px 10px; background:var(--bg-50,#f9fafb); border-bottom:1px solid var(--border,#e4e7ec); flex-wrap:wrap; }
        .rse-find-label { display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:600; color:var(--text-300,#475467); }
        .rse-find-input { flex:0 1 220px; min-width:120px; height:24px; font-size:12px; padding:2px 8px; border:1px solid var(--border-control,#d0d5dd); border-radius:4px; background:var(--bg-000,#fff); color:var(--text-100,#101828); }
        .rse-find-count { font-size:11px; color:var(--text-400,#667085); min-width:64px; }
        .rse-find-err { font-size:11px; color:var(--error,#b42318); }
        .rse-find-note { font-size:10px; color:var(--warning,#b54708); }
        .rse-find-hit { background:color-mix(in srgb, var(--warning,#b54708) 25%, transparent); border-radius:2px; }
        .rse-find-hit-active { background:color-mix(in srgb, var(--warning,#b54708) 50%, transparent); box-shadow:0 0 0 1px var(--warning,#b54708); }
        .rse-hl-glyph { background:color-mix(in srgb, var(--warning,#b54708) 30%, transparent); padding:0 3px; border-radius:2px; }
        .rse-body { flex:1; min-height:0; overflow-y:auto; }
        .rse-body .tiptap { outline:none; min-height:320px; padding:18px 20px; font-size:14px; line-height:1.75; color:var(--text-100,#101828); font-family:var(--font-serif,Georgia,"Times New Roman",serif); }
        /* Measure lives on the prose blocks, not the canvas: a CTD table must be
           free to use the full column while paragraphs keep a readable line. */
        .rse-body .tiptap > p, .rse-body .tiptap > h1, .rse-body .tiptap > h2, .rse-body .tiptap > h3, .rse-body .tiptap > ul, .rse-body .tiptap > ol, .rse-body .tiptap > blockquote { max-width:78ch; }
        .rse-body .tiptap p { margin:0 0 12px; }
        .rse-body .tiptap h1 { font-size:18px; font-weight:700; margin:0 0 8px; }
        .rse-body .tiptap h2 { font-size:15px; font-weight:700; margin:20px 0 8px; }
        .rse-body .tiptap h3 { font-size:13px; font-weight:600; margin:16px 0 6px; }
        .rse-body .tiptap ul, .rse-body .tiptap ol { margin:0 0 12px 24px; }
        .rse-body .tiptap li { margin-bottom:6px; }
        .rse-body .tiptap table { width:100%; border-collapse:collapse; margin:16px 0; font-size:13px; }
        .rse-body .tiptap th { padding:8px 12px; background:var(--bg-50,#f9fafb); border:1px solid var(--border,#e4e7ec); font-weight:600; text-align:left; }
        .rse-body .tiptap td { padding:7px 12px; border:1px solid var(--border,#e4e7ec); }
        .rse-body .tiptap mark { background:color-mix(in srgb, var(--warning,#b54708) 28%, transparent); padding:0 1px; border-radius:2px; }
        .rse-img { margin:16px auto; max-width:100%; text-align:center; }
        .rse-img img { max-width:100%; height:auto; border-radius:4px; }
        .rse-img img:not([src]) { display:none; }
        .rse-img-status { display:block; font-size:11px; color:var(--text-400,#667085); padding:16px 12px; background:var(--bg-50,#f9fafb); border:1px dashed var(--border-control,#d0d5dd); border-radius:4px; }
        .rse-img[data-error="1"] .rse-img-status { color:var(--error,#b42318); border-color:var(--error,#b42318); }
        .rse-body .tiptap .ProseMirror-selectednode { outline:2px solid var(--accent-100,#2563eb); outline-offset:2px; border-radius:4px; }
        .rse-body .tiptap a { color:var(--accent-100,#2563eb); text-decoration:underline; text-underline-offset:2px; }
        .rse-body .tiptap .selectedCell { outline:2px solid color-mix(in srgb, var(--accent-100,#2563eb) 55%, transparent); outline-offset:-2px; }
        .rse-body .tiptap p.is-editor-empty:first-child::before { content:attr(data-placeholder); float:left; color:var(--text-400,#667085); pointer-events:none; height:0; }
        .rse-ins { background:color-mix(in srgb, var(--success,#067647) 14%, transparent); text-decoration:underline; text-decoration-color:var(--success,#067647); }
        .rse-del { background:color-mix(in srgb, var(--error,#b42318) 12%, transparent); text-decoration:line-through; text-decoration-color:var(--error,#b42318); }
        .rse-comment-anchor { background:color-mix(in srgb, var(--accent-100,#2563eb) 14%, transparent); border-bottom:1px dotted var(--accent-100,#2563eb); cursor:pointer; }
        /* A resolved cross-reference reads as a reference; a broken one reads as
           broken, in words. Colour is never the only signal — the missing state
           says what is wrong in full. */
        .rse-xref { color:var(--accent-100,#2563eb); border-bottom:1px solid color-mix(in srgb, var(--accent-100,#2563eb) 40%, transparent); white-space:nowrap; }
        .rse-xref[data-missing="1"] { color:var(--error,#b42318); border-bottom:1px dashed var(--error,#b42318); font-style:italic; white-space:normal; }
        .rse-source { width:100%; min-height:320px; resize:vertical; border:none; outline:none; padding:18px 20px; font-size:13px; line-height:1.6; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--text-100,#101828); background:var(--bg-000,#fff); }
        .rse-empty-cta { padding:10px 20px 0; }
        .rse-foot { display:flex; align-items:center; gap:8px; padding:6px 12px; background:var(--bg-000,#fff); border-top:1px solid var(--border,#e4e7ec); font-size:10px; color:var(--text-400,#667085); flex-wrap:wrap; }
        .rse-save { display:flex; align-items:center; gap:5px; }
        .rse-dot { width:6px; height:6px; border-radius:50%; display:inline-block; }
        .rse-foot-sep { color:var(--bg-200,#eaecf0); }
        `}</style>
      </div>
    );
  },
);
