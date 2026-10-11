# Document and extracted-data lifecycle

An uploaded file and the data extracted from it have different lifecycles. Deleting a PDF must never silently erase extracted facts, catalog values, citations, OCR text or lineage, and retaining extracted data must never imply that the original file is still available.

**Implementation status, 2026-10-06:** the canonical disposition API, Data Room/Vault decision interface, append-only record and shared consumer projection are implemented under W2/D2 and D5. New decisions remain disabled by default pending verified activation. Local regression evidence is recorded in [D2-D5/2026-10-06-document-dispositions](../evidence/D2-D5/2026-10-06-document-dispositions/README.md); this is not a live qualification or a claim that either launch row is complete.

## User decision at removal

The project source action must require one of these choices before it writes anything:

| Choice | File availability | Derived-data eligibility | Lineage |
|---|---|---|---|
| `keep_data` | Withdrawn from ordinary file access; retention copies and legal holds follow existing policy | Remains eligible for catalog, reviewed extracted text and retrieval, with an `original file unavailable` marker | Preserved; every answer and value still points to the source identity, hash and disposition |
| `remove_data` | Withdrawn from ordinary access | Removed from active catalog/retrieval and blocked from new grounding; historical records remain auditable | Preserved as revoked lineage; no citation or historical record is rewritten |
| `supersede` | Old file withdrawn from ordinary access | Old derived data is retained for historical comparison and removed from current eligibility after the named successor is verified | Old → successor is recorded; the successor must be an existing same-project version, never “newest file” by guess |

The interface shows the impact preview before confirmation: source identity and SHA-256, extracted/catalog/chunk/atom counts, citations and downstream back-references, retention/legal holds, approvals and lifecycle blockers, and the exact replacement candidate. No choice is selected by default. The actor must state a reason of 10–4000 characters. A stale preview token or an unavailable count causes the mutation to fail closed. A success is shown only when the response includes the disposition and its chained audit receipt.

`keep_data` can later become `remove_data` or `supersede` through a fresh decision and preview. That appends a new record pointing to the earlier decision. It never restores the original file. Withdrawal and supersession are terminal, and the database refuses duplicate decisions, reactivation and history forks.

## Reachable interface and API

`client/src/concept2cure/v2/surfaces/DocumentDisposition.tsx` is the shared decision interface, reached from Data Room source actions in `ProjectHome.tsx` and the selected Vault document in `Vault.tsx`. A retained source exposes **Manage retained data** for its later transition. Withdrawn or superseded sources preserve their visible status and history.

The authenticated project routes are implemented in `server/routes/c2c/document-data-dispositions.ts` and mounted by `server/bootstrap/register-inline-routes.ts`:

| Method and path | Contract |
|---|---|
| `GET /api/c2c/projects/:id/document-dispositions/preview` | Query: `targetType=captured_source\|vault_document`, `targetId`, and optional `replacementId`. Returns the server-observed impact and signed preview token. |
| `POST /api/c2c/projects/:id/document-dispositions` | Body: `targetType`, `targetId`, `choice`, `reason`, `previewToken`, and `replacementId` only for supersession. Returns the appended decision and audit receipt. |

Organization, project membership, actor and mutation authority come from the authenticated scope. The POST additionally requires editor access and either project-lead or organization-manager authority. Client-supplied scope, actor and impact values are never authoritative. The canonical types are in `shared/document-data-disposition.ts`.

The legacy knowledge-source DELETE (`server/routes/c2c/knowledge-sources.ts`) and document-data-center DELETE (`server/routes/document-data-center.ts`) now refuse with HTTP 409 `DOCUMENT_DISPOSITION_REQUIRED`. `DocumentDataCenterService.deleteDocument` also refuses direct callers. Their replacement is the project disposition API and the reachable Data Room/Vault interface above, which requires the data consequence before changing availability. These legacy routes no longer remove settings references or storage bytes independently of the recorded decision.

## Canonical record

`migrations/20261006_document_data_dispositions.sql` adds the append-only `public.document_data_dispositions` record keyed by integer organization, programme, and exactly one typed source target (`captured_source_id` or `vault_document_id`). It stores the choice, reason, actor, timestamp, source hash, preview hash, linked capture/Vault/artifact/upload IDs, optional existing replacement ID, chained audit receipt, previous disposition ID and sequence. Database triggers reject updates, deletion and truncation, validate typed source identity, and enforce the transition sequence. The existing immutable source, Vault version, extraction and lineage rows remain intact.

The source target is resolved by exact organization/programme identity and original content hash. Ambiguous or missing links are a refusal. A Vault UUID is never interchangeable with a Data Room integer source ID. A replacement is valid only when the caller names an existing verified direct successor (`previous_version_id` for a captured source or `supersedes_id` for a Vault version) in the same scope with usable extraction and different original bytes. A disposed replacement is refused. Exact-byte reuse under a fresh captured/Vault identity cannot silently resurrect a disposed source. Raw uploaded-file access conservatively refuses the same original SHA-256 anywhere in that organization, because an upload has no authoritative programme key. Vault disposition matching takes the organization from the authoritative programme registry, so a legacy null `vault.documents.organization_id` cannot bypass the decision.

