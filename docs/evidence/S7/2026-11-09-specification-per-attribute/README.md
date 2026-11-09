# §3.2.S.4 and §3.2.P.5 file every attribute the register records

**Package:** F1 (a repair of shipped behaviour). **Date:** 2026-11-09.
Session `session_01GJidg5q1KFNfFT2VZyjcqw`. The fourth finding of the live demo run
(`docs/evidence/S7/2026-11-09-demo-cmc-live-run/`), and the most consequential.

## The defect

The Specifications register records **one row per quality attribute**: `materialName` IS the attribute
(`"C2C-201 — assay"`), `acceptanceCriteria` is the `{release, shelf}` pair, and `testMethods.method` names the
procedure that measures it. That is the only shape the form can write
(`client/src/concept2cure/v2/surfaces/cmcSpec.ts`, `specCreateBody`).

Both composed sections expected the opposite — ONE record carrying every attribute:

- **§3.2.S.4** read one `acceptanceCriteria` object and printed `Object.entries(criteria)` as attribute → criterion.
  So the "Quality Attribute" column showed `release` and `shelf`, and only the **last** scoped record's limits
  appeared.
- **§3.2.P.5** built its per-attribute table from `testParameters` — a column the form never writes — and otherwise
  fell back to a single `Release Criteria` property row.

Measured live on a seeded programme: **six recorded attributes, one filed.** Five acceptance criteria a CMC group
had entered were absent from the section that exists to state them, and the one that appeared was labelled `release`
/ `shelf` rather than by its attribute.

Live, before (`docs/evidence/S7/2026-11-09-demo-cmc-live-run/README.md` has the earlier variant too):

```
-- Drug Substance Specification — Acceptance Criteria
   shelf   | See Analytical Methods table | Conforms to the Form I reference diffractogram | —
   release | See Analytical Methods table | Conforms to the Form I reference diffractogram | —
```

Live, after (`02-green-live.txt`):

```
   Quality Attribute                        | Test Method                          | Acceptance Criteria                    | Validation Status
   C2C-201 — solid form                     | XRPD identity and polymorph form     | Conforms to the Form I reference …     | validation
   C2C-201 — water content                  | Karl Fischer water determination     | NMT 0.5 % w/w                          | validation
   C2C-201 — specified and total impurities | HPLC-UV assay and related substances | Any specified impurity NMT 0.20 % …    | validation
   C2C-201 — assay                          | HPLC-UV assay and related substances | 98.0 - 102.0 % on the anhydrous basis  | validation
```

## What already exists (RULE 3)

Nothing new: `specificationAttributes` is built on `scopedPayloads` and `normalizeMaterialScope`, the helpers the
stability sections already use, and the material scoping landed earlier today in the same file. The criteria-object
path and the `testParameters` path are both **kept**, so a payload from a caller that is not the form still composes
exactly as it did.

## Two hedges the old shape forced, now removed

The old table could not attribute a row to a procedure, because one criteria object carried no per-attribute method.
Its own comment said so: *"per-row attribution is honest only when exactly one method exists; otherwise the rows
point at the methods table."* With the register's rows, each one names its procedure, so:

- the Test Method column names **that attribute's** procedure instead of "See Analytical Methods table";
- the Validation Status column carries **that procedure's recorded status** instead of `—`.

And when a limit names a procedure the register does not hold, the row says **`not in the method register`** — the
same fact the approval route refuses on (`METHOD_NOT_IN_REGISTER`), stated rather than guessed. The existing case
"two methods in different lifecycle states are reported BY NAME in §3.2.S.4 — one status is never stamped on every
row" (`cmcWriteThroughMappers.test.ts`) still passes: this is the stronger version of that rule, not a retreat from
it.

## Verified by making each check fail

| File | Mutation | What it reported |
|---|---|---|
| `01-red.txt` | the change not yet made | 5 of 7 red, incl. *"expected [ 'release', 'shelf' ] to deeply equal [ 'C2C-201 — assay', …(2) ]"* — the live defect |
| `03-mutation-one-record-path.txt` | both sections take the one-record path again — **the state as shipped** | 5 red |
| `04-mutation-absent-method-assumed-validated.txt` | a procedure absent from the register is filed as `validated` | *"expected 'validated' to be 'not in the method register'"* |
| `05-mutation-attributes-not-scoped.txt` | the attribute rows are not scoped to their material | 3 red across both specification suites — the drug substance's attributes reached §3.2.P.5 |
| `02-green.txt`, `02-green-live.txt` | — | 7 of 7, and the live tables after a real compile |

## Gates

`tsc --noEmit` 0 errors. **5,258 tests across 416 files** in `server/services/__tests__` and `server/services/cmc`.
ESLint: `module3Composer.ts` unchanged at 19 warnings.

## Still open from the live run

Completeness is computed by one generic collector that is not material-scoped, so §3.2.S.4 still reads
`acceptanceCriteria` as available when only a drug-product specification exists. Recorded in
`module3Composer.specification-material-scope.test.ts` with the two ways to close it, both of which need the owning
lane.
