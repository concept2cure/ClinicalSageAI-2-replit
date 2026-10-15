# §3.2.R.1.US is written for the application actually filed

Row **D2**. Discovery map 2026-10-04: `us-32r-written-for-nda` (P1).

## The defect

The one US regional generator wrote for a marketing application whatever the
submission was. Placed into an IND, the §3.2.R.1.US leaf said:

- "Submission Type: NDA / ANDA / BLA (as applicable)";
- that the section supports "a US marketing application";
- executed batch records under 21 CFR 314.50(d)(1)(ii), comparability protocols
  under 314.70, Form FDA 356h, and patent and exclusivity information.

None of those is an IND obligation. The IND's own obligations under 21 CFR
312.23(a)(7) were absent:

- the placebo;
- investigator labeling;
- the environmental analysis;
- the phase 1 risk statement;
- the link between the clinical material and the toxicology material.

The staff simulation's program is an IND, so every placed Module 3 carried this
text.

## The fix

- **`server/services/cmc/us-ind-regional.ts`** holds the IND's regional rows. Each
  row names its regulation and the CMC regulatory record requirement behind it
  (slice 07): `fda-req-003`, `-005`, `-006`, `-007`, `-011`, `-012` and `-009`.
  - Module 1 items (labeling, environmental analysis) are stated, never
    attested.
  - A placebo is cross-referenced when one is recorded. Otherwise the row says
    it is not recorded, and that it is required only if a placebo is used.
  - The narrative states 21 CFR 312.23(a)(7). It also says the marketing items
    do not apply, and does not list them.
- **`composeRegional(sources, region, { applicationType })`** writes the IND
  section when the linked submission is an IND. Marketing applications keep
  the existing text unchanged.
- **`resolveProjectRegional`** (`module3-compile.ts`) returns the region and the
  application type from the one submission spine. It replaces
  `resolveProjectRegionCode`, which no longer has callers.
  - The compile and the convergence board both use it, so the board enumerates
    the section the compile persisted.
  - `regionalRequiredFields` scores the IND section on the fields it reads.

## Red, then green

- **Unit.** `us-ind-regional.test.ts` has 4 tests. With the IND branch disabled,
  which is the old behaviour (`red-unit.txt`), the two IND tests fail: the
  narrative is the marketing one, and there is no IND table. With the branch
  enabled, all 4 pass. "Every row cites a requirement the CMC regulatory record
  holds" pins each row to the record.
- **Wider unit runs.** The Module 3, CMC, orchestrator and regional suites pass:
  236 files, 2,606 tests.
- **Staff simulation, real server.** Step 11h reads the compiled §3.2.R.1.US of
  the simulation's IND program.
  - Before (`red-simulation-before.txt`) it fails.
  - After (`green-simulation-after.txt`) the section cites 21 CFR 312.23(a)(7)
    and files none of a marketing application's items.

## Not yet

- **Other regions' clinical-trial dossiers.** EU, Japan and Canada regional
  sections are still written for marketing applications. Their clinical-trial
  equivalents (the EU IMPD, the Japan CTN, the Canada CTA) are in the record's
  pathways and are next on the same pattern.
