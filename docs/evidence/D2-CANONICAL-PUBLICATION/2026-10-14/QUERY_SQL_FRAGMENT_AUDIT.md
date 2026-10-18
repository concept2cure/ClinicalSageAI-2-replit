# Read-only SQL fragment audit

Assigned review: the eight direct-template interpolation sites in `document-catalog-actor-captures.ts` and two in `retrieval-source-access.ts` reported by the publication SQL ratchet. No application source, SQL gate or baseline was modified. The audit inventories the actual sites using the gate's comment stripper and direct-query-template counter. `query-sql-fragment-audit.json` pins both source hashes and nineteen helper/authority/gate dependency hashes; the `.mjs` reproduces the inventory read-only.

Finding: none of these ten expressions inserts a client/source/program/document/file value into SQL text. They insert fixed projection, join or guard SQL made from code-owned identifiers and literals. Runtime values use bind parameters or comparisons of returned rows. This finding is specific to the recorded source and dependencies, not a blanket exemption for future interpolations in these files. A helper change requires renewed review even when its interpolation count stays unchanged.

## Capture discovery: eight counted expressions

Reviewed source SHA-256: `cf8fb4643ec4d3eec6ac7fcfc175a7c8122e58daeaddba1e6ae297321687cb48`.

| Site | Counted expression | Actual source and reason |
| --- | --- | --- |
| Identity query, line 116, expression 1 | `identities` | One local `const` literal at lines 109–115, containing only fixed columns and aliases `s`, `f`, `source_project`, `rp`, `all_anchor`, and a fixed `$1` correlated anchor count. It has no interpolation, arguments, mutation or runtime-derived column name. |
| Identity query, line 116, expression 2 | `captureJoinsSql()` | Zero-argument local helper at lines 38–46. Fixed `cre_evidence_sources`, `file_uploads`, `projects`, `regulatory_programs` table names and fixed aliases/join predicates; no external table or join input. |
| Identity query, line 116, expression 3 | `captureScopeSql()` | Zero-argument local helper at lines 25–37. Fixed tenant/current/source-type/parent/creator predicates. Its one nested generated guard calls `capturedDataEligibleSql('s')` with the literal alias `s`. The organization, program array, actor and unbound-scope decision remain `$1`–`$4`. |
| Counted page, line 121 | `identities` | The same immutable literal projection; no second independently assembled identity definition. |
| Counted page, line 123 | `capturedDispositionChoiceSql('s')` | Literal alias `s`, validated by the eligibility helper's identifier grammar. The generated disposition subquery selects fixed columns and correlates row values in SQL; disposition values never become JS-generated SQL. |
| Counted page, line 124 | `capturedBinaryAvailableSql('s')` | Literal alias `s`, fixed captured kind, fixed binary flag. It composes the canonical own disposition and recorded ancestry checks. All nested identifier/seed/edge/depth fragments are code-defined, as detailed below. |
| Counted page, line 126, expression 1 | `captureJoinsSql()` | The same zero-argument fixed join definition as the identity pass. |
| Counted page, line 126, expression 2 | `captureScopeSql()` | The same zero-argument fixed admission predicate as the identity pass. |

The two queries' parameter arrays are explicit. The identity pass binds `[scope.organizationId, [...scope.accessibleProgramIds], scope.userId, scope.projectId === null]`; the page appends `allowedFiles` and the validated/clamped integer limit. `$5::text[]` carries file IDs and `$6` carries the limit. No CSV UUID/file list, integer text, title, filename, dossier, source text, hash or supplied role is concatenated into the statement. File IDs discovered from the database remain values, including potentially hostile stored strings.

Before the page's count/window, `admittedUploadFiles` calls canonical `assertAnaUploadAccess` for each candidate. That helper reads current active membership and upload IDs with parameter arrays, reads all recorded CRE/artifact parents with parameter arrays, and delegates actual parent admission to the existing source/project helpers. Only evaluated 403 denials omit an upload; unknown SQL/policy state is unavailable. The complete admitted file set is checked again after the counted page, including files outside the returned window. `listChatUploadsForActor` obtains the internal DTO through `withAnaSourceReadScope`; the internal primitive's stamped-executor precondition is explicit. This review does not convert a constructed DTO into authority or change policy.

## Retrieval source recheck: two counted expressions

Reviewed source SHA-256: `4e1a195d19ca0c9847d3916f23f3d53463d88494401b4e654fac436ee15aa3d4`.

