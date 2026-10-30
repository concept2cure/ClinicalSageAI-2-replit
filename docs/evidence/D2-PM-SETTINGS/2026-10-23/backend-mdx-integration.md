# PM-06 backend after incoming MDx integration

Read-only assessment and repeated qualification on merged revision `413d7350c`, containing incoming MDx commit `62a8d5e7f`. No production or test source was changed by this worker.

| Retained cohort | Merged-tree result | Output |
| --- | --- | --- |
| Dedicated settings HTTP/PGlite | 37 passed / 37, exit 0 | [backend-mdx-settings.txt](backend-mdx-settings.txt) |
| Existing profile/device/setup/date/access/intake callers | 121 passed / 121 across 7 files, exit 0 | [backend-mdx-retained-callers.txt](backend-mdx-retained-callers.txt) |

These are repetitions of the existing cohorts in [backend-qualification.md](backend-qualification.md), not additional unique tests. The same Node 22, heap4096 and standard Vitest configuration/commands apply; only the retained output filenames differ.

## Bounded impact review

No material backend integration blocker was found. The incoming commit does not change canonical settings, programme-profile writer, setup projection, device-profile endpoint, program access or anchor source. The relevant incoming changes preserve these boundaries:

- `shared/regulatory/work-packages.ts` remains a pure deterministic compiler without database I/O. Its discipline owners describe expected work, not program management or sharing grants. Its inputs do not include any of the three settings fields, and settings writes do not regenerate or persist this plan.
- `server/services/pathway-engines/estar/estar-content-leaves.ts` exports the existing `loadGovernedSectionRows` function without changing its implementation.
- `server/routes/k510-document-preview.ts` resolves recorded program/project identities, uses canonical current program access and reads the governed document/section store. It does not call or replace the profile writer. Its read-audit receipt does not replace the settings write receipt's required persisted/chained transactional audit.
- `shared/constants/launch-scope.ts` admits MDx feature surfaces inside Projects while retaining the Projects app's `modules: ['projects','tasks']`. It does not create a settings role, ownership-transfer policy or client-placement fallback.

The root worker owns the ProjectHome UI merge/conflict resolution and composed IVD/settings behavior, plus final TypeScript, build, native database and publication qualification.

## Incoming receipt verification and limits

The incoming [qualification README](../../D2-MDX-PROJECT-WORKFLOW/2026-10-23/README.md) and [source receipt](../../D2-MDX-PROJECT-WORKFLOW/2026-10-23/source-qualification.json) identify checked source revision `d47c0c48fda3ae52edb0b870039a5a8b5b6fcd95`, with per-file fingerprints authoritative over evidence-only commit changes. Five relevant incoming production file SHA256 fingerprints were recomputed against this merged tree and matched: work packages, k510 document preview, eSTAR content leaves, launch scope and MDx project feature constants.

The receipt's hashes for `canonical-full-prepush.txt`, `canonical-production-build.txt` and `canonical-launch-scope.txt` also match their retained raw files. The [raw pre-push output](../../D2-MDX-PROJECT-WORKFLOW/2026-10-23/canonical-full-prepush.txt) ends with every normal gate passing, whole-program TypeScript errors 0/exit 0, and changed-file warning delta -7. This is upstream gate evidence, not a claim that this worker reran those gates or evidence of a separate remote transfer. The upstream packet explicitly records `live_deployment_verified:false` and `browser_verified:false` and states that its cohorts overlap.
