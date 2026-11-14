# §3.2.S.2.3 prints a raw or starting material's recorded origin and TSE/BSE certificate

Plan F1. Completes `server/services/module3Composer.ts` (`rawMaterialRendering`).

## What already exists

- The material register records Origin, Origin detail and TSE/BSE certificate for every role
  (`client/src/concept2cure/v2/surfaces/cmcRegisterForms.ts`), and `mapMaterialSpecPayload`
  (`server/services/cmc-write-through.ts`) writes them for a raw material exactly as for an excipient.
- §3.2.P.4's "Control of Excipients" table prints Origin (`materialRendering`). §3.2.A.3 reads excipient sources only
  (`server/services/module3-extensions.ts`).
- §3.2.A.2 tells the reviewer "the origin of the raw and starting materials is recorded in §3.2.S.2.3" and prints
  "Raw Material Origin: Recorded in §3.2.S.2.3".
- §3.2.S.2.3's "Raw and Starting Material Specifications" table (`rawMaterialRendering`) had no Origin column.
- `isHumanOrAnimalOrigin` (`shared/cmc/material-scope.ts`), the one list of origins that raise the TSE question.

## The defect

A bovine-derived reagent, with or without a certificate, appeared in no composed section, and §3.2.A.2's pointer
to §3.2.S.2.3 was untrue.

## The change

`rawMaterialRendering` adds two columns, Origin and TSE/BSE Certificate, printed as recorded: a blank origin is
"not recorded" (never read as "not of animal origin"); a certificate is "not recorded" where the origin is human or
animal or unrecorded, and a dash elsewhere. The narrative states how many materials record no origin, names those
of human or animal origin, and names any of them with no certificate. "None is recorded as of human or animal origin"
is said only when every origin is recorded and none is. This makes §3.2.A.2's existing pointer true; that file
(held by another lane) is not touched.

## Proof

Red first (`server/services/__tests__/module3-s23-prints-raw-material-origin.test.ts`, 4 cases: no Origin header,
cells undefined), then green; the wider Module 3 and CMC suites: 2091 passed.

In the running app (2026-11-13): a raw material recorded on C2C-201 through `POST /api/cmc/material-specs`
(role raw-material, origin bovine, detail "tallow derivative", no certificate), then §3.2.S.2 composed from the
project's source objects:

```
Raw and Starting Material Specifications
Material | Role | Grade | Compendial Monograph | Specification | Supplier | Site | Origin | TSE/BSE Certificate
WALK-ONLY Sodium tallowate | raw-material | Technical | — | — | Walk Supplier | — | bovine (tallow derivative) | not recorded

… 1 (WALK-ONLY Sodium tallowate) is recorded as of human or animal origin. No TSE/BSE certificate is recorded for
WALK-ONLY Sodium tallowate.
```

The walk-only material was removed from the local database afterwards. The demo pack records no raw material, so
C2C-201's own composed §3.2.S.2 is unchanged.

Lint: `module3Composer.ts` 19 warnings before and after.

Still open, in a file this change does not touch: the material register's hint tells staff §3.2.A.3 answers the
origin question for every role (`cmcRegisters.tsx`); for a raw material the answer is now §3.2.S.2.3.
