# The US IND regional leaf names each manufacturer from its own record, and §3.2.S.2 carries the one it points to

Plan F1. Completes `server/services/cmc/us-ind-regional.ts` (`usIndRegionalRows`) and
`server/services/module3Composer.ts` (the §3.2.S.2 generator).

## What already exists

- The drug substance form records a manufacturer and a site; the drug product form records its own site. Both reach
  their payloads (`server/services/cmc-write-through.ts`, `mapDrugSubstancePayload`, `mapDrugProductPayload`).
- `usIndRegionalRows` (`server/services/cmc/us-ind-regional.ts`), read by §3.2.R.1.US
  (`server/services/module3-extensions.ts`, held by W4, not touched). It had ONE row, "Manufacturer name and address
  (drug substance and drug product)", filled from the first `manufacturingSite` found on any source of any type, and
  cross-referenced to "3.2.S.2.1 / 3.2.P.3.1" whenever any site was found.
- §3.2.S.1 prints the manufacturer's name; §3.2.P.3 prints the product's site. §3.2.S.2 printed neither.
- The CMC regulatory record holds the two obligations separately: `fda-req-003` (drug substance, 21 CFR
  312.23(a)(7)(iv)(a)) and `fda-req-004` (drug product, (iv)(b)).
- The same first-match defect was already fixed once, for §3.1's names (GA-DEMO-03, 2026-11-10).

## The defect

On C2C-201 the single row read "Manufacturer name and address (drug substance and drug product) — Building 3 oral
solid dose suite, Cambridge MA", the **product's** site, presented as the manufacturer of both, and cross-referenced
the substance half to §3.2.S.2.1, which carried no manufacturer. A sponsor with a substance CDMO and a product CDMO
filed a leaf naming one site for both.

## The change

- Two rows, one per side, each read only from that side's record (manufacturer and site), each citing its own
  paragraph and requirement, each cross-referenced only to its own section, and "not recorded" when that side records
  nothing.
- §3.2.S.2 gains a "Manufacturer(s)" table from the drug substance's own record (a helper,
  `substanceManufacturerTables`, beside `rawMaterialRendering`), so the leaf's pointer to §3.2.S.2.1 is true.

## Proof

Red first, 3 new cases in `server/services/cmc/__tests__/us-ind-regional.test.ts` (two sites; product-only site;
§3.2.S.2's table). Then green with the Module 3 and CMC suites (2061, then 290 after the lint extraction).
Lint: `us-ind-regional.ts` 0 and 0; `module3Composer.ts` 19 and 19.

On C2C-201's recorded source objects (2026-11-13):

```
before: Manufacturer name and address (drug substance and drug product) — Building 3 oral solid dose suite, Cambridge MA (fictional)
        cross-referenced 3.2.S.2.1 / 3.2.P.3.1

after:  Drug substance manufacturer name and address — Concept2Cure Chemical Operations (fictional), Building 2, Cambridge MA (fictional)
        21 CFR 312.23(a)(7)(iv)(a) · cross-referenced 3.2.S.2.1
        Drug product manufacturer name and address — Building 3 oral solid dose suite, Cambridge MA (fictional)
        21 CFR 312.23(a)(7)(iv)(b) · cross-referenced 3.2.P.3.1
§3.2.S.2 Manufacturer(s): Manufacturer — Concept2Cure Chemical Operations (fictional); Manufacturing Site — Building 2, Cambridge MA (fictional)
```

`US_IND_REGIONAL_FIELDS` still names `manufacturingSite` for completeness scoring; the section's score is unchanged.
