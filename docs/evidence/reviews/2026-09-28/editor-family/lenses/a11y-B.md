# Accessibility lens: the editor family, RichSectionEditor, 2026-09-28

## Scope actually covered

**Read in full, at `7087f46e2`** (confirmed `git diff 7087f46e2 -- client/src/concept2cure/v2/editor/RichSectionEditor.tsx` is empty, i.e. HEAD == the reviewed commit for this file):
- `client/src/concept2cure/v2/editor/RichSectionEditor.tsx` — all 2,716 lines, in four contiguous passes (1–700, 701–1400, 1401–2100, 2101–2716).
- `client/src/concept2cure/v2/styles/rich-section-editor.css` — all 97 lines (the file's own stylesheet; load-bearing for focus-visibility, color-alone and target-size checks named in the lens).
- `client/src/concept2cure/v2/editor/crossReferenceNode.ts` (202 lines), `citationNode.ts` (294 lines), `imageNode.ts` (207 lines) — in full.
- `client/src/concept2cure/v2/toast.tsx` (152 lines) — in full, to verify the host-level live-region toast used by three of the four hosts.
- `client/src/concept2cure/mdx/hooks/useSectionSave.ts` (125 lines) — in full.
- `client/src/concept2cure/v2/__tests__/richSectionEditorUnsaved.test.tsx` (172 lines) — in full, to check my reading of the save/dirty contract against the component's own test suite.

**Read in the parts needed to trace a mutation, a click handler, or a claim made in RichSectionEditor.tsx** (per the charge's instruction to trace server-state claims, not to re-read whole neighboring files):
- `client/src/concept2cure/v2/editor/commentAnchor.ts` — lines 85–129 (the click-to-open-thread plugin).
- `shared/authoring/cross-references.ts` / `shared/authoring/citations.ts` — the `*_MISSING_TEXT` constants only.
- `client/src/concept2cure/v2/icons.tsx:133` — re-confirmed the 2026-09-28 report's claim that every glyph is `aria-hidden`/`focusable="false"` by construction. Holds.
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — **not** read line by line (~5,100 lines, out of this charge's file scope); targeted reads of the `RichSectionEditor` mount block (~3785–3910) and the callbacks it wires in: `saveSectionContent` (1976–2129 → `PATCH /api/authoring/sections/:id`), `requestAnchoredComment`/`openCommentFromAnchor` (2206–2225), the opening of `revert` (2234–2250 → `POST /api/authoring/sections/:id/revert`).
- `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx` — targeted: `saveContent` (357–378 → `PUT /api/coauthor/documents/:id`), the mount (933–963).
- `client/src/concept2cure/v2/surfaces/ProtocolDevSection.tsx` — targeted: the mount and refusal rendering (~71–188).
- `client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes.tsx` — targeted: `DDDocumentTab`/`DDSaveStatus`/`onCommitBody` (770–794, 907–987).
- `client/src/concept2cure/mdx/store/dossierStore.ts` — targeted: header (1–21) and `writeSectionBody` (280–296), plus a whole-file grep for `localStorage`/`sessionStorage`/`indexedDB` (zero hits).
- `client/src/concept2cure/lineage/DataOriginsMenu.tsx` (148 lines, in full) and `client/src/components/ui/context-menu.tsx` (first 40 lines) — to confirm the in-canvas right-click "menu" the lens names is a thin wrapper over `@radix-ui/react-context-menu`, not a hand-rolled one.
- `node_modules/@tiptap/react/src/EditorContent.tsx` — to settle exactly which DOM node an `aria-label` passed to `<EditorContent>` lands on.

**Grep-only (no Tab-keymap or `addKeyboardShortcuts` override found in any of them):** `suggestions.ts`, `roundTrip.ts`, `findReplace.ts`, `captionNumbering.ts`.

**Gates run** (read-only, no `--baseline`/`--write-baseline`):
- `npm run ci:token-contrast` → **PASS** — "67 pairs checked — text ≥ 4.5:1, non-text ≥ 3:1. 15 documented exceptions... held." Confirmed the specific pair the editor's focus ring depends on, `accent-main-200`/`bg-000`, is in that list (`scripts/ci/check-token-contrast.mjs:116`) at a documented 4.98:1 (`design-system/colors_and_type.css:96`), and that `--accent-200` (what `rich-section-editor.css` actually uses) is `var(--accent-main-200)` (`client/src/concept2cure/v2/styles/app-v2.css:22,63`).
- `npm run ci:check-chip-tones` → **PASS** — "139 literal tone use(s), all 28 resolve to a CSS rule."
- Both numbers are unchanged from the 2026-09-28 report, i.e. no regression on either gate since that pass.

**Also verified compliant while reading (stated so as not to imply I missed it, and so it isn't re-flagged as new by a later pass):**
- No `<div role="button">`/`role="tab"` pattern anywhere in the file — every clickable control is a real `<button>`, `<select>`, `<input>`, or `<label>` wrapping an `<input>`. No custom ARIA widget was built where a native element would do.
- No positive `tabIndex` anywhere; the only `tabIndex` in the file is `tabIndex={-1}` on the hidden, `aria-hidden`, `display:none` file-input (line 2704) — correct use.
- The ribbon's historically-documented bug ("every keystroke destroyed and rebuilt the ribbon's DOM, dropping focus to `<body>`"; "`onMouseDown`-only buttons were mouse-only", RichSectionEditor.tsx:384–412) is fixed and holds: `RB` is `React.memo`'d at module scope (413–448), activation is on `onClick` (fires identically for a real click and native Enter/Space on a `<button>`), and every ribbon action — including the ones that swap the "Insert table" button for a 7-button table-editing fragment at the same JSX position (1980–2029), the exact shape that could re-trigger the old bug — explicitly chains `.focus()` before its mutating command (verified for all of insertTable, addRowAfter, addColumnAfter, deleteRow, deleteColumn, mergeCells, splitCell, toggleHeaderRow, toggleHeaderColumn, deleteTable).
- `outline: none` on `.tiptap` and `.rse-source` (rich-section-editor.css:44, 89) is never bare — both are paired with an explicit `:focus-visible` replacement ring two lines later (47, 91), and that ring's color pair passes the contrast gate (above).
- Color is not the sole carrier for: save-state (dot + visible label text, 2650–2653), track-changes-on (text, 2662), suggestion insert/delete (literal words "insert"/"delete", 2143, plus underline-vs-strikethrough in CSS 70–71, not color alone), broken cross-references/citations (bracketed explanatory text — `CROSS_REFERENCE_MISSING_TEXT`/`CITATION_MISSING_TEXT`, see A-B-3 below), and image load failure (explicit status text, imageNode.ts:170,180,187).
- The non-modal inline bars (Find/Link/Caption/Cross-reference/Cite, 2165–2549) each scope their own `Escape` with `stopPropagation()` and return focus predictably (into the newly-opened input via a dedicated effect; into the editor canvas on close) — no keyboard trap, Tab moves freely.
- The find-match counter is `aria-live="polite"` (2194) — count changes are announced without moving focus.
- This file contains **no** signature ceremony, no "compare"/diff dialog, and no modal reason-for-change dialog at all — grepped case-insensitively; every "signature"/"compare" hit is the unrelated `StructuralSignature`/content-comparison machinery of the round-trip fidelity gate. The "restore" affordance (1872–1883) is a non-modal inline banner, not a dialog, so there is no focus trap to find there. These governed ceremonies live elsewhere (see "What I did NOT get to").

## Findings

| id | severity | file:line | summary |
|---|---|---|---|
| A-B-1 | **blocker** | `client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes.tsx:978-980` (root cause), `RichSectionEditor.tsx:182,1181-1202` (the defeated control) | The MDX dossier host's `onSave` never returns/awaits the real save, silently disarming RichSectionEditor's only loss-prevention guard for that host — a governed Part-11 dossier edit can be lost with no warning and no recoverable cache. |
| A-B-2 | medium | `client/src/concept2cure/v2/editor/commentAnchor.ts:109-128` | Opening a comment thread from its in-text highlight is wired only to `handleClickOn` (pointer/touch); no keyboard path exists to trigger it from the canvas. |
| A-B-3 | medium | `crossReferenceNode.ts:153-160`, `citationNode.ts:240-246` | Cross-reference and citation markers are `<a role="link">` with no `href` and no `tabIndex` — a role that asserts focusable/activatable behavior the element doesn't have. |
| A-B-4 | low (advisory) | `RichSectionEditor.tsx:876-880` vs `:2558` | The rich-mode canvas's accessible name depends entirely on the optional `ariaLabel` prop with no fallback, unlike source mode's `?? 'Section source'`. Not live today — all four call sites pass it. |
| A-B-5 | low (advisory) | `RichSectionEditor.tsx:1946-1957, 2005-2018` | Link/Merge/Split ribbon buttons disable with no persistently visible reason for a sighted keyboard-only user (contrast the Caption button, which does this correctly). |
| A-B-6 | advisory — exempted by this repo's own `SKILL.md` | `rich-section-editor.css:32` vs `:19` | `.rse-link` text-buttons render under WCAG 2.2 SC 2.5.8's 24×24px minimum (~17-19px); `.rse-rb` ribbon buttons meet it exactly. `SKILL.md` explicitly exempts "desktop... editor" from touch-target sizing, so disclosed, not filed as a defect. |

---

### A-B-1 — blocker: the MDX dossier host's save contract violation defeats RichSectionEditor's own loss-prevention guard

**What the code does.** RichSectionEditor.tsx documents its write-through explicitly:

```
182	  /** Governed write-through. Throw/reject on failure — the footer reports it. */
...
194	  onSave: (serialized: string, systemReason?: string) => void | Promise<void>;
```

`doSave` (1134–1175) `await`s `onSave(...)`; anything that returns without throwing is treated as confirmed — `lastSavedRef.current` is updated, `dirty` is cleared, `saveState` becomes `'saved'`. The component's only cross-navigation safety net follows `dirty` directly:

```
1191	    useEffect(() => {
1192	      if (!dirty || readOnly) return;
1193	      const onBeforeUnload = (e: BeforeUnloadEvent) => {
1194	        e.preventDefault();
1196	        // ...
1197	        e.returnValue = '';
1198	        return '';
1199	      };
1200	      window.addEventListener('beforeunload', onBeforeUnload);
1201	      return () => window.removeEventListener('beforeunload', onBeforeUnload);
1202	    }, [dirty, readOnly]);
```

`client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes.tsx` mounts this editor for the MDX dossier drawer with `chrome="bare"` (976, hiding RichSectionEditor's own footer), `autosaveMs={600}` (977), **no `storageKey`** (973–984 — so the device crash-cache described in the file's own header comment is off; `cacheDraft` at RichSectionEditor.tsx:1084 early-returns `if (!storageKey) return;`), and:

```
978	        onSave={(text) => {
979	          onCommit(text);
980	        }}
```

`onCommit` resolves to `onCommitBody` (786–794):

```
786	  const onCommitBody = (next: string) => {
787	    if (next === body) return;
792	    DossierStore.writeSectionBody(pathway, safeTarget.id, safeTarget.label, next, { who: 'You', role: 'Reg Lead' });
793	    void sectionSave.save(String(safeTarget.id), next);
794	  };
```

`sectionSave.save` — the real, governed write (`client/src/concept2cure/mdx/hooks/useSectionSave.ts:65-121`, `PATCH /api/c2c/documents/:id/sections/:key`, which per the hook's own header (1–27) sets Part-11 attribution GUCs and returns one of `idle/saving/saved/error`, `saved` only "after the server confirms") — is started and its promise is discarded with `void`. `onCommitBody` returns `undefined` before that PATCH settles, so `doSave`'s `await onSave(...)` resolves immediately, clearing `dirty` (and, via `onDirtyChange`, the host's own copy of `dirty`) well before the network round trip finishes. The optimistic write `onCommitBody` makes first, `DossierStore.writeSectionBody`, is not durable either: `dossierStore.ts`'s own header calls it "an in-memory file system" (line 2), and `writeSectionBody` (280–296) makes no `localStorage`/`sessionStorage`/`indexedDB` call (confirmed by a whole-file grep: zero hits).

**Why it matters to a regulated user.** `useSectionSave.ts`'s own header names this exact failure mode as the bug it was built to remove: "A user could spend an afternoon drafting a submission section and lose all of it while the UI told them, the whole time, that it was saved." That fix is correctly wired for the *visible* status line — `DDSaveStatus` in PathwayPanes.tsx (907–945) reads `sectionSave.state`, not RichSectionEditor's own signal, so a person watching that line does eventually see the truth. But the *silent* safety net that exists precisely for when nobody is watching — the browser's native "leave without saving?" prompt — is wired to RichSectionEditor's `dirty` flag, which this integration has made meaningless, and I found no second `beforeunload`/confirm/guard anywhere else in `PathwayPanes.tsx`. If the real `PATCH` fails (expired session, dropped connection, a frozen/locked section, a validation refusal) or is simply still in flight, and the person closes the tab or navigates within that window, nothing warns them, and the edit exists nowhere — not on the server, not in a device cache, not in the in-memory mirror once the page is gone. This is a governed record (Part-11 attribution GUCs, audit-ledger row, per `useSectionSave.ts:18-21`) that can be lost without the control the product's own code claims to provide — the charge's own definition of a blocker.

I checked whether this is simply untested/unnoticed: `client/src/concept2cure/v2/__tests__/richSectionEditorUnsaved.test.tsx` (read in full) exercises exactly the `dirty`/`beforeunload` contract, but every mock `onSave` it uses is `vi.fn(async (_s: string) => undefined)` — a function that genuinely represents its own (instant) outcome. The tests correctly prove RichSectionEditor behaves per contract *for a compliant caller*. The defect is that the prop type `void | Promise<void>` permits a non-compliant, fire-and-forget caller to type-check anyway, and this is the one of RichSectionEditor's four current hosts that does so.

**Smallest fix.** At the PathwayPanes.tsx call site, make `onSave` await and propagate the real result: `onSave={async (text) => { const ok = await onCommit(text); if (!ok) throw new Error('not saved'); }}`, with `onCommitBody`/`onCommit` returning the boolean `sectionSave.save(...)` resolves instead of discarding it with `void`. Passing a `storageKey` for this host would add the device crash-cache as a second line of defense.

*(Note on categorization: this is not a classic ARIA/contrast finding; it is the "trace the mutation, verify the client isn't wrong about what the server did" class of check the charge asks for, and it lands squarely in the charge's own "blocker" definition — "a regulated record can be... lost without the control the product claims.")*

### A-B-2 — medium: comment-anchor open has no keyboard path

**What the code does.** `commentAnchor.ts` wires "click the highlighted text, open its thread" as a ProseMirror `handleClickOn` prop:

```
109	  addProseMirrorPlugins() {
110	    const opts = this.options;
111	    return [
112	      new Plugin({
113	        key: clickKey,
114	        props: {
115	          handleClickOn(_view, _pos, node, _nodePos, _event, direct) {
116	            if (!direct || !opts.onAnchorClick) return false;
117	            const mark = node.marks?.find((m) => m.type.name === 'commentAnchor');
118	            const id = mark?.attrs.commentId;
119	            if (typeof id === 'string' && id) {
120	              opts.onAnchorClick(id);
121	              return true;
122	            }
123	            return false;
124	          },
125	        },
126	      }),
127	    ];
128	  },
```

`handleClickOn` fires only for pointer/touch clicks; none of the eight local TipTap extension modules define `addKeyboardShortcuts()` (grepped across all of them — zero matches). RichSectionEditor.tsx wires this straight through: `CommentAnchor.configure({ onAnchorClick: commentsApi?.onOpen ?? null })` (775–777); the prop's own doc comment is explicit about the assumption: `/** A click on annotated text — open the thread in the host's rail. */` (232–233). In `DocumentWorkbench.tsx`, `onOpen: openCommentFromAnchor` (3861) resolves to `setFocusedCommentId(commentId); setRail('comments');` (2222–2225).

**Why it matters.** A keyboard-only author who moves the caret into a comment-anchored range (arrow keys, normal editing) has no key or exposed command that opens that thread — WCAG 2.1.1 Keyboard (Level A). This has a workaround: the host's separate comments rail (opened another way) can presumably be browsed to find the same thread, so I did not rate this high/blocker; I did not read the rail's own listing UI to confirm it surfaces every thread independent of the anchor click (outside this file's scope).

**Smallest fix.** Add a keyboard route to the same callback — e.g., a keymap entry (such as Enter) active when the selection is fully inside a `commentAnchor` mark, or a command exposed on `RichSectionEditorHandle` the host's rail-focus logic can call.

### A-B-3 — medium: cross-reference/citation markers claim `role="link"` without link behavior

**What the code does.** Both node views build their DOM as an anchor and declare it a link semantically, with neither an `href` nor a `tabIndex`:

```
153	  addNodeView() {
154	    return ({ node }) => {
155	      const dom = document.createElement('a');
156	      dom.className = 'rse-xref';
157	      // Not a navigation: clicking a reference in the canvas places the caret.
158	      dom.setAttribute('role', 'link');
159	      dom.setAttribute(CROSS_REF_TARGET_ATTR, String(node.attrs.target ?? ''));
```
(`crossReferenceNode.ts:153-159`; `citationNode.ts:240-246` is the same shape: `dom.setAttribute('role', 'link');` with no `href`/`tabIndex`.)

**Why it matters.** An `<a>` without `href` is not in the default tab sequence and is not Enter-activatable; nothing here compensates. `role="link"` tells assistive technology this is a focusable, activatable link (ARIA APG requirement), which is not true here — a screen-reader user navigating by "next link" will land on these and find Enter does nothing. WCAG 4.1.2 Name, Role, Value (Level A) — the role/behavior pairing is wrong. Practical impact is limited: per the code's own comment, clicking one has no action beyond normal caret placement, and — verified — the "broken" state is always stated in text, not color alone (`CROSS_REFERENCE_MISSING_TEXT = '[Cross-reference unresolved — the target is not part of this document]'`, `shared/authoring/cross-references.ts:93-94`; `CITATION_MISSING_TEXT = '[Citation unresolved — the cited source is not available to this document]'`, `shared/authoring/citations.ts:101-102`; rendered at `crossReferenceNode.ts:179-182` / `citationNode.ts:271-274`), so no governed content is hidden by this.

**Smallest fix.** Either drop `role="link"` (these are inline provenance markers, not navigable links — no role, or a non-interactive role, would stop over-promising), or, if the link semantic is intentional for discoverability, back it with `tabIndex={0}` so Tab/Enter behave the way the role tells AT they will.

### A-B-4 — low (advisory): rich-mode canvas has no accessible-name fallback

**What the code does.** The rich-mode contenteditable's name comes only from a conditional spread:

```
875	        editorProps: {
876	          attributes: {
877	            role: 'textbox',
878	            'aria-multiline': 'true',
879	            ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
880	          },
```

Source mode has a hard default the rich path lacks: `aria-label={ariaLabel ?? 'Section source'}` (2558). The `aria-label={ariaLabel}` also passed to `<EditorContent>` (2601, 2641) doesn't compensate: `@tiptap/react`'s `EditorContent` (`node_modules/@tiptap/react/src/EditorContent.tsx:184-194`) spreads that prop onto its own wrapper `<div ref=... {...rest} />`; the actual `role="textbox"` node is appended as a *child* of that wrapper by ProseMirror, so the prop labels a plain, role-less div and does nothing for the real textbox's name.

**Why it matters / current status.** SC 4.1.2 (Level A) requires an accessible name on every UI component. Not live today: all four production mounts pass `ariaLabel` — `DocumentWorkbench.tsx:3837`, `EctdCoauthor.tsx:954`, `ProtocolDevSection.tsx:177`, `PathwayPanes.tsx:982` (all confirmed by direct read) — so the canvas is always named in practice. But the prop is optional with no compile-time or runtime enforcement, unlike source mode's own default.

**Smallest fix.** Mirror source mode's fallback: `'aria-label': ariaLabel ?? 'Section content'`, or make `ariaLabel` required in `RichSectionEditorProps`.

### A-B-5 — low (advisory): some disabled ribbon buttons don't say why

**What the code does.** Link (1946–1957, disabled when nothing is selected and no link is active, but its title/label stays "Insert a link" / "Edit or remove the link" regardless of why it's disabled), Merge cells (2005–2011, `disabled={!editor?.can().mergeCells()}`, title fixed at "Merge the selected cells"), and Split cell (2012–2018, same shape) don't state the reason anywhere reachable without a mouse hover (which a disabled `<button>` can't receive via keyboard focus either). The Caption button two lines later does this correctly by folding the reason into a dynamic label:

```
2042	              title={
2043	                captionSubject
2044	                  ? `Caption this ${captionSubject.kind} — it is numbered by its position in the document`
2045	                  : 'Caption a table or figure — put the cursor in a table, or select a figure'
2046	              }
```

**Why it matters.** A sighted keyboard-only user gets no on-screen reason a control is greyed out. Low impact — this mirrors a common, expected editing-toolbar convention (comparable to Word/Google Docs), not a path to governed-content error, and each remedy is self-evident (select text; select multiple cells).

**Smallest fix.** Apply the Caption button's pattern to Link/Merge/Split.

### A-B-6 — advisory, exempted by this repo's own SKILL.md: sub-24px `.rse-link` targets

**What the code does.** `rich-section-editor.css:32` — `.rse-link { font-size:11px; ... padding:2px 4px; }`, no explicit height — renders roughly 17-19px tall (used by "Dismiss", "Close find/link/caption/…", "Apply", "Replace", etc. throughout the notices and inline bars), under WCAG 2.2 SC 2.5.8's 24×24 CSS-px minimum. `.rse-rb` (line 19: `min-width:24px; height:24px;`), the ribbon's icon buttons, meet the minimum exactly.

**Disposition.** `.claude/skills/accessibility-enforcement/SKILL.md` rule 11 states: *"Touch targets ≥ 44×44 px (WCAG 2.2 SC 2.5.8) on touch surfaces. Desktop chat and editor are exempt; mobile overlays and portal are not."* RichSectionEditor is exactly the desktop editor this names, so per the skill that "holds the standard" for this review, I am not filing this as a defect — disclosed for the record rather than eyeballed past.

**Smallest fix (if ever wanted).** `min-height:24px; display:inline-flex; align-items:center;` on `.rse-link`.

## Earlier findings re-verified

Both named reports were read in full: `docs/evidence/reviews/2026-09-24/a11y.md` (findings A1, A2, A3, all already recorded "fixed") and `docs/evidence/reviews/2026-09-28/a11y.md` (findings A-0928-1, A-0928-2). **None of the five is located in `client/src/concept2cure/v2/editor/RichSectionEditor.tsx`** — I checked each rather than assuming:
- A1 (pointer-only submissions-portfolio row) — `SubmissionCenter.tsx`.
- A2 (icon-only e-sign shields) — `AdminSurfaces.tsx`.
- A3 (QMS tablist, no roving tabindex) — `client/src/concept2cure/quality/App.tsx`.
- A-0928-1 (unlabelled required "reason for placement" field) — `filingTarget.tsx`.
- A-0928-2 (`role="status"` vs `role="alert"` inconsistency) — `Vault.tsx`.

So there is nothing from either prior report to reconcile as fixed/open/changed *inside this file*. Both reports say so explicitly: the 2026-09-24 report states `RichSectionEditor.tsx` (~2,700 lines) "were sampled..., not read line by line"; the 2026-09-28 report states only "the diffed hunks (18 lines) were read... a new disabled+title Revert button." I grepped this file for `Revert` specifically to check whether that item falls inside my scope — it does not (zero matches in `RichSectionEditor.tsx`), so it remains open/unaddressed in `DocumentWorkbench.tsx`, outside what this charge assigned me. This pass is, as the charge states, the first line-by-line read of `RichSectionEditor.tsx` — which is why all findings above are new rather than re-verifications.

## What I did NOT get to

- **No live browser or assistive-technology pass at all.** Every finding and every "verified compliant" note above is a static code read. Actual screen-reader announcement of the `role="status"`/`role="alert"` notices, rendered focus-ring visibility/contrast in a real browser (I verified the token math and the gate's coverage of the relevant pair, not a rendered screenshot), and real Tab/Escape behavior of the inline bars were not tested live.
- **`DocumentWorkbench.tsx` (~5,100 lines) was not read line by line** — only the specific callbacks it hands to `RichSectionEditor` for save/comment/track/image/revert. Its own UI for signature ceremony, the reason-for-change input (`changeReasonRef`), any compare/diff view, and its revert-from-history dialog were **not read at all** — the lens names these dialogs, but none of them live inside `RichSectionEditor.tsx`; they are out of this charge's file scope and someone should point a lens at `DocumentWorkbench.tsx` itself for them.
- **`DataOriginsMenu`'s keyboard/AT behavior rests on `@radix-ui/react-context-menu`**, confirmed to be an unmodified pass-through of that primitive, not independently re-audited. One thing worth a live check: it renders a disabled `ContextMenuItem` purely as a caption/status row ("Select text to trace its origins" / "Text has changed — cannot locate selection", `DataOriginsMenu.tsx:127-135`); whether Radix's roving-tabindex arrow-key navigation skips disabled items (which would make that row silent to a keyboard/screen-reader user navigating the open menu) was not verified — this needs a real AT pass, not a source read of a third-party library.
- **`suggestions.ts` (1,009 lines), `roundTrip.ts` (443), `findReplace.ts` (323), `captionNumbering.ts` (417)** were grep-scanned for `Tab`-keymap overrides and `addKeyboardShortcuts` (none found) but not read line by line; their decoration/plugin logic was not otherwise audited beyond the color-alone check already confirmed via the CSS (underline/strikethrough for track-changes marks).
- **No server route handlers were opened.** `/api/authoring/sections/:id` (PATCH, revert), `/api/coauthor/documents/:id`, `/api/c2c/documents/:id/sections/:key`, `/api/authoring/images` were traced only as far as their client-side wrapper functions and this repo's own first-party comments describing server behavior (hash-chained revision ledger, Part-11 GUCs, 409 concurrency). `server/routes/*` and `server/services/*` were not read.
- **The industry-standard "Tab sinks a list item instead of leaving the field" behavior** (ProseMirror/TipTap's default list keymap, present via `StarterKit`) was reasoned through statically and judged not a novel trap introduced by this file (every mainstream rich-text editor behaves the same way, and the user can always move the caret out of the list first with arrow keys) — not confirmed in a live browser, and not filed as a finding.
- **Not every CSS color pairing in `rich-section-editor.css` was checked against the gate's exact pair list** — I traced the one that matters most (the focus ring, `accent-main-200`/`bg-000`) by name into `scripts/ci/check-token-contrast.mjs` and `design-system/colors_and_type.css`; for the rest I relied on the gate's aggregate PASS.
- **A-B-6's target-size numbers are arithmetic from the CSS rule** (font-size + padding, default line-height), not a measured rendered box in a real browser.
