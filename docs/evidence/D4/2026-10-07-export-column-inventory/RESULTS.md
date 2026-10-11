# W3 / D4 — tenant export column inventory

Four decisions implement the existing D6 tenant-return policy. Two columns are
visibly withheld: `licenses.access_token` and
`c2c_mailbox_connections.token_reference`. Two remain customer data:
`stab_exports.tokens` and `audit_events.hmac_seal`. Every other production byte
is unchanged. Discovery, tenant predicates, export schema/receipts, null handling,
truncation, purge gates and the complete native schema guard stay intact.

## Source decisions

`SOURCE-AUDIT.json` ties the decisions to declarations and writers. P.8 tokens
are an explicit object of study facts rendered into regulatory markdown. The
audit seal is the integrity output; its secret key is held outside the row.
Mailbox references are caller-supplied opaque authentication/store strings, so
withholding follows the existing gateway secret-reference decision. Historical
license access tokens were generated randomly and accepted as bearer credentials
by the removed route at `830ad35ea9c48daa4ddb79fea7a93ddb13c17796^`. Their current
replayability was not established. No credential value is printed or committed.

## Verification

- Before the policy edit: the expanded real export suite fails 3 cases and passes
  7. The failures are credential material anywhere in the export, license token
  withholding and mailbox-reference withholding. `EXPORT-RED.txt`, exit 1.
- After: six related existing export suites pass 44 cases, zero skipped. The
  expanded PGlite export suite contains 10 cases. It proves markers, nulls,
  retained license/mailbox metadata, unchanged P.8 JSON and integrity seals,
  tenant isolation in all four tables, and no credential value in exported JSON.
  Existing vault coverage, purge coverage, receipt handling, route error
  containment and read-failure reporting remain exercised. `EXPORT-GREEN.txt`.
- The unchanged native loader, actual discovery SQL and inventory assertion run
  over a deliberately isolated four-table PGlite catalog. Before: all four typed
  columns are undecided and the assertion exits 1. After: 6 controls pass — the
  classified catalog, removal of each decision refused, and a new unclassified
  credential column refused. `INVENTORY-RED.json` / `INVENTORY-GREEN.json`.
- Native isolation guard still covers all 150 physical native test files.
  `SCOPE.json` pins the complete native guard and proves only four production
  dictionary entries were added; `LINT-COMPARISON.json` records scoped lint.

The historical native artifact exposes only `stab_exports.tokens` and truncates
three other names. Static source narrowing and the isolated four-table controls
do not prove a complete fully migrated native inventory. Exact-source native
PostgreSQL/RLS/HTTP rerun and semantic compiler remain independent required
GitHub gates. The base CI secret scan also fails and requires its own diagnosis;
this delivery does not alter secret-scan rules or any approval/security baseline.
No full local compiler runs on the 8-GiB host. Normal commit checks and unchanged
pre-push gates run before the explicitly deferred remote compiler stage.

## Reproduction

Copy `REPRODUCER.mjs.txt` to a scratch `.mjs` file and run it from a checkout
with its existing dependencies installed, or set `C2C_REPO` to that checkout.
`node /scratch/repro.mjs --red` reads the exact base decision dictionaries and
must exit 1 naming four undecided columns. Without `--red`, the current source
must exit 0 with six controls. The native schema-size, stale-entry and overlap
cases remain in the unchanged native suite for the full provisioned CI database;
they are not claimed as covered by this focused four-table reproducer.