| Site | Counted expression | Actual source and reason |
| --- | --- | --- |
| Source identity query, line 59, expression 1 | `vaultDataEligibleSql('d')` | Literal table alias `d`; the eligibility helper validates its grammar, chooses fixed Vault column names and generates the canonical disposition exclusion subquery. No request-controlled predicate text enters this call. |
| Source identity query, line 59, expression 2 | `supersededSql('d')` | Literal table alias `d`; the helper's other alias is fixed `succ`, and `VALID_LINK` composes only fixed family/program/organization/code/deletion columns. This helper itself does not validate arbitrary aliases; safety at this reviewed site comes from the hardcoded caller argument, not an asserted universal alias sanitizer. |

The one query binds `[scope.organizationId, [...unique.keys()], [...scope.accessibleProgramIds]]` as `$1`, `$2::text[]`, `$3::uuid[]`. It never formats requested document/program IDs into syntax. Content hashes are validated as SHA strings and compared against returned identities in JS, never interpolated. Contradictory duplicate identities, missing/duplicate returned rows and changed program/hash values refuse the result. `withRetrievalReadScope` derives server identity fields, re-admits the actor/program scope on the short canonical transaction and then runs the operation; the actor wrapper also revalidates before commit.

## Helper composition and assembly gaps checked

`eligibility.ts` validates table aliases with `/^[a-z_][a-z0-9_]*$/i`. The two reviewed caller aliases are the single literals `s` and `d`. Its `matching` helper chooses `client_program_id`/`program_id`, `captured_source_id`/`vault_document_id`, `capturedSourceIds`/`vaultDocumentIds`, `checksum`/`content_hash` from internal captured/Vault variants. The captured and Vault call paths supply those variants as literals. Disposition choices are fixed SQL string literals and stored columns, not caller text. Guard composition is deterministic from those code inputs.

The captured lineage path is `capturedDataEligibleSql` or `capturedBinaryAvailableSql` → `recordedLineageEligibleSql('captured','s')` → `recordedLineageRowsSql(recordedLineageSeedSql(...))`. The seed is generated from the fixed kind/validated alias. The traversal uses fixed aliases and table names, fixed captured/upload column variants, fixed JSON property names and `MAX_RECORDED_DEPTH = 64`. Provenance values and recorded ancestry IDs/hashes are evaluated as SQL row expressions and checked before numeric casts; they are not fetched and spliced back into SQL strings. `recordedLineageRowsSql` accepts a SQL string in its general interface, but these reviewed callers supply the canonical generated seed. This finding does not authorize arbitrary seed strings from a request.

The lineage helpers and `captureScopeSql` assemble SQL in local variables/functions, a known blind spot of the gate's regex. Those definitions and their reached call chains were therefore read directly. `identities`, both capture helpers and the selected eligibility/lineage/version helpers do not concatenate runtime client/source IDs, raw filters or user-provided identifier/ordering strings. Neither of the two audited files uses `sql.raw` or hidden concatenated query text to move a counted expression beyond the gate. There was no query rewrite to evade detection.

The actor wrapper's tenant and persisted role use `set_config` bind parameters. Its additional session-switch fragment calls `switchPinTerms(true)` with a literal boolean; enforcement is mapped to the closed values `'on'` or `''`, and bypass/admin switches are reset to fixed empty strings. Raw environment or client values do not become session-setting syntax. This is relevant dependency review, not a claim that RLS prevents SQL injection; the gate correctly treats injected SQL as cross-tenant critical.

## Decision boundary and separate semantic observation

These are ten fixed SQL syntax fragments rather than ten dynamic data values. A narrowly reasoned, file-specific baseline entry for exactly 8 and 2 sites is supported by this assembly review if the lead uses the gate's existing documented fixed-code identifier/placeholder exception. Guard fragments are expressions, not bindable values, so the reason must name their actual fixed origins rather than call them parameterized data. No baseline adjustment was performed here; wholesale baseline regeneration, relaxation of the gate, or a generic future allowance is not recommended.

Separate from injection safety, capture discovery's current join/check compares a non-null `client_workspace_id` with `projects.id`. The upstream canonical recorded-source helper distinguishes a program's actual `clientWorkspaceId` from a legacy numeric chat capture resolved through its exact artifact/file association. Canonical upload-parent admission still checks every candidate before counting, so this observation does not identify an SQL injection bypass. It can affect discovery of legitimate workspace-bound captures and was sent to the lead for parent/catalog reconciliation. This SQL text audit does not establish equivalence of those domain parent semantics. Any reconciliation changing the audited sources must receive refreshed hashes and review.

This is a source-bound static assembly audit. It is not a taint-analysis gate, SQL-role RLS proof, concurrent database qualification, deployment attestation, provider-delivery proof or agency acceptance evidence. The existing gate intentionally misses general preassembled-variable and concatenation shapes; the audit checked those reached shapes in this bounded scope, not every server file.
