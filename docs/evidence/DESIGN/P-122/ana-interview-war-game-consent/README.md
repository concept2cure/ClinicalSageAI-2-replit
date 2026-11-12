# The war game, the finished interview and the consent gate reach the screen

P-122 ("the UI shows the work"). Packages **R1** (reach) and **F1** (repairs). Filed 2026-11-12.

The founder's instruction for this session was to get what was built surfaced correctly in the UI and working for GA. This covers the three things this lane built in October: the interviews' completion, the war game, and the consent approval gate.

## What already exists (RULE 3)

| Piece | Path | State before this change |
|---|---|---|
| The interview engine, its questions and its completion event | `server/services/ana/intelligence-questions/engine.ts` (`buildCompleteEvent`, `buildSuggestedActions`) | Emits `intelligence_flow_complete` on the stream. |
| The question card | `client/src/concept2cure/v2/AnaQuestionCard.tsx` | Draws every question and field type, including the 23 questions added on 2026-10-23. No change needed. |
| The war-game engine | `server/services/ana/intelligence-questions/war-game/engine.ts` | Emits `war_game_report`, with `rulesAssessed`, `rulesTotal` and `notAssessed` since 2026-10-22. |
| The chat hook | `client/src/concept2cure/components/ana/useAnaChat.ts` | Keeps both on the message (`warGameReport`, `intelligenceFlowComplete`). |
| The conversation | `client/src/concept2cure/v2/surfaces/ConversationThread.tsx` (`toTurn`, `TurnSteersAndPremortem`) | **Dropped both.** Nothing drew them. |
| The war game's old view | `client/src/concept2cure/components/ana/WarGameReport.tsx` | Deleted 2026-08-04 (`2895218b8`) with the rail's dead code. The history search `git log --all --diff-filter=D -- 'client/**/WarGameReport*'` finds nothing in this clone, which is shallow; the deletion is recorded in `useAnaChat.types.ts`. |
| The pre-mortem panel, the pattern followed | `client/src/concept2cure/components/ana/CrlPremortemPanel.tsx` and its styles | Drawn under the turn that produced it. |
| The consent approval gate | `server/services/protocol-consent/protocol-consent-logic.ts` (`evaluateConsentCompleteness`) | Decides approval. |
| The protocol's consent tab | `client/src/concept2cure/v2/surfaces/ProtocolDevReviews.tsx` (`ConsentTab`), fed by `server/services/protocol-development/pdev-view-assembler.ts` | Printed "% complete" from the `present` ticks, not from the gate. |

Nothing here is new capability. No screen, route, service, table, mount or AnA tool is added. Two view components join `components/ana/`, beside the pre-mortem panel they follow, to draw events the client already receives.

## 1. Reach: the war game and the finished interview are in the conversation (R1)

- **`WarGameReportPanel.tsx`** draws the war game under the turn that ran it:
  - the engine's assessment word as the headline;
  - "N of M checks assessed", with the score and risk level as detail;
  - each finding with what was observed, the requirement, what to do and its citation. Criticals are open; warnings and notes fold under one disclosure;
  - the checks that could not be assessed, listed as not assessed and never as passes;
  - when nothing was assessed, it says so, whatever assessment word the report carries.
- **`InterviewCompletePanel.tsx`** draws the finished interview: its summary and each issue its checks found, with the issue's reference.
- **The next actions** (for example "Run FDA War Game") are the conversation's own suggestion chips (`TurnSuggestions`). Choosing one sends its label to AnA as the person's message. Nothing runs until then.
- **`ConversationThread.tsx`**: `toTurn` carries both fields, and the turn mounts both panels.

**Red, then green.** With the wiring stashed, 4 of the 5 new conversation cases fail; with it, the conversation file passes 38 of 38. The cases now live in `components/ana/__tests__/war-game-and-interview-panels.test.tsx` (6 cases) and `v2/__tests__/conversationRailTwins.test.tsx` (2 mounting cases).

