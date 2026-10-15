# g-rmf-afap-policy: facts relied on (2026-10-05)

Step: EU risk acceptability is AFAP, with no cost justification (finding 69,
`devices-eu-risk-afap`). The policy is stated once, in
`server/services/market-specs/risk-management-structure.ts`
(`riskAcceptabilityPolicy`, `checkRmfAcceptabilityLanguage`). The
risk-management flow and its war-game auditor read it from there.

No fact in this step is promoted to `regulator-text`. Every basis in the code
is `recall`, and the test pins that none is presented as checked.

| Fact | Basis | Confidence |
|---|---|---|
| MDR (EU) 2017/745 Annex I §2: reducing risks "as far as possible" means doing so without adversely affecting the benefit-risk ratio. | A WebSearch restricted to eur-lex.europa.eu on 2026-10-05 returned this wording as a search extract of https://eur-lex.europa.eu/eli/reg/2017/745/oj. The repo already carries the same wording in `shared/schema/gspr.seed.ts:45-46` and `server/routes/ivdr-routes.ts:1064`. eur-lex is blocked for WebFetch, so no verbatim read was possible. | recall (search extract; verbatim re-read owed) |
| IVDR (EU) 2017/746 Annex I §2 has the same AFAP wording. | `ivdr-routes.ts:1064` and `gspr.seed.ts:202`; memory. ELI https://eur-lex.europa.eu/eli/reg/2017/746/oj, not read. | recall |
| MDR/IVDR Annex I §4: control measures follow the safety principles and the state of the art. The residual risk for each hazard and the overall residual risk must be judged acceptable. Controls apply in priority order: safe design, then protective measures, then information for safety. | Memory; `ivdr-routes.ts:1066` holds part of this wording. | recall |
| EN ISO 14971:2019+A11:2021 Annex ZA requires risks to be reduced as far as possible under Annex I, and does not allow economic considerations as a reason to stop. | Memory. Secondary sources only, found by a 2026-10-05 WebSearch: StarFish Medical "ALARP to AFAP, the MDR and ISO 14971:2019+A11:2021", NAMSA "Risk Management for MDR: Extending Beyond ISO 14971:2019", RAPS Connect "14971 and AFAP". CEN/BSI text not read; it is not on a regulator host. | recall |
| ISO 14971:2019 clause 4.2: top management defines the policy for establishing risk-acceptability criteria. Clause 4.4: the risk management plan includes the criteria. | Memory. ISO text not read. | recall |
| ISO 14971:2019 clause 6 is risk evaluation, 7.3 residual-risk evaluation, 7.4 benefit-risk analysis, and 8 evaluation of overall residual risk. Clause 7.4 does not require ALARP. | Memory | recall |
| ISO 14971:2019 does not require ALARP, but it names it. Clause 4.2 NOTE 1: the manufacturer's policy for establishing criteria for risk acceptability "can define the approaches to risk control: reducing risk as low as reasonably practicable, reducing risk as low as reasonably achievable, or reducing risk as far as possible without adversely affecting the benefit-risk ratio". The 2007 edition's Annex D material moved to ISO/TR 24971:2020. (Corrected in review round 2: rounds 0 and 1 said "ISO 14971:2019 does not use the term ALARP", which is wrong.) | Secondary sources only, found by WebSearch on 2026-10-05: StarFish Medical "ALARP to AFAP, the MDR and ISO 14971:2019+A11:2021" (https://starfishmedical.com/resource/medical-device-risk-management-and-the-change-from-alarp-to-afap/); NAMSA "Risk Management for MDR: Extending Beyond ISO 14971:2019" (https://namsa.com/resources/blog/risk-management-mdr-beyond-iso-149712019/); naveenagarwalphd.substack.com "ISO 14971 fundamentals - policy for establishing criteria for risk acceptability"; meddevinsider.substack.com "Master ISO 14971:2019 clause 4" returned the same NOTE 1 wording in a search extract. ISO text not read; none of these is a regulator host. | recall (secondary sources, checked 2026-10-05) |
| ICH Q9(R1) defines no "ALARP principle". | Memory | recall |
| FDA recognises ISO 14971:2019 as a consensus standard and does not mandate it. Under it, the manufacturer defines its own acceptability criteria; FDA does not mandate AFAP. The FDA statement reads "FDA (recall): ISO 14971:2019 is an FDA-recognised consensus standard ..." (review round 2 replaced "ISO 14971:2019 is applied as written", which read as an FDA rule). | Memory. FDA recognised-standards database not checked. | recall |

## Claims removed

These were removed because they were wrong or unsupported.

- `flows/risk-management.ts`:
  - The option "ICH Q9 ALARP Principle" (`ich_q9_alarp`).
  - "ISO 14971:2019 Section 7.4 requires ... the ALARP principle be demonstrated".
  - "The ALARP ... principle is commonly applied".
  - The help text asking for proof that further reduction is "impracticable or disproportionate".
- `risk-management-auditor.ts`:
  - "The ALARP principle is central to EU MDR expectations", which cited MDR Annex I §2.
  - "ISO 14971:2019 Clause 7.4 requires that when further risk reduction is practicable ...".
  - The remediation to justify stopping by "cost-benefit analysis".
  - The "ALARP zone" in the missing-criteria recommendation.
- The finding's original claim that ALARP is "the most common reason a notified body rejects an RMF" is unsupported and appears nowhere in the code.

## Kept for stored answers

- Field id `alarp_demonstration`: relabelled "Residual-risk reduction
  demonstration". The auditor and stored flow answers key on it.
- Option value `iso_14971_annex_d`: relabelled "ISO/TR 24971:2020 guidance".
- Issue-check id `alarp_not_demonstrated` and auditor rule id
  `rm_alarp_not_demonstrated`: retitled only.
- A stored `risk_acceptability_criteria: 'ich_q9_alarp'` answer is no longer a
  flow option. For an EU programme the auditor raises it as a critical finding
  (`rm_eu_acceptability_not_afap`) and does not rewrite it (DECISIONS.md #6).
- Re-submitting a stored `ich_q9_alarp` answer (for example after navigating
  back) fails select validation (`validators.ts:84-88`) with
  `Risk Acceptability Criteria: "ich_q9_alarp" is not a valid option.`, which
  asks the user to pick a current option. The stored value is not rewritten.

## Owed reads

- eur-lex consolidated text of MDR and IVDR Annex I §2 and §4. These move to
  `regulator-text` with a checked date only after the eur-lex text is read.
- CEN/BSI text of EN ISO 14971:2019+A11:2021 Annex ZA. It is not on a
  regulator host, so it stays `recall` with a note naming the read.

## Fix round 1 (2026-10-05)

| Fact relied on | Basis | Confidence |
|---|---|---|
| MDR (EU) 2017/745 and IVDR (EU) 2017/746 Annex I apply to devices and IVDs. A medicinal product's quality risk management (ICH Q9(R1)) is not governed by them. The auditor's EU AFAP rule therefore does not run when `product_category` is `pharmaceutical`. Combination products stay in scope because their device part is under MDR Annex I (MDR Article 117 for integral drug-device combinations). | Memory | recall |
| ~~ISO 14971:2019 says nothing either way on economic considerations in risk reduction.~~ Superseded in review round 2: clause 4.2 NOTE 1 expressly lets the manufacturer's policy adopt ALARP (practicability), so whether economic considerations count is the manufacturer's choice under its own acceptability criteria (clauses 4.2 and 4.4). The FDA basis note now says so. `economicJustificationPermitted: true` for FDA means only that no modelled FDA rule forbids it. | See the clause 4.2 NOTE 1 row above (secondary sources, 2026-10-05). ISO text not read. | recall |
| For a jurisdiction the platform does not model (`OTHER`), no economic permission is asserted: `economicJustificationPermitted` is `null`. | Design decision (fail closed), not a regulator fact | n/a |

The EU statement now begins "For EU devices (MDR/IVDR):", so the flow text a pharmaceutical user also sees is scoped to devices by its own wording.

## Fix round 2 (2026-10-05)

- Corrected: ISO 14971:2019 does not require ALARP, but clause 4.2 NOTE 1
  names ALARP, ALARA and AFAP as approaches the manufacturer's policy can
  define. The ISO basis note, the module header, the afap test comment and the
  FDA basis note now say this. A test pins that no policy text says ISO
  14971:2019 "does not use ALARP" and that the FDA note cites clause 4.2 NOTE 1.
- The FDA statement is labelled recall and calls ISO 14971:2019 an
  FDA-recognised consensus standard; it no longer says "applied as written".
- `checkRmfAcceptabilityLanguage` now also flags, for the EU, economic stopping
  rules stated as "for economic reasons" (any cost term + reason(s)/grounds),
  as cost-effectiveness ("not cost-effective"), as "not affordable", and an
  absent budget, funds or funding given as the reason to stop ("stopped as
  there was no budget"). "No budget limit/constraint" is still read as an
  exclusion. These are design decisions of the deterministic check, not
  regulator facts.
