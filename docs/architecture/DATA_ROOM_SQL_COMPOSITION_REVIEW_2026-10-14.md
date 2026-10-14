# Data Room SQL composition review

The canonical publication adds current source-access and provenance predicates through the existing SQL builders. `ci:sql-interpolation` counts every expression in a query template, including fixed identifiers, static policy SQL and generated `$n` placeholders. Its documented exception permits fixed identifiers with an explicit reason. This change records the narrow structural composition cases reviewed by six independent owners; it does not permit runtime data in SQL text.

The complete per-expression inventories, helper provenance and original source hashes are under [canonical publication evidence](../evidence/D2-CANONICAL-PUBLICATION/2026-10-14/README.md). The [chief review](../evidence/D2-CANONICAL-PUBLICATION/2026-10-14/SQL_INTERPOLATION_CHIEF_REVIEW.md) reviewed all 19 flagged files. The gate and selftest are unchanged. The baseline update changes only the following reviewed entries, and removes the obsolete catalog-search allowance; unrelated entries are byte-semantically unchanged.

| File under `server/services/` | Previous count | Reviewed count | Structural composition reason |
| --- | ---: | ---: | --- |
| `advancedRAGPipeline.ts` | 37 | 44 | Seven added canonical currentness predicates, fixed filter clauses and generated hash placeholders; vectors, source identities, tenant IDs and limits remain bound. |
| `ana/source-admission-receipt-history.ts` | 0 | 1 | Optional exact UUID predicates contain only fixed column names and locally generated placeholder numbers. |
| `ana/source-admission-receipt-store.ts` | 0 | 1 | A private constant contains 16 literal ledger projection identifiers; all inserted and selected identity values are bound. |
| `clinical-regulatory-evidence/data-room-processing-store.ts` | 0 | 3 | Canonical eligibility predicates receive literal aliases. |
| `clinical-regulatory-evidence/data-room-processing-sweep.ts` | 0 | 9 | Closed metadata-state predicates, literal JSON keys, canonical eligibility and lineage builders; candidate IDs, organization and limit are bound. |
| `clinical-regulatory-evidence/data-room-processing.ts` | 0 | 4 | The canonical persisted-text predicate chooses retained columns; extraction/facts/stage payloads remain bound. |
| `clinical-regulatory-evidence/data-room-search.ts` | 7 | 8 | One added canonical persisted-text predicate with literal source alias. |
| `document-data-disposition/service.ts` | 1 | 2 | A finite literal live-program `FOR SHARE` clause joins the existing fixed impact-table list. |
| `tenant-export/tenant-full-export.service.ts` | 8 | 9 | The added clause is exactly empty text or ` FOR SHARE`; organization and digest remain bound. |
| `vault/document-catalog-actor-captures.ts` | 0 | 8 | Fixed identity projections, joins, scope and canonical disposition/binary predicates; actor/program/file identities and page limit are bound. |
| `vault/document-catalog-admission.ts` | 0 | 1 | The actor reservation suffix is exactly empty text or `FOR SHARE OF ou, u, o`; actor and organization remain bound. |
| `vault/document-catalog-document.ts` | 7 | 14 | Existing raw-loader composition moved to the shared document helper: finite text/currentness choices, literal canonical aliases and generated parameter indexes. |
| `vault/document-catalog-governance.service.ts` | 0 | 3 | Canonical eligibility, binary and version predicates use literal alias `d`. |
| `vault/document-catalog-search-query.ts` | 0 | 7 | Query construction moved from its facade; canonical predicates and generated parameter indexes carry no request values. |
| `vault/document-catalog-write-integrity.ts` | 0 | 3 | Canonical disposition/binary/currentness predicates use literal alias `d`. |
| `vault/document-catalog.service.ts` | 3 | 4 | Fixed project/currentness/disposition structure; query values remain bound. |
| `vault/document-passage-search.ts` | 1 | 3 | Added canonical currentness predicate and fixed accessible-program filter with a UUID-array bind parameter. |
| `vault/retrieval-source-access.ts` | 0 | 2 | Canonical eligibility and currentness predicates with literal alias `d`. |
| `vault/document-catalog-search.ts` | 5 | 0 | Construction moved into the shared query module; the old allowance is removed. |

These allowances are for the concrete reviewed constructions. `supersededSql` does not sanitize an arbitrary alias, so the reviewed literal-alias calls do not justify accepting an external alias. The processing reason-code array is TypeScript-readonly rather than runtime-frozen; the review establishes its literal definition and read-only reached consumers, not a general mutation-proof guarantee. A future runtime value belongs in a bind parameter, and a new construction needs its own review.

The ownership gate additionally requires the processor and catalog to call `programInOrganization`. Its new internal `forShare` option uses fixed held query literals and retains the existing canonical ownership definition and caller transaction. Actor/private-project admission remains separate and mandatory. Capture workspace discovery is reconciled with the existing CRE parent contract; it does not grant access from a coincident numeric ID.

Recorded static checks and fresh integrated tests accompany the canonical publication. This review does not claim that the regex gate detects all SQL construction: its existing selftest explicitly records two known gaps, which remain visible. The receipt INSERT constant and processing candidate-query variables were inspected separately.
