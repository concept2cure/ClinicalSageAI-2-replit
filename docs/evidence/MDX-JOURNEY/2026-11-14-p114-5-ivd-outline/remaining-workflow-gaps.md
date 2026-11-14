# Remaining device/diagnostic workflow gaps

Read-only discovery on the current canonical integration. These are not completed features or human acceptance evidence. The IVD outline repair is separately qualified in this packet.

## What already exists

- `mdx/surfaces/pathway/DossierAttachments.tsx`: uploads actual Vault bytes, then calls only local `DossierStore.attachFile`. The file persists; its section association is not recorded by that caller.
- `mdx/hooks/useDossier.ts:153`: hydrates sections with `attachments: []`. Refresh/reload therefore loses that displayed association. It currently fetches section bodies only when prose exists; evidence must also be read for sections without prose.
- `mdx/store/dossierStore.ts` and `mdx/types.ts`: existing local attachment projection/types; extend those owners instead of another store.
- `server/routes/c2c/documents.ts`: existing section GET plus POST/DELETE evidence routes, backed by `c2c_document_section_evidence`. Writers already enforce current project edit rights and audit in their transaction. They are not reached by the drawer. Connecting them directly is incomplete: exact Vault-source validation, filing/authoring seals, duplicate handling and unconfirmed-commit recovery still need review/completion.
- `v2/useVaultUpload.ts`: indexed stored status does not expose the actual document UUID needed for reliable partial-batch linkage. Its compressed success array must not be zipped with selected files or correlated by filename.
- `mdx/surfaces/pathway/FilesTreePane.tsx:281`: “Download original” is still a prevented `href="#"`. The pane presents browser-generated `who` as “Uploaded by”; that is not authoritative server attribution.
- The existing authenticated project-Vault download route and shared `downloadBlob` are the original-download owners. Section Activity reads content versions; it does not establish evidence-link history.

Client paths above are under `client/src/concept2cure/`. Searches covered the current client hook/store/caller, section routes/table consumers, existing download owner, current coordination holds, and `git log --all --diff-filter=D` for these names. No matching deletion was found in fetched history; the checkout still has shallow boundaries, so exhaustive historical absence is not claimed.

## Next completion boundary

Complete existing section reads/writes, authoritative hydration, exact indexed Vault identity and the existing attachment/download callers. No additional table, API mount, store or service is needed. Preserve current project admission and transaction-owned audit; reuse existing filing/authoring seal and Vault-source checks. Treat upload and section linkage as two separate commits, including an explicit unconfirmed outcome and no automatic replay.

The seven main existing owners are `documents.ts`, `useVaultUpload.ts`, MDX `types.ts`, `dossierStore.ts`, `useDossier.ts`, `DossierAttachments.tsx`, and `FilesTreePane.tsx`. Exact lifetime/session/shell ownership still needs tracing before implementation. W7 holds `PathwayPanes.tsx`; this completion should not assume that file is available.

Existing IVD projects also retain their old governed outline versions. This increment does not automatically upgrade authored or signed records. Human review of the actual form, deployed acceptance, and FDA portal upload remain separate from local engineering checks.

## Deeper source-retention audit: completion scope correction

The later source-traced audit in `../2026-11-14-fda-510k-authoring-keys/next-workflow-completion/` supersedes a seven-client-owner-only interpretation of this boundary. The existing source record is strongly immutable in the deployed Vault record guard, but original-file availability can still be withdrawn or tombstoned without recognizing these section associations. Existing where-used, disposition-impact/confirmation and retention/compensation owners must participate in the completion. A visible persisted link alone would not close the end-to-end gap.

The two detailed reports identify exact current owners, source pins, nonblocking signer reservation, duplicate/unknown-outcome contracts and native-concurrency cases. All attachment and retention changes remain **unimplemented**. They establish neither scientific span lineage nor human/agency acceptance. Do not connect the browser to the current permissive writer and describe the workflow as finished.
