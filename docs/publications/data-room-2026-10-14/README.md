# Canonical Data Room publication

The user directs every completed implementation, study and evidence deliverable to the canonical `concept2cure-v2` branch, with direct incremental commits/pushes and no PR process. This directory makes authored work previously stored under `/workspace/reports` and `/workspace/scratch` repository-owned.

`exports/` preserves the exact original PDF/DOCX/Markdown studies, delivery plans, ZIP, patch snapshots, reviews, final summaries and QA images. `authored-history/` preserves original probes, analysis/draft artifacts, before/after logs and historical renderer/packager sources. Archived JavaScript/TypeScript source copies have an added `.txt` suffix; their bytes and original source paths remain unchanged in the manifest. These archives describe past runs and are not active repository modules. `external-artifact-manifest.json` records original paths, repository destinations, sizes, exact SHA256 and explicit exclusions. Dependencies, caches, credentials and original downloaded source materials are excluded.

The `.txt` suffix also applies to the two archived source probes in `exports/Concept2Cure-data-room-study-2026-10-14-supporting-notes/`. Their original filenames remain in the unchanged historical ZIP. Historical renderer/packager copies under `authored-history/` retain their recorded bytes and paths; use only the active Python tools at this directory's root for new exports.

Original test manifests, reports and exports describe their recorded source checkpoint. They are not rewritten to pretend they qualified a later integration. Fresh concurrent-integration and publication proof belongs to [D2 canonical publication](../../evidence/D2-CANONICAL-PUBLICATION/2026-10-14/README.md). Git publication does not itself establish deployment, provider delivery, scientific review or agency acceptance.

The active `render_study.py` and `package_study.py` resolve source and repository paths from their own location and write to `exports/rebuilt/`, preserving original export bytes. Source arguments are relative to the repository root, regardless of the caller's current directory; output stems are plain filenames. Rendering requires the existing document-tool environment (ReportLab, python-docx and three DejaVu font files); use `--font-dir` when the fonts are installed elsewhere. The packager resolves an explicit existing Git baseline to an immutable commit and includes committed plus uncommitted changes from that baseline, so committing the work cannot silently produce an empty patch. It records deleted source files separately, reads filenames without Git quoting ambiguity, and rejects inputs that change during packaging.

Both tools support a read-only `--check`. These examples assume invocation from the repository root; from elsewhere, use the absolute path to the script:

```sh
python docs/publications/data-room-2026-10-14/render_study.py --check
python docs/publications/data-room-2026-10-14/package_study.py --baseline 844a30c675cc95a934c033e4a1e335a54fa41f79 --check
```

Run artifact-writing mode only after the lead freezes all source, documentation and execution logs. A file-stability check catches changes during packaging; it does not establish that a paused test has completed:

```sh
python docs/publications/data-room-2026-10-14/render_study.py docs/reports/DATA_ROOM_AI_MOAT_STUDY_2026-10-14.md Concept2Cure-data-room-study-2026-10-14
python docs/publications/data-room-2026-10-14/render_study.py docs/plans/DATA_ROOM_ENHANCEMENT_DELIVERY_PLAN_2026-10-14.md Concept2Cure-enhancement-delivery-plan-2026-10-14
python docs/publications/data-room-2026-10-14/package_study.py --baseline 844a30c675cc95a934c033e4a1e335a54fa41f79
```

The new bundle's `final-source-manifest.json` is filed under canonical-publication evidence. It is a frozen review snapshot; subsequent bundle QA, push logs and remote verification/relocation records live alongside it in the repository. Earlier frozen manifests remain historical. Original exported links resolve within their extracted `repository/` bundle. Remote commit/byte verification and relocation completion are recorded in the publication evidence and final status.
