# The demo seed, run against a live server — what it found

**Package:** DATA / S7. **Date:** 2026-11-09. Session `session_01GJidg5q1KFNfFT2VZyjcqw`.

The three demo-data slices landed earlier today were tested against the real engines but not against a running
product. This is that run: `npm run dev` on this container, the real database, `node
scripts/demo/launch-demo/seed.mjs --pack biotech` as the signed-in account. It closed **J5-13** and found four
defects no unit case had caught — two of them mine, two shipped.

## J5-13 is closed

```
• Projects: program C2C-201 (IND) … ok — created 18cb4cd2-2f8a-419f-898b-c07cc4b6715e (C2C-201)
• CMC / Module 3: drug substance and drug product on C2C-201 … ok — 2 created of 2
• CMC / Module 3: analytical methods on C2C-201 … ok — 4 created of 4
• CMC / Module 3: specifications on C2C-201 … ok — 6 created of 6
• CMC / Module 3: stability programme on C2C-201 … ok — 3 created of 3
• CMC / Module 3: batch records on C2C-201 … ok — 3 created of 3
• CMC / Module 3: recorded release results on C2C-201 … ok — 5 created of 5
• CMC / Module 3: compile the dossier on C2C-201 … ok — 21 section(s) composed, 13 with recorded data
```

`01-composed-sections.txt` is the board as the product serves it; `02-sections-as-filed.txt` is §3.2.S.4, §3.2.P.5,
§3.2.S.7 and §3.2.P.8 in full, narrative and tables. The behaviours phase 4's acceptance fixture pins are all there
on live data:

- §3.2.S.4.4 files `DS-2502-R2 … 97.4 % — retest requested; investigation INV-2026-014 open … declared pass — the
  recorded result is OUTSIDE its recorded acceptance criterion … not reviewed`;
- §3.2.P.8 states *"A shelf life of 18 months is proposed, recorded on a study that has not been closed out under
  signature"*, names the failing point — *"(Total impurities at 6 = 0.61 against NMT 0.5 %)"* — and then *"The
  stability conclusion and the proposed storage period are NOT established by this section."*

## Found 1 (mine): a write reported as made, and not made

`ensureStability` sent `shelfLifeClaim` — the name the **composer** reads. The register's column is `shelf_life`
(`shelfLife`). The route parses its body with a Zod schema that **strips unknown keys**, so it answered **200 having
changed nothing**, three times, and the seed reported three successful updates. §3.2.P.8 stayed at 0%, missing
`drugProductShelfLifeClaim`.

Fixed twice over: the right field name, and the step now **reads the write back** and fails if the value is not
there. A seed that reports a write it did not make is worse than one that fails. §3.2.P.8 is now 100%.

**For the register's owner:** `stabilityStudyBody.partial().parse(req.body)` (and every sibling register body) silently
drops unknown keys, so a caller cannot tell an applied edit from an ignored one. A `.strict()` parse would say so with
a 400, but it would also start refusing any caller that sends an extra field — a judgement for that lane, not this
one.

## Found 2 (mine): the seed recorded no release results, so §3.2.S.4.4 and §3.2.P.5.4 had none

The seed recorded batch **records** (the manufacture) and no QC **results** (the testing) — so the two sections whose
entire purpose is quantitative batch results had none, in the demo of a product whose phase 4 acceptance is about
exactly those tables. Five results are now recorded per programme, one of them a declared pass over a failing result
so the contradiction behaviour shows on clickable data. §3.2.S.4 and §3.2.P.5 went 50% → 75%.

## Found 3 (shipped): §3.2.S.4 filed the drug PRODUCT's limit as the drug substance's

§3.2.S.4 read `valObj(m, 'acceptanceCriteria')` — the **first** specification source carrying a criteria object,
whatever material it was for. Every real programme records both, so the section rendered whichever came first. Live,
before the fix:

```
-- Drug Substance Specification — Acceptance Criteria
   shelf   | See Analytical Methods table | NLT 80 % (Q) released at 30 minutes | —
   release | See Analytical Methods table | NLT 80 % (Q) released at 30 minutes | —
```

That is the **drug product's dissolution limit, under the drug substance's specification**. §3.2.P.5 was never
exposed to it, because it reads `releaseCriteria`, which the mapper emits only for a product spec.

Fixed by giving the substance side the rule the stability sections already use, through the same helpers
(`scopedPayloads`, `normalizeMaterialScope`): the material a record states, with an **unrecorded** material covering
both — a row written before the register had the field is ambiguous, not drug-product — and the narrative says so
rather than pretending to know. Pinned in both source orders by
`server/services/__tests__/module3Composer.specification-material-scope.test.ts`, which was red on the live defect
before the fix. **My own phase 4 acceptance fixture was passing this by source order**, which is exactly why the
case asserts both orders.

**Not fixed, and recorded in the test rather than asserted away:** completeness is computed by one generic collector
over every matched source and that collector is not material-scoped, so a programme with only a drug-product
specification still reads `acceptanceCriteria` as available on §3.2.S.4 while the section files none. Closing it
needs either a side-scoped field in `mapSpecificationPayload` (which would report every specification already on
file as missing it, since stored canonical payloads are not rewritten) or a per-type scope on `SectionRule` — a
change to the rule table every section reads.

## Found 4 (shipped, NOT fixed here): the register records per attribute; §3.2.S.4 files one criteria object

With found 3 fixed, the live table reads:

```
-- Drug Substance Specification — Acceptance Criteria
   shelf   | See Analytical Methods table | Conforms to the Form I reference diffractogram | —
   release | See Analytical Methods table | Conforms to the Form I reference diffractogram | —
```

Correct material now — and still wrong, for a different reason. The Specifications form records **one row per
quality attribute**, where `materialName` IS the attribute and `acceptanceCriteria` is the `{release, shelf}` pair
(`client/src/concept2cure/v2/surfaces/cmcSpec.ts`, `specCreateBody`). `03-register-rows.txt` shows it: six rows,
each `material_name` an attribute, each criteria object `{"release": …, "shelf": …}`.

§3.2.S.4's renderer reads **one** criteria object and prints `Object.entries(criteria)` as attribute → criterion. So:

- the "Quality Attribute" column shows `release` and `shelf` instead of the attribute;
- **only the last scoped row's limits appear** — this programme records six attributes and the filed section states
  one.

§3.2.P.5 has the mirror of it: it prints a single `Release Criteria` property row, so a product with six recorded
attributes files one limit.

This is a shipped dossier-correctness defect independent of the demo, and the fix changes what a filed table
contains — one table row per specification record, its `materialName` as the attribute, its release and shelf-life
limits as the criteria. That is its own slice, with its own test and evidence, rather than a rider on a demo-data
change. It is the fourth finding of this run and the most consequential.

## What this run did not do

No browser walk. The sections above are read from the product's own API, which is what the composed dossier is; a
click-through of the CMC work area on C2C-201 at 1440 and 390 is the remaining half of J5-13's ask.
