# MDx Controlled-Beta Baseline

## Recorded baseline

- Repository: `concept2cure/ClinicalSageAI-2-replit` (configured remote repository name differs in `package.json`).
- Reviewed/starting commit: `8a52eee524e16e77726dac888a1af81e6d8119a5`.
- Starting branch: `work`; remediation branch: `fix/mdx-controlled-beta-readiness`.
- Runtime observed: Node `v20.20.2`, npm `11.4.2`; package lock is `package-lock.json`.
- PostgreSQL is required for live integration (documented local database `concept2cure-ri`, PostgreSQL 16). Object storage, predicate, PDF, queue and AI services were not live-qualified.

## Dependency map (verified statically, not qualified end to end)

| V2 route | MDx surface | component | client adapter | API families | persistence/audit/output |
|---|---|---|---|---|---|
| `device-submissions` | `k510` | `K510Surface.tsx` | `useK510.ts` | regulatory programs, 510(k), predicate/eSTAR routes | MDx/510(k) tables; audit and export routes require live qualification |
| `device-diagnostics` | `device-diagnostics-workbench` | `IvdSurface.tsx` | `useIvd.ts`, `useCdxClia.ts` | `mdx-ivdr`, `mdx-ivd-performance`, `mdx-clia`, `mdx-cdx`, `mdx-ldt` | IVDR tables; route-local audit calls; controlled output not proven |
| `device-cer` | `cer` | `CerSurface.tsx` | pathway adapters | CER/safety/literature APIs | incomplete preview; no qualified final output |
| PMA navigation | `pma` | `PmaSurface.tsx` | MDx program adapter | regulatory programs/PMA APIs | generic phase adapter; not beta-qualified |

The route chain is `surfaceViews.ts` → `DeviceWorkstream.tsx` → `MdxRoute.tsx` → `App.tsx`. Authentication and router mounting must be rechecked dynamically before release; table names and audit durability cannot be inferred from route names.

## Baseline findings

- V2 diagnostics passed legacy `ivd`, while the MDx app rendered `device-diagnostics-workbench`; unknown values fell through to Overview.
- `REGULATORY_PATHWAYS` omitted IVDR and diagnostics selected the first 510(k) program.
- the app substituted `MDX_PROGRAMS` while the program list loaded or failed.
- `ivdr_td` was mislabeled as EU MDR.
- Existing explicit sample/data-state tests passed (32 targeted assertions including new remediation assertions). Full Jest, full Vitest, build, Playwright, database and live dependencies were not baseline-qualified in this session.

## Known limitations

The repository contains many MDx routers and tests, but renderability is not workflow proof. No official FDA template authorization was established. No two-tenant, artifact/audit durability, predicate live-service, PER lifecycle, or golden-path qualification was completed; release remains **no-go**.

## Reuse-before-change investigation

A second duplication audit was performed after review concern about added files. The remediation now follows these decisions:

| Need | Existing implementation found | Decision |
|---|---|---|
| Diagnostic accuracy statistics | `server/services/stats/clinical-performance.ts`, `server/routes/diagnostics-performance.ts`, `shared/ivdr/manifest.ts` | Reuse. The point-estimate core now lives in the existing shared IVDR manifest and the existing statistics engine delegates to it; the separate new calculator module and test file were removed. |
| IVDR pack/evidence contract | `shared/ivdr/manifest.ts` | Extend the existing shared contract; do not create a parallel IVDR model. |
| Analytical/clinical computation API | `/api/diagnostics-performance` plus stats services | Preserve. MDx persistence should converge on this engine rather than create a second computation service. |
| Data-state model | `client/src/concept2cure/mdx/lib/dataState.ts`, `DataGate.tsx`, `sampleMode.ts`, `useSampleRows.ts` | Reuse. Dossier and shell changes call the existing explicit sample/data-state boundary. |
| Dossier model | `store/dossierStore.ts`, `hooks/useDossier.ts`, `PathwayPanes.tsx` | Repair in place. No parallel dossier implementation was created. |
| Program/pathway taxonomy | `shared/constants/mdx.ts`, `useMdxPrograms.ts` | Extend in place with IVDR; no second taxonomy registry. |
| V2 MDx route adapter | `DeviceWorkstream.tsx`, `App.tsx` | Repair in place; no replacement router or UI. |
| IVDR persistence | existing `ivdr-routes.ts` and `mdx-ivdr.ts` | Harden existing routes. Their overlap remains a documented consolidation gap; no third router was added. |
| MDx health | `server/services/mdx-health.service.ts` | Extend in place with layered, fail-closed output; no parallel health endpoint. |
| Required reports | work order explicitly requires six named `docs/mdx` deliverables | Keep only those six. Two extra assessment/audit documents created during remediation were removed and their essential conclusions consolidated here and in the release report. |
| Regression tests | no direct tests existed for route identity, `useIvd` count parity, dossier import-time seeding, MDx IVDR ownership/PER lifecycle, or pure health release derivation | Add focused colocated tests only for repaired defects. Existing route and stats tests were extended where a suitable home existed. |

No production dependency, replacement UI, parallel MDx application, third IVDR router, new health endpoint, or migration was introduced.
