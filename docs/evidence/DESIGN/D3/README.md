# D3, the project page: where it stands, and the hand-off

**Package:** D3 (`.design/claude-convergence/D3.md`, ledger `docs/design/one-design-plan.json`, status open).
**Written:** 2026-11-08 by session `session_01QoxbLcnW5jPvJSjjKQtvTA`, which took D3 over at the founder's request on
2026-11-06 and is now leaving it. Every commit below is on `concept2cure-v2`. **This session holds no file.**

## Done

| Step | What it did | Commits | Evidence |
|---|---|---|---|
| D3-1 | The frame. Header (name, settings gear, byline, objective). AnA's composer with the open step's suggestion; a suggestion fills the box and never sends. Conversations under it. Steps as D0's segmented control; `StageBand` deleted. Project settings as D0's drawer. Byline facts moved to Project knowledge. | `a9819177d`, `99bfd0cdf`, `049b74dc9` | `D3-1/` |
| D3-3 | The team as a card on every step and a drawer ("Manage"): roster, sharing, authority note once. Plan's Team section is gone. `ProjectSettings` takes `request` (opens on a field); About's "Edit" uses it. | `6cd6d7c92` | `D3-3/` |
| D3-2a | Project knowledge the same on all six steps: About, Filing, Team, Work areas, What AnA knows, Skills, Records. The readiness card moved to Author. Work areas and Reports are rows. | `8225e3075` | `D3-2a/` |
| D3-2b | One read, several readers. Unified work, agency inbox and commitments are each read once by `ProjectWorkspace`. Filing gains Agency letters and Commitments rows; Team gains each person's open work. Activity is the Records card's last disclosure. | `900e6eb44`, `e84c4f1ef` | `D3-2b/` |
| D3-4 | The step bodies (session `01FTWcmXm7…`, 2026-11-08). Tasks and approvals on Plan only, by due date, status in words; a Tasks handoff opens Plan, whatever step it names, and survives StrictMode. Evidence: Data room, Protocol (from the lifted records read), Project files. Author: Module completion led by the figure line, no ring, "How this is measured" and the two supporting measures closed. Submit: "Add a market" ghost and first, every door and act small. Respond lists the commitments from the page's one read, "Record fulfilment" opening the existing dialog. D3 §6 walked whole on C2C-101 and the NeuroPanel-Dx 510(k), 1440 and 390, light and dark. | see `D3-4/README.md` | `D3-4/` |

Each step's README has a "What already exists" table, a capability-kept ledger, red-first test runs, the gate
results, and a running-app walk script (`walk.cjs`) with its log and screenshots at 1440 and 390, light and dark.

## Done since: D3-4, the step bodies (D3.md §4.7, §4.11, §4.12)

D3-4 landed on 2026-11-08 (`D3-4/README.md`); the starting points below are kept as the record of what it started from.

Starting points, as the code stands at `965084590c`:

1. **Plan holds Tasks and approvals; Review does not.**
   - Today Plan renders `ProjectWorkPanel title="Tasks"` and Review renders `ProjectWorkPanel title="Tasks and
     approvals"`, both over the page's one `work` read (`ProjectHome.tsx`, `useProjectWork`). Make it one panel on
     Plan, sorted by due date, with rows as hairline rows.
   - The Tasks handoff (`consumeNavParams('project-home')`, the effect near `ProjectHome.tsx:2050`) opens
     `step ?? 'review'`. Make it `'plan'` (§4.6 item 4) and keep the requested `workId` row first and focused.
   - Tests to move with it: `projectHomeReviewWork.test.tsx` and the Tasks-handoff tests (`projectHomeStepReturn`).
2. **Evidence gains Protocol, and the records read is lifted then.**
   - `ProjectRecords.tsx` reads `/api/c2c/projects/:id/records` itself. Its only reader today is the Records card.
     Evidence's Protocol (the `studyDesigns` store, with "Open in Study & protocol design" and "Open
     Biostatistics") is the second reader.
   - Lift the read into `ProjectWorkspace` when you add that reader: `ProjectRecords({ state, activity })` (§4.8
     item 7, §4.10).
3. **Author.** `DossierReadinessCard` (`ProjectDossier.tsx`, the `.pj-map-ring` at `:192`) still draws its ring.
   - D3.md says the ring goes and Module completion leads with "0 of 72 sections approved or locked". "How this is
     measured", and the two boxes "Artifact section status" and "Section tracking", become disclosures under
     Module completion (§4.7, §5).
   - The figure stays on the Filing card, which shows it on every step.
4. **Submit.** "Add a market" is a ghost button, and each "Place a document" a transparent `.btn.small` (§4.7). Header
   doors are `btn small` inside `.pj-sec-acts` (§4.11 item 2).
5. **Respond** lists "Commitments to the agency" from the page's one read. `ProjectHome.tsx` already has
   `commitPath` and `commitments` (`:1782`). Render the rows with `CommitmentRowView` (`CommitmentRow.tsx:228`); its
   "Fulfil" opens the existing fulfilment dialog. Do not read the commitments a second time.
6. **Small converges** (§4.11): `ProjectWorkPanel`'s "blocking" chip becomes part of the status text, and
   `ProjectDiscoveryHandoff.tsx`'s trigger becomes `btn ghost small` (D2's one-attribute change).

