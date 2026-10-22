# Read-only recall SQL interpolation audit

Compared with canonical remote `31ec977a619ebb380f8e06737b8692ab852e7d15`. No application source, gate or baseline was edited. All audited source/dependency hashes stayed unchanged during the read. The inventory reproduces the existing gate count and separately parses full TypeScript query templates to inspect the gate’s nested-backtick blind spot.

The reviewed counts are 44 versus 37 for advanced RAG, 8 versus 7 for Data Room search, and 3 versus 1 for passage coverage. Each of the ten added counted sites contains a fixed canonical SQL fragment or generated placeholder fragment. Organization IDs, current actor IDs, programme UUIDs/UUID arrays, selected document/chunk IDs, source hashes, query strings, dates, categories, profile IDs, thresholds, limits and offsets remain in parameter arrays. No introduced source/request value was found in SQL text within these three files.

## Exact added counted sites

| File | Line | Caller | Expression | Boundary |
| --- | ---: | --- | --- | --- |
| server/services/advancedRAGPipeline.ts | 898 | revalidateCandidates | ``filter`` | bound_filter_fragment |
| server/services/advancedRAGPipeline.ts | 902 | revalidateCandidates | ``supersededSql('d')`` | canonical_fixed_sql |
| server/services/advancedRAGPipeline.ts | 1221 | expandContext | ``filter`` | bound_filter_fragment |
| server/services/advancedRAGPipeline.ts | 1221 | expandContext | ``identity`` | bound_placeholder_fragment |
| server/services/advancedRAGPipeline.ts | 1225 | expandContext | ``supersededSql('d')`` | canonical_fixed_sql |
| server/services/advancedRAGPipeline.ts | 1379 | vaultLexicalArm | ``supersededSql('d')`` | canonical_fixed_sql |
| server/services/advancedRAGPipeline.ts | 1498 | searchVaultSimilar | ``supersededSql('d')`` | canonical_fixed_sql |
| server/services/clinical-regulatory-evidence/data-room-search.ts | 149 | searchDataRoom | ``SOURCE_TEXT_AVAILABLE_SQL`` | canonical_fixed_sql |
| server/services/vault/document-passage-search.ts | 199 | getPassageCoverage | ``supersededSql('d')`` | canonical_fixed_sql |
| server/services/vault/document-passage-search.ts | 200 | getPassageCoverage | ``allowed`` | canonical_fixed_sql |

In advanced RAG, four new `supersededSql('d')` expressions enforce the canonical valid live-successor rule. The two `filter` expressions come from `buildDocFilterClause` with the source’s code-constant column maps; it appends values to the correct local parameter array. The `identity` expression emits `AND d.content_hash = $n` after `params.push(doc.contentHash)`—only the array length enters SQL, while the hash is bound. Data Room search adds `persistedTextAvailableSql('s')`, which validates its alias and emits a fixed text-availability predicate. Passage coverage adds the canonical supersession predicate and literal `AND d.program_id = ANY($3::uuid[])`; the permitted programme array is bound as parameter three.

## Helper and caller trust

