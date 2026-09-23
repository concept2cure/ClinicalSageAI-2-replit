# Protocol ⇄ study design convergence — steps 1 and 2

**Date:** 2026-09-22 · **Binding design:** `docs/design/PROTOCOL_DESIGN_CONVERGENCE.md`
**Scope worked:** that document's **order of work, items 1 and 2, and only those.**
Items 3–6 (burden/complexity, amendment impact, registry-as-submission-type,
eligibility-as-data / diversity action plan) are untouched here.

---

## The finding this closes

`server/services/study-design/` is a complete USDM / ICH M11 design-as-data
spine — the object model, the deterministic ICH E9 / E9(R1) / E10 / E3 and
ICH M11 §2/§3/§4/§6/§7/§10/§17 gate engine, and five projections — mounted at
`/api/study-design`, with 165 tests passing. The Protocol development surface
referenced **none of it**, because `protocol_documents` had no way to name the
design it is a projection **of**.

It does now. A protocol author can bind a protocol document to a persisted
study design, see the **design gates' findings** on the protocol, and view and
download all five projections. Read-only throughout: **nothing is generated
into the protocol's sections**, and no control on the screen implies it.

---

## What was built

### Step 1a — the link

`migrations/20260922_protocol_document_study_design.sql`, registered in
`C2C_MIGRATION_FILES` (`scripts/db/migration-set.mjs`) **above the final pair**
with a comment.

Three nullable columns + one partial index on `protocol_documents`, every
statement `IF NOT EXISTS`, **no DROP**, guarded on `to_regclass` (the table is
created by the install-fresh overlay only), with a dated header note — the
pattern of `migrations/20260921_protocol_documents_sponsor_pi.sql`.

| column | |
|---|---|
| `study_design_id TEXT` | `cdisc_prm_studies.study_id` of the bound design |
| `study_design_linked_at TIMESTAMPTZ` | when the binding was recorded |
| `study_design_linked_by INTEGER` | who recorded it |

**It is a SOFT link, deliberately — no `REFERENCES` clause.** The FK target
would be `cdisc_prm_studies(study_id)`. That table is created by the Drizzle
schema `install-fresh` pushes (`shared/schema/cdisc-reference.ts`, DDL in the
drizzle baseline `migrations/0000_sweet_joseph.sql`) and by **no file in
`C2C_MIGRATION_FILES`**. A REFERENCES clause would have been a foreign key to a
table nothing on the applier creates — the exact defect that had to be removed
from `migrations/20260610_irb_submissions.sql` before it could be registered,
and it would have failed this file's first deploy. The tenant boundary is
enforced in the application instead, on both sides, and proved by test.

### Step 1b — the routes

Both on `server/routes/protocol-development.ts`, both through that router's
existing `governedScoped` wrapper verbatim (request-scoped tenant connection →
`BEGIN` → write → `recordGovernedAction` → `COMMIT`, governed reason ≥ 8 chars,
`domain: 'protocol_development'`):

```
POST /api/protocol-development/documents/:id/study-design         { studyDesignId, reason }
POST /api/protocol-development/documents/:id/study-design/remove  { reason }
```

`bindStudyDesignTx` / `unbindStudyDesignTx` in
`server/services/protocol-development/protocol-development-service.ts`. Both
tenant-scope the protocol document (`loadDoc` → `NOT_FOUND` → 404); bind also
requires the design to belong to the acting tenant, so a study id copied from
another customer is a 404 with nothing written.

### Step 1c — the read model

`server/services/protocol-development/pdev-view-assembler.ts` gains
`studyDesign` on every `PdevDoc`:

- **unbound** → `null`. Not an empty report — an unbound protocol has been
  checked against nothing;
- **bound** → the design's identity plus the gate engine's verdict, obtained by
  reading the design object back out of `cdisc_prm_studies.metadata` with the
  repository's own `rowsToStudyDesign` and handing it to **`validateDesign()`**
  — the same function `/api/study-design` serves. No severity is decided here,
  no number is computed here, no finding is filtered;
