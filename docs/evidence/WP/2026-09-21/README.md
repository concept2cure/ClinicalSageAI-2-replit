# WP — 2026-09-21 — two defects the demo packs surfaced

Worker WP was terminated by a spend limit before it filed this README. The
control tower verified its work on the tree, completed the typing it left
open, cleared the two warnings it added, and files this record. Everything
below was re-run by the control tower, not taken on report.

## Defect 1 — dispatch readiness could not resolve a vault-filed leaf

Both demo packs (`docs/evidence/DEMO/biotech`, `docs/evidence/DEMO/mdx`)
filed six vault documents into a sequence and then read every one of them
back as `UNRESOLVED_DOCUMENT` — "has no resolvable document". No sequence
assembled from uploaded documents could ever clear the dispatch gate, and
the Builder showed "Source document: unlinked" on the very leaves it had
just linked.

`submission_leaves` addresses two key spaces: `document_id` (integer) for
most stores, `document_uuid` for the uuid-keyed vault
(`migrations/20260917b_submission_leaf_document_uuid.sql`). `upsertLeaf`
accepted a vault leaf by uuid, proved its tenancy and pinned the content
hash. The readiness validator then tested the integer column alone.

A third cause sat under it, and is the same mistake the `SubmissionLeaf`
interface already documents about `documentContentSha256`: the interface
did not declare `documentUuid` at all, so `listLeaves`' `as SubmissionLeaf`
cast erased the uuid from every caller's view of a leaf it had just
written. Declared now, with that history in the comment.

**Fix.** `server/services/ectd/leaf-document-resolver.ts` — one resolver for
the readiness assessment, the Builder's source-document column and, because
freeze/dispatch/transmit compose the assessment, the gate itself. It
classifies the pointer per its table's key space, looks the document up in
the caller's organisation by whichever key that table uses, and compares
the pinned SHA-256 with the digest the store reports now, using the same
per-table reading the write side pinned. A content change is its own
finding (`DOCUMENT_CONTENT_MISMATCH`), never silently passed.

**Revert-proof.** With the pre-fix predicate restored (integer column only),
5 of the 32 cases in `dispatch-readiness.test.ts` fail, naming the vault
leaf and the resolver verdicts. Restored: 32/32 pass.

## Defect 2 — the project read omitted the device taxonomy it had stored

`POST /api/c2c/projects` stored device class, regulatory path, product
code, predicate devices and product type for a 510(k)/IVD program;
`GET /api/c2c/projects/:id` returned none of them, so Project home could
not show the class or the predicate and the shell segment read
"Biotech & Pharma" with a device program open. The read now returns what
the write stored, Project home renders the device block for a device
program and the drug block for a drug program, and the shell segment
follows the program's product type.

## Verification re-run by the control tower

| Check | Result |
|---|---|
| `npx tsc --noEmit` (whole tree) | 0 errors |
| WP's 8 suites | 72 passed |
| `server/services/ectd` (all) | 69 files, 760 passed |
| client Project home / shell / dispatch suites | 11 files, 59 passed |
| eslint warning ratchet | WP's files absent after the extraction below |

Two warnings WP introduced were cleared rather than suppressed: the
resolution branch of `documentPointerFindings` moved into
`resolutionFindings` (complexity 16 → under the limit), and the new
document-pointer describes were promoted to top level (arrow length).

`screenshots/01-project-home-device-block.png` — Project home showing the
seeded `[Demo · MDX] NeuroPanel-Dx 510(k)` device block.

## Owed

The live before/after readiness verdicts on the two seeded sequences were
not captured before the worker was terminated. The unit and integration
proof above covers the logic; the live run is owed and cheap: seed, then
`GET /api/submissions/68/sequences/29/dispatch-readiness`.
