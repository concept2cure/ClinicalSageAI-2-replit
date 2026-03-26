# COMPUTE_PRESET_CONSEQUENCE_MATRIX

Date: 2026-03-26

## Runtime maturity table

| Profile / format path | Maturity | Truth |
|---|---|---|
| docx-python (isolated subprocess + temp workdir + no-network env + output handoff) | production-path | First credible isolated path implemented |
| spreadsheet (csv emitter) | provisional | Operational consequence path, not production renderer |
| pptx (text placeholder emitter) | provisional | Operational consequence path, not production renderer |
| bundle (json placeholder emitter) | provisional | Operational consequence path, not production renderer |
| safe html (sanitizing emitter) | provisional | Operational consequence path, sanitization only |

## Preset consequence status (honest labels)

| Preset | Job + consequence path | Runtime-proof label | Notes |
|---|---|---|---|
| RI Copilot evidence memo | PASS | PASS WITH CAVEAT | Uses real isolated docx path + governed writeback; UI screenshot proof still pending |
| CMC Module 3 doc | PASS | PASS WITH CAVEAT | Uses same docx isolated path and governed consequence |
| eCTD / IND section draft | PASS | PASS WITH CAVEAT | Governed consequence works, but output renderer depth still provisional for non-docx modes |
| 510(k) / CER governed export | PASS | PARTIAL | Governed consequence works; bundle renderer remains provisional |

