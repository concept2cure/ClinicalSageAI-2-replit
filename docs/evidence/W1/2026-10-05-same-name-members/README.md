# W1 / D2 — two members with one name can be told apart in every member picker (2026-10-05)

**Row:** D2 (launch surfaces tell the truth). Found by this lane's 2026-09-28
launch sweep: the Task form's "Assign to" showed two identical "JM Smith" chips.
On 2026-09-29 the same defect was seen in the protocol review drawer
(`docs/evidence/W1/2026-09-29-trunk-ci-item9/`).
**Claim:** `081317f42` (the server half). The client half waited for the
24-hour windows on `CollabLauncher.tsx` and `ProtocolDevForms.tsx` to close.

## What was wrong

The demo organisation has two accounts named "JM Smith", and every picker
that chooses between members showed names alone:

| Picker | Source | Showed |
|---|---|---|
| Task form "Assign to", and message "To" (`CollabLauncher.tsx`) | `GET /api/task-management/assignees` | "JM Smith", "JM Smith" |
| Task board create form (`TaskBoard.tsx`) | same | the same, as select options |
| RBM owner (`rbmWrites.tsx`) | same | the same |
| Assign review (`editor/AssignReviewDialog.tsx`) | same | the same |
| Protocol review: reviewer account (`ProtocolDevForms.tsx`) | the reviewer candidate list | "JM Smith · admin", "JM Smith · admin" |

The endpoint returned `{ id, name }` and dropped the address it had already
read. Whichever "JM Smith" a person picked, the record named an account, and
the person choosing could not know which one. In a GxP system an assignment,
or a reviewer, must be attributable to the person who was meant.

## What changed

There is one rule, `shared/utils/member-labels.ts` `memberLabels()`:

- a name no other member in the list holds is shown as it is;
- a name two or more members hold is shown with the address beside it;
- names are compared trimmed and case-insensitively;
- a member with no name is shown by the address.

The server applies the rule once:
`GET /api/task-management/assignees` gains `label`. `name` is unchanged,
because the task board's cards display it. The four roster pickers show
`label` (falling back to `name`).

The reviewer select reads a different list, which already carries the address.
It applies the same function, so its options read
"JM Smith · jm.smith@… · admin". The derived, read-only reviewer **name**
field still shows the account's own name, because that is what the server
stores and checks (SEC-C-7).

Avatar initials are unchanged: the first letters of the first two words are
still "JS".

## Shown failing first

- [`red-before-server.txt`](red-before-server.txt): with the endpoint
  unchanged, `taskBoard-assignees-labels.test.ts` fails with *"expected
  undefined to be 'JM Smith · jm.smith@acme.test'"*. `name` is unchanged, so
  its own test passes either way.
- [`red-before-client.txt`](red-before-client.txt): with `ProtocolDevForms.tsx`
  unchanged, `sameNameMemberPickers.test.tsx` fails. The options do not
  include a distinguishable "JM Smith".
- With the fix, all 18 files touching these surfaces pass (100 tests),
  including the existing reviewer, task-board, RBM, collaboration and
  assign-review suites.
- **Mutant:** with the rule never adding the address, all three new test files
  fail (4 tests).

## Not shown live

This change was **not** exercised in the running app. The populated demo
database the earlier sweeps used is not in this session's container, and
rebuilding it to watch a label render was not worth doing here. The
verification is the route test through the real router, the form-config test,
and the mutant. The next launch sweep should look at the Task form's
"Assign to".

## Gates

- `tsc`: 0 errors.
- ESLint ratchet `--since HEAD`: no file changed its warning count.
- `ci:unreferenced-modules`, `ci:empty-state-honesty`, `ci:launch-scope` and
  `ci:design-system` pass.
