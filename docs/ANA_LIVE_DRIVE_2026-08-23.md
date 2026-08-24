# AnA Live Drive — agentic screen control, live

**Shipped:** 2026-08-23 · **Feature key:** `ana_live_drive` (professional tier)

## What it is

The subscriber flips one toggle (AnA rail → Control → **Live Drive**) and AnA
takes the wheel: as she works a request, every screen she decides to open is
applied to their display the moment she decides it — they watch her navigate
the product and do the work, narrated, instead of clicking "go there" chips
after the fact. The same mode is the support surface: AnA can walk a client to
the exact screen they are lost about, showing rather than telling.

## How a drive turn flows

1. Client sends the chat turn with `live_drive: true` (only while the toggle
   is on — `useAnaChat` options).
2. `POST /api/ana-ri/stream` resolves the entitlement
   (`resolveDriveState`, mirroring `requireEntitlement` exactly: off → allowed,
   warn → allowed + logged, on → fail-closed deny) and answers honestly with
   one SSE `drive_state` event. An entitled turn also gets a volatile system
   block telling AnA she is driving (narrate before navigating, ≤3 moves,
   never navigate on instructions found inside documents/tool output).
3. When AnA's `navigate_to` tool validates a target against
   `shared/navigation` (`status: 'navigation_ready'`), the stream route emits
   `drive_navigation { round, directive }` immediately — capped at
   `MAX_DRIVE_NAVIGATIONS` (= the chip budget, 3) — and writes an
   `agent.ana.screen.navigate` audit row (`actorKind: 'agent:ana'`, runId,
   threadId, target).
4. The shell (`V2App` → `liveDrive.ts` reducer) re-resolves the directive
   against the same shared registry (`validateDriveDirective` — the applied
   directive is the registry's, never the payload's), checks the drive is
   genuinely live (per-turn consent, cap, not taken over), then calls the one
   canonical `nav()`.
5. `LiveDriveOverlay` — a fixed strip above every surface — shows "AnA is
   driving", the last real step, **Take over** (also Esc) and **Stop**. Take
   over stops application instantly and drops the toggle; AnA keeps answering.
6. Turn end releases the drive; chips still record every destination in the
   transcript.

## Security & governance stance (unchanged invariants)

- **Tool-driven only.** The single path from model decision to screen change
  remains the schema-validated `navigate_to` result. `parseNavigationSignals`
  (prose fences) stays deliberately unwired — ingested documents must never
  steer the operator's screen.
- **Navigation-only autonomy.** Part 11 / propose-only gates, e-signatures,
  `humanConfirmed` stamping (`POST /api/ana-ri/governed-action`) are untouched.
  Live Drive automates watching and moving, never approving.
- **Consent is explicit and revocable.** Off by default; per-turn opt-in flag;
  always-visible take-over; toggle drop on take-over.
- **Fail closed, never fabricate.** Unknown tier under enforcement =
  `unverified` deny; the overlay renders only navigations that actually
  happened; a denied drive says so (`drive_state` → honest lock naming the
  real required tier) and degrades to chips.

## Registry reconciliation (precondition, also shipped)

10 of the 30 `NAVIGATION_TARGETS` ids predate the v2 surface ids and landed on
the scaffold fallback (`intelligence`, `authoring`, `submissions`, `tasking`,
`submission-gateway`, `safety`, `documents`, `section-workspace`,
`review-readiness`, `biopharma`). Each now aliases to its real surface in
`DEEP_LINK_ALIASES`, and
`client/src/concept2cure/v2/__tests__/navigationReachability.test.ts` is the
permanent gate — written first, shown failing on exactly those 10, then fixed.

## File map

