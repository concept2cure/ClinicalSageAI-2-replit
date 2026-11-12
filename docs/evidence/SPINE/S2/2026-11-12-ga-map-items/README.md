# The GA map's data room items, where they stand, 2026-11-12

`docs/evidence/GA-READINESS/2026-11-10/ledger.json` lists seven items under S2. The ledger is a finalized snapshot, so
their state is recorded here and in this lane's row of `.design/claude-convergence/COORDINATION.md`.

| Item | What it said | Now |
|---|---|---|
| GA-S2-04 | Captured Quality records list first, with raw titles ("Retained Quality document N vN") | **Closed 2026-11-10**: files first, then Quality records, then replaced captures; every record named in its own words (`../2026-11-10-quality-records/`). Since 2026-11-12 the catalog lists current items only unless asked |
| GA-S2-05 | "Filed to vault 0" above six filed uploads, not re-checked | **Re-walked, consistent** (`vault-uploads.png`). The strip counts data-room captures: LMN-201 has two, both classified, neither filed into the Vault, so 0 is the fact. The six uploads were added on the Vault page and never were captures; the panel under the strip says so ("files uploaded on this page go straight to the filing cabinet"). Nothing to fix |
| GA-S2-07 | The Data catalog with no project open says to open one; sponsor chooser not checked | **Re-walked** (`vault-no-project.png`). With no project open the Vault says "Choose a project's Vault" and lists the person's projects; the Data catalog tab belongs to a project's Vault, and from there spans that project's sponsor. No dead end. A chooser of sponsors before a project is the Vault lane's if it is wanted |
| GA-S2-06 | May another project's used capture be assembled or filed for this project | **The founder's decision**, unchanged. Today it can be used and listed, not assembled or filed from another project |
| GA-S2-01, -02, -03 | LX-06 (sources as sentence spans), LX-10 (a filing names its seal), the rest of LX-02 (the upload writes in one transaction) | In `authoring-from-draft.ts`, `authoring-file-to-vault.ts` and `server/routes/chat/upload.ts`: the lineage lane's (`01QoxbLcnW…`) by its own row. Not this lane's files |

Walk: `walk.cjs` (Lumen lead; the Vault from the rail with no project open, then LMN-201 → Vault → Uploads). No API
response ≥ 400.

Since the map was written this lane also landed, for GA: the Vault's documents in the catalog, graded and usable
(`../2026-11-11-ga-surface-walk/`); the catalog read a third faster (`../2026-11-12-catalog-read-time/`); the editor's
Data room loading in a development build (`../2026-11-12-editor-data-room/`); Vault datasets graded for CDISC
conformance (`../2026-11-12-vault-dataset-conformance/`).
