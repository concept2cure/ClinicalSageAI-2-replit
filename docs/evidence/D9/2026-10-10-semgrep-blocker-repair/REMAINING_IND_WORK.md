# Remaining IND engineering and qualification work

Read-only repository audit at checked source commit
`43d8dc57ee15a88983d869b34876dead792a4413`; no content or governance implementation
was changed by this audit. This records the broader requested scope alongside
the current W7/D9 release repair.

The canonical [backlog](../../../design/ANA_IND_REQUIREMENTS_BACKLOG.md) matches
the [terminal inventory](../../D4/2026-10-10-ana-ind-pharmacology-leaf-guidance/structure-only-terminal-backlog.json):
249 unique catalogue codes, 203 terminals, 110 exact advisory-content terminals,
and 93 structure-only terminals. Inventory SHA256:
`729edbe2b212d5d5abce5c12bf18527329c813e01dfbc926ed884a714c101fc4`.
All five pinned catalogue inputs remained unchanged during reproduction.

| Module | Structure-only terminals |
| --- | ---: |
| 2: summaries, contents and references | 60 |
| 3: contents and references | 2 |
| 4: nonclinical reports and contents | 17 |
| 5: clinical reports | 14 |
| Total | 93 |

These counts measure exact advisory guidance coverage. They do not establish
that every terminal is required for a particular initial IND or that a sponsor
has supplied adequate scientific evidence. All 93 retain undetermined initial-IND
applicability. Eighty-nine inherit ancestor briefs; four are not indexed by the
brief resolver (`2.1`, `3.1`, `3.3`, `4.1`). Heading bases retain 78 recall entries
and 15 regulator-text entries; this audit does not freshly qualify those bases.

The repository recommends Batch B next: ten pharmacokinetics summary leaves,
`2.6.4.1` through `2.6.4.10`. It requires fresh final primary-source review and
exact-leaf resolver/drafting evidence. Later proposed scopes are toxicology
summaries, the remaining nonclinical report groups, clinical summaries, clinical
report groups, and contents/references. The prior pharmacology source review
does not qualify these future batches.

The [coverage plan](../../../design/ANA_IND_COVERAGE_PLAN.md) also leaves work
outside this numerical catalogue:

- Version-bound scientific review and seal admission, beginning with the
  [existing review-writer repair proposal](../../D4/2026-10-10-ana-ind-pharmacology-leaf-guidance/NEXT_GOVERNANCE_REPAIR.md).
  Ordinary approval and the legacy no-qualification sealing path are not
  scientific qualification.
- Owned product, phase and population facts with basis-bearing applicability
  decisions; caller labels remain advisory context.
- Current, owned, hash-bound scientific source snapshots and reviewed
  dispositions; extraction and traceability alone are insufficient.
- Regional Module 1, deeper subdivisions, numbered tables and repeating
  study/product instances beyond this 93-terminal denominator.
- Guidance currency and a connected guidance index; dated curated helpers do
  not establish live regulatory completeness.
- Qualified model behavior, representative governed drafting-to-submission
  scenarios, and sponsor scientific/regulatory review. Gateway test doubles
  establish wiring rather than model qualification or scientific correctness.

The current scanner repair therefore closes a bounded engineering defect once
its fresh remote gate is verified. Separate CI failures are recorded in
`REMAINING_CI.md`; catalogue and qualification work remains open.
