# Protocol recovery and SQL guard remedies

The create-design and file-in-program recovery drawers now use the canonical
`apiCall` / `apiErrorText` contract. Confirmed server refusals retain their
status and readable server copy. Enum error tokens and PostgreSQL driver text
do not become product copy. An API refusal is distinguished from an unknown
transport save, and persisted-but-unbound design recovery retries only the
binding rather than creating a second design.

The protocol index now binds fixed optional program/document predicates and
the row limit. Protocol creation uses two literal inserts, one for a recorded
program and one for a genuinely unfiled legacy document. Locked document reads
use a literal `FOR UPDATE` query and ordinary reads use a literal unlocked
query. Values remain bind parameters, existing tenant/deletion predicates
remain present, legacy schemas without the optional program column remain
usable by their unfiled creator, and the finalization row lock remains intact.

The former interpolations were bounded query fragments and generated
placeholders; this review did not establish an exploitable protocol SQL
injection. The change removes that construction and makes its safety directly
visible to the guard. Both protocol files now contain zero SQL interpolations.
The control tower removes only the obsolete one-interpolation service baseline
entry; this remedy does not increase any baseline or assemble hidden SQL text
to bypass the scanner.

Verification executes 92 tests across five suites:

- Actual Protocol workspace recovery: confirmed refusal as a returned response
  and as an `ApiRequestError`, readable server message precedence, filtered
  driver/enum detail, retained binding retry without duplicate persistence,
  filing refusal with the drawer retained, and existing success/unknown-save
  flows.
- Actual PGlite protocol assembly: all older documents remain indexed, selected
  documents outside the newest 25 remain reachable, program/tenant isolation,
  explicit unfiled selection and complete projections.
- Actual PGlite program association: scoped creation, legacy filing,
  study-design association, current authority and same-organization guards.
- Actual PGlite write scoping and signing: tenant boundary, authorship/content
  binding, edit/finalization state and signer checks through existing suites.

Four new UI cases failed before the remediation. One initial driver fixture
used an unquoted illustrative error; before final qualification it was corrected
to PostgreSQL's actual quoted `relation "protocol_documents" does not exist`
format, which the canonical internals filter recognizes. Final verification is
92 passing tests. The error-envelope guard reports zero hand-rolled reads, and
scoped lint reports zero errors with one existing test-group size warning.

Evidence in this directory: `protocol-error-envelope-before.txt`,
`protocol-final-guards-qualified.txt`, `protocol-final-guards-lint.txt` and
`protocol-final-guards-error.txt`. Whole-repository SQL guard evidence and its
shared baseline reconciliation belong to the control-tower integration run.
No schema or production dependency was added.
