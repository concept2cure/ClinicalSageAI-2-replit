# Journey B — Marketing application: dossier readiness → eCTD compilation

**Status: phase 1 PASSING** — 13 steps, 8 ok / 5 blocked-as-expected, 0 failed.

Test: `tests/golden-journeys/marketing-application.journey.test.ts`
Manifest: `tests/golden-journeys/__reports__/marketing-application.manifest.json`
(truth source; the report `.md` beside it is rendered from the JSON).

## What it traverses

Route-level, over HTTP, against real canonical DDL on an in-process Postgres —
the real `dossier-readiness` and `ectd-compile` routers, nothing stubbed:

| # | Step | What it proves |
|---|---|---|
| 1 | readiness on an empty project | honest empty state, not a fabricated one |
| 2 | seed the dossier | three sections + three artifacts, plus a second tenant's project |
| 3 | readiness rolls up | a section is only as ready as its **weakest** artifact |
| 4 | pre-compile validation | two specific sections classified **by name** (approved vs still drafting) |
| 5 | compile | 200 with an XML backbone, module statuses returned |
| 6 | the record is durable | **one assertion per column** the off-by-one corrupted |
| 7 | history | the compilation is listed back |
| 8 | status dashboard | module readiness reflects real sections |
| 9–10 | cross-tenant history / readiness | another organization sees **nothing** |
| 11–12 | no org context | 401, not a silent default tenant |
| 13 | non-numeric project id | 400 with a code, not a coerced query |

Step 6 is the point of the journey. The bug it guards against did not make the
write fail visibly — it wrote the **wrong value into every column**, so a
row-exists assertion would have passed. Each column is therefore pinned
individually.

## What it found

Every step above failed before the accompanying fixes. See ledger **C-16** for
the full record; in short:

1. **`project_sections` never had `content`, `word_count` or `required`** — yet
   all three compile endpoints select them, and those values drive validation
   thresholds and the XML backbone's file count. `POST /compile` selected them
   unguarded and returned **500 on every call**. `/status` and `/validate`
   swallowed the error and reported an **empty dossier** regardless of the work
   done — a readiness dashboard that always said "nothing is ready".

2. **The compilation INSERT bound six values to five placeholders** with a
   duplicated `orgId`, shifting every value one column left (org id → name, name
   → type, submission type → status, status → xml_backbone) and dropping the XML
   backbone entirely. It could not execute regardless: `module_id` and
   `compiled_by` were `NOT NULL` and unsupplied. All of it was swallowed by a
   catch that blamed a missing table.

3. **`GET /history` had no organization filter** — one tenant could read
   another's submission history for the same project number.

## Known limitations (stated, not hidden)

- `ectd_compilations` is created here from the drizzle baseline shape as
  test-only DDL, with the two `NOT NULL`s dropped exactly as
  `db/migrations/20260725_ectd_compilations_project_level.sql` does — that
  migration is an `ALTER`, so it cannot run against a table the journey has not
  first created.
- Both routers take the organization from request context rather than verifying
  a JWT themselves, so the journey installs a tenant middleware. Journey A covers
  the JWT-verifying path; token issuance is outside both.
- `server/services/ectd/ectd-validator-hardening.ts` queries
  `ectd_compilations.sequence_number` and `.application_number` — **neither
  column exists in any definition of that table**. Not fixed and not exercised
  here: submission-sequence history needs a schema decision, not a patch.
- The journey ends at a persisted compilation with an XML backbone. The eCTD
  ZIP/export path (`ectdExportService`) and gateway submission are phase 2.

## Phase 2

Export packaging → validation profile → gateway transmittal → acknowledgement,
plus the sign-and-release path (`submission-sign-release.ts`).
