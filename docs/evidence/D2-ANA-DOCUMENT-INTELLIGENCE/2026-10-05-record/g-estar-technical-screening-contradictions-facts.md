# g-estar-technical-screening-contradictions: facts relied on

Step: eSTAR technical screening flags answers that contradict authored content.
Verified finding: `verified-all.json[62]` (`devices-assemble-submission-project-scope`), corrected proposal items 4 and 5.

Checked 2026-10-05. fda.gov is blocked for fetch in this environment, so nothing
below is a verbatim read of an FDA page. A search extract of an FDA-hosted page
is labelled **recall (fda.gov search extract)**. It is not presented as
regulator text.

## Regulatory facts

| # | Fact | Basis | Source | Checked |
|---|---|---|---|---|
| 1 | FDA runs a technical screening on a 510(k) eSTAR, anticipated within 15 calendar days of receipt. It verifies that the eSTAR responses accurately describe the device. FDA's example is that there are in fact no tissue-contacting components if the eSTAR says so. It also verifies that each applicable attachment-type question has at least one relevant attachment. FDA's example is a Software Description attachment when software applies. | recall (fda.gov search extract of the guidance "Electronic Submission Template for Medical Device 510(k) Submissions") | https://www.fda.gov/media/152429/download | 2026-10-05 |
| 2 | eSTAR submissions are not anticipated to undergo refuse-to-accept (RTA). If an eSTAR fails technical screening, for example because an inaccurate response was given to a question, it may be put on a technical-screening hold for up to 180 days. If no replacement eSTAR arrives within 180 days of the deficiency notification, FDA considers the submission withdrawn. | recall (fda.gov search extract of the "510(k) Submission Process" page and the guidance in row 1) | https://www.fda.gov/medical-devices/premarket-notification-510k/510k-submission-process | 2026-10-05 |
| 3 | De Novo has its own eSTAR guidance with the same template mechanics. This step applies the technical-screening wording to De Novo on that basis. The De Novo text was not read. | recall (fda.gov search result title only) | https://www.fda.gov/media/172450/download | 2026-10-05 |
| 4 | FDA's premarket cybersecurity guidance covers devices with cybersecurity considerations. That includes, but is not limited to, devices that contain software (including firmware) or programmable logic, whether or not they are network-enabled. Cyber devices under §524B are a subset of the devices it covers. | recall (fda.gov search extract of "Cybersecurity in Medical Devices: Quality Management System Considerations and Content of Premarket Submissions") | https://www.fda.gov/regulatory-information/search-fda-guidance-documents/cybersecurity-medical-devices-quality-system-considerations-and-content-premarket-submissions | 2026-10-05 |
| 5 | Under §524B a premarket submission for a cyber device must include cybersecurity information. FDA's 2023 refuse-to-accept policy for cyber devices applied to submissions on or after 2023-10-01. | recall (fda.gov search extract: FDA Roundup 2023-03-31, and "Section 524B of the FD&C Act") | https://www.fda.gov/news-events/press-announcements/fda-roundup-march-31-2023 | 2026-10-05 |
| 6 | PMA filing review falls under 21 CFR 814.42. | **recall**, not checked against regulator text | none | none |
| 7 | Shelf life and packaging are owed by non-sterile devices too, so they say nothing about whether a device is supplied sterile. A device supplied non-sterile and sterilized by the user validates that in its reprocessing content. | **recall** (domain knowledge), not checked against regulator text | none | none |

## How the code uses them

- **Fact 1, the accuracy half: new.** `mapToEstar` (`server/services/pathway-engines/estar/estar-mapper.ts`) now returns `summary.contradictions`. Each entry is a slot whose flag the program answered "no" (`applicability: 'not-applicable'`) while a **substantive** leaf matches it. Contradictions block `summary.ready`. `assembleDeviceSubmission` names each one as a blocker, giving the slot, the question and the authored section codes, so `canProduceOfficialEstar` is false.
- **Fact 1, the attachment half: unchanged.** It is the flag-driven `missingRequired`, which already blocks. No second list was added (verified finding, correction 1).
- **What does not count as a contradiction.**
  - An unanswered flag is `undetermined`, never "no", so it cannot be contradicted.
  - A draft leaf (`substantive` not true) is not a claim about the device.
- **Facts 2, 3 and 6: wording.** "RTA-style" is gone from the 510(k) and De Novo paths: the mapper header, the biocompatibility note, the cybersecurity slot authority, and the assembly comments. The assembly's section-completeness comment now says filing review for a PMA (fact 6, recall). No PMA string changed.
- **Fact 4: cybersecurity is excluded.** The cybersecurity slot is excluded from contradiction checks (`screenedAs(..., null)`). Cybersecurity documentation on a device that is not a §524B cyber device is expected.
- **Fact 5: the cybersecurity authority string.** It now reads: "FD&C Act §524B — required in a premarket submission for a cyber device. For an eSTAR, FDA's technical screening checks that the attachment is there." That claim relies on facts 1 and 5.
- **Fact 7: sterilization is narrowed.** Only leaves about sterilization count as contradicting "not sterile". Shelf-life and packaging leaves do not, and neither do reprocessing or reuse leaves.
- **No biocompatibility contradiction.** No patient-contact flag exists (`estar-mapper.ts` keeps biocompatibility always-required). Adding one is a founder or intake decision, per the verified finding.

## Known limits

- **The mapper cannot see section bodies.** It sees only titles, document types and the `substantive` bit. A section that is approved and longer than 40 characters, but only says "Not applicable — the device is supplied non-sterile", is reported as a contradiction. The blocker says how to clear it: correct the answer, or remove the section if it only records that it does not apply. That is the fail-closed direction. A false "consistent" verdict would let FDA's screening find the problem instead.

## Code facts (read at HEAD b0d43373, working copy)

- Before the change, `mapToEstar`'s `summary` was `{ missingRequired, undetermined, checkApplicability, ready }`, and nothing compared a "no" flag with authored content. Red: 10 of 11 tests failed (`g-estar-technical-screening-contradictions-red.txt`).
- **Readers of `summary.ready`:** `estar-filing-readiness.ts:137-139`, `device-ivd-cockpit/cockpit.ts:86`, `pathway-engines/index.ts:135-146` and `pathway-manifest.ts:176-178`. They now see `ready: false` when there is a contradiction. None of them names the contradiction yet (see needs_elsewhere).