- `rag-filters.ts`: callers supply only `VAULT_FILTER_COLUMNS` or `RAG_FILTER_COLUMNS`, both declared code constant maps. Values in filters, including model-extracted constraints, are appended to `params`; dates, single UUID and UUID list never become identifier text. Self-query does not choose columns. The restriction list is bound as one PostgreSQL array, including an empty array. These exported map objects are not frozen; this review relies on the actual audited callers supplying the declared maps and no request reference to the map.
- `vault-version-family.ts`: `supersededSql` does not validate arbitrary aliases. Every audited call passes the literal `d`, and its internal successor alias is literal `succ`. `VALID_LINK` emits only fixed columns/table references with those aliases. The review does not authorize a future request-controlled alias.
- `eligibility.ts` and `recorded-lineage.ts`: the canonical alias/lineageAlias validators admit only identifier grammar. The audited calls use literal `d`, `rd`, `a` or `s`; captured/vault/upload kinds and disposition choices are code branches. Recorded ancestor identifiers and hashes are read from row/JSON expressions in SQL; they are not serialized into SQL by JavaScript. Helpers recursively compose code-owned statements/identifier fragments.
- `data-room-processing-state.ts`: `persistedTextAvailableSql` validates the alias, then chooses a fixed extracted_text column and a fixed Unicode whitespace literal. The evaluated row text remains a database column.
- `evidence-spine.service.ts`: Data Room search calls `visibleOrgClause(orgId, 1)` with literal start index one; only `$1` is generated. The organization value is returned separately as `param`. The caller prefixes the fixed organization_id identifier with literal `s.`.
- Data Room `LIST_COLUMNS` is a closed code list; `SEARCH_VECTOR` is literal canonical SQL. `filterClauses` appends each request value to `args` before returning a `$n` token. `qParam` is a string made from the numeric parameter position, not the query text. Snippet/rank branches choose fixed SQL or NULL/empty; pagination lengths generate only placeholder numbering.
- RAG row identifier collections use `ANY($1::text[])` with one bound array and deduplicated selected IDs. Programme UUID collections use bound `uuid[]`. Context-neighbour document UUID, lo/hi indices, tenant UUID and hash are separately bound. Vector strings assembled from embeddings remain bound `$1::vector` data; they are not interpolated into query statements.
- RAG embedding/availability/rank toggles choose enumerated literal fragments or an empty string. Memory profile/category clauses choose fixed columns and generated placeholders; profile/category/threshold/limit values are in the parameter arrays. `embeddingCol.replace` replaces only the fixed `c.embedding` alias with `s.embedding`.

## Complete counted inventory

Each expression below is classified individually in the JSON report, which also carries query opening, query line, exact expression and offset. The table lists every gate-counted site, including unchanged inherited sites.

### server/services/advancedRAGPipeline.ts

SHA-256: `fa15d9f6b8573e6fe94fe7527ff482ac96e0da4123a4def2c7d0da8b118c7dd2`. Gate: 44; baseline/origin: 37/37. Full parsed SQL expressions: 44.

