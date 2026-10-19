# Independent catalog SQL interpolation audit

All **32 expressions** counted in the six catalog files are fixed SQL structure or locally generated bind placeholders. No runtime data value is copied into SQL text at these sites. The original gate regular expression and an independent TypeScript AST traversal agree on every per-file count. No application code, baseline, gate or Git state was changed by this audit.

## Complete counted-site inventory

Runtime organization/actor/document/program IDs, UUID arrays, SHA strings, source text, JSON key data, query vectors, thresholds and limits stay in the separate query values array. Canonical helpers receive the literal alias `d`. A dynamic option selects a finite SQL branch; it supplies no SQL text.

| File | Current baseline | Audited count | SHA-256 |
| --- | ---: | ---: | --- |
| `server/services/vault/document-catalog-document.ts` | 7 | 14 | `8259e35dfdde38e0d65d95deb388c1e3452dd715156387da8b88480bd83a303d` |
| `server/services/vault/document-catalog.service.ts` | 3 | 4 | `8218f77e10b617cd55739115d7c043f01ada0e8d04917f5555ccb6a53f92dffc` |
| `server/services/vault/document-catalog-governance.service.ts` | 0 | 3 | `ff609d34de4f3cabf3ad0240623642a24bf77976f042228b96b3db58ddcbd213` |
| `server/services/vault/document-catalog-search-query.ts` | 0 | 7 | `ce8692877f708ff877ffb51f72c5d513afb062106c9bb2503a897eb442bb4903` |
| `server/services/vault/document-catalog-admission.ts` | 0 | 1 | `0022f748129fa42a43c3a193cf5fae16d23bd9ad2f6e72eaae489119cde8b360` |
| `server/services/vault/document-catalog-write-integrity.ts` | 0 | 3 | `d42cec7319a919965099af8c3920d564bcdc8b05790448aa39dc375001a29a20` |

The baseline column records its value at audit time; it is evidence of the blocked comparison, not authorization to change the gate.

### server/services/vault/document-catalog-document.ts

Exact source bytes: 15295. Scanner 14; TypeScript AST 14; `sql.raw` calls 0.

| Site | Function | Expression | Classification | Bound values |
| --- | --- | --- | --- | --- |
| 1, line 72:60 | `admittedProgram` | `vaultDataEligibleSql('d')` | `canonical_predicate` | `[documentId, organizationId]` |
| 2, line 72:88 | `admittedProgram` | `currentClause` | `finite_literal_clause` | `[documentId, organizationId]` |
| 3, line 106:57 | `loadDocumentForOrg` | `textCol` | `finite_literal_projection` | `[documentId, organizationId, programId]` |
| 4, line 107:15 | `loadDocumentForOrg` | `vaultDispositionChoiceSql('d')` | `canonical_predicate` | `[documentId, organizationId, programId]` |
| 5, line 108:15 | `loadDocumentForOrg` | `vaultBinaryAvailableSql('d')` | `canonical_predicate` | `[documentId, organizationId, programId]` |
| 6, line 117:15 | `loadDocumentForOrg` | `vaultDataEligibleSql('d')` | `canonical_predicate` | `[documentId, organizationId, programId]` |
| 7, line 117:43 | `loadDocumentForOrg` | `currentClause` | `finite_literal_clause` | `[documentId, organizationId, programId]` |
| 8, line 217:57 | `loadDocumentForAdmittedScope` | `textCol` | `finite_literal_projection` | `params` |
| 9, line 218:15 | `loadDocumentForAdmittedScope` | `vaultDispositionChoiceSql('d')` | `canonical_predicate` | `params` |
| 10, line 219:15 | `loadDocumentForAdmittedScope` | `vaultBinaryAvailableSql('d')` | `canonical_predicate` | `params` |
| 11, line 220:19 | `loadDocumentForAdmittedScope` | `supersededSql('d')` | `canonical_predicate` | `params` |
| 12, line 228:81 | `loadDocumentForAdmittedScope` | `vaultDataEligibleSql('d')` | `canonical_predicate` | `params` |
| 13, line 228:109 | `loadDocumentForAdmittedScope` | `programClause` | `generated_bind_placeholder_clause` | `params` |
| 14, line 228:125 | `loadDocumentForAdmittedScope` | `currentClause` | `finite_literal_clause` | `params` |

