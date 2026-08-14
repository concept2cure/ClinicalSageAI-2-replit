# GA completion ledger — 2026-08

**One register for every open item across every space.** This file exists because work
has been dispatched, lost to a container restart, and silently forgotten more than once
in this effort. A ledger that lives in a session's memory is not a ledger.

## What this file is — and what it deliberately is not

The doctrine for this codebase is *there is never more than one of anything*. That
applies to tracking documents too, so this file **restates nothing**. It is an index:
one row per open item, each pointing at the document that actually owns the detail.

| Document | Owns |
|---|---|
| `docs/GA_OPS_PROCUREMENT_RUNBOOK_2026-08.md` | Blockers B1–B20 — the licensed assets, credentials and flags. The prose. |
| `scripts/ops/ga-readiness-report.mjs` | The *probe* for those blockers. Observation, not intention. |
| `docs/COMPETITIVE_LANDSCAPE_2026-08.md` | The 2026 market benchmark and the four-silo finding. |
| `docs/COMPETITIVE_POSITION_DELTA_2026-08.md` | Table stakes closed vs. open, per journey. |
| `docs/AUDIT_STORE_INVENTORY_2026-08.md` | All 81 audit-ish tables, per-table verdicts, the delete lists. |
| `docs/DOCUMENT_IDENTITY_CONTRACT_2026-08.md` | The approved identity contract (Option C), slices C1/C2. |
| **This file** | Which of all of the above is still open, who owns it, and how it proves itself done. |

Rows are checked mechanically by `node scripts/ops/ledger-check.mjs`, which fails when a
row cites a file that does not exist, claims `done` without evidence, or duplicates an ID.
A ledger that can rot silently is the problem it was written to solve.

## How to read a row

- **Owner** — `eng` work I do; `proc` purchase/credential, no code will conjure it;
  `qual` quality-system sign-off; `prod` a product/pricing decision that is not mine.
- **State** — `open`, `in-flight` (an agent or a person is on it *now*), `done`
  (evidence cited and passing), `blocked` (named on another row).
- **Evidence** — for `done`, the test or command that proves it. For everything else,
  the file where the work lands or the document that specifies it.

---

## 1. In flight

Work with a live owner right now. If a row here has no live agent and no recent commit,
it has been lost — re-dispatch it.

| ID | Item | Owner | State | Evidence |
|---|---|---|---|---|
| L1 | ESG transport gap (B16): re-point `mdx-command-handlers.ts` off the not-implemented `ESGSubmissionService.transmitToESG` onto the real AS2 in `server/services/submission-gateways/fda-esg.ts`, through the canonical governed transmit so preconditions travel with it | eng | in-flight | `server/services/submission-gateways/fda-esg.ts` |
| L2 | AnA performance assessment — latency path, context assembly, tool parallelism, model routing, pgvector index + pre-filter tenancy, pool sizing | eng | in-flight | `docs/ANA_PERFORMANCE_ASSESSMENT_2026-08.md` |
| L3 | E2E golden journeys for 510(k), CER, NDA — asserting honest refusals as first-class outcomes, not as failures | eng | in-flight | `tests/golden-journeys/` |

## 2. Engineering backlog — mine

Ranked. Every row here was at some point described as somebody else's problem; it is not.

| ID | Item | Owner | State | Evidence |
|---|---|---|---|---|
| L4 | Literature screening state — schema column + persistence, so screening/appraisal decisions survive the session. Currently reported honestly as absent rather than faked | eng | open | `docs/COMPETITIVE_POSITION_DELTA_2026-08.md` §CER |
| L5 | PMS complaint / PMCF enrolment backends — the generators and documentation status are live; the feeds behind them have no backend | eng | open | `docs/COMPETITIVE_POSITION_DELTA_2026-08.md` §CER |
| L6 | Standards mapping per product code — classification lookup is closed; the recognised-consensus-standards mapping is not | eng | open | `server/services/integrations/openfda-device-client.ts` |
| L7 | IQ/OQ validation pack — machine-generated installation/operational qualification evidence. The *mechanisms* are closed (single signature substrate, chained audit, §11.70 supersession); the evidence pack is not produced | eng + qual | open | `docs/GA_OPS_PROCUREMENT_RUNBOOK_2026-08.md` §B |
| L8 | Outcome-data capture — (submission content → agency response) pairs. The strongest moat in the benchmark and the only one no competitor can buy. Nothing captures it today | eng | open | `docs/COMPETITIVE_LANDSCAPE_2026-08.md` §moat |
| L9 | Template-chase ingestion pipeline — the substrate is right (versioned catalog, fail-closed registry); the ingestion is unbuilt | eng | open | `docs/COMPETITIVE_POSITION_DELTA_2026-08.md` §4 |

## 3. Consolidation debt — the D-items still open

| ID | Item | Owner | State | Evidence |
|---|---|---|---|---|
| L10 | **D8 C2** — attribute-free alias map, plus the CI gate that enforces the no-attributes invariant. C1 (the program anchor) shipped | eng | open | `docs/DOCUMENT_IDENTITY_CONTRACT_2026-08.md` |
| L11 | **Audit substrate decision** — `audit_logs` and `audit_events` are both canonical today, chained differently (application vs. trigger), scoped differently (global vs. per-org), and surfaced on two different screens showing disjoint histories. One must become the reference; the other needs a bridge | eng | open | `docs/AUDIT_STORE_INVENTORY_2026-08.md` §1.2 |
| L12 | **Chain-linkage of the 23 domain-history tables** — `linkDomainHistory` exists with **zero call sites**; every (b) table is chain-orphaned. Items 1–15 are one-line additions; 21–23 want a helper in their own service | eng | open | `docs/AUDIT_STORE_INVENTORY_2026-08.md` §1.3 |
| L13 | **43 dead audit tables** — no writer anywhere in the repo. Delete list is written; the deletion is not executed | eng | open | `docs/AUDIT_STORE_INVENTORY_2026-08.md` §5.1 |
| L14 | **11 write-only audit tables** — rows land, nothing reads them. Delete only with owner sign-off | eng + prod | open | `docs/AUDIT_STORE_INVENTORY_2026-08.md` §5.2 |

## 4. Not mine — but must not fall off the edge

These are real and they block a first real filing. They are tracked here so that "not
engineering" never becomes "not tracked".

| ID | Item | Owner | State | Evidence |
|---|---|---|---|---|
| L15 | Blockers B1–B20 — eSTAR templates + field maps, eCTD DTDs, LORENZ licence, gateway credentials, MedDRA, the enforcement flags | proc | open | `node scripts/ops/ga-readiness-report.mjs` |
| L16 | Consultant / CRO channel — multi-client workspaces and per-submission pricing. A product decision, unstarted | prod | open | `docs/COMPETITIVE_LANDSCAPE_2026-08.md` §moat |

---

## 5. The rule that keeps this file honest

A row moves to `done` when a command proves it, and the command goes in the Evidence
column. Not when an agent reports success — agents have reported success for work that
wrote nothing at all, and that is exactly how `ana-platform-controller`'s audit call came
to write nothing through nonexistent columns behind an empty catch for as long as it did.

Run before trusting this file:

```bash
node scripts/ops/ledger-check.mjs      # rows parse, paths exist, done rows cite evidence
node scripts/ops/ga-readiness-report.mjs   # the procurement half, observed not assumed
```
