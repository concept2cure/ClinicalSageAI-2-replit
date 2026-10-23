# Correct backfill source preservation — D2 / W2

## What already exists

The existing Vault backfill invokes the canonical chunk writer, exact-source context verifier and tenant CLI wrapper. This increment corrects the caller's trimmed source argument, preserving all existing gates and policies. [INVENTORY.md](INVENTORY.md) records discovery and [CONTRACT.md](CONTRACT.md) specifies behavior and limits.

## Initial evidence status (historical)

Discovery and contract are recorded before test/production edits. Independent approval, fail-first tests, qualification and normal direct canonical publication are pending. This initial record claims no implementation, test pass, production repair, deployment or agency acceptance.

## Qualified fail-first freeze

Three independently authored new suites execute **27 cases: 10 semantic assertion failures and 17 passing controls**, zero skips, on unchanged production. `root/red-qualified*` retains exact commands, hashes, JSON/raw output and exit status; `frozen-tests.json` pins all three files. All 24 selected baseline inputs remain unchanged. New tests have zero lint warnings/errors.

The earlier authoring run (`root/red.command.json`, `root/red.results.json`, `root/red.txt`) contained three PGlite leading-BOM transport fixture failures, including a dry-run control. It is not the qualifying baseline. `root/pglite-leading-bom-probe.json` independently proves SQL UTF-8 bytes retain the leading BOM while the PGlite returned field omits it; a BOM behind CRLF round-trips. Before freeze, SQL fixtures moved the BOM behind leading CRLF and added pre-apply source round-trip assertions, with no pool-result normalization or removed assertions. SQL proof therefore covers a BOM after leading whitespace; initial-BOM handoff remains separately covered through controlled writer/provider seams. Worker evidence identifies actual versus synthetic boundaries. No native RLS or live-provider result is claimed.
