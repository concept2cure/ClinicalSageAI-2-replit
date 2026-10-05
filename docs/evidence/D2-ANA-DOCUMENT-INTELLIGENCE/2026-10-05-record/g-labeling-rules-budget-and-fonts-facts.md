# g-labeling-rules-budget-and-fonts — facts relied on

Checked 2026-10-05. Regulator sites are blocked for direct fetch here; each
fact marked **regulator-text** was confirmed through web-search results served
from the regulator-hosted URL given. Recall is labelled as recall.

## What this step changed, and what it did not

| Follow-up | Status | Where |
|---|---|---|
| F11 — `list_fda_technical_rules('labeling')` rendered 4886 of RESULT_BUDGET's 5000 characters, so the next 201.57 rule would push it over | **Done.** Wording of `PLR_FORMAT_RULES` shortened to 4492 characters (≤ 4500 headroom). No rule, paragraph, verbatim string, limit or eCFR URL was dropped. | `server/services/ind/ctd/fda-technical-rules.ts`; test `server/services/ana/__tests__/fda-rules-labeling-budget.test.ts` |
| F12a — `highlightsFontSize` and `fpiMinFontSize` share one string | **Not done — outside this step's files.** Both fields are built in `server/services/labeling/labeling-intelligence-knowledge.ts:1271-1272` as `plrRule('plr-type-size')`. | needs_elsewhere |
| F12b — "Reference to Boxed Warning: bold, with inverted black triangle symbol" | **Verified wrong, not removed — outside this step's files.** Lives at `labeling-intelligence-knowledge.ts:1280` (boldingRules) and `:1423` (`symbolRequirements`). | needs_elsewhere |

## 21 CFR 201.57 — the paragraphs the font fields come from

URL: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-C/part-201/subpart-B/section-201.57

| Para. | Text | Confidence |
|---|---|---|
| (d)(6) | "The letter height or type size for all labeling information, headings, and subheadings set forth in paragraphs (a), (b), and (c) of this section must be a minimum of 8 points, except for labeling information that is on or within the package from which the drug is to be dispensed, which must be a minimum of 6 points." | regulator-text (eCFR, via search 2026-10-05) |
| (d)(8) | Highlights, except for the boxed warning, are limited to one-half page, assuming an 8½ × 11 inch page in two columns, single-spaced, in 8-point type with ½-inch margins. | regulator-text (b1-plr-rules-elsa-facts.md, 2026-10-04-depth) |

Consequence for F12a. (a) is Highlights, (b) Contents, (c) the FPI, so the
8-point minimum for **both** Highlights and FPI comes from (d)(6). The fields
should not share a string, but they cannot honestly cite different minima:

- `fpiMinFontSize`: FPI text, headings and subheadings at least 8-point; 6-point
  only for labeling on or within the dispensing package — **201.57(d)(6)**.
- `highlightsFontSize`: Highlights at least 8-point — **201.57(d)(6)**; the
  half-page Highlights limit is measured at 8-point type — **201.57(d)(8)**.

## The inverted black triangle

| Fact | URL | Confidence |
|---|---|---|
| FDA proposed an inverted black triangle in labeling for a new molecular entity, new biological product or new combination approved in the US for less than 3 years. After comments that the symbol is not universally understood, the final PLR rule (Federal Register Vol. 71, No. 15, 24 Jan 2006, doc. 06-545) declined it; labeling instead states "Initial U.S. Approval" ((a)(3)). | https://www.govinfo.gov/content/pkg/FR-2006-01-24/pdf/06-545.pdf ; https://www.federalregister.gov/documents/2006/01/24/06-545/requirements-on-content-and-format-of-labeling-for-human-prescription-drug-and-biological-products | regulator-text (Federal Register, via search 2026-10-05) |
| The triangle the PLR proposal used marked a new product, not a reference to the boxed warning. No text in 201.57 or the PLR guidance (https://www.fda.gov/files/drugs/published/Labeling-for-Human-Prescription-Drug-and-Biological-Products---Implementing-the-PLR-Content-and-Format-Requirements.pdf) was found requiring a triangle next to Highlights sections the boxed warning describes. | as above | regulator-text for the decline; the absence is a search result, not a citation |
| The inverted black triangle in current use is the EU additional-monitoring symbol (Regulation (EU) No 1235/2010, Directive 2010/84/EU). | — | recall |

So no facts row verifies the bolding rule; per the step it should go.

## Trimmed wording — every change, and why each keeps the fact

- Consequences that restated the source paragraph ("Does not meet 201.57(a)(1); …")
  keep only their substance; the paragraph is still printed as `source`.
- (a)(5): "listed at least 1 year after the change, then removed at the first
  printing after that year" — the regulation's period and removal point, unchanged.
- (d)(6): "6-point for labeling on or within the package the drug is dispensed
  from" — the same exception.
- Platform notes shortened; none changed its check level.

## Unrelated failure seen during the importer run

`tests/regulatory/requirements-resolver.test.ts` (R2 snapshot) failed on CSR
sections 12.2.2, 12.2.4, 14.3.1 … in the green run. `requirements-resolver.ts`
and every file under `server/services/ind/ctd/` other than `index.ts` do not
import `fda-technical-rules.ts`; the drift is another lane's in-progress CSR edit
in the shared checkout, not this change.
