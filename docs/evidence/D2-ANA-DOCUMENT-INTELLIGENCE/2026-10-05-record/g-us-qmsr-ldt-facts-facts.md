# g-us-qmsr-ldt-facts: the regulatory facts this step relies on

Checked 2026-10-05. Every regulator page below was reached through a WebSearch
result restricted to fda.gov, federalregister.gov and ecfr.gov. WebFetch to
regulator hosts is blocked in this environment, so no page was opened in full.
"Regulator text" below means the wording appeared in a search result served
from the regulator's own host, at the URL given.

## QMSR (fact `us-qmsr`)

| Fact | Basis | Source |
|---|---|---|
| The QMSR took effect on 2026-02-02. It amends the device CGMP requirements of 21 CFR 820 and incorporates ISO 13485:2016 by reference. | regulator text | https://www.fda.gov/medical-devices/postmarket-requirements-devices/quality-management-system-regulation-qmsr |
| The final rule is FR 2024-01709, published 2024-02-02. This is the fact's `sourceUrl`. | regulator text | https://www.federalregister.gov/documents/2024/02/02/2024-01709/medical-devices-quality-system-regulation-amendments |
| 21 CFR 820.10 requires a documented QMS that complies with ISO 13485 as incorporated by reference in 820.7. ISO 13485:2016 is incorporated by reference for 820.1, 820.3, 820.10, 820.35 and 820.45. | regulator text | the same FR document |
| References to 820.30 (design controls) were changed to the equivalent QMSR provision, 820.10(c). The QMSR does not use the terms "design controls" or "design validation"; their elements are in ISO 13485:2016 clause 7.3 and its subclauses. | regulator text | https://www.federalregister.gov/documents/2025/12/04/2025-21955/medical-devices-quality-management-system-regulation-technical-amendments and https://fda.gov/media/189041/download (FDA, "QMSR – Design and Development") |
| The QMSR does not use the terms DHF, DMR, DHR or QSR. Their elements are largely required to be documented by ISO 13485:2016 clause 4.2 and its subclauses and clause 7 and its subclauses. | regulator text (FDA-hosted copy of the FR rule) | https://www.fda.gov/media/177022/download |
| The removed sections are 820.20 to 820.250, and Part 820 is now 820.1/.3/.7/.10/.15/.35/.45. | **recall**, consistent with the verified-finding record (verified-all.json item 59) | — |
| ISO 13485:2016 §4.2.3 is titled "Medical device file". This is used only in the QMS_DMR description, as the clause where DMR content now sits. | **recall** (ISO text, not a regulator page; FDA's own text says "clause 4.2 and its subclauses") | — |

What the fact encodes:

- `supersedes` names the removed sections explicitly. It never uses a bare
  "21 CFR 820". `containsWords` would match that inside "21 CFR 820.10" and
  mark every current QMSR citation as superseded. The test pins this.
- `lastVerified` is 2026-10-05, the date of the search above.
- Fix round 1: `aliases` also carries "Quality System Regulation Amendments".
  That is the final rule's own Federal Register title, "Medical Devices;
  Quality System Regulation Amendments" (regulator text: the title of
  https://www.federalregister.gov/documents/2024/02/02/2024-01709/medical-devices-quality-system-regulation-amendments,
  89 FR 7496). "Quality System Regulation" is in `supersedes`, so without
  the alias the freshness check reported a citation of the current QMSR rule
  by its FR title as superseded by the QMSR. The alias exempts that title
  through `namedByAlias` and resolves it to `us-qmsr`. The test pins both
  titles. Red: 2 failed of 13. Green: 13 passed.
- Fix round 1: the keyword "device CGMP" is removed. Topic matching is by
  substring, so a drug CGMP question (21 CFR 210/211) also returned the device
  QMSR fact. "QMSR", "21 CFR 820" and "ISO 13485" still cover device queries.
  The test pins `findFacts({topic:'CGMP', jurisdiction:'US'})` without
  `us-qmsr`.

## LDT (existing fact `us-ldt-final-rule-void`, unchanged)

| Fact | Basis | Source |
|---|---|---|
| FDA's May 2024 final rule added "including when the manufacturer of these products is a laboratory" to 21 CFR 809.3(a). | regulator text | https://www.fda.gov/medical-devices/in-vitro-diagnostics/laboratory-developed-tests |
| On 2025-03-31 the E.D. Tex. entered final judgment in *American Clinical Laboratory Association v. FDA*, vacating and setting aside the rule. | regulator text | https://www.federalregister.gov/documents/2025/09/19/2025-18239/regulation-identification-number-0910-aj05-medical-devices-laboratory-developed-tests-implementation |
| On 2025-09-19 FDA's final rule removed those words and reverted 21 CFR 809.3(a) to its pre-2024 text. FDA called the action ministerial, reflecting the court's order. | regulator text | the same FR document |
| FDA did not appeal. | **recall / secondary** (verified-all.json item 60 cites search results). It is not stated in any regulator text reached here. | — |
| The VALID Act is proposed legislation only. | **recall** | — |
| LDTs are governed by CLIA (42 USC 263a; 42 CFR 493). | **recall** (statute citation) | — |

The wording follows the basis:

- The client text never says "FDA declined to appeal". It says the rule is
  void and that FDA implemented the judgment in its own regulations on
  2025-09-19. Both are regulator text.
- The US_LDT line "a test marketed as an IVD outside a single CLIA laboratory
  follows the IVD device pathways" is **recall** (the verified-finding
  proposal). It states the ordinary IVD device rule and makes no dated claim.

## Not done here (out of scope, recorded for other lanes)

- The `us-ldt-final-rule-void` note in the currency registry still says
  "Enforcement reverts to pre-2024 enforcement discretion". The client text in
  this change says "LDTs are governed by CLIA; no FDA premarket submission".
  These are two characterisations of one fact. Aligning the note means
  changing an existing fact's text, which is outside this step's plan.
- The legal-ivd pitfall on the vacatur is limited to what regulator text
  supports: FDA reverted 21 CFR 809.3(a) by final rule on 2025-09-19, so do not
  describe the 2024 rule as pending or reinstatable. It makes no claim about
  whether an appeal was or could be filed. That claim is recall only.

- The other removed-820 citations across the platform: 331 matches in 44
  non-test files, including `shared/regulatory/project-bootstrap.ts:887`
  "QSR (21 CFR 820) File" and `server/services/module-intelligence.ts:125`.
  These belong to the QMSR crosswalk and legacy-citation gate (item 59).
