# Honest state lens: the editor family, RichSectionEditor, 2026-09-28

## Scope actually covered

- `client/src/concept2cure/v2/editor/RichSectionEditor.tsx` — full read, lines 1–2716 (all of it), at `7087f46e2` (confirmed as HEAD of `concept2cure-v2`, clean tree). Both branches of every async call inside the file (`doSave`, `insertImageFile`, `commentOnSelection`, `toggleTrack`) were read, not just the success path.
- Confirmed by grep that this file itself makes **zero** references to `useLive`, `liveGet`, `dataConnect`, `fixtures/`, or `SampleTag`, and contains no literal `/api/` string. It fetches nothing itself; every mutation is a host-supplied callback (`onSave`, `imagesApi.upload`, `commentsApi.onCreate`, `track.onToggle`, `citationsApi.onCite`) or the Hocuspocus WebSocket. Distinction 1 (sample-vs-live) does not apply directly to this file — noted, not assumed.
- Server files traced for every mutation this file starts:
  - `PATCH /api/authoring/sections/:sectionId` — route at `server/routes/authoring.router.ts:1647`, mounted at `server/bootstrap/register-inline-routes.ts:317` (`app.use('/api/authoring', authoringRouterModule.default)`). Confirmed live via the router's own `Router()`/`export default` (lines 93, 6410). This is the target of `doSave`'s `onSave` in three of the four hosts, and of the track-changes toggle.
  - `POST /api/authoring/images` and `GET /api/authoring/images/:id` — `server/routes/authoring.router.ts:6303-6383` and `:6385`, same mount. Read in full: tenant-scoped (`runWithTenantScope`), magic-number + virus-scanned, 8 MB / PNG-JPEG-GIF enforced server-side too, real `file_uploads` storage via `saveDerivedUpload`.
  - `acceptedAuthors` / `acceptedMachineText` (the lineage-attribution fields `RichSectionEditor`'s imperative handle collects and the host sends with every save) are actually read server-side: `authoring.router.ts:1655,1661,1898`.
  - The `/collab` Hocuspocus socket this file's `collabRuntime` connects to: `server/services/hocuspocus-server.ts` — read in full. `authenticateCollabConnection` is a real six-gate boundary (signature/expiry, token class, tenant claim, live membership, tenant-lifecycle posture, per-document authorization); `onStoreDocument`/`onLoadDocument` do real Postgres persistence via `collab-state.store.ts`. The file's own docstring documents six defects this route used to have (no connection ever completed, no persistence, no authorization) and says they are fixed — verified fixed by reading the current code, not by trusting the comment.
  - Confirmed the collab path is currently dark end-to-end: `client/src/flags/featureFlags.ts:74-81` — `ENABLE_LIVE_COEDITING` `defaultValue: false`, and `DocumentWorkbench.tsx:2231` gates `collab` on it. `RichSectionEditor.tsx`'s docstring phrasing ("already live **behind** `ENABLE_COLLAB_CRDT`") is accurate, not an overclaim.
- Four real host integrations found (grepped all of `client/src` for `RichSectionEditor` imports; this list is exhaustive for the tree):
  - `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:3785-3927` — full-featured mount (lineage, track, comments, images, cross-refs, citations, collab). Read the surrounding ~350 lines needed to trace `saveSectionContent` (1976-2129), `uploadSectionImage` (2137-2158), `toggleTrackChanges` (2164-2189+), `citationLibrary`/`sources`/`sourcesState` (794-796, 1635-1757), `captionsAround` (1772-1787), and the Sources rail (4506-4521) — not the rest of this ~5,100-line file.
  - `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx:945-963`.
  - `client/src/concept2cure/v2/surfaces/ProtocolDevSection.tsx:163-179` (+126-147 for the save wrapper).
  - `client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes.tsx:868,955-987` (outside `LAUNCH_APPS` per RULE 2; read only enough to check the remount-keying and the save-state label it uses instead of this file's own footer).
- `client/src/concept2cure/lineage/useAttributionHighlights.ts` and `DocumentAttributionBar.tsx` — read in full, since this file renders both directly (`lineageRootRef`, `<DocumentAttributionBar>`).
- Checked TipTap's actual runtime default for `setContent`'s `emitUpdate` (`node_modules/@tiptap/core@3.31.3/dist/index.js:1061`: `emitUpdate = true`) rather than assuming, because the crash-cache restore path (`restoreCached`, :1106-1120) depends on it.
- Ran: `npm run ci:internals-in-copy` (clean, 0 baselined repo-wide), `npm run check:microcopy` (clean, 387 files), `PROBE_ONLY='document-authoring,ectd-coauthor,protocol-dev' vitest run hostilePayloadProbe.test.tsx` (4/4 pass — no surface renders nothing under a hostile payload shape). Ran all 8 test files dedicated to this component (87 tests) plus the 8 integration test files that exercise it through its hosts (70 tests): **161/161 pass at `7087f46e2`**, none skipped.

## Findings

| id | severity | file:line | summary |
|---|---|---|---|
| HS-B-1 | high | `RichSectionEditor.tsx:2482-2533` (contract: `:299-303`); root cause `DocumentWorkbench.tsx:794-796,1635-1655,3902-3904` | The citation picker's "no sources" message cannot distinguish "still loading," "the read failed," and "genuinely none" — the exact distinction the Sources rail 30 lines away in the same host gets right. |
| HS-B-2 | medium (latent — not reached by any of the 4 current hosts) | `RichSectionEditor.tsx:317-323` (labels); `:1082-1093,2648-2653` (the actual gate) | The "dirty"/"error" save-state labels unconditionally claim the draft is "cached on this device" / "kept on this device," but caching is gated on `storageKey`, which any host may omit. |

### HS-B-1 — high: a failed or pending source-library read renders as "no sources," indistinguishable from a Data Room that is genuinely empty

**What the code does.** `RichSectionEditor.tsx`'s citation bar has exactly one branch on the data it is given:

```
2482            {citationSources && citationSources.length > 0 ? (
...
2526            ) : (
2527              /* No sources is a real state, said plainly rather than shown as an
2528                 empty picker that looks broken. */
2529              <span className="rse-find-note">
2530                No sources are available to this document yet. Add one in the
2531                Sources panel, then cite it here.
2532              </span>
2533            )}
```

`citationSources` comes straight from the prop contract, which has no room for a status:

```
299	  citationsApi?: {
300	    sources: CitationSource[];
301	    precedingSourceIds: readonly string[];
302	    onCite?: (sourceId: string) => void | Promise<void>;
303	  } | null;
```

`DocumentWorkbench.tsx` — the one host that wires this capability — has the honest three-way state (`'idle' | 'loading' | 'ready' | 'error'`) sitting right next to the data, and uses it correctly for the **Sources rail**:

```
794	  const [sources, setSources] = useState<SectionSource[]>([]);
...
796	  const [projectSources, setProjectSources] = useState<ProjectSource[]>([]);
```
```
1641	    sourcesSectionRef.current = sectionId;
1642	    setSourcesState('loading');
1643	    setSources([]);
1644	    const { ok, body } = await readJson<{ sources?: SectionSource[] }>(
1645	      `/api/authoring/sections/${encodeURIComponent(sectionId)}/sources`
1646	    );
1647	    if (sourcesSectionRef.current !== sectionId) return;
1648	    if (!ok || !body) {
1649	      setSourcesState('error');
1650	      setSources([]);
1651	      return;
1652	    }
1653	    setSources(Array.isArray(body.sources) ? body.sources : []);
1654	    setSourcesState('ready');
```
```
4512	          ) : sourcesState === 'loading' ? (
4513	            <div role="status" className="scaf-note" style={{ padding: 12 }}>
4514	              Loading this section’s sources…
4515	            </div>
4516	          ) : sourcesState === 'error' ? (
4517	            <EmptyState
4518	              icon={I.alertTriangle}
4519	              title="Couldn’t load this section’s sources"
4520	              hint="The read failed, so nothing is shown — this is not the same as the section citing nothing. Sign in and retry, or check the service is reachable."
4521	            />
```

But when the same `sources`/`projectSources` state is wired into `RichSectionEditor`'s citation picker, only the derived array travels — `sourcesState` does not, because the prop type has nowhere to put it:

```
3902	                    citationsApi={{
3903	                      sources: citationLibrary,
3904	                      precedingSourceIds,
3905	                      onCite: (sourceId: string) => {
```

Both branches that empty `sources` to `[]` — the loading branch (line 1643, fired on **every** section open) and the error branch (line 1650, which persists for as long as the fetch keeps failing, not just for an instant) — look identical, through this API, to a project with no Data Room sources at all.

**Why it matters to a regulated user.** A medical writer opens a section and immediately reaches for Cite — which the component's own docstring (`:280-297`) frames as the normal way to use it ("a writer citing mid-sentence"). If the sources fetch is mid-flight, or has failed (a transient 500, an expired session, a slow network), the writer is told **"No sources are available to this document yet"** — a governed-content claim about the project's Data Room that is false. The false sentence: *this document's source library is empty*, when it is either not yet known or the read simply failed. A writer who believes it may stop trying to cite altogether, weakening exactly the attribution discipline this editor exists to enforce, or conclude the Data Room genuinely has nothing when it does.

**Smallest fix.** Add an optional status to the `citationsApi` contract (e.g. `sourcesStatus?: 'loading' | 'error' | 'ready'`) and give the citation bar a third branch for anything other than `'ready'` ("Reading this document's sources…" / "This document's sources could not be read — nothing is cited by mistake, but the list may be incomplete"). Thread `sourcesState` (already computed at `DocumentWorkbench.tsx:795`) through the existing `citationsApi={{ ... }}` object at `:3902-3904`. `crossRefsApi.sections`/`captionsBefore`/`captionsAfter` are not affected — they are derived synchronously from `sections`, which is already fully loaded before `activeSection` (and hence the editor) can render at all (`captionsAround`, `:1772-1787`; `precedingSourceIds`, `:1749-1757`).

### HS-B-2 — medium (latent): the save-state footer's caching claim is not conditioned on whether anything is actually cached

**What the code does.** The four save-state labels are a static map:

```
317	type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
318	const SAVE_META: Record<SaveState, { dot: string; label: string }> = {
319	  saved: { dot: 'var(--success)', label: 'All changes saved' },
320	  dirty: { dot: 'var(--warning)', label: 'Unsaved changes — cached on this device' },
321	  saving: { dot: 'var(--warning)', label: 'Saving…' },
322	  error: { dot: 'var(--error)', label: 'Save failed — kept on this device' },
323	};
```

Whether anything is actually written to `localStorage` is a completely separate mechanism, gated on the optional `storageKey` prop (default `null`, `:201,460`):

```
1082	    const cacheDraft = useCallback(
1083	      (serialized: string) => {
1084	        if (!storageKey) return;
1085	        try {
1086	          if (serialized === lastSavedRef.current) localStorage.removeItem(cacheKeyFor(storageKey));
1087	          else localStorage.setItem(cacheKeyFor(storageKey), serialized);
1088	        } catch {
1089	          /* storage full — the server save path is unaffected */
1090	        }
1091	      },
1092	      [storageKey],
1093	    );
```

The footer renders `SAVE_META[saveState].label` with no reference to `storageKey` at all:

```
2648	        {full && (
2649	          <div className="rse-foot">
2650	            <span className="rse-save">
2651	              <span className="rse-dot" style={{ background: canvasSettled ? SAVE_META[saveState].dot : 'var(--warning)' }} />
2652	              {canvasSettled ? SAVE_META[saveState].label : 'Waiting for live sync — the canvas is locked until this section arrives'}
2653	            </span>
```

The file itself is aware, elsewhere, that omitting `storageKey` removes the safety net — but only fixed the unmount-flush case, not this label:

```
1211	       this point — the component is gone. When `storageKey` is set, the device
1212	       cache still holds the text and the next mount offers it back; a host that
1213	       sets `autosaveMs` without `storageKey` has no such net, and its last
1214	       edits are lost with no notice anywhere. */
```

**Verified this is not currently reachable**, so no user is shown the false sentence today: all three hosts that render the `'full'` footer (which is where `SAVE_META` is used) do supply a non-null `storageKey` whenever the editor is actually editable — `DocumentWorkbench.tsx:3836` (`storageKey={activeSection.id}`), `EctdCoauthor.tsx:953` (`storageKey={'coauthor:' + activeDoc.id}`), `ProtocolDevSection.tsx:176` (`storageKey={writable ? \`pdev-section-${sec.id}\` : null}`, and the `null` case coincides exactly with `readOnly={!writable}` at `:174`, so `dirty` can never become true when there is nothing to cache). The fourth host, `PathwayPanes.tsx:973-984`, omits `storageKey` but also sets `chrome="bare"` (`:976`), which suppresses this footer entirely (`const full = chrome === 'full'`, `RichSectionEditor.tsx:1812`) — that host renders its own, separately-honest `DDSaveStatus` instead (`PathwayPanes.tsx:907-949`, which says "local draft — not saved... edits are lost on refresh" for its own no-cache case).

**Why it matters to a regulated user.** This is a landmine in a component the file's own header calls "ONE implementation for every editable document surface" — the whole point is that more hosts will adopt it. Any future integration that supplies `chrome="full"` (the default) and simply does not pass `storageKey` (also legal — it is an optional prop with a plausible-looking default) will show a Part 11 authoring surface's author "Unsaved changes — **cached on this device**" while nothing is cached anywhere; closing the tab loses the edit with no on-screen indication that anything was ever at risk. `authoringUnsavedWork.test.tsx:338-343,354` shows the team specifically tests and cares about this exact "cached on this device" claim being true — the label just isn't structurally tied to the one prop that determines whether it is.

**Smallest fix.** Make the two affected labels a function of `storageKey` rather than a static map lookup — e.g. compute the dirty/error label inline where `storageKey` is in scope ("Unsaved changes — not cached on this device; closing this tab will lose them" when `storageKey` is null), or fold `storageKey` into the `SAVE_META` lookup key.

### Mechanisms verified sound (not findings — checked, not skipped)

- `doSave` (`:1134-1175`) awaits `onSave` before ever marking the buffer saved; a failure sets `error` and leaves `lastSavedRef` untouched, so a retry always re-sends. Traced through to `DocumentWorkbench.tsx:1976-2129`, which correctly distinguishes 409 (concurrent change — do not retry, reload) from every other refusal (retry-safe, server's own words via `redactInternals`), on top of, not instead of, this file's own generic footer state.
- `insertSuggestion`'s documented fix (refuse in source mode / when `!editor.isEditable`, `:1379-1386`) is wired end to end: `DocumentWorkbench.tsx:4093-4106` reads the boolean and shows the honest failure toast ("Couldn't insert — the canvas is not editable right now") rather than the always-true `insertSuggestedContent(...).run()` the comment says this used to be.
- The fail-closed fidelity gate (`boot`, `:787-839`) and the paste-fidelity check (`:893-926`) never silently rewrite governed content; both are exercised by `richSectionEditorAuthoring.test.tsx` (6/6 pass at head).
- The crash-cache is always offered back explicitly (`:1095-1120`, `:1872-1883`), never loaded over server content silently. Confirmed `editor.commands.setContent(html)` at `:1117` and `:1041`/`:1065` does emit an update (TipTap 3.31.3's actual default, `emitUpdate = true`), so `dirty`/`saveState` are correctly re-armed on restore rather than staying falsely "saved."
- `DocumentAttributionBar`/`useAttributionHighlights` (rendered directly by this file at `:2592-2637`) distinguish idle/loading/unsupported/error/ready and painted/stale-text/dropped; this file surfaces the stale-text and dropped-span cases (`:2607-2626`) rather than swallowing them.
- All four current host integrations key/remount the editor per section or document — `DocumentWorkbench.tsx:3788`, `EctdCoauthor.tsx:946`, `ProtocolDevSection.tsx:166` (which documents the exact reason: "so one section's draft can never be serialized into another section's row"), `PathwayPanes.tsx:868` — closing off the specific failure mode this lens most expects to find in a reusable multi-instance editor.

## Earlier findings re-verified

None apply. I grepped all five named prior reports (`2026-09-22/honest-state.md`, `2026-09-24/honest-state.md`, `2026-09-24/lenses.md`, `2026-09-28/honest-state.md`, `2026-09-28/ectd-lane-second-pass/honest-state.md`) for `RichSectionEditor` and found no mentions. The only prior references to this file are from other lenses noting it was **not** read line by line:
- `2026-09-24/a11y.md:46` and `2026-09-28/a11y.md:44` — a11y read only an 18-line diff hunk.
- `2026-09-28/README.md:46` — names it explicitly as a gap ("`DocumentWorkbench.tsx`, `RichSectionEditor.tsx` and the `ProtocolDev*` family were not read line by line").
- `2026-09-28/microcopy.md:15` — same gap, for microcopy.

This pass is the first honest-state-lens read of this file; there is nothing to re-verify, only a baseline to establish (HS-B-1, HS-B-2 above).

## What I did NOT get to

- `DocumentWorkbench.tsx` in full (~5,100 lines) — read only the ~350 lines needed to trace this file's props and mutations (save, image upload, track toggle, citation/source library, caption/cross-ref directories, collab wiring, the Sources rail contrast). The rest of that surface (History/Audit/Comments rails beyond what borders the traced code, the AnA rail, revert, exports) was not read.
- `EctdCoauthor.tsx` and `ProtocolDevSection.tsx` — read only the blocks around their `<RichSectionEditor>` mounts (~80 and ~70 lines respectively), not in full.
- `PathwayPanes.tsx` — read only `DDDocumentTab`/`DDSaveStatus` and the call site's `key`; not read in full. It is outside `LAUNCH_APPS` (RULE 2), so a deeper sweep there was not warranted for this pass.
- The sibling extension modules this file configures and imports type/functions from — `suggestions.ts`, `commentAnchor.ts`, `roundTrip.ts`, `findReplace.ts`, `imageNode.ts`, `crossReferenceNode.ts`, `citationNode.ts`, `captionNumbering.ts` — were not read internally; I verified this file's *usage* of their exported contracts and leaned on the passing test suite (161/161) for their internal correctness rather than re-auditing each one.
- `DataOriginsMenu.tsx`, `DataOriginsPanel.tsx`, `dataOriginsApi.ts` (the right-click "Data Origins" menu this file mounts at `:2594-2603`) — not read; only `useAttributionHighlights.ts` and `DocumentAttributionBar.tsx` were, since those are what this file renders directly.
- The internals of `PATCH /api/authoring/sections/:sectionId`'s handler body (the `doc_revisions` hash chain, the Part 11 audit row, `DOCUMENT_FROZEN`/`LINEAGE_REQUIRED` logic) — confirmed the route exists, is mounted, and reads the fields this file's host sends (`acceptedAuthors`, `acceptedMachineText`), but did not re-derive the full transaction; this exact route's signature/freeze/lineage behavior has been examined by prior reviews (P4, DP-16, DP-35) and I relied on existence-plus-field-presence rather than re-litigating it.
- `requestAnchoredComment`'s eventual server call — it resolves through a "comments" rail UI in `DocumentWorkbench.tsx` rather than calling a route directly (`:2206-2213`); I verified this file's own handling of both outcomes (a real id vs `null` on cancel) but did not trace the rail's own POST.
- No browser, no staging/live server, no local Postgres — verification is static reading plus the repository's own existing automated tests and two scoped CI gates (`ci:internals-in-copy`, `check:microcopy`) run against the whole repo (not filterable to one file).
