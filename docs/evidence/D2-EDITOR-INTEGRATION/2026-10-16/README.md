# Current AnA access and exact editor handoffs

W1 / D2 continuation, 2026-10-16. Initial synchronized canonical source
`990a687c6`; local Codespaces testing only. The
[contract](../../../design/AUTHORING_CURRENT_ACCESS_AND_HANDOFF_2026-10-16.md)
and updated [human checklist](../../../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md)
describe the same existing editor and UI patterns.

AnA's three authoring-read tools now recheck current actor, organization and
private-project access on each invocation through the existing admission
policy. A revoked member receives no further authoring inventory or text.
Request-scoped SQL takes precedence; no result budget or paging contract changes.
[Real-SQL evidence](ana-read-access/README.md) retains the 18 previous access
failures, valid reads, final executor checks and source hashes.

The specialist handoff now verifies exact document/project/section receipts and
uses the existing editor target. Project visits, account changes and host
unmounts invalidate stale navigation, notices and follow-up effects; a token
refresh for the same account remains valid. Unbound working documents are not
announced as filed into a dossier. Unknown writes are described as unknown,
with the confirmed document ID retained when available.
[Implementation proof](specialist-handoff/README.md) and
[independent caller proof](specialist-handoff/independent/README.md) cover all
six current caller modules.

## Verification

These are separate focused runs, not a claim that the full repository test
suite passed:

| Run | Passed | Scope |
| --- | ---: | --- |
| [Server regression](release/server-regression.txt) | 296 / 296 in 8 files | Current access, raw readers, budgets/paging, registration, admission and complete saved critique. |
| [Specialist regression](specialist-handoff/regression-final.txt) | 117 / 117 in 7 files | Helper receipts, context/project guards, existing controls and correspondence, canonical handoff contract. |
| [Independent caller evaluation](specialist-handoff/independent/green.txt) | 19 / 19 | Actual callers, AuthService and editor target with synthetic transport, including real token-refresh logic. |
| [Related editor integration](release/editor-regression.txt) | 91 / 91 in 8 files | Source import/reuse, template loading, creation context, draft handoff and truthful statistical-document attachment. |

The compiler initially caught one optional-versus-required scope type mismatch
in the new test fixture. Explicit scope fields corrected it without casts,
weaker assertions or a baseline change. The affected 27 tests and strict lint
passed again. The [original compiler failure](release/typecheck-before-fixture-type-fix.txt)
and [final zero-error compiler](release/typecheck.txt) are both retained.

The [production build](release/build.txt) passed, including the existing Vite
chunk-size advisory. All eight [static gates](release/static-gates.json) passed:
single native canvas, canvas path, editor integrity, design system, token cascade,
contrast, phantom tokens and gateway access. Strict feature lint has no errors
or per-file warning growth. No dependency, migration, CSS/token, compiler
baseline or warning baseline was added or widened. Normal direct-publication
hooks remain required.

Release manifests retain exact commands, file selections and raw/stored output
hashes. Text receipts remove redundant final newlines only; the token-cascade
transcript is encoded unchanged inside JSON to retain its alignment spaces.
Feature manifests
pin their production and test sources; historical failed candidates are qualified
explicitly rather than rewritten as successful runs.

## Remaining limits

The two-request specialist writer is still non-idempotent after an unknown or
partial outcome. An explicit retry can create another document; Biostatistics
Open and Attach also retain separate pending guards. Inspect working documents
in the original project before another attempt. A future recovery change must
extend the existing creation mechanism with its own contract and evidence.

This increment does not change individual document/section visibility policy.
Legacy HTTP content reads and complete saved critique retain their existing
distinct admission rules. The fresh project check does not qualify every read
path in the application.

No provider, native PostgreSQL/RLS session, browser layout session or independent
human review was executed here. No deployment, agency acceptance, signing
qualification or green launch row is claimed. The human worksheet remains
unexecuted; its seventeen cases distinguish manual and provider prerequisites.
