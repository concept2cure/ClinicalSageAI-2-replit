# D2 · F1: a US biotech filing identity drafts from its own lifecycle record (2026-11-12)

**Rule:** CLAUDE.md RULE 2 (a form, dataset or table is never drafted), RULE 3 and the working agreement's "zero
duplication".
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1** (a defect in shipped behaviour; no screen, route, table or
tool is added).
**Found by:** the CSR lane (`017CFk…`), reading the built-in template list on `a9b5af187`. Reproduced here on
`f5d0d417a`.

## The defect

Fourteen US biotech filing types could not be drafted with AnA when started from New document → Start from:
- the Type D meeting and the INTERACT meeting;
- individual, intermediate-size and treatment expanded access;
- the Emergency Use Authorization request;
- the five BLA reports: annual report of minor changes, pediatric annual, PMR/PMC status, distribution and
  periodic adverse experience;
- the Biological Product Deviation Report;
- the CBER master file and the CBER lot release protocol.

Each was listed as "… — preparation worksheet". A document created from that row refused every part with
`TEMPLATE_NOT_DRAFTABLE`. The same record's parts were also listed as a second, draftable row. A project of that
filing type starts from the refused row, because the start matches on the filing's registry id.

## What already exists (RULE 3)

- **The one source record per identity:** `LIFECYCLE_DOCUMENT_TYPES` (`server/services/ind/ctd/lifecycle-document-types.ts`),
  linked by the record's own registry id in `US_BIOTECH_LIFECYCLE_RECORD_BY_REGISTRY_ID`.
- **Two projections of it:**
  - `lifecycle-record-outlines.ts` gives the registry identity its outline. It carried no per-part mode.
  - `us-biotech-lifecycle-templates.ts` gives the `us_lifecycle_*` component. It marks each form, dataset and table
    part manual and gives every part its drafting or retain-the-original limit.
- **The draftability rule:** `builtin-authoring-templates.ts` makes a registry row draftable only when component
  metadata resolves for it. The lookup was `componentTemplateIdForRegistry`, a hand-written map of fifteen ICH and EU
  identities that names none of these.
- **The refusal:** `authoring-draft-template.ts` reads the template source recorded on the document and each part's
  saved `drafting_mode`.
- **Searches run:**
  - `git grep` for `componentTemplateIdForRegistry` (seven callers, read one by one);
  - `git grep` for `us_lifecycle_`, `lifecycleRecordOutlineFor` and each of the fourteen registry ids across server,
    shared, client and tests;
  - `git log` on the three source files (no commit since 2026-11-02).

Nothing is added beside these. The registry identity now reads what the component already held.

## The change

- **`us-biotech-lifecycle-templates.ts`** exports two reads of what it already holds: the component a registry
  identity's record names, and a record's parts with their modes and limits.
- **`lifecycle-record-outlines.ts`:** an identity that reads one record takes its parts from that projection, when
  they are the same parts. A form, dataset or table stays manual; the rest is narrative.
- **`document-template-library.ts`** gains `draftingComponentIdForRegistry`. It returns the mapped component as
  before, or the lifecycle component when the registry outline is exactly that record's parts.
- **`builtin-authoring-templates.ts`** asks that lookup for a registry row's draftability (one call).
- **Deliberately narrow.** `componentTemplateIdForRegistry` is unchanged. AnA's section requirements, preparation
  inquiry, `registryIdForTemplateEntry` and the package inventory's artifact names key on it, and none of them
  changes.

**Not changed, and why:**
- **`US_BLA_SUPP`, `US_BLA_CBE30` and `US_BLA_CBE0` stay worksheets.** Their outlines also list the CTD sections the
  change updates, which the record's component does not. Whether AnA drafts an updated Module 3 section inside a
  supplement is a separate decision. Their record parts do gain the record's mode and limit.
- **`US_PMR` stays a worksheet.** Its outline is its study protocol's (ICH M11), which fits a PMR clinical trial and
  not an observational PMR study.
- **A document already created from a worksheet row stays manual.** Its recorded template source is not rewritten.
- **The second, component row is still listed.** The CSR lane removes it from the list next, keeping its id
  resolvable (`builtin-authoring-templates.ts`, its file).

**User-visible:** in New document → Start from, these fourteen read as documents, not worksheets. AnA drafts their
narrative parts from the project's sources and still refuses a form, an attendee list, a dataset or a table.

## Proof

- **Red:** `red.txt`. `us-biotech-registry-identities-draft-from-their-record.test.ts` on trunk `f5d0d417a`: 20 of
  21 fail, all on assertions. The one control passes: the record map names exactly these seventeen identities.
- **Green:** the same test passes 21 of 21.
- **Exactly what changed:** `builtin-snapshot-delta.txt`. Of 449 built-in templates, 17 changed and no other; none
  was added or removed. Fourteen go from `preparation` to `narrative`. The three BLA changes stay `preparation`.
  The cross-sector digest pin is re-recorded with that delta.
- **In the running app:** `app-walk.txt`, `app-before-picker.png`, `app-after-picker.png`. A Type D meeting document
  was created through the editor's picker, on trunk and with the change.
  - Before: the row reads "US · Type D Meeting — preparation worksheet", and all six parts are refused (409).
  - After: the row reads "US · Type D Meeting". The five narrative parts pass the template check and reach the model
    gateway. The attendee list is still refused (409).
  - The gateway answers 503 because this environment has no AI provider key (`GA-D4-03`). **No model output was
    produced or judged here.**
- **Two pins that encoded the old rule** now read the new lookup: `builtin-authoring-templates.test.ts` and
  `globalBiotechTemplateEditor.pglite.integration.test.ts` (34 of 34).
- **Green, the neighbourhood:** every test that names a touched file, the fourteen registry ids, the draft refusal
  or the picker: 1,902 of 1,902 pass in 65 files, the pglite suites included.
- **Gates:** typecheck (`typecheck-no-regression --incremental`) 0 errors; the ESLint ratchet changes no file's
  warning count.
