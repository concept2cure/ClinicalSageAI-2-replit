# Running-app walk of D0-13, D0-14, D4-6 and J3 R9, and the §8.6 frame measured (2026-11-09)

These are the running-app checks owed by:
- D0-13 (`docs/evidence/DESIGN/D0/D0-13-spec-decisions/`);
- D0-14 (`…/D0-14-spark-marks-ana/`);
- D4-6 (`docs/evidence/D4/2026-11-09-ribbon-one-row/`);
- J3 R9 (`docs/evidence/D4/2026-11-09-build-preview-words/`).

The walk also measures the page frame that D0.md §8.6 will change. It changes nothing.

## What was run, and against what

**Commit.** `aba641b533` (origin/concept2cure-v2 at the start of the walk).

**Copy.** `git archive` of that commit into a new, empty scratch directory. `node_modules` is symlinked to the main
tree's, `.env` is copied, and `vite.config.ts` was given its own `cacheDir` (`.vite-cache`), as in the 11-01 after
run. The main tree was not touched.

**Database.** The local Postgres `c2c` (127.0.0.1:5432), not reseeded. The copy's `scripts/db/deploy-migrate.mjs` ran
with `RUNTIME_DB_ROLE=app_service` and the owner URL as `postgres`:
- **464 migration files** were applied (`migrate.log`).
- The readiness contract passed, including the grant audit: 1331 of 1331 relations.

**Server.** Started as `tsx server/index.ts` in the copy, with:
- `PORT=5100`, `RLS_ENFORCE=on`, `LAUNCH_SCOPE_ENFORCE=on`, `NODE_ENV=development`, `ALLOW_DEV_AUTH=1`;
- `ALLOWED_ORIGINS=http://127.0.0.1:5100`;
- the runtime URL as `app_service`, and random secrets.

