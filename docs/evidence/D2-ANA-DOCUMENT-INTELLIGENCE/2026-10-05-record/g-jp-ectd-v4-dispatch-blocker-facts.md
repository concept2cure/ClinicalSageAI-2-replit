# g-jp-ectd-v4-dispatch-blocker — regulatory facts relied on

Step: a new Japanese application in eCTD v3.2.2 is blocked at dispatch
(finding `drugs-jp-ectd-v4-only-for-new-applications`, R12 C6).
Checked: 2026-10-05. pmda.go.jp and mhlw.go.jp are blocked for direct fetch in
this environment, so each regulator-text item below rests on a site-restricted
web search: the result is hosted on the regulator's domain, and the extract
was read from the search result, not from the full document.

| # | Fact | Basis | Source (regulator-hosted) | Checked |
|---|---|---|---|---|
| 1 | MHLW notice 薬生薬審発0218第4号 (2022-02-18) amended 「電子化コモン・テクニカル・ドキュメント（eCTD）による承認申請について」 to bring in eCTD v4.0. Applications filed up to 令和8年3月31日 (2026-03-31) may still be made in the previous format (v3.2.2). | regulator text (search extract) | https://www.mhlw.go.jp/web/t_doc?dataId=00tc6467&dataType=1&pageNo=1 | 2026-10-05 |
| 2 | MHLW notice 医薬薬審発0310第3号 (2025-03-10) is the current amendment, with the JP eCTD v4.0 implementation guide v1.6.0, applying from 2025-04-01. | regulator text (search extract) | https://www.mhlw.go.jp/hourei//doc/tsuchi/T250310I0040.pdf ; https://www.mhlw.go.jp/web/t_doc?dataId=00tc8995&dataType=1&pageNo=1 | 2026-10-05 |
| 3 | From April 2026 only eCTD v4.0 is accepted for new applications; applications made by March 2026 may use v3.2.2. | regulator text (search extract of PMDA material) | https://www.pmda.go.jp/files/000274433.pdf ; https://www.pmda.go.jp/files/000251321.pdf | 2026-10-05 |
| 4 | An application first filed in v3.2.2 may continue its lifecycle in v3.2.2. Once a v4.0 submission unit has been received for an application, all later sequences go in v4.0 (forward compatibility). | first half: regulator search extract, as recorded by the verifier (`verified-all.json` item 46); second half: search extract of the PMDA-hosted ICH eCTD v4.0 implementation guide translation | https://www.pmda.go.jp/files/000274433.pdf | 2026-10-05 |
| 5 | In Japan each approval application, including a partial-change application (一部変更承認申請), is its own eCTD application starting from an original sequence. So "original sequence" is the right test for a "new application". | **recall**, not verified against MHLW or PMDA text | — | — |
| 6 | Whether eCTD v4.0 binds Japanese device or IVD applications. These use STED, and the PMDA eCTD notices are drug notices. | **unverified**. The currency fact's `appliesTo: 'mdx'` rests on a non-regulator source only. Not relied on here: the blocker reads only region, original-ness and date. | — | — |

## How the code uses these facts

- The date the gate compares against is the `effectiveDate` of currency fact
  `pmda-ectd-v4-mandatory` in
  `server/services/regulatory-currency/currency-registry.ts`, read through
  `findFacts({ jurisdiction: 'JP', asOf })`. It is not copied into the gate or
  the rule. The test moves the fact's date (2027-01-01) and the gate follows it.
- The `RULE_CORPUS` rule `JP_ECTD_V4_REQUIRED` cites facts 1 and 2 by notice
  number and URL. It names the currency fact through `currencyFactId`.
- Fact 4's continuation allowance is why the gate fires only on an original
  sequence (type `original`, or sequence number `0000`).
- Not done here, and owed elsewhere (see needs_elsewhere):
  - the currency fact's `sourceUrl` points at a PMDA English page. Facts 1–2 are
    the primary notices, so its basis should cite them;
  - its `appliesTo: 'mdx'` is unverified (fact 6).
