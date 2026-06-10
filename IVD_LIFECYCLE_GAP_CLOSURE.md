# IVD Lifecycle Gap Closure

Implementation closing the gaps identified in the IVD lifecycle audit. All work
is server/service-layer (no UI), deterministic, and unit-tested. Routes are
org-scoped and mounted via `server/bootstrap/register-document-routes.ts`.

## Audit gap → module map

| Audit gap (tier) | Status before | Module(s) added | API |
|---|---|---|---|
| Design Controls / DHF (T1) | absent | `server/services/regulatory/design-controls.ts` (engine) · `server/services/design-risk/design-risk.service.ts` · `migrations/20260609_design_risk.sql` | `/api/design-risk/*`, `/api/design-risk/dhf/assessment` |
| Risk Management File — ISO 14971 (T1) | stub | `server/services/regulatory/iso-14971-risk.ts` (engine) · persisted via design-risk service/migration | `/api/design-risk/rmf/*`, `/api/design-risk/rmf/:id/summary` |
| QMS wired (T1) | schema only | `server/services/qms/qms.service.ts` · `server/routes/qms.ts` (over existing `qms_*` tables) | `/api/qms/*`, `/api/qms/summary` |
| Analytical study gaps (T2) | partial | `server/services/stats/analytical-performance-extensions.ts` — stability (EP25 + Arrhenius), carryover, hook, recovery, cut-off | `/api/ivd-lifecycle/stability/*`, `/carryover`, `/hook-effect`, `/recovery`, `/cutoff` |
| ISO 17511 traceability (T2) | absent | `server/services/regulatory/iso-17511-traceability.ts` | `/api/ivd-lifecycle/traceability` |
| Scientific validity engine (T2) | boolean | `server/services/regulatory/scientific-validity.ts` | `/api/ivd-lifecycle/scientific-validity` |
| Software lifecycle / cybersecurity (T2) | absent | `server/services/regulatory/iec-62304-software.ts` | `/api/ivd-lifecycle/software/*` |
| Manufacturing / process / lot release (T2) | absent | `server/services/regulatory/process-validation.ts` | `/api/ivd-lifecycle/process-validation`, `/process-capability`, `/lot-release` |
| Advanced signal detection (T3) | rate-spike only | `server/services/stats/signal-disproportionality.ts` — PRR/ROR/χ² | `/api/ivd-lifecycle/signal/disproportionality` |
| Vigilance / PSUR authoring (T3) | transport only | `server/services/postmarket/report-authoring.ts` — eMDR/MIR/FSN/PSUR | `/api/ivd-lifecycle/authoring/*` |
| Change management decision (T3) | predicate monitor only | `server/services/regulatory/change-assessment.ts` — 510(k) change + EU significant change | `/api/ivd-lifecycle/change/*` |
| Registration / listing / DoC (T3) | UDI validation only | `server/services/regulatory/registration-listing.ts` | `/api/ivd-lifecycle/registration/*`, `/declaration-of-conformity` |
| Global breadth beyond US/EU (T3) | PMDA only | `server/services/regulatory/global-pathways.ts` — HC/NMPA/ANVISA/TGA/MDSAP | `/api/ivd-lifecycle/pathways`, `/pathways/readiness` |

## Tests

70 unit tests across 12 spec files (all passing); engines typecheck clean.
End-to-end demo: `npx tsx scripts/demo/ivd-lifecycle-walkthrough.ts`.

## Regulatory backbone

21 CFR 820.30 · ISO 13485:2016 · ISO 14971:2019 / ISO/TR 24971 · CLSI
EP05/06/07/09/10/17/25/28 · Arrhenius · ISO 17511:2020 · IVDR 2017/746 Annex
XIII · IEC 62304 · FDA premarket cybersecurity (SPDF) · 21 CFR 820.75/820.80 ·
PRR/ROR pharmacovigilance · FDA 3500A / EU MIR v7.2 · FDA 510(k)-change &
MDCG 2020-3 · 21 CFR 807 · IVDR Art. 26-28 / Annex IV · MDSAP.
