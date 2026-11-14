# The ICH compliance check's Q3D rule reads the impurity register, and reports the engine's verdict

Completes `server/services/cmc/ich-compliance-rules.ts` (`checkQ3D`, now in `ich-compliance-q3d.ts` beside the Q1E and
Q2 rules, split out when the rules file crossed its line ceiling).

## What already exists

- `checkQ3D` (`server/services/cmc/ich-compliance-rules.ts`): it decided an elemental assessment existed from a
  specification whose test parameters contain "elemental" or "heavy metal", or a source object whose key or type
  contains "elemental" or "q3d".
- The impurity register writes each row as source type `impurity_profile`, key `impurity_profile:<id>`
  (`server/services/cmc-write-through.ts`, `writeThroughImpurityProfile`). An elemental row matched neither search.
- The engine that judges an elemental row against its ICH Q3D(R2) permitted daily exposure:
  `assessRecordedImpurity` (`server/services/cmc/impurity-assessment.ts`). The register row and the composed
  §3.2.S.3.2 / §3.2.P.5.5 already print its verdict.
- The check already loads every source object's payload (`ich-compliance-checker.ts`).

No new engine, route or rule family: the existing rule now calls the existing engine.

## The defect

On the demo programme C2C-201 the impurity register holds Palladium (3 ppm, 15 mg/day, oral), assessed on its row as
0.045 of 100 µg/day. The ICH check on the same project answered `Q3D_NO_ASSESSMENT` (fail): "No elemental-impurities
assessment found". The opposite error was also possible: a specification that merely mentions elemental impurities
passed the rule over a recorded row above its limit.

## The change

Where the register records elemental impurities (current rows, not retired), the rule's answer is the engine's:

- `Q3D_ABOVE_PDE` (fail): how many are above their permitted daily exposure, each with its figures.
- `Q3D_NOT_ASSESSABLE` (warning): how many could not be compared, each with the engine's reason.
- `Q3D_OK` (pass): every recorded row is within its limit, each with its figures; a derived exposure says it is that
  material's contribution.

With no elemental row recorded, the rule reads the specification and source keys exactly as before.

## Proof

Red first:

```
npx vitest run tests/ich-compliance-checker.test.ts
  expected 'Q3D_NO_ASSESSMENT' to be 'Q3D_OK'
  expected [ 'Q3D_OK' ] to deeply equal [ 'Q3D_ABOVE_PDE' ]        (a spec keyword passed over a row above its PDE)
  expected [ 'Q3D_NO_ASSESSMENT' ] to deeply equal [ 'Q3D_NOT_ASSESSABLE' ]
after: tests/ich-compliance-checker.test.ts, ich-compliance-currency.test.ts, stability-source.test.ts: 80 passed
wider: server/services/__tests__/module3*, cmc*, tests/module3*, tests/ich*, server/services/cmc/__tests__: 2091 passed
```

In the running app, `POST /api/cmc/ich-compliance` for C2C-201 (2026-11-13):

```
Q3D(R2)  Q3D_OK  pass
  The recorded elemental impurity is within its ICH Q3D permitted daily exposure.
  Palladium: 0.045 µg/day against a permitted daily exposure of 100 µg/day (oral, Class 2B)
  — this material's contribution, from 3 ppm and the recorded maximum daily dose
counts: pass 2, warning 13, fail 0     overallStatus: warnings
```

Before the change the same call carried one fail, Q3D's, and the project's overall status was a failure that the
record did not support.

Not done: the check has no Q3C (residual solvents) or M7 (mutagenic impurities) rule, though the same engine judges
both. Adding a guideline to the check changes its list of guidelines checked; that is a separate change.
