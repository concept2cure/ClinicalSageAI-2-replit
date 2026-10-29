# D6: a seal's closing archive (VR-20 part 1, 2026-10-29)

This is `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` VR-20, under FD10 (c): the archive is a download built from a staged, fully verified file, and the same builder later carries the tenant data return's bytes. The design and its "What already exists" section are in `docs/design/VAULT_CLOSING_ARCHIVE_2026-10-29.md`.

For a seal (VR-19), anyone the project admits can download one ZIP. It holds:

- every sealed document's original bytes, at an index-ordered path;
- `manifest.json`, with the seal and its record exactly as signed;
- `INDEX.txt`, a printable index;
- `SHA256SUMS` over every other file;
- `audit/audit-trail.json`, the chained audit rows of the seal and of each sealed version, with the chain verdict.

The seal is verified before anything is built, and every stored file is read again for that check. The bytes that made the verdict are the bytes archived. A seal that is not intact gets no archive. A sealed document whose original file was removed under a data disposition (`keep_data`) is listed as withheld, with its sealed hash and the reason. Its file is not read, because the single download refuses it too. The archive's own SHA-256 is committed to the audit chain before a byte is sent, and the browser checks the file it receives against that hash before saving it.

## What changed

| Piece | Where |
|---|---|
| The one builder: stage verified bytes, then write the ZIP with manifest, index, attachments and `SHA256SUMS`, hash it, and clean up | `server/services/vault/vault-archive-builder.ts` (`openVaultArchive`) |
| What a seal's archive says about itself: the manifest, the index header, and the audit extract. The extract is read through `readRecordAuditHistory`, projected as the document history is, and refused at the reader's ceiling rather than cut. | `server/services/vault/vault-seal-archive.ts` |
| `GET /:id/seals/:sealId/archive`, the audit-before-send row (`recordVaultArchive`), the staged send, and one reader of a sealed version's bytes shared with verify | `server/routes/c2c/project-vault.ts` |
| `verifySeal` hands the sealed document to the byte check and returns the stored manifest | `server/services/vault/vault-seal.service.ts` |
| "Download closing archive" on an intact seal. The file is checked against `X-Content-SHA256` before saving, and the hash is stated. | `client/src/concept2cure/v2/surfaces/VaultSeals.tsx` |
| The shared Vault test fixture answers `/seals` as an unsealed Vault (trunk red from VR-19, below) | `client/src/concept2cure/v2/__tests__/_vault-surface-fixtures.ts` |

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | Before the route existed, with the archive cases added to the seal suite on real PostgreSQL 16 (`RLS_ENFORCE=on`, `app_service`): 3 of the 4 archive cases fail. The fourth, "another organisation's seal is not found", passed for the wrong reason: there was no route at all. It passes in green because the seal is not found in that organisation. The audit-failure case was added after green, and its red is mutation M6. |
| `02-green.txt` | **Real PostgreSQL 16:** 23 of 23, the seal suite with the where-used suite. It covers the archive's contents, each document's hash against the seal, the embedded manifest against `manifest_sha256`, the audit extract, one archive row carrying the received body's hash, no staging directory left behind, a seal that does not verify (409, nothing built or recorded), a foreign seal (404), a failed audit write (500, nothing sent, nothing recorded, nothing left), a viewer allowed, and a withheld file listed but not archived. **Unit and client:** 57 of 57. **The Vault route, service and client suites:** 1,176 of 1,177; the one failure is the fixture red below. After the fixture fix, that suite and the other suites that mount the Vault: 40 of 40. **Type check:** `tsc --noEmit` exits 0. |
| `03-mutation.txt` | Six mutations, each caught: <ul><li>the builder stages bytes whose hash does not match;</li><li>`SHA256SUMS` omits the manifest, index and attachments;</li><li>an archive is built for a seal that is not intact;</li><li>no archive audit row is written;</li><li>the row carries the seal's hash instead of the archive's;</li><li>a failed audit write is logged and the archive is sent anyway.</li></ul> |
| `05-withheld-red.txt` | Found in review: the archive served a file the single download refuses. A sealed document under a `keep_data` disposition was archived with its bytes and no withheld listing. This is the red for the withheld case, and it is also its mutation: removing the check brings it back. |
| `04-fixture-red.txt` | Trunk red from VR-19 (765f2b399). The shared Vault fixture answered `/seals` with `{}`, so the seals card reported a failed read with `role=alert`, and `vaultSurfaceAnaContext`'s `findByRole('alert')` found two alerts. The card was right: `{}` is not a list. The fixture now answers as an unsealed Vault. |

## Decisions recorded here

- **There is one refusal for an archive that cannot be built, `SEAL_NOT_INTACT`, carrying the verdict.** An unreadable or mismatched file is part of the seal's verdict ("could not verify"), so the plan's separate `ARCHIVE_INCOMPLETE` is not needed.
- **A document with no recorded hash is refused by the builder.** Its bytes cannot be shown to be the sealed ones. `vault.documents.content_hash` is `NOT NULL`, so this is a guard, not a path in use.
- **A file removed under a data disposition is listed as withheld, not refused.** Refusing would make an archive impossible for every seal that names such a document. The manifest's `withheld` list, the index and the `X-Archive-Withheld` header state it, and the client says so when it saves the archive. Verify with `?bytes=1` (VR-19) still reads such a file when it is stored; it serves nothing, so it is left as it is.
- **The audit extract is projected as the document history is.** An archive shows no more of the trail than the history route does to the same person.

## Not done

- **A 200 MB room under a heap bound (plan test 5).** There is no test for it. By construction, the heap holds one document at a time, and each read is one whole file through `readVerifiedVaultBytes`, as the single download is. Bounding a single large file would need a streamed verified reader, which is a change to the one reader.
- **No limit on concurrent archive builds.** Each build stages one copy of the sealed files on the server's disk. A per-user limit on concurrent builds is not in this change.
- **Part 2, the tenant data return through the same builder (FD10 (c)).** It edits `tenant-full-export.service.ts`, the released D6 lane's file, and is its own change.
- **MR-08 Stage 6 step 3, a bulk export of a selection, through the same builder.**
- **Handed on:** `one-signing-authority-policy.test.ts` is still red on trunk, from the review-routing lane's `review-route-member.ts` (as recorded in VR-19's README).
