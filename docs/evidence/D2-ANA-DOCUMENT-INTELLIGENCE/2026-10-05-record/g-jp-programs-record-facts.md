# g-jp-programs-record — the regulatory facts this step relies on

Step: one Japanese programmes record, `server/services/ind/ctd/jp-programs.ts`,
read by `global-ri/expedited-programs.ts`, `global-ri/pediatric-requirements.ts`,
`global-ri/special-designations.ts` and
`regulatory-strategy/regulatory-strategy-knowledge.ts` (finding 50, verified
item `drugs-jp-pmd-act-2025-programs`).

**No regulator text was read.** WebFetch to mhlw.go.jp and pmda.go.jp is
egress-blocked in this environment. The only contact with the regulators' pages
was WebSearch restricted to those two hosts, on 2026-10-05. That gives a
result title, a URL and a model-written summary of the page, not the page's
text. Each fact below is therefore labelled **recall**: either a search extract
or memory. Every basis in the record is `confidence: 'recall'`, and the test
`jp-programs.test.ts` pins that. DECISIONS.md #26 says to ship these labelled
recall rather than say nothing.

| # | Fact as the record states it | Basis | Kind |
|---|---|---|---|
| 1 | The PMD Act was amended by Act No. 37 of 2025 (令和7年法律第37号), with staged entry into force. The provisions recorded here apply from **2026-05-01**. | WebSearch results on mhlw.go.jp: [newpage_58083.html](https://www.mhlw.go.jp/stf/newpage_58083.html) (amendment page), [001492021.pdf](https://www.mhlw.go.jp/content/11120000/001492021.pdf) (outline of Act No. 37 of 2025), [001424957.pdf](https://www.mhlw.go.jp/content/001424957.pdf) | recall: search extract |
| 2 | **Conditional approval** after the amendment: for a serious disease with no adequate alternative therapy, approval is possible at the exploratory-trial stage where clinical usefulness can be reasonably predicted. The approval carries conditions and can be revoked (取消し). | Same search. Summary text: "探索的臨床試験の段階で臨床的有用性が合理的に予測可能な場合…承認可能…取消し規定". [001371285.pdf](https://www.mhlw.go.jp/content/11120000/001371285.pdf) is the council's January 2025 summary. | recall: search extract |
| 3 | The amended conditional approval reportedly also covers medical devices and IVDs. **Not adopted**: `appliesTo` stays `['drug']`, and the basis note says the extension is unverified. | Search extract plus a secondary source (Baker McKenzie), per the verifier | recall: secondary; not used as fact |
| 4 | Under the earlier system, which the record says is replaced, confirmatory trials had to be difficult to conduct. The MHLW notice "医薬品の条件付き承認の取扱いについて" was partly revised on 2024-10-23 (医薬薬審発1023第2号). | Search result title on mhlw.go.jp ([t_doc 00tc8778](https://www.mhlw.go.jp/web/t_doc?dataId=00tc8778&dataType=1&pageNo=1)); memory | recall |
| 5 | **Paediatric development plan**: since 2026-05-01, a sponsor seeking approval of a drug that differs from an approved drug in active ingredient, indication, dosage or administration is to endeavour (**努力義務**) to draw up a paediatric development plan, have it confirmed by PMDA before the adult application, and develop it without delay. An effort obligation is not an approval prerequisite. | Search on mhlw.go.jp. The summary quotes the obligation as "…成人を対象とした医薬品の承認申請を行うまでに、PMDAの確認を受けるとともに、遅滞なく当該開発計画に基づいて開発を進めるよう努める". "Not an approval prerequisite" is memory of what 努力義務 means. | recall: search extract + memory |
| 6 | The MHLW notice 医薬薬審発0227第8号 (2026-02-27) applies from 2026-05-01. | Search result title only ([T260302I0120.pdf](https://www.mhlw.go.jp/hourei/doc/tsuchi/T260302I0120.pdf)); content not read. It is named in the basis `note`, not in `ref`. | recall: title only |
| 7 | **小児用医薬品開発計画確認相談** is a PMDA consultation for confirming the paediatric plan of a new active ingredient or new indication developed in adults. It was revised on 2026-02-27, and advice is given in writing in principle. | WebSearch on pmda.go.jp: [consultations/0118.html](https://www.pmda.go.jp/review-services/f2f-pre/consultations/0118.html) | recall: search extract |
| 8 | **RS戦略相談** is PMDA's regulatory science strategy consultation (PMDA does not call it "RS Soudankai"). | WebSearch on pmda.go.jp: [strategies/0005.html](https://www.pmda.go.jp/review-services/f2f-pre/strategies/0005.html) | recall: search extract |
| 9 | 事前面談, 治験相談 (including 第II相試験終了後相談 and 申請前相談), and 医薬品申請電子データ提出確認相談 are PMDA consultation types for new drugs. | WebSearch on pmda.go.jp: [consultations/0007.html](https://www.pmda.go.jp/review-services/f2f-pre/consultations/0007.html) (治験相談等 新医薬品) and memory for the individual names | recall |
| 10 | SAKIGAKE (先駆的医薬品指定) began as an MHLW scheme in 2015 (先駆け審査指定制度) and was placed in the PMD Act by the 2019 amendment. Its criteria are carried over unchanged from `expedited-programs.ts`. | Memory | recall |
| 11 | Orphan designation applies to fewer than 50,000 patients in Japan with high medical need. Priority review applies to serious diseases with high medical usefulness. Both texts are carried over unchanged. | Memory, carried over from the previous catalog | recall |

## Deliberately kept out of citation text (verifier's list)

- The article numbers "Art. 14-8-2" and "Enforcement Regulation Art. 69-2" are
  not verified. The test fails if a `ref` contains them.
- The attribution of `001663251.pdf` to the paediatric notice is not verified.
  The test fails if a `ref` contains it. The search returned `001663252.pdf`,
  an MHLW 事務連絡 of 2026-02-27; it is not cited.
- The PMDA outline amendment date of 2026-05-29: the search showed a PMDA
  implementation notice "最終改正 令和8年5月29日". It is not used.

## Reads owed (to raise any entry to `regulator-text`)

These pages need to be read in full: MHLW `newpage_58083.html`, the outline PDF
`001492021.pdf`, the notice `T260302I0120.pdf` (医薬薬審発0227第8号), and the
PMDA pages `consultations/0118.html`, `consultations/0007.html` and
`strategies/0005.html`.

Once an entry is raised, `jpProgramProblems()` requires its `checked` date to
be on or after `effectiveFrom`.
