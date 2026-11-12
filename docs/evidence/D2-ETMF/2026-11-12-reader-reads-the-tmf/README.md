# A person who may read the project's Vault reads its trial master file (P-124 item 7)

2026-11-12. Session `…01KnUGoX3g` (the Vault parity lane). Plan package F1. Completes `server/routes/etmf.routes.ts`.
Decision: P-124 item 7, taken under the founder's delegation ("Continue, you decide as the SME would"), recorded in
`docs/LAUNCH_DEFINITION_OF_DONE.md`, and reversible by the founder.

## The defect

Every eTMF route required the regulatory-author role, reads included. An organization's viewer holds no functional
role, by design (`server/middleware/auth.ts`, `ORG_ROLE_FUNCTIONAL_GRANTS`). The client was already built for a
reader: the section shows a view-only notice ("view only: … file a document in the trial master file, remove a filing
or declare a record not applicable") and hides those acts. But the server refused the reads, so a viewer met a failed
read under that notice. A monitor, auditor or inspector given read access could not read the trial master file.

## What already exists

| Piece | Path | What it does |
|---|---|---|
| The Vault's reads | `server/routes/c2c/project-vault.ts` | Admit a viewer by design: "a viewer enumerating and downloading their own organization's dossier is the viewer role working as intended" |
| The study admission | `server/services/etmf/tmf-study-access.ts` | Admits each read to the study's project by the Vault's rule; a write needs the Vault's write role |
| The section's view-only state | `client/src/concept2cure/v2/surfaces/VaultTrialMasterFile.tsx` (`useVaultCanWrite`, `VaultViewOnly`) | Hides filing, removing and declaring from a reader |

## What changed

- **`etmf.routes.ts`:**
  - `READERS` (the regulatory-author role or the viewer role) guards the four reads: the reference model, a study's
    filings, its readiness and its inspection package.
  - Every write keeps `AUTHOR`. So does the stateless code checker (`POST /completeness`).
  - The study admission is unchanged, so a reader still reads only the studies of projects they can open.
- **Tests:**
  - `tests/db/etmf-study-binding.dbtest.ts` gains a reader: the organization's viewer, shared to use one project.
  - On PostgreSQL the reader reads the four, and the package's `EXPORT_GENERATED` row names them.
  - The reader is refused a filing, a declaration and a removal, and nothing is written.
  - The reader's read of another project's study is not found.
  - `etmf.routes.test.ts`'s "403 without the regulatory-author role" on a read is restated as the rule. A viewer reads.
    A session with neither role is refused. A viewer's writes are refused.
- **The URS and OQ drafts** (`../2026-11-12-urs-oq-draft/`): URS-ETMF-001 and OQ-ETMF-02 say the same, and the
  question put to the founder is answered.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The reader's two cases against the routes as they stood: 403 where 200 is expected, and 403 where another project's study should be not found |
| `02-green.txt` | Those pass with the three eTMF PostgreSQL suites (43 tests), and the eTMF server suites (187). The lint ratchet, `ci:tenant-resolvers`, `ci:launch-scope-api`, the strict requestDb audit and `ci:sql-interpolation` pass |

The PostgreSQL test cluster had stopped when this host restarted (at 15:36). It was started again on its own data
directory before these runs, and the fixtures were intact.
