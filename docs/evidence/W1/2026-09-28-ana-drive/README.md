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

**Rate limits.** A change on `concept2cure-v2` this week (`50b04d99`, IAM-18)
metered every `/api/ana-ri` request in the 30-a-minute AI bucket. That included
requests that call no model: the rail's activity poll, the Live Drive state
read, and the run control endpoint, which now carries one confirmation per
move. In the browser, one session's polls and a demonstration's confirmations
used the bucket up. The confirmations were refused, so each of AnA's rounds
waited out its ceiling, and the person's next question was refused and shown
as "AnA is unreachable — the network or the AI gateway did not respond".

- Reads and the control endpoint under `/api/ana-ri` are now ordinary API
  traffic, and everything else there stays AI. Every GET route there was
  checked, and none calls a model. The change is in
  `server/middleware/redisRateLimiter.ts`.
- A refused turn now says what happened: a rate limit, the organisation's
  weekly cap, or no provider configured. It is no longer shown as a network
  failure.

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

## Against the real API's contract (the same day, second pass)

The stand-in model had enforced one rule of the Messages API. A request the
real API refuses would have passed every check above and failed the first real
turn. So the stand-in now refuses what the API documents it refuses:
- retired model ids;
- mid-conversation system messages on models that do not take them, or out
  of place;
- unpaired tool calls;
- malformed tool definitions;
- more than four cache breakpoints;
- sampling, thinking and effort settings a model rejects;
- forced tool choice.

It also streams a thinking block first, as a real adaptive model does. Each
rule was first made to fail on a request built to break it.

- **The requests AnA sends conform.** None of 135 was refused, across both
  shapes the gateway produces:
  - Sonnet 5, which the default model tiering picks for drive rounds, with
    AnA's operator turns folded into the user turn;
  - Opus 5.5, with tiering off. There 34 operator turns went through as
    mid-conversation system messages, all placed as the API requires.

  The battery passed 19/19 both ways.
- **History.** A question is saved when its turn starts, and the answer only
  if the turn produced one. So a failed or stopped turn left the saved
  conversation offset by one, and the last-20 window AnA is given could open
  on an answer. The API's error reference lists that as a 400, and it would
  have recurred on every later turn of the conversation. The window now opens
  on a question (`server/services/ana/history-window.ts`, both of the stream
  route's history sources).
- **Programs past the Projects screen's first page.** The screen lists the 50
  most recent programs and matched only those, so a program the server had
  found was refused there as unknown.
  - `act_on_screen` now hands the screen the program it resolved, beside the
    directive as `navigate_to` does, never as a param: params are what the
    model writes, and the registry keeps only declared ones.
  - The client carries it through its one validator, the bus passes it to the
    screen's handler, and a chip carries it when Live Drive is off.

## A model that thinks is not a stalled stream (third pass)

A real adaptive model does something the stand-in never did: it thinks in
silence. Opus 5.5 always thinks before writing, and Opus 5 and Sonnet 5 do
unless told not to. With the default display, none of that thinking is
streamed; the API sends only `ping` events, and the Anthropic SDK drops them.

The gateway aborted any stream silent for 30 s. The SDK ends an aborted stream
without an error, so the gateway returned an empty answer as a success. Any
turn whose model thought for longer than 30 s ended as an empty AnA bubble,
with no move and no error, and Progress read "Finished".

Reproduced in the browser by making the stand-in think silently the way the
API does (`silent-thinking-before.png`).

- **The fix** (`server/services/ai-gateway/stream-stall.ts`, both stream
  paths):
  - Silence is a stall only while text is streaming.
  - Thinking, a tool's buffered arguments and the gaps between blocks are
    the model working, up to five minutes.
  - A stall before anything is produced is an error, so the fallback model
    runs, rather than an empty answer.
- **The proof:** the same ask with 35 s of silent thinking passes
  (`silent-thinking-after.png`). The whole battery passed 19/19 with silent
  thinking on every one of its 43 streamed rounds (`silent-thinking.txt`).

## A cut-off answer says so (fourth pass)

The stream route never read why the model stopped writing. An answer that hit
the length limit, or a stream that stalled mid-answer, reached the person as a
finished one. The status line read "Finished", there was no note and no
Continue, and the next turn was handed it as complete.

It now ends the turn `answer_cut_off`, through the existing stop-reason
channel, using the gateway's own `isTruncated` check. That reason has words on
every surface that words a stop: the note under the answer (with Continue),
the status line, the next turn's note and the turn record.

Shown failing and then passing in the browser, with the stand-in ending an
answer at `max_tokens` (`answer-cut-off.txt` and the before/after
screenshots).

## Evidence

- `answer-cut-off.txt`, `answer-cut-off-before.png`,
  `answer-cut-off-after.png`: a cut-off answer, before and after.
- `harness/`: the stand-in model, its self-test and the browser battery that
  produced every run below, with how to repeat them. Run from this folder on
  the current tree, it passed 19/19, with the stand-in refusing nothing.
- `silent-thinking.txt`, `silent-thinking-before.png`,
  `silent-thinking-after.png`: the silent-thinking cut-off, before and after.
- `contract-audit.txt`: the rules, their sources, the stand-in failing each
  one on purpose, what AnA sent in both configurations, and both battery runs.
- `browser-battery.txt`: **19/19** in headless Chromium against the real app,
  run on the merged tree. It used local PostgreSQL provisioned with
  `install-fresh`, the migration set and the GA demo seed. The merged run
  logged no 429s; the run just before the rate-limit fix had failed 2 of the
  19 checks on 429s.
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
- `typecheck.txt`: `npm run typecheck` on the merged tree, exit 0, no errors.
- `tests.txt`: the regression sweep over every area this touches, before the
  merge and on the merged tree (593 files and 7,454 tests passed).
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

- **A real model.** The requests are now checked against the API's
  documented contract, but a stand-in cannot show how a real model follows
  the instructions it is given. A run with a key (`docs/LOCAL_TESTING.md`,
  "AnA operates the app") is the remaining evidence for this row.
- **Staging.** It is owed with D1.
- **Decision for the founder.** With `ENTITLEMENTS_ENFORCE=on`, Live Drive
  requires the `professional` tier (`ana_live_drive`). A standard-tier
  organisation gets the moves as buttons only.
- **The run-queue migration comment.** `db/migrations/20260917_ana_runs.sql`
  still describes queue entries without `kind` / `moveId`. Rule 1 makes an
  in-place amendment a registered drift, and the code reads old entries as
  steers, so it is left alone.
