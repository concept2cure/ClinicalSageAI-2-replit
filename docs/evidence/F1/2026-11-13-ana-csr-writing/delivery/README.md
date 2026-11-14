# Finish existing CSR writing delivery

Plan F1; W1 / D2. Source is the current canonical product, beginning at `841c41466b6b96c6d95190432c41549ae9fc43b2`. No old service/editor is restored.

## What already exists

`server/services/ana/AnaDocumentDraftingService.ts` owns ordinary drafting, revision, recorded-context stream buffering and the separate approved-derivative handoff. Its existing strict requirements resolver owns E3 heading resolution. `server/services/ana/medical-writing-csr.ts` and the E3 records own the canonical writing standard. `server/services/authoring/authoring-draft-template.ts` owns validated saved-reference admission and the single editor's prompt context. Existing `AnaProjectScopeError`, JSON/SSE handlers and batch classification already deliver actionable scoped refusals. Existing current-source, product, actor, cancellation, qualified-model, derivative round-trip, scientific-review and immutable generation/checker controls remain authoritative.

## Completed behavior

Ordinary explicit or recorded CSR generation receives the canonical writing brief for the exact resolver-derived E3 heading, including revision and buffered recorded-context streams. Unknown, ambiguous or conflicting write headings refuse with `DRAFT_CSR_SECTION_UNAVAILABLE`; original-record sections refuse with existing `AnaProjectScopeError` and `DRAFT_MANUAL_SECTION_REQUIRED`. Read-only requirements resolution is unchanged.

The approved-derivative branch retains its exact payload/identity handoff and verification gates. Only a local refusal for an explicitly identified original-record CSR section precedes that branch; no ordinary brief, raw product/source reads or caller prose is added to its payload.

The validated editor drafting context prefixes the trusted canonical brief separately from saved-reference JSON. Full registry/component CSR identity admits document-local E3 guidance; unknown/mismatched/manual bindings refuse. Immutable CSR template-ID classification, including IND filing-coded templates, remains; CTD coordinates are not reinterpreted as E3 numbers. Receiving-application metadata still comes from the existing resolver. The prefix explains the separate document-local structure; this phase does not claim that resolver was globally changed.

The original 16 KiB bound still applies to saved-reference data. Trusted canonical instruction is outside that JSON and its data budget. A positive reference between 2 and 16 KiB remains usable when the combined context exceeds 16 KiB; reference data above its original limit still refuses without clipping. The generic read-only reference renderer is unchanged.

## Observed checks

- Initial 20-case RED: **19 failed / one passed**, 23.074 seconds; 13 selected pins stable. Eighteen conditions expose missing delivery/manual/binding behavior. One new expectation incorrectly requested mismatch classification for a reference the existing manual guard already refuses.
- Fixture successor: that single case passed with the existing `TEMPLATE_NOT_DRAFTABLE` priority; 19 cases skipped, 16.764 seconds, 13 pins stable. No runtime change was made for this correction. The reconstructed corrected source hashes to the actually-run fixture successor snapshot.
- Final bounded cohort: **250 passed across nine files**, 54.187 seconds; all 29 selected source/configuration/test hashes stable. It includes 27 focused delivery cases, 45 existing HTTP cases, saved-reference and assembly safety, real-PGlite recorded product/access, source/derivative checkpoints, cancellation, batch and scientific template-identity controls. Counts from overlapping phases are not added.
- Scoped lint: zero errors; the service retains its one existing warning, the template and focused test have none. Original runtime text was linted at each actual source path through the ESLint API, with no source swaps.

[checks.json](checks.json) records separate phases, limits and exact paths. [archives.json](archives.json) records compressed and uncompressed hashes for 31 lossless source snapshots, exact commands, runner, raw test/console results and same-path lint comparisons. The initial test source, its one-code fixture correction and the expanded final 27-case source are distinct artifacts. The added boundary/compatibility cases are not claimed to have failed in the initial 20-case phase.

## Limits

Outbound gateway and validated saved-reference results are controlled collaborators. PGlite is a bounded SQL fixture, not native PostgreSQL/RLS qualification. Existing HTTP tests verify the existing scoped-error transport; no live authenticated manual-draft/provider flow was run. The derivative fixture verifies service handoff/verification behavior, not actual custody decryption or provider PQ. The separately held `authoring.router.ts` was not edited and its source hash stayed stable during this cohort. No live model comparison, learned model weights, clinical writing qualification, scientific approval, deployment or agency acceptance is established.
