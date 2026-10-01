# AnA is no longer told it can approve a QMS change

**Row:** D5 (governed actions are Part 11 ceremonies). **Session:** `…01AiwZKG`.
**Date:** 2026-09-26. **Hand-on from:** the review follow-through lane
(`…01WcyqbqW`, `docs/work-orders/README.md`, after P1-28 / DP-31).

## What was wrong

Since DP-31, only the signed `POST /api/mdx/qms/changes/:id/approve` approves
a change. `transitionChange` refuses `approved` for every caller, AnA's
`qms_change_transition` included. But the tool's definition, the text the model
reads, still:

- listed `approved` in the `to` enum;
- said "Approval enforces segregation of duties — the approver must differ from
  the person who proposed the change", which describes an approval the tool
  used to make.

So AnA would offer a user an approval, call the tool, and get a refusal. The
refusal was the service's message, which names an API path
(`POST /api/mdx/qms/changes/:id/approve`) for AnA to repeat to a person. The
handler's comment still named `SegregationOfDutiesError`, which is no longer
thrown there. The Quality register's own "Advance" prompt already asks AnA to
send the user to the Approve button (`ChangeControl.tsx`). The tool text said
the opposite.

## The change

- `qms-labeling-analytics-tool-defs.ts`: `approved` is out of the `to` enum. The
  description now says:
  - the tool cannot approve, because approval is an electronic signature
    (21 CFR 11.50) that a chat turn cannot collect;
  - the user approves with the Approve button on the change in the Quality
    register;
  - someone other than the person who proposed the change must approve.
- `AnaToolExecutor.ts`: a signature-required refusal comes back as
  `{ error, code: 'CHANGE_APPROVAL_REQUIRES_SIGNATURE' }`. The message says where
  a person approves, with no API path. The stale comment is gone. The refusal is
  answered in its own helper, `qmsChangeTransitionRefusal`, which keeps the
  handler under the complexity limit.
- The refusal itself is unchanged and still comes from `transitionChange`, so it
  holds whatever the model sends.

## Proof

| Stage | File | Result |
|---|---|---|
| Tests added, tool unchanged | `red.txt` | 2 failed / 14 passed: the refusal had no `code`; the enum offered `approved` |
| With this change | `green.txt` | 16/16; the signed approve route, the QMS service suites, the register forms and the tool-registry suites pass (see file) |
| ESLint ratchet, `--since` the claim commit | — | no file changed its warning count |
