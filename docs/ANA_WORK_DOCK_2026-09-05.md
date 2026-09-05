---
title: AnA at work — the live work dock
date: 2026-09-05
status: shipped on concept2cure-v2
scope: client/src/concept2cure/v2/AnaWorkPanel.tsx and the modules it composes; the SSE fields it reads; the five hosts that mount it
---

# AnA at work — the live work dock

## What a client sees

Whenever a person asks AnA 1.0 RI to do something, a dock titled **AnA at
work** appears beside the conversation and shows, while she works:

| Section | What it shows | Where the facts come from |
|---|---|---|
| Progress | A numbered list of the phases this turn has passed through, the one in flight highlighted, the current tool step named under it, and a running clock ("Still working · 57s"). | `status` SSE events, in order; the first `text` / `thinking` chunk; `done`; `post_done`. |
| Work queue | This run's tool steps grouped by round; steers accepted but not yet spliced into a round; the workspace's background deep investigations (running / stalled / recently finished). | `tool_use` / `tool_result`; the control endpoint and `interjected` events; `GET /api/ana-ri/agent-activity`. |
| Tools | A one-line summary built from the real step labels, one row per tool with its server-measured duration and an "Inputs" disclosure for audit, and the distinct tools used in the conversation. | `tool_use` / `tool_result` (with `latencyMs`). |
| Outputs | Drafts and whether they were saved, executed actions, governed actions waiting for sign-off, reports rendered. | `artifact_draft`, `artifact_version_saved`, `post_done`, `report_canvas`, `war_game_report`. |
| Context | Project, module, surface, engine, effort used, lens, document type, pinned tools, attachments. | The host's context plus the turn's `orchestration` and `done` fields. |

