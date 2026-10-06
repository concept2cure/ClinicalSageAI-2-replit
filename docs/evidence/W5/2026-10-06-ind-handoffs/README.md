# IND readiness, identity, and export handoff repair

Scope: enhance the existing IND checklist, authoring, and Ana context paths.
Launch workstream W5; supports D2/D7 evidence. No new module, drafting engine,
model, dependency, schema, or provider access was added.

## Behavior

* The checklist response now includes the submission's existing `program_id`.
  Target dates resolve by that ID. Name matching is retained only for an
  unlinked legacy submission with exactly one matching program.
* The checklist evaluates missing requirements through the existing
  `evaluateIndReadiness` service. Its placed-document inventory is no longer
  treated as the full required set.
* The screen renders that report and publishes the same verdict, percentage,
  requirement totals, missing requirements, and program ID to Ana. A response
  from an older server with no readiness report is explicitly unassessed.
* With an open program, the screen never substitutes another program's IND.
  Ambiguous legacy names require a recorded link rather than a guess.
* Authoring's export baseline is converted from the existing wall-clock
  TIMESTAMP into TIMESTAMPTZ in PostgreSQL before the driver parses it. Citation
  creation times were already TIMESTAMPTZ; comparing the differently interpreted
  JS dates previously invented post-export drift.

## Regressions and evidence

Before implementation, the three new assembler regressions failed: no readiness
report, omitted program ID, and a borrowed name-matched date over an unresolved
recorded link. The existing authoring journey also failed its unchanged-export
baseline step, as recorded in the 2026-10-06 build assessment.

Focused checks cover:

* approved placed content plus forms cannot hide missing nonclinical sections;
* recorded program identity and date survive a rename and duplicate names;
* unresolved or ambiguous program links cannot borrow another program's date;
* Ana and the screen consume the identical authoritative readiness report;
* legacy inventory-only responses cannot produce READY TO FILE;
* an unmatched open program cannot expose another IND's drafting/filing surface;
* the unchanged authoring export baseline reports zero citation additions;
* a controlled genuinely later citation still appears in the diff.

The SQL integration checks use PGlite. The authoring journey exercises the real
router and signed JWTs with in-process SQL; it is not a live provider or FDA test.

## Boundaries

This repair does not qualify a model, submit an IND, or prove regulatory
acceptance. Readiness uses the existing initial-IND requirements and existing
checklist status aggregation. The separate assessment's historical-sequence
aggregation, batch-draft persistence, and canonical-review projection findings
remain follow-up work; no broader completion is claimed.

Client data placement and model qualification controls are unchanged. Publication
is a repository update, not a production deployment.

## Validation at publication

* Final focused run: **70 tests passed in nine files**.
* Production build passed; changed-file ESLint error check passed.
* `typecheck:fast` was killed by the 8 GB workspace memory limit. The full
  incremental zero-error gate was retried with a 7168 MB heap and terminated
  with V8 out-of-memory (exit 134). Neither is a completed type check.
* Full TypeScript validation is delegated to the existing GitHub CI Lint job,
  as the gate's own resource-failure guidance permits. No check, baseline,
  compiler configuration, workflow, or memory guard was weakened. CI results
  must be checked before calling this change fully validated.
