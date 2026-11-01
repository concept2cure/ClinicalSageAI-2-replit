# One design, one plan — Concept2Cure is Claude for life sciences

**Decided by the founder, 2026-10-31 (P-78). Absolute.** It binds every developer, every Claude Code session, every
Codex, Copilot or Cursor agent, every subagent, workflow, cron job and automation, from any tool. Nobody builds
outside this plan, and nobody breaches it. `CLAUDE.md` RULE 5, `AGENTS.md` and the Copilot instructions point here.
`npm run ci:one-design-plan` in `.husky/pre-push` enforces it, with no bypass.

> The founder: "This platform should look like Anthropic built this. It should match how Claude is designed
> entirely, from projects to the canvas to the editor to the details. This is basically Claude for life sciences."
> And: "everyone must work from the same design and goals and never breach your plans. Never build anything outside
> of the plans and to bring the code base beneath the UI fully to life inside this new UI framework."

---

## 1. The goal

1. **It looks and works like Claude.** Concept2Cure looks and works like Claude (claude.ai): projects, the project,
   the conversation, the canvas, the editor and every detail, as if Anthropic built it for regulatory affairs in
   life sciences.
2. **The whole codebase lives in that UI.** Every capability the server, engines and data already provide is
   reachable, usable and honest in the new UI. Nothing built beside it, nothing left unreachable beneath it. A
   capability with no UI caller is reached by its package (R1) or retired by a founder decision. It is never
   duplicated.
3. **Nothing is built outside the plan.** A new screen, API mount or table exists only when this plan's ledger
   approves it. Everything else is converging, completing, reaching or repairing what exists (CLAUDE.md RULE 3 and
   RULE 4).

## 2. The design (binding)

The colour, type and spacing tokens already exist in `design-system/colors_and_type.css`, and they are Claude's
palette. Keep them. This section decides how they are used.

**Character.** The product is calm, typographic and conversation-first, with generous whitespace and almost no
chrome. The content leads and the frame stays quiet:
- one primary action per view;
- sentence case everywhere;
- status colour only for meaning;
- Claude orange (`--accent-main-100`) used sparingly: the send button, the spark, focus, and one primary action.

**Type.** The system sans is the UI face, at 14–15 px for body text. Lora is the reading serif. It sets:
- the greeting;
- page titles where Claude uses them;
- assistant prose;
- documents.

No display sizes inside content. Anthropic's own typefaces are proprietary and are not used; this pairing is the
licensed equivalent.

**Sidebar.** The sidebar is collapsible and holds, in order:
1. the brand and the primary "New conversation" action;
2. the places: Home, Projects, Tasks, Communication, Vault and Submission Center;
3. the work areas: CMC / Module 3, Risk-based monitoring, Biostatistics, Quality, Reporting & analytics;
4. Recents: recent conversations and projects, as Claude lists them;
5. the account, at the bottom.

The active item takes a soft fill.

**Home.** A centred serif greeting and one large rounded composer (radius about 20 px, a hairline border, a soft
shadow, attach, and an orange send button). A few quiet starter suggestions sit below. Nothing else is above the
fold.

**Projects.** The page holds the title, a search field, one "New project" button and a grid of calm cards. Each card
shows the name, a one-line description and when it was updated. Filters stay quiet. There are no readiness bars and
no stat strip.

**A project.** This is Claude's project page:
- **Main column:** the name, a one-line description, the composer ("How can I help with this project?") and the
  project's conversations.
- **Right column (about 320 px), "Project knowledge":** the project's documents, sources, team and key facts, each as
  a quiet card.
- **The regulatory work:** Plan, Evidence, Author, Review, Submit and Respond, documents, filing state and the work
  areas. All of it stays one click away, in a quiet segmented control and sections below the composer, never as
  banners above it.

**Conversation.** A centred reading column. AnA's prose is set in the serif, the person's turns are quiet, and
artifacts and citations appear inline.

**Canvas.** This is Claude's artifact: the conversation on the left, the document on the right in an artifact panel.
The panel has a slim header (title, version, copy/download/share, close) and renders the document with reading
margins in the serif. Every way of opening a document opens this view.

**Editor.** There is one editor, `client/src/concept2cure/v2/editor/` (RULE 4). It is a quiet, centred writing
surface:
- the toolbar is minimal and the outline appears on demand;
- review, comments, versions, signatures, filing and export live in an inspector that slides in, not in permanent
  panels.

**A work area.** CMC, Biostatistics, Tasks, Vault, Submission Center, Communication, Quality, RBM and Reporting share
one page pattern:
- a header with the title, one line of description, one primary action and quiet secondary actions;
- content in the canonical list, table and card styles;
- guidance in AnA and in the composer's suggestions, not on the page.

**Details.**
- Buttons have radius 8 px, are 32–36 px tall and are ghost by default. Cards have radius 12 px and a hairline
  border, with no heavy shadows. Inputs have radius 8–10 px. Icons are 16–18 px with a thin stroke.
- Motion is 150–200 ms ease-out, with no bounce.
- An empty state is one sentence and one action.
- Numbers are formatted. Copy is calm and plain.