The service takes a repeatable-read preview with per-store content fingerprints. The HMAC token binds the organization, programme, actor, typed source, named replacement, complete snapshot and expiry, ten minutes after issue. Confirmation uses a serializable transaction, project-scoped advisory lock, shared locks on the observed impact stores and a share-row-exclusive lock on the disposition table. It re-observes and compares the complete snapshot, then writes the audit and disposition together. A missing store, changed reference, timeout, serialization conflict or unavailable receipt refuses the mutation. Impact table locks are intentionally conservative and can block unrelated writes; production concurrency and throughput need staging verification before activation.

Active legal holds, active review/approval states, and governed CMC/dependency links require review before withdrawal. A future `retention_until` is displayed, while logical availability changes do not delete the retention copy.

## Read-path consequences

`server/services/document-data-disposition/eligibility.ts` owns the shared projection for captured sources, Vault versions, raw uploads, atoms, RAG documents and artifacts. Captured-source and Vault queries match the authoritative organization, programme, typed/linked identity and original SHA-256. Uploads also match organization-wide original hashes; artifact matching uses proved IDs/upload pointers and source hashes. This projection remains authoritative even if the flag for new decisions is subsequently disabled.

The implementation applies it to Data Room listings and pins, catalog load/list/search and coverage, Vault text/search/index/download, uploaded-file access, source resolution for new citations, dense/lexical RAG and neighboring-chunk expansion, atom retrieval, and eCTD leaf binary resolution. Direct citation creation and citation refresh also refuse withdrawn or superseded source data. Ana's legacy `read_vault_document`, `list_vault_documents` and `search_all_documents` handlers apply artifact eligibility before returning their Artifacts Center text, and expose unavailable-policy-store errors instead of reusing old text. Historical source and citation/lineage records remain readable as history. `keep_data` leaves stored derived text eligible while disabling original-file access and binary grounding. `remove_data` and `supersede` exclude the old data from new retrieval and grounding.

Chunking and contextual ingestion check availability again before provider batches and writes. Database late-write guards cover captured extraction/status/metadata/provenance, Vault extraction/status, Vault catalog/chunks, atoms, artifacts, RAG documents/chunks and authoring citations. They freeze artifact content, hash, metadata and identity after any disposition, and inspect both old and new references for supported reparenting attempts. Catalog/chunk/atom/artifact/RAG/citation guards also refuse deletion of the protected historical rows. Keeping data retains the confirmed extraction; it does not authorize another OCR or embedding pass over the unavailable original. Local PGlite regression tests exercise the actual migration and these guards. They do not establish two-connection timing or prove every possible future consumer.

The RAG pipeline batches corpus-specific eligibility checks against the actual tenant/project and document identity before reranking, MMR content re-embedding, compression, corrective grading/generation and final grounding. A failed or empty policy-filtered neighbor lookup discards its stale candidate. Stored text retained by `keep_data` is marked as such. If the grounding's data eligibility or binary-availability status changes while generation awaits a provider, the entire generated answer is refused. These are point-in-time checks: an already-dispatched provider request cannot be recalled, so a disposition is prospective and does not cancel or retroactively erase prior provider inputs.

## Ana behavior

Ana should state the distinction in context:

- “The original file is unavailable, but its extracted data remains active under source X, captured from hash Y on date Z.”
- “The source data was withdrawn, so I will not use it for new analysis. Historical outputs still retain their recorded lineage.”
- “This source was superseded by version X. I can compare the prior and current values; I will not silently overwrite the old record.”

If the user asks to delete a source without choosing the data consequence, Ana asks the choice question. If source identity, downstream impact, legal hold, or replacement validity is unknown, she reports the gap and pauses the mutation.

For selected retained source pins, `server/services/clinical-regulatory-evidence/retained-source-context.ts` loads only existing extracted text from the same organization/programme and confirmed linked Vault or artifact representation. `server/routes/ana-ri/stream.ts` adds the original source identity/hash, representation identity and **original file unavailable** statement to the turn. `textSha256` separately hashes the exact UTF-8 text supplied in the turn; it is not the original PDF's SHA-256. The excerpt is bounded and identifies truncation; it never reads the PDF, runs OCR or invents an extraction. Catalog tools expose the same file-availability distinction. A later withdrawal or supersession makes this context ineligible.

## Deployment and activation

The additive migration is registered in `scripts/db/migration-set.mjs` before the final tenant isolation sweeps. Deploy the migration together with the reader changes: missing disposition infrastructure is an unavailable store, not permission to serve old bytes.

`C2C_DOCUMENT_DISPOSITIONS_ENABLED=1` enables new confirmations; unset or any other value keeps them disabled. Preview signing requires a random `DOCUMENT_DISPOSITION_PREVIEW_SECRET` of at least 32 characters. When that variable is absent, the service uses `SESSION_SECRET`, subject to the same minimum. An explicitly empty dedicated secret refuses signing. Rotating the signing secret invalidates outstanding previews, so callers must open a fresh preview.

The default stays disabled until the migration, real runtime-role permissions, consumer behavior, concurrent writes/provider dispatch, tenant-specific retention and owner/reviewer acceptance are verified in staging. Local tests do not supply product provider access, verified tenant data or reviewer approval, and do not satisfy live IQ/OQ/PQ.

This design deliberately separates file retention policy from derived-data eligibility. Physical erasure remains the existing governed purge process and is never claimed by a project-level removal action.
