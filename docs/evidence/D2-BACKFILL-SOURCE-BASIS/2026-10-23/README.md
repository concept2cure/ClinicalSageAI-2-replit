# Correct backfill source preservation — D2 / W2

## What already exists

The existing Vault backfill invokes the canonical chunk writer, exact-source context verifier and tenant CLI wrapper. This increment corrects the caller's trimmed source argument, preserving all existing gates and policies. [INVENTORY.md](INVENTORY.md) records discovery and [CONTRACT.md](CONTRACT.md) specifies behavior and limits.

## Initial evidence status (historical)

Discovery and contract are recorded before test/production edits. Independent approval, fail-first tests, qualification and normal direct canonical publication are pending. This initial record claims no implementation, test pass, production repair, deployment or agency acceptance.
