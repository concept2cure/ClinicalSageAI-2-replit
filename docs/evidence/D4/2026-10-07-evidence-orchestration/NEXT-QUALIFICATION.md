# Next scientific qualification and handoff work

Read-only findings anchored to source `0d15907bb`. No changes below are
claimed implemented or qualified. Two agents inspected scientific and
connector handoffs; control tower inspected the named production paths.

## Confirmed existing-path defects to prioritize

| Priority | Existing boundary | Evidence | Next bounded proof |
| --- | --- | --- | --- |
| 1 | Recorded CMC numeric evidence → shelf-life/trending/poolability and Module 3 conformance | `recorded-stability.ts` extracts the first numeric substring: a read-only module probe returned `1` for `1e-05`, exact `0.1` for `<0.1%`, and `1` for `1,000`. `numericSeries` turned scientific-notation inputs into different values. | Complete finite numeric lexemes, explicit compatible time labels and percent forms; reject censored/ambiguous/malformed observations honestly at the affected fitted series, not by silently dropping them. Preserve raw records and require intended-use/handling clarification. No guessed unit conversion or incidental acceptance-criterion grammar expansion. |
| 2 | Withdrawn-data Vault version → newly linked CMC source evidence | `source-evidence.ts` link/list/read/drift checks deletion/current-version, but not data disposition. Existing disposition blocks withdrawal while a live CMC link exists; the uncovered direction is withdrawal first, then a new link. | Actual-SQL late-link refusal for `remove_data`/`supersede`, read/drift/approve/export holds and ordered locks. Preserve `keep_data` usability while distinguishing original-file unavailability. Do not blanket-refuse retained extracted data. |
| 3 | Edited Biostat inputs → old or obsolete in-flight result → Authoring | `BiostatWorkbench.tsx` changes fields without invalidating the prior result; validation/server failures leave the previous result fileable, and responses have no input-revision guard. | Result/input revision binding; invalidate or clearly block filing obsolete results after edit/failed rerun; ignore out-of-date responses. Preserve valid full-table/hash handoff and human-controlled draft/export gates. |

The CMC numeric parser is also called by Module 3 stability/QC conformance.
The corrective contract must cover those callers, not just a single calculator.
Existing numeric-series filtering must not turn a censored measured observation
into an ordinary missing observation while fitting remaining points.

These are repository findings, not live provider/regulatory qualification
evidence. Read-only probes used in-memory inputs, not client datasets.

## Existing bridges versus missing qualification

CSV/XLSX string/cell extraction and Data Room capture are available. Explicit
Data Room → Vault filing keeps project/source/hash linkage, and canonical
catalog search enforces tenant, disposition and current-version eligibility.
Biostat accepts typed numeric/list/row requests and files deterministic results.
CMC records typed/free-text register data, writes through to canonical Module 3
source objects and has per-domain checks. None of those, alone, proves a unified
uploaded-file → qualified columns/types/units/population/method → analysis-ready
dataset bridge.

Connector search/fetch adapters inspected here are retrieval-only. No registry
fetch → scanner/hash/canonical Data Room capture callback is wired. A separate
Veeva Buffer download/sync primitive is not governed admission and has no
established reachable import handoff. Provider credentials, account permission,
byte fidelity and admission contracts are prerequisites, not assumptions.

The same connector audit reproduced canonical upload's false success after a
disk write failure. That prerequisite is the separate approved
[upload-durability work](UPLOAD-DURABILITY-PLAN.md), not a connector integration.

Each next implementation needs an explicit bounded contract, RED-before-GREEN
tests, shared release gates and human-review/qualification limits. No new
surface, engine, store or integration is authorized by this discovery note.
