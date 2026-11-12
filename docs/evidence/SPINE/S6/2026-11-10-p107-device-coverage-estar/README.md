# S6: one rule for which sections a 510(k) or De Novo requires (P-107 item 3, 2026-11-10)

Package S6 of `docs/design/ONE_DESIGN_PLAN.md`, Vault at Veeva parity.

## The decision

`docs/LAUNCH_DEFINITION_OF_DONE.md`, P-107 item 3, decided 2026-11-08 under the founder's delegation:

> **Device coverage follows the eSTAR mapper's per-device slots**, the filing's own structure. The rule pack's
> mandatory flags converge onto the mapper, so one rule remains. The D4 and D6 disagreement is a defect, repaired red
> first.

## The defect

A 510(k) or De Novo is filed as an eSTAR. Which eSTAR sections a device owes turns on the device. The platform gave
two answers to "which sections does this filing require":

- **The rule pack's flag.** Each outline section carries `mandatory`, the same for every device
  (`fda-estar-510k-v1.1`, `fda-estar-denovo-v1.1`, `migrations/20261005c_k510_denovo_estar_outline_v1_1.sql`). The
  Vault's Library showed it as Required or Optional, and put a blocker on a mandatory section holding nothing.
- **The eSTAR mapper's slots** (`server/services/pathway-engines/estar/estar-mapper.ts`), each decided from the
  device answers the project gave at intake (`regulatory_programs.metadata.deviceFlags`). Filing readiness is read
  from them.

So a sterile device's Sterilization section (D4) read "Optional" in the Library while readiness reported it missing.
Risk management (D6) read "Optional" while readiness required it of every 510(k). The Library blocked on bench
testing (E5) while readiness, holding animal testing, did not.

`01-red.txt` names every section where the two differ, for two projects on real PostgreSQL: a sterile 510(k)
containing software (17 lines), and a De Novo whose device questions were never answered (13 lines).

### Every section where they differ, and which answer the repository supports

The template evidence is `00-template-structure.txt`: passages of the vendored FDA form
(`assets/estar-templates/eSTAR-510k-non-ivd.pdf`, nIVD v7.1), quoted by offset, and the field map.

**510(k), `fda-estar-510k-v1.1`**

