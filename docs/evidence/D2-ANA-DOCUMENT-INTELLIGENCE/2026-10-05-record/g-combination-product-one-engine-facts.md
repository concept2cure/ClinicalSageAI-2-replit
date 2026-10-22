# g-combination-product-one-engine — facts relied on

Step: four engines classified combination products. After this step there is one:
`determinePrimaryModeOfAction` and `classifyCombinationProduct` in
`server/services/combination-products/combination-products-knowledge.ts`. The
global-ri classifier and the market-specs assessment now delegate to it. The
service's `determinePrimaryMode` has been deleted.

How these were checked: the container's egress proxy refuses www.ecfr.gov and
www.fda.gov (see the g-combination-product-4-4-callouts facts file). The rows marked
regulator-text come from WebSearch result extracts on 2026-10-05, restricted to
regulator hosts, each extract attributed to the eCFR or fda.gov page named. Following
the precedent of `shared/regulatory/qmsr-crosswalk.ts` and the 4.4 call-outs, the code
labels them `regulator-text` with the note "search extract of the eCFR section page;
verbatim re-read owed". **Owed:** someone with access should read each page verbatim.

eCFR Part 3 Subpart A: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-3/subpart-A

## Re-checked 2026-10-11 (re-land)

This step was written on 2026-10-05 and landed on 2026-10-11, so every fact below and
every date in it was re-checked on 2026-10-11 by WebSearch restricted to regulator hosts.
**Nothing changed status; no date in this file has gone stale, and no proposal below has
been adopted or withdrawn since 2026-10-05.** What was re-confirmed, and where:

