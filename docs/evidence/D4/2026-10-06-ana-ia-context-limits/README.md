# W3 / D4 — Intelligent Awareness of conversation limits

## Outcome and scope

AnA's existing main streaming chat now receives explicit information about
which conversation context was left out. Long prior turns preserve their
beginning and end, with an explicit missing-middle marker. This moves D4
runtime evidence; it does not mark D4 or the commercial launch complete.

Canonical base: `e16398bd` (repository-health refresh after `afe63076`). No new
surface, model, dependency, integration, migration, tool or governed write path.

## Reproduced defects

- A twenty-message history window omitted earlier turns without telling the
  model. Essential facts might have been supplied outside the visible window.
- Browser turns over 50,000 characters were discarded entirely. A correction
  such as "IVD for Japan; no US clearance" at their end disappeared from both
  orchestration and the gateway context.
- Stored long turns had no matching per-turn bound or explicit omission marker.
- An assistant-only window could be empty even when the conversation was not:
  session-start logic treated it as new and repeated session-start enrichment.
- The shared excerpt's one-character boundary appended the full input because
  `slice(-0)` returns the whole string, defeating its budget.

## Changes

`server/services/ana/history-window.ts` remains the canonical history window:

- `recentTurns` retains valid user/assistant content, opens on a user message,
  and returns no turns for a zero/negative/non-finite window rather than
  accidentally taking the whole transcript. Non-conversation or malformed rows
  cannot acquire instruction authority or count as missing conversation.
- `recentTurnWindow` retains metadata and reports total valid turns, omitted
  turns and shortened turns without modifying the stored transcript.
- `excerptTurnContent` keeps the head and tail, names missing middle text, and
  refuses invalid excerpt limits. The zero-tail boundary is fixed.
- `conversationWindowNotice` appears only for actual omissions or shortening.
  It instructs AnA not to infer a fact was never supplied, to use available
  corrections, and to ask only for consequential missing facts. It does not
  require every answer to begin with a clarification.

`server/routes/ana-ri/stream.ts` uses this descriptor for stored and permitted
browser history. The existing twenty-message window remains; each retained
prior turn receives a 50,000-character content budget plus the omission marker.
The bounded transcript still drives both routing and the model. The notice is
passed as a system message and retained in the turn record. Session-start and
bootstrap logic use the count before windowing, avoiding a false new session.

`server/services/ana/submission-chat-handler.ts` re-exports the same canonical
excerpt implementation as `excerptSubmissionTurn`, preserving its existing
call sites and public test seam. Submission prompt budgets remain 800/1,500
characters. The reachable replacement for the removed local function is
`excerptTurnContent` in `server/services/ana/history-window.ts`, exercised by
both `history-window.test.ts` and the actual submission handler IA suite.

## Evidence

- `red-tests.txt`: **4 failing / 12 passing** through the actual HTTP stream
  route before runtime changes: hidden older turns, long browser correction,
  unbounded stored draft, and false session-start behavior.
- `red-boundary-tests.txt`: **1 failing / 16 passing**, exposing the zero-tail
  excerpt bug before it was corrected.
- `green-tests.txt`: **354 passing tests / 36 suites**, including all AnA RI
  route suites, the shared window, submission IA, shared IA policy, real-store
  caller/thread access, and coded error containment.
- `green-boundary-tests.txt`: **17 passing** after a test-only lint correction.
- `repository-gates.json` / `.txt`: **all 26 gates passed**.
- `lint.json`: no errors, no warnings in either test file; production warning
  counts unchanged (stream 23, submission handler 9, history window 0).
  Publication checks verify the changed-file import and lint ratchets.
- `git diff --check` passed. Full local TypeScript is deferred to GitHub under
  the previously authorized workspace-memory exception.

## CI and limits

`published-parent-ci.json` records the exact `afe63076` status inspected during
this session. Browser smoke, validate/audit, security contracts and secret scan
passed. CI, CodeQL and Semgrep were still running; TypeScript steps were pending.
Security Scan failed at the lockfile risk ledger and Trivy filesystem scan.
This change does not repair those dependency/security failures or claim a green
release. Earlier broad CI failures remain unresolved pending accessible logs.

These are platform-control and prompt-contract tests using a controlled gateway.
They are not observations of live model judgment, regulatory accuracy, or
latency. No live provider evaluation was performed. Use the pending acceptance
review to obtain that evidence with authorized test data and an approved model.

An omission notice does not recover missing text. The head/tail excerpt can
still exclude a material fact in the middle. There is no aggregate token-budget
or full-recall claim; the notice is intended to make that limitation explicit.
The current user question is not truncated by this history helper. Other chat
entry points and submission history's message-count limit are outside this fix.
