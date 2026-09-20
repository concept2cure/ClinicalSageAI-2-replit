# Free-download attempts — B3 / B14 / B21 / B1 — 2026-09-20 (W5)

Every attempt below was made from this build environment through its egress proxy (`HTTPS_PROXY`, CA bundle `/root/.ccr/ca-bundle.crt`).
The proxy answered **403 to CONNECT** for every agency host: an organisation egress-policy denial, recorded per host in `proxy-status-after-download-attempts.json` (`recentRelayFailures[].kind = connect_rejected`).
Per `/root/.ccr/README.md` a 403/407 from the proxy is not to be retried or routed around. **Nothing was vendored and no guess was substituted**: `assets/ectd-dtd/`, `assets/ectd-schema/` and `assets/fda-recognized-standards/` are byte-for-byte as before, and `checksums.txt` still carries only placeholder comments. A mirror or third-party copy would not satisfy the vendoring policy in `assets/ectd-dtd/README.md` (verbatim agency bytes, agency licence header, provenance from the agency page), so none was tried.

| Blocker | Artefact | URL attempted | Result |
|---|---|---|---|
| B3 | ich-ectd-3-2.dtd + ectd-2-0.xsl (ICH eCTD v3.2.2 spec page) | <https://www.ich.org/page/ich-electronic-common-technical-document-ectd> | BLOCKED — curl: (56) CONNECT tunnel failed, response 403 000 |
| B3 | ICH eCTD v3.2.2 specification bundle (ESTRI) | <https://estri.ich.org/eCTD/index.htm> | BLOCKED — curl: (56) CONNECT tunnel failed, response 403 000 |
| B3 | ich-ectd-3-2.dtd (direct) | <https://admin.ich.org/sites/default/files/2019-04/ich-ectd-3-2.dtd> | BLOCKED — curl: (56) CONNECT tunnel failed, response 403 000 |
| B3 | us-regional-v3-3.dtd + us-regional.xsl (FDA eCTD specifications page) | <https://www.fda.gov/industry/electronic-regulatory-submission-and-review/electronic-common-technical-document-ectd> | BLOCKED — curl: (56) CONNECT tunnel failed, response 403 000 |
| B3 | FDA Module 1 v3.3 specification package (fda.gov media download) | <https://www.fda.gov/media/76472/download> | BLOCKED — curl: (56) CONNECT tunnel failed, response 403 000 |
| B3 | eu-regional.dtd (EMA eSubmission EU Module 1) | <https://esubmission.ema.europa.eu/eumodule1/index.htm> | BLOCKED — curl: (56) CONNECT tunnel failed, response 403 000 |
| B3 | jp-regional.dtd (PMDA eCTD page) | <https://www.pmda.go.jp/english/review-services/regulatory-info/0006.html> | BLOCKED — curl: (56) CONNECT tunnel failed, response 403 000 |
| B3 | ca-regional.dtd (Health Canada eCTD guidance) | <https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/guidance-documents/ectd.html> | BLOCKED — curl: (56) CONNECT tunnel failed, response 403 000 |
| B14 | rps-message.xsd (ICH eCTD v4.0 implementation package) | <https://www.ich.org/page/ich-electronic-common-technical-document-ectd-v40> | BLOCKED — curl: (56) CONNECT tunnel failed, response 403 000 |
| B21 | CDRH Recognized Consensus Standards database | <https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfStandards/search.cfm> | BLOCKED — curl: (56) CONNECT tunnel failed, response 403 000 |
| B21 | FDA recognized standards downloadable data files | <https://www.fda.gov/medical-devices/standards-and-conformance-assessment-program/downloadable-recognized-standards-data-files> | BLOCKED — curl: (56) CONNECT tunnel failed, response 403 000 |
| B1 | PreSTAR eSTAR templates (FDA eSTAR program page) | <https://www.fda.gov/medical-devices/premarket-submissions-selecting-and-preparing-correct-submission/estar-program> | BLOCKED — curl: (56) CONNECT tunnel failed, response 403 000 |
| B1 | PreSTAR template (fda.gov media, from the eSTAR page) | <https://www.fda.gov/media/166081/download> | BLOCKED — curl: (56) CONNECT tunnel failed, response 403 000 |

## Proxy state after the attempts

```json
{
  "enabled": true,
  "recentRelayFailures": [
    {
      "ts": "2026-09-20T23:54:08.075Z",
      "kind": "connect_rejected",
      "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
      "host": "www.ich.org:443"
    },
    {
      "ts": "2026-09-20T23:54:08.335Z",
      "kind": "connect_rejected",
      "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
      "host": "estri.ich.org:443"
    },
    {
      "ts": "2026-09-20T23:54:08.570Z",
      "kind": "connect_rejected",
      "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
      "host": "admin.ich.org:443"
    },
    {
      "ts": "2026-09-20T23:54:08.812Z",
      "kind": "connect_rejected",
      "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
      "host": "www.fda.gov:443"
    },
    {
      "ts": "2026-09-20T23:54:09.078Z",
      "kind": "connect_rejected",
      "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
      "host": "www.fda.gov:443"
    },
    {
      "ts": "2026-09-20T23:54:09.403Z",
      "kind": "connect_rejected",
      "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
      "host": "esubmission.ema.europa.eu:443"
    },
    {
      "ts": "2026-09-20T23:54:09.646Z",
      "kind": "connect_rejected",
      "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
      "host": "www.pmda.go.jp:443"
    },
    {
      "ts": "2026-09-20T23:54:09.899Z",
      "kind": "connect_rejected",
      "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
      "host": "www.canada.ca:443"
    },
    {
      "ts": "2026-09-20T23:54:10.142Z",
      "kind": "connect_rejected",
      "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
      "host": "www.ich.org:443"
    },
    {
      "ts": "2026-09-20T23:54:10.384Z",
      "kind": "connect_rejected",
      "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
      "host": "www.accessdata.fda.gov:443"
    },
    {
      "ts": "2026-09-20T23:54:10.615Z",
      "kind": "connect_rejected",
      "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
      "host": "www.fda.gov:443"
    },
    {
      "ts": "2026-09-20T23:54:10.858Z",
      "kind": "connect_rejected",
      "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
      "host": "www.fda.gov:443"
    },
    {
      "ts": "2026-09-20T23:54:11.106Z",
      "kind": "connect_rejected",
      "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
      "host": "www.fda.gov:443"
    }
  ]
}
```

## What unblocks each row

- **B3** — fetch the seven files from a network-permitted machine, drop them into `assets/ectd-dtd/` under the load-bearing names, run `cd assets/ectd-dtd && sha256sum *.dtd *.xsl` into `checksums.txt`, verify each file's root element / DOCTYPE, and record source URL, spec version, date and fetcher in `docs/runbooks/ectd-dtd-vendoring.md`. `npm run qualify:ectd` then activates the `xmllint --dtdvalid` row per region.
- **B14** — the ICH eCTD v4.0 implementation package is licensed; `rps-message.xsd` is gitignored by design and is a per-deploy drop, not a commit.
- **B21** — export the CDRH recognition database, normalise to the shape in `assets/fda-recognized-standards/README.md` with the provenance block (recognition-list number, publication date, retriever); never add a product-code association FDA does not publish.
- **B1** — download PreSTAR 3.0 from the FDA eSTAR page as `PreSTAR-q-sub.pdf` / `PreSTAR-ide.pdf` / `PreSTAR-513g.pdf`, pin in `ESTAR_TEMPLATE_MANIFEST`, then run the field-map procedure (runbook §3, using `listXfaFields` since FDA ships dynamic XFA).
