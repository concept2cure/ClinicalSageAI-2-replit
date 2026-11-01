# MDX journey M10: Plan names an EU MDR or IVDR project by its technical documentation

From `.design/client-journey/MDX_JOURNEY_2026-11-01.md` M10. Plan: F1. The coordinator confirmed the change to
`ProjectMdxWorkflow.tsx`'s title, 2026-11-01.

## What already exists (RULE 3)

- **The title.** `v2/surfaces/ProjectMdxWorkflow.tsx` `mdxProjectPlan` names Plan's list "What this <filing>
  needs", from `FILING_LABELS` by the project's pathway. `filingToken` aliases `cer`, `mdr`, `mdrtd` and `eumdr` to
  `mdr`, and `ivdr`, `ivdrtd` and `euivdr` to `ivdr`.
- **What an EU MDR or IVDR project is.** The New project wizard (`Projects.tsx` `programTypeFor`) types the EU MDR
  technical documentation as `mdr`, a CER as `cer`, and the IVDR technical documentation (`EU_IVDR`,
  `global-document-registry.ts:122`) as `ivdr`.
- **No PER project.** A PER filing (`EU_PER`) is a bare `ivd` filing (`filing-catalog.ts:148`), which the wizard
  refuses.
- **What Plan lists.** `shared/regulatory/work-packages.ts:266-281` gives an `mdr` project the whole technical file:
  - classification, device description and GSPR, risk;
  - bench, software, the CER, usability, electrical safety, biocompatibility, sterility;
  - writing, manufacturing, labeling, QMS, and the Annex II/III assembly.

## The defect and the change

Every EU MDR technical documentation project was titled "What this EU MDR CER needs", and every IVDR one "What this
EU IVDR PER needs", while the list beneath named the whole technical file. They now read "What this EU MDR technical
documentation needs" and "What this EU IVDR technical documentation needs". A CER project keeps "EU MDR CER": its
name is read from the recorded filing, because its pathway aliases to `mdr`.

The existing test pinned the old IVDR title. Its expectation is corrected, with the reason written beside it.

## Proof

| | Result |
|---|---|
| red (`red/before-the-fix.txt`) | 2 of 19 fail: the MDR and IVDR titles. |
| green (`green/the-tests.txt`) | 56 files: 55 pass, 783 of 785 tests. |

**Already failing at HEAD, before this change.** `v2/__tests__/clientNamesSlice1.test.tsx` fails 2 with
`ProjectMdxWorkflow.tsx` restored to HEAD. It checks the registry's labels, and this change does not touch the
registry.
