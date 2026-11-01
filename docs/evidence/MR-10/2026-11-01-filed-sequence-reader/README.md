# MR-10 Stage 9, slice 1: a sequence filed elsewhere reads back as filed state

Launch row **D7**, ledger package **L1**, tester blocker **CAT2-07**. Session
`…session_01Gx2fiwvxaXi6mQgddPqMaG`, 2026-11-01, on `concept2cure-v2` from `8b8c6bc1`.
It is aligned with the coordinating session's holds
(`.design/claude-convergence/COORDINATION.md`) and touches no held file (design,
"Alignment with the other sessions").
Design: `docs/design/FILED_SEQUENCE_READER_2026-11-01.md`.

## What already exists

The full table is in the design, section "What already exists". In short, by path:

| Path | What it does | What it did not do |
|---|---|---|
| `server/services/legacy-importer/detector.ts` | The only reader of a foreign eCTD archive. It reaches users through AnA's `start_legacy_import`. | Its regex reader read the regional backbone only and matched hrefs to zip paths as written, so it mapped no leaf of a real sequence (see Proof). |
| `server/services/ectd/sequence-manifest.ts` | The record the platform keeps of each sequence it files (`SequenceLeafManifestEntry`). | Nothing produced it for a sequence filed elsewhere. |
| `server/services/ectd/prior-sequence-loader.ts` | `foldManifestRows` folds those records into the filed state, publicly through `loadFiledStateBySubmission`. `MODIFIED_FILE` is the pointer grammar it binds by. | Only native records. Held by RIM for F1 slice 1, so not edited here. |
| `submission-gateways/ectd-packager/ich-headings.ts`, `ectd/controlled-vocab/fda-regional-sections.ts` | Forward heading maps (section → element). | No reverse map. |
| `submission-gateways/ectd-structural-validator.ts` | Outbound checksum checks, by regex. | Not a reader. Adjacent; not converged here (design, "Adjacent, not converged"). |
| `archive/safeZip.ts`, `ectd/leaf-path-safety.ts` | Archive limits; containment. | Reused. |
| `ectd/filed-sequence-baseline.ts` and its route and surface | Declares the numbers of sequences filed elsewhere. | Holds no leaf. |

No deleted reader or importer was found (`git log --all --diff-filter=D` on
importer, legacy, backbone, filed-sequence, prior-sequence and manifest names).

## The change

| File | Change |
|---|---|
| `server/services/legacy-importer/filed-sequence-reader.ts` | The one reader of a filed sequence. It reads both backbones and verifies index-md5 and every checksum. Each href must stay in its sequence. A leaf's section is the heading that holds it. Pointers are bound within the archive. There are 20 refusal codes, and a refused leaf is never in `leaves`. External DTDs are not fetched, and a backbone that declares entities is refused before parsing. The archive is bounded before it inflates. |
| `server/services/legacy-importer/detector.ts` | `parseBackboneLeaves` (regex) and the regex admin reads are deleted. A file is `mapped` only where the reader declares it, at the reader's section. Each refusal is an error finding naming the file. The root `index-md5.txt` is structure. The replacement is the reader above, reached by the same two callers. |
| Two existing fixtures | `detector-filename-match-is-a-suggestion.test.ts` and `mdx-imports-structure-files-recognized-by-path.pglite.test.ts` were written in the old reader's own shape: root-relative regional hrefs, and no real `index.xml`. They are now conformant sequences. Each test asserts what it asserted before. The declared cover letter is at 1.2 (cover letters), not 1.1 (forms). |

Not changed: any route, table, migration, screen, AnA tool, or the structural
validator.

## Proof

| Check | Before (detector at `5f30fdda`) | After |
|---|---|---|
| `detector-reads-a-filed-sequence.test.ts`: a sequence built by the platform's own packager (Modules 1–5, with STFs) | **5 of 5 fail** ([detector-before-fix.txt](detector-before-fix.txt)). Each failure:<br>• 0 of 5 leaves mapped from a backbone; all 5 placed by filename, with 4 sections wrong at module level (`1`, `3`, `4`, `5`);<br>• the cover letter reported `missing_required_leaf` though the archive holds it;<br>• application, sequence and sponsor all null;<br>• the root `index-md5.txt` not recognized;<br>• a tampered leaf still `suggested` with no error. | 5 of 5 pass |
| `filed-sequence-reader-round-trip.test.ts`: three sequences (0000 new; 0001 replace and append; 0002 a Module 1 replace into the regional backbone, and a withdrawal), built by `packageEctdSubmission` and put in one archive | — (the reader did not exist) | Every leaf of every sequence equals the packager's recorded manifest on section, file, href, md5, act, `modified-file`, title, backbone ID and backbone. The one exception is the 3.2.S.4.2 leaf, read back at its heading, 3.2.S, as the design records. **The fold (`loadFiledStateBySubmission`, given the manifests as its query's rows) gives the same filed state from the imported sequences as from the platform's own records.** |
| `filed-sequence-reader-refuses.test.ts` | — | 33 cases:<br>• all 20 refusal codes, each naming the leaf;<br>• the heading reverse map agreeing with every ICH heading the packager writes, and with every FDA Module 1 heading except 1.18, the one `usRegionalHeadingPlacement` already says it cannot stand behind;<br>• pointers bound, refused, or left for the filed state. |
| Each guard made to fail | — | [guards-made-to-fail.txt](guards-made-to-fail.txt): eight guards removed one at a time, and each turns at least one test red. The guards: the checksum compare, the archive limits, the wrapper check, the entity pre-check, href containment, pointer binding, the pointer form check and the index-md5 compare. |
| Consumers | — | [after-fix.txt](after-fix.txt): the legacy-importer suite, the mdx-imports route tests (PGlite, real INSERT), the onboarding aggregate, `tests/mdx-imports-routes.test.ts`, and the archive-limit call sites. All pass. |

## Not done here, and why

Recording an imported sequence as filed state is steps 4–8 in the design's last
table. That work needs a governed act, a migration and an entry point:

- the act collides with the unreleased package-model claim;
- where the record lives is a founder decision;
- the entry point must be the existing project start or Builder, with Vault
  `.zip` admission an open MR-08 decision;
- DTD validation waits on the vendored DTDs.

Until those land, CAT2-07 remains open. A tester can see a legacy archive's
leaves mapped correctly through AnA's `start_legacy_import`, but cannot yet act
on them in a sequence.

`docs/design/FILED_ELSEWHERE_BASELINE_2026-10-29.md` (another lane's record)
still says no part of the Stage 9 import exists. The reader now exists; that row
is left to its owner.