It was stopped by killing only its own PIDs (cwd under the copy). Postgres was left running.
- **The first start was lost to a full disk.** Vite's dependency optimiser failed with `Failed to write to output
  file` (ENOSPC), so module requests hung and the login page never reached DOMContentLoaded. That log is kept as
  `work/server-first-start-enospc.log`, in the capture folder.
- Stale scratch tree copies were deleted, the copy's `.vite-cache` was cleared, and the server was restarted. Every
  result below comes from that second start.

**Identity.** `jm.smith@concept2cure.pro` (user 18, admin of organisation 2), signed in through the UI at
`/concept2cure/login`.

**Project.** `c2ed888d-2958-4332-b186-e81482f2ceec`, "[Demo · Biotech] C2C-101 anti-IL-23p19 mAb — plaque psoriasis
(IND)".

**Browser.** Playwright Chromium 1243, deviceScaleFactor 1, at two sizes:
- 1440×900;
- 390×844 with `isMobile` and `hasTouch`. There, `matchMedia('(pointer: coarse)')` was `true`; at 1440 it was
  `false`.

Each size was captured light and dark, with dark set through `localStorage` `c2c-v2-prefs.dark`.

**Screens.** 15, all captured at both sizes and in both themes, 60 captures with no errors:
- home, projects, new project (wizard open);
- the project, a conversation;
- Submission Center, Tasks, Communication (and its Log communication drawer);
- RBM, Review, IND lifecycle;
- Safety narrative, Source tracer and the CRL library.

The editor was opened from the project page's first "Open". The document was "Quality Overall Summary (QOS)".

**Files.**
- `<screen>-<width>-<theme>.png`: viewport screenshots.
- `editor-*.png`: the editor captures.
- `probes.json`: every number below.
- `migrate.log` and `server.log`.

## Results

### 1. §8.4: the composer rests on `--border-control`. Holds.

The resting `border-top-color` equals the resolved `--border-control` on all three composers, at both sizes and in
both themes (12 of 12):
- Home, `.landing-composer`;
- the project, `.pj-composer`;
- a conversation, `.ct-composer`.

| Theme | Edge | Against the page | Against the composer fill |
|---|---|---|---|
| Light | `rgb(127, 125, 117)` | **3.91:1** on `rgb(250, 249, 245)` | **4.12:1** |
| Dark | `rgb(138, 138, 130)` | **4.36:1** on `rgb(38, 38, 36)` | **3.80:1** |

These are the figures D0-13 computed from the tokens.

### 2. §8.2: a disabled primary is grey. Holds.

New project's **Continue** (`.btn.primary`) is disabled before any input:

| Theme | Background (`--bg-200`) | Ink (`--text-400`) | Opacity |
|---|---|---|---|
| Light | `rgb(232, 230, 220)` | `rgb(117, 115, 109)` | 1 |
| Dark | `rgb(61, 61, 58)` | `rgb(142, 140, 132)` | 1 |

The same at 390. No other disabled primary was on screen in the pages visited.

### 3. §8.3: the answer line. Holds.

On every visible `.al-lead`, `.al-h` is weight **500** and `.al-lead` has margin-top **24px**:
- Submission Center, Tasks, Communication, the Log communication drawer's page, and IND lifecycle;
- both sizes and both themes.

### 4. §8.5: touch targets. Holds.

At 390 with `pointer: coarse`, every target present is **44px** tall. The sends and the drawer close are also **44px**
wide.

| Target | Where | 390 | 1440 |
|---|---|---|---|
| `.sc-ws` | Submission Center | 44 | 36 |
| `.cc-tab` | Communication | 44 | 36 |
| `.reg-tab` | RBM | 44 | 36 |
| `.seg-b` | Projects, Tasks, the project's stage control | 44 | 28 |
| `.landing-send`, `.pj-comp-send`, `.ct-comp-send` | the composers | 44 × 44 | 32 |
| `.de-x` | the Log communication drawer | 44 × 44 | 32 |

`.tab` and `.ml-seg-btn` were not on any screen visited.

### 5. §8.1: the spark marks an AnA action only. Holds where it could be seen.

| Screen | Lead action | Spark |
|---|---|---|
| Submission Center | "Open the sequences" | none |
| Tasks | "Triage the overdue work" | none |
| Communication | "Review the inbox" | none |
| IND lifecycle | "Ask AnA how to clear the top blocker" | `lucide-sparkles` |

The same at both sizes and in both themes.

**Could not be checked.**
- Safety narrative, Source tracer and the CRL library each answer "…: not in this release" under
  `LAUNCH_SCOPE_ENFORCE`, so their leads do not render.
- Review rendered "The review board" with no lead.

### 6. D4-6: the ribbon on one row at 1440. Does not hold in the running app.

What holds:
- Row 1 is 41px tall.
- More formatting is in view.
- More formatting opens row 2 (`display: flex`, 41px), where Superscript appears.
- Comment is in view (1267–1295; the row ends at 1321).
- Ask for a source and Offer alternatives are in view.

What does not:
- **Track changes is past the edge.** The label `.rse-track` spans 1299–1412, **91px past the row's visible right
  edge**. The row is `overflow-x: auto`, with `clientWidth` 718 and `scrollWidth` 813. Light and dark alike.
- **Why.** The ribbon sits inside the page's content box, not across the page. `.ed-doc-inner` is 816px wide, with
  48px padding each side, so `.rse-root` and the row get 718px.
- **Why D4-6's figure differs.** D4-6's evidence measured 813 / 816 on a throwaway page where the ribbon spanned the
  full 816. In the seeded workbench at 1440, with the outline column open (`.ed-doc` from x = 484), it does not.
- Files: `editor-ribbon-1440-light.png`, `editor-ribbon-1440-dark.png`, `editor-ribbon-more-open-1440-light.png`,
  `editor-ribbon-1440-light-full.png`.

### 7. J3 R9: the build preview's words. Holds.

The disclosure "Build document or section" was opened, with "Draft empty eligible sections with AnA" checked, a
reason given, and **Preview build** pressed. **Build document** was never pressed. The only non-GET calls were:
- `POST …/assembly/preview`;
- the collaboration room's presence calls.

**Template "2.3 · Quality Overall Summary".** 23 rows. Each reads "Kept as saved; it has no text yet" and then "AnA
prepares a candidate for it, for you to review."

**Template "M2 · Module 2: CTD Summaries — preparation worksheet".** 133 rows:
- 23 read "Kept as saved; it has no text yet";
- 110 read "Added empty; scientific content is missing";
- each reads "AnA drafting is unavailable: This is a preparation template: AnA does not draft it. Retain its
  originals and complete it manually."

**Could not be seen.** "Kept as saved, with its text" and "It holds text, so AnA prepares no candidate for it": no
saved section in this document holds text.

Files: `editor-build-preview-1440-light.png`, `editor-build-preview-plan.png`, `editor-build-preview-plan-m2.png`.

### 8. §8.6: the page frame, measured only

At 1440 the content area starts at x = 264 on every screen.

| Screen | Frame | Title's left x |
|---|---|---|
| Tasks, Review | `.page-inner`: max 1120, padding 32 / 40 | **332** |
| Submission Center | (no frame class matched) | **322** |
| Projects | (no frame class matched) | **304** |
| IND lifecycle | `.page-inner` with its own max 1280, padding 40 | **304** |
| The project | `.page-inner.pj`: max 1240, padding 26 / 30 | **294** |
| Communication | `.cc`: max 1200, padding 26 / 30 | **294** |
| RBM | `.rbm-page`: no max, padding 26 / 30 | **294** |
| Home | (centered greeting) | 718 |
| A conversation | (centered) | 610 |

So there are four different left edges for a page title across work areas: 294, 304, 322 and 332. The canonical
`.page-inner` gives 332.

**At 390.** No screen scrolls sideways (`.page` `scrollWidth` ≤ `clientWidth` on all 30).

### 9. Console and API

- No `/api` response of 400 or above, and no console error or page error, on any of the 60 captures, the editor pass
  or the build preview.
- The listeners were checked by planting a request to `/api/__walk_probe_404` (answered 401) and a `console.error`.
  Both were caught.

## Files filed here

The walk took 68 captures (19 MB). The ones each result above rests on are filed in this folder:
- the disabled primary in light and dark: `new-project-1440-*`;
- Home and the project page;
- the conversation in dark;
- the three answer-line screens: Tasks, Submission Center and IND lifecycle;
- the ribbon before the fix: `editor-ribbon-*`;
- the build preview plans: `editor-build-preview-plan*`.

`probes.json` holds every figure for every screen. The other captures are not filed. Any of them can be re-taken
with the same script on the same stack.

## Item 6 after the fix (`ribbon-after/`)

**Cause.** There were two causes:
1. The ribbon sat in the page's 720px text column, not across the 816px page.
2. Around it, `DocumentWorkbench.tsx` still had the inline bordered box that D4.md §D4.D item 3 says to replace. That
   box had `overflow: hidden`, so any wider ribbon was clipped.

A first attempt, which used only negative margins, measured as "in view" by bounding boxes. The screenshot showed
both ends clipped by that box. So the check below uses `elementFromPoint`, not boxes.

**The change** (D4):
- `authoring-v2.css`: `.ed-doc-inner` names its side padding `--ed-page-pad-x` (48px, or 16px at 760px and under).
- `rich-section-editor.css`:
  - the ribbon takes `margin-inline: calc(-1 * var(--ed-page-pad-x))`, so it spans the page;
  - the separators drop from 3px to 1px margins.
- The bordered box is replaced by `.ed-page`, with no border and no overflow clip, as §D4.D item 3 and §D4.K specify.
- The editor's side insets go to 0 (§D4.K).

**Re-measured** on the same stack, with the three files copied into the archive copy and served by Vite:

| Case | Row (page) | Track changes | Visible by `elementFromPoint` | Clipping ancestor |
|---|---|---|---|---|
| 1440 light | 554–1370, 816 of 816, no overflow | 1253–1366 | paragraph style, Comment and Track changes all visible | none |
| 1440 dark | the same | the same | the same | none |
| 390 | 0–390, scrolls within itself (1005) | past the edge, reached by scrolling the row | paragraph style visible | none |

- **More formatting.** It still opens row 2.
- **No sideways scroll.** The page does not scroll sideways at either width.
- **Files.** `ribbon-after/editor-1440-light.png`, `editor-1440-dark.png` and `editor-390-light.png`, with the figures in
  `ribbon-after/ribbon-recheck.json`.

