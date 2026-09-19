# UI convergence — Home and the Projects directory (2026-09-07)

Converges the two highest-traffic surfaces onto the Claude.ai reference layout.
Both changes are **demotions**, not new construction: the capability surfaces
that were already there moved or got quieter, and nothing was built to replace
them.

---

## 0. A note on the plan this replaced

A parallel session produced a detailed plan for this work — `HomeSuggestionRow`,
a `CapabilityBrowser` built from `config/domain-prompts.ts`, a new
`config/app-catalog.ts` of 24 app ids, and an `AppsPage` rewrite, all wired
through `ZenApp.tsx` and `AnaPersistentPanel.tsx`.

**None of those files exist in this repository.** Verified before starting:

| Referenced | Reality |
|---|---|
| `client/src/concept2cure/ZenApp.tsx` | absent from every ref — `git log --all -- <path>` is empty |
| `components/chat/AnaPersistentPanel.tsx` | absent; `components/chat/` does not exist |
| `components/sidebar/ZenSidebar.tsx` | absent |
| `config/domain-prompts.ts` | absent; `config/` holds two JSON files |
| `client/src/component-registry.ts` | absent |
| `pages/AppsPage.tsx` | absent |
| commit `d2d582f6` | `fatal: Not a valid object name` |

The shell is the registry-driven `v2/` architecture. That plan's *intent* —
capabilities discoverable from the home — is carried out below against the real
files.

Its premise was also inverted. It assumed a capability-starved home needing new
surfaces. The real home rendered a greeting, a segment card (label, tagline,
lead programme, pathway chips, new-project CTA), a full composer, a 5-button
action row, **and** the tenant's entire module catalogue inline — 57 modules for
a biopharma tenant. The work was to take things away.

---

## 1. Home — `surfaces/Surfaces.tsx`

**Canonical surface:** `Home`. **Superseded:** nothing — the inline
`landing-modules` grid moved intact into `CapabilityBrowser`.

| Before | After |
|---|---|
| Greeting (time-aware, `user.firstName`) | unchanged |
| Segment card: label · **tagline** · lead programme · **pathway chips** · new-project CTA | label · lead programme · new-project CTA |
| Composer (`@app`, upload, mode picker, `C2C_CONVO` seed) | unchanged |
| Quick-action row (4 for biopharma; 5 only in the no-segment fallback) | unchanged |
| **Inline module grid — every `SEGMENT_MODULES` group** | **"Browse all capabilities" → overlay, with search** |

The tagline and pathway chips are static segment copy describing the category
the user had already chosen, sitting above a lead-programme line that reads
their real portfolio. `ctx.pathways` is untouched and still rendered by the
segment picker (`Shell.tsx:415`), where those pathways are the thing being
chosen between.

### No-capability-loss matrix

Every module id reachable from the old inline grid renders a button in
`CapabilityBrowser` and navigates to that same id. Asserted **per segment**,
because `SEGMENT_MODULES` is segment-scoped and proving one proves nothing about
the others:

| Segment | Modules | Render | `onNav(id)` |
|---|---|---|---|
| medtech | 48 | ✅ | ✅ |
| diagnostics | 38 | ✅ | ✅ |
| biopharma | 57 | ✅ | ✅ |
| cro | 28 | ✅ | ✅ |
| health | 18 | ✅ | ✅ |
| academic | 57 | ✅ | ✅ |
| regulatory | 57 | ✅ | ✅ |
| medical_writing | 57 | ✅ | ✅ |

Net reachability change: one click → two clicks, plus a search the inline grid
never had.

### A branch deliberately not written

`CapabilityBrowser` has no "this segment has no modules" empty state.
`getSegmentModules` cannot return empty — an unresolved id falls back to
`SEGMENT_MODULES.biopharma` (`registryModel.ts:1004`) — so the branch could
never execute, and a gate that cannot be made to fail has not been tested. The
fallback is pinned by a test instead, since it is the premise the absence rests
on. If that fallback is removed, the component says where the empty state goes.