- **bound but unresolvable for this tenant** → `resolved: false` and an empty
  finding list *with the flag set*, so the surface can say the link is
  unresolved rather than draw a clean bill of health.

One extra query for the whole page, tenant-scoped, keyed by study id.

### Step 1d + Step 2 — the surface

New tab **Study design** on the protocol workspace
(`client/src/concept2cure/v2/surfaces/ProtocolDevWorkspace.tsx`), rendered by
two new files:

- `ProtocolDevDesign.tsx` — the bind/unbind drawers (governed, reason required,
  `C2CForm`), the design identity, and the gate findings rendered through
  **`PG.FindingsList`**, the same component every other register on this
  surface uses for findings;
- `ProtocolDevProjections.tsx` — the five projections.

**No second exporter was written.** Each projection is fetched from the
study-design endpoint that already existed —
`GET /api/study-design/:studyId/{protocol,sap,schedule-of-activities,registration,crf-shell}`
— and the download hands over the engine's own JSON byte for byte rather than
re-rendering it on the client. Each control is labelled with what it is a
projection **of**:

| projection | of |
|---|---|
| ICH M11 protocol | the study design object, as an ICH M11-structured protocol |
| Statistical Analysis Plan skeleton | the design's statistical plan and estimands (ICH E9 / E9(R1)) |
| Schedule of Activities | the design's time-and-events grid (ICH M11 §1.3) |
| Trial registry record | the design as a registry record — ClinicalTrials.gov under FDAAA 801, EU CTIS under Regulation 536/2014 |
| CRF shell | the design's Schedule of Activities as a blank CRF set (CDISC CDASH) |

and the panel states, in the UI: *"Read-only. Nothing is written back into the
protocol."* The projections already report their own `gaps` and per-section /
per-field status; those are rendered as what they are and are never collapsed
into a clean panel.

---

## Files changed

**New**
```
migrations/20260922_protocol_document_study_design.sql
client/src/concept2cure/v2/surfaces/ProtocolDevDesign.tsx
client/src/concept2cure/v2/surfaces/ProtocolDevProjections.tsx
server/services/protocol-development/__tests__/protocol-study-design-migration.pglite.integration.test.ts
server/services/protocol-development/__tests__/protocol-study-design-link.pglite.integration.test.ts
server/routes/__tests__/protocol-development-study-design.test.ts
client/src/concept2cure/v2/__tests__/protocolStudyDesignTab.test.tsx
```

**Edited**
```
scripts/db/migration-set.mjs                                           register the migration, above the final pair
server/services/protocol-development/protocol-development-service.ts   bindStudyDesignTx / unbindStudyDesignTx
server/services/protocol-development/pdev-view-assembler.ts            studyDesign on the read model, from validateDesign()
server/routes/protocol-development.ts                                  the two governed routes
client/src/concept2cure/v2/surfaces/ProtocolDevWorkspace.tsx           the Study design tab (+ RegisterTabBody extraction)
client/src/concept2cure/v2/surfaces/ProtocolDev.tsx                    AnA surface context carries the design and its findings
client/src/concept2cure/v2/fixtures/protocol-data.ts                   PdevDoc.studyDesign contract
server/services/protocol-development/__tests__/pdev-view-assembler.pglite.integration.test.ts   DDL mirrors the new columns
```

---

## The migration, applied TWICE

`migration-twice-applied.txt` — the real file run twice against a scratch
PostgreSQL database, with a link row written **between** the two runs, plus a
third run on a blank database with no `protocol_documents`:

- first apply: three columns + the partial index;
- a row with `study_design_id = 'sd_abc'` is inserted;
- second apply: four `NOTICE ... already exists, skipping`, `DO`, exit 0 — the
  schema is identical and **the row still carries its link**;
- blank database: `NOTICE: protocol_documents does not exist on this
  database …`, `DO`, exit 0 — it skips, it does not abort the deploy.

The same property is pinned by a test
(`protocol-study-design-migration.pglite.integration.test.ts`), which also
asserts the file is registered above the final pair and that its executable SQL
contains no `DROP`.

---

## Tests — written first, SEEN FAILING, then green

Written before the code and run against the unchanged tree:

