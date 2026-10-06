# Document and extracted-data lifecycle

An uploaded file and the data extracted from it have different lifecycles. Deleting a PDF must never silently erase extracted facts, catalog values, citations, OCR text or lineage, and retaining extracted data must never imply that the original file is still available.

## User decision at removal

The project source action must require one of these choices before it writes anything:

| Choice | File availability | Derived-data eligibility | Lineage |
|---|---|---|---|
| `keep_data` | Withdrawn from ordinary file access; retention copies and legal holds follow existing policy | Remains eligible for catalog, reviewed extracted text and retrieval, with an `original file unavailable` marker | Preserved; every answer and value still points to the source identity, hash and disposition |
| `remove_data` | Withdrawn from ordinary access | Removed from active catalog/retrieval and blocked from new grounding; historical records remain auditable | Preserved as revoked lineage; no citation or historical record is rewritten |
| `supersede` | Old file withdrawn from ordinary access | Old derived data is retained for historical comparison and removed from current eligibility after the named successor is verified | Old → successor is recorded; the successor must be an existing same-project version, never “newest file” by guess |

The interface must show the impact preview before confirmation: source identity and SHA-256, extracted/catalog/chunk/atom counts, citations and downstream back-references, retention/legal holds, approvals and lifecycle blockers, and the exact replacement candidate. A stale preview token or an unavailable count causes the mutation to fail closed.

## Canonical record

The implementation should add an append-only `public.document_data_dispositions` record keyed by organization, programme, and exactly one typed source target (`captured_source_id` or `vault_document_id`). It stores the choice, reason, actor, timestamp, source hash, preview hash, linked capture/Vault/artifact/upload IDs, optional existing replacement ID, and the chained audit receipt. Database guards must reject updates, truncation and runtime-role deletion. The existing immutable source, Vault version, extraction and lineage rows remain intact.

The source target is resolved by exact organization/programme identity and original content hash. Ambiguous or missing links are a refusal. A Vault UUID must never be confused with a Data Room integer source ID. A replacement is valid only when the caller names an existing verified successor (`previous_version_id` for a captured source or `supersedes_id` for a Vault version) in the same scope with usable extraction.

## Read-path consequences

Every source-consuming path needs the same disposition projection, including Data Room source listing, catalog load/list/search, Vault text/search/download, selected-source pins, dense and lexical RAG retrieval, neighboring-chunk expansion, citation/source resolution, lineage exports and asynchronous OCR/embedding writes. `keep_data` leaves derived text eligible while disabling binary-file grounding. `remove_data` and `supersede` exclude derived data from new retrieval. A late OCR or embedding job must re-check the disposition before provider egress or insertion.

The current repository has immutable source and Vault rows, append-only lineage, and existing supersession records, but no canonical disposition record or complete shared eligibility predicate. Existing legacy knowledge-source deletion only removes a project-settings reference and does not govern extracted artifacts; the legacy document-data-center delete path can remove storage without the required derived-data choice. Those paths must route through this contract before they can be presented as document deletion.

## Anna behavior

Anna should state the distinction in context:

- “The original file is unavailable, but its extracted data remains active under source X, captured from hash Y on date Z.”
- “The source data was withdrawn, so I will not use it for new analysis. Historical outputs still retain their recorded lineage.”
- “This source was superseded by version X. I can compare the prior and current values; I will not silently overwrite the old record.”

If the user asks to delete a source without choosing the data consequence, Anna asks the choice question. If source identity, downstream impact, legal hold, or replacement validity is unknown, she reports the gap and pauses the mutation.

This design deliberately separates file retention policy from derived-data eligibility. Physical erasure remains the existing governed purge process and is never claimed by a project-level removal action.
