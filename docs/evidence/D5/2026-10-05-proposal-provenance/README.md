# D5: an artifact AnA drafted records its model, and only an approved model may draft one

**Row:** D5 (Part 11 evidence), `docs/LAUNCH_DEFINITION_OF_DONE.md`, with
CLAUDE.md Rule 2: "only PQ-passed models serve high-risk regulatory drafting".
**Finding:** item 22 on `docs/work-orders/README.md` (MC-RL-4, high,
2026-10-04, unclaimed).
**Date:** 2026-10-05.

## The defect

A chat turn's ```ana-action block becomes a `create_artifact` proposal with the
model's text as its content. The person's yes posts the command and params to
`POST /api/ana-ri/governed-action`. Those proposals have no held run, so the
route:

- read command and params from the request body;
- stamped `servingModel` and `gatewayRequestId` **null**, so the Part 11 row of
  an AnA-drafted governed artifact could not be traced to the model call that
  wrote it;
- ran **no approved-models check**. `isServedModelApprovedForHighRisk` had one
  caller, the tool executor's gate. A model not approved for regulatory
  drafting, PQ-pending in production included, could put its text into a
  governed record this way.

`POST /api/chat` (`send-message.ts`) did not even pass the serving model to the
action-block settler.

## The change

**At the proposal** (`command-executor.ts`, `proposalFor`):

- A propose-only command whose params carry model-written text (the governed
  write gate's own `FREE_TEXT_FIELD` test) is **refused** when its serving model
  is not qualified for high-risk drafting. The code is
  `MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE`, and nothing is proposed.
- Otherwise the proposal's params carry a **seal**
  (`services/ana-ri/proposal-seal.ts`). It is a JWT signed by this server over:
  - the command;
  - a hash of the params;
  - the organization and the person;
  - the provider, model and gateway request id.

  It is valid for 24 hours.
- A proposal with no serving model is a person's own command and goes out as
  before, unsealed.

**At the confirmation** (`routes/ana-ri/proposal-as-confirmed.ts`, called from
the route before it reads anything):

- A held run's proposer is its row's, unchanged.
- A run-less proposal's seal is opened. It restores the proposer only for this
  organization, person and command, and only over exactly the params proposed.
- The seal is removed before any handler or audit row sees the params.
- Model-written text whose proposer is not qualified is refused with **403**.

**`send-message.ts`** now passes the serving model it already had, so its
proposals are sealed. The streaming path already passed its model.

The client is unchanged. It posts back the proposal's params verbatim, so the
seal travels with them. `useGovernedAction.ts` was inside another session's
window.

## The contract

`server/services/ana-ri/__tests__/proposal-provenance.test.ts`. The red column
is trunk's executor and route with the seal module present:

| # | Case | Trunk | After |
| - | --- | --- | --- |
| 1 | A model not approved for regulatory drafting cannot propose a governed artifact | **fail**: proposed | pass |
| 2 | An approved model's proposal carries a seal naming it and its gateway request | **fail**: no seal | pass |
| 3 | The seal restores nothing for changed content, another person, organization or command | pass (control) | pass |
| 4 | A person's own command is proposed unsealed, as before | pass (control) | pass |
| 5 | Over HTTP: a sealed proposal confirmed unchanged runs with the proposing model, the seal removed | **fail**: `servingModel` null | pass |
| 6 | Over HTTP: a seal minted for an unapproved model is refused at the write | **fail**: 200, ran | pass |

- `red/before.txt`: 4 of 6 fail.
- `green/after.txt`: 6 of 6 pass.

Every suite that loads the executor, the route, `send-message`, the action-block
settler, the seal, the token-class gate or the approved-models registry passes,
1,137 tests. `model-call-linkage`'s source pin now names the new helper, and
the token-class gate lists the seal reader with its reason.

## What stays

- **A person can still edit a proposal's content before confirming,** if the
  client allows it. The edited content no longer matches the seal, so its
  proposer is recorded as null. The text is attributed to the person who
  confirmed it, not to a model.
- **The seal does not assert that the person read the content.** That is the
  confirmation's job, unchanged.
