# D3 — the upload allowlist admits by extension, never by a declared `image/` type

The security review of 2026-10-15 reported this as a pre-existing gap
(`docs/evidence/D2-DATA-ROOM-CATALOG/2026-10-15-security-review-fixes/README.md`, "Reported, not changed here").

## Before

When an extension was not on its list, `isAllowedUpload` admitted the file if its declared type began `image/`. That applied to every route on the default list:

- `POST /api/chat/upload`, the Data Room intake;
- module-integration uploads and attachments.

The declared type is the client's claim. So `archive.zip` sent as `image/png`, with PNG magic in front of the archive, passed the allowlist. It then passed the signature check (PNG magic) and was stored under its own name. This was probed against the real `multer` and `assertUploadSafe`.

Every route that names its own list had already switched the fallback off (`allowMimePrefixes: []`, ten call sites).

## After

An extension is admitted only by the list, or by a declared type the route names exactly (`mimeTypes`). The prefix fallback is removed, along with the option nobody set to anything but empty, and its ten call sites.

**Nothing legitimate is lost.** Every image type the signature check can verify is on the default list by extension: png, jpg, jpeg and gif. webp, tif and tiff stay on the list. heic, bmp and svg have no signature check, so `assertUploadSafe` refused them after the allowlist anyway.

## Files

- `01-red.txt`: `uploadAllowlist.ts` as on trunk at `7559080e0`. `archive.zip` declared `image/png` is admitted.
- `02-green.txt`: the allowlist, receive, module-integration and route suites.

## Failures found, not caused here

The route suites run with 19 failures in 6 files: `agent-swarm-retired`, `authoring-section-figure-refs`, `report-os-audit-recording`, `report-os-report-pack-export`, `report-os-saved-read-access` and `submissions-program-anchor`. None touch uploads. They fail identically on trunk at `7559080e0` with this commit's files reverted, 19 failed and 85 passed both ways (`02-green.txt`). They are left for the trunk-green lane.
