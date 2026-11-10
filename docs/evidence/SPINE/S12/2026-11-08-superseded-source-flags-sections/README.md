# S12: a new version of a data-room source flags the sections written from the old one

**Package:** S12 (founder decisions P-83, P-109). **Plan:** S12. **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`,
2026-11-09. This is the first S12 change. It does not depend on the open question about where a work project lives
(sent to the coordinating session, 2026-11-09).

## What already exists (RULE 3)

The full inventory is `../2026-11-08-what-already-exists/README.md`. For this change:

| Piece | Path | Does | Did not |
|---|---|---|---|
| Version chain | `migrations/20260829_cre_source_versioning.sql`; `evidence-spine.service.ts` `createSupersedingSource` | A new capture of the same file (same title, project, type and study) becomes the next version. The old row's `is_current` becomes false, and the new one carries `previous_version_id`. | — |
| Immutable captures | `migrations/20261001_cre_evidence_sources_capture_immutability.sql` | A capture's checksum never changes | — |
| The editor's Sources rail | `source-usage-projection.ts` | Says a superseded source was "replaced since cited" | — |
| The data room's "Used in" and the project's changed list | `source-usage.service.ts` `summarizeSourceUsage`, `listChangedSourceUsages`; route `GET /api/c2c/projects/:id/source-changes`; `ProjectHome.tsx` DataRoom | Count a citation as changed when the cited row's checksum differs from the one recorded | **Never counted a superseded version.** A capture's checksum cannot change, so a section written from version 1 of a file read as current after version 2 landed. The existing tests rewrote a checksum in place, a path the immutability migration forbids. |

## What changed

`source-usage.service.ts`:

- A citation counts as changed when its source is superseded (`is_current` false), or, as before, when the checksums
  differ.
- The changed list's `currentChecksum` is now the current version's checksum. It walks `previous_version_id` forward,
  within the same organization, skipping deleted rows, to at most 100 versions.
- `citedChecksum` and `currentChecksum` are typed `string | null`, so a superseded citation that recorded no checksum
  is listed with its checksum unknown, never with the text `"null"`. Their one reader passes them through.

There is no new route, table, screen or tool. The citation isolation rule (`citation-ends.ts`, by program UUID) is
unchanged, as P-109 decides.

## Red first

- **Tests:** `server/services/clinical-regulatory-evidence/__tests__/source-usage-superseded.pglite.integration.test.ts`
  uses the real `createSupersedingSource` on PGlite with the real migrations. It was split from
  `source-usage.pglite.integration.test.ts`, which is at its length limit.
  - Against trunk's service, 3 of its 4 cases fail (`tests-red.log`).
  - With the change, all 4 pass (`tests.log`). The fourth case pins that a section citing the current version is not
    changed.
  - The evidence service's 59 test files, 960 tests, pass.
- **In the running app:** `walk.cjs` runs on C2C-101 at 1440:
  1. It uploads a file through the composer's upload.
  2. It cites the file in the 2.3 section through the editor's cite route.
  3. It uploads changed bytes under the same name. The capture records version 2, with `previous_version_id` set to
     version 1.
  4. The project's changes list the section, and Evidence's data room says "accessible citations shown in this
     project point to a source that has since changed" and names it (`screenshots/evidence-changed-sources.png`).
  - On trunk's service, the same walk stops at step 4: the changes list is empty (`red.log`, `walk-red.json`). With the
    change it passes (`green.log`, `walk.json`), re-run after a server restart on the committed code.

## Found

- **No seeded study can be matched from a document.** A new capture becomes the next version only within one study,
  and the study is matched by the protocol number on the document's title page (`catalog-facts.ts` `matchStudy`).
  C2C-101's seeded study has `protocol_id` set to the program's UUID and `study_id` `sd_…`. Neither fits the protocol
  number pattern (`[A-Z0-9._/-]`, 4–32 characters), so on the demo data no upload can ever be a new version.
  - For the walk, the local, disposable database registered a second C2C-101 study with protocol id `C2C-101-201W`,
    by SQL.
  - This is for the DATA owner: seed the demo studies with their real protocol numbers (C2C-101-201, LMN-201-…).
- **A capture with the same bytes is reused whatever its file name** (`findReusableCapture`, by checksum). This is
  intended, and it is why each walk run writes bytes of its own.
- **The rule for what makes a new version** (same title, project, source type and study) is the ingest's, and is
  unchanged. P-109 makes a work project's deliverable a Vault version family. Flagging a filing section when a
  deliverable's new Vault version is approved is the next S12 slice, once the coordinating session rules on where a
  work project lives.
