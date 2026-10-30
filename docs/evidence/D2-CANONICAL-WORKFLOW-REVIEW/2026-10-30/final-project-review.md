# Final independent review: ProjectHome ownership boundary

Reviewer: `action_order_contract`. Date: 2026-10-30. **APPROVED — no blocking implementation issue found.** This is an independent source and retained execution-evidence review of the implemented boundary approved in `scope-review.md`. The reviewer ran no tests, compiler, browser or Git command, and changed no production/test source. Only this review and `final-project-pins.json` were written.

## What already exists

`surfaces/ProjectHome.tsx` is the canonical project workspace, containing its unsent composer, conversation pagination, activity/dossier reads, evidence controls, six-step state and action/handoff handling. `editor/authoringCurrentRead.ts` already owns session revision and adoption stability. `shellProject.ts` already owns selection and remembered step; the action bus and `navParams.ts` already implement pending actions and explicit navigation handoffs. `projectThreads.ts` and `dataConnect.tsx` remain the existing read owners. This change supplies a lifecycle boundary around that one workspace; it introduces no second implementation, store, reader, API, model or authority.

## Implementation assessment

- Public `ProjectHome` captures the selected project, actual auth user and existing `useAuthoringReadSession` once. `ProjectWorkspace` receives these captured values and retains the canonical body. There is no duplicate session hook in the inner implementation.
- The key contains selected project identity, existing session actor and existing session key. Project/account/organization/session changes retire all old component-local draft, pagination and read state at one boundary. Step, title, other display metadata and raw bearer tokens are excluded. The existing string-id versus numeric/transient-id read refusal remains intact.
- The existing pin-retirement ref/effect is in the stable outer owner, rather than the keyed child. Its initial value preserves first-mount handoff pins, an ownership change clears global pins, and an ordinary bearer refresh does not clear them. The reset retains its existing passive-effect timing; this review found no reason to invent a separate pre-effect global clearing mechanism.
- Remembered step initialization, empty-project default, `chooseStage`, action registration, readiness notification and `consumeNavParams` remain together in the canonical inner workspace. The intended precedence remains explicit Tasks/navigation handoff > pending action > remembered step > empty-project default. Step publication preserves the owner key and the exact composer/history.
- Existing session ownership stays outside the keyed subtree, preserving the established stable fenced owner during pending adoption and a single new owner after settlement. This avoids resetting the session-key counter on each workspace mount.
- The scope is local UI and read-lifecycle retirement. Saved content, access/shape validation, intake/assembly ownership, regulated writes and the accepted six-step workflow retain their existing owners and safeguards.

## Deterministic qualification assessment

The new ownership suite exercises the actual ProjectHome, real shell-project channel and real auth session operations. The API transport and auth React subscriptions are fixture-controlled; session guards are not replaced with always-true mocks. Controlled promises isolate old/new read completions. Layout-effect snapshots verify new-owner committed DOM before passive read resets.

All ten executed cases are relevant: prevent sending A's unsent question from B; retire draft/older pages/activity/dossier in B's first commit; start a fresh A visit after A→B→A despite a late older-page reply; reject abandoned first-page/activity/dossier completions; retire same-UUID account and organization state; retire same-account new-sign-in state; keep pending adoption bounded across repeated renders then retire it once; preserve exact composer/loaded history/read count on stage/title changes and ordinary bearer refresh; preserve remembered step while retiring source pins on project change.

Root's retained `project-red.txt` shows **8 failed / 2 passed** against the unchanged ProjectHome. Failures include actual navigation from A's retained text in B, old conversation content in B's first committed snapshot, unchanged textarea identity across ownership changes, and retained same-session state. The two positive controls already passed. The current test SHA-256 exactly matches `project-red-inputs.json`.

Root's retained `project-green-first.txt` shows **33 passed / 4 suites**, including all ten new ownership cases and the existing six-step, step-return precedence and shell-project step suites. In particular, existing return-to-Plan, remembered empty-project step, explicit Tasks handoff, pending-action precedence and bare/invalid-stage workId fallback pass. These are root execution results reviewed here, not reviewer-run results.

No blocking finding remains for this bounded change. Root still owns combined caller/source/team/MDX qualification, lint, build/TypeScript, normal publication gates and canonical remote acceptance. The separate proven Workbench source-cache ownership issue requires its own contract and implementation review; this approval makes no claim that it is already corrected.