---

## 2. Projects — `surfaces/Projects.tsx`

**Canonical surface:** `Projects`. **Superseded:** nothing.

| Before | After |
|---|---|
| Four large `.metric` tiles | one quiet `.pj-summary` line, same four figures |
| — | search over title + code |
| Workstream / status / grid-list controls | unchanged |
| `.launch-grid` auto-fill cards | `.pj-cards` two-column cards |

Untouched by design, because they are the surface's AnA integration rather than
its visual design: `useSurfaceActionHandlers('projects', …)`
(`projects.open-program` / `.filter` / `.set-view`), the `openProj` handoff
(`publishShellProject` → `onNav('project-home')`), and the
`notifySurfaceActionReady` retry contract.

`anaContext` **was** changed, and had to be: the search narrows the list exactly
as the two dropdowns do, so a summary saying "filtered by workstream and status"
while a search term was also hiding rows would describe a screen the user is not
looking at — and AnA would answer "which programs are at risk?" over a set it
had been told was complete. The search is now named in the summary, and carried
in `facts.searchQuery`.

### Search does not reach `lead`

The server projects `lead` as `COALESCE(u.name, u.email, '—')`, so it can hold
an email address. A search that matched it would let a typed fragment confirm a
colleague's address one character at a time. Search covers title and code only —
the same reason this surface's AnA publisher already drops the field.

---

## 3. Gates shown failing, not just passing

Per the working agreement, each gate was forced on the case it exists to catch.

**Capability parity.** Sabotage: drop the last group in `CapabilityBrowser`
(`.slice(0, -1)`). Result: **9 of 14 tests red**, each naming the missing
capabilities (`medtech: no button for … ("Program journey")`). Reverted; 14/14.

**The honest portfolio figure.** `kv()` resolves every headline number to an em
dash while the read is in flight or failed. Before it existed, `projects` was
`[]` in both states and the `|| 1` divisor rendered a clean "0%" — a portfolio
mean over no programmes, on the screen a director reads to learn what they run.
Sabotage: `const kv = (v: string) => v`. Result: **2 tests red**, `expected
'WorkspaceProjectsEvery regulatory pro…' not to match /\d+%/`. Reverted; 7/7.

---

## 4. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean, 0 errors repo-wide |
| v2 suite (`client/src/concept2cure/v2/__tests__/`) | 225 files, 2733 tests, all passing |
| `npm run audit:ui-authority` | 47/47 passed |
| New: `capabilityBrowser.test.tsx` | 14 passing (8-segment parity, search, dialog semantics) |
| New: `projectsDirectory.test.tsx` | 7 passing (honest figures, search, `lead` privacy) |

`node_modules` was absent at session start, so `tsc` had been exiting on four
missing type libraries without checking any source. Dependencies were installed
(`npm ci`) before any of the above was treated as a result.

### Real-browser QA — done 2026-09-08

An earlier revision of this report said browser QA was unavailable here. That
was wrong, and the claim is withdrawn: Chromium ships at `/opt/pw-browsers`,
`/api/auth/dev-login` exists, and the repo already had a pattern for this
(`project-threads-walk-2026-09-07.mjs`). Getting there needed a local Postgres
provision (`install-fresh.mjs`, partial — pgvector is unavailable on this
server, which is irrelevant to these two surfaces) and an ad-hoc
`npm install --no-save playwright-core`. Nothing was added to `package.json`.

Script and screenshots: `docs/reports/evidence/ui-convergence-2026-09-07/`.