Reasons for every site in this file:

- Line 72:60, `vaultDataEligibleSql('d')`: Literal alias d passes eligibility.alias identifier validation; eligible(vault,d,false) and matching(vault,d) contain only fixed vault column names, fixed disposition choices and correlated column references. No caller value enters generated text.
- Line 72:88, `currentClause`: Empty text or fixed AND NOT plus supersededSql(d). currentOnly selects a finite SQL branch and is never copied into SQL text; every alias is literal d.
- Line 106:57, `textCol`: Only d.extracted_text or NULL::text AS extracted_text. includeText selects a fixed projection; its runtime value is not serialized into SQL.
- Line 107:15, `vaultDispositionChoiceSql('d')`: Literal alias d passes eligibility.alias validation; matching(vault,d) uses fixed vault column names and the ordered disposition projection is constant SQL.
- Line 108:15, `vaultBinaryAvailableSql('d')`: Literal alias d passes eligibility.alias validation; eligible(vault,d,true) selects fixed absence-of-disposition SQL. Source IDs/hashes remain column references, not interpolated JavaScript values.
- Line 117:15, `vaultDataEligibleSql('d')`: Literal alias d passes eligibility.alias identifier validation; eligible(vault,d,false) and matching(vault,d) contain only fixed vault column names, fixed disposition choices and correlated column references. No caller value enters generated text.
- Line 117:43, `currentClause`: Empty text or fixed AND NOT plus supersededSql(d). currentOnly selects a finite SQL branch and is never copied into SQL text; every alias is literal d.
- Line 217:57, `textCol`: Only d.extracted_text or NULL::text AS extracted_text. includeText selects a fixed projection; its runtime value is not serialized into SQL.
- Line 218:15, `vaultDispositionChoiceSql('d')`: Literal alias d passes eligibility.alias validation; matching(vault,d) uses fixed vault column names and the ordered disposition projection is constant SQL.
- Line 219:15, `vaultBinaryAvailableSql('d')`: Literal alias d passes eligibility.alias validation; eligible(vault,d,true) selects fixed absence-of-disposition SQL. Source IDs/hashes remain column references, not interpolated JavaScript values.
- Line 220:19, `supersededSql('d')`: supersededSql receives the source-code literal d; its sole transitive VALID_LINK invocation receives literal succ and trusted literal d. Both names and every lineage condition are fixed at these audited call sites.
- Line 228:81, `vaultDataEligibleSql('d')`: Literal alias d passes eligibility.alias identifier validation; eligible(vault,d,false) and matching(vault,d) contain only fixed vault column names, fixed disposition choices and correlated column references. No caller value enters generated text.
- Line 228:109, `programClause`: Starts empty; optional fixed program equality and ANY predicates use only locally generated $n from params.length. Program UUID and copied allowed-program array are pushed into the separate values array. With the present definitions, placeholders are only $3 and $4.
- Line 228:125, `currentClause`: Empty text or fixed AND NOT plus supersededSql(d). currentOnly selects a finite SQL branch and is never copied into SQL text; every alias is literal d.

### server/services/vault/document-catalog.service.ts

Exact source bytes: 36497. Scanner 4; TypeScript AST 4; `sql.raw` calls 0.

| Site | Function | Expression | Classification | Bound values |
| --- | --- | --- | --- | --- |
| 15, line 464:15 | `listProjectDocumentsRaw` | `vaultDispositionChoiceSql('d')` | `canonical_predicate` | `params` |
| 16, line 465:15 | `listProjectDocumentsRaw` | `vaultBinaryAvailableSql('d')` | `canonical_predicate` | `params` |
| 17, line 479:67 | `listProjectDocumentsRaw` | `vaultDataEligibleSql('d')` | `canonical_predicate` | `params` |
| 18, line 479:96 | `listProjectDocumentsRaw` | `programFilter` | `generated_bind_placeholder_clause` | `params` |

Reasons for every site in this file:

