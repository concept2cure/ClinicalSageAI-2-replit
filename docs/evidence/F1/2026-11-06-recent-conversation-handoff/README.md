# F1 — recent conversation selection reaches the conversation on screen

## What already exists

`Shell.tsx` writes the existing `C2C_CONVO` channel after its leave guard.
`V2App.tsx` owns routing and `convoEpoch`, currently used for seeded questions.
`ConversationThread.tsx` reads a saved selection once at mount and already owns
history load, retry and active-stream refusal. `routing.ts` owns saved-thread
URLs. `shellAskGuard.test.tsx` is an existing real-shell handoff harness; the
sidebar/palette tests stop at mocked navigation. Thread routes, chat stores and
project admission already exist and are unchanged.

Detailed inventory, deleted-history search and acceptance:
`.design/claude-convergence/F1-RECENT-CONVERSATION-HANDOFF.md`.

This is open package F1, completing `client/src/concept2cure/v2/V2App.tsx` inside
the existing D1 conversation workflow. No layout change or new product capability.

The existing active-answer refusal is now factored into `routing.ts`, used at
both shell preflight and conversation arrival. It runs before remount/URL change
on an already-open conversation; the shell reads its own chat through a ref and
uses the existing accessible `C2CToast`. Same-thread selection consumes the
redundant handoff without remount. No second chat state or guard registry.

## Verification

- `red.log.gz`: six genuine failures before the repair, with two pending-work
  controls passing. These mount real V2App, Shell, ConversationThread and the
  actual chat hook, with session/API transports as fixtures.
- `red-refused-draft.log.gz`: independent review caught an intermediate repair
  that remounted before refusing an active-answer switch. Both stream cases
  lost a follow-up typed in the composer. The final preflight fixes that.
- `green.log.gz`: thirteen suites, 178 tests pass. The eight integration cases
  cover Rail/palette A→B→A, exact saved histories and URLs, same-thread textarea
  identity and unsent text, pending-work refusal before channel writes, active
  SSE refusal without abort/cancel/draft loss/URL loss, no replay at completion,
  and fresh retry with the notice cleared. Existing seed, project-mismatch,
  shared-editor handoff, Live Drive and surface-routing suites stay green.
- `regressions-initial.log.gz`: the first combined final run exceeded the
  existing 5-second lazy-shell wait in Live Drive's first case while a build
  ran in parallel; 166 tests passed. The unchanged suite then passed in the
  quiet final run above. No assertion or timeout was weakened.
- `build.log.gz`: production client/server build passes.
- `lint-baseline.json.gz`, `lint.json.gz`: zero errors, with the same existing
  seven V2App warnings and five ConversationThread warnings; routing and the
  new test have none.
- Independent review: no material issue after the draft-preservation repair.
  Error feedback uses the existing alert, keyboard palette selection is
  exercised, microcopy is the existing refusal, and no layout, motion, tokens
  or document-type UI are added. Existing capabilities remain reachable.

## Running application

`browser/baseline.json` and its screenshots reproduce the defect in Chromium:
selecting B while A was open kept A's history, dropped the saved-thread URL and
left B parked in the handoff.

`browser/final/green-four-contexts.json` records 1440×1000 and 390×844, light
and dark: both entry points switch actual saved histories, preserve the current
thread's exact textarea/unsent text, survive reload and retain the real local
project in the global, tab mirror and URL. No browser page errors. The local
runtime uses `app_service` (not superuser, no BYPASSRLS), with RLS enforced.

`browser/final/synthetic-stream.json` records two additional browser contexts
with an explicitly intercepted, held SSE response. These verify refusal before
unmount, no B history request/replay, and successful fresh retry. No provider or
model drafting was exercised. The ordinary local 429 encountered during repeated
walks and the successful cooldown retry are recorded in `source-state.json`.
No limiter or runtime control was bypassed. Its three source hashes match the
final tested source. Scripts, receipts and screenshots contain fictional data.

Required plan, one-product, canvas-path, lint and typecheck gates run before
publication. This is engineering evidence, not formal OQ or deployment proof.
