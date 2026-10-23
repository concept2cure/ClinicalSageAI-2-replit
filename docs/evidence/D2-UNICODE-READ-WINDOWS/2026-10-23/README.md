# AnA Unicode read-window correction — D2 / W2

## What already exists

The registered read_project_document handler in `server/services/ana/document-catalog-tools.ts`, its shared fitter/settlement in `read-receipts.ts`, host whole-or-nothing budgets and guarded receipt writer already exist. This increment corrects their existing window/receipt alignment for complete surrogate pairs; it adds no reader, tool or store. [INVENTORY.md](INVENTORY.md) records discovery and [CONTRACT.md](CONTRACT.md) records the accepted behavior.

## Current evidence status

Inventory, contract and selected baseline hashes were recorded before tests/production edits. New tests and publication proof will be added only as executed. No qualification, push or deployment result is claimed by this initial record.

## Fail-first freeze

Four independently authored new test files execute **45 cases: 25 semantic failures and 20 passing controls**, zero skips, on unchanged production. Failures are 11 handler, six executor, five stream and three actual guarded-writer cases. Every failure is an assertion about behavior, with no fixture/import/runtime failure. `root/red*` retains exact commands, hashes, raw output and JSON results; [frozen-tests.json](frozen-tests.json) records the freeze. All17 selected baseline inputs and22 existing regression files stayed unchanged. The180-window corpus stops on its first baseline violation; full traversal is claimed only on a passing run.

The four frozen new test files have zero lint errors/warnings. An initial authoring-only max-params warning was corrected before the baseline run, without relaxing any rule. Original preparatory lint remains under `root/lint-authoring*`. Source/access and host receipt-store seams are synthetic where the worker scope files say so; the guarded-writer suite additionally executes actual legacy receipt INSERT/transaction SQL in owner-mode PGlite, without native RLS or live-provider claims.