The header states the turn's outcome with its clock: `Still working`,
`Paused`, `Stopping`, `Finished in`, `Stopped after` (the person's own stop),
or `Did not finish` (timeout, lost connection).

## Where it is mounted

One component, five hosts. Nothing is duplicated between them.

| Host | File | Toggle |
|---|---|---|
| Shell rail | `client/src/concept2cure/v2/Shell.tsx` (`AnaRail`, `work` prop from `V2App`) | Rail header `tb-btn` |
| Conversation surface | `client/src/concept2cure/v2/surfaces/ConversationThread.tsx` (`.ct-side`, above the artifacts) | Side-column toggle |
| Document authoring | `client/src/concept2cure/v2/surfaces/DocumentAuthoring.tsx` (above the `role="log"` region, never inside it) | "At work" pill |
| eCTD co-author | `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx` | "At work" pill |
| RBM co-monitor | `client/src/concept2cure/v2/surfaces/RbmSurfaces.tsx` (`RbmAnaDock`, `work` prop from `Rbm.tsx`) | "At work" pill |

The show/hide choice is one per browser, shared by every host
(`client/src/concept2cure/v2/workDock.ts`, key `c2c-v2-ana-work-dock`).
Shown by default. Each host hands keyboard focus to its toggle before the
dock unmounts.

## Data flow

```
POST /api/ana-ri/stream  ──SSE──▶  useAnaChat (components/ana/useAnaChat.ts)
   status / text / thinking / done / post_done      → progress: AnaProgressPhase[]   (anaProgress.ts)
   tool_use / tool_result (+latencyMs)              → toolCalls[i].startedAt/endedAt/latencyMs
   interjected                                       → pendingSteers (FIFO)
   error / abort / idle timeout                      → completedAt, progress closed 'stopped',
                                                       running steps settled as not finished
GET /api/ana-ri/agent-activity ──poll 20s while shown──▶ useAgentActivity (v2/useAgentActivity.ts)
                                                       state: idle | loading | ready | error

AnaChatMessage[] + streaming + runStatus + pendingSteers + AgentActivityView
        │
        ▼
anaWorkModel.ts (pure projections: stateLineFor, elapsedFor, spokenLine,
                 collectOutputs, contextRows, conversationTools, stepDuration)
        │
        ▼
AnaWorkPanel.tsx (useWorkModel, memoised; header; section composition)
        └── AnaWorkSections.tsx (Section, Row, ToolRow, PhaseItem, the five bodies)
```

Shared with the transcript's per-turn record (`AnaActivity.tsx`): `useNow`
(`v2/useNow.ts`), `byRound` and `settleRunningCalls` (`anaProgress.ts`),
`statusGlyph` (`AnaWorkSections.tsx`).

Reopening a conversation rehydrates each turn's persisted `toolTrace` and
`humanControls` from `chat_messages.metadata` (`hydrateToolTrace` in
`useAnaChat.ts`), so a reopened thread shows its steps. Durations are not
persisted and none are claimed for a reopened turn.

## Honesty contract

These are tested, not aspirational. Each line names the test that pins it.

- A phase exists only once its event has arrived; a turn that ran no tools
  has no "running steps" phase; a repeat of the same phase does not append.
  `anaProgress.test.ts`, `useAnaChat-progress.test.ts`.
- `Finished in` appears only for a turn with a recorded end whose record did
  not end in a stopped phase. A stop reads `Stopped after`; a timeout or lost
  connection reads `Did not finish`. `anaWorkPanel.test.tsx`.
- Steps still running when a turn is stopped, times out or fails are closed
  as not finished with the reason. `useAnaChat-progress.test.ts`.
- The clock ticks only while the turn is live and freezes on the recorded
  end; a reopened turn shows no duration. `anaWorkPanel.test.tsx`,
  `anaActivity.test.tsx`.
- A failed background-queue read renders as a failure with a retry, never as
  an empty queue: the route throws through to a 500
  (`loadAgentActivity`); only the greeting path's reader is fail-soft.
  `agent-activity-load.test.ts`.
- There is no progress bar and no percentage. The loop runs until AnA decides
  she has enough; a bar would be a number on a fiction.

## Accessibility decisions

- Section titles are `h3` elements wrapping their disclosure buttons; bodies
  stay mounted and are hidden with the `hidden` attribute so `aria-controls`
  always resolves. The same rule now applies to the transcript record.
- `aria-current="step"` marks the phase in flight.
- The inputs disclosure is a keyboard-reachable `role="region"` with a name.
- One polite live region, opt-in (`announce`), which speaks the active phase
  and the settled outcome and never the ticking clock. It says the same
  placeholder the list shows before the first phase event.
- Motion is one 1.6 s opacity pulse on the live dot and 200 ms ease-out
  transitions, all off under `prefers-reduced-motion`.
- Text is `--text-300` or darker at 10–11.5 px; glyphs may use `--text-400`.

## Server changes

- `server/routes/ana-ri/stream.ts`: `tool_result` carries `latencyMs`, the
  same server-measured duration the tool-telemetry row already logged.
- `server/services/ana/agent-activity.ts`: `loadAgentActivity` throws;
  `getAgentActivity` wraps it fail-soft for the greeting prompt block only.
  `GET /api/ana-ri/agent-activity` uses the throwing reader.

## How to verify by eye

The dock renders from fixtures with the real stylesheets. A scratch vitest
file that calls `renderToStaticMarkup` on `AnaWorkPanel` and writes an HTML
page linking `design-system/colors_and_type.css` and
`client/src/concept2cure/v2/styles/app-v2.css` can be screenshotted with
`npx playwright screenshot --browser chromium`. Add `class="dark"` to the
`.c2c-v2` root for the dark theme. This is how the wrapped-label defect in
the first version was caught; jsdom cannot see layout.

## Gates this touches

`ci:check-css-selector-shadowing`, `ci:check-phantom-tokens`,
`ci:token-contrast`, `check:microcopy`, `ci:internals-in-copy`,
`ci:component-class-coverage` (every `ana-work*` and `ct-side*` class has a
rule in `app-v2.css`), `ci:eslint-ratchet` (no new warnings in any touched
file; every new file lints clean).
