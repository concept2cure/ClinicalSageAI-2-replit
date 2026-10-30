# CSR generation and expertise improvements

W1 / D2. Contract: docs/design/CSR_EXPERTISE_IMPROVEMENTS_2026-10-30.md.

## What already exists

- `csr-builder.ts` owns the sole CSR drafting path and canonical E3 targets. It receives rendered section requirements and guards numerical claims; an empty retained evidence pack currently fails usableEvidence and is dropped, allowing metadata-only acceptance of unsupported qualitative findings.
- `ind/ctd/csr-e3-guidance.ts`, `csr-e3-writing.ts` and `ana/medical-writing-csr.ts` own the 119-heading record and report-wide scientific writing rules. Section writing is in the brief; the builder does not currently include the report-wide rules. Newly added ethics/SAP model sentences assume approval, compliance and pre-unblinding finalization without records.
- `ana/intelligence-questions/flows/csr-report.ts` is registered and reachable. Sensitivity analysis is currently branched around primary failure; two absolute nonzero event counts are labelled high rates without a denominator.
- `csr/csr-job-runner.ts`, `cortex-authoring-reader.ts` and `cortex-authoring-context.ts` own persisted jobs, retained evidence and per-section source admission. Source is loaded before drafting; a late reply and fully populated resume need current-source checks. Program identity must match the numeric target, not merely share its protocol number.
- `csr/project-scope.ts` and `report-os/project-access.ts` own current actor/project policy. resolveCsrScope's forWrite currently does not reach canAccessReportProject, and its Drizzle actor branch lacks the active user/tenant checks in its SQL branch.
- Incoming Oct28–30 work already provides ADaM-backed tables, source-cell reconciliation, patient narratives, CSR assembly/placement, restart recovery, scientific review/release and instruction-based revision/alternatives. Existing CSR_END_TO_END_2026-10-29.md and its slice evidence are credited; retired legacy/model-figure endpoints are not restored.
- `DocumentWorkbench`, CSR card, governed source/review/export/import controls and existing model approval/qualification gates remain the product owners. No alternate editor, CSR engine, knowledge bank or scientific calculator is introduced.

## Catch-up and pending work

Canonical code was fast-forwarded from1c846bdf6 to438287ed1. resume-state.json and paused-filing-source-manifest.json preserve the earlier pending work and its exact recoverable bytes. No pending filing source is represented as complete. Incoming implemented CSR work is credited; new audit findings are static conclusions until executable RED/GREEN evidence is captured.

## Status

Implemented and locally qualified in `resumed-codex/README.md`: 436 tests across 43 files pass; client/server/audit-verifier builds pass; changed-file lint has zero errors and zero warning growth. The bounded expertise, retained-source generation and current read/edit admission contracts are completed through the existing owners. Normal canonical publication gates and the accepted source receipt are recorded in that packet. Human, live-provider, native PostgreSQL RLS and agency acceptance remain unrun. Earlier filing work is still preserved and in progress.