| Section | Pack | Mapper | Which is right, and why |
|---|---|---|---|
| A8 Financial certification | optional | required when "Clinical data submitted" | The mapper. 21 CFR Part 54 (the pack's own label). The form asks "Was Clinical Evidence used in order to support this submission?" and files Form FDA-3454/3455 at CH1.12.03. |
| D4 Sterilization | optional | required when "Sterile" | The mapper. The form asks "Is the device or a component packaged as sterile?" and files Sterility Documentation at CH3.05.09.02. |
| D5 Shelf life and packaging | optional | the same slot as D4: required when "Sterile", and D4 or D5 supplies it | **Not settled for the mapper.** The form asks shelf life as its own question ("Does your device have a shelf-life?"), which intake does not ask. The mapper's own note says a non-sterile device owes shelf life too. The mapper's slot is coarser than the form. |
| D6 Benefits, risks and mitigation measures | optional | required of every 510(k) | **It turns on the 510(k) type, which the platform does not record** (`special_510k` and `abbreviated_510k` normalise to `510k`, `shared/constants/domain/device-classification.ts`). The form hides this section for a Traditional or Abbreviated 510(k) and shows it for a Special one (`ATRadioButton115`). So the pack is right for a Traditional or Abbreviated 510(k), and the mapper for a Special one. The mapper over-asks. `20261005c`'s header already said this "is the mapper's to correct". |
| E2 Software and firmware | optional | required when "Software / AI-ML" | The mapper. The form asks "Does the device use software/firmware?". |
| E3 Cybersecurity | optional | required when "Cyber device" | The mapper. FD&C Act section 524B (the pack's own label). |
| E5, E6, E7 Bench, animal, clinical testing | E5 mandatory, E6 and E7 optional | one slot, required of every 510(k); any of the three supplies it | The mapper, for a Traditional 510(k). The form asks each as its own question ("Was Bench Testing used…", "Was Animal Testing used…", "Was Clinical Evidence used…") and requires none by itself. For a Special 510(k) the form hides the whole section (see D6). |
| C1, C2 Substantial equivalence | both mandatory | one slot; either supplies it | Both say required. They differ on whether one is enough. The form takes the predicate as fields and one attachment, "Substantial Equivalence Comparison" (CH2.04.05), which is C2's content. The mapper lets C1 alone satisfy the slot. Not settled: the mapper's matcher is coarser than the form. |
| A4, A7, D3, E4, E8 | optional | when applicable (a property intake does not ask) | The mapper says what decides each: a consensus standard relied on, class III, a reusable device, an electrical or wireless device, critical tasks. The form asks its own question for standards, reprocessing, electrical safety and human factors. Neither rule blocks. |
| A2 Submitter, applicant and correspondent; B3 Classification, product code and regulation | mandatory | no slot | The form takes both as fields, and the platform fills them (`estar-field-map.ts`). The repository does not say an authored section is also owed. **Left to the pack.** |

**De Novo, `fda-estar-denovo-v1.1`**

| Section | Pack | Mapper | Which is right, and why |
|---|---|---|---|
| A5 Financial certification; D3 Sterilization, shelf life and packaging; D4 Software; D5 Cybersecurity | optional | required when the matching device question is answered yes | The mapper, as for the 510(k). |
| A6, D6, D9 | optional | when applicable | As above. |
| E1, E2 Labeling | E1 mandatory, E2 optional | one slot; either supplies it | Both say labeling is required. The mapper's matcher takes both sections. |
| C2 Proposed classification and regulation; C4 Benefit-risk considerations | mandatory | no slot | **The pack.** For a De Novo the form shows the proposed classification and the benefit-risk discussion (`Classification.USAProposedClassification`, `RiskManagement.BenefitRisk`). The mapper has no slot for them, so readiness does not count them. **Left to the pack.** |
| B2 Components, accessories and specifications | mandatory | no slot | Not settled. The form has a "Components and Accessories" attachment (CH2.04.01); the repository does not show it is owed by every device. **Left to the pack.** |
| D7 Animal studies; D8 Clinical performance data | optional | no slot | The performance-testing matcher does not take these two labels, so a De Novo with only D8 written reads performance testing missing. A matcher gap. Left to the pack (optional). |

The mapper also has slots no outline section supplies: combination product, implant labeling and the CLIA waiver in
both outlines; reprocessing and the Class III certification in the De Novo outline; and, for an IVD 510(k), nine of
the ten IVD performance slots, analytical performance among them (MDX journey M6(a); P-114 item 5 gives the IVD its
own outline).

## What already exists

**Readers of the pack's `mandatory` flag, for a device filing**

| Reader | Path | What it does with the flag |
|---|---|---|
| The Vault's Library | `server/routes/c2c/project-vault.ts`, `documentFolder` → `sectionsToNodes` → `leafDoc` | Required or Optional on each section; "Mandatory section — no content yet" and a blocker |
| The Vault cabinet's binder headings | `server/services/vault/vault-folders.ts` `binderNodes`; `binderNode` in `project-vault.ts` | `required: true` on a heading. The client type carries it (`surfaces/vaultFolders.ts`); nothing renders it |
| The editor's outline | `server/services/c2c/document-outline.ts` `withLive`; client `useFilingOutline.ts`, `editor/DocumentWorkbench.tsx`, `editor/startOutlineSection.ts` | Marks an unstarted mandatory node; "required, not started" |
| The stored copy | `c2c_document_sections.mandatory`, written at scaffold (`scaffold-project-documents.ts`, `add-project-market.ts`, `routes/c2c/documents.ts`) | Read by the four below |
| A section read | `server/routes/c2c/documents.ts`, `GET /:id/sections/:key` | Returns it |
| Engineering | `server/routes/mdx-engineering.ts` | "What's blocking your documents" blocks on a mandatory section not started; the share of mandatory sections approved |
| The 510(k) document preview | `server/routes/k510-document-preview.ts`, through `loadGovernedSectionRows` | `isRequired` |
| AnA | `read_governed_document`, `server/services/ana/AnaToolExecutor.ts` | Returns each section's flag |
| Required CTD sections | `server/services/ectd/required-sections.ts` | CTD-numbered packs only; it drops a device pack's sections and says so. `vault-coverage.ts` therefore gives a device filing no count and points to the Library |

**Readers of the mapper's slots**

- Filing readiness: `estar-filing-readiness.ts` `assessEstarFilingReadiness`, from `/api/510k/estar/filing-readiness`
  (`server/routes/510k-estar-routes.ts`; Submission Center's `DeviceFilings.tsx`, `mdx/surfaces/EstarFilingPanel.tsx`).
- Assembly: `device-assembly/assemble-device-submission.ts`; `pathway-engines/index.ts`; `device-ivd-cockpit/cockpit.ts`.
- Required documents: `market-specs/submission-requirements.ts` (`estarSlots`, `slotApplicability`). The device
  readiness scorecard (`market-specs/device-readiness-scorecard.ts`) takes its required-document count from there. It
  does not read the pack's flag, so it is unchanged.
- `medical-device/medical-device-knowledge.ts`; `ana-advisory/device-market-advisor.ts`.
- The device answers: `program-device-flags.ts` (`loadProgramDeviceFlags`, `deviceFlagsFromMetadata`), also read by
  `gspr-postmarket/*`, `routes/mdx-software.ts` and `submission-service/submission-request-read.ts`.

**Already measured.** `tests/schema-contract/estar-mapper-matches-shipped-outlines.contract.test.ts` holds the map
from each outline node to the slot it supplies. It scores a fully authored outline; it does not compare the flags.

**The device lane.** `.design/client-journey/MDX_JOURNEY_2026-11-01.md` M6 and P-114 item 5 (an IVD 510(k) gets its
own outline). Nothing here contradicts them. `.design/claude-convergence/COORDINATION.md` row "P-107 item 3" holds
`pathway-engines/estar/**` for this lane.

Searches run: `mandatory` and `required_sections` over `server`, `shared` and `client/src/concept2cure`; `estarSlots`,
`mapToEstar`, `slotApplicability`, `loadProgramDeviceFlags`, `deviceFlagsFromMetadata`; `'Required'`, `'Optional'` and
`.blocker` in the Vault's client files; `D4 and D6` over the repository; `RiskManagement.presence` and the question
captions in the vendored template.

## What changed

**One function answers** (`server/services/pathway-engines/estar/estar-outline-requirements.ts`, new, inside the
existing folder): `estarOutlineRequirements({ type, variant, flags, sections })`.

- The outline's sections are put to `mapToEstar` as readiness puts authored sections to it, with the same leaf and
  the same matchers. Nothing about what the eSTAR requires is written in the new file.
- **The mapper decides every section one of its slots takes**: required, not decided (the device question has no
  answer), when applicable, not applicable (the answer was no, and content there would contradict it), or optional
  (the answer was no, and content there contradicts nothing).
- Where several sections supply one slot, it is one requirement: "Required: one of E5, E6, E7". Content in any one
  clears the blocker on all, as in readiness.
- **A section no slot takes keeps its pack's flag**, and its answer says so (`decidedBy: 'pack'`). This is narrower
  than the decision's words; see "Not done here". The mandatory ones are pinned by test: 510(k) A2 and B3; De Novo
  B2, C2 and C4.
- Slots no section supplies are returned as `unplaced`, not dropped.
- `estarFilingType(docType, agency)` says whether an eSTAR applies: `k510:fda` and `denovo:fda`. For PMA, EU MDR, IVDR
  and every CTD filing it is null and the pack's flag is the rule, unchanged.

**The Vault follows it** (`server/routes/c2c/project-vault.ts`: `leafDoc`, `sectionsToNodes`, `documentFolder`, the
loop that calls them, and two imports). For a 510(k) or De Novo document the Library's mark, the reason in the
preview line and the blocker are the function's answer. The device answers are read once per request by the existing
`loadProgramDeviceFlags`, and only when the project holds such a document (`estarDeviceAnswers`, in the same new
file, with the reader passed in). A failed read fails the Vault read (500); it is never shown as "not answered".

**The seeded outline is not changed.** No migration, no new pack version: a constant flag per section cannot hold a
per-device answer, so only a read-side rule can make one rule remain (RULE 1).

**One small move inside the folder.** `leafDocumentType` (the token the mapper's matchers compare) moved from
`estar-content-leaves.ts` into `estar-mapper.ts` and is exported, so both leaf builders use one spelling.

No route, table, mount, AnA tool or screen is added. No fixture of an existing suite was changed.

## Evidence

| File | What it shows |
|---|---|
| `00-template-structure.txt` | The vendored form's passages for the 510(k) type and De Novo, its gating questions, its attachment slots, and the field map lines |
| `01-red.txt` | The three new suites on the unchanged code. Real PostgreSQL, through the real Vault read: 7 of 12 fail, and name every differing section. The route with a mocked database: 4 of 7 fail. The rule's suite does not load (the module did not exist) |
| `02-green.txt` | The same suites with the change: 12 of 12, 7 of 7, 52 of 52 |
| `03-suites.txt` | The existing suites that cover these files, with counts per file, and the gates |

The cases that pass before and after are the guards: PMA, EU MDR and IVDR keep the pack's flag, and the sections no
slot takes keep theirs.

## Not done here

**Readers not moved.** Each is outside this slice's files. The change for each:

- **The editor's outline** (`server/services/c2c/document-outline.ts`, `readDocumentOutline`): for a document where
  `estarFilingType(doc.doc_type, doc.agency)` is not null, load the project's device answers and set each node's
  `mandatory` from `answer.requirement === 'required'`, carrying `mark` and `reason` for `useFilingOutline.ts` and
  `DocumentWorkbench.tsx` to show.
- **Engineering** (`server/routes/mdx-engineering.ts`), the device lane's: block where `answer.blocker` is set, and
  count `answer.requirement === 'required'`, in place of the stored `mandatory`.
- **The 510(k) preview** (`server/routes/k510-document-preview.ts`): `isRequired` from the same answer.
- **AnA's `read_governed_document`**: return each section's `mark` for a 510(k) or De Novo.
- **The cabinet's binder headings** (`binderNode` in `project-vault.ts`): `required` from the same answer. Nothing
  renders that field today.
- **`client/src/concept2cure/v2/surfaces/Vault.tsx`** needs no change for the marks: it prints the server's string.
  To show the `unplaced` slots it would render a filing document's `note` as it does the cabinet's
  (`vault-binder-note`). No response field was added that nothing renders.
- **`server/services/vault/vault-coverage.ts`** needs no change: its sentence still holds. With one rule a count
  ("required sections with content") could be given for a device filing, from the same function.
- **`server/services/ectd/required-sections.ts`**: no change needed.

**Decisions this slice did not take.** Each changes a readiness verdict, so each is the device lane's.

1. **Sections no slot takes.** The decision says the pack converges onto the mapper. Read to the letter, A2, B3 (510(k))
   and B2, C2, C4 (De Novo) would lose "Required", because the mapper is silent on them. For C2 and C4 the form shows
   the section, so that would under-ask. They stay on the pack. To finish: give the mapper slots for them, or decide
   they are not owed; then delete the fallback (`packAnswer`).
2. **D6 on a Traditional or Abbreviated 510(k).** The Library now marks it Required, as readiness already did. The
   form hides it. The fix is in the mapper: record the 510(k) type at intake, or make the slot "when applicable".
   *Decided 2026-11-10 (P-123, session `01QoxbLZMS…`, under the founder's delegation of this lane's open calls):* the
   slot is "when applicable" (a Special 510(k)), so D6 now reads "When applicable" and does not block. Recording the
   510(k) type at intake remains open, the device lane's.
3. **Slots several sections supply** (C1 or C2; D4 or D5; E5, E6 or E7; De Novo E1 or E2). The Library now says "one
   of", which is what readiness does. A predicate section alone satisfies substantial equivalence, and shelf life
   alone satisfies sterilization for a sterile device. Splitting them needs separate slots.
4. **De Novo D7 and D8** supply no slot (the matcher gap above).

**Unchanged on purpose.** The Library's blocker still asks whether a section holds any content ("no content yet").
Readiness asks for finished content. That is a difference in a section's state, not in which sections are required.

**Opened in the running app** (the lead, 2026-11-10; `running-app-outline-marks.png`). The seeded demo 510(k)
answered yes to software, cyber device and clinical data, and no to sterile. Its outline in the Library read:
D4 Sterilization "Not applicable"; E2, E3 and A8 "Required"; D6 "Required"; E5, E6 and E7 each "Required: one of E5,
E6, E7"; E4 and E8 "When applicable". The record of E1 said "required of every 510(k)" and "Mandatory section — no
content yet".

**Not verified.**

- `tsc` was not run (the lead runs it).
- "Not decided" was not seen in the running app: the demo project has answered its device questions.
- `tests/db/project-vault-secondary-access.dbtest.ts` refuses any database but its own
  (`platform_ci_native_recheck_20261013`), so it did not run here.
