# S2: the Home pill shows the engine the turn runs on, and only a governed model can be pinned

**Row:** 74 in `docs/work-orders/README.md` (founder-directed 2026-09-27; it
moves no D-row and is recorded as the founder's exception to RULE 2).
**Slice:** S2 of the run-policy design ("honest controls"). It adds no
capability, no surface and no model. **Session:** `…019ZvHmh`. **Recorded:**
2026-09-28, against HEAD `1a4b1893f` plus the S2 working tree (uncommitted when
filed; `tree.sha256` gives every file's hash).

## Status

The S2 gates are red against HEAD and green with S2. Each behaviour's gate was
also seen to fail under mutation. Three things are **not** shown here:

- **No live capture.** The design gives S2 no capture of its own; the lane's live
  capture is S7's two-agent stream. Nobody watched the Home pill reach
  `effort_level` on a running app, because this container has no database and no
  model key. That path is proven by render tests and source carriage, not by a
  request capture.
- **The warning is not visible where Home's turns appear.** The frame reaches the
  client hook, but the conversation screen does not render message warnings
  (handed on below).
- **Rule 2's PQ clause is still unenforced.** See "Handed on".

## What was wrong

**1. A control that lied.** Home kept its engine pill in local state
(`useState('standard')`) and never sent it. Home's question is seeded into
`conversation-thread`. V2App mounts that screen on the shell chat, whose effort
is `effortForMode(prefs.anaMode)`. So a person who picked Deep research on Home
was answered at whatever `prefs.anaMode` said, under a pill that said Deep
research.

**2. A model selectable without governance.** CLAUDE.md Rule 2 says: *"a model
is selectable only as an approved-models entry with a pinned version, rationale
and eval reference"*. `resolveModelOverride` pinned any enabled registry model,
and the picker endpoint (`GET /api/claude/models`) listed every enabled model.
The gateway refuses an unapproved explicit model on high-risk requests only, so
on every other turn any authenticated caller could pin a model with no
governance entry. When a pin was refused, the route dropped it silently.

## The change

**Server**

- `effort.ts`:
  - `governingEntry(m)` finds the entry the way the served-model gate does
    (`approvedEntryFor`: provider plus wire model). It then requires the
    entry to be this row: the entry's own id, and its pinned version on the
    wire. `approvedEntryFor` alone also matches a wire model equal to an alias
    id, which pins no version. It also keys on the wire model, where the
    gateway's high-risk check keys on the registry id.
  - `resolveModelOverride(value, enabledModels, { highRisk })` pins a model
    only when it is enabled, is its approved entry, and, on high-risk work, has
    `approvedForHighRisk`. `highRisk` is a required boolean. At runtime a
    missing answer is treated as high-risk.
  - `projectModelsForPicker` lists only approved entries. Each option carries
    `approvedForHighRisk` and `pqStatus`, read from the entry's `pq.status`.
    Every entry is `'pending'` today, and nothing defaults to `'passed'`.
- `stream.ts`:
  - It passes `highRisk: isHighRiskRequest(routingPlan.taskType,
    routingPlan.riskTier)`: the gateway's own question, asked of the inputs
    each `gw.route` that carries the pin sends. `routingPlan` was already built
    before the resolve, so nothing moved.
  - When a named model (a non-blank string) resolves to null, the route writes
    `{type:'warning', code:'MODEL_OVERRIDE_REFUSED', message:'The model you
    chose is not available or approved for this work, so AnA is answering with
    the default model.'}`. The frame goes out before the first `gw.route`, and
    the route then falls back exactly as before.
  - The comments no longer claim a silent drop, a governed default, or an
    empty candidate set in deterministic mode. They name the two substitutions
    that are still silent.
- `reasoning.ts`: comment only. The cost-tier match checks that a model is
  enabled, not that it is approved. The comment used to call it "same as the
  user model-override path".

**Client**

- `Surfaces.tsx`: Home takes `mode`/`setMode`, typed as a pair or neither. The
  pill is bound only when both are passed; otherwise Home uses local state.
- `V2App.tsx`: one line. Home is rendered with `mode={prefs.anaMode}` and
  `setMode={(m) => set('anaMode', m)}`, the pair AnaRail already gets.
- `useAnaChat.types.ts`: comment only. `modelOverride` no longer says the server
  "drops it silently".

**Behaviour on today's registry.** Every one of the 16 `DEFAULT_MODELS` is its
own approved entry. The picker therefore loses none of them, and
`effort.test.ts` pins this. One thing does change: a high-risk turn with a pin
that is not approved for high risk. It used to fail with
`ModelNotApprovedError('explicit')`. Now the pin is refused up front, the warning
is written, and the default serves the turn. No v2 host sends `model_override`
today, so only direct API callers can reach this.

**Home's send path, read end to end.** Home has one path to a turn:

1. `Surfaces.tsx` sets `window.C2C_CONVO = {id:'new', seed, seedFiles}` and
   calls `onNav('conversation-thread')`. `onAsk` is never called.
2. `surfaceViews.ts` registers `conversation-thread` as `ownsConversation: true`.
3. In that branch V2App passes `shellChat={anaChat}`.
4. `ConversationThread` sends the seed on `shellChat ?? ownChat`.
5. `anaChat` is `useAnaChat({… effortLevel: effortForMode(prefs.anaMode)})`.

`homeEngine.test.tsx` now pins every link (review objection 4). Nothing on Home
sends without `effortForMode(prefs.anaMode)`.

## Proof

| Stage | File | Result |
|---|---|---|
| Every S2 test file **as it is in the tree**, against HEAD's source for all six S2 source files. No stubs: every imported name exists at HEAD | `red.txt`, part A | 22 failed / 38 passed (60), 3 files. Every failure is an assertion on the missing behaviour; none is an import error |
| The review-fix tests against the S2 build **before** the review fixes | `red.txt`, part B | 7 failed / 53 passed. Each failure is the objection it pins |
| With S2 | `green.txt` | Client: 59 files, 1139/1139. Server: 40 files, 584/584. These include the three S2 files: `homeEngine` 9, `effort` 44, `stream-model-override` 7 |
| Mutations of the finished tree | `mutations.txt` | 34/34 red. 26 on S2 behaviour and the review fixes, 6 overcorrections (a gate that refuses too much), both in vitest. 2 type-level, caught by `tsc` |
| `npx tsc --noEmit` (full project, final tree) | — | exit 0, 0 errors |
| `npm run ci:pushed-lint-warnings` (`--since 1a4b1893f`) | — | exit 0. 7 lintable files changed; no file changed its warning count |
| `npx eslint --format json` on the two new test files | — | exit 0. Both files were linted (not ignored): 0 errors, 0 warnings |
| `ci:unapproved-model-pins`, `ci:ai-tenant-binding` | — | exit 0 each. 54 known pins and no new ones; every gateway call binds its tenant |

The source hashes for part B (the pre-review S2 build) are:
`effort.ts` `4de7291e…`, `stream.ts` `a1b5c3fe…`, `Surfaces.tsx` `a49cc26c…`,
`V2App.tsx` `068fb8d7…` (unchanged since).

## Review follow-through

| # | Objection | Disposition |
|---|---|---|
| 1 | The warning says "AnA used" the default before any model is called | Fixed: present tense, "is answering with". Pinned by the frame test (mutation B10) |
| 2 | "Governed default" overstates it: the tier and strategy defaults are not checked against approved-models on normal-risk work | Fixed: "the default model". Gating `resolveTierModel` is handed on |
| 3 | Two comments outside the diff still described the old behaviour | Fixed, comment-only: `useAnaChat.types.ts` and `reasoning.ts` |
| 4 | The Home gate left out the link that makes the pill true (`shellChat={anaChat}`) | Fixed: carriage for `shellChat={anaChat}` in the conversation-owning branch, the registry's `ownsConversation: true`, `const anaChat = useAnaChat({… effortForMode(prefs.anaMode)})`, and a render test that Home's send goes to `conversation-thread`, not `onAsk`. Mutations B12–B15 |
| 5 | `false`, `0` and whitespace set off the "model you chose" warning | Fixed: the guard is `typeof model_override === 'string' && model_override.trim() !== ''`. Cases added (B9a, B9b) |
| 6, 15 | A pin that the tenant's placement excludes is still replaced silently by the gateway | The comment now says so. Handed on (it needs a gateway-side comparison, outside S2) |
| 7 | The pill's "model" word can misstate the tier that serves | Handed on. S2 fixed a pill that was never sent; the tier wording is a separate change |
| 8 | Deterministic mode: the comment claimed an empty candidate set, and the warning can still fire | The comment is corrected. The behaviour is dev-only and handed on |
| 9, 10 | `approvedEntryFor` also accepts a wire model equal to the alias id, so the claim "alias moved off its pin fails" was untrue | Fixed in code, not just the comment. The entry's pinned version must be the row's wire model (`governingEntry`). Test: wire === alias id is refused (B4d) |
| 11, 16 | The route keyed approval on the wire model, the gateway on the registry id, so the route could pin a model the gateway then refuses | Fixed: the entry's id must be the row's id, so for the row it matches the route agrees with the gateway's id-keyed check. The stream comment is narrowed to that. Test: the pinned version under a foreign id is refused (B4c). The build report's claim that the two keys differ "only where this gate is stricter" was wrong |
| 12 | `highRisk` defaulted to "not high-risk" when omitted | Fixed: a required boolean, and at runtime a missing value is treated as high-risk. Pinned by `@ts-expect-error` under `tsc` (T1) and at runtime (B5b) |
| 13 | Rule 2's PQ clause is enforced nowhere, and the `PickerModel` doc read as fuller governance than exists | The doc now says `approvedForHighRisk` is not a PQ result. Enforcing PQ is handed on |
| 14 | Other paths still select unapproved models (the tier path, and the gateway's explicit path on normal-risk work) | The `reasoning.ts` comment is corrected. The code is handed on (gateway and tier gates, outside S2) |
| 17 | A half-bound Home (mode without setMode) made a dead control | Fixed: the props are typed as a pair, and the pill is bound only when both are present. Tests under `tsc` (T2) and at runtime (B11) |
| 18 | Pill accessibility: `aria-haspopup` without a menu, selection shown only by `data-on`, focus lost after a choice | Declined for S2: this predates S2 and the same pattern is in `Shell.tsx`'s picker. Fixing one alone would split the pattern. Handed on to an a11y lane |
| 19 | The lint and `tsc` claims had no recorded evidence | Re-recorded: `tsc` exit 0 and the eslint JSON exit 0 (see Proof) |
| 20 | The guard test never covered `res.writableEnded` | Fixed: case added, and B9d proves it |
| 21 | A high-risk non-HR pin now runs on the default with a warning nobody sees | Already a hand-off (below) |

## Handed on (row 74, later slices, or the owning lane)

- **Warnings on the conversation screen.** `ConversationThread` renders no
  `m.warnings`. The rail that does render them (`Shell.tsx`) is not mounted while
  a conversation-owning surface is active. `MODEL_OVERRIDE_REFUSED` is therefore
  invisible where Home's turns appear, and so are the existing timeout and
  save-failure warnings. Build this before any client sends `model_override`.
- **Silent substitutions that remain:**
  - The gateway drops a pin that placement (residency, ZDR, vendor allow-list)
    excludes. The fix idea is to compare `gwResponse.provider/model` with
    `resolvedOverride` after the first `gw.route` and warn on a mismatch.
  - Deterministic mode serves canned content whatever was pinned.
- **The default is not approval-gated on normal-risk work.** `resolveTierModel`
  (including `ANA_TIER_*_MODEL` remaps) and the gateway's strategy and explicit
  paths serve an enabled model with no approved entry. Gate `resolveTierModel`
  on the same `governingEntry` so the default is governed by construction.
- **PQ.** High-risk pins require `approvedForHighRisk` only. Every entry is PQ
  `pending`, so "only PQ-passed models serve high-risk regulatory drafting"
  holds nowhere, pins included. This is a governance decision against the launch
  rows.
- **Gateway match.** The gateway's explicit path matches
  `m.model === request.model || m.id === request.model`. A different registry
  row whose id equals the pinned wire string could be the one served. This is
  not reachable with today's registry.
- **The refusal is not in the turn record.** The ledger records what served, not
  that a pin was refused. Whether it belongs in the D5 record is for the
  turn-record owner.
- **Pill wording and accessibility.** `ANA_MODES`' "model" words
  (Instant/Maximum) can misstate the tier: high-risk work goes to flagship, and
  a policy hint drops the tier. The pill's menu semantics and focus return
  (objection 18) apply to `Surfaces.tsx` and `Shell.tsx` together.
- **The picker consumer.** No client reads `PickerModel`. Any future picker must
  show `pqStatus` as served and never claim PQ.

## Lane disclosure

The S2 files are:

- source: `effort.ts`, `stream.ts`, `reasoning.ts` (comment), `Surfaces.tsx`,
  `V2App.tsx`, `useAnaChat.types.ts` (comment);
- tests: `effort.test.ts`, and the new `homeEngine.test.tsx` and
  `stream-model-override.test.ts`.

Three were inside another lane's 24h window at edit time. The spans below were
checked with `git log -5` and `git blame` at each edit point:

- **`stream.ts`**: `0ed213fec` (D2), whose lines are now 125, 992–994 and
  1024–1027. S2 edits the header's event list (line 8), adds one import after
  the `effort.js` import, and rewrites the override block (now lines
  1337–1382). That block was blamed to `^20accce74` and `c104aca83` before S2.
  The history-window hunk is untouched.
- **`V2App.tsx`**: `0ed213fec` and `a75e38452`. S2 changes one line, the Home
  render, which blames to `^d9670f901` (2026-09-05). Neither lane's hunks touch
  it.
- **`useAnaChat.types.ts`**: `a75e38452` (`…01KZK3jg`, Live Drive), whose lines
  are now 646–702. S2 rewrites two lines of the `modelOverride` doc comment as
  four (now lines 592–595; the originals blamed to `^20accce74`, 2026-08-31). It
  is comment-only but **not purely additive**, and it is recorded here for that
  reason.

`run-control.ts`, `live-drive-turn.test.ts`, `approved-models.ts`, the registry,
the gateway and every migration are untouched.

## Re-run by the lane before commit (2026-09-28, quiet machine)

The tree is the one hashed in `tree.sha256`.

- `npx tsc --noEmit`: exit 0.
- The three S2 files plus `homeNoFixtureProgram`, `surfaceRender`,
  `useAnaChat-effort` and the approved-models/high-risk suites: 8 files,
  359/359 passed.
- `npm run ci:pushed-lint-warnings`: no file changed its warning count.
- Two sabotages chosen independently of `mutations.txt`, each restored and its
  sha256 re-checked:
  - `resolveModelOverride` treating a model with no approved entry as approved
    for high-risk turned 5 `effort.test.ts` tests red;
  - V2App rendering Home without `mode={prefs.anaMode}` turned the
    `homeEngine` carriage test red.
