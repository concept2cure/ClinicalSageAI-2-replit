# Existing editor: AnA remedy lifecycle

W1 / D2 continuation on `concept2cure-v2`. Implementation began at `bd873886`.
The final source is synchronized with `11fb58f1`, retaining incoming current
source-access controls and the synchronous session-switch reservation.
Contract: [Existing editor remedy lifecycle](../../../../design/EDITOR_REMEDY_LIFECYCLE_2026-10-14.md).
The all-module IND template work remains recorded in [the prior template evidence](../ind-templates/README.md).

## Resulting behavior

An explicit anchored replacement now receives one application UUID on its real
insertion/deletion marks. The existing guarded editor bridge returns that
application's document, section and mounted-editor receipt. The remedy card
observes pending marks, accepted decisions, full rejection and readiness in the
canonical editor. It can offer another explicit attempt after full rejection or
explicit device-draft discard. Partial resolution, acceptance and restored
pending marks keep it disabled. A restored modified draft without marks remains
unavailable; the card does not invent an absence from a different editor mount.

First application and retries wait for hydration, live sync, cache disposition
and save completion. The actual editor handle enforces availability and refuses
retained handles synchronously after unmount. The card registers its observer
before refreshing the snapshot, closing a real missed-readiness notification.
Unreadable best-effort device storage does not strand known live applications.

Every attempt still passes the existing turn/model qualification, current
document/section, editability, saved hash/timestamp, passage/context and overlap
checks. Distinct attempts preserve separate decision IDs even within the same
minute. Existing source-turn attribution and governed review/save paths remain.
Applying and reviewing these suggestions does not save or approve the document.

The UI uses the existing remedy card, review strip, status note, Section/Document
navigation and device-draft controls. There is one editor, no new CSS, route,
tool, dependency, migration or document/suggestion store. Accepted application
IDs are ephemeral state in the current mounted editor; mark presence remains
the source of pending state.

## Behavioral evidence

[Independent low-level checks](LOW_LEVEL_TESTS.md) preserve actual before failures
and the final green run of 72 tests across three files. They cover serialized
identity, adjacent same-turn attempts, same-minute decision IDs, partial/full
decisions, deletion-only proposals, unreadable storage, hydration/cache/liveness
refusals and unsubscribe behavior. Two post-sync cases additionally prove
immediate held-session refusal through a retained handle, recovery on release,
and reservation refusal immediately after a real proposal dirties the editor.

[Workbench before](workbench-before.txt) captures the prior permanent-disabled
card after full rejection. [Readiness before](readiness-before.txt) captures a
true hydrated bridge whose remedy button missed its notification and stayed
disabled. The final parent integration run passes **73 tests in five files**,
including the real conversation-to-editor fix, reject/reapply, partial/full
acceptance, scoped receipt, model/base guards and actual leave/Restore/Discard
flows. Cache assertions confirm the same application survives leaving and
returning; Restore retains it and explicit Discard creates a distinct attempt.

Synchronization exposed a stale SQL matcher in the existing Vault-planning
unit fixture: it rejected the canonical program/organization anchor read before
the Vault was queried. [Before results](vault-fixture-before.txt) retain its six
failures. The fixture now verifies the bound scope and tolerates SQL whitespace;
two added negative controls prove foreign-organization and private-project
access denials without any Vault read. [Green results](vault-fixture-green.txt)
record 23 passing cases. No production access code was changed by this repair.

The final [combined regression](regression-release-green.txt) passes **919 tests
in 69 files**, including all IND template starts, loading/guidance, catalogue,
Data Room/Vault/project imports, citations, saved review and single-editor
handoffs. The earlier 905-case green snapshot is retained separately; the
overlapping runs must not be added together.

[Browser evidence](BROWSER_EVAL.md) records four desktop/touch light/dark
contexts, 24 scenario pages, 44 captured stages and two additional touch passage
captures. Native viewport gates remain intact, with one editor, no horizontal
page overflow, errors, unknown endpoints or recorded axe violations. Incomplete
axe rules remain recorded for further manual qualification. Decision requests
are captured; no scenario saves, approves or files a document automatically.

[Release checks](release-checks.txt) record the successful client/server build,
zero-error compiler gate, flat per-file warning counts, editor integrity,
single-canvas, design-system, token, text-ramp, reference-data and SQL checks.
Browser APIs and qualified-turn fields are explicit synthetic fixtures. They
verify native UI behavior and actual emitted decision bodies, not live model
approval, backend authorization, database audit persistence or deployment.
PGlite/HTTP template checks independently exercise the existing backend paths;
they do not establish production RLS or PostgreSQL concurrency.

## Reproduction

`regression-test-files.json` records the exact broader test selection. With the
existing Node 22 toolchain, run Vitest with those file paths and a 4096 MB heap.
The directly runnable [browser fixture](browser-eval-fixture/reproduce.txt)
records its API contract, production source digests and desktop/touch matrix.
Use the ordinary compiler, build and pre-commit/pre-push gates. No baselines or
hooks were changed or bypassed.

Saved-template oversight context and broader authoring-read access remain
outside this bounded lifecycle patch. Incoming platform safeguards are retained;
this evidence claims the remedy improvement and its stated regression scope.
