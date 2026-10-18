# Read-only processing SQL interpolation review

Scope: the three processing files flagged by the canonical pre-push SQL ratchet, their SQL-composition dependencies, and the values passed to their query clients. No application, CI gate or baseline was edited. The accompanying `PROCESSING_SQL_INTERPOLATION_INVENTORY.json` records **13 exact source/dependency hashes**, every query call and every interpolated template in the three targets. The gate's counting algorithm was reproduced using its unchanged comment stripper rather than importing the gate's executable top level.

Finding: **no request, source-content, database-row value or other runtime data is interpolated into executable SQL text in the reviewed call graph.** The **16 counted expressions** are closed structural SQL or canonical predicate composition: **3 store, 9 sweep, 4 persistence**. Their exception basis is narrowly the described structural composition, not permission to introduce another interpolation or treat arbitrary inputs to exported SQL generators as safe. This review is static evidence, not a new deployment/runtime-role qualification.

## All counted sites

| File / expression line | Count | Expression | Classification and reason |
| --- | ---: | --- | --- |
| `data-room-processing-store.ts:100` | 1 | `capturedDataEligibleSql('s')` | Canonical captured-data and recorded-ancestry predicate; literal alias `s`, fixed captured kind. Source/org values remain `$1/$2`. |
| `data-room-processing-store.ts:101` | 1 | `capturedBinaryAvailableSql('s')` | Canonical original-availability/ancestry predicate with literal alias `s`; no runtime original path or hash is inserted into text. |
| `data-room-processing-store.ts:113` | 1 | `uploadedBinaryAvailableSql('f')` | Canonical upload/recorded-ancestry predicate with literal alias `f`; upload ID and organization are bound parameters. |
| `data-room-processing-sweep.ts:137` | 1 | `select` | Local immutable SQL expression assembled at125 from a fixed SELECT, `expectedIdentitySql()` and `originalAdmissionSql()`. They read JSON/row values as SQL expressions; they never turn those values into new SQL text. |
| `data-room-processing-sweep.ts:137` | 1 | `join` | Local fixed `FROM ... LEFT JOIN ...` literal declared123. Recorded upload/org equality stays in SQL. |
| `data-room-processing-sweep.ts:137` | 1 | `base` | Local fixed tenant/source-type predicate declared124. Organization remains `$1`. |
| `data-room-processing-sweep.ts:137` | 1 | `ordinary` | Local fixed live/current source predicate declared122. |
| `data-room-processing-sweep.ts:137` | 1 | `run` | `runnableSql(opts.retryFailed === true)`: validated boolean selects only closed SQL arms. The option string/value is never interpolated. |
| `data-room-processing-sweep.ts:138` | 1 | `healthy` | Module-local predicate from literal `persistedTextAvailableSql('s')` plus a fixed extraction-status list. |
| `data-room-processing-sweep.ts:138` | 1 | `S` | Module-local fixed JSON column path `s.metadata->'dataRoomProcessing'`. |
| `data-room-processing-sweep.ts:138` | 1 | `validStageSql()` | Module-private stage-validation predicate assembled only from fixed JSON keys, timestamp shapes, a trusted literal reason-code vocabulary and fixed SQL builders. |
| `data-room-processing-sweep.ts:138` | 1 | `text('state')` | Module-private JSON-key helper receives the literal `state`, never an option or row value. |
| `data-room-processing.ts:211` | 1 | `persistedTextAvailableSql()` | Canonical whitespace/readability predicate; absent alias chooses fixed `extracted_text` column. |
| `data-room-processing.ts:212` | 1 | `persistedTextAvailableSql()` | Same fixed predicate, preserving existing readable text if the new extraction is null. |
| `data-room-processing.ts:213` | 1 | `persistedTextAvailableSql()` | Same fixed predicate, preserving the corresponding character count. |
| `data-room-processing.ts:214` | 1 | `persistedTextAvailableSql()` | Same fixed predicate, preserving the corresponding page count. |

## Gate-blind variable SQL and all runtime values

