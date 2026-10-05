# g-jp-data-claims-truth — the regulatory facts this step relies on

Step: remove the unsourced Japanese-data claims from
`server/services/cross-jurisdictional-intelligence.ts`, give every PMDA position
a basis, build the PMDA consultation rows of `global-ri/ha-meetings.ts` from
`ind/ctd/jp-programs.ts`, replace "RS Soudankai" in
`shared/constants/domain/regulatory-meeting-types.ts`, and stop the prompts
(`ana-ri/locale-overlays.ts`, `regulatory/defaultInstructionBuilder.ts`)
naming the pre-2025 "conditional early approval" (finding 50, verified item
`drugs-jp-pmd-act-2025-programs`).

**No regulator text was read.** On 2026-10-05, mhlw.go.jp, pmda.go.jp,
database.ich.org, fda.gov and ema.europa.eu all refused the CONNECT through the
egress proxy (403, `connect_rejected`). The only contact with those pages was
WebSearch. A search returns a title, a URL and a model-written summary, not the
page's text. Every fact below is therefore **recall**, either a search extract
or memory. Every basis this step adds is `confidence: 'recall'`, and the test
`server/services/__tests__/cross-jurisdictional-intelligence.jp.test.ts` pins
that. DECISIONS.md #26 says to ship these labelled recall rather than say
nothing.

| # | Fact as AnA now states it | Basis | Kind |
|---|---|---|---|
| 1 | Under ICH E5(R1), whether Japanese data (a bridging study, Japanese subjects in an MRCT, or neither) are needed is judged case by case, from the drug's sensitivity to ethnic factors. It is not a standing requirement. | Memory of ICH E5(R1) | recall |
| 2 | MHLW notice **医薬薬審発1225第2号**, dated **2023-12-25** (令和5年12月25日), covers drugs whose clinical development started overseas. It says a Japanese Phase 1 study before joining an MRCT is in principle not required, where safety and tolerability at the planned MRCT dose can be judged from existing data. | WebSearch on mhlw.go.jp and pmda.go.jp: [mhlw.go.jp/content/10601000/001270513.pdf](https://www.mhlw.go.jp/content/10601000/001270513.pdf), [pmda.go.jp/files/000266148.pdf](https://www.pmda.go.jp/files/000266148.pdf), [t_doc 00tc8153](https://www.mhlw.go.jp/web/t_doc?dataId=00tc8153&dataType=1&pageNo=1). The result titles give the number and date. The summary gives the "in principle not necessary … if safety and tolerability can be confirmed from available data" condition. | recall: search extract |
| 3 | ICH Q1A(R2) covers climatic zones I and II and was based on the climates of the three regions: EU, Japan and US. Long-term conditions are 25 °C/60% RH or 30 °C/65% RH. Data generated in one of the three regions are acceptable in the other two. The earlier engine text, "Zone IVa required for Japan", is therefore wrong. | WebSearch: [database.ich.org Q1A(R2) Guideline.pdf](https://database.ich.org/sites/default/files/Q1A(R2)%20Guideline.pdf), [fda.gov/media/71707/download](https://www.fda.gov/media/71707/download) (FDA's copy), [EMA step 5](https://www.ema.europa.eu/en/documents/scientific-guideline/ich-q-1-r2-stability-testing-new-drug-substances-and-products-step-5_en.pdf). Q1F, the zone III/IV guideline, was withdrawn ([Q1F explanatory note](https://database.ich.org/sites/default/files/Q1F_Explanatory_Note.pdf)). | recall: search extract |
| 4 | No Japan-specific comparator requirement is recorded; ICH E10 applies. The engine's earlier statement, "Japanese standard of care comparator required; dose-finding in Japanese subjects", had no basis and is deleted. | Memory of ICH E10. The absence of a recorded rule is a statement about AnA's record, not about the law. | recall |
| 5 | No Japan-specific QT study requirement is recorded; ICH E14 and the E14/S7B Q&As apply. The earlier "QT study in Japanese subjects" claim had no basis and is deleted. | Memory | recall |
| 6 | **Paediatric development plan**, an effort obligation, in force from 2026-05-01. The engine reads it from `jp-programs.ts` entry `jp-pediatric-development-plan`. | See g-jp-programs-record-facts.md #5–#6 | recall (carried) |
| 7 | **PMDA consultation names**: 事前面談, 治験相談, 第II相試験終了後相談, 申請前相談, 医薬品申請電子データ提出確認相談, RS戦略相談 and 小児用医薬品開発計画確認相談. ha-meetings reads them from `jp-programs.ts`. "RS Soudankai" is not a PMDA term. | See g-jp-programs-record-facts.md #7–#9 | recall (carried) |
| 8 | **Conditional approval** was revised by the 2025 PMD Act amendment (Act No. 37 of 2025, staged entry into force). The prompts now name it "conditional approval (amended 2025)" or 条件付き承認（2025年改正）. They do not restate its criteria; the deep dive points AnA to the `global_ri_expedited_programs` result. | See g-jp-programs-record-facts.md #1–#2 | recall (carried) |
| 9 | SAKIGAKE's statutory name is 先駆的医薬品指定. The Japanese cultural overlay used the pre-2019 scheme name, 先駆け審査指定. | See g-jp-programs-record-facts.md #10 | recall (carried) |
| 10 | Process validation, GMP inspection and the J-RMP: the PMDA positions are unchanged. They now carry recall bases (ICH Q8–Q10 with the PMD Act GMP conformity inspection; the MHLW RMP guidance with PMD Act adverse-reaction reporting). | Memory | recall |

## Reads owed (to raise any of these to `regulator-text`)

- The full text of 医薬薬審発1225第2号: either `001270513.pdf` (MHLW) or
  `000266148.pdf` (PMDA).
- ICH Q1A(R2), §1.3 and the long-term storage table: either the ICH or the FDA
  copy.
- ICH E5(R1), E10, E14 and the E14/S7B Q&As as implemented by MHLW.

## Not changed in this step (outside its files)

- `server/services/cross-jurisdictional-intelligence.ts`, device filing
  sequence: still says "PMDA requires Japanese clinical data for high-risk
  devices". The claim is unsourced, but it is about devices and outside this
  finding. It has no basis yet.
- Other places still say "conditional early approval":
  - `server/services/industry-context-templates.ts:302`;
  - `server/services/translation/terminology/domains/regulatory-ctd.ts:343-353`
    (term pair 条件付き早期承認);
  - `server/data/global-regulatory-authorities.json:157` ("Conditional Early
    Approval").
