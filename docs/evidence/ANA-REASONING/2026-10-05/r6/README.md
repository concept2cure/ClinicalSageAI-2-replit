# A follow-up keeps the tools its conversation used

Round 6 of the founder-directed AnA reasoning lane (founder, 2026-10-04:
*"Enhance the reasoning layer of ANA"*). Board row: "AnA's reasoning is checked
by an engine…" (`docs/work-orders/README.md`). This round closes TP-RL-3
(high) from round 1's map (`../../2026-10-04/map-findings.md`). An adversarial
review changed its shape before it landed (`review.md`).

## What was wrong

- **The stream chose each turn's tools from that turn's message alone.** The
  only other inputs were the project type and an @app hint.
  - The launch catalog holds 609 tools, and a turn is offered 50.
  - 21 of those 50 are fixed: the always-on core and the self-drive pins. That
    leaves 29 slots chosen by the message's words.
  - Every round of the turn reuses the first call's set.
- **A follow-up names nothing the previous question did.** On today's trunk,
  the tool the previous turn ran was not offered on 33 of 48 follow-ups
  (`probe.txt`). For example:
  - "and for the EU?" after a CMC requirements question loses `get_cmc_requirements`;
  - "and as a victim?" after a DDI assessment loses `assess_ddi_risk`;
  - "now the toxicology part" after drafting the nonclinical overview loses
    `draft_nonclinical_overview_m2_4`.
- **The code said a dropped tool stayed reachable, and it did not.** The
  comments said it was reachable through `execute_platform_command`. That
  command dispatches only to the ana-ri command registry and answers
  `unknown_command` for anything else. So a dropped tool was out of reach for
  the whole turn, and the follow-up was answered without it.
- **Since `df30b4bbd` (the D2 lane, today), three record tools are always on.**
  Those are `get_document_section_requirements`, `list_fda_technical_rules` and
  `plan_submission_from_database_lock`, which the persona orders AnA to call.
  Every other tool still needed this round.
- **Two latent doors handed the selector a client's raw context.** These are
  send-message's `tool_context` and the voice socket's `context`. An object
  there reached the selector as "[object Object]", and a `hints` that was not a
  list threw. No client in the repo calls either door today.

## What changed

| Where | What |
|---|---|
| `server/services/ana/tool-selection.ts` | **`carriedTools`** and `MAX_CARRIED_TOOLS = 4`. The tools earlier turns ran successfully are offered right after the always-on core and the pins. The rules for a carried tool:<br>• it takes one of the relevance slots, never a slot on top of the cap;<br>• it is offered once, because the provider refuses a turn that names a tool twice;<br>• it comes only from the governed set;<br>• a tool observed failing is not carried.<br>Without a carry, the selection is what it was.<br>**Context hardening.** Each context field is read only as the string it is declared to be, and `hints` only as a list's strings.<br>**Corrected comments.** The two that said a dropped tool stays reachable through the bridge. |
| `server/services/ana/tool-trace.ts` | **`carriedToolsFrom`**, beside `collectTracesFromHistory`, its one reader of earlier turns' steps. It returns the steps that succeeded, most recent first, each once. A step the person declined is recorded as an error, so it is never carried; neither is a step that failed or was stopped. |
| `server/routes/ana-ri/stream.ts` | **Wiring.** The route reads the thread's steps into the carry and passes it to the selector. Only the thread's own history records steps; client-sent history carries none.<br>**Hot file.** The hunks are added lines, plus one rewritten comment at lines blamed 2026-09-22. |
| `server/services/ana/__tests__/tool-selection.test.ts` | **A test title corrected.** It said "nothing is ever out of reach". |

## What the review changed

The first plan did four things the review refuted (`review.md`):

1. **It also carried the previous message's text.**
   - On the production surface, that text cost the section-requirements tool
     after 7 of 16 changes of topic. A tools-only carry recovered every
     follow-up and lost nothing.
   - **Dropped.** It also duplicated `buildRetrievalQuery`.
2. **It carried eight tools.**
   - A stability question ranks `get_cmc_requirements` 24th and
     `explain_cmc_topic` 25th of its 29 relevance slots. Four carried tools
     leave both; eight would not.
   - **Four.** Mutant S03 now proves it.
3. **It folded the open section into the selection.** This was the authoring
   context's fields, with its own regressions: the `domainTrack` value
   'device' matches 60 tools. **Its own change, with its own eval: next.**
4. **It pinned no rule that a tool is never offered twice.** **Pinned**, and
   mutant S06 kills its removal.

## Proof

- **Red first.** `red.txt`: the round's tests against trunk `d11ee2368`, with
  14 of 46 failing. Each test that passes there is a negative control, and its
  red is its mutant:
  - no carry, no change;
  - each tool offered once;
  - only the governed set;
  - not an unhealthy tool;
  - the near-cutoff stability question;
  - a declined step;
  - the eval's change-of-topic cases.
- **Probe.** `probe.txt` runs the real selector on the production shape:
  - follow-ups: trunk loses the previous turn's tool on 33 of 48, and round 6
    on 0;
  - change of topic: 520 checks, 0 lost, 0 tools offered twice.
- **Green.** `green.txt`: 317 tests in 20 files. That is round 6's three
  suites, every tool-selection, tool-trace, self-drive and turn-plan suite,
  chat-path parity, and every stream-route suite.
- **Related suites.** `related.txt`: 6,334 tests passing. Three files fail,
  and none is this round's:
  - the ESG transport suite, which is environmental;
  - the registry scan, already handed on as board item 24;
  - `deepening-tools.test.ts`, which fails at load on trunk itself.
    Bisected to `8d919b1f8` and handed on as item 25.

  One source-scan test first failed because of this round. It reads a fixed
  window after the trace-note line, and the added line moved out of it; the
  test passes in the run filed.
- **Mutants.** `mutants/summary.txt`: 15 of 15 killed. The first run left
  two alive (`first-run/`), and each exposed a test that could not fail:
  - **T02, oldest tool carried first.** The order fixture had the same tool
    first and last, so both orders gave one answer.
  - **S03, eight tools carried.** The test helper's default parameter turned
    every "no project type" case into an IND case, so the near-cutoff case
    never ran.

  Both tests were fixed, and both mutants are now killed.
- **Lint.** `lint.txt`: no touched file gains a warning, and the new files have
  none.
- **Types.** `tsc.txt`: the whole-tree typecheck.

## Edits inside other lanes' windows

- **`stream.ts`.** It is inside two windows: row 100 (`3310d6c62`, 2026-10-04
  21:26) and ANA-AGENTS F1 (`ab2693c56`, 01:39 today). The hunks are added
  lines plus one rewritten comment, at lines blamed 2026-09-22.
- **`tool-selection.ts`.** The D2 lane added three always-on entries at 03:04
  today (`df30b4bbd`). Every line this round changes is blamed 2026-09-22, and
  none of `df30b4bbd`'s lines changed.
- **`tool-selection-routing.test.ts`.** The D2 and CMC lanes own it. It is not
  edited; the new change-of-topic test reads its cases.

## Not done here

- **Folding the open section into selection.** That means `sectionTitle`,
  never `domainTrack`, and it needs its own eval. Next.
- **send-message and the voice socket carry nothing.** Neither writes a tool
  trace. The selector hardening alone closes their latent context crash.
- **Substring matching.** "ind" matches inside "find", "index" and "kind",
  and "iss" inside "submission". That needs its own eval, and the routing eval
  is the D2 lane's.
- **Handed on.** Board item 25:
  - `deepening-tools.test.ts` fails at load since `8d919b1f8`;
  - the same false bridge claim at `send-message.ts:792-794`.