| Observed in Chromium 1440×1000 | Result |
|---|---|
| Greeting renders the real first name | "Good morning, JM" |
| Quick-action row | 4 chips (segment-specific; the 5-item list is the fallback) |
| "Browse all capabilities" trigger | visible |
| Pathway chips / tagline | gone |
| Inline `.landing-modules` grid | gone |
| Overlay opens | 7 groups, **57 cards** — matches the biopharma parity count exactly |
| Search narrows | 57 → 1 |
| No-match copy | "Nothing matches …" |
| Escape closes | yes |
| Card click navigates and closes | "Program journey" → `/concept2cure/program-journey` |
| Overlay at 420px | single column |
| Projects: metric tiles gone, summary line present | "4 active programs · 70% average readiness · 1 blocked · 1 filing < 60 days" |
| Projects card grid | **2 columns** at 1440, **1 column** at 720 |
| Projects search "KP-2" | 1 card, "Companion assay KP-2" |
| Projects search "Dana" (a `lead` value) | **0 cards** — search does not reach the field |
| **Failed read** (route forced to 500) | summary reads "— … — … — … —", **no `%` anywhere on the surface**, error panel with a working "Try again" |

Console errors: the only failures were `fonts.googleapis.com` requests reset by
this sandbox's network policy, reproduced on a plain home load with nothing
touched, plus the two 500s this walk forced itself. None attributable to these
changes.

### Still not verified

**Ragged whitespace in the overlay.** The groups are grid cells with
`align-items:start`, and they differ greatly in length — "Author & assemble" has
14 items, "Program journey" has 1 — so the first row leaves a tall empty gap
beside the short groups. It is legible and nothing overlaps, but it is not tidy.
A CSS-columns (masonry) treatment would pack it. Left alone rather than changed
without someone looking at it.

**Focus is not trapped in the overlay.** `useDialog` gives focus-on-open, Escape
and focus-restore, and its own docstring says it is not a full trap — Tab can
leave the panel. That is the existing v2 modal convention (`TaskTray`, `Review`,
`TaskBoard` all use it); `CapabilityBrowser` matches it rather than diverging.
Closing that gap is a change to `useDialog` and to every modal that uses it.

---

## 5. Out of scope

**Project detail** (`ProjectHome.tsx`) was left on its own information
architecture. Claude's project page is a chat container — back link, header,
recent chats, a Memory / Instructions / Files rail. `ProjectHome` is a governed
regulatory workspace: a `StageTracker` over `PJ_LIFECYCLE`, a `DataRoom`, a
`SchedulePanel`, an `AuthorWorkspace`, five UUID-keyed live reads. Reshaping it
would drop functionality with no other home, and would put a restyle through the
`pid` id-space guard (`ProjectHome.tsx:1132`) that returns `null` rather than
coercing a numeric `projects.id` into a UUID path — which would otherwise fetch
a different real project in the same organization, with no error anywhere.

The **visual-only** pass on it was also not done, deliberately. Two things
surfaced on inspection that make a cosmetic restyle here unwise to attempt
blind:

1. `.pj-title` is under a recorded product-owner decision — *".pj-title,
   .ana-ctx-section and .ana-greet-t stay serif"*, `config/ui-surface-registry.json`
   → `decision`, from `docs/audits/ANA_UI_FORENSIC_AUDIT_2026-07-28.md`. A type
   pass is exactly the change that would quietly undo it.
2. `.pj-title` is **declared twice** — `app-v2.css:1007` (serif, 30px) and
   `journey-v2.css:12` (24px, no family). The later file wins on size while the
   family falls through, so the rendered heading depends on stylesheet order.
   That is a pre-existing shadowed selector, not introduced here, and it is worth
   resolving on its own rather than underneath a restyle. Flagged, not touched.

With no browser QA available in this environment, changing a heading governed by
a recorded decision and an unresolved specificity conflict would be churn that
could not be checked. The finding is more useful than the change.

**Customize** does not exist: no surface file, no registry entry. Building it is
a new surface, not a redesign, and most settings it would edit have no governed
write behind them — `server/routes/c2c/projects.ts` exposes no PATCH/PUT for a
programme at all, which is why the project ⋯ menu was previously removed rather
than rewired. A minimal version limited to `prefs.segment` and `prefs.anaMode`
(which do persist) is the honest scope if it is wanted.
