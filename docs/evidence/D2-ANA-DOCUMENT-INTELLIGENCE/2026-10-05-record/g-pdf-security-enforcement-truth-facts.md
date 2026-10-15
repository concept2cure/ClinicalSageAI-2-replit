# g-pdf-security-enforcement-truth: facts relied on

Step: R12 C1 in `docs/design/ANA_REGULATORY_RECORD.md`; finding F53 (`drugs-one-acceptance-rule-registry`).

## Platform facts, read from the code on 2026-10-05

| Fact | Where it was read |
|---|---|
| `RULE_CORPUS` `PDF_NO_SECURITY` said `enforcement: 'external'` at HEAD. That made `ruleView`'s statement "Requires the agency validator — … the product … does not reproduce the check". | `server/services/ectd/validation-rule-corpus.ts` (HEAD ~326-335); `ENFORCEMENT_STATEMENT` |
| `FDA_TECHNICAL_RULES` `pdf-no-security` says `platform.check: 'enforced'`. It is the only row with 'enforced'. | `server/services/ind/ctd/fda-technical-rules.ts:66-71` |
| The v3.2.2 packager judges every PDF leaf (by name `.pdf` or a `%PDF-` header) with `assessLeafPdfSecurity` and refuses a `secured` leaf: "the package cannot ship it". This applies in every region. | `server/services/submission-gateways/regional-packager.ts:250-253, 1014-1016` |
| The eCTD v4.0 RPS packager throws on a `secured` leaf: "refusing to package it". | `server/services/ectd/ectd4/rps-packager.ts:70-73` |
| The transmit guard re-reads the signed bundle and throws `ValidationError` (ruleId `LEAF-ENCRYPTED`) on any `secured` PDF entry. | `server/services/submission-gateways/bundle-leaf-security.ts:44-90` |
| The shared rule makes one exception. For region FDA, a leaf that is a vendored FDA form template is shipped with FDA's own security settings, extended only by incremental update. | `server/services/ectd/leaf-pdf-security.ts` header |
| `list_validation_rules` returns `RULE_CORPUS` rows, including `enforcement`. | `server/services/ana/AnaToolExecutor.ts:9967-9981` |
| `PDF_VERSION` stays `'external'`. The PDF version is read but no verdict uses it, so `FDA_TECHNICAL_RULES` `pdf-version` is 'not-checked'. `PATH_LENGTH` also stays `'external'`. | `fda-technical-rules.ts:59-64`; finding F53 verdict |

## Regulator facts (unchanged by this step; carried, not newly asserted)

1. **Do not activate PDF security settings or password protection.**
   - Basis: FDA, *Portable Document Format (PDF) Specifications*, https://www.fda.gov/media/76797/download, `regulator-text`. The check date, 2026-10-04, is the one recorded on `FDA_PDF_SPECS` in `server/services/ind/ctd/csr-e3-basis.ts`.
   - Not re-fetched in this step. The corpus `source` stays `FDA_CRIT` (the eCTD TCG and validation criteria family), as it was.
2. **FDA forms are submitted with the security settings FDA issued them with.**
   - Basis: FDA, *Electronic Submission File Formats and Specifications*, https://www.fda.gov/media/110979/download.
   - The source is a search-engine excerpt recorded in `docs/evidence/W5/2026-09-22/README.md`. The document itself was not fetched (egress blocked), and that file asks Regulatory Ops to confirm it.
   - This step only restates the platform's existing exception in the rationale. It does not newly assert the regulator text.

The EU, JP, CA, AU and CH regions on this rule are unchanged. The platform refuses a secured leaf in every region, so `'packager'` holds for each. Whether each of those regulators prohibits PDF security is the existing corpus claim, which this step neither re-verified nor changed.
