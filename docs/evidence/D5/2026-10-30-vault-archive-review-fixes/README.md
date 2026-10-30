# D5: the Vault's archives after a security review (2026-10-30)

A read-only security review was run on the folder export (MR-08 Stage 6 step 3, `docs/evidence/D2/2026-10-30-vault-folder-export/`) and, through it, on the seal's closing archive (VR-20). Both share the builder, the audit extract and the send.

The review confirmed:
- another organisation naming a project gets a concealed 404;
- `folderId` reaches no SQL and no header unchecked;
- the audit row is committed before a byte is sent;
- one unverified file refuses the export.

It found five problems. All are fixed here, each red first.

## What already exists

- **The audit reader's own rule** (`server/services/audit/audit-api-authority.ts`, DP-18). The trail, with people's names, emails and IP addresses, is read by organisation administrators and managers (`canReadAuditTrail`). Both archives are downloadable by any project member, as each file is.
- **The shared audit extract** (`readArchiveAuditExtract`, `server/services/vault/vault-seal-archive.ts`), called by both archives.
- **The send** (`sendStagedArchive`, previously private to `server/routes/c2c/project-vault.ts`) and the staging builder (`vault-archive-builder.ts`).
- **A single download already writes a per-document row** (`vault.document.download`).
- **The tree's placement rule** (`filingCabinet`): a row is in a folder when its filing is suggested or confirmed, and in Unfiled otherwise.

## The findings, and what changed

| # | Finding | Fix | Where |
|---|---|---|---|
| F1 | A viewer's archive carried the audit trail with people's names (or emails, where no name is recorded) and IP addresses. That is a second door onto what DP-18 limits to audit readers. | For anyone who may not read the audit trail, each entry names its actor by account reference (`user:<id>`), and IP addresses are left out. The archive says so in `audit-trail.json` (`actors: "by reference"`), in `manifest.json` and in `INDEX.txt`. Chain hashes and every other field are as recorded. An audit reader's copy is unchanged. | `vault-seal-archive.ts` (`byReference`, `ACTORS_BY_REFERENCE_NOTE`), both builders, both routes (`canReadAuditTrail(req)`) |
| F2 | A request closed before its archive was ready left every staged plaintext file and the ZIP in tmp. The response's `close` had already fired when the send began listening for it. Shown by experiment in the review. | `sendStagedArchive` moved to its own module. On a response that is already closed it removes the staging directory and sends nothing. | `server/services/vault/vault-archive-delivery.ts` (new) |
| F3 | Nothing bounded the work one person could start: each archive reads, writes, compresses and hashes every file it holds. | One person builds one archive at a time (per server process). A second request gets 429 `ARCHIVE_BUSY` and nothing is built. | `beginArchiveBuild` in the same module, both routes |
| F4 | An export wrote one row for the folder, with the document ids only inside its details. A document's own history never showed that it had left the Vault, as it does for a single download. | Each document an archive holds gets a chained `vault.document.exported` row, in the same transaction as the archive's own row: "Left the Vault in the export of Module 3 · Quality", with the archive's SHA-256. If any row cannot be written, nothing is sent. | `recordVaultArchive` |
| F5 | The export filtered on the folder column alone. A row with a folder but placed as Unfiled, which the tree lists under Unfiled, was exported as folder content. A planned row missing from the file read was dropped silently. Unconfirmed, machine-suggested filings were not marked as such in the index. | One rule, `cabinetFolderOf`, places a row for the tree, its Unfiled queue and the export alike. A planned row the file read cannot find refuses the export (409 `FOLDER_CHANGED`). `INDEX.txt` lists the documents filed by the Vault's suggestion and not yet confirmed by a person. | `vault-filing.service.ts`, `vault-folder-export.ts`, `project-vault.ts` (`filingCabinet`) |

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The folder-export dbtest on real PostgreSQL 16, as `app_service` with `RLS_ENFORCE=on`, run with the fixes taken out. The five new cases fail and the six existing ones pass. |
| `02-green.txt` | <ul><li>**The folder-export, seal, hold-notice and restore dbtests:** 38 of 38. The seal's viewer case now also checks references and per-document rows.</li><li>**The delivery unit tests.**</li><li>**The client, route and Vault-service suites.**</li><li>**Type check:** `tsc` exits 0.</li><li>**Lint ratchet:** unchanged.</li></ul> |
| `03-mutation.txt` | Nine mutations, each caught:<ul><li>names and IP addresses for everyone;</li><li>every reader treated as an audit reader;</li><li>a closed request sent to;</li><li>no build guard;</li><li>no per-document rows;</li><li>the folder column alone;</li><li>a vanished row dropped quietly;</li><li>no unconfirmed list;</li><li>the shared rule ignoring placement.</li></ul> |

## Decisions recorded here

- **An archive is never a second door.** Whoever may download a file may download an archive of it, but what the audit reader withholds from them, the archive withholds too. The actor reference still lets an audit reader resolve every entry. The copy says plainly that it names by reference, so its holder does not take a reference for an anonymous act.
- **One build at a time per person, not per organisation.** A colleague's export is not blocked by another's. The bound is on what one account can start at once, and each server process enforces its own. The document count and total size of one archive stay bounded by the folder or seal itself and the 50 MB file cap. A size ceiling for one archive is part of the queued design that MR-08 Stage 6 step 3 leaves for a folder too large to build in one request.
- **A document's history is where "who has had it" is answered.** The cost is one chained row per document per export, written in one transaction with the archive's row, which is what a download already costs.

## Not done here

- The same second door on `GET …/documents/:id/history`, which the review names: it is the single-document history read, not an archive, and predates this change. Handed on to the audit-access lane (DP-18).
- A sweep for staging directories left by a process that dies mid-build. Task-local tmp is lost when the task restarts. Recorded, not built.
- The route's local `resolveOrgId` precedence differs from admission's. The review found it latent rather than exploitable, with RLS as the backstop. Handed on.
