# g-rmf-jurisdiction-input: facts relied on (2026-10-05)

Step: `assess_device_evidence_structure` returns the RMF acceptability policy
for a jurisdiction (finding 69, `devices-eu-risk-afap`, proposal item 1, last
bullet).

This step states no new regulatory fact. The tool returns
`riskAcceptabilityPolicy(jurisdiction)` from
`server/services/market-specs/risk-management-structure.ts` unchanged. The
test pins this with a deep-equality check for every jurisdiction. Every basis
that policy carries is `recall`, and none is presented as regulator text. The
facts, their sources and the reads still owed are recorded in
[`g-rmf-afap-policy-facts.md`](g-rmf-afap-policy-facts.md). In short:

| Fact the returned policy carries | Basis | Confidence |
|---|---|---|
| EU MDR/IVDR Annex I §2 and §4 require risks to be reduced as far as possible (AFAP) without adversely affecting the benefit-risk ratio. | A search extract of eur-lex (ELI https://eur-lex.europa.eu/eli/reg/2017/745/oj and .../2017/746/oj). The eur-lex text has not been read verbatim. | recall |
| EN ISO 14971:2019+A11:2021 Annex ZA does not allow economic considerations as a reason to stop risk reduction. | Memory and secondary sources. The CEN/BSI text has not been read. | recall |
| ISO 14971:2019 leaves the acceptability criteria to the manufacturer (clauses 4.2 and 4.4). Clause 4.2 NOTE 1 lists ALARP, ALARA and AFAP as approaches the manufacturer's policy can define. FDA recognises ISO 14971:2019 as a consensus standard. | Memory and secondary sources. | recall |

## Design decisions (not regulator facts)

- The jurisdiction values are `EU_MDR`, `EU_IVDR`, `FDA` and `OTHER`, the
  `RmfJurisdiction` type. `submission-center-tool-defs.ts` holds the one
  runtime list (`RMF_JURISDICTIONS`). It is keyed by
  `Record<RmfJurisdiction, true>`, so the typecheck fails when that list and
  the type disagree. The advertised enum and the handler's check both read it.
- With no `jurisdiction`, no policy is returned. The tool does not assume a
  market, and its description tells AnA to ask which market the file is for.
- An unknown jurisdiction is refused with an error naming the allowed values.
  It is not ignored.
- A `jurisdiction` given for a CER or PER is refused. No acceptability policy
  is modelled for those documents, and accepting the input silently would let
  AnA believe it had received one.
