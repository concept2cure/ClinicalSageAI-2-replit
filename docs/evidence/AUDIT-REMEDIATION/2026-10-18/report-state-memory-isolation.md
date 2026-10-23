# ReportOS state stays behind constituent-source admission

ReportOS retains full bundle manifests under each constituent project in
`project_memory_entries`, marked with `source_document_type = 'report_os_state'`.
A bundle can combine a public project and a private project. Permission to read
ordinary memory of the public project does not authorize the private report
source IDs and metadata in that complete manifest.

Generic project memory readers now exclude this reserved source type in SQL
before counting, ranking, ordering, and limits. The boundary covers the raw
project memory API and AnA bootstrap, shared memory pool, project intelligence
summaries and prompt memory, default and legacy semantic recall, structured
AnA recall and commands, intelligence feed, and consolidation comparisons.
Ordinary memory with a NULL source type or document source type remains eligible.

The explicit ReportOS bundle/delivery/history readers retain their existing
source predicates and all-constituent permission checks. No record, manifest,
audit history, schema, entitlement, producer, or report capability is removed.
The change does not authorize mixed private reports through a generic memory
route or reinterpret a stored report as ordinary knowledge.

The failing control directly retained a tagged mixed-source manifest in real
PGlite. Before the remedy it reached raw list/count, shared pool limits, project
prompt, and intelligence summary. Companion checks also verify SQL recall
limits, ordinary NULL/PDF positive cases, mounted feed behavior, and that
reserved records cannot suppress ordinary consolidation through deduplication.
The complete original manifest remains byte-for-byte present in storage.

This raw-reader fixture inserts the reserved manifest directly. It does not
claim an end-to-end native ReportOS producer run. The independent
`report-os-bundle-recording.test.ts` companion exercises the actual ReportOS
route and transaction bindings, proving that each stored copy contains the full
manifest and its constituent access IDs; its driver is recorded, not native.
Native qualification separately exercises current PostgreSQL readers with
fresh retained fixtures. Raw execution receipts, limitations, source hashes,
and the control tower's release qualification are recorded separately.
