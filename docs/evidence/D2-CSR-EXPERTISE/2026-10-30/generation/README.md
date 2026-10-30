# CSR job source revalidation

## What already exists

`csr-job-runner.ts` owns the sole persistent drafting worker and output upsert; `cortex-authoring-reader.ts` / `saved-clinical-tables.ts` verify current source access, disposition and retained-run receipts. `project-scope.ts` resolves program-to-numeric-project identity and current actor permission. The original worker loaded source packs before drafting, then checked only job status before saving, and skipped every source read on a fully populated resume. The source worker now extends those existing readers/checks through `csr-job-evidence.ts`; no job, evidence store or writer is duplicated.

## Changes

- Pair a retained source's program with the persisted target project, and verify its exact run/study/section and protocol.
- Admit the retained run even for metadata-only selections. Recheck current project write access and exact source-pack digest after a model call, before an upsert, and before completion.
- Recheck the current job state after asynchronous source validation, preserving cancellation.
- Reuse saved results only when their existing provenance names the exact current readable evidence digest/source SHA/run/study/section. Missing/changed lineage or withdrawn sources fail without redrafting or overwriting retained work.
- Preserve typed canonical evidence-parser refusals at the existing POST /api/csr/jobs boundary. Root's scope owner validates source/project pairing before quota.

## Evidence boundary

Root captured the initial 11 runner cases together with 20 current-scope cases in generation-scope-red.json: 27 failures / 4 controls, no source drift. Five additional runner boundary cases were added after that RED (late-source cancellation, malformed retained binding, unbound late-permission refusal, clean legacy results over empty evidence and a supported-metadata/empty-tables control). Independent review then found an unguarded pre-claim refusal; the seventeenth case was separately captured failing in preclaim-cancellation-red.json (one failure, sixteen intentionally skipped). Four more cancellation controls cover identity refusal, invalid selection after claim, a late integrity read and a cancellation during source reading that must not start a billable model call, bringing the owned runner file to twenty-one cases. Those later controls are not represented as original prepatch failures. The fake persistence adapter now evaluates the actual Drizzle status predicate and returns a snapshot of the selected job, rather than automatically protecting every terminal write. The separate route test uses the actual HTTP router and PGlite schema, with the launcher/evidence reader controlled as its existing fixture does. Runner tests keep E3 targets, evidence digests, content hashes and job transitions real; model/source/project-policy and persistence seams are controlled. These checks do not establish live model, native PostgreSQL concurrency, human or agency acceptance. Root owns all test/compiler/build jobs and publication.
