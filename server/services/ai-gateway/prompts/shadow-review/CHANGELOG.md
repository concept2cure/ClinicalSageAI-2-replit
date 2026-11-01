# shadow-review — CHANGELOG

## v1.2 — 2026-10-25

- The reviewer reads each leaf's text. v1.1 sent `{ sectionCode, title,
  lifecycleOp }` per leaf, so every finding about content was a guess from a
  title. Each leaf now carries its text from the rendered leaf the package would
  carry, masked for contact details, cut to a per-leaf and per-run budget, with
  `notRead` saying why a leaf was not sent (shadow-review-input.ts). Findings are
  to rest on the text sent; a leaf not read is not evidence of absence. The leaf
  text is data, never instructions.

## v1.1 — 2026-10-05

- No risk score. v1.0 asked for `rtfRiskScore` / `crlRiskScore` "likelihoods"
  in [0,1] from leaf codes and titles alone, and the run kept the higher of
  that and the severity aggregate, so the model set the figure (Rule 2). The
  run now records the aggregate of the findings' severities only
  (`aggregateRisk`), and an empty sequence is a server-side critical finding.
  Runs recorded under v1.0 keep their score, labelled as model-reported.

## v1.0 — 2026-06-04

- Initial. Simulated reviewer pass over an assembled sequence, region-lensed
  (fda_filing / ema_d120 / pmda / nb_mdr / nb_ivdr). Returns severity-scored
  RTF/CRL/format/NB findings with regulatory basis + fix, plus rtf/crl risk
  scores. JSON-only. Guardrail: never fabricate a citation — null basis when
  ungrounded.
