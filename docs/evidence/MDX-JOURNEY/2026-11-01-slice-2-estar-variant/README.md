# MDX journey M6(c): the eSTAR filing panel starts on the program's own eSTAR form

From `.design/client-journey/MDX_JOURNEY_2026-11-01.md` M6(c). Plan: F1.

## What already exists (RULE 3)

- **The official eSTAR panel already decides the form.** `mdx/surfaces/OfficialEstarPanel.tsx`
  `officialEstarVariantFor(program)` chooses the eSTAR form by the program's product type: `ivd` for the IVD
  family, otherwise `device` (nIVD). The 510(k), PMA and IVD screens already use it for the official eSTAR.
- **The filing panel did not.** `mdx/surfaces/EstarFilingPanel.tsx` assesses filing readiness
  (`assessFilingReadiness({ catalogKey, variant, … })`) and starts tracking a filing (`startTracking`). Its form came
  from a select whose state always began at `'device'`.

## The defect

On an IVD project, readiness was assessed, and a filing started, against the nIVD eSTAR unless the user noticed the
select and changed it. That happened on the same screen whose official eSTAR panel had already chosen the IVD form.

## The change

`EstarFilingPanel` takes `defaultVariant`, starts from it, and restarts when the project or the variant changes.
`K510Surface`, `PmaSurface` and `IvdSurface` pass `officialEstarVariantFor(program)`, the rule their official eSTAR
panel uses. The select stays, for a project whose product type nobody recorded. Without the prop the panel reads as a
device, as before.

## Proof

| | Result |
|---|---|
| red (`red/before-the-fix.txt`) | "an IVD program's panel starts on the IVD form" fails: `expected 'device' to be 'ivd'`. |
| green (`green/the-test.txt`) | `mdx/__tests__/estarFilingSignature.test.tsx`, all cases pass. |
| collateral (`green/mdx-suites.txt`) | Every `mdx/` suite: 98 of 100 files, 1,000 of 1,009 tests. The 9 failures are the ones recorded as already failing in slice 1 (`OfficialEstarPanel.attachments` 8, `useMdxPrograms.productType` 1). |
| gates | The hook's warning ratchet shows no file changing its warning count. `typecheck-no-regression` finds 0 errors. |
