# D2 — a .zip in the Data Room: each file inside is its own upload

**Founder decision:** 2026-10-15, "Do it all", on design doc §6 (`.zip` intake of dataset bundles).

## Before

A `.zip` was refused at the client ("Unsupported file type") and at the server allowlist. A sponsor's dataset bundle — `sdtm/*.xpt`, `define.xml`, the reviewer's guide — had to be unpacked and uploaded file by file.

## After

`client/src/concept2cure/hooks/archive-intake.ts` opens the archive in the browser. `useChatUpload` sends each file inside it as its own upload, one at a time. This hook is the one behind every Data Room intake: ProjectHome, the conversation composers and Respond.

**Why the browser, not the server.** Each entry reaches `POST /api/chat/upload` as an ordinary upload and passes every server check as itself:

- name/type binding and the byte signature;
- the malware scan;
- tenancy;
- the one processing step.

The server never receives an archive. Its allowlist still refuses `.zip` (`uploadAllowlist.test.ts`), so it gains no decompressor to bound and no second intake path. The cost is stated in the summary every time: the archive itself is not kept, only the files that came out of it.

**Bounds.** Each is shown refusing in `archive-intake.test.ts`.

| Bound | Refuses | When |
|---|---|---|
| 200 MB archive, 500 files, 1 GB declared | the whole archive | before anything is inflated, so nothing is half-uploaded |
| path with `..`, absolute, a drive, backslashes, control characters | the entry | judged on the path as written (`unsafeOriginalName`), not JSZip's normalised one |
| an archive inside the archive | the entry | |
| a type the Data Room does not take | the entry | the same list its picker offers |
| over 50 MB inflated, or over 1000:1 compressed (entries over 1 MB) | the entry | from the declared sizes, before inflating |
| a header that understates its size | the entry | inflation is counted as it streams and stops at the cap |
| an inflated size that differs from the header | the entry | |
| folders, `__MACOSX/`, `.DS_Store`, hidden files | skipped, and listed as skipped | |

**Type.** Each entry is sent with the canonical type for its name, from `shared/constants/upload-name-bindings.ts`. The server's name binding now reads the same table, moved out of `server/utils/fileSignature.ts`, so a built File never declares a type the server refuses. `fileSignature.test.ts` asserts that every canonical type is one its own name admits, and that every byte-checked picker format is bound.

## Files

- `01-red.txt`: the hook test against `useChatUpload` as on trunk. The archive is refused whole and nothing is opened.
- `02-green.txt`: the archive and hook tests, the signature and allowlist tests, and every client suite that imports the changed modules.
