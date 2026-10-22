# validation-explain — CHANGELOG

## v1.1 — 2026-10-08
- The model returns prose only: `{ index, cause, fix }` per finding and a `summary`. It no longer decides `blocking` or echoes `ruleId`, `severity` or `leaf`; the service binds each row to the validator's finding by `index` and discards anything else (CLAUDE.md Rule 2; filing-spine design review, `.design/filing-spine/DESIGN_REVIEW.md`).

## v1.0 — 2026-06-05
- Initial. Translates deterministic validator findings into plain-language causes + fixes without changing verdicts. JSON-only.