**Opened in the running app.** Local instance from `npm run up` on port 5270, organisation 2, signed in as the seeded administrator.
- The report shown is the engine's own output: `runWarGame('nda', …)` over a partly answered NDA interview gave 18 of 32 checks assessed, 14 findings and 14 not assessed.
- No model provider is configured in this environment, so the browser's request to `/api/ana-ri/stream` was answered with those engine events. The client, the shell, the sign-in and the panels are the real ones. The model's narration is not exercised here.
- Because the stand-in stream closes without a recorded turn, the screenshots also show the conversation's own "interrupted" and "record not confirmed" lines. Those are the client's honest state for such a stream, not part of this change.
- Screenshots: `after-interview-complete-*.png`, `after-war-game-*.png`, `after-war-game-not-assessed-*.png`, at 1440×900 and 390×844, light theme.

## 2. Repair: the consent tab shows the approval gate's verdict (F1)

**Defect.** The tab printed "% complete" as `present` ticks over required rows. The gate that decides approval also needs each element's content, the wording 21 CFR 50.25 prescribes, and every element the form is now held to. So a form the gate refuses could read "100% complete".

**Change.**
- `consentGateView` in `protocol-consent-logic.ts` returns the gate's verdict for display: counts, percentage, whether the form can be approved, the reasons with each element named by its title, and what an approved form predates.
- `pdev-view-assembler.ts` reads each element's content, sends `consentGate`, and marks each row `complete` only when the gate accepts it.
- `ConsentTab` shows the gate's figure and says what is missing. For an approved form it shows what the form predates. It stays read-only, as its design note requires.

**Red, then green.** The new assembler case fails with the source stashed and passes with it (28 of 28 with the consent suites). `protocolConsentTab.test.tsx` passes 4 of 4.

**Opened in the running app.** The biotech demo pack made the project and protocol through the product API. A consent form was then created on that protocol through `/api/protocol-consent`, with every required element drafted and ticked except the ClinicalTrials.gov statement, and with a confidentiality element that does not mention FDA inspection.
- The gate reports 9 of 11.
- The tab reads "9 of 11 required elements complete", "82% complete", "This form cannot be approved yet", and both reasons by title.
- On trunk the same form reads 10 of 11 ticks, 91%.
- Screenshots: `after-consent-tab-*.png`, `after-consent-tab-findings-*.png`.

## 3. Repair: the protocol workspace's working panel has a usable height (F1)

Found by opening the consent tab. Measured in the running app at 1440×900 before the change:
- the selection bar, the protocol header, the open-in-editor note, the suggested order and the tabs took 717 px;
- the working panel `.pd-work` was a 183 px scroller holding 1,041 px of content, inside the page's own scroller;
- this applied to every tab: sections, statistics, the IRB package, consent.

**Change** (`styles/protocol-dev-editing.css`): the protocol no longer shrinks to fit the window, and its grid is at least most of the window. Measured after: the panel is its content's height (1,041 px), and the page is the one scroller.

There is no automated test: jsdom has no layout. The measurement script and its before and after figures are the evidence.

## Checks

- Typecheck: 0 errors.
- ESLint warning ratchet: no file changed its count.
- Suites: see `suites.txt`.

## Found and not changed here

- **`npm run up` on a non-default port serves a blank page.** The server refuses its own origin (`CORS_ORIGIN_BLOCKED`) unless `ALLOWED_ORIGINS` names it; port 5000 is allowed by default. Worked around here with `ALLOWED_ORIGINS=http://localhost:5270`. The fix belongs in `scripts/dev/env-local.mjs`.
- **A fresh install fails its last check on a database without pgvector.** `public.ctd_cross_references` is reported as carrying no row-level security policy. With pgvector installed the same install passes.
- **The protocol workspace's tab strip scrolls sideways.** At 1440 px the last tabs, Consent among them, start off-screen. They are reachable by keyboard and by scrolling the strip.
- **The app's theme does not follow the browser's dark preference**, so only light screenshots are filed.
- **The model's narration of a war game was not exercised**, as said above.