| test file | first run |
|---|---|
| `protocol-study-design-migration…` | suite failed to load — `ENOENT … migrations/20260922_protocol_document_study_design.sql` |
| `protocol-study-design-link…` | **7 failed** — `TypeError: bindStudyDesignTx is not a function`; `doc.studyDesign` undefined |
| `protocol-development-study-design.test.ts` | **4 failed** — the bind/unbind routes did not exist, `expected 404 to be 201` |
| `protocolStudyDesignTab.test.tsx` | **8 failed** — no `Study design` tab to click |

Then, because a test that has only ever passed has not been tested, each
guarantee was re-proved by **breaking the thing it guards** and watching the
test go red. All four mutations were reverted immediately after capture.

| file | mutation | what failed |
|---|---|---|
| `red-01-tenant-scope-removed.txt` | `WHERE tenant_id = $1 AND …` → `WHERE … AND $1::int >= 0` in `loadBoundDesigns` | *"does not read another tenant's design through the link"* — `expected true to be false` (`resolved` came back true for a design that had moved tenant) |
| `red-02-design-tenant-check-removed.txt` | `bindStudyDesignTx` stops refusing a design that is not this tenant's | service: *"refuses a design that does not exist for this tenant"* — `promise resolved … instead of rejecting`; route: *"404s for a design that is not this tenant's"* — `expected 201 to be 404` |
| `red-03-projection-gaps-hidden.txt` | the projection panel stops rendering the engine's `gaps` | *"renders a projection the design cannot fill as its gap, not as an empty success"* — the SoA panel rendered clean and empty |
| `red-04-migration-not-replayable.txt` | first `ADD COLUMN IF NOT EXISTS` loses its guard | *"applies twice … the second run is a no-op"* — `column "study_design_id" of relation "protocol_documents" already exists` |

`green-tests.txt` — the full green run afterwards: **31 files, 345 tests, all
passing** (the whole `study-design` spine, the whole `protocol-development`
service, both protocol route suites and every protocol client suite).

---

## Live proof

Server on `PORT=5100`, `ALLOW_DEV_AUTH=1`, `LAUNCH_SCOPE_ENFORCE=on`; dev-login
as `jonmichaelpsmith@gmail.com` (org 2); the seeded `[Demo · Biotech]` protocol
`C2C-101-201` (`protocol_documents.id = 2`,
`docs/evidence/DEMO/biotech/manifest.json`). Server stopped afterwards by port
pid.

The organisation had **no persisted study design at all**, so one was created
the way a user would — `POST /api/study-design/persist` with a governed reason
— from the demo programme's own Phase 2 psoriasis study. It is a real record in
`cdisc_prm_studies`, not a fixture: `sd_cf7dfded17fb4c60a1344648fec9c0f9`.

`governed-actions.txt` — the `c2c_ana_actions` rows the live bind, unbind and
re-bind wrote: `domain protocol_development`, `command update`,
`target protocol-document:2`, `state executed`, each with its stated reason and
the `studyDesignId` payload, plus the `study-design:…` row for the persist.

All five projections answered live against the real design:

| projection | standard | rendered | gaps |
|---|---|---|---|
| ICH M11 protocol | ICH M11 | 69 % | 0, 8 sections |
| SAP skeleton | ICH E9 / E9(R1) | 71 % | 0, 12 sections |
| Schedule of Activities | ICH M11 §1.3 | **0 %** | **1** — the design carries no SoA |
| Trial registry record | FDAAA 801 / PRS · EU Reg 536/2014 / CTIS | 62 % / 80 % | 8 / 3 |
| CRF shell | CDISC CDASH | 40 % | 1, 7 forms |

### Screenshots (`screens/`, Chromium, 1440×900, "Demo Access" login)