**Retired patterns.** Nobody adds these. Each package removes them from its own screens:
- uppercase coloured eyebrow labels ("CMC — MODULE 3 OPERATING SYSTEM", "PROJECT — COLLABORATION");
- "What to do now / NEXT STEP" guidance boxes, which move into AnA and the composer;
- "THIS WORK FLOWS INTO" destination chip rows;
- a large serif answer banner on every screen; at most one remains, where the answer is the screen;
- stat tiles and percentages as permanent chrome;
- ids, enum values, table or function names and snake_case on screen;
- "Coming later" roadmap text;
- per-document-type cards or screens, and a second editor or canvas (RULE 4).

**Zero capability loss.** This is not negotiable (`.claude/skills/claude-ui-design-principles.md`). Every metric,
workflow, verdict and action a removed element gave stays reachable: through the conversation, an inspector, a quiet
section or ⌘K. Each package files a ledger of every removed element and where it now lives.

## 3. The work packages

There is one ledger, `docs/design/one-design-plan.json`, and the gate reads it. A package's **status** decides
whether work may be committed under it:
- `open`: commits are accepted;
- `queued`: it waits for the packages it depends on;
- `closed`: it is done and accepts no more work;
- `parked`: the founder parked it.

| ID | Package | Depends on | Status |
|---|---|---|---|
| D0 | **Foundations.** The canonical page header, card, button set, segmented control, empty state, inspector, artifact panel and composer, built from the tokens. The retired classes are removed from the shared CSS. | — | open |
| D1 | **Shell, Home and the conversation.** The sidebar with Recents, the greeting and composer, the conversation thread, the top bar, ⌘K, the task tray and notifications. | D0 | queued |
| D2 | **Projects.** The grid of cards, search, quiet filters, and the New project flow. | D0 | queued |
| D3 | **The project page.** The main column and composer, Project knowledge, the quiet stages, documents, filing state and work-area doors. | D0 | queued |
| D4 | **The canvas and the editor.** The artifact panel beside the conversation, and the quiet editor with the inspector. One editor. | D0 | queued |
| D5 | **Work areas I.** CMC / Module 3 and Biostatistics on the one page pattern. | D0 | queued |
| D6 | **Work areas II.** Tasks, Communication and Vault. | D0 | queued |
| D7 | **Work areas III.** Submission Center, Quality, Risk-based monitoring, and Reporting & analytics. | D0 | queued |
| R1 | **Reach.** Every server capability with no UI caller is reached in its package's screen, or retired by a founder decision. The inventory and each reach are filed under `docs/evidence/DESIGN/R1/`. | — | open |
| F1 | **Repairs.** Defects in shipped behaviour, such as the 2026-10-31 running-app audit findings. Repairs add no screen, mount or table. | — | open |
| L1 | **Launch rows** D1–D10 of `docs/LAUNCH_DEFINITION_OF_DONE.md`, as defined there. | — | open |
| DATA | **Demo data.** `scripts/demo/**`, `data/seeds/**` and their evidence. | — | open |
| PLAN | **This plan and its gate.** It changes only by founder decision. | — | open |

Each design package (D0–D7) runs its own work in this order:
1. **Spec.** Append `## <ID> spec` to `.design/claude-convergence/<ID>.md`. For each screen it says what the screen
   is today, Claude's pattern, the change (by file), the capabilities kept, and the acceptance checks.
2. **Build.**
3. **Evidence.** File before-and-after screenshots at 1440 px and 390 px of the running app, in light and dark, under
   `docs/evidence/DESIGN/<ID>/`, with the capability-kept ledger.
4. **Review.** The six-lens design review: design, accessibility (WCAG 2.2 AA), microcopy, motion, design system and
   honest state.
5. **Close.** The founder or the lead marks it `closed` in the ledger, under `Plan: PLAN`.

## 4. How everyone works

1. **Every commit names its package.** The last paragraph of the message carries the trailer `Plan: <ID>`, for
   example `Plan: D3`. The pre-push gate (`npm run ci:one-design-plan`) refuses a commit with no trailer, with an
   unknown package, or naming a package that is not `open`.
2. **A commit stays inside its package.** Every file it changes must match the package's `paths` in the ledger.
   Tests, `docs/evidence/**` and `.design/**` are always allowed.
3. **Nothing new without the plan.** These must be listed under `approvedAdditions` in the ledger, naming the
   package, before the gate accepts them:
   - a new screen: a `UI_SURFACES` id or a `SURFACE_VIEWS` entry;
   - a new API mount: a `/api/…` path registered in `server/bootstrap/`;
   - a new table: a `CREATE TABLE` in a new migration for a name no existing migration creates.
4. **The plan changes only by founder decision.** A change to this file, the ledger, the gate or the rule text in
   `CLAUDE.md`, `AGENTS.md` or the Copilot instructions carries `Plan: PLAN` and `Founder-Decision: P-<n>`. The
   decision is recorded in `docs/LAUNCH_DEFINITION_OF_DONE.md`. No session amends the plan to make room for its own
   work.
5. **There is no bypass.** No environment variable or flag skips the gate. A commit the gate refuses is reworded or
   split. If the plan really is wrong, ask the founder.
6. **Scope, not branches.** Parallel sessions split work by package and file set (RULE 0). They never put two
   sessions on the same file at once.
