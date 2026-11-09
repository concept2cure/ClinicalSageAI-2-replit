# Two silent failures on the register write path: a column never read back, and a date that would not clear

**Row:** D4 (CMC / Module 3 governed acts) · **Package:** S7 · **Date:** 2026-11-09

Both found by walking the running app against the real demo programme, and both proved live before and
after. Neither had a failing test, and neither showed an error to the user.

## What already exists

| Path | What it does today |
|---|---|
| `server/api/cmc/routes.ts` | The CMC register HTTP surface. 16 GETs, of which **4 name their columns** (`/analytical-methods`, `/stability-studies`, `/drug-substances`, `/drug-products`); the rest `select()` the whole row. Every register PUT parses its body `.partial()` |
| `server/services/cmc/register-writes.ts` | `requiredDate` / `optionalDate`, the register body schemas, the canonical creates |
| `client/.../cmcRegisterForms.ts` | The drawers. `*Patch` builders (container closure, reference standard, impurity, manufacturing process, characterization study) send `?? null` for every nullable field, which is why they exist — an Edit must be able to clear a field, and the CREATE body builder cannot |
| `shared/schema.ts` | `drugSubstances` carries the six §3.2.A.2 columns (migration `20260908_drug_substance_biologic_origin.sql`) |
| `scripts/ci/__tests__/helpers/scratch-repo-gate.mjs` | The harness that runs a gate against a throwaway git repository |

Nothing new. Both fixes are inside functions and schemas whose own comments already describe this
exact class, found twice before: `drugProducts.batchFormula` ("a field the product can capture and
cannot read back is a field it loses") and `analyticalMethods.ichQ2Parameters` ("carried so an edit
round-trips: without it the client can only send back an empty validation record").

## Defect 1 — the drug substance's §3.2.A.2 columns were written and never read back

`GET /api/cmc/drug-substances` projected 14 columns. The table has 24. Among the ten it omitted were
all six §3.2.A.2 inputs — `modality`, `biologicalOrigin`, `sourceOrganism`, `cellLine`,
`viralSafetyEvaluation`, `tseStatus` — every one of which the drawer collects and seeds from
`row.<field>`.

`modality` is the field **P-110 refuses a Module 3 composition over** (`CMC_MODALITY_NOT_ESTABLISHED`,
"Record the substance's modality"). Live, on the demo data (`01-the-column-the-api-withheld.txt`):

| | `drug_substances` holds | `GET` returned |
|---|---|---|
| C2C-201 | `modality = small_molecule` | *(absent)* |
| C2C-101 | `modality = biologic`, `biological_origin = CHO-K1 cell culture`, a TSE statement | *(absent)* |

So the Edit drawer opened Modality, Biological origin and TSE status **blank on a record holding all
three**. And because a blank optional field is omitted from the body, and the PUT parses `.partial()`,
a blank was never written either — the value survived but could not be seen, corrected or cleared.
A wrong modality was permanent, and the biologic refusal was unexplainable from the UI.

Fixed by projecting the six. Verified live: both substances now return their modality, origin, cell
line and TSE statement.

**And an instrument for the class.** `register-projection-covers-its-columns.contract.test.ts` reads
the route source and asserts, for each of the four explicit projections, that the columns it omits
equal a declared list **with a written reason per entry** (reason length is itself asserted). Each
request body is `withoutTenantKey(insert<Table>Schema)` — every column — so the rule is simply "project
every column, or write down why not". A new column is now a decision rather than a fourth instance.
It would have caught `batchFormula` and `ichQ2Parameters` too.

## Defect 2 — a date a drawer cleared stayed in the register, with a 200

`optionalDate` folded an explicit `null` into `undefined`. With `.partial()`, `undefined` means "this
key was not sent", so the column was left alone. Three fields are sent as `null` by a patch builder:
`referenceStandardPatch`'s `retestDate` and `expiryDate`, and `characterizationStudyPatch`'s
`performedDate`.

Live, pre-fix (`02-the-date-that-would-not-clear.txt`): `PUT` with `retestDate: null, expiryDate: null`
→ **`success: true`**, and the register still held `2027-06-30` and `2028-06-30`. A silent write
failure on a GxP register, reported to the user as success.

Fixed with a **new primitive beside the old one**, not by widening `optionalDate`:

```ts
export const clearableDate = z.preprocess(
  v => (v === '' || v === undefined ? undefined : v),
  z.coerce.date().nullable().optional(),
);
```

`.nullable()` is checked before the coercion, so `null` does not become `new Date(null)` (the epoch) —
asserted. It is applied to exactly those three fields, because they are the only ones whose column is
nullable **and** whose drawer can clear them. `optionalDate` stays everywhere else, including
`qc_testing.test_date`, which is **NOT NULL**: widening that one would turn a clean 400 into a 500 from
the database. A signature's own date is never clearable — `withoutSignatureFields` strips
`qualification_date` / `validation_date` / `approval_date` / `approved_at` / `shelf_life_signed_at`
from every ordinary edit, which the cases also pin.

Verified live after the fix: the same PUT cleared both columns, and a later PUT **set** a retest date
again, so the field is not merely write-once-null.

## Verified by making each check fail

| File | Mutation | Result |
|---|---|---|
| `03-projection-contract-mutation.txt` | `modality` removed from the projection | 2 of 7 fail: the set difference, and the named-field case |
| `02-the-date-that-would-not-clear.txt` | `clearableDate` → `optionalDate`, server restarted, **the real PUT re-run** | `success: true`, dates unchanged in the database |

## Green

- `server/api/cmc/__tests__/register-projection-covers-its-columns.contract.test.ts` — 7 passed (new)
- `server/services/cmc/__tests__/register-writes.test.ts` — 15 passed (was 10)
- `eslint` on every touched file — 0 errors; warning counts unchanged (stash-checked against HEAD)