- Line 464:15, `vaultDispositionChoiceSql('d')`: Literal alias d passes eligibility.alias validation; matching(vault,d) uses fixed vault column names and the ordered disposition projection is constant SQL.
- Line 465:15, `vaultBinaryAvailableSql('d')`: Literal alias d passes eligibility.alias validation; eligible(vault,d,true) selects fixed absence-of-disposition SQL. Source IDs/hashes remain column references, not interpolated JavaScript values.
- Line 479:67, `vaultDataEligibleSql('d')`: Literal alias d passes eligibility.alias identifier validation; eligible(vault,d,false) and matching(vault,d) contain only fixed vault column names, fixed disposition choices and correlated column references. No caller value enters generated text.
- Line 479:96, `programFilter`: Starts empty; optional fixed program equality/ANY clauses use locally generated $3/$4, and currentOnly adds fixed supersededSql(d). All actual program IDs/arrays are values-array binds, never clause text.

### server/services/vault/document-catalog-governance.service.ts

Exact source bytes: 30417. Scanner 3; TypeScript AST 3; `sql.raw` calls 0.

| Site | Function | Expression | Classification | Bound values |
| --- | --- | --- | --- | --- |
| 19, line 573:15 | `readCatalogRecord` | `vaultDataEligibleSql('d')` | `canonical_predicate` | `[args.documentId, args.programId, args.organizationId]` |
| 20, line 573:62 | `readCatalogRecord` | `vaultBinaryAvailableSql('d')` | `canonical_predicate` | `[args.documentId, args.programId, args.organizationId]` |
| 21, line 574:15 | `readCatalogRecord` | `supersededSql('d')` | `canonical_predicate` | `[args.documentId, args.programId, args.organizationId]` |

Reasons for every site in this file:

- Line 573:15, `vaultDataEligibleSql('d')`: Literal alias d passes eligibility.alias identifier validation; eligible(vault,d,false) and matching(vault,d) contain only fixed vault column names, fixed disposition choices and correlated column references. No caller value enters generated text.
- Line 573:62, `vaultBinaryAvailableSql('d')`: Literal alias d passes eligibility.alias validation; eligible(vault,d,true) selects fixed absence-of-disposition SQL. Source IDs/hashes remain column references, not interpolated JavaScript values.
- Line 574:15, `supersededSql('d')`: supersededSql receives the source-code literal d; its sole transitive VALID_LINK invocation receives literal succ and trusted literal d. Both names and every lineage condition are fixed at these audited call sites.

### server/services/vault/document-catalog-search-query.ts

Exact source bytes: 3608. Scanner 7; TypeScript AST 7; `sql.raw` calls 0.

| Site | Function | Expression | Classification | Bound values |
| --- | --- | --- | --- | --- |
| 22, line 20:65 | `queryCatalogMeaningIndex` | `vaultDataEligibleSql('d')` | `canonical_predicate` | `countParams` |
| 23, line 21:17 | `queryCatalogMeaningIndex` | `supersededSql('d')` | `canonical_predicate` | `countParams` |
| 24, line 22:59 | `queryCatalogMeaningIndex` | `countAllowed` | `generated_bind_placeholder_clause` | `countParams` |
| 25, line 29:15 | `queryCatalogMeaningIndex` | `vaultBinaryAvailableSql('d')` | `canonical_predicate` | `hitParams` |
| 26, line 35:42 | `queryCatalogMeaningIndex` | `vaultDataEligibleSql('d')` | `canonical_predicate` | `hitParams` |
| 27, line 36:19 | `queryCatalogMeaningIndex` | `supersededSql('d')` | `canonical_predicate` | `hitParams` |
| 28, line 38:61 | `queryCatalogMeaningIndex` | `hitAllowed` | `generated_bind_placeholder_clause` | `hitParams` |

Reasons for every site in this file:

