# Biotech workflow continuation — W3 / D4

Only product branch: `concept2cure-v2`. Starting source:
`3400f1f32f7bed7bfa041e390b67407420a30d2d`.
[Approved bounded contracts](PLAN.md) precede the changes. This increment
repairs the existing intake → scientific assessment → authoring → Vault/release
boundaries. It introduces no new capability, model, statistical engine,
dependency, migration or parallel data store.

## Resulting behavior

| Existing boundary | Corrected outcome | Behavioral evidence |
| --- | --- | --- |
| Saved source into withdrawal | Exact saved references count as dependencies; active reviewed/sealed content blocks withdrawal and a late draft invalidates its preview. | [Saved sources](SAVED-SOURCES-RESULTS.md) |
| Saved source into a new rendition | Refuse noncurrent, withdrawn, malformed, changed or unreadable source records and inconsistent recorded tenancy. Reserve source versions through the signed export audit/history commit or final Vault recording. Retained-data and legacy/manual paths remain usable. | [Source qualification](SAVED-SOURCES-RESULTS.md), [tenant consistency](SOURCE-TENANCY-REVIEW.md) |
| Working draft into Vault | If section content/title/order/membership changes during admission, refuse and compensate the admitted row before writing a filing receipt. Successful receipts hash the actual rendered section snapshot. | [Actual HTTP and filing SQL](AUTHORING-SOURCE-SNAPSHOT-RESULTS.md) |
| Edited workbook into parent withdrawal | Eligible direct derived captures, including cross-project and unverified named parent edges, require review before removal/replacement; keeping extracted data remains possible. | [Derivation](DERIVATION-RESULTS.md) |
| Recorded CMC series into an aggregate claim | Unreadable/excluded selected batches, incompatible conditions, conflicting ordinary criteria and measured unassigned rows cannot disappear behind a valid subset claim. Preserve assessable outputs; withhold the full selection claim with reasons. Unresolved criteria also reach Module 3 support language. | [CMC qualification](CMC-RESULTS.md) |

## Integrated validation

The initial 38-file integrated run passed **936 cases** before the independent
tenant-consistency follow-through. That intermediate result is preserved in
[COMBINED-BEFORE-TENANCY.txt](COMBINED-BEFORE-TENANCY.txt) and its
[38-file manifest](COMBINED-BEFORE-TENANCY-MANIFEST.txt).
The final exact-source run is [COMBINED-GREEN.txt](COMBINED-GREEN.txt), with
every requested file listed in [COMBINED-MANIFEST.txt](COMBINED-MANIFEST.txt).
All **39 files / 939 cases passed**, exit 0, 103.47 seconds.
It covers the new defects and existing source parsing, current-version catalog,
disposition, derived-save, signed export, draft creation/acceptance, real Vault
filing and approval carry, deterministic CMC engines, AnA tools and Module 3
consumers. Test counts are checked against the requested manifest; an exit-zero
runner that executes no files is not accepted as validation.

Client and server production build receipts are
[CLIENT-BUILD.txt](CLIENT-BUILD.txt) and [SERVER-BUILD.txt](SERVER-BUILD.txt).
Source lint and the warning ratchet must pass without suppression/baseline
changes. [Changed-source lint](LINT-COUNTS.json): **27 files / 0 errors / 48
inherited warnings**; [warning ratchet](LINT-WARNING-RATCHET.txt) found no
increase against the published parent. Root owns final branch gates and
publication.

Every defect has its actual RED preserved in the scoped evidence. The export
projection RED is an isolated executor mutation restoring the exact old SELECT;
the renderer/impact, filing snapshot, derivation, CMC and tenant consistency REDs
execute the unfixed boundary. Fixture setup/time-budget failures are separately
identified and never counted as behavioral proof. Existing CMC route-fixture
correction is independently explained in its results, with the original failure
retained and stronger full-selection refusal assertions.

## Release and qualification status

[BASELINE-CI.json](BASELINE-CI.json) records GitHub verdicts for the starting
commit: Lint, full/beta TypeScript, AnA readiness, security and production boot
passed, but broad tests, integration tests and coverage failed. Build/release
evidence were skipped. Failed-job logs were unavailable through the connector;
the cause of those failures is not attributed from job metadata alone.

The local host has an 8-GiB limit; the canonical whole-tree TypeScript gate
requires a 24-GiB heap. Per the user's existing authorization, whole-tree
TypeScript is verified on this publication's exact GitHub source. Local syntax,
build and scoped tests are not presented as semantic TypeScript qualification.
The local pre-push receipt explicitly stops before the TypeScript gate and is
not described as a complete pre-push-hook pass.

The first publication's canonical full TypeScript gate exposed **16 errors**
([exact-source RED](INTEGRATED-TYPECHECK-RED.txt)). The printed diagnostic tail
identified untyped SQL results and incomplete query receipts in new fixtures;
review also found an untyped history metadata row in the new HTTP export test.
Four test fixtures now declare their real SQL result shapes and supply the
catalog query contract's required `rowCount`. Queries, runtime assertions,
production code, compiler settings and the zero-error baseline are unchanged.
The affected 19-case rerun is [TYPED-FIXTURE-REGRESSION.txt](TYPED-FIXTURE-REGRESSION.txt).
Final semantic qualification depends on the corrected exact-source GitHub gate.

This does **not close D4 or D1–D10**. Production image/staging execution,
independent-session locking/RLS/runtime-privilege and contention tests,
scientific dataset/intended-use qualification, provider model PQ, accountable
human review and signed validation remain owed. Source-store SHARE locking
spans source-linked rendering; final section locking is a short post-admission
reservation. Their deployed latency is not qualified here. Existing compensation
can itself fail operationally and logs that risk; these tests prove successful
compensation over the explicit persistence seams.

Next bounded W3 follow-through: carried conversation-only workbook lineage and
legacy/transitive retained-data eligibility; dataset column/unit/population and
method qualification; unresolved unassigned/single-study parameter propagation
through all Module 3 policy; and complete ordinary criterion grammar/scientific
condition identity. The existing regulatory review/release gates remain required.
