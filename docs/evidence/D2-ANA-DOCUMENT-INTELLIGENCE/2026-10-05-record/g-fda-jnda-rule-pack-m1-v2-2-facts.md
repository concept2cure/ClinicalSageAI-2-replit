# g-fda-jnda-rule-pack-m1-v2-2: regulatory facts relied on

Date: 2026-10-05. Change: `migrations/20261005_fda_jnda_m1_outline_v2_2.sql`.

Each fact has a basis:

- **regulator-text**: a regulator-hosted URL, checked on 2026-10-05 through WebSearch result text. Regulator hosts are blocked for WebFetch in this environment, so the documents themselves were not opened.
- **recall**: not checked against regulator text, and labelled as recall in the rule-pack row's `uncertainties`.

## FDA, US regional Module 1 (nda:fda, bla:fda, anda:fda)

| # | Fact | Basis | Source |
|---|---|---|---|
| F1 | 1.12.14 is "Environmental analysis" (21 CFR 312.23(a)(7)(iv)(e) for an IND; the EA or claim of categorical exclusion). | regulator-text | FDA Comprehensive Table of Contents Headings and Hierarchy v2.3.3, https://www.fda.gov/media/76444/download; also the eCTD v4.0 ToC, https://www.fda.gov/media/179699/download |
| F2 | 1.19 is "Pre-EUA and EUA" (emergency use authorization). It is not the environmental analysis. | regulator-text | the same, https://www.fda.gov/media/76444/download |
| F3 | 1.14.1 is Draft labeling, with 1.14.1.1 "Draft carton and container labels" and 1.14.1.3 "Draft labeling text". | regulator-text | the same; matches `cv-v4-data.ts` us_1.14.1.1 and us_1.14.1.3 |
| F4 | 1.14.4 is investigational labeling (1.14.4.1 investigational brochure, 1.14.4.2 investigational drug labeling), and 1.14.5 is "Foreign labeling". | regulator-text | https://www.fda.gov/media/76444/download; `cv-v4-data.ts` us_1.14.4.x and us_1.14.5 |
| F5 | 1.4.1 is "Letter of authorization" and 1.4.2 is "Statement of right of reference". | regulator-text | https://www.fda.gov/media/76444/download; `cv-v4-data.ts` us_1.4.1 and us_1.4.2 |
| F6 | ANDA: field copy certification is filed at 1.3.2. The district offices have the full eCTD submission on the FDA network, so an individual field copy is no longer required. | regulator-text | FDA guidance *ANDA Submissions — Content and Format*, https://www.fda.gov/media/128127/download |
| F7 | ANDA: patent information is filed at 1.3.5.1, patent certification at 1.3.5.2 and the exclusivity statement at 1.3.5.3. 1.15 is Promotional material. | regulator-text | https://www.fda.gov/media/128127/download; `cv-v4-data.ts` us_1.3.5.1–3 and us_1.15 |
| F8 | 1.3.1 holds changes: of address or corporate name, of contact or agent, of sponsor or applicant, and of ownership. An application with no change files nothing there. | regulator-text (by the heading list); the "nothing to file" inference is recall | `cv-v4-data.ts` us_1.3.1.1–5; the same reasoning was accepted for ind:fda in `migrations/20260902_…` |
| F9 | The prescribing-information format is PLR (21 CFR 201.56/201.57). PLLR is the Pregnancy and Lactation Labeling Rule. | recall | no regulator text read |
| F10 | An NDA must carry patent information (21 CFR 314.50(h), 314.53), so the pack's optional 1.3.5 is doubtful. **Not changed.** | recall | named in the nda row's uncertainties |
| F11 | Not every application requests a proprietary name, so the pack's mandatory 1.18 is doubtful. **Not changed.** | recall | named in the nda and bla rows' uncertainties |
| F12 | Whether every ANDA must file the 1.3.5.3 exclusivity statement. Marked mandatory as a default. | recall | named in the anda row's uncertainties |
| F13 | The BLA governing rule is 21 CFR 601.2. | recall | the bla row's governing_rule |

## PMDA, Japan regional Module 1 (jnda:pmda)

| # | Fact | Basis | Source |
|---|---|---|---|
| J1 | The draft risk management plan, 医薬品リスク管理計画書（案）, filed with an approval application goes at CTD M1.11. In the eCTD, its block title is "医薬品リスク管理計画書（案）". | regulator-text | PMDA domestic eCTD Q&A, https://www.pmda.go.jp/int-activities/int-harmony/ich/0083.html; PMDA RMP example notice, https://www.pmda.go.jp/files/000221872.pdf |
| J2 | 1.12 is 添付資料一覧 (list of attached documents) and 1.13 is その他 (others). Both are unchanged from v2.1. | recall. A WebSearch summary of pmda.go.jp results said this, but did not tie it to one document. The candidate is the PMDA CTD composition notice, https://www.pmda.go.jp/files/000156304.pdf, which has not been read. | none |
| J3 | An RMP is expected with a new drug application, so 1.11 is marked mandatory. | recall | named in the jnda row's uncertainties |
| J4 | J-NDA Module 1 headings 1.1–1.10 are unchanged from v2.1 and were not checked against the MHLW CTD notice. | recall | named in the jnda row's uncertainties |

## Not decided here

- **maa:ema** is not minted (product decision 3, `DECISIONS.md`). Its v2.1 deltas are left to the parity test that records them as expected.
- **Persisted c2c_documents** bound to the old versions keep their outline. They are detected and surfaced, never rewritten (decision 6).
