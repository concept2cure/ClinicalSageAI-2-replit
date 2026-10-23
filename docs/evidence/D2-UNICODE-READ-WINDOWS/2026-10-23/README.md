# AnA Unicode read-window correction — D2 / W2

## What already exists

The registered read_project_document handler in `server/services/ana/document-catalog-tools.ts`, its shared fitter/settlement in `read-receipts.ts`, host whole-or-nothing budgets and guarded receipt writer already exist. This increment corrects their existing window/receipt alignment for complete surrogate pairs; it adds no reader, tool or store. [INVENTORY.md](INVENTORY.md) records discovery and [CONTRACT.md](CONTRACT.md) records the accepted behavior.

## Current evidence status

Inventory, contract and selected baseline hashes were recorded before tests/production edits. New tests and publication proof will be added only as executed. No qualification, push or deployment result is claimed by this initial record.
