# Biostat result freshness contract

Date: 2026-10-07. Workstream: W3. Launch row: D4.

Root control tower approved this bounded contract before production edits.
This qualifies an existing CalculatorPanel → Authoring boundary, not a new
scientific engine, surface, API, store, integration or uploaded-data workflow.

## Acceptance and invalidation

- A result is accepted only from the latest successful compute attempt for
  the unchanged inputs in the currently mounted calculator.
- Every input edit, including an edit followed by a return to the original
  text, revokes the previous result and any pending calculation. Reset, a new
  attempt (before local validation), and calculator unmount do the same.
- An obsolete completion cannot restore a result, announce an obsolete error,
  or clear the current attempt's busy state. No network cancellation is
  promised; the user can calculate the revised inputs while an old request
  finishes.
- The filing callback synchronously rechecks result authority before calling
  the existing Authoring handoff. A save already authorized by an explicit
  Insert click retains its accepted result snapshot if inputs are later
  edited; no retroactive cancellation or database rollback is claimed.
- Current server/domain/network failures remain honest errors. An invalidated
  result is removed with an ordinary-language instruction to compute again.

## Preserved behavior

The canonical `saveToAuthoring` path, project requirement, M5 filing, all result
tables/rows, full provenance hash, and existing human draft/review/export gates
remain unchanged. No model supplies statistical figures. Calculator switching
continues to remount and reset the form.

## Verification plan

First add UI regressions using labeled inputs, real buttons, and controlled
HTTP promises; observe RED on the unmodified production component. Exercise
edits and edit-back, invalid submission, a failed same-input rerun, pending
success/error responses in both orders, reset, and calculator switching.
Verify fresh-result filing still carries the full table and hash, and preserve
the existing project refusal and structured-result positive controls. Then
apply the minimal component fix and run the complete targeted component file
plus scoped lint. Root owns integrated gates and all commits/pushes.

Evidence here is local UI boundary qualification using controlled HTTP
responses, not live provider, regulatory acceptance, or scientific-method
qualification.
