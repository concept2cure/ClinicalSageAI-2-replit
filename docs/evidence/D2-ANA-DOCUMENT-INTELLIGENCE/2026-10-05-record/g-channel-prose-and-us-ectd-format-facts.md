# g-channel-prose-and-us-ectd-format: regulatory facts relied on

Step: `g-channel-prose-and-us-ectd-format` (lane eu-channel; findings 42 and 52).
Checked: 2026-10-05. WebFetch to regulator sites is blocked by egress, so every
"regulator text" row rests on regulator-hosted search results: the URL is on the
regulator's domain and the wording is the search snippet, not a fetched page.

This step adds no new regulator claim. It makes four restated strings read the
platform's existing answers:
- the EMA channel wording in `SUBMISSION_FORMATS.EMA.gateway`
  (`server/services/global-ri/electronic-submission-format.ts`);
- the per-filing channel from `submissionChannelFor`
  (`server/services/regulatory/registry/submittabilityCoverage.ts`);
- the dated fact `fda-ectd-v4-accepted`
  (`server/services/regulatory-currency/currency-registry.ts`).

| # | Fact | Basis | Source | Where it is used |
|---|---|---|---|---|
| 1 | From 1 March 2014 the eSubmission Gateway / Web Client is mandatory for all centralised-procedure eCTD submissions. Applicants do not send those submissions via CESP as well. | regulator text (EMA-hosted search results), as recorded in `g-submission-channel-function-facts.md` rows 1-2. Not re-searched in this step. | https://www.ema.europa.eu/en/news/esubmission-gateway-or-web-client-become-mandatory-all-ectd-submissions-through-centralised-procedure-2014 ; https://esubmission.ema.europa.eu/gateway/Q%20&%20A%20for%20EMA%20eSubmission%20Gateway.pdf | AnA's MAA step `maa-9` (`workflow-orchestration.ts`) reads the channel and applicant step from `submissionChannelFor(EU_MAA)`. The EU datasheet gateway (`market-submission-specs.ts` `eu-ectd`) and the SOP generator's EMA submission reference (`sop-generator.ts`) read `SUBMISSION_FORMATS.EMA.gateway`. |
| 2 | CESP is the channel for national, MRP and DCP procedures. | **recall**. Not verified on a regulator site. The repository already says it in `SUBMISSION_FORMATS.EMA.gateway` ("CESP for national procedures"), which is the wording now read. | — | This is the trailing parenthetical of the EU datasheet gateway and the SOP reference. The `ema-cesp.ts` header ("national, MRP and DCP procedures") was corrected by the dependency step `g-cesp-centralised-refusal` (c72a02f2). This step's test pins that header. |
| 3 | From 2024-09-16, CDER and CBER accept eCTD v4.0 for new applications (NDA, BLA, ANDA, IND, MF). Only new applications may be submitted in v4.0. Electronic submissions use a version FDA supports, either v3.2.2 or v4.0. | regulator text (fda.gov search results, 2026-10-05) | https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/electronic-common-technical-document-ectd-v40 ; https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/electronic-common-technical-document-ectd ; https://www.fda.gov/media/179700/download (eCTD v4.0 Technical Conformance Guide) | The US datasheet format (`market-submission-specs.ts` `us-ectd`) is now `eCTD v3.2.2 (eCTD v4.0 accepted voluntarily for new applications since <effectiveDate>)`. The date comes from the fact `fda-ectd-v4-accepted` (effectiveDate 2024-09-16, status in_force, lastVerified 2026-06-29). Its note says "VOLUNTARY … FDA has NOT announced a mandatory v4.0 date". Without that fact, or with a status other than in_force, the format reads `eCTD v3.2.2` and makes no v4.0 claim. |
| 4 | FDA has announced no mandatory eCTD v4.0 date. | **recall plus the currency fact's note**. The searched FDA pages show no mandate, but an absence is not regulator text. | — | This is why the parenthetical says "voluntarily". |

## Note on the red output

The red run asserted the US format as `eCTD v3.2.2 (eCTD v4.0 accepted voluntarily since <date>)`. After the FDA search (row 3), "for new applications" was added to the derived text and to the test's expectation. On HEAD the assertion fails on its first expectation either way: the format starts with `eCTD v4.0`.
