# D2 — the TaskBoard "Critical path" view no longer claims a calculation

**Row:** D2 Launch catalog (Projects / tasks). **Date:** 2026-09-24. **Session:** `session_01KnUGoX3g4R4FWKWGc2sTbN`.
Handed on by the vault/projects re-baseline (`docs/work-orders/README.md`, "→ Projects").

## 1. What was wrong

The view's header read **"Critical path — N tasks — computed from the `taskDependencies` DAG
(getCriticalPath)"**. What the view actually does is list the tasks a person flagged critical-path
(`unified_tasks.critical_path`, off by default) and order them by `dependsOn`. It weighs no
durations and finds no longest chain, and `getCriticalPath` has no caller in the client. A
reader was told a schedule calculation had run. The header also put two code identifiers in
front of the user.

## 2. What changed

The header reads "Critical path — N tasks marked critical-path, in dependency order", and the
code comment says the same. The list and its ordering are unchanged.

## 3. Proof

| | |
|---|---|
| `red/critical-path-header.txt` | Old header: fails on "computed". |
| `green/critical-path-header.txt` | 1 of 1. It also pins the dependency order: the task returned second but depended on shows first. Every TaskBoard test file: 7 files, 39 tests. |

## 4. Not done here

A computed critical path (durations and the longest chain over the dependency graph) does not
exist on this surface, and building one is new capability. Under RULE 2 that waits for the
launch rows. Two task stores (AnA, agency communications and the schedule never reach this
board) remain open and unclaimed on the work-order board.