| Line | Caller | Expression | Classification |
| ---: | --- | --- | --- |
| 896 | revalidateCandidates | ``vaultBinaryAvailableSql('d')`` | canonical_fixed_sql |
| 898 | revalidateCandidates | ``filter`` | bound_filter_fragment |
| 902 | revalidateCandidates | ``vaultDataEligibleSql('d')`` | canonical_fixed_sql |
| 902 | revalidateCandidates | ``supersededSql('d')`` | canonical_fixed_sql |
| 909 | revalidateCandidates | ``ragOriginalFileAvailableSql('d')`` | canonical_fixed_sql |
| 911 | revalidateCandidates | ``ragDataEligibleSql('d')`` | canonical_fixed_sql |
| 921 | revalidateCandidates | ``atomOriginalFileAvailableSql('a')`` | canonical_fixed_sql |
| 925 | revalidateCandidates | ``atomDataEligibleSql('a')`` | canonical_fixed_sql |
| 1221 | expandContext | ``vaultDataEligibleSql('d')`` | canonical_fixed_sql |
| 1221 | expandContext | ``filter`` | bound_filter_fragment |
| 1221 | expandContext | ``identity`` | bound_placeholder_fragment |
| 1225 | expandContext | ``supersededSql('d')`` | canonical_fixed_sql |
| 1240 | expandContext | ``ragDataEligibleSql('rd')`` | canonical_fixed_sql |
| 1364 | vaultLexicalArm | ``vaultBinaryAvailableSql('d')`` | canonical_fixed_sql |
| 1370 | vaultLexicalArm | ``withVectors ? 'c.embedding::text AS embedding,' : ''`` | fixed_sql_branch |
| 1371 | vaultLexicalArm | ``args.keyless ? "ts_rank_cd(to_tsvector('english', c.chunk_text), websearch_to_tsquery('english', $1), 32)::float8" : '0::float8'`` | fixed_sql_branch |
| 1376 | vaultLexicalArm | ``withVectors ? 'c.embedding IS NOT NULL' : 'TRUE'`` | fixed_sql_branch |
| 1376 | vaultLexicalArm | ``filter`` | bound_filter_fragment |
| 1378 | vaultLexicalArm | ``vaultDataEligibleSql('d')`` | canonical_fixed_sql |
| 1379 | vaultLexicalArm | ``supersededSql('d')`` | canonical_fixed_sql |
| 1491 | searchVaultSimilar | ``vaultBinaryAvailableSql('d')`` | canonical_fixed_sql |
| 1495 | searchVaultSimilar | ``denseFilter`` | bound_filter_fragment |
| 1497 | searchVaultSimilar | ``vaultDataEligibleSql('d')`` | canonical_fixed_sql |
| 1498 | searchVaultSimilar | ``supersededSql('d')`` | canonical_fixed_sql |
| 1515 | searchVaultSimilar | ``embeddingCol.replace('c.embedding', 's.embedding')`` | fixed_identifier_branch |
| 1614 | searchRagChunksSimilar | ``ragOriginalFileAvailableSql('d')`` | canonical_fixed_sql |
| 1620 | searchRagChunksSimilar | ``embeddingCol`` | fixed_identifier_branch |
| 1625 | searchRagChunksSimilar | ``ragDataEligibleSql('d')`` | canonical_fixed_sql |
| 1626 | searchRagChunksSimilar | ``orgFilter`` | bound_placeholder_fragment |
| 1626 | searchRagChunksSimilar | ``denseFilter`` | bound_filter_fragment |
| 1660 | searchRagChunksSimilar | ``ragOriginalFileAvailableSql('d')`` | canonical_fixed_sql |
| 1666 | searchRagChunksSimilar | ``embeddingCol`` | fixed_identifier_branch |
| 1671 | searchRagChunksSimilar | ``ragDataEligibleSql('d')`` | canonical_fixed_sql |
| 1672 | searchRagChunksSimilar | ``lexOrgFilter`` | bound_placeholder_fragment |
| 1672 | searchRagChunksSimilar | ``lexFilter`` | bound_filter_fragment |
| 1751 | searchClientMemorySimilar | ``profileClause`` | fixed_sql_branch |
| 1754 | searchClientMemorySimilar | ``thresholdIdx`` | placeholder_index |
| 1755 | searchClientMemorySimilar | ``categoryClause`` | bound_placeholder_fragment |
| 1757 | searchClientMemorySimilar | ``params.length`` | placeholder_index |
| 1803 | searchProjectMemorySimilar | ``profileClause`` | fixed_sql_branch |
| 1806 | searchProjectMemorySimilar | ``thresholdIdx`` | placeholder_index |
| 1807 | searchProjectMemorySimilar | ``categoryClause`` | bound_placeholder_fragment |
| 1809 | searchProjectMemorySimilar | ``params.length`` | placeholder_index |
| 1866 | persistEvidenceCitations | ``vaultDataEligibleSql('d')`` | canonical_fixed_sql |

### server/services/clinical-regulatory-evidence/data-room-search.ts

SHA-256: `78862a0bf91ba1436fc3cf8cbfa259c0f2b5835134971b6c6ba925a7d6823e3c`. Gate: 8; baseline/origin: 7/7. Full parsed SQL expressions: 15.

| Line | Caller | Expression | Classification |
| ---: | --- | --- | --- |
| 140 | searchDataRoom | ``capturedDataEligibleSql('s')`` | canonical_fixed_sql |
| 141 | searchDataRoom | ``where`` | bound_filter_fragment |
| 148 | searchDataRoom | ``LIST_COLUMNS`` | fixed_identifier_list |
| 149 | searchDataRoom | ``SOURCE_TEXT_AVAILABLE_SQL`` | canonical_fixed_sql |
| 151 | searchDataRoom | ``capturedDataEligibleSql('s')`` | canonical_fixed_sql |
| 152 | searchDataRoom | ``capturedBinaryAvailableSql('s')`` | canonical_fixed_sql |
| 153 | searchDataRoom | ``capturedDispositionChoiceSql('s')`` | canonical_fixed_sql |
| 154 | searchDataRoom | ``qParam ? `ts_headline('english', left(s.extracted_text, 900000), websearch_to_tsquery('english', ${qParam}), 'MaxFragments=1, MaxWords=28, MinWords=8, ShortWord=2')` : 'NULL::text'`` | fixed_sql_branch_with_placeholder |

### server/services/vault/document-passage-search.ts

SHA-256: `1fe32cf8aca0e43e893edcdddc5a75bc8f51b5dd8831c20e48e4ecab1ac33b96`. Gate: 3; baseline/origin: 1/1. Full parsed SQL expressions: 3.

