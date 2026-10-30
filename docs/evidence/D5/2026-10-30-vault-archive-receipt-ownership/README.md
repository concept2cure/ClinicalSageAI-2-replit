# Complete Vault archive receipt ownership (W1 / D5)

## What already exists

Live searches covered Vault ingest callers, archive/folder export/closing archive, download helpers and current-session download owners across client surfaces, helpers and tests. Deleted-history searches covered `*vault*`, `*Vault*`, `*ingest*`, `*[Aa]rchive*` and `*[Dd]ownload*`; no retained replacement archive-download owner was found.

- `client/src/concept2cure/v2/surfaces/vaultArchiveDownload.ts:saveVerifiedArchive` is the sole client archive checksum/save implementation. It reads response bytes, computes SHA-256 when available, then invokes `downloadBlob`; it has no initiating-view/session check during those asynchronous steps.
- `VaultFolderExport.tsx` owns the folder export button and request. Its asynchronous closure can continue after unmount or project/folder change, with React busy state rather than a synchronous admission guard.
- `VaultSeals.tsx` owns closing archive requests and the selected seal card. Its asynchronous archive work has the same unowned save path. Both callers must continue through the shared checksum/save implementation.
- `client/src/concept2cure/v2/download.ts` already owns browser Blob saving and filename handling. No second file saver is needed.
- Existing canonical owners are `authService.captureSessionReadGuard`, `editor/authoringCurrentRead.ts`, `vaultUploadVisit.ts` and the reusable session/visit helpers in `surfaces/company-documents/companySession.ts`. Existing company and editor downloads already check their owner before exposing/save effects. Reuse or extend an appropriate existing owner; do not create another auth/session store.
- `server/routes/c2c/project-vault.ts` already rechecks current actor, role and exact project/workspace before archive audit commit. The server cannot retire browser effects after a later client context change; this continuation completes the client boundary without changing archive construction or permission policy.
- Existing actual-caller tests are `v2/__tests__/vaultFolderExport.test.tsx` and `vaultSeals.test.tsx`. Extend their existing seams and add meaningful controlled timing cases; do not replace the archive service or manufacture confirmed success.
- The remaining direct eTMF ingest caller is in an explicitly claimed convergence lane, so this work leaves it with that owner.

## Design boundary

Bind each archive request, body read, digest and browser-save effect to its initiating project/folder/seal visit and canonical account session. Retired visits must not save private bytes or publish old notes into a replacement view. Preserve admitted same-session bearer refresh, checksum mismatch refusals, server refusals, original request scope and existing archive metadata. Prevent repeated starts before React rerender. Review the existing unavailable-digest behavior against the accepted archive contract before changing its semantics. No new surface, dependency, schema, permission expansion or server write path is proposed.

## Verification plan

Reproduce late-save behavior against actual helpers/components with controlled response/body/digest timing. Show negative controls failing before fixes, retain valid stable-owner and normal-refresh controls, then run focused caller/shared-helper regressions, production build, TypeScript and normal publication gates. Any checksum-policy finding will be reconciled with the existing design and documented before implementation.