When D3-4 is done, D3's acceptance (§6) can be walked whole: on C2C-101 and a device 510(k), at 1440 and 390, light
and dark.

## Open, for the lead (not taken here)

- **The objective as a composer suggestion** (§4.4 item 5.1). S1's objective already offers "Ask AnA to propose it"
  on every read, so it was not offered twice. If both are wanted, `ProjectObjective` reports its state upward and
  `ProjectWorkspace` prepends the suggestion.
- **S12, work projects** (P-83; ONE_DESIGN_PLAN §1c). The lead (`011Dpx…`) offered it to this session on 2026-11-06.
  It was not taken, so **it is unassigned**.
  - It runs through D3's files (`Project*.tsx`, the New project wizard in `Projects.tsx`): a work-project kind
    (biostatistics, RBM, CMC, data management, CTD build) chosen in New project, with a parent filing project; the
    project opening on its work area; deliverables with "Feeds" links; and a stale flag.
  - The lead's survey: `project-intake.ts` `VALID_PROGRAM_TYPES` has no such kind and `regulatory_programs` no
    parent link. A Program → Project → Study tree exists on the integer `projects` table
    (`server/routes/project-hierarchy.ts`, `project-rollup-service.ts`), with no client caller. Reach or bridge
    it, never a second tree (RULE 3).
  - Whoever takes D3-4 or S12 should hold `Project*.tsx` in COORDINATION first, because the two touch the same
    files.

## Tests and gates as left

- The project-page suites: every file in `client/src/concept2cure/v2/__tests__/` whose name starts with `project` or
  `Project`, plus `foundationsRetiredRatchet`, `filingLifecyclePlan` and `ProjectRecordedContext`. 83 files, 905
  tests at the last run.
- **Three failures, none from D3.** Leave them, or fix them in their owners' packages:
  - `projectHomeStageCss` "defines no class another v2 stylesheet already defines": already failing on trunk before
    D3 (`.btn`, `.pj`, `.pj-sec-h`, `.rpk-tabs` clash with other sheets). D3-1 removed one of its clashes.
  - `projectCreationDoors.contract` (Vault.tsx's Projects index door) and `projectDestination`: they fail on trunk
    without D3's changes, and follow the Vault session's `adb1c00cba` and `5144702d21`. Handed to Vault parity in
    COORDINATION.
- Gates that passed on every D3 step: `ci:typecheck-no-regression` (0), `ci:undefined-css-classes`,
  `ci:surface-text-ramp` (regenerate with `node scripts/design/generate-surface-text-ramp.mjs`),
  `ci:check-phantom-tokens`, `ci:one-product`, `ci:check-shell-css-collisions`, `ci:fixture-fallback`,
  `ci:token-contrast`, `ci:one-design-plan`, `ci:pushed-lint-warnings`. `ci:check-css-selector-shadowing` reports
  four sheets D3 does not touch (journey, protocol-dev-editing, research, submission), as on trunk.

## What tripped this session, so it does not trip the next

- **`ci:fixture-fallback` reads a ternary whose else-branch is an import from `fixtures/` as a substitution.** A `??`
  just before it opens the match (`… item.starter })) : PJ_LIFECYCLE`). Select between two imported constants
  instead; that is why `PJ_LIFECYCLE_DEVICE` is in `fixtures/project-home-data.tsx`.
- **The pre-push lint ratchet lints `docs/evidence/**/walk.cjs` too.** Keep walks under max-depth 4. Write
  `window.getComputedStyle` inside `page.evaluate`, and never name a helper `use…`: the hooks rule fires.
- **`.sp` is the surface page's class** (32px/96px padding). A `<span className="sp" />` spacer made the composer
  229px tall.
- **`main.tsx` renders under `React.StrictMode`**, so the dev server makes every read twice at mount; a production
  build makes it once. Count reads across interactions, not at mount (`D3-2b/walk.cjs`).
- **The project page scrolls inside its own container,** so `window.scrollTo` does nothing. Scroll an element into
  view.
- **In Playwright, `getByRole('region', { name: 'Filing' })` also matches "Filing lifecycle reference" on Plan.**
  Pass `exact: true`. Testing Library's role queries have no `exact`; use `/^Filing$/` there.
- **`ProjectWorkspace` is keyed by the signed-in session** (`ProjectHome.tsx`, `owner`). An account or organization
  change remounts it and closes any drawer. That is intended; tests reopen it.
- **Pushing:** the hook takes 5–10 minutes, and other sessions push meanwhile. Loop fetch, merge (never rebase),
  push, and retry on "cannot lock ref". When the lockfile changed, run `npm ci`. `COORDINATION.md` conflicts are
  routine: keep both sides' rows.

## Running it locally

- Database `clinicalsage` (user `c2c`, local password `c2c_local`, 127.0.0.1:5432), full migration set applied.
- Server: `(set -a; . ./.env; set +a; PORT=5000 SKIP_DB_STARTUP_TEST=true npx tsx server/index.ts)`.
- Sign in: `POST /api/auth/dev-login {"email":"jm.smith@concept2cure.pro"}`. The walks do this for you.
- Project page: `/concept2cure/project-home?program=<id>`. Each `walk.cjs` takes `[base-url] [programId]`.
