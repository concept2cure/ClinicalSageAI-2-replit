# Rule 2: `start_war_game` scores the stored interview, never answers the model composes

**Rule:** CLAUDE.md Rule 2 ("numbers and verdicts come from deterministic engines").
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **S4** (AnA).
**Source:** a finding of session `019ZvHmh`, relayed by the founder through the coordinating session.
**Date:** 2026-11-01.

## The defect

`start_war_game` passed `input.answers`, which the model composes, straight to `runWarGame`. It then wrote the
resulting `overallScore` and `overallAssessment` to the audit log as `WAR_GAME_RUN`. So a readiness score computed
over answers nobody gave was recorded as if it described the project's interview. Its definition required those
answers in the call.

## What already exists (RULE 3)

| Piece | Path | What it does |
|---|---|---|
| The stored interview | `server/services/cmc/interview-sessions.ts` `loadInterviewSession` | Reads a session scoped to the organization: its flow, status and the answers the person gave |
| The other interview tools | `answer_intelligence_question`, `resume_intelligence_flow` and `commit_intelligence_flow` in `AnaToolExecutor.ts` | Already load the stored session by `session_id` (`intelligenceSessionId`) |
| The engine | `server/services/ana/intelligence-questions/war-game/engine.ts` `runWarGame` | Unchanged. Its report has one shape since `7be209e9c` |

Nothing was added. The handler now uses the session loader the other interview tools use.

## The change

- **The answers come from the session.** `start_war_game` takes the interview's `session_id`, loads the stored session
  and scores `session.state.answers` under `session.flowId`.
- **Refusals record nothing.** Without a `session_id` it answers `needs_parameters`, and an abandoned or unreadable
  session is refused. Either way nothing is scored and no `WAR_GAME_RUN` is written.
- **Answers in the call are not used,** and the reply says so (`answersInCallIgnored`).
- **The audit row** records the `sessionId` and the stored flow it scored.
- **The definition** drops `answers` and `source_flow_id`, requires `session_id`, and says it reads the stored
  interview. The flows' "Run FDA War Game" action names the `session_id`.

**User-visible:** a War Game now always scores what the person answered in the interview. Answers AnA composed can no
longer produce or record a score.

## Proof

- `red/before.txt`: `war-game-scores-the-stored-interview.test.ts` fails 5 of 5 on `ffdfed428`. Without a session the
  handler scored the call's answers and recorded the run.
- `green/after.txt`: 5 of 5 pass.
- The neighbourhood passes: 38 files, 619 tests. It covers every suite that names the war game or its engine, the
  suggested-actions and intelligent-awareness suites, `tests/ana-intelligence`, and every intelligence-questions suite.
- **Gates:** typecheck 0; ESLint ratchet unchanged.
