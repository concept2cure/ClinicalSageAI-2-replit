# shadow-review — CHANGELOG

## v1.0 — 2026-06-04

- Initial. Simulated reviewer pass over an assembled sequence, region-lensed
  (fda_filing / ema_d120 / pmda / nb_mdr / nb_ivdr). Returns severity-scored
  RTF/CRL/format/NB findings with regulatory basis + fix, plus rtf/crl risk
  scores. JSON-only. Guardrail: never fabricate a citation — null basis when
  ungrounded.
