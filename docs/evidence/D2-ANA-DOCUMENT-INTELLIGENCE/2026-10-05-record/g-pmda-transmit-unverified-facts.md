# g-pmda-transmit-unverified — regulatory facts relied on

Step: the PMDA gateway refuses before the wire until a sourced protocol exists
(finding `drugs-jp-ectd-v4-only-for-new-applications`, `verified-all.json`
item 46, corrected proposal items 2, 3 and 5).
Checked: 2026-10-05. pmda.go.jp, esg.pmda.go.jp and mhlw.go.jp are blocked for
direct fetch in this environment. Each regulator-text item below rests on a
site-restricted web search: the result is hosted on the regulator's domain, and
the extract was read from the search result, not from the full document.

| # | Fact | Basis | Source (regulator-hosted) | Checked |
|---|---|---|---|---|
| 1 | PMDA's electronic submission channel is 申請電子データシステム, also called the ゲートウェイシステム. It submits material and applications over the internet. eCTD, FD申請データ and 申請電子データ can be submitted through it. | regulator text (search extract) | https://esg.pmda.go.jp/files/manual_ectd_sd.pdf (operation manual, title only); https://www.pmda.go.jp/review-services/drug-reviews/about-reviews/p-drugs/0029.html | 2026-10-05 |
| 2 | Using the gateway system for an approval application involves the following steps, in order: (a) prepare a personal electronic certificate (個人の電子証明書); (b) register as a gateway-system user; (c) give PMDA advance notice (提出予告) of the application, which issues the eCTD reception number (eCTD受付番号). | regulator text (search extract) | https://www.pmda.go.jp/files/000247523.pdf ; https://www.pmda.go.jp/files/000275797.pdf | 2026-10-05 |
| 3 | The protocol in the old `pmda-gateway.ts` header has no regulator source. It described REST, multipart upload, mTLS with an applicant certificate rotated annually, an HMAC-SHA256 request signature, `gateway.pmda.go.jp/submission/v1`, `/receipts/{id}` and 'receipt' / 'pre-check' / 'review-accepted' acks, and cited a "PMDA Gateway System Operating Procedure (2022)". No search of pmda.go.jp finds that document or that endpoint. The real channel (facts 1–2) uses a personal certificate and an advance notice, and neither appears in the invented protocol. | absence of a source (searched 2026-10-05) and the verifier's finding (`verified-all.json` item 46) | — | 2026-10-05 |
| 4 | The 1 GB PMDA size figure (`PMDA_LIMIT_BYTES`, rule PMDA-003) cites a "PMDA eCTD Submission Manual v2.0 §4.2". That manual was not found on pmda.go.jp, and PMDA-003 is a warning there. | absence of a source, as recorded by the verifier (`verified-all.json` item 46) | — | — |
| 5 | Japanese device and IVD applications use STED, not eCTD. The PMDA eCTD notices are drug (医薬品) notices. | **recall**, not verified against MHLW or PMDA text. The verifier noted the PMDA STED file 000272475.pdf exists on pmda.go.jp but did not read it. | — | — |
| 6 | From 2026-04-01 PMDA accepts only eCTD v4.0 for new approval applications. | regulator text (search extract), already recorded in `g-jp-ectd-v4-dispatch-blocker-facts.md` (facts 1–3). Cited here only to explain why a new J-NDA is already blocked at dispatch. | see that file | 2026-10-05 |
| 7 | PMDA runs a separate device web-application platform, DWAP (医療機器WEB申請プラットフォーム, www.dwap.pmda.go.jp). It creates medical device applications, notifications and petitions on a website. Its output is submitted on paper (with a barcode) or online through the gateway system (ゲートウェイシステム). So a PMDA device e-application channel exists; this platform builds no path to it, and that is all the `assembleNote` claims. | regulator text (search extract; the PDFs themselves were not read) | https://www.dwap.pmda.go.jp/dwap_shinpou/link/User_manual_6-4.pdf ; https://www.dwap.pmda.go.jp/dwap_shinpou/link/DWAP_QA.pdf ; https://www.pmda.go.jp/review-services/drug-reviews/procedures/0025.html | 2026-10-05 |

## How the code uses these facts

- `server/services/submission-gateways/pmda-gateway.ts`:
  - The header now reads "PROTOCOL: UNVERIFIED — no regulator source" and names 申請電子データシステム (facts 1–3).
  - `transmit` runs the pure `requiredAgencyMetadata` check. It then throws `UnverifiedTransportError` (`transmitted === false`) before any transmittal row, any credential read and any socket.
  - `checkStatus` returns the stored row as `source: 'stored'` and never polls.
  - `isConfigured` is `false`.
  - The invented wire code is deleted: postPmda, getPmda, buildPmdaSignature, loadPmdaCredentials, the multipart builder and the transmittal row writers. No replacement transmits. The founder decision on new integrations (DECISIONS.md #10; the plan's founder_decisions list) covers any PMDA e-application path. DECISIONS.md #5 decides that Japanese transmission fails closed.
- `server/services/submission-gateways/pre-transmit-check.ts`: `SIZE_LIMIT_UNSOURCED.pmda`. Exceeding the 1 GB figure is a warning, not a blocker, until a PMDA size source is filed (fact 4).
- `server/services/global-markets/market-registry.ts`: `jp-pmda` now has `canTransmit: false`, and `gatewayRegion` is removed. The note "Japanese device/IVD applications are not eCTD (STED); no PMDA device e-application path is built" is appended to `assembleNote`. The STED half rests on fact 5 (recall). The second half describes this platform only; PMDA's own device channel is DWAP (fact 7). The code comment above `canTransmit` says so.
- `scripts/ops/ga-readiness-report.mjs`: the `gateway:pmda:pmda_gateway` row is always `blocked`, with the observed reason "protocol unverified … transmit raises UnverifiedTransportError". The invented PMDA_* variable list is gone (fact 3).

## Not read, and owed

- The gateway-system operation manual, esg.pmda.go.jp/files/manual_ectd_sd.pdf. A sourced protocol would come from it, together with whatever interface PMDA offers to a third-party system, if it offers one at all.
- A PMDA source for any per-unit size limit on the gateway system.
- The PMDA STED material (000272475.pdf) for fact 5.
- The DWAP manual and Q&A (fact 7) read in full, and whether the gateway system accepts DWAP output from a third-party system. That is the device channel still owed a source before any JP device transmit is built.
