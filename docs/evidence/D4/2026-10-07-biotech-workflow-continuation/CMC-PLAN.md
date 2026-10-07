# Recorded CMC study and series qualification contract

Workstream W3, launch row D4. Control tower approved this bounded increment
on 2026-10-07. Initial source: `3400f1f32f7bed7bfa041e390b67407420a30d2d`,
canonical branch `concept2cure-v2`. Production scope is the existing
`server/services/cmc/recorded-stability.ts`; new focused tests and these CMC
evidence documents are the only other worker edits.

## Confirmed boundary failures

Read-only execution of the real recorded-data functions demonstrated:

- A selected B3 with `stabilityData: '{unreadable'` is reported as not having
  recorded Assay. B1/B2 are fitted and `supportedShelfLife: 36` is returned
  for the three-batch selection.
- A study declared at 25°C/60%RH with pull points at both 25°C/60%RH and
  40°C/75%RH is pooled as one series. Both selected batches contribute and
  the aggregate returns 36 months.
- One recorded Assay series changing from `>= 95%` to `>= 99%` fits against
  its first criterion (95), returning 36 months and a trend crossing at
  50.09 months. The existing Module 3 point comparisons correctly report
  three OOS points against 99%, so the fit and those comparisons disagree.
- An additional present measured point with a blank parameter disappears
  before fitting. Valid labelled Assay points still return a programme figure.

These are software evidence identity/completeness failures. No new scientific
or agency rule is used to correct them.

## Contract

1. Preserve `readRecordedStabilityResults` state in each poolability study.
   An unreadable selected payload is explicitly named as unreadable, not as
   missing an attribute. Readable contributors remain assessable under the
   existing subset rules and retain their actual batch IDs, counts and numbers.
   The aggregate selection cannot receive a supported shelf-life claim when
   any selected study is unreadable, or any assessed attribute excludes a
   selected batch or is unassessable. Named reasons explain the withheld claim.
   Existing invalid numeric observations continue to refuse their entire
   affected attribute, as already required by the numeric qualification contract.
2. Before pooling an attribute, inspect the storage condition on its recorded
   points. Missing point conditions retain the existing inheritance from the
   one selected study condition. Explicit point conditions must agree with that
   condition; mixed point conditions, contradictory condition aliases or a
   differing declared/result condition refuse the affected parameter with named
   batch/row reasons. Other independent parameters remain readable. There is
   no alias normalization, equivalence inference, conversion or new condition
   mapping; `LT` plus a physical label remains conservatively unassessed.
3. Single-study shelf life, trending and poolability require one consistent
   parsed acceptance criterion per attribute/condition series. Inspect every
   nonblank recorded criterion using the existing parser, rather than accepting
   the first ordinary criterion. Equivalent supported spellings and numeric
   bounds remain usable. Conflicting parsed bounds/directions, or a present
   criterion that cannot be interpreted, refuse that affected fit with the
   recorded criterion/row reasons. Blank criteria retain existing series-level
   inheritance; no dimensional, unit or censoring semantics are inferred.
4. A recorded point with a present result and a blank parameter is a named,
   unassigned observation. Do not assign it to a guessed parameter or let it
   disappear from programme evidence. Retain fitting of valid labelled series
   and explicit unassigned-row metadata, but withhold an aggregate shelf-life
   claim. Blank-parameter rows without a present result do not create this hold.

Raw objects, source IDs/hashes, retained data, numeric parsing, statistical
engines, model gates, human review/signatures, provenance and export controls
remain unchanged. The Module 3 composer uses the existing recorded-trending
consumer and therefore prints affected trend refusals while retaining its raw
point tables and per-point comparisons. This worker does not change Module 3
conformance or proposed-storage support policy.

## Proof and limits

Add a focused realistic recorded-study test file and capture actual RED against
unchanged production before editing. Cover unreadable/missing/short selected
batches, mixed/mismatched/contradictory point conditions, criterion changes
within a series and cross-batch conflicts, valid equivalent criteria,
independent good series, measured unassigned observations, raw preservation,
and a complete valid multi-batch positive control. Exercise the existing
Module 3 consumer's refusal text and raw table preservation. Run the existing
numeric, criterion, shelf-life, poolability, trending, Module 3 and AnA regressions
plus scoped ESLint/diff checks, preserving any inherited failures separately.

No new engine, surface, dependency, table, migration, integration or method is
introduced. Duplicate/replicate interpretation, condition alias equivalence,
scientific unit qualification, intended-use/staging/runtime-role validation,
and D4/commercial deployment completion remain outside this increment. Root
owns shared release gates, exact-source TypeScript and publication; this worker
does not commit or push.

## Approved Module 3 conformance propagation addendum

The control tower approved this additional narrow boundary on 2026-10-07,
after the first 28-case GREEN. A series with ordinary `>= 95%` and `>= 90%`
criteria can pass every individual point comparison while its trend now
refuses the conflicting series. The existing composer still states
"supporting stability" because that conclusion only sees point comparisons.

Extend production scope to `server/services/module3Composer.ts`. Reuse the
same recorded-series criterion inspection in its existing
`unresolvedObservations` channel: group all source pull points exactly as the
existing recorded-trending consumer does, and include the criterion refusal
in the conformance evidence gaps. Preserve raw tables, per-point comparisons,
valid series at separate conditions, and every other domain outcome. An
unresolved fitted series with otherwise passing points must withhold the
overall stability/storage support sentence and name the unresolved criterion.
No alternate parser, inferred criterion, new scientific policy, or new store.
Capture real supplementary RED against the unchanged composer before editing,
including criteria split across the existing recorded payload fields.

## Approved inherited route fixture correction

The first 19-file regression had one inherited failure in
`server/api/cmc/__tests__/stabilityPoolabilityRoute.test.ts`: "excludes an
unfittable batch by name, and says why" claimed to test insufficient numeric
points, but provided the present nonnumeric result `conforms`. The prior
numeric qualification correctly refuses that malformed observation rather
than fitting other batches in its place. `CMC-INHERITED-ROUTE-CASE.txt` runs
the published `3400f1f...` recorded service in an isolated in-memory module
and confirms identical refusal before this increment; it does not revert or
modify shared production.

Control tower approved replacing only that result with numeric `100` so the
fixture faithfully represents the original one-point/insufficient-points
purpose. Keep the exact exclusion and subset-assessment assertions; also
assert that no full selected-programme shelf life is claimed. Preserve the
actual earlier failing regression output and rerun the complete 19-file
manifest. Do not weaken the numeric evidence parser or invalid-series refusal.
