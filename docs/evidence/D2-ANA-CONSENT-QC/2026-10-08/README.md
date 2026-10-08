# D2 — AnA's informed-consent QC checks what 21 CFR 50.25 requires, and cites ICH E6(R3) (2026-10-08)

Lane `…session_01SuVLo2`. This is the second slice of AnA's document expertise (founder-directed, 2026-10-08), found by the same map that found the SOP gap.

## Before (measured at `0b8a8c3d`)

`review_informed_consent` (`server/services/ana/gcp-consent.ts`) QCs a consent-form draft. It had four problems:

- **A required element was never checked.** 21 CFR 50.25(c), the ClinicalTrials.gov statement an applicable clinical trial's consent must carry.
- **Two additional elements were absent.** 50.25(b)(2) (circumstances in which the investigator may end participation without consent) and 50.25(b)(4) (the consequences of withdrawing).
- **The cues were single words.** "study" credited the research statement, so "Please read this before your next study visit" passed. "records" credited confidentiality, whose specific requirement, that FDA may inspect the records (50.25(a)(5)), was never looked for. A form could also be credited for "voluntary" without the "no penalty or loss of benefits" of (a)(8).
- **The guideline was out of date.** Every citation was ICH E6(R2), which E6(R3) superseded on 2025-01-06 (currency fact `ich-e6r3-gcp-step4`). The brief also reported a percentage ("90% of required elements detected") that read as a compliance score.

## After

- **Each element names the wording that satisfies it.** Every pattern in an element must occur in the text.
- **The missing elements are checked:** 50.25(c) as required, (b)(2) and (b)(4) as additional.
- **The brief reports counts.** It reads "N of M required elements found in the wording", and an element not found is one to read for, not a verdict.
- **The guideline in force.** The GCP domains and the consent basis cite ICH E6(R3) (principles; Annex 1 for the IRB/IEC, investigator and sponsor). The citations are labelled recall (`CONSENT_BASIS_NOTE`): eCFR and ich.org were not reachable from this environment.

## Red, then green

| Suite | Red on trunk | Green |
|---|---|---|
| `gcp-consent-elements.test.ts` (new) | `red/consent-elements.txt`: **6 of 6** | 6/6 |
| `gcp-consent.test.ts` (existing) | — | 5/5. Two pins restated: the sponsor citation is E6(R3); the "complete consent" fixture now carries the FDA-inspection note, "no penalty or loss of benefits" and the ClinicalTrials.gov statement, which it scored 100% without. |

`green/consent.txt`: 11/11. Typecheck shows 0 errors; no file gains a lint warning.

## Not done, recorded

- **Duplicates.** The consent elements exist in two more places: `protocol-consent/protocol-consent-logic.ts` (last changed by `…01GSjEDJ`, 2026-09-06) and the protocol rule pack's 50.25 checks. Folding them onto one record is the next step.
- **Out of scope.** 45 CFR 46.116 (the Common Rule's key-information section) and EU CTR consent requirements are not modelled.
