# Saved template guidance in the actual section draft route

W1 / D2, local/Codespaces only. Contract:
`docs/design/EDITOR_DRAFT_GUIDANCE_2026-10-26.md`.

## What already exists

`server/routes/__tests__/authoringAssemblyDraftSafety.pglite.test.ts` already
runs the real authoring HTTP router, verified JWT/membership admission, PGlite
with canonical migrations, saved-base candidate generation/acceptance, current
project access and Vault receipt refusal. `_authoring-canvas-fixture.ts` owns
its HTTP identity/project prerequisites; `_authoring-record-fixture.ts` traces
actual SQL executors and transactions. Only the model gateway and the project
retrieval seam are local stand-ins. This increment extends that fixture; no
second host or fake reference resolver was added.

The fixture now applies the canonical document program/provenance migrations
instead of its local program-column ALTER. Existing saved-base, project and
receipt assertions are retained. New cases seed actual saved provenance and
append-only CREATE guidance, capture actual model messages, and inspect parked
candidates and stored turn records. The design and parent evidence README
contain the current/deleted implementation inventory.

## Behavioral epochs

`baseline-inputs.json` pins the untouched fixture and production/reference
owners before test edits. `setup-unrun/` retains a first pre-run snapshot epoch
that did not start Vitest: the executable was not on the inherited PATH. Its
status is **Not run**. The corrected command invokes the existing Vitest module
through Node; no dependencies were added.

`red.log.gz` and `red-receipt.json` retain exit 1: 23 added assertions fail,
and all 10 original controls pass, 33 cases total. Input drift is empty. The
unchanged retained-guide/immutable-prompt case and exact section-over-parent
case directly demonstrate the missing product connection against valid saved
sources. No missing export or schema/setup failure is counted as RED.
`red-case-summary.txt` is a convenience extraction from the unchanged raw log.

The original fixture used conflicting parent/CREATE sources in twelve other
cases (regional derive/conflict, complete-source eligibility limits, GLOBAL and
oversized limits). Their original RED assertions do **not** establish their
intended fully valid-source behavior. `green-initial.log.gz` retains those
12 failures and 21 passes after production changed: the canonical validator
correctly refused their inconsistent provenance. Each such seed now passes its
intended exact full source into both the document and CREATE record. The
explicit assembly-over-parent probe still deliberately uses different parent
and section sources. No production rule or behavioral assertion was weakened.

`lint-initial.log.gz` retains a strict-lint failure with zero errors and one
new max-lines-per-function warning for the added describe callback. Splitting
that enclosing group retains every test and assertion.

`green.log.gz` records all 33 cases passing, exit 0, with empty input drift.
`lint.log.gz` records strict fixture lint passing, zero warnings/errors and
empty input drift. `green-inputs.json` and `lint-inputs.json` freeze the actual
production, new helper, fixture, migrations and configuration used by those
commands. The original RED and initial GREEN snapshots/logs are retained.

`final-inputs.json` records agreement with both settled epochs for root's input
union. Every compressed snapshot is decompressed and checked against its
phase's input hash; all final input bytes agree with GREEN and lint.
`ARTIFACTS-SHA256.json` hashes every other file in this HTTP packet, including
all compressed raw logs and snapshots. Human/live-model checks remain **Not
run**; root owns post-worker combined qualification and publication.

## Boundaries

Refusal probes pass a malformed selected-source request intentionally: the
reference refusal must occur before that next existing source-read boundary.
They also assert no retrieval/model call, new turn/candidate, content update or
saved text. The positive recorded-reference case checks the exact sent prompt
against its immutable turn record and candidate digest, and keeps template
reference text outside parked evidence sources. The section-over-parent case
retains the parent-only exclusion assertions.

These local checks do not qualify a live model, native PostgreSQL scheduling,
RLS, human acceptance, scientific completeness, agency readiness or deployment.
No provider/agency calls, compiler, build, global gate or Git operation is run by
this worker. Root owns combined checks and publication.
