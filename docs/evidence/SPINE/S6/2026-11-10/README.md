# S6, 2026-11-10: the Vault decisions of P-107, item 3

`docs/LAUNCH_DEFINITION_OF_DONE.md` P-107 item 3 decided six things for the Vault and handed them to S6's holder
(`.design/claude-convergence/COORDINATION.md`, "Decided 2026-11-08"). Session `session_01QoxbLZMScz1c2iFESBLn9J`.
Run on the Codespace-shaped local database, signed in through `/api/auth/dev-login`, signed out after each walk.

## What already exists (searched before building; RULE 3)

| Decision | What existed | What it did not do |
|---|---|---|
| A seal says when its version was superseded | `vault-seal.service.ts` `listSeals` (each seal's documents, from the signed manifest only); `vault-version-family.ts` (the one link rule, `VALID_LINK`, `supersededSql`) | Read the version chain for a sealed version; the list said nothing of a later version |
| No cross-sponsor view for a CRO | The no-project Vault (`Vault.tsx` `ProjectVaults`, `VaultOrganizationArtifacts.tsx`); `GET /api/artifacts-center?sameClientAs=<project>`, which narrows by that project's verified sponsor (S6 V4) | Ask which sponsor: with no project open it listed every sponsor's projects and artifacts together |
| Retention never destroys a version (FD3 c) | `server/jobs/retentionCron.ts`: a policy asking for destruction is refused and counted (`destructionRefused`), and only a tombstone is written; the database refuses the delete (VR-07) | Nothing to add in code. S3 Object Lock is the D1 lane's, with the AWS account |
| Binders are editable, audited views that never alter a document | The folders and filing binders of `../2026-11-06/`: made, renamed, moved and removed by a project's editors, each with a chained audit row; a folder change writes no document field but its place | Nothing further in this pass |
| Device coverage follows the eSTAR mapper | not started here | open |
| A PDF rendition per version, bound to the source's SHA-256 | `server/services/pdf-converter.ts` (LibreOffice, deterministic); the Vault's audited, hash-verified download; the version viewer (`VaultVersionViewer.tsx`), which framed PDFs only | Any rendition: a Word version could only be downloaded |

## Landed

1. **A seal says when its version has been superseded.** `readSuccessors` reads the chain (ids, version numbers,
   dates; never a document's own fields); `listSeals` adds `supersededBy` beside the manifest's record. A chain that
   cannot be read leaves the line off, never "current". Red first (two cases). Walk `walk-seal-superseded.cjs`: the
   LMN-301 Vault is sealed and signed, a new version of the sealed brochure is checked in, and the seal reads
   "Superseded by version 2.0 on 2026-11-10. The seal still holds the version above.", with v1.0 and its sealed hash
   (`screenshots/seal-1-before.png`, `seal-2-superseded.png`).
2. **With no project open, the Vault asks which sponsor first.** `vaultSponsors.ts`: sponsors are the projects'
   client workspaces. Until one is chosen, no project and no artifact is listed and no artifact read is made; then
   only that sponsor's projects, and its artifacts read through `sameClientAs` by one of its projects, so the server
   narrows from the verified sponsor. Red first (two cases). Walk `walk-sponsor-first.cjs`
   (`screenshots/sponsor-1-which.png`, `sponsor-2-one-sponsor.png`).
   **Found walking:** the first cut grouped by the list's `ws`, which is the product segment (Biotech, MDX, Pharma),
   not the sponsor; the walk showed three "sponsors" that were segments. It reads `client_workspace_id` now, with a
   test that pins it.

3. **A Word version is viewed as a PDF rendition, bound to its source.** `vault-rendition.ts` renders a `.docx`
   through the one converter from the version's verified bytes. The Vault's own download route serves it
   (`?rendition=pdf`) under its own name, with `X-Rendition-Of-SHA256` (the version's recorded hash) and its own
   `X-Content-SHA256`, and writes a chained `vault.document.rendition` row with both (`rendition-audit.txt`). It is
   made on request and never stored, so it cannot be filed, sealed or placed in a submission in place of its source.
   A source that is a PDF is viewed as itself; another format is refused by name. Red first (six cases). Walk
   `walk-rendition.cjs`: a Word file uploaded, "View as PDF" frames it, both hashes served, the source still
   downloads as the Word file with the same hash, a `.txt` refused with 422 (`screenshots/rendition-1-viewer.png`).
   **Found walking:** the viewer's caption said the rendition's hash was "verified against the vault record", which
   is true of a stored version only; a rendition now says what it was made from.
   **Limit, said plainly:** only Word sources are rendered (the converter reads `.docx`); a spreadsheet, dataset or
   text version has no rendition yet. Each view converts again (a few seconds); nothing is cached.

## Open

- Device coverage converged onto the eSTAR mapper (the D4/D6 disagreement, red first).
- Renditions for formats other than Word.