- Line 20:65, `vaultDataEligibleSql('d')`: Literal alias d passes eligibility.alias identifier validation; eligible(vault,d,false) and matching(vault,d) contain only fixed vault column names, fixed disposition choices and correlated column references. No caller value enters generated text.
- Line 21:17, `supersededSql('d')`: supersededSql receives the source-code literal d; its sole transitive VALID_LINK invocation receives literal succ and trusted literal d. Both names and every lineage condition are fixed at these audited call sites.
- Line 22:59, `countAllowed`: Only empty text or fixed ANY($3::uuid[]) SQL. countParams starts with two items; push of the copied allowed-program array returns 3. Array contents are sent separately as bound value 3.
- Line 29:15, `vaultBinaryAvailableSql('d')`: Literal alias d passes eligibility.alias validation; eligible(vault,d,true) selects fixed absence-of-disposition SQL. Source IDs/hashes remain column references, not interpolated JavaScript values.
- Line 35:42, `vaultDataEligibleSql('d')`: Literal alias d passes eligibility.alias identifier validation; eligible(vault,d,false) and matching(vault,d) contain only fixed vault column names, fixed disposition choices and correlated column references. No caller value enters generated text.
- Line 36:19, `supersededSql('d')`: supersededSql receives the source-code literal d; its sole transitive VALID_LINK invocation receives literal succ and trusted literal d. Both names and every lineage condition are fixed at these audited call sites.
- Line 38:61, `hitAllowed`: Only empty text or fixed ANY($6::uuid[]) SQL. hitParams starts with five items; push of the copied allowed-program array returns 6. Array contents are bound separately.

### server/services/vault/document-catalog-admission.ts

Exact source bytes: 5891. Scanner 1; TypeScript AST 1; `sql.raw` calls 0.

| Site | Function | Expression | Classification | Bound values |
| --- | --- | --- | --- | --- |
| 29, line 33:9 | `catalogMembershipRole` | `opts.hold ? 'FOR SHARE OF ou, u, o' : ''` | `finite_literal_lock_clause` | `[args.userId, args.organizationId]` |

Reasons for every site in this file:

- Line 33:9, `opts.hold ? 'FOR SHARE OF ou, u, o' : ''`: hold selects exactly FOR SHARE OF ou, u, o or empty text. No option, actor ID, organization ID or role string is copied into the statement. Actor and organization IDs remain $1/$2 binds.

### server/services/vault/document-catalog-write-integrity.ts

Exact source bytes: 5439. Scanner 3; TypeScript AST 3; `sql.raw` calls 0.

| Site | Function | Expression | Classification | Bound values |
| --- | --- | --- | --- | --- |
| 30, line 30:15 | `lockedCatalogSource` | `vaultDataEligibleSql('d')` | `canonical_predicate` | `[args.documentId, args.programId, args.organizationId]` |
| 31, line 30:62 | `lockedCatalogSource` | `vaultBinaryAvailableSql('d')` | `canonical_predicate` | `[args.documentId, args.programId, args.organizationId]` |
| 32, line 31:15 | `lockedCatalogSource` | `supersededSql('d')` | `canonical_predicate` | `[args.documentId, args.programId, args.organizationId]` |

Reasons for every site in this file:

- Line 30:15, `vaultDataEligibleSql('d')`: Literal alias d passes eligibility.alias identifier validation; eligible(vault,d,false) and matching(vault,d) contain only fixed vault column names, fixed disposition choices and correlated column references. No caller value enters generated text.
- Line 30:62, `vaultBinaryAvailableSql('d')`: Literal alias d passes eligibility.alias validation; eligible(vault,d,true) selects fixed absence-of-disposition SQL. Source IDs/hashes remain column references, not interpolated JavaScript values.
- Line 31:15, `supersededSql('d')`: supersededSql receives the source-code literal d; its sole transitive VALID_LINK invocation receives literal succ and trusted literal d. Both names and every lineage condition are fixed at these audited call sites.

## Transitive fragment audit

`vaultDataEligibleSql`, `vaultBinaryAvailableSql` and `vaultDispositionChoiceSql` are exported from the hashed `eligibility.ts` dependency. Each audited call uses the source literal `d`. `alias` rejects characters outside `/^[a-z_][a-z0-9_]*$/i`; the generated variable names derive from the trusted constant kind `vault`. `matching` chooses `program_id`, `vault_document_id`, `vaultDocumentIds` and `content_hash` from fixed code alternatives and refers to database columns. `eligible` chooses a fixed disposition filter from an internal boolean. No request, document field, actor role or search term is joined into these returned fragments.