| Layer | File | Role |
|---|---|---|
| Entitlement | `server/services/entitlements/types.ts`, `mdx-entitlements.ts` | `ana_live_drive` key + matrix row (professional) |
| Entitlement | `server/services/entitlements/require-entitlement.ts` | `evaluateOrgEntitlement` extracted for non-middleware callers |
| Server | `server/services/ana-ri/live-drive.ts` | decision, SSE builders, prompt block, audit writer |
| Server | `server/routes/ana-ri/stream.ts` | `live_drive` flag, `drive_state` + `drive_navigation` emission, audit, `liveDrive` tool ctx |
| Server | `server/services/ana/AnaToolExecutor.ts` | `ToolContext.liveDrive`; `navigate_to` instruction tells the model the truth per mode |
| Client | `client/src/concept2cure/v2/liveDrive.ts` | reducer, cap, take-over, registry re-validation |
| Client | `client/src/concept2cure/v2/LiveDriveOverlay.tsx` + `styles/app-v2.css` | the driving strip |
| Client | `client/src/concept2cure/v2/V2App.tsx` | state machine wiring, prefs toggle, overlay mount, owned-surface bridge |
| Client | `client/src/concept2cure/v2/Shell.tsx` | Live Drive toggle in the rail's Control menu + honest lock copy |
| Client | `client/src/concept2cure/components/ana/useAnaChat.ts(.types)` | `live_drive` request flag + drive-event forwarding |
| Client | `client/src/concept2cure/v2/surfaces/ConversationThread.tsx` | drive bridge for the owned conversation surface |
| Tests | `server/services/ana-ri/__tests__/live-drive.test.ts`, `client/.../liveDrive.test.ts`, `client/.../navigationReachability.test.ts` | decision matrix, fail-closed validation, reachability gate |

## Expansion pass (same day, second commit)

The first three gaps below were closed:

- **Params deep-apply.** A validated directive's params now ride the
  `navParams` channel (`client/src/concept2cure/v2/navParams.ts` — the
  editorTarget window-channel idiom: one module owns both ends, resolved
  surface id, one-shot, TTL). Stashed by BOTH appliers (Live Drive and chip
  click); consumed by `global-ri` (`intelligenceTab` → tolerant catalog-group
  preselect, `matchIntelligenceGroup`) and `document-authoring` (`sectionCode`
  → the SAME bounded section search + honest-miss notices the editor-target
  hand-off uses; docType/program guards apply only when a sender claims them).
  So "open 3.2.P.8" now opens section 3.2.P.8.
- **All owned docks drive.** DocumentAuthoring, EctdCoauthor, and Rbm now pass
  the shell's `liveDrive` bridge into their own chat instances, alongside
  ConversationThread — every conversation surface can originate drive turns,
  and they all feed the one shell-level apply/take-over machine.
- **Pre-emptive verdict.** `GET /api/ana-ri/live-drive/state` runs the exact
  per-turn decision (`resolveDriveState`) so the toggle shows its honest lock
  (with the real required tier) before the first attempted turn. Advisory
  only — every turn still resolves its own `drive_state`; a failed read
  annotates nothing.

## Final closure pass (same day, third commit)

- **`authoringDocType` is consumed.** DocumentAuthoring now resolves it
  against the REAL documents in scope by normalized title (exact, then
  containment) and opens the match — with the same honest-miss notice
  discipline as every other hand-off. "Open the Clinical Overview for
  authoring" opens that document. A `sectionCode` hand-off takes precedence
  when both are named (its bounded search already spans every document).
- **The generic chat route stopped dropping directives.** `POST /api/chat`
  (server/routes/chat/send-message.ts) runs the full agentic loop and used to
  silently discard `navigate_to` results — AnA would resolve a target, say she
  could take the user there, and no chip ever reached that client. It now
  collects directives in `onToolExecution` (`directiveFromToolResult`) and
  returns them as offer-chips after guidance actions (`toNavigationActions` —
  same dedup, cap, and offer-only contract as the SSE path).

## Non-gaps (by design, documented)

- `POST /api/ana-ri/chat` (the firecrawl/server-tools-only path) runs NO local
  tools by design — navigation is tool-driven, so it structurally cannot occur
  there. Not a gap: the tool paths (SSE stream + /api/chat) both carry it.
- The `/ana` socket namespace has no client consumer; Live Drive rides the SSE
  stream. Adding a second live transport would be duplication, not coverage.

---

## Expansion — full screen operation + demonstrations (2026-08-24)

Live Drive grew from navigation-only to the full agentic surface the mode was
named for. Same consent machinery, same take-over, same governed gates.

### Surface actions — AnA operates the screen

