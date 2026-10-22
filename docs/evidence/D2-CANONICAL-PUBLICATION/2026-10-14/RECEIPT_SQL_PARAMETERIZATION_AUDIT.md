# Read-only receipt SQL interpolation audit

At the source hashes recorded in `RECEIPT_SQL_PARAMETERIZATION_AUDIT.json`, both gate failures are generated SQL structure. No external value or external identifier is interpolated into SQL text in the two reviewed modules. All runtime metadata and filter values use the query parameter array. No application, baseline or gate was edited, and no database query was executed by this audit.

## Counted expressions and the variable-query blind spot

`source-admission-receipt-store.ts:92` has one counted expression: `${COLUMNS}` in the idempotent lookup. `COLUMNS` is a module-local, unexported `const` initialized at lines 20–22 with exactly 16 literal column names. It has no input, configuration or row-derived component. Receipt ID, organization and actor are `$1`, `$2`, `$3` values.

The audit also includes the gate's known blind spot: `q.query(INSERT, valuesOf(...))` at line 84. The `INSERT` constant at lines 23–25 interpolates the same literal column list twice, in its column list and `RETURNING`. Its table, casts, conflict action and all 16 placeholders are fixed. Receipt/organization/version/checkpoint/actor/role/program/document/source hashes/total/ranges JSON/payload/context/fingerprint occupy `$1` through `$16`; none supplies SQL text or an identifier. The strict shared descriptor validator makes private primitive/range copies before fingerprint awaits. SQL safety comes from binding even for text metadata containing punctuation.

`source-admission-receipt-history.ts:84` has one counted expression: `${exact}`. The local fragment starts empty at line 78 and has only two writers, lines 79–80. Each appends a fixed column predicate and a placeholder number from the length of the fresh local parameter array. The optional UUID value is pushed separately. No supplied UUID, actor ID, program ID, limit or string is copied into SQL text.

## Optional filter behavior

The base bindings are organization `$1`, actor `$2`, the canonical program UUID array `$3`, and limit `$4`. With no IDs the fragment is empty. A document-only filter uses `r.document_id=$5::uuid`; a receipt-only filter uses `r.id=$5::uuid`; both use document `$5` and receipt `$6`. An empty accessible-program array remains the bound `ANY($3::uuid[])` predicate and cannot become organization-wide scope.

Only `undefined` omits an optional ID. `null`, blank/whitespace strings, booleans and malformed UUIDs fail with the controlled HTTP 400 filter error; valid uppercase UUIDs are normalized and bound. Limits default to 50 or must be safe integers 1–200 and remain bound. Unsupported enumerable string filter keys fail validation. Actor history is composed through the canonical actor-access wrapper, with current role/project admission and revalidation before COMMIT; the internal same-q primitive relies on that caller contract.

## Narrow exception reason and limits

If the lead records the existing gate's permitted written-reason exception, the audited count is **one per file**, for the fixed column list and generated bound-placeholder fragment described above. This is not permission for input-dependent identifiers, additional interpolations or a bulk baseline rewrite. The audit covers all three query calls and their local SQL construction, including the uncounted `INSERT`. The gate remains blind to variable-built SQL, so the count alone is not a future semantic safety guarantee.

This is a source inspection of SQL parameterization and the stated dependency contracts. It is not a new authorization, RLS, database execution, deployed-security or regulatory qualification. Full publication gates remain the lead's responsibility.
