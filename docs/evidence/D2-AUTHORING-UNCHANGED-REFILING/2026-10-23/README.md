# Complete unchanged saved-section re-filing

W1 / D2 on `concept2cure-v2`. Locally qualified after the combined functional,
production-build and full zero-error TypeScript checks. Design:
`docs/design/AUTHORING_UNCHANGED_REFILING.md`.

## What already exists

This is the discovery inventory before the completion, at `0a7abf314`.

- `server/routes/authoring.router.ts` owns section PATCH save, atomic revision,
  saved-source reservation, lineage, `commitSectionToFiling` and audit. Its
  `filingDivergedRefusal` explicitly records the open unchanged-body remedy:
  users must make an arbitrary edit because the editor Save requires dirty text.
- `server/services/c2c/commit-section-to-filing.ts` owns the canonical filing
  writer; `filing-section-target.ts` owns binding, assembly and agreement reads.
  These engines remain the only writers/verdicts, with existing locks and gates.
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` owns editor/save;
  `surfaces/AuthoringFilingBar.tsx` owns freeze/sign actions and refusal display.
  `AuthoringPlaceIntoFiling.tsx` creates a whole-document snapshot/leaf, a
  different existing act, not an unchanged bound-section save remedy.
- `client/src/concept2cure/v2/__tests__/authoringSaveFilingCommit.test.tsx`
  and existing server assembly/save/filing/seal tests are the fixture starting
  points. Extend these boundaries rather than invent another save or version
  engine.
- `authoring-file-to-vault.ts`, `vault-version-checkin.ts` and the recorded
  derivation receipt already own Vault admission/check-in/provenance. Historical
  hash-labelled Vault supersession and sealed authored-document revision are
  separate open policies and remain outside this correction.

Searches covered re-file/refile, filing divergence, saved-body/dirty, section
commit, approval, revision and version in routes/services/client/designs,
plus deleted history for authoring versions/revisions/refiling and filing names.
No retired competing unchanged-section remedy was found. Existing deployed
capabilities are completed, not rebuilt.

## Where to use it

Open a saved section in the existing Authoring editor. With a clean editor and
current full-document access, choose **Re-file saved text**, state the reason,
and type **refile** in the existing governed confirmation. The confirmation
names the section and destination and explains that combined sections file
their saved text together. Ordinary Save remains the content-edit action.

The existing seal refusal now points at this reachable action instead of asking
for an arbitrary edit. No content change is invented to repair a filing copy.

## Verified behavior

The explicit intent uses the existing section PATCH authorization and canonical
filing writer. It rejects content, metadata and authorship claims in the request;
requires exact saved document, program, native filing identity and timestamp;
and reads the actual saved text in its reserved transaction. Current whole-read
admission precedes private provenance reads. Access is rechecked under retained
grants using the current account email and role; QMS, saved-source, workflow,
lineage, market, filing-lock and approval gates remain effective.

Authoring section bytes, saved timestamp, content revisions and attribution spans
remain unchanged. The canonical parent reservation still touches the document
metadata timestamp to preserve seal-race protection. A separate COMMIT audit,
with the stated reason and exact source/destination, shares the filing
transaction. Real filing changes retain their canonical filing-version history.
No approval or signature is invented; changed approved filing text loses approval.

The client confirms only an exact, coherent receipt. Unrelated assembly keys,
contradictory results (including nested arrays), malformed replies and uncertain
commits hold against retry. Pending/unknown bookkeeping survives close/reopen
and source navigation in the mounted host. Success presentation belongs to the
originating current visit; a late reply cannot display an obsolete success.

## Qualification and integration

`tests.json` records one completed post-merge run: **595 passed across 32 exact
files, zero failures, skips or TODOs**. `test-files.json` is the reproducible
selection. Prior 117-case client and 182-case server runs are retained separately
in `client.json` and `server.json`; they are not added to the 595 cases. Earlier
company-document and PDF qualification counts are not inflated.

`red-proof.json` distinguishes original missing-action/ineffective-PATCH failures
from intentional pre-hardening gate-omission checks. Filtered-out cases are
identified, never counted as final skips or extra passes. Fixture corrections
are retained: canonical create/save establishes assembled sections and lineage;
actual prerequisite migrations are applied; creator grants and privacy-masked
404 expectations reflect the canonical policy. Gates were not weakened.

The incoming Vault rendition-version and Unicode updates at `26d850156` merged
cleanly with implementation `848fa68e3` into combined source `90facc53e`.
Vault versioned re-filing is separate from this saved-section repair; see
`docs/evidence/D2-AUTHORING-REFILING-VERSIONS/2026-10-23/`. Its numeric-version
proof replaces the earlier parity TODO, while historical hash-labelled family
renumbering and sealed Authoring revisions remain separate policies.

`source-manifest.json` pins 71 inputs. `unchanged-boundaries.json` verifies 11
unchanged boundaries and three reviewed differences: the canonical contributor
membership extraction, and two files exactly matching the incoming Vault update.
Ordinary Save, rich editor, renderer/converter, generic mutation policy and
company-original packaging remain unchanged. Independent review found no
remaining source blocker. `verification.json` records the completed build,
compiler and lint checks; publication requires the mandatory repository hooks.

## Reproduction and limits

```sh
source /workspace/.cloud-setup/activate.sh
node --input-type=module - <<'JS'
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = JSON.parse(fs.readFileSync('docs/evidence/D2-AUTHORING-UNCHANGED-REFILING/2026-10-23/test-files.json', 'utf8'));
process.exit(spawnSync('./node_modules/.bin/vitest', ['run', ...files], { stdio: 'inherit' }).status ?? 1);
JS
npm run build
node scripts/ci/typecheck-no-regression.mjs --incremental
```

Raw reports, transcripts, retained before-hardening snapshots and report hashes
are kept under `/workspace/.cloud-setup/authoring-refile/`. Native SQL proof here
uses PGlite with mounted HTTP requests; acknowledgment-loss seams wrap actual
COMMIT/ROLLBACK, rather than qualifying multiple native PostgreSQL connections.
UI proof mounts the real editor and existing confirmation over synthetic HTTP.
No live browser re-filing, provider call, production deployment, remote CI or
agency acceptance is claimed. Missing or invalid provenance refuses repair;
legacy authorship is not reconstructed. Authoring-only reloads do not reconcile
unknown filing/audit outcomes, and this completion adds no reconciliation engine
or persistent cross-reload idempotency protocol.