| Line | Caller | Expression | Classification |
| ---: | --- | --- | --- |
| 198 | getPassageCoverage | ``vaultDataEligibleSql('d')`` | canonical_fixed_sql |
| 199 | getPassageCoverage | ``supersededSql('d')`` | canonical_fixed_sql |
| 200 | getPassageCoverage | ``allowed`` | canonical_fixed_sql |

## Separately inspected expressions outside the gate’s nested-backtick window

The Data Room page query contains 15 parsed SQL template expressions in total, while the regex gate counts only eight across both queries. The seven extra expressions are inherited nested snippet/rank and suffix placeholder fragments. They were inspected rather than inferred safe from the gate count. No `sql.raw` calls appear in the three audited files.

| File | Line | Expression | Classification |
| --- | ---: | --- | --- |
| server/services/clinical-regulatory-evidence/data-room-search.ts | 155 | ``qParam`` | placeholder_index |
| server/services/clinical-regulatory-evidence/data-room-search.ts | 159 | ``where`` | bound_filter_fragment |
| server/services/clinical-regulatory-evidence/data-room-search.ts | 160 | ``qParam ? `ts_rank_cd(${SEARCH_VECTOR}, websearch_to_tsquery('english', ${qParam})) DESC, ` : ''`` | fixed_sql_branch_with_placeholder |
| server/services/clinical-regulatory-evidence/data-room-search.ts | 160 | ``SEARCH_VECTOR`` | canonical_fixed_sql |
| server/services/clinical-regulatory-evidence/data-room-search.ts | 160 | ``qParam`` | placeholder_index |
| server/services/clinical-regulatory-evidence/data-room-search.ts | 161 | ``page.length - 1`` | placeholder_index |
| server/services/clinical-regulatory-evidence/data-room-search.ts | 161 | ``page.length`` | placeholder_index |

## Dependency hashes

| Dependency | SHA-256 |
| --- | --- |
| server/services/rag-filters.ts | `20f013c86e949f7ab5a080d1d4ced47680ab22d0d6dc192b5e16198a9b4077b6` |
| server/services/vault/vault-version-family.ts | `196ba74c0214250ac6f10c4b5ec5c92194c89901d23be015dedeaeef7493b526` |
| server/services/document-data-disposition/eligibility.ts | `b4d93194a0cdac02966b2b9bf0ca73e4dcf96fa6218ed259ecf4e469ce37db6f` |
| server/services/document-data-disposition/recorded-lineage.ts | `b34a7050ca1868c339f8dbe10f0d60a50ea443b415fbadb820708005befa9733` |
| server/services/clinical-regulatory-evidence/data-room-processing-state.ts | `64f5d5fd40b1ab1201797a38b7b3ee58d176a54770d593ad8006b95a17c708e4` |
| server/services/clinical-regulatory-evidence/evidence-spine.service.ts | `c1a013197976c32976c515edd46c316baacae62ecae63d12bbba107b74a140ea` |
| scripts/ci/check-sql-interpolation.mjs | `9e6271d2f24dbdc1f75d1e518f52375a5f679b8f3e91aab9236bbfa09ab30e85` |
| scripts/ci/lib/strip-comments.mjs | `2887abc86d3f874c6c38c524e07e158a701a6945ef970bd1fea828275617aec1` |
| scripts/ci/sql-interpolation-baseline.json | `7e00c90cdd76558de35529fe4ffe5386fd37d19891c6187c8d760ca7ce294658` |

## Qualification and gate handling

This read-only source audit supports a narrow, written fixed-fragment exception for the named ten additions if the lead applies the repository’s exception rule. It does not authorize a bulk baseline regeneration, baseline changes in unrelated files, or new request-selected identifiers. The lead owns any explicit gate reconciliation and its fail-first/selftest proof. The audit runner writes only this evidence inventory and refuses changed snapshots or unclassified sites.

This review establishes the observed SQL-text value boundary. It does not establish production tenant/project authorization, source lifecycle race behavior, numerical coverage correctness, provider delivery, or PostgreSQL runtime isolation. Those remain separate checks. Re-run the audit after any source/helper change; a matching aggregate count cannot prove matching site behavior.
