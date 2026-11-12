# Demo pack `portfolio`: four fictional biotechs, eight CSR projects across the CSR lifecycle

**Package:** DATA. **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`. **Asked by:** the founder, 2026-11-09 ("demo data and
scenarios and faux companies and CSR projects at all stages"). **Status: committed, NOT pushed** — held until after the
21:00 UTC demo under the coordinating session's condition (b): push only when `--pack all` is shown green twice in a row
on a database seeded as the Codespace seeds it. That is not shown here (below).

## What already exists (RULE 3)

The demo seeder: `scripts/demo/launch-demo/seed.mjs` (`npm run demo:seed`), `lib.mjs`, and the packs in `packs/`
(biotech + its split modules, lumen, mdx, and `faux`, the FBT-201 Phase 2 CSR in a dedicated fictional organization).
This pack extends it: two new sibling files, a test file, `portfolio` registered in `PACKS` and excluded from `--pack all`
exactly as `faux` is (`OPT_IN`), and its prefix `[Demo · Portfolio]` in `DEMO_PREFIX`. No other pack, and no product code,
changed. The Codespace's automatic `--pack all` is unchanged by it.

## What it seeds (through the product's own API, idempotent by title)

**Superseded in part by `sponsor-workspaces/README.md`** (the coordinating session's item 1b, a later local commit):
each fictional sponsor is now its **own client workspace** ("<Sponsor> (fictional demo)", created through POST
`/api/clients` as the lumen, mdx and faux packs do), every project names its sponsor's workspace explicitly, and a
project found by title in another workspace is refused, never moved. "Corvane Oncology" was renamed **Varnhollow
Oncology** (product code VNH-310) so it no longer collides with the Lumen pack's fictional supplier "Corvane Biologics".
The sponsor workspaces do **not** keep the organization's suppliers, internal audits and management reviews out of a
sponsor's data room (see "Known product behaviour" below). **Order on a fresh database:** run `--pack all` before
`--pack portfolio` — with more than one active client workspace, the canonical intake refuses a project that names no
workspace, and the biotech pack's first program names none. Every CSR is a document in the one editor from the
canonical CSR template.

| Stage | Company · study | What makes the stage visible |
|---|---|---|
| a. Planning | Varnhollow Oncology · VNH-310-301 (Phase 3) | protocol and SAP in the Vault; empty CSR shell |
| b. Enrolling | Petrelline Rare Therapeutics · PTR-022-301 (Phase 3) | study design (Biostatistics); tasks: 58 of 96 randomized, an overdue site item |
| c. Database lock | Quillmont Immunology · QLM-118-202 (Phase 2b) | synthetic study source (210 participants) in the data room, not approved; freeze task blocked |
| d. Drafting | Halcyra Vaccines · HLY-09-201 (Phase 2) | Title Page and 5 of 8 ICH E3 headings written |
| e. Medical review comments open | Varnhollow · VNH-310-201 (Phase 2) | full narrative; 3 comments open, 1 resolved |
| f. Awaiting signature | Petrelline · PTR-022-102 (Phase 1/2, open-label cohorts) | full narrative; comments resolved; Freeze and E-sign honestly disabled until scientific review |
| g. Ready to file | Quillmont · QLM-118-101 (Phase 1) | IND sequence 0000 open; placement refused by the product (`CSR_SCIENTIFIC_REVIEW_REQUIRED`) |
| h. Information-request scenario | Halcyra · HLY-09-101 (Phase 1) | a fictional FDA information request in the inbox; the CSR is stated as not placed |

**Recorded as not executed, with the product's words (20 items):** source approval and freeze (needs two more people),
the build from study data and AnA drafting (needs a frozen source; no model provider), a formal review request
(`REVIEWER_IS_AUTHOR`), freeze and e-signature (no signer credential; attempted if one is supplied), placement at
5.3.5.1 (`CSR_SCIENTIFIC_REVIEW_REQUIRED`), eCTD compile, the signed response to the information request. Nothing is
faked. It needs no `OQ_SIGNER_*` and no model key.

## Proof

- Tests: `node --test scripts/demo/launch-demo/*.test.mjs` — 132 of 132 pass, 10 new for this pack (`tests.log`).
- `--pack portfolio` twice: both exit 0; the second creates nothing (`portfolio-run1.log`, `portfolio-run2.log`).
- ESLint (`--no-ignore`) on the new files: no warnings (`eslint.log`).
- **`--pack all` is not proven green here.** It exits 1 in `all-run1.log`, `all-run2.log` and `verify-all.log`, and it
  exited 1 the same way **before this pack existed** (`all-baseline-before-portfolio.log`):
  - biotech: `place leaf m1.14.4.1 ib: HTTP 409 CROSS_PROJECT`. Its submission fallback matches a submission another
    workflow (the biotech sweep) created in this local database with product name C2C-101;
  - mdx, lumen: `HTTP 401 SESSION_ENDED`, from the sweep's logins ending the shared account's sessions.
  Neither is caused by this pack (it is not in `all`, creates no workspace and changes no setting), but condition (b) is
  not met, so it is held.

## Known product behaviour seen while seeding (reported, not hidden)

- The first read of any project's data room (GET `/api/c2c/projects/:id/sources`, first page) runs the Quality
  evidence capture (`syncQualityProjectSources`), which attaches what `server/services/qms/project-evidence-queries.ts`
  admits: suppliers, internal audits and management reviews **organization-wide (no workspace predicate)**; change
  controls with no program; deviations and quality plans with no client workspace. So every portfolio project, in its
  own workspace or not, shows the organization's 21 such records (Lumen suppliers, audits, deviations; the C2C-101 and
  NP-100 change controls). This needs the product owner's ruling on the capture's scope; it is reported to the
  coordinating session.

## To seed it (after the demo, once cleared)

```
npm run demo:seed -- --pack portfolio --base-url http://127.0.0.1:<port> --email "$DEMO_SEED_EMAIL"
```
