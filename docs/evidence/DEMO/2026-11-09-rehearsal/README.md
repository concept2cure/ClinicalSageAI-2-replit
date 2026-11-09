# Demo dress rehearsal on trunk, 2026-11-09 (before a client demo at 1:00 pm Pacific)

**What was rehearsed.** A fresh database, migrated as a deployment migrates. On it:
- the server at trunk `da7c24ddc9`, booted as CI's browser journeys boot it;
- `npm run demo:seed` for the biotech and MDx packs, with a second signer;
- then the two walkthroughs (`docs/demo/biotech-walkthrough.md`, `docs/demo/mdx-walkthrough.md`) in a browser.

**Package.** F1. The packs' files are unheld (`.design/claude-convergence/COORDINATION.md`).

## What already exists (RULE 3)

| Path | What it is |
|---|---|
| `scripts/demo/launch-demo/seed.mjs`, `lib.mjs`, `packs/*` | The demo seed, through the product's own API, idempotent by title |
| `server/services/qms/controlled-document-service.ts` | QMS send for review: needs saved text and a review route naming the approver (RR4, `REVIEW_ROUTE_REQUIRED`) |
| `server/services/qms/document-approval-signature.ts` | QMS approval: a draft is refused (`QMS_INVALID_STATE`) since `cf950eeb9e` (2026-10-08). Only a document under review is approved |
| `server/services/qms/qms-approver-designation.ts`, `PUT /api/tenant-users/:org/:user/qms-approver` | Who may be named the QMS approver: members with the Approver role, until an administrator designates QMS approvers. After that, only those designated |

## Found and fixed: both demo seeds stopped at their QMS step on a fresh database

- **The biotech pack** (`packs/biotech-qms.mjs`) approved its "effective" SOPs straight from draft. It also sent SOP-003
  for review with no route.
- **The MDx pack** (`packs/mdx-qms.mjs`) did the same for SOP-101 and SOP-102, and for SOP-103.
- The server has refused both since 2026-10-08 and 2026-10-29. A seed against an already-seeded database finds the
  SOPs settled, so the fault showed only on a fresh one: `seed-biotech-run1.txt`, "approve C2C-SOP-001: HTTP 409 …
  This document is a draft".
- **The fix:** `lib.mjs` `sendQmsForReview`. The author sends the draft with a route that names the second signer as
  its approver, and an approval due date. Both packs call it before the signer approves, and for the SOP left in
  review. No server change.

## Environment requirements the rehearsal surfaced (configuration, not code)

1. **The second signer must be able to freeze authoring documents and approve QMS documents.** An administrator holds
   the freeze. QMS approval needs the Approver role, or an administrator's designation as QMS approver.
   - So the signer is an administrator, designated QMS approver by another administrator. This was done with
     `PUT /api/tenant-users/:org/:user/qms-approver`, `{ designated: true, reason }`.
   - With the Approver role instead, the MDx authoring freeze is refused, 403 `AUTHORING_OBJECT_FORBIDDEN`
     (`seed-mdx-signer-not-admin.txt`).
2. **A server on a port other than 5000 must list its origin in `ALLOWED_ORIGINS`.** Otherwise the seed's dev login
   is refused 403 `CORS_ORIGIN_BLOCKED`. The development allow-list admits `localhost:5000` and `127.0.0.1:5000` only.
3. **"Demo access" on the login page appears only in a development build with `VITE_DEV_LOGIN_EMAIL` set.** A
   production build signs in with a password. The walkthroughs' "sign in with Demo access" holds only for the former.
4. **The database owner needs the extensions pre-created** (`vector`, `pgcrypto`, `pg_trgm`, `uuid-ossp`, `unaccent`),
   or `install-fresh.mjs` stops at "permission denied to create extension".

## Seed runs (passwords withheld)

| File | Result |
|---|---|
| `seed-biotech-run1.txt` | Stopped at QMS SOP-001: 409, the SOP is a draft |
| `seed-biotech-before-fix.txt` | The route named a signer without QMS approval: 409, not a QMS approver |
| `seed-biotech-after-fix.txt` | **exit 0.** 77 created and 175 found; SOP-001 and SOP-002 effective, SOP-003 in review, SOP-004 draft; the ledger chain verifies |
| `seed-mdx-signer-not-admin.txt` | Stopped at the authoring freeze: 403, the signer held only the Approver role |
| `seed-mdx-after-fix.txt` | **exit 0.** The 510(k) Summary reviewed, frozen and approved; SOP-101 and SOP-102 effective, SOP-103 in review, SOP-104 draft; the ledger chain verifies |

Pack tests: `node --test scripts/demo/launch-demo/*.test.mjs`, 119/119. ESLint: unchanged on the three files.

## The walk, in a browser (Playwright, Chromium, 1440×900), on trunk `b4284d08ce`

Signed in through the login page's **Demo access** button. Nothing was typed into an address bar: each screen was
reached from the rail, a project, its journey bar or Search, as a person reaches it.

| Screen | What it showed | Errors |
|---|---|---|
| Login → Demo access | Signed in as the presenter (`screens/01`, `02`) | none, **after the migration below** |
| Every rail screen: Home, Projects, Tasks, Communication, Vault, Submission Center, CMC / Module 3, Biostatistics, Risk-based monitoring, Quality, Reporting & analytics | Each opened. Communication, Submission Center and CMC say they open inside a project, by design | no 5xx, no console error, no error text |
| C2C-101 project, journey Plan → Respond | The documents, "Dossier readiness 0%", "IND · FDA (US) Dispatch blocked · 4 blockers", "Agency letters 1 open" (`screens/03`) | none |
| C2C-101 Protocol Synopsis in the editor | "Frozen v1", read only, sealed under a content hash; "98% of this section has a recorded origin" (`screens/04`) | none |
| C2C-101 Submission Center | "1 sequence: 0000, assembling" (`screens/05`) | none |
| Quality register | C2C-SOP-001 and -002 "Approved by Quinn Signer"; C2C-SOP-003 "Under review — Waiting for Quinn Signer"; the MDx SOPs (`screens/06`) | none |
| Audit trail (through Search) | "Hash chain verifies intact over 544 chained entries"; 5 e-signature events (`screens/07`) | none |
| NeuroPanel-Dx 510(k) Summary in the editor | "Approved v1", "approved and frozen … part of the signed record" (`screens/08`) | none |
| NeuroPanel-Dx journey Plan → Respond | each stage opened | none |

**The one break: Demo access refused to sign in, until today's migrations were applied.**
- The button checks that the demo is usable before keeping the session, and that check reads the Tasking board.
  `GET /api/task-management/board` answered 500, because `unified_tasks.parent_task_id` did not exist.
- That column arrived today in `91939f245f` (13:36 UTC), with `migrations/20261109_unified_tasks_parent_task.sql`.
- The rehearsal database had been migrated before it, and the server was restarted on newer code. `deploy-migrate`
  applied it, and `20261109_ectd_sequence_removal_guard.sql`, and Demo access signed in.
- **An environment that pulls today's trunk must run the migration step before the app restarts.** A deployment
  does.

**Server log during the walk.** Thirteen error lines. One is the board failure above, before the migration. The
rest are requests the script abandoned by navigating or closing within seconds (`RequestEndedError`, "Cannot query a
released request DB client"); none showed on a screen.

**Not rehearsed.** AnA answering or drafting: no model provider is configured on this machine, as the walkthroughs
say. And a live approval of an AnA conversation artifact. Since today (P-95) that needs a named reviewer, and two for
a document placed in a CTD section, in the artifact card's Review section.