Although `eligibility.ts` imports `recordedLineageEligibleSql`, the three vault helpers reviewed here do not call it. Its hash is recorded to distinguish that nonexecuted imported dependency from the executed vault branch. This review does not certify unrelated captured/upload/artifact helpers.

`supersededSql` receives literal `d` in every reviewed catalog call and in each `currentClause` builder. Its transitive `VALID_LINK` call receives literal `succ` and this trusted literal `d`; fixed column comparisons define live successor eligibility. `supersededSql` itself lacks general alias validation, so this conclusion is restricted to those literal call sites and does not authorize future runtime alias inputs.

`textCol` has exactly two alternatives: `d.extracted_text` and `NULL::text AS extracted_text`. `currentClause` has exactly empty text or fixed `AND NOT` plus the literal-alias successor predicate. The admission lock clause has exactly empty text or `FOR SHARE OF ou, u, o`. Truthiness selects those alternatives without serializing the option.

`programClause` and `programFilter` start empty and concatenate only fixed equality/ANY/successor clauses. Their `$n` placeholders derive from the length of locally owned parameter arrays initialized with two entries, with at most two optional pushes: placeholders are `$3` or `$4`. `countAllowed` binds its UUID array at `$3`; `hitAllowed` binds its array at `$6`. Program IDs and array contents remain values binds.

Governance `SUGGEST` and `SUGGEST_WITH_VECTOR` are static UPDATE constants with fixed columns and placeholders `$1` through `$13`. The local `sql(true/false)` function selects one of those constants. Vector literals, key-data JSON, user attribution and hashes are query values. This preassembled-statement form is a documented blind spot in the count gate but was inspected as part of this audit.

`reserveCatalogWrite` calls `lockDocumentDispositionProgram`. Its composite organization/program lock key is passed as the separate `$1` value in fixed SQL; this template inside the parameter array is not SQL interpolation.

## Dependency bindings

| Dependency | Bytes | SHA-256 |
| --- | ---: | --- |
| `server/services/document-data-disposition/eligibility.ts` | 9446 | `b4d93194a0cdac02966b2b9bf0ca73e4dcf96fa6218ed259ecf4e469ce37db6f` |
| `server/services/document-data-disposition/recorded-lineage.ts` | 12701 | `b34a7050ca1868c339f8dbe10f0d60a50ea443b415fbadb820708005befa9733` |
| `server/services/vault/vault-version-family.ts` | 8142 | `196ba74c0214250ac6f10c4b5ec5c92194c89901d23be015dedeaeef7493b526` |
| `server/services/document-data-disposition/program-lock.ts` | 556 | `04862a0cc8becdb04267ec08975fdfc5063ca39001fa07ef2d440fdec6071a42` |
| `scripts/ci/check-sql-interpolation.mjs` | 5817 | `9e6271d2f24dbdc1f75d1e518f52375a5f679b8f3e91aab9236bbfa09ab30e85` |
| `scripts/ci/lib/strip-comments.mjs` | 5625 | `2887abc86d3f874c6c38c524e07e158a701a6945ef970bd1fea828275617aec1` |

## Review boundaries

- The ratchet is a coarse count and does not inspect value semantics or caller provenance.
- The gate cannot generally see preassembled SQL variables or string concatenation; this audit reviewed local clause builders and governance fixed UPDATE selection but is not a repository-wide injection proof.
- Counts and findings apply only to the exact hashed sources and listed helper dependencies.
- Fixed alias/fragment safety does not prove authorization, RLS effectiveness, regulatory compliance or provider delivery.
- No app, gate, baseline, branch, index or remote state is modified by this audit.

The exact inventory, source bindings and reasons are in `catalog-sql-interpolation-audit.json`. Reproduce with supported Node 22 and `node docs/evidence/D2-CANONICAL-PUBLICATION/2026-10-14/audit-catalog-sql-interpolations.mjs`. The audit runner has zero lint errors and zero warnings. This result supports a narrowly documented source-bound structural exception; it does not itself change or approve any baseline.
