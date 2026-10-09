# Independent implementation review

Date: 2026-10-09 UTC. Reviewer: workflow_implementation focused session.
Decision: **APPROVE** the bounded batch drafting submission-context correction.
No blocking finding in the reviewed source, tests, or coverage-plan wording.

## Reviewed byte identities

| File | Git blob |
|---|---|
| server/services/ana/AnaToolExecutor.ts | 5b41513e3f89a265ddbc237fcf30437924efa67e |
| server/services/ana/draft-submission-context.ts | 02e023398861f820267fc2fdcc1f080ea1248465 |
| server/services/ana/__tests__/batch-draft-submission-context.pglite.test.ts | 09a6b8dc023e0d71c3a5688e3fdc8cee6974f2a6 |

The reviewer read these files and verified all three blobs with `git hash-object`
after the implementer reported the original executor restored in `finally`.
The executor diff adds only the helper import and awaited application call inside
the existing batch `try` block, before source loading and generation.

## Boundary and behavior

- The registered `batch_draft_sections` path remains the only changed caller.
  No tool, API, model, registry, schema, UI, package, or write path is added.
- Explicit nonblank submission types are preserved verbatim and bypass pool
  acquisition and project reads. Missing and blank input types can use the open
  project's recorded filing identity.
- No-project and invalid-organization contexts do not acquire a pool for this
  inference. The helper delegates UUID/legacy-anchor ownership to the existing
  `resolveOpenProgram`; the subsequent program-fact query also binds organization
  and excludes deleted programs.
- Mapping delegates to `registryContextForProgram`. A valid recorded selection
  takes precedence over the legacy type/agency pair. Without a selection, only
  that existing helper's exact recorded pairs apply; unsupported or missing
  agency does not become an inferred US IND. Invalid recorded selections and
  malformed metadata remain unresolved instead of falling through to a default.
- Database verification failures propagate to the existing batch failure catch
  before model calls. Driver details are not added to the public receipt.
- An unresolved identity adds an explicit unassessed requirements note. The
  existing path still permits an unsaved planning draft in this case. It does
  not reject every unknown filing context or establish submission readiness.
- Request indices, the 20-section limit, concurrency, source loading and failure
  slots, generated content receipts, `saved:false`, `savedCount:0`, retry indices,
  and promotion through `draft_authoring_document` retain their existing code.
  The inference reads once per batch invocation; it introduces no global cache.

## Test review

The focused file exercises the registered handler and actual drafting resolver
and service. Program/anchor/fact queries execute in real PGlite against the
reader-facing columns; returned SELECT rows are not replaced with canned rows.
The gateway is a test double, so this proves prompt wiring and receipt behavior,
not scientific output quality or model qualification.

Meaningful cases include exact deep IND requirements reaching the gateway;
omitted and blank input; JSON-object/string metadata; legacy project anchors;
chosen EU MAA precedence; explicit inputs without reads; malformed choices and
metadata; unsupported agencies; foreign/deleted programs and poisoned anchors;
missing context without pool acquisition; real missing-table/column failures
with zero gateway calls; the batch limit; original failure slots; and independent
source/model failures preserving successful drafts. The gateway mock retains the
real module's error classes, so the per-item failure case reaches the real
service classifier.

This reviewer did not run tests or gates, respecting the focused implementer's
ownership. The implementer reported final focused 32/32, forced lint with zero
errors, 99 existing executor warnings, and zero helper/test warnings. Release
qualification, build, full gate, and publication remain the control tower's work.

## Coverage evidence and remaining limits

The reproducible [inventory](audit/coverage-inventory.json) and
[counting script](audit/count-ind-coverage.mjs) distinguish deep scaffold nodes,
terminal codes, detailed guidance, structural headings, and actual execution
evidence. The coverage plan's counts match that inventory at baseline
6071cce1821115faff223dd84fa7ceacf7d01656. It does not claim full IND or scientific
qualification from catalogue sizes. Its 304 references are reference entries
across profiles and may repeat.

The correction restores selection of existing filing-specific requirements; it
does not close the remaining hierarchy, applicability, therapeutic/modality,
source qualification, or regulatory currency gaps. In particular:

- Regional Module 1 conditional rules and the older deep IND flags are separate
  projections. `requiredFor` is necessity, not a full applicability decision.
- The M2 home omits the 2.6.5/2.6.7 tabulated branches; the transcription template
  models only 2.5/2.7 with six/four headers, rather than the full hierarchy.
- Some deeper M3 subdivisions and nonclinical numbered tables lack exact content
  records. An inherited parent brief is not exact subsection guidance.
- The 25 therapeutic profiles and 11 modality models are distinct vocabularies.
  The existing batch path does not automatically inject those complete overlays
  or establish disease-by-modality-by-section execution coverage.
- The still-mounted 19-code legacy generation route is a separate limitation;
  retired `ind_*` AnA tools no longer use it. Widening it was not part of this
  correction.

No production source was changed by this reviewer.
