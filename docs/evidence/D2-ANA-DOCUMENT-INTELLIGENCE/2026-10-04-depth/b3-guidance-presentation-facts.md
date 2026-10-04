# b3-guidance-presentation — regulatory facts relied on (checked 2026-10-04)

Regulator sites are blocked for direct fetch in this environment. Each fact
below was confirmed through a web search restricted to regulator-hosted
domains (fda.gov, database.ich.org) on 2026-10-04; the URL is the
regulator-hosted result the fact came from. Anything not so confirmed is
labelled **recall**.

## 1. ISS / ISE placement (pre-NDA / pre-BLA briefing components MTG-EFF, MTG-SAFETY)

Source: FDA, *Placement of Integrated Summaries of Safety and Effectiveness
(ISS/ISE) in Applications Submitted in the eCTD Format* —
https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/placement-integrated-summaries-safety-and-effectiveness-issise-applications-submitted-ectd-format
(regulator-text; already research.md E10; encoded as `FDA_ISS_ISE_PLACEMENT`
in `server/services/ind/ctd/submission-chain.ts`).

- In an eCTD the ISE and ISS go in Module 5, section 5.3.5.3 (Reports of
  Analyses of Data from More than One Study).
- The Module 2 CTD summaries are not the location for the ISS/ISE required by
  21 CFR 314.50(d)(5)(v)/(vi)(a); assuming 2.7.3/2.7.4 satisfy the requirement
  can lead to a refuse-to-file.
- If the narrative portions are suitable for 2.7.3 / 2.7.4 they may be placed
  there once and referenced from 5.3.5.3. Either way the ISS/ISE are filed
  under 5.3.5.3; 2.7.3 / 2.7.4 summarize.

In-file canonical wording the change reuses
(`server/services/ind/ctd/lifecycle-document-types.ts`, before this change):

- NDA ISS component (:2199): "submitted in Module 5.3.5.3 with a summary in Module 2.7.4."
- NDA ISE component (:2221): "submitted in Module 5.3.5.3 with a summary in Module 2.7.3."
- BLA ISS component (:2396): "submitted in Module 5.3.5.3 with a summary in Module 2.7.4."
- BLA ISE component (:2418): "submitted in Module 5.3.5.3 with a summary in Module 2.7.3."
- `iss` / `ise` lifecycle types (:2811, :2974): "lives in eCTD Section 5.3.5.3".

M4E(R2) defines 2.7.3 and 2.7.4 (Summary of Clinical Efficacy / Safety); it
does not define the ISE or ISS, which are FDA requirements (21 CFR 314.50).
The pre-NDA wording "integrated summary of effectiveness per ICH M4E(R2)" was
therefore removed.

## 2. ICH M4E(R2) 2.5.6 Benefits and Risks Conclusions

Sources (regulator-text): ICH M4E(R2) —
https://database.ich.org/sites/default/files/M4E_R2__Guideline.pdf ;
FDA-published copy — https://www.fda.gov/media/93569/download ;
ICH Step 4 presentation — https://database.ich.org/sites/default/files/M4E_R2_Step4_Presentation.pdf

- 2.5.6 is titled "Benefits and Risks Conclusions"; its purpose is a
  succinct, integrated, and clearly explained benefit-risk assessment of the
  medicinal product for its intended use, based on weighing the key benefits
  and key risks. Summary tables or graphical displays may be used.
- Headings: 2.5.6.1 Therapeutic Context (2.5.6.1.1 Disease or Condition;
  2.5.6.1.2 Current Therapies); 2.5.6.2 Benefits; 2.5.6.3 Risks;
  2.5.6.4 Benefit-Risk Assessment; 2.5.6.5 Appendix.
- Therapeutic context covers the disease aspects most relevant to the intended
  population across the spectrum of severity, the major therapies and the
  medical need. Information on the benefits and risks of the medicinal product
  is not included in the therapeutic context; it is discussed in 2.5.6.2 and
  2.5.6.3.
- 2.5.6.4 is the applicant's conclusion and begins with a succinct explanation
  of the reasoning; quantitative methods are optional, with a written summary
  here and the detailed methods/results (e.g. effects table, value tree, forest
  plot) in 2.5.6.5.

The child headings need no codes of their own: `resolveSectionBriefSource`
(`server/services/ind/ctd/section-brief.ts`) briefs 2.5.6.x as its nearest
registered ancestor, 2.5.6.

## 3. FDA Benefit-Risk Framework

Sources (regulator-text): FDA guidance *Benefit-Risk Assessment for New Drug
and Biological Products* — https://www.fda.gov/media/152544/download ;
*Benefit-Risk Assessment in Drug Regulatory Decision-Making* (PDUFA VI
implementation plan) —
https://www.fda.gov/files/about%20fda/published/Benefit-Risk-Assessment-in-Drug-Regulatory-Decision-Making.pdf ;
*Benefit-Risk Framework Implementation* (2017) — https://www.fda.gov/media/109405/download

- The Benefit-Risk Dimensions are Analysis of Condition, Current Treatment
  Options, Benefit, and Risk and Risk Management (four dimensions; "Risk and
  Risk Management" is one).
- The Benefit-Risk Integrated Assessment ties the dimensions together in the
  context of the severity of the condition and current medical need.

The statement that the M4E(R2) 2.5.6 headings "map onto" these dimensions is a
**platform-convention** reading (2.5.6.1.1 ↔ Analysis of Condition,
2.5.6.1.2 ↔ Current Treatment Options, 2.5.6.2 ↔ Benefit, 2.5.6.3/2.5.6.4 ↔
Risk and Risk Management), not regulator text. The placement of the BRF "in
section 1 of the integrated review template" was not confirmed and is **not
used**.

## 4. Section-brief presentation limits (platform code, not regulator text)

`server/services/ind/ctd/section-brief.ts`: `LIST_CAPS` mustContain 10,
pitfalls 6; authoringGuidance clipped at 900 characters. The 2.5.6 entry now
has 6 keyContentElements, 6 commonPitfalls and an 889-character
authoringGuidance, so every heading reaches the brief (asserted by
`tests/regulatory/ctd-guidance-presentation.test.ts`).
