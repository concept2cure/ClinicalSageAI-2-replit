# D2: AnA operates the launch catalog, and says only what the screen did (2026-09-28)

**Launch row:** D2, the launch catalog. The founder tried AnA's agentic
abilities (moving between screens, operating them, and giving training and
sales demonstrations) and reported that none of it worked. The first pass
(`9db931c56`, merged in `d5a11b101`) fixed nine breaks between the ask and the
screen moving. This change fixes what an adversarial review of that pass
confirmed, what the review's own verifiers found, and what the browser run
below found after that.

## What was wrong, by layer

**The audit trail.** A move that failed on screen was reported to AnA through
the person's steer channel. The run's control lineage recorded the app's words
as a human control event. The person was shown "You steered AnA:" for something
they never typed. A paused run was resumed. Reports now use their own
`screen_report` control: no control event, no status change, and never
announced as a steer (`server/services/ana/run-control.ts`, `stream.ts`).

**What AnA says.** Her next round was written as soon as the tool results came
back. The screen takes a moment to apply a move, so a failure report arrived
while she was already answering, and no round read it. In the browser she said
"Searching the Vault" over an empty vault that showed nothing. Each drive event
now carries a `moveId`. The shell reports every move back exactly once:

- landed (`move_landed`);
- refused by the screen, with its reason;
- refused on arrival (drive not on, taken over, over the turn's limit);
- dropped by Take over or Stop.

The server holds her next model call until every move of the round has settled,
for up to 10 seconds, and it waits only for clients that declare they report
(`drive_acks`). A move still unconfirmed at the ceiling is told to her as
unconfirmed, never as done.

**The screen's own words.** A refusal such as "no document matching X" left her
nothing to try. Refusals of pick-by-name operations (programs, documents,
submissions, hazards, changes) now list what the screen shows. She is told to
retry once with one of those exact names, and not to name a document until the
screen confirms it. The Vault refused nothing and searched nothing when it was
empty or had no program open. It now says which.

**Controls that did nothing.** The rail's Ask / Agent switch added an
"[Agent] " prefix that the shell stripped before sending, so both modes behaved
the same. It is now the Live Drive preference: Agent means AnA operates the
screens, Ask means she offers the moves as buttons. Two other controls failed
to halt the drive: every Stop except the drive strip's, and a mid-turn
promotion to demo mode, which re-armed a drive the person had taken over. Both
now halt it or leave it halted, including the moves still in flight.

**Gateway.**
- Tool definitions are no longer sent to local servers that cannot take them
  (`LOCAL_AI_SUPPORTS_TOOLS=1`). The model is told it has no tools that turn,
  so it cannot claim a move.
- 404s and account refusals (billing, spend cap, disabled organisation) count
  against a provider, so the fallback walks on.
- An app-authored operator turn folded on a fallback model is labelled as the
  app, never as the person's interjection.

**Programs.**
- Program references are resolved in SQL across all of the tenant's programs,
  not only the 100 most recent.
- An ambiguous reference is refused with the matches, not guessed.
- A navigation in the same round waits for a program being opened.
- An operation on a one-program screen with none open asks which program
  first, as navigation already did.

**Conversation.**
- Opening the conversation screen no longer wipes a live turn.
- A new conversation no longer carries the previous one's last ten turns as
  history.
- The self-drive tools are pinned for the routes that can move a screen, and
  no longer forced onto voice and background investigations.

## Evidence

- `browser-battery.txt`: **19/19** in headless Chromium against the real app
  (local PostgreSQL provisioned with `install-fresh`, the migration set and
  the GA demo seed).
  - Navigation from Home and from the rail.
  - A program's Vault with none open.
  - Opening a program.
  - An empty-vault search refused aloud.
  - Both demonstrations, every stop in order.
  - The sales demonstration's recovery: guessed title refused with the real
    one listed, then opened.
  - Buttons instead of moves with Live Drive off.
  - No page errors.
- `model-side-log.txt`: the same run from the model's side.
  - Rounds take 1 to 1.6 s: each move settles, and the next round follows.
  - The failed guess reaches the very next round, and the retry uses the
    listed title.
  - The stand-in model rejects what the real Messages API rejects (an empty
    non-final message).
- `typecheck.txt`: `npm run typecheck` on the final code, exit 0, no errors.
- Unit and integration tests: see the test counts in the commit message.
  - Every new test was first seen failing with its fix removed by hand, then
    passing with it restored.
  - Server tests use real HTTP through the stream route, and real PostgreSQL
    (PGlite) with the shipped migration for the run queue.
  - Client tests mount the real V2App shell.

## How the browser run was made

No model key is available in this environment, so the battery ran against a
local stand-in for the Anthropic Messages API (`ANTHROPIC_BASE_URL`). It streams
like the API and refuses what the API refuses. It plays a model that uses the
self-drive tools the way their instructions ask. One local-only data change: the
seed's single authoring document was linked to BX-512, so that a program has a
document to open.

## Not yet shown

- **A real model.** The instructions AnA reads are tested as text. A run with a
  key (`docs/LOCAL_TESTING.md`, "AnA operates the app") is the remaining
  evidence for this row.
- **Staging.** It is owed with D1.
- **Decision for the founder.** With `ENTITLEMENTS_ENFORCE=on`, Live Drive
  requires the `professional` tier (`ana_live_drive`). A standard-tier
  organisation gets the moves as buttons only.
- **Programs past the Projects screen's first page.** A program beyond the
  first 50 is found by the server but cannot be opened by name on the Projects
  screen. AnA is told to open it with `navigate_to` project-home, which works.
- **The run-queue migration comment.** `db/migrations/20260917_ana_runs.sql`
  still describes queue entries without `kind` / `moveId`. Rule 1 makes an
  in-place amendment a registered drift, and the code reads old entries as
  steers, so it is left alone.
