# g-regional-module1-record: the facts this step relies on

Checked 2026-10-05. Change: `shared/regulatory/regional-module1.ts` (new record) and `server/services/regional-ctd-templates.ts` (now projects it).

Regulator hosts are blocked for WebFetch in this environment, so no regulator PDF was opened. The labels below mean:

- **regulator-text (vendored)**: read from a regulator artifact vendored in this repository.
- **regulator-text (search)**: a WebSearch result in this session pointed at the regulator-hosted URL, and its extract showed the heading. In the code these carry the note *"search extract of the regulator-hosted document; verbatim re-read owed"*.
- **recall**: not checked against regulator text. Every such heading carries a `recall` basis and is rendered as "recall — not checked against the regulator's text".

## US — FDA Module 1

| # | Fact | Basis | Used for |
|---|---|---|---|
| U1 | FDA publishes these US Module 1 headings as context-of-use codes: 1.1 forms, 1.2 cover letters, 1.3.2, 1.3.3, 1.3.4, 1.4.1–1.4.4, 1.12.1, 1.12.14, 1.14.1.1 draft carton and container labels, 1.14.1.2 annotated draft labeling text, 1.14.1.3 draft labeling text, 1.14.4.1, 1.14.4.2, 1.20. | regulator-text (vendored): FDA Module 1 eCTD v4.0 Controlled Vocabulary Package v1.1 (2026-06), `server/services/ectd/controlled-vocab/cv-v4-data.ts` `CV_CONTEXT_OF_USE`. | `fdaCv(code)` on exactly those nodes. The test derives the set from the vendored file, so a node is regulator-text if and only if its code is in the CV. |
| U2 | 1.3, 1.3.1, 1.3.5, 1.4, 1.5, 1.6, 1.9, 1.12, 1.13, 1.14, 1.14.1–1.14.4, 1.15 and 1.16 are FDA headings. | recall. Each number is implied by CV codes beneath it, but the CV does not list the heading or its title. | `US_PARENT` basis. |
| U3 | 1.1.1–1.1.4 (Forms 1571, 1572, 3674, 356h) are platform sub-keys filed under FDA heading 1.1. FDA publishes only `us_1.1`. | regulator-text (vendored) for "only us_1.1"; the sub-keys are a platform convention (verified finding 4). | `platformSubKeys` on US 1.1; `module1Heading('US','1.1.2')` is null. |
| U4 | Which US headings are required for which application (1.3.3/1.3.4/1.14.1 for NDA/BLA/ANDA; 1.14.4.x and 1.20 for an IND; 1.12.14 for all four). | recall. Moved unchanged from `FDA_TEMPLATE` and pinned by `fda-module1-numbering.test.ts`. | `applies`. The required sets the dispatch-readiness gate reads are pinned unchanged against HEAD. |
| U5 | A REMS is filed at 1.16 only when FDA requires one. | recall (FD&C Act 505-1). | US 1.16 `authority-dependent`. |

## EU — EU Module 1 eCTD Specification