The gate deliberately does not see a template first assigned to a variable. That path was reviewed too: sweep lines125–128 build the ordinary candidate or exact-source query from the same fixed fragments and bind `[org, opts.sourceId ?? report.limit]`. An explicit source ID selects the exact-source shape; it is not pasted into the shape. The omitted-diagnostics query at137 binds `[org, report.diagnosticLimit + 1, found.rows.map(r => Number(r.id))]` to `$1/$2/$3`; rows and limits never become SQL text. Organization/source IDs must be positive safe int32 values. Limits are safe integers1–500, diagnostics are bounded50, and `retryFailed`/`apply` must be booleans. Retry chooses only `TRUE`, `FALSE`, a fixed failed-status arm, the fixed attempt budget, or fixed time/retryability predicates.

All fourteen store query sites are inventoried. BEGIN/COMMIT/ROLLBACK, lock modes, timeouts and database-clock reads are fixed statements. Source/org/program/workspace/upload identities are bound. Claim and completion UPDATEs bind stage JSON, attempt ID, lease time, original hash, original storage reference, scope and upload ID. The filesystem prefix template at52 is not SQL. `lockDocumentDispositionProgram` composes the organization/program lock key as a **bound** `$1` value; a string key does not become SQL syntax.

The persistence UPDATE at209 has `$1`–`$25` for runtime values: source/org IDs; extraction status/text/counts; declared version; serialized provenance and metadata; product/indication/phase/application/agency/registry/date/study facts; attempt ID; original hash/program/workspace/storage/upload identity; and lease deadline. `textValues`, `processingProvenance`, `factsMetadata` and `factValues` construct parameter values only. The second query at348 resolves tenant UUID with organization bound as `$1`. Related `catalog-facts.ts` program/study reads and Vault-view reads also bind their org/program/search-key data; dataset profiling has no query construction.

## Transitive structural trust

- `persistedTextAvailableSql` validates an optional identifier against `^[a-z_][a-z0-9_]*$`. In these paths its inputs are only `undefined` or literal `s`; the inserted column is fixed. ECMAScript whitespace is a fixed SQL Unicode literal.
- `eligibility.ts` validates aliases with the same identifier restriction. The processing paths call its captured/upload generators with literal `s`/`f`. Kind, column names (`checksum`, `checksum_sha256`, parent/source/program IDs), linked JSON keys and binary/data choice clauses come from closed source-code branches, not request fields.
- Recorded-lineage composition receives fixed captured/upload kinds, validated aliases and internally assembled seed SQL. Intermediate traversal aliases (`w`, `p`, `f`, `e`, `rw`, and named correlated aliases) are code literals. `integerIdentity` receives internal SQL expressions such as `e.id`, not the runtime value stored there. `recordedLineageRowsSql(seedSql)` receives closed seed SQL in this chain. The depth limit is the module-local numeric literal64. Actual stored IDs, hashes, provenance and audit payloads remain column values evaluated by SQL. The separate recorded-upload reader's seed uses `$1/$2/$3` placeholders for its runtime values.
- Sweep JSON field helpers `text`, `value` and `time` are not exported; all their field arguments are source literals: `version`, `stage`, `processorRevision`, `identity`, `attemptId`, `attempts`, `claimedAt`, `retryable`, `reasonCode`, `state`, `leaseExpiresAt`, `completedAt`, `nextRetryAt`. Timestamp metadata is validated before casts; no metadata string is appended to SQL text.
- The20 processing reason codes are uppercase/underscore literals in `shared/data-room-processing-status.ts`. All repository references were checked: they read `.includes`, `.map`, or construct a Set; no writer/mutator or request-controlled replacement was found. **This exported array is TypeScript-readonly (`as const`), not runtime-frozen with `Object.freeze`.** The current exception therefore rests on a trusted literal constant and its inspected read-only use graph. It must not be described as a runtime immutability guarantee. Future mutation, arbitrary generator arguments or a new JSON-field source would require a fresh review.

The narrow documented exception counts are3/9/4. Increasing counts or introducing runtime text requires its own justification or parameterization; this review does not authorize a mass baseline write. The lead retains responsibility for recording a written reason in any narrowly approved baseline change and its commit, as required by the ratchet's own instructions.
