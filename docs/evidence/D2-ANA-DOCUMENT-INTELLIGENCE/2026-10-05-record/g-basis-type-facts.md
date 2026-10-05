# g-basis-type — facts relied on (2026-10-05)

Step: one provenance type for every regulatory fact (R1a; finding 67, type half).
Design: `docs/design/ANA_REGULATORY_RECORD.md` §5 (types) and §4 invariant 3.

This step encodes no regulatory requirement. Its only regulator-dependent
content is the list of hosts whose pages count as "the regulator's own text".

| Fact | Basis | Confidence |
|---|---|---|
| `fda.gov` is the U.S. Food and Drug Administration's domain | recall; also every existing `regulator-text` basis in `server/services/ind/ctd/*` uses `www.fda.gov` | recall |
| `ecfr.gov` publishes the Code of Federal Regulations (eCFR, NARA Office of the Federal Register / GPO) | recall | recall |
| `federalregister.gov` publishes the Federal Register (NARA Office of the Federal Register / GPO) | recall | recall |
| `hhs.gov` is the U.S. Department of Health and Human Services' domain | recall | recall |
| `ema.europa.eu` is the European Medicines Agency's domain; `esubmission.ema.europa.eu` is its eSubmission site (eCTD EU M1 specification, validation criteria) | recall | recall |
| `eur-lex.europa.eu` publishes the Official Journal of the EU and consolidated legislation (Regulations 2017/745, 2017/746, 536/2014) | recall | recall |
| `health.ec.europa.eu` is the European Commission (DG SANTE) health site, which hosts MDCG guidance | recall; finding 67's verifier saw MDCG 2025-10, 2025-5 and 2020-16 rev.5 PDFs on this host in search results | recall |
| `pmda.go.jp` is the Pharmaceuticals and Medical Devices Agency's domain; `mhlw.go.jp` is the Ministry of Health, Labour and Welfare's | recall | recall |
| `ich.org` / `database.ich.org` host ICH guidelines (the step-4 PDFs are served from `database.ich.org`) | recall; `server/services/ind/ctd/*` already cites `https://database.ich.org` | recall |

Notes:

- `ecfr.gov` and `federalregister.gov` are operated by the official U.S.
  publisher of regulations, not by FDA. They are accepted because they carry
  the authoritative regulatory text.
- A subdomain of a listed host counts (`www.fda.gov`). A look-alike does not
  (`fda.gov.example.com`, `notfda.gov`). The test pins both.
- Hosts outside the US/EU/JP scope (TGA, MHRA on gov.uk, Health Canada, etc.)
  are deliberately absent. A fact read there cannot be `regulator-text` until
  the list is extended by a step that models that jurisdiction.
- No WebSearch was needed: the list is fixed by the design document, and
  nothing in this step is promoted to `regulator-text`.

Compatibility check, not a new claim: every exported basis constant in
`server/services/ind/ctd/csr-e3-basis.ts` passes `basisProblems` unchanged.
The test pins this. The `regulator-text` literals in `fda-technical-rules.ts`,
`submission-chain.ts`, `lifecycle-document-types.ts` and
`ana/promotional-screening.ts` were inspected by grep. All carry `checked:
'2026-10-04'` and a URL on www.fda.gov, www.ecfr.gov, www.ema.europa.eu or
database.ich.org. They are not exported, so the test does not pin them.
