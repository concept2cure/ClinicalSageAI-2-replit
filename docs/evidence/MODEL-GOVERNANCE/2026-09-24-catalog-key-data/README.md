# Model governance — AnA's catalog stored figures the document never stated

**Row:** D4 (Validation package) under CLAUDE.md Rule 2: *"Numbers, verdicts
and governed content come from deterministic engines; the model narrates. A
tool that asks a model for a figure is a defect."*
**Workstream:** the AnA client-files lane. **Date:** 2026-09-24.
**Reach:** `catalog_project_document` is withheld while `ana.document_catalog`
is off (the launch default). The figures it stored are also served by the D8
connector's `c2c_search_vault_documents`, for any organisation holding catalog
rows from a period when it was on.

## The defect

`catalog_project_document` asks the model to record `key_data` — "study IDs,
dates, doses, endpoints, sample sizes, batch numbers" — and `completeCatalog`
stored it as typed. The only gate was read coverage, which proves the model was
*served* every character and proves nothing about what it then *wrote*.

Reproduced end to end: a CoA stating batch `23‑104`, protocol `ST–23–104`, assay
`99.2 %`, batch size `120 000` and D90 `45 µm` was cataloged with
`{batch: "23-105", assay_pct: 98.4, stability_study: "ST-99-001", batch_size:
"250,000 tablets", d90_um: 12}` — every value wrong — and the write returned
`ok: true`, `catalog_status: 'cataloged'`. Those values were then served back as
recorded fact by `read_project_document`, `search_project_documents` and the
connector.

## Red — `red/HEAD.txt` is the parent commit

| File | Result |
|---|---|
| `red/document-catalog-dbtest.red.txt` | real PostgreSQL as `app_service`: **1 failed / 16 passed** — invented values, a verdict and a nested leaf were **stored** (`catalog_status: 'cataloged'`, where a refusal leaving the row `extracted` was expected) |
| `red/verifier-unit.red.txt` | 21 failed / 17 passed — 20 because the verifier does not exist at the parent, and one behavioural: the gate allowed a write it should refuse |

## Fix

- **`verifyKeyDataAgainstText`** in `document-catalog-core.ts` — pure,
  deterministic, no I/O. Every scalar leaf of `key_data`, at any depth, must
  occur in the document's extracted text as a whole token. Normalisation is for
  comparison only, never for the stored value: superscript and subscript digits
  are made explicit before NFKC (so `10³` never verifies `103`), NFKC, every
  dash to `-`, whitespace runs to one space, letters case-insensitive. A value
  never matches a fragment: `23-10` is not in `23-104`, `99` is not in `99.2`,
  `120` is not in `1 120 000`, `5` is not in `−5 °C`. A number matches in its
  exact decimal form, with thousands grouping allowed (`120000` ↔ `120,000` ↔
  `120 000`). Booleans and nulls are refused: they are judgements about a
  document, not transcriptions from it. Keys are the model's labels and are not
  verified — the check proves a value is IN the document, not that the label
  fits it.
- **`assertCatalogWriteAllowed`** now takes the key_data and the text as
  required arguments, so no caller can ask the gate about one without the
  other. Coverage is judged first; then the values.
- **`completeCatalog`** loads the stored text read_project_document served and
  runs the gate before the embedding and before the write, so a refusal stores
  nothing. The refusal names every failing leaf by path and value, the way the
  coverage refusal names unread ranges, and the tool returns them as
  `unverifiedKeyData`.
- **The tool definition** tells the model values are verified and must be
  copied exactly as the document writes them; figures a JSON number cannot
  carry (`99.20`, `1.2×10⁶`) go in as strings.

## Green

| File | Result |
|---|---|
| `green/document-catalog-dbtest.green.txt` | **17/17** as `app_service` — invented values refused and named, nothing stored; faithful values including the Unicode forms above accepted |
| `green/verifier-unit.green.txt` | **38/38** — the fixtures above and the fragment cases |
| `green/lane-dbtests-as-app_service.txt` | the lane's eight real-PostgreSQL suites, **71/71** |

Also: `server/services/vault`, `server/services/ana` and `server/mcp` unit
suites, 2,515 passed; typecheck 0; no ESLint warnings or errors added.

Implemented by a subagent that hit a session limit before reporting. Its work
was saved as a patch, re-applied on its own, reviewed line by line, and every
red and green here was re-run by the lead.

## Owed

- **Records written before this change** are not re-verified. Any existing
  `vault.document_catalog` row with `key_data` was accepted unchecked; a
  one-off sweep with this verifier over stored rows would find them. Not run
  here — a data-remediation decision, not a code fix.
- Whether the comprehension record counts as governed content under the
  approved-model gate (`governed-write-tools.ts`) is the model-governance
  lane's call; its classifier cannot see these field names at all, which is
  recorded for that lane separately.
