# The new-specification form states no regulatory basis the person did not

Plan S7. Completes `client/src/concept2cure/v2/surfaces/CmcModule.tsx` (`CmSpecs`, the form config `FORM`).

## What already exists

- The Specifications tab's one form (`FORM` in `CmSpecs`), opened by "New specification" and by Edit.
- `cmcSpec.ts` maps the form's `ich` field to `regulatory_basis.ich`, and already carries a blank as blank
  (`{ ich: v.ich || '' }`); the register prints a blank as `--`.
- The release composes small-molecule Module 3 for a US IND (`server/services/cmc/composition-scope.ts`), whose
  specifications are set under ICH Q6A. The same file already records this defect class once, for a starter
  ("aggregation is an antibody attribute").

## The defect

A new specification's "ICH reference" was pre-filled `ICH Q6B` (biotechnological products), and the examples were an
antibody's: "e.g. Charge variants", "e.g. SE-HPLC". A specification created without touching the field was recorded
under a guideline that does not govern it, and the register listed it so.

## The change

Words and one default only: the ICH reference starts blank with the placeholder
"e.g. ICH Q6A (chemical) or ICH Q6B (biotechnological)"; the examples are "e.g. Assay" and "e.g. HPLC". No field,
route or mapping changes. An existing row keeps what it records.

The form is in a region another lane (`01QoxbLcnW…`) holds; this is three strings and is said in COORDINATION.md.

## Proof

Red first (`cmcSpecFormStatesNoBasis.test.tsx`): `expected 'ICH Q6B' to be ''`, and "e.g. Assay" absent. Then 2
passed, with `cmcSpecMapping.test.ts` (14 in all). Lint: `CmcModule.tsx` 14 warnings before and after.

In the running app, C2C-201, Specifications, New specification (2026-11-13), the form's fields:

```
Quality attribute   ""  e.g. Assay
Analytical method   ""  e.g. HPLC
Release limit       ""  e.g. <= 2.0%
Shelf-life limit    ""  e.g. <= 3.0%
ICH reference       ""  e.g. ICH Q6A (chemical) or ICH Q6B (biotechnological)
```

Screenshot: `new-specification-form.png`.