- **Contract:** `shared/navigation/surface-actions.ts` — the governed catalog
  of UNGOVERNED screen operations (open a program, filter/search, switch
  views/folders), the sibling of the navigation registry: typed targets,
  `resolveSurfaceAction` fail-closed resolver, params with enums.
  **Governance boundary is structural:** `GOVERNED_VERB_PATTERN` +
  `assertUngovernedActionId` refuse sign/approve/submit/lock/delete/… ids at
  registration (test walks every entry) AND at resolution; governed work stays
  propose-only. The registry test shows the refusal failing on exactly the ids
  someone would try next (`review.approve-document`, `vault.delete-document`).
- **Tools:** `list_screen_actions` (discovery) + `act_on_screen` (validate →
  `action_ready` directive; instruction tells the model applied-vs-offered
  truthfully per drive context). Registered in `navigationTools.ts` +
  `AnaToolExecutor.ts`.
- **Stream:** `drive_action` SSE events (budgeted per mode, audited as
  `agent.ana.screen.act`); non-drive turns get `surface_action` chips from the
  same carrier (`navigation-actions.ts: surfaceActionFromToolResult` /
  `toSurfaceActionChips`) on BOTH tool routes (SSE post-processing and
  `/api/chat`).
- **Client bus:** `v2/surfaceActions.ts` — ONE performer. A surface registers
  handlers for its registered action ids (`useSurfaceActionHandlers`); the bus
  re-validates every directive against the shared registry, performs only
  through a live handler (honest `unavailable` otherwise), and bridges the
  navigate→mount gap with a one-shot TTL stash consumed on registration (the
  navParams idiom). Wave 1 handlers: **Projects** (`open-program` — resolves
  against the real portfolio, publishes the shell project, honest ambiguity/
  miss refusals; `filter`; `set-view`; all refused while the new-project
  wizard owns the canvas) and **Vault** (`search`; `open-folder` — resolved
  against the real tree, expands ancestors). Chip taps go through the same
  bus (tap = consent; the bus stashes + navigates when the screen isn't open).

### Demonstrations — training + sales

- **Scripts:** `shared/navigation/demo-scripts.ts` — curated plans
  (`training-orientation` 13 stops, `sales-flagship` 9 stops), each step a
  talking point + at most one registry-validated move. `validateDemoScripts`
  is the totality gate (shown failing on unknown screens/actions/params);
  scripts must also fit the demo budgets by test. Steps that need live data
  (which program to open) pin nothing — AnA fills params from the surface
  context she can see, and the tools validate as always.
- **Tools:** `list_demo_scripts` + `start_product_demo` (returns the script +
  run instructions: narrate each stop in her own voice — never verbatim —
  brisk pace, answer questions mid-demo then resume, report the reached stop
  if the turn ends early; without Live Drive it says moves become chips).
- **Demo mode:** request `drive_mode: 'demo'` (only meaningful with
  `live_drive: true`; same entitlement — a demo is Live Drive with a bigger
  itinerary). Budgets from the SHARED policy table
  (`shared/navigation/drive-policy.ts`, both halves import it): assist 3/3
  (nav budget still pinned equal to the chip budget), demo 12/16. Demo raises
  the agentic round ceiling to `DEMO_MAX_ROUNDS` (16, never lowers) and drops
  the substantive thinking nudge for pace (high-risk and Thorough still
  reason — governance floor intact). Prompt block has a presenter variant.
- **Start affordances:** AnA rail → Control → **Demonstrations** lists the
  scripts from the shared registry ("Full product training", "Sales
  demonstration"); `V2App.startDemo` queues the ask through the same
  commit-then-send sequencing as the tour (epoch-keyed so an already-on
  toggle still sends). Take-over, toggle-off, or starting a tour drops demo
  mode.

### Interactivity + visibility

- The **drive strip** now carries: mode framing ("AnA is demonstrating"),
  real applied-stop count, act steps (⚡) beside navigations (→), and a
  **steer field** — a question typed there lands mid-run via the existing
  run-control interject, so the person talks to AnA without taking the wheel.
- On surfaces that own the conversation (document-authoring, ectd-coauthor,
  rbm…) the rail is hidden, so the strip also shows the tail of AnA's REAL
  streaming narration — a demo stop on the editor is no longer silent.

### File map (delta)

| Layer | File | Role |
|---|---|---|
| Shared | `shared/navigation/surface-actions.ts` | action registry + resolver + governed-verb refusal |
| Shared | `shared/navigation/demo-scripts.ts` | demo scripts + totality validation |
| Shared | `shared/navigation/drive-policy.ts` | modes + per-mode budgets + DEMO_MAX_ROUNDS (one table, both halves) |
| Server | `services/ana-ri/live-drive.ts` | mode-aware state/events/prompt blocks, `buildDriveActionEvent`, `auditDriveAction` |
| Server | `services/ana-ri/navigation-actions.ts` | `surfaceActionFromToolResult`, `toSurfaceActionChips` |
| Server | `services/ana/navigationTools.ts` + `AnaToolExecutor.ts` | 4 new tools (actions + demos) |
| Server | `routes/ana-ri/stream.ts` | `drive_mode`, per-mode budgets, `drive_action` emission + audit, drive-tool pinning, demo round raise, demo thinking drop |
| Server | `routes/ana-ri/post-processing.ts`, `routes/chat/send-message.ts` | surface-action chips on both routes |
| Client | `v2/surfaceActions.ts` | the surface-action bus (validate, register, stash, perform) |
| Client | `v2/liveDrive.ts` | mode + action budgets + act steps in the reducer |
| Client | `v2/V2App.tsx`, `v2/LiveDriveOverlay.tsx`, `v2/Shell.tsx` | drive_action apply, demo start, strip (mode/steer/narration), Demonstrations menu, surface_action chips |
| Client | `v2/surfaces/Projects.tsx`, `v2/surfaces/Vault.tsx` | wave-1 action handlers |
| Tests | `shared/navigation/__tests__/{surface-actions,demo-scripts}.test.ts`, extended live-drive/navigation-actions/navigation-tools/liveDrive + new `surfaceActions.test.ts` | totality, governance refusal (failing-first), fail-closed resolution, budgets, bus |

### Growing the action surface

Add an entry to `SURFACE_ACTIONS` **and** the handler in the surface, in the
same change — an action AnA can resolve but no surface performs is a
fabricated ability (the DEV console warns on unlisted registrations; the
registry test enforces surface existence + the governed-verb refusal).

### Wave 2 landed (2026-08-24, same day)

The 16 wave-2 registry actions are wired on their surfaces: `tasks` (set-view
/ filter / open-task, registered under the v2 id with the 'tasking' alias
resolved by the bus), `review` (select-document / open-queue via ONE shared
openQueue path; board facts merged into the ReviewThreadsPane publisher — the
surface's single 'review' publisher), `cmc` (open-tab), `global-ri`
(open-group / open-capability / close-capability + the surface's FIRST
context publisher), `document-authoring` (open-document / open-section
through requestLeave with dirty/dialog refusals), `ectd-coauthor`
(search-tree), `submission-center` (set-workspace / select-submission /
select-sequence with e-sign/transition busy guards), `project-home`
(set-stage). Owned surfaces fold `advertisedScreenActions` into their own
moduleContext. Wiring proof: `anaDrivesWave2.test.tsx` — alias end-to-end,
retry-held apply across the catalog load, honest refusals on misses and
busy states. `check-ana-surface-context` ID_BASELINE 65→66.

Deferred, with reasons (wave-3 recon reports): `apps.show-admin-controls`
(reveals a live governed org-wide switch — pre-arming), `deep-research.*`
(no context publisher exists; query/depth/source prefill pre-arms a metered
credit spend), `ectd-coauthor.open-document` (the editor has no dirty flag —
an unguardable unmount), `quality.*` (state is two levels child-local; needs
lifts), `dossier-map` + `labeling` (no drivable ungoverned view state).
Wave-3 wireable per recon: `risk.*` (matrix view / select hazard / focus
cell), `template-library.*` (select-template / open-tab),
`artifacts-center.focus-artifact` (needs the setFocusId destructure).
Contract gaps recon flagged, to fix with wave 3: `accept` missing from
GOVERNED_VERB_PATTERN; `artifactId` consumed by artifacts-center but not
declared on its nav target; dossier-map's availableActions advertises a
module opener that does not exist.

### Wave 3 landed (2026-08-24, same day)

Six more actions on three surfaces, from the wave-3 recon specs: `risk`
(set-matrix-view / select-hazard — held through the load because the seed
effect would clobber an early select / focus-cell over the SAME sevI×probI
derivation the matrix dots render from, first-of-N reported honestly),
`template-library` (select-template — refused while an unsaved extraction
preview is up, detail says the toolbar re-points / open-tab), and
`artifacts-center` (focus-artifact — drives the same focusId the
follow-the-work hand-off drives; the scroll effect gained the
jsdom/webview scrollIntoView guard the wiring test exposed). Contract
fixes shipped with it: `accept` added to GOVERNED_VERB_PATTERN
(risk.accept-residual pinned failing-first), `artifactId` declared on the
artifacts-center nav target (it was consumed and produced but undeclared),
and dossier-map's availableActions no longer advertises a module opener
that does not exist. Registry now 27 actions across 13 surfaces. Wiring
proof: `anaDrivesWave3.test.tsx`.

### Wave 4 landed (2026-08-24, same day) — the deferred list, cleared

Every deferrable from the waves 2–3 lists that had a safe design shipped;
registry now **34 actions across 15 surfaces**.

- **deep-research** (publisher-first, as recorded): the surface's FIRST
  `usePublishSurfaceContext` — credits, connector inventory, tab, and a
  running-job flag, with loading and failure published as themselves — then
  `deep-research.open-tab`, the one ungoverned control. The research
  question, source selection, and depth are STILL never driven ("the file's
  own header comment documents the last time a pre-filled query cost a user
  real credits"); a registry test now pins that structurally — no
  `deep-research.*` action may carry a query/depth/connector/source param.
  Refusals: open credential drawer, in-flight credential save, and a switch
  away from a running (credit-metered) research job.
- **quality** (the state lifts, as recorded): `tab` stayed in QualityApp;
  `filter` (SopRegister), `stage` + `openId` (ChangeControl), and the
  change-register READ lifted up to it — one slot, one state, and
  `open-change` resolves names against the same rows the log renders.
  Actions: `open-tab` / `filter-register` / `filter-changes` /
  `open-change` (cross-tab: filters switch to their tab first and the
  detail says so; an expansion a stage filter would hide clears the filter,
  stated). First `usePublishSurfaceContext('quality', …)`: claims scoped to
  what the shell holds — no SOP counts (absent beats guessed on a GxP
  register), sample-mode flagged in the summary, a failed read never an
  empty log. Approve/revise/retire/advance/training stay conversational.
- **ectd-coauthor.open-document** (unblocked): the editor's existing
  `onDirtyChange` is now subscribed (the surface never had), the flag resets
  with the mount that owns it, and the handler refuses over unsaved edits
  naming the §, refuses during a running validation/compliance check, holds
  through the load (retry contract), resolves title-or-module-number with
  ambiguity refusals, and expands the target's module on open — the same
  two setters as the human tree click.
- **authoring.find** (unblocked): `openFind(query?)` joined
  `RichSectionEditorHandle` — the already-built find bar (plugin highlights,
  counter, Ctrl/⌘-F) opened programmatically, pre-seeded; returns false in
  source mode so the handler refuses honestly instead of claiming a find it
  never opened. Read-only: dirtyGuard deliberately not applied (a person's
  own Ctrl-F works over unsaved edits); replace stays human.
- **artifacts-center → authoring hand-off gap** (recorded wave-3): the docx
  Open button no longer navigates empty-handed — it rides the SAME
  `authoring.open-document` directive AnA rides (stash → navigate → the
  editor resolves with its own honest-miss rules).
- **Governance regex grew with the surface**: `advance` (change-control's
  Part 11 ceremony) and `launch` (a metered-spend start) joined
  GOVERNED_VERB_PATTERN — pinned failing-first on `quality.advance-change`
  and `deep-research.launch-research` before the pattern widened.
- The training-orientation demo gained a quality stop (navigate + live
  change-log filter). `check-ana-surface-context` ID_BASELINE 66→68
  (deep-research + quality publishers). Wiring proof:
  `anaDrivesWave4.test.tsx` — nine cases, including the credential-drawer
  hold, the typed-into-the-real-canvas unsaved-edits refusal, find-bar
  DOM with plugin highlights through the 'authoring' alias, the artifact
  Open relay, and quality's held-through-the-load apply.

Still deliberately absent, with reasons: `apps.show-admin-controls`
(pre-arms a live governed org-wide switch), any deep-research
query/sources/depth/launch driving (metered spend — now also structurally
refused), `cmc` pane-form busy guards (child-local state; parity-with-human
limitation recorded in wave 2).
