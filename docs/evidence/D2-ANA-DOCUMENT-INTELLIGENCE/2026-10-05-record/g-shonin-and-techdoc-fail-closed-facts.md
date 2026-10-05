# g-shonin-and-techdoc-fail-closed — facts relied on

Checked 2026-10-05. Regulator sites (mhlw.go.jp, pmda.go.jp) are blocked for
fetch in this environment, so nothing below is "regulator text": a title is
"search-verified" when a WebSearch result hosted on an MHLW/PMDA domain shows
it; content is "search summary" or "recall" as labelled. Nothing here is
presented to clients as regulator text; the engine's slot `basis` strings say
the same.

| # | Fact | Basis | Source / where used |
|---|------|-------|---------------------|
| 1 | The STED guide is 薬食機発第0216003号 (2005-02-16), 「医療機器の製造販売承認申請書添付資料概要作成の手引きについて」. The STED is the summary structure of the application's attached materials — so it is not one more leaf slot. | Title search-verified by the step's verifier (MHLW t_doc dataId=00tb2889); "structure, not a leaf" is recall. | pmda-shonin.ts header; `sted` slot deleted |
| 2 | 基本要件基準 is the standard set by the Minister under PMD Act Art. 41(3) (平成17年厚生労働省告示第122号): the essential quality/efficacy/safety requirements every device must meet. | Search-verified: PMDA standards DB page "薬機法第41条第三項に基づく基準 (基本要件基準)" (https://www.std.pmda.go.jp/scripts/stdDB/refetc/stdDB_other_information.cgi); 告示 number from search summary. | `essential-principles-conformity` slot basis |
| 3 | The checklist notification is 薬生機審発0818第1号 (令和3年8月18日), 「医療機器に係る基本要件適合性チェックリストについて」 — the checklist used in approval/certification applications. | Title search-verified: https://www.mhlw.go.jp/web/t_doc?dataId=00tc6129&dataType=1&pageNo=1 and https://www.std.pmda.go.jp/stdDB/Data/RefStd/Std_etc/R030818_0818-01_01.pdf. Content (that the checklist accompanies every Shōnin application) is recall. | slot label 基本要件適合性チェックリスト |
| 4 | Clinical trial results for a device are required only when nonclinical data / literature cannot establish clinical safety and efficacy: 薬食機発第0804001号 (2008-08-04), 「医療機器に関する臨床試験データの必要な範囲等について」. A clinical evaluation (臨床評価, literature) is the route used when a trial is not needed. | **Recall-grade.** Title and content come from non-regulator search results only (cobridge.com notice index, blog.rso.or.jp); no MHLW- or PMDA-hosted result showing the title was found (the PMDA 各種関連通知 page https://www.pmda.go.jp/review-services/drug-reviews/about-reviews/devices/0039.html was listed by search, but its text showing this title was not seen). Not re-read on MHLW/PMDA. The fix-round reviewer's independent WebSearch found the same. | `clinical-data` slot: trial results only (CER / 臨床評価 / generic 'clinical' type do not fill it); required only when `clinicalDataRequired === true`, undetermined otherwise; slot `basis` says "non-regulator search results (recall-grade)" |
| 5 | ICH E5(R1) (ethnic factors in the acceptability of foreign clinical data) is a medicines guideline, not a device requirement. | Recall. | `clinical-bridging` slot and its 'ich e5' / 'bridging' matchers deleted |
| 6 | The QMS適合性調査 is a separate procedure from the Shōnin review. | Recall. | `qms-conformity` relabelled; still required (unchanged until re-read) |
| 7 | 薬食発1120第5号 (2014-11-20), 「医療機器の製造販売承認申請について」, governs the device approval application. | Title search-verified: https://www.mhlw.go.jp/web/t_doc?dataId=00tc0548&dataType=1&pageNo=1. Content not re-read. | context only |
| 8 | MDR Annex II 6.1 describes pre-clinical V&V results — engineering, laboratory, simulated-use and animal tests, biocompatibility, electrical safety/EMC. 'bench test' and 'design verification' are common file-name terms, not Annex wording. | Recall (EUR-Lex not re-read). | tech-doc-assembler `preclinical-clinical` title phrases |
| 9 | In Japanese, 非臨床試験 (nonclinical studies) contains 臨床試験 (clinical trial) as a substring, so a substring title match must exclude 非臨床. | Language fact (no regulator basis needed). | `clinical-data` title guard |
| 10 | 臨床試験計画書 (and English "clinical investigation plan", "clinical trial protocol") names the plan of a trial, not its results (試験成績); a CIP is not a clinical investigation report. The repo's `clinical_investigation` id is an evidence type / section id (cerGenerationService.ts:51, ivdr-routes.ts:56, cer-report clinical-investigation-nodes), so the results docType is `clinical_investigation_report`. | Language fact and repo fact (no regulator basis needed); that the Shōnin clinical attachment is the results, not the plan, is recall. | `clinical-data` plan/protocol exclusion (fix round 2); also tech-doc-assembler V&V phrases exclude a plan/protocol without report/results |

Owed re-reads before any slot is labelled as regulator text: the STED guide
item list, the 0818 checklist body, the 0804001 scope criteria, and
医薬機審発0331第7号 (令和8年3月31日), which a verifier search surfaced with
unknown content.