| Re-checked | Result | Source seen 2026-10-11 |
|---|---|---|
| Rows 1-2 — 3.2(k) is "mode of action", 3.2(m) is "primary mode of action" | unchanged; the paragraph letters are still (k) and (m), and (m) is still "the single mode of action … that provides the most important therapeutic action" | eCFR 21 CFR 3.2 (search extract) |
| Row 4 — § 3.4 assigns by PMOA, with the similar-products fallback in 3.4(b) | unchanged | eCFR 21 CFR 3.4 (search extract) |
| Rows 5-7 — 3.5 is "Procedures for identifying the designated agency component", 3.7 is "Request for designation" (15 pages, pre-application), 3.8 is "Letter of designation" (5-working-day completeness screen, 60 days, sponsor's recommendation stands if no letter issues) | unchanged, all three; 3.5 is still not the RFD section | eCFR 21 CFR 3.5 / 3.7 / 3.8 (search extracts) |
| Row 8 — drug-eluting cardiovascular stents are CDRH-led because the stent's device mode of action is primary | unchanged; the jurisdictional update page is still live and still says CDRH has primary responsibility with CDER consulting | https://www.fda.gov/combination-products/jurisdictional-updates/jurisdictional-update-drug-eluting-cardiovascular-stents |
| Row 3 — 3.2(e)(1) names the pairings "drug/device, biologic/device, drug/biologic, or drug/device/biologic" | **newly confirmed on 2026-10-11** for (e)(1) as well as (e)(2); see the scoping note under row 3 | eCFR / Cornell LII 21 CFR 3.2 (search extracts) |

The container's egress proxy still refuses www.ecfr.gov and www.fda.gov for direct fetch,
so these remain search extracts of the regulator pages named, labelled `regulator-text`
with "verbatim re-read owed" — the same labelling trunk uses in
`server/services/global-ri/labeling-requirements.ts` and
`server/services/pathway-engines/estar/estar-versions.ts`. **Still owed:** a verbatim read
of each page by someone with direct access.

### Scoping correction to row 3, made on 2026-10-11 (review fix round 1)

Row 3 marks the "every 3.2(e) form requires two *different* article types" generalization
as **recall** for (e)(1), (e)(3) and (e)(4), but the code asserted it as checked regulator
text in two places. Both were scoped to what the regulation's own text says:

- the `21 CFR 3.2(e)` citation description (`combination-products-knowledge.ts`, SECTION 0)
  no longer says "each comprising two or more different regulated article types". It now
  names the pairings only where § 3.2 states them — (e)(1) "drug/device, biologic/device,
  drug/biologic, or drug/device/biologic" (confirmed 2026-10-11) and (e)(2) "drug and
  device, device and biological, or biological and drug products" — and names (e)(3) and
  (e)(4) without attributing the requirement to them. This matters because the entry
  carries a `regulator-text` basis, which `basisLabel()` renders to the user as "checked
  against the regulator's text".
- the single-article-type rationale in `classifyCombinationProduct` (SECTION 2) no longer
  says "every form in 21 CFR 3.2(e) … requires two different article types". It attributes
  the pairings to the text of (e)(1) and (e)(2) and says in the sentence itself that
  reading the cross-labeled forms the same way is this engine's reading, not the text of
  those two subparagraphs.

The engine's **behaviour** is unchanged and was already right: a single article type is
not a combination product in any form. FDA's own CGMP material states the general rule
("a combination product is not: a product comprised of only two or more of the same type
of human medical product"), but that is guidance, not § 3.2, so it is not cited as the
basis of a § 3.2 entry.

| # | Fact | Basis | Source | Checked |
|---|------|-------|--------|---------|
| 1 | 21 CFR 3.2(k): "Mode of action is the means by which a product achieves an intended therapeutic effect or action." | regulator-text, **search extract only** | https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-3/subpart-A/section-3.2 | 2026-10-05 |
| 2 | 21 CFR 3.2(m): the primary mode of action is "the single mode of action of a combination product that provides the most important therapeutic action of the combination product". The most important therapeutic action is the mode of action expected to make the greatest contribution to the overall intended therapeutic effects. | regulator-text, **search extract only** | eCFR 3.2 (above) | 2026-10-05 |
| 3 | 21 CFR 3.2(e)(2): co-packaged means "two or more separate products packaged together in a single package or as a unit and comprised of drug and device products, device and biological products, or biological and drug products". A single article type is therefore not a combination product in any 3.2(e) form. | regulator-text, **search extract only**, for (e)(2). That (e)(1), (e)(3) and (e)(4) also require different article types is **recall**. | eCFR 3.2 | 2026-10-05 |
| 4 | 21 CFR 3.4 (Designated agency component): the agency determines the PMOA and assigns the combination product to the Center with primary jurisdiction for that mode of action. Where the PMOA cannot be determined with reasonable certainty, it assigns the product to the Center that regulates other combination products presenting similar questions of safety and effectiveness. | regulator-text, **search extract only** | https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-3/subpart-A/section-3.4 | 2026-10-05 |
| 5 | 21 CFR 3.5 is "Procedures for identifying the designated agency component". It covers the intercenter agreements and points to § 3.7 when jurisdiction is unclear or in dispute. **It is not the RFD section.** | regulator-text, **search extract only** | https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-3/subpart-A/section-3.5 | 2026-10-05 |
| 6 | 21 CFR 3.7 is "Request for designation". The sponsor files it before any premarket application, in no more than 15 pages. | regulator-text, **search extract only** | https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-3/subpart-A/section-3.7 | 2026-10-05 |
| 7 | 21 CFR 3.8 is "Letter of designation". FDA reviews the RFD for completeness within 5 working days and issues a letter of designation within 60 days of filing. If no letter issues in that time, the sponsor's recommendation becomes the designation. | regulator-text, **search extract only** | https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-3/subpart-A/section-3.8 | 2026-10-05 |
| 8 | Drug-eluting coronary stents: the stent's device mode of action (keeping the vessel lumen open) is the PMOA, and the drug's role in preventing restenosis is secondary. FDA assigned CDRH primary responsibility, with CDER consulting. | regulator-text, **search extract only** | https://www.fda.gov/combination-products/jurisdictional-updates/jurisdictional-update-drug-eluting-cardiovascular-stents | 2026-10-05 |
| 9 | A prefilled syringe, an autoinjector or a transdermal patch delivering a small-molecule drug has a drug PMOA and is CDER-led. | **recall**. These are test fixtures only; no product row in the code states them. | — | — |
| 10 | Drug PMOA goes to CDER, device PMOA to CDRH, biological-product PMOA to CBER (with the 2003 transfer of therapeutic biologics to CDER noted). | **recall** for the Center names. Row 4 covers the PMOA-to-jurisdiction principle. | — | — |

Wrong facts this step removed or corrected:

- `combination-product-service.ts` `determinePrimaryMode` (served by
  GET /api/biologics/combination-products/classify and /requirements) listed
  "Drug-eluting stent (drug provides primary therapeutic effect)" as a CDER-led example
  (contradicts row 8). It cited the PMOA as "21 CFR 3.2(e)" (rows 2 and 4), and it
  turned any unknown primaryAction into "drug". The method is deleted. The routes now
  call `determinePrimaryModeOfAction` and answer 400 for an unknown primaryAction.
- The canonical engine cited mode of action as 3.2(m) (row 1: it is 3.2(k)), the RFD
  as 3.5 (row 6: 3.7) and the letter of designation as 3.7 (row 7: 3.8). It also
  called two devices co-packaged a combination product (row 3). For an unknown
  constituent type it silently assigned CDRH; it now throws.
- The global-ri classifier cited the RFD only as "21 CFR Part 3". It now cites 3.7
  and 3.8, with 3.2(m) in its citation string. An unknown PMOA used to come back as
  `leadCenter: undefined`; it now throws, and the route already answers that with 400.

Not changed here (named in needs_elsewhere): the `determine_primary_mode_of_action`
tool description in `server/services/ana/combinationProductsTools.ts:42` still says
"RFD, 21 CFR 3.5/3.7". It should read "RFD, 21 CFR 3.7; letter of designation 3.8".

Also named in needs_elsewhere (raised in review, 2026-10-11, out of this step's file list):
`centerForPmoaType` answers biologic → CBER for the whole platform. That is right for the
§ 351 biological products CBER retains, but for a therapeutic protein in a prefilled
syringe or autoinjector the lead Center is CDER under the 2003 transfer of therapeutic
biologics — today only a doc comment on the function, and **recall** (row 10), not
regulator text. Behaviour here is unchanged from before this step (all four engines said
CBER), but consolidating to one engine makes the one wrong answer authoritative, so it
needs its own step: either split the biologic article type with a regulator-hosted basis
for the transfer, or lower the engine's confidence and recommend an RFD (21 CFR 3.7) when
the PMOA constituent is a biologic.
