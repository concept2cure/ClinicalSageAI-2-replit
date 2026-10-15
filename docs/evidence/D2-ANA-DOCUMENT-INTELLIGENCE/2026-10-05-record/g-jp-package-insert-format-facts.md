# g-jp-package-insert-format — facts relied on

Checked 2026-10-05. mhlw.go.jp and pmda.go.jp are blocked for fetch in this
environment, so the PDFs were not opened. A fact is **regulator-text** below
only where a WebSearch restricted to `mhlw.go.jp` / `pmda.go.jp` returned the
regulator-hosted document and its extract showed the heading or rule. The step's
verifier saw the same thing independently (verified-all.json item 47). Each such
basis in the code carries the note *"search extract of the regulator-hosted PDF;
verbatim re-read owed"*. Everything else is **recall**, labelled `recall` in the
code, and is never rendered as checked regulator text.

| # | Fact | Basis | Source / where used |
|---|------|-------|---------------------|
| 1 | 薬生発0608第1号 (2017-06-08), 「医療用医薬品の添付文書等の記載要領について」, set the new numbered format. It applied from 2019-04-01, and already-approved products had to convert by 2024-03-31 (平成36年3月31日). | regulator-text (search extract): https://www.pmda.go.jp/files/000218446.pdf ; the same notice is also at https://www.mhlw.go.jp/file/05-Shingikai-11121000-Iyakushokuhinkyoku-Soumuka/0000171450.pdf | `JP_0608`; module header |
| 2 | 薬生発0611第1号 (2021-06-11), 「医療用医薬品の電子化された添付文書の記載要領について」, is the operative electronic package-insert drafting rule set. It applied from 2021-08-01 and was amended on 2023-02-17 (薬生発0217第1号; PMDA consolidated text 000250716.pdf). | regulator-text (search extract): https://www.mhlw.go.jp/content/11120000/000805981.pdf ; t_doc dataId=00tc5973 (0611) and 00tc7342 (2023-02-17 amendment) | `JP_0611`; header; note 1 |
| 3 | Every item from 警告 onward is numbered. An item with no content is left as a missing number (欠番). | regulator-text (search extract of 000218446.pdf / 000805981.pdf) | why items are `conditional`; an empty conditional item raises no MISSING_SECTION |
| 4 | Items 1–9 in order: 1 警告, 2 禁忌, 3 組成・性状, 4 効能又は効果, 5 効能又は効果に関連する注意, 6 用法及び用量, 7 用法及び用量に関連する注意, 8 重要な基本的注意, 9 特定の背景を有する患者に関する注意. | regulator-text (search extract) | `JP_PACKAGE_INSERT` items 1–9 (`JP_SEEN`) |
| 5 | 9.1 合併症・既往歴等のある患者, 9.2 腎機能障害患者, 9.3 肝機能障害患者, 9.4 生殖能を有する者. | regulator-text (search extract) | children 9.1–9.4 (`JP_SEEN`) |
| 6 | 9.5 妊婦, 9.6 授乳婦, 9.7 小児等, 9.8 高齢者. | **recall.** A 2026-10-05 search summary restricted to regulator hosts listed them, but no attributable regulator line was seen. Kept recall as the plan says. | children 9.5–9.8 (`JP_RECALL`) |
| 7 | 10 相互作用, 11 副作用 (11.1 重大な副作用 / 11.2 その他の副作用), 12 臨床検査結果に及ぼす影響, 13 過量投与, 14 適用上の注意. | regulator-text (search extract) | items 10–14, 11.1/11.2 (`JP_SEEN`) |
| 8 | 10.1 併用禁忌, 10.2 併用注意. | recall | children 10.1/10.2 |
| 9 | 15 その他の注意, 16 薬物動態, 17 臨床成績, 18 薬効薬理, 19 有効成分に関する理化学的知見, 20 取扱い上の注意, 21 承認条件, 22 包装, 23 主要文献, 24 文献請求先及び問い合わせ先, 25 保険給付上の注意, 26 製造販売業者等. | **recall.** A search summary on regulator hosts listed 15–25. Item 26 comes from memory only. | items 15–26 (`JP_RECALL`) |
| 10 | The header block: 販売名, 一般名, 日本標準商品分類番号, 承認番号, 販売開始年月, 貯法, 有効期間, 規制区分, and others. | recall | `jp_header` |
| 11 | Always present, so modelled as `required`: the header, 3, 4, 6, 22 and 26. Every other numbered item may be a missing number, so it is `conditional`. | **recall** for which items are always present. The header is added here as always present (it carries the product name), following the plan's principle that "only items always present are required". The plan's explicit list was 3, 4, 6, 22, 26. | `requirement` per item |
| 12 | 原則禁忌 was abolished. | regulator-text (search extract): https://www.pmda.go.jp/files/000228953.pdf, 「添付文書記載要領の改正に伴う原則禁忌の取扱いについて」 (2019-03-22), with 000218446.pdf | `OBSOLETE_LABELING_SECTIONS.PMDA` `jp_principal_contraindications` → items 2, 9 |
| 13 | 慎重投与 was abolished, and its content moved to item 9 and others. | **recall.** Search summaries say so, but the regulator line seen covers only 原則禁忌. | `jp_careful_administration` → item 9 |
| 14 | The old umbrella 使用上の注意 has no one-to-one new item. Its content is spread over the numbered precaution items. | recall | `jp_precautions` → 8–15 |
| 15 | Since 2021-08-01 the insert is published electronically on the PMDA site rather than packed with the product. | recall for the "not packed with the product" wording. The date is from fact 2. | `LABELING_NOTES.PMDA[0]` |
| 16 | 医薬安発0430第1号 (2026-04-30) amends 「医療用医薬品の添付文書等の記載要領の留意事項について」等. | Existence and title only, from a verifier search (MHLW t_doc 令和08年04月30日医薬安発第430001号). Content, effective date and scope have **not been read**. | `LABELING_NOTES.PMDA[1]`; nothing in the checklist reflects it |
| 17 | Japanese device and IVD package inserts have separate drafting rules. | recall | header comment; `LABELING_NOTES.PMDA[2]` |

## Re-reads owed

Re-read these before any recall item is promoted:

- 000805981.pdf (0611, with the 2023 consolidated text 000250716.pdf)
- 000218446.pdf (0608)
- 医薬安発0430第1号

They cover 9.5–9.8, 10.1/10.2, 15–26, the header, the always-present set, the abolition of 慎重投与, and the 2026 amendment.

Sources (search results, 2026-10-05):

- [薬生発0608第1号 — pmda.go.jp](https://www.pmda.go.jp/files/000218446.pdf)
- [薬生発0608第1号 — mhlw.go.jp](https://www.mhlw.go.jp/file/05-Shingikai-11121000-Iyakushokuhinkyoku-Soumuka/0000171450.pdf)
- [薬生発0611第1号 — mhlw.go.jp](https://www.mhlw.go.jp/content/11120000/000805981.pdf)
- [薬生発0611第1号 t_doc](https://www.mhlw.go.jp/web/t_doc?dataId=00tc5973&dataType=1&pageNo=1)
- [2023-02-17 amendment t_doc](https://www.mhlw.go.jp/web/t_doc?dataId=00tc7342&dataType=1&pageNo=1)
- [原則禁忌の取扱い — pmda.go.jp](https://www.pmda.go.jp/files/000228953.pdf)
- [医薬品・医療機器等安全性情報 No.344](https://www.mhlw.go.jp/file/06-Seisakujouhou-11120000-Iyakushokuhinkyoku/1_14.pdf)