| # | Fact | Basis | Used for |
|---|---|---|---|
| E1 | 1.3.1 SmPC, Labelling and Package Leaflet (`m1-3-1-spc-label-pl`); 1.3.2 Mock-up (`m1-3-2-mockup`); 1.3.3 Specimen (`m1-3-3-specimen`); 1.8.2 Risk-management System (`m1-8-2-risk-management-system`); 1.10 Information relating to Paediatrics (a copy of the PIP decision or waiver). | regulator-text (search): EU M1 eCTD Specification v3.1, June 2024, https://esubmission.ema.europa.eu/eumodule1/EU%20M1%20eCTD%20Spec%20v3.1%20-%20June%202024%20-%20final%20version.pdf. Re-searched this session; also in finding 39 and `g-required-sections-home-facts.md` row 1. | `EU_M1_V31` on those nodes. |
| E2 | 1.3.5 Product Information already approved in the Member States (`m1-3-5-approved`); 1.3.6 Braille (`m1-3-6-braille`, directory `m1/eu/13-pi/136-braille`). | regulator-text (search), the same v3.1 URL, this session. | New nodes EU 1.3.5 and 1.3.6, with `EU_M1_V31`. The step listed them as recall; the search extract showed both element names, so they carry the spec basis and this row. |
| E3 | 1.5.3 is (Extended) Data/Market Exclusivity. | recall. The v3.1 search result referred to a 1.5.3 but did not show its title. | New node EU 1.5.3, `EU_RECALL`. |
| E4 | In eCTD no table of contents is required; the XML backbone acts as one. EU 1.1 is therefore not an eCTD item. | regulator-text (search), recorded in `g-required-sections-home-facts.md` row 8: EMA eCTD Guidance v4.0, https://esubmission.ema.europa.eu/tiges/docs/eCTD%20Guidance%20v4%200-20160422-final.pdf. | EU 1.1 `notInEctd: true`, `when-applicable` (non-eCTD submissions only), so it is no longer projected as required. |
| E5 | From 1 October 2025 EMA accepts EU M1 v3.1 and v3.1.1; from 1 December 2025 only v3.1.1. | recall (secondary source in search results, extedo.com; not a regulator page). | A note on `EU_M1_V31` only. The v3.1.1 text was not read (DECISIONS.md #3 and #7). |
| E6 | 1.0, 1.2, 1.3.4, 1.4.x, 1.5, 1.5.1, 1.5.2, 1.6, 1.7.x, 1.8, 1.8.1 and 1.9 headings. | recall. Moved from `EMA_TEMPLATE`. | `EU_RECALL`. |
| E7 | Applicability: 1.7 applies only with an orphan designation; 1.10 applies under the paediatric obligation of Reg. (EC) 1901/2006 Art. 7, with the Art. 9 exemptions (Art. 10/10a, homeopathic, traditional herbal); 1.5.1 for bibliographic and 1.5.2 for generic, hybrid or biosimilar applications. | recall. | `conditional` with `orphan_designation`, `paediatric_obligation`, `bibliographic` and `generic_hybrid_biosimilar`. An unknown fact is reported as undetermined, never as "not required". |
| E8 | Not added, though recalled: 1.5.4 Exceptional Circumstances, 1.5.5 Conditional Marketing Authorisation, 1.6.1/1.6.2 ERA non-GMO/GMO. | recall | Not encoded. The step named only 1.3.5, 1.3.6 and 1.5.3. Owed: read v3.1.1. |

## JP — MHLW/PMDA CTD Module 1

| # | Fact | Basis | Used for |
|---|---|---|---|
| J1 | 1.8 is 添付文書（案） (the draft package insert). 1.12 is 添付資料一覧: the Module 3–5 materials listed with item number, title, document number and evaluation/reference status. 1.13 is その他. | regulator-text (search): MHLW notice amending 「新医薬品の製造販売の承認申請に際し承認申請書に添付すべき資料の作成要領について」 (薬生薬審発0705第4号, 2017-07-05), https://www.mhlw.go.jp/web/t_doc?dataId=00tc2799&dataType=1&pageNo=1. Search results this session. | `JP_SAKUSEI_YORYO` on JP 1.8, 1.12, 1.13 and on the JP tree's `spec`. |
| J2 | The draft risk management plan (医薬品リスク管理計画書（案）) filed with an approval application goes at CTD M1.11. | regulator-text (search): PMDA-hosted 薬食審査発0426第2号 / 薬食安発0426第1号 (2012-04-26; amended 2013-03-04 by 薬食審査発0304第1号), 医薬品リスク管理計画の策定について — the notice setting the format and submission procedure for the RMP guideline (医薬品リスク管理計画指針, a separate notice, 薬食安発0411第1号 / 薬食審査発0411第2号 of 2012-04-11), https://www.pmda.go.jp/files/000143712.pdf (title corrected in fix round 1 after review search, checked 2026-10-05; the search identified the document; its M1.11 statement came from a related search extract), and the PMDA example notice https://www.pmda.go.jp/files/000221872.pdf (also the basis in `g-fda-jnda-rule-pack-m1-v2-2-facts.md` J1). | `JP_RMP_GUIDANCE` and `JP_RMP_EXAMPLE` on JP 1.11. |
| J3 | 1.1–1.7, 1.9 and 1.10 headings. | recall. Moved from `PMDA_TEMPLATE`, not checked against the MHLW CTD notice. | `JP_RECALL`. |
| J4 | A J-RMP is expected with a new drug application. | recall | JP 1.11 is `when-applicable`, not required, as moved from `PMDA_TEMPLATE`. The jnda:pmda rule pack v2.2 marks 1.11 mandatory, also on recall. That delta is for the parity gate to record (DECISIONS.md #3 applies the same rule to maa:ema). |

## Role assignments (platform convention, not regulator text)

The `DocumentRole` on each node is how this platform says two headings hold the same document. `equivalentsOf` is derived from these roles:

- product information: US 1.14.1.3, EU 1.3.1, JP 1.8;
- RMP: EU 1.8.2, JP 1.11 (US REMS 1.16 is its own role);
- cover letter: US 1.2, EU 1.0;
- application form: US 1.1, EU 1.2, JP 1.2;
- packaging mock-up: US 1.14.1.1, EU 1.3.2;
- environmental: US 1.12.14, EU 1.6;
- paediatric: US 1.9, EU 1.10;
- patent: US 1.3.5, JP 1.4.

They are equivalences of function, not of content rules.
