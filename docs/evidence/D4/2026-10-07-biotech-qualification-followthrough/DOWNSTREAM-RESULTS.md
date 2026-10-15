# Cached recorded-descendant readers — W3 / D4

The control tower preserved an actual-SQL RED before extending the frozen
lineage repair. `DOWNSTREAM-RED.txt` shows **3 failed / 1 passed**: the canonical
captured descendant was correctly refused after its exact parent was withdrawn,
but the atom, RAG and artifact predicates still returned eligible for that same
recorded descendant. This receipt starts from `40697292` plus the pending scoped
lineage repair; it is not represented as the round's initial pre-edit RED.
The approved extension was recorded in `PLAN.md` before these production edits.

The existing reader predicates now inherit eligibility from exact same-tenant
captured source, upload and artifact associations. The migration's reference
normalizers remain authoritative. Cheap identity candidates bound their lookup
work; nested SQL CASE guards evaluate normalization and ancestry only for a
matching candidate. The canonical captured/upload lineage implementation remains
the sole ancestry interpretation. No digest invents a derived association, and
no store, index, migration or alternate graph was introduced.

The existing direct disposition predicates are retained. Extracted data and
original-file availability remain separate: `keep_data` keeps retained source
data eligible while refusing that source's original file; an edited descendant
with distinct bytes remains eligible and available when its ancestor's data was
retained. A terminally withdrawn or contradictory recorded ancestor refuses the
cached representation.

`DOWNSTREAM-GREEN-INITIAL.txt` preserves the first four-case GREEN.
`DOWNSTREAM-GREEN.txt` preserves 19 controls before lookup optimization.
`DOWNSTREAM-GREEN-FINAL.txt` records **19/19 passed, exit 0, 5.49 seconds** on
the final source, including numeric/string source identities, supporting and
contradicting source arrays, prefixed/bare upload IDs, numeric/native artifact
IDs, retained original availability, independent same-child-byte records,
tenant isolation and contradictory parent digests. These execute the real
SQL predicates against the disposition migration and persisted canonical rows;
the named-format controls use typed row projections of existing consumer fields.
The control tower's combined execution manifest supplies final neighboring
workflow integration, rather than inferring it from this focused run.

## Descriptive timing and limits

All timing receipts preserve identical ordinary positive eligibility counts.
The fixed local dataset contains 201 captures/uploads, 203 atoms, 201 RAG
records, 201 artifacts, 800 same-tenant unrelated audit events and 800 foreign
events. It uses existing primary keys and the deployed audit identity index
order `(table_name, record_id)`; no production index was added. Each projection
had one warm-up and three measured repetitions on the same host.

| Predicate | Original `40697292` median ms | First repair median ms | Final bounded lookup median ms |
|---|---:|---:|---:|
| Atom, 203 rows | 2.12 | 5108.05 | 312.32 |
| RAG, 201 rows | 2.59 | 1624.39 | 110.12 |
| Artifact, 201 rows | 3.40 | 847.41 | 92.64 |

The original medians in this comparison come from the final paired run.
`DOWNSTREAM-PERFORMANCE-INITIAL.txt` and
`DOWNSTREAM-PERFORMANCE-MATCH-GUARD.txt` preserve the earlier paired runs and
their respective original medians; `DOWNSTREAM-PERFORMANCE.txt` is the final
paired run. Timing triggered the candidate-bounding correction; it was not a
performance acceptance test. The final relative overhead remains material.
Production volume, latency, planner distributions, RLS and independent
connections remain unqualified. No deployed performance claim is made.

This repair follows existing resolvable recorded identities. It does not
reconstruct archived audit history or unknown/unmapped historical associations.
Existing reference syntax defines which cached associations can be bound.
Missing historical events are unknown history, not proof of independent origin.
Admission reservations, historical records and direct disposition policy remain
unchanged. Scientific interpretation, complete intended-use/PQ evidence and
signed live validation remain owed; D4 and D1–D10 are open.