| file | |
|---|---|
| `00-study-design-tab-unbound.png` | *"No study design is bound to this protocol. Nothing on this protocol has been checked against the design gates…"* and the bind action. No findings list, no percentage, no projection controls. |
| `07-bind-drawer.png` | the governed bind drawer, the tenant's persisted design pre-selected, reason required, 21 CFR §11 notice |
| `08-bound-through-the-surface.png` | bound **through the UI**: the confirmation toast, the record re-read, the gates rendered |
| `01-study-design-tab-bound-gates.png` | the design identity, `Design is blocked: … (2 critical, 2 major, 1 minor)`, risk `critical`, blocks approval `yes`, and the findings — EST-001 (ICH E9(R1)), MUL-001 (ICH E9), MIS-001, PWR-003 — each with its standard and its fix |
| `02-projection-ich-m11-protocol.png` | the M11 projection, per-section status, `Download (JSON)` |
| `03-projection-sap-skeleton.png` | the SAP skeleton projection |
| `04-projection-schedule-of-activities.png` | **the honest-gap case**: 0 %, *"The design object carries no Schedule of Activities, so there is no grid to project"*, *"No Schedule of Activities is attached."* — not an empty success |
| `05-projection-trial-registry-record.png` | both registry records, 11 named field-level gaps, `Registrable — ClinicalTrials.gov: no; EU CTIS: no` |
| `06-projection-crf-shell.png` | the CDASH CRF shell |

---

## Gates

`gates.txt`, `typecheck.txt`.

| gate | result |
|---|---|
| `npm run typecheck:fast` | clean for every file in this change (see caveat below) |
| `node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD` | **no file changed its warning count since HEAD** — none of these files appears |
| `npm run ci:migration-set-order` | OK — 296 migrations, sweep last, uuid step in the final pair |
| `npm run ci:migration-drop-safety` | OK — 296 migrations, none re-created by the set |
| `npm run db:sync-manifest:check` | Manifest is in sync (the manifest tracks `db/migrations/`; this file is in `migrations/`, like its 2026-09-21 precedent) |
| `npm run ci:launch-scope` | ✅ routable, registered, licensable and fixture-free |
| `npm run ci:ana-surface-context` | OK — **114 of 120, baseline 114 exact** (a tab, not a new surface id) |
| `npm run ci:undefined-css-classes` | OK — every static className is defined |
| `npm run ci:design-system` | OK |

The ratchet first reported **+2** warnings: `TabBody` at complexity 16 and the
per-document mapper arrow at 16. Both were **extracted, not suppressed** —
`RegisterTabBody` in `ProtocolDevWorkspace.tsx` and `resolveStudyDesign` in
`pdev-view-assembler.ts` — after which the ratchet is clean.

**Caveat, not caused by this change.** `typecheck:fast` currently reports one
error in `server/services/protocol-development/__tests__/design-derivation.test.ts:332`
(`TS2352`, `StudyDesign` → `Record<string, unknown>`). That file is another
session's in-flight work in this same tree (it belongs to
`docs/design/PROTOCOL_INTELLIGENCE.md`, alongside `protocol-rule-pack.test.ts`),
it did not exist when this work started, and nothing here imports it. It is
left for its owner rather than edited across workstreams.

---

## What of the design document's order of work remains

| # | item | state |
|---|---|---|
| 1 | Link a protocol document to a study design; surface the design gates' findings | **done** — this pack |
| 2 | Offer the five projections from the protocol surface | **done** — this pack, read-only |
| 3 | Burden and complexity engine over the SoA | **not this pack** — being built concurrently in `server/services/study-design/burden*` by another session |
| 4 | Amendment impact and substantiality (EU CTR 536/2014 Art. 16, re-consent, invalidated downstream) | **not started** |
| 5 | Registry record as a submission type in the Submission Center | **not started** — the projection is viewable and downloadable here; it is not yet a filing |
| 6 | Eligibility criteria as data; diversity action plan (FDORA 2022 §3601) | **not started** |

Also explicitly **not** done, and deliberately so per the design document's own
framing of step 1 as read-only:

- **generation into the author's sections.** The M11 projection is viewed and
  downloaded; nothing writes it into `protocol_sections`. No button on the
  screen implies otherwise, and the panel says so in words.
- **the reverse direction** (a protocol edit deriving a design change). That is
  `docs/design/PROTOCOL_INTELLIGENCE.md`, another session's workstream.
