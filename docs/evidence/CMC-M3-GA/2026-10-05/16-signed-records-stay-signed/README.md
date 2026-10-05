# A signed CMC record is not changed under its signature

Row **D2**, with D5 for 21 CFR Part 11 §11.10(e), §11.70 and §11.100. Found
by the GA route-readiness review (2026-10-05):

- `signed-records-editable` (P1);
- `spec-audit-actor-from-body` (P1);
- the batch half of `create-paths-unchecked-project` (P2).

## The defects

The CMC signatures bind the governed-action ledger hash, not a digest of the
record's content. So nothing on a signature shows that the record changed
after it was signed. On a running server (`red-simulation-before.txt`):

- **Specification.** Its acceptance limits could be widened with no reason and
  it stayed `approved`. It could also be approved a second time while already
  approved, stacking signatures. Every edit's audit row named `'system'`, or a
  name the request typed.
- **Qualified register / validated process.** The content of a qualified
  container closure or a validated manufacturing process could be edited, and
  it kept its signed status. A qualified reference standard could be retired
  with no reason.
- **Batch.**
  - A released batch's record could be edited.
  - It could be dispositioned again, overwriting the signed release testing.
  - A new batch could be created already `released`, with no signature at
    all.
  - `released_by` was whatever name the request typed.

The red run scored 141 passed, 9 failed. All nine failures are these defects.

## The rule, and where it lives

`server/services/cmc/signed-record.ts` states the rule once for each kind of
record:

| Record | An ordinary edit after signing | The way forward |
|---|---|---|
| Specification (`approved`) | Allowed **with a governed reason**. It **withdraws the approval**: the record returns to draft, with a `specification_audit_log` row (`approval_withdrawn`) and a chained audit row carrying the reason. A second approval of an approved specification is refused (409). | Approve the revision again |
| Container closure, reference standard, impurity, characterisation study (`qualified`); manufacturing process (`validated`) | **Refused (409 `SIGNED_RECORD`)**. Retirement is the one change admitted. It needs a governed reason (422 otherwise), and the status and a chained audit row (`cmc.register.retire_signed`) are written in one transaction. | Retire it, then record and sign a new one |
| Batch | **Refused** once a signed disposition exists. Release testing and disposition statuses are refused on create and edit; they belong to `/release` alone. `released` and `rejected` are final. | Re-sign a conditional release |

The person is always the session's:

- the specification audit row records the actor id;
- `released_by` is the signer's name, and a `releasedBy` in the body is
  ignored;
- a new batch's program must be this organisation's (`filedProjectOnCreate`).

**Screens.**

- On a signed register row, **Update** is disabled with the reason, and
  **Retire** asks for a reason (one `retireSignedAction` for all five
  registers).
- The specification edit form adds a required "Reason for change" for an
  approved specification. It says that saving withdraws the approval, and the
  toast says so when it happens.

The branches made unreachable by the rule are removed:

- the characterisation study's "clearing the result under the signature" check;
- the process's "clearing status or steps under the signature" checks.

The rule refuses those edits wholesale.

## Red, then green

- **Staff simulation, real server.** New step 26 runs last, because it retires
  and re-signs records that the Module 3 steps read.
  - Before (`red-simulation-before.txt`): 9 failures, listed above.
  - After (`green-simulation-after.txt`): **151 passed, 0 failed**.
  - Step 8d's check that "an edit cannot repoint a record at another program"
    now runs on the reference standard *before* qualification. On a qualified
    record every content edit is refused, which would prove nothing about the
    program.
- **Client** (`cmcSignedRecords.test.tsx`).
  - Against the previous register (`red-client-before.txt`), 2 of 6 fail: a
    qualified system offered Update, and offered no Retire.
  - After, all 6 pass.
- **Server rules** (`signed-record.test.ts`): 8 tests (`green-unit-after.txt`).
- **Wider runs.** Every CMC route suite, every CMC service suite and every CMC
  client suite pass: 66 files, 781 tests.
