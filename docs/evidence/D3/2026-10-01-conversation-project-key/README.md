# PF-03 rest (D3): a conversation names an integer project only of its own organization

This finishes the integer half of PF-04, which `20261001` began (`../2026-10-01-integer-project-same-org-keys/`).

## The defect, and the note that held it back

`concept2cure_conversations.project_id` is an integer key to `projects(id)`. It proves the project exists, not that the project belongs to the conversation's organization.

`20261001` left it unkeyed. Its header said the AnA stream was the table's writer, had no project check, and would fail mid-turn under a key. That claim was wrong:

- **The AnA stream does not write `concept2cure_conversations`.** A multiline search of `server/`, `scripts/` and `shared/` finds one production `insert` into the table: `POST /api/concept2cure/projects/:projectId/conversations` (`server/routes/c2c/conversations.ts`).
- **That writer checks the organization first.** It runs `verifyProjectAccess`, an organization-scoped project read (`loadProjectAccessRow`), before the insert. A fork reads its parent conversation in the same organization.
- **No other write changes `project_id` or `organization_id`.** The conversation PATCH and archive, the project soft delete, the conversation-health metadata write and the GDPR erasure all leave both columns alone.

So the key refuses nothing today's writer sends. It holds the next writer to the same rule.

## The change

**`migrations/20261001_integer_project_same_org_keys.sql`, amended in place** (Rule 1, with a dated header note):

- The amendment adds a third key, `concept2cure_conversations (project_id, organization_id) → projects (id, organization_id)`, on the existing `projects_id_org_uq`.
- **NOT VALID**, so legacy rows are not scanned and do not fail the deploy. Every insert, and every change to either column, is checked.
- **ON DELETE CASCADE**, the action of the existing key (`0000_sweet_joseph.sql:6493`). A project delete behaves as before, and PF-08 decides whether it may happen.
- **ON UPDATE NO ACTION**, so a project with conversations under it cannot be moved to another organization.
- The block is guarded by `to_regclass` and `pg_constraint`, so a replay runs no DDL. It is the file's fourth DO block and has no DROP.
- The false "NOT KEYED HERE" note is replaced and dated. The journal records drift for this file, and that is the amendment.

**`scripts/db/program-same-org-preflight.mjs`** lists legacy cross-organization conversations. The remedy is to re-file the row under a project of its own organization (`project_id` is NOT NULL).

## Evidence

| File | Shows |
|---|---|
| `01-red-before-key.txt` | The extended contract test, run against `20261001` as pushed in `a7060f3e3`. A conversation under another organization's project is written (`'ok'`, not `23503`), the key is absent, and the preflight has no entry for the table. |
| `02-real-postgres.txt` | PostgreSQL 16. The upgraded and fresh databases each hold no cross-organization conversation. Each applies the file twice and ends with one key: NOT VALID, CASCADE, NO ACTION. An own-organization conversation is written, and one under another organization's project is refused. Everything runs in a rolled-back transaction. |
| `03-green.txt` | 80 files, 833 tests, all passing: the contract test (12 cases), every suite that touches conversations or the keys file, the 71 suites that use the PGlite harness, and the founder-path walk. |

## Review

The review was `wf_4eeb1d30-9a3`, with two lenses: writers and migration. Both returned no findings.

- **Writers lens.** It looked for every insert into `concept2cure_conversations`, and every update of its `project_id` or `organization_id`, across `server/`, `scripts/` and `shared/`. It also looked for any path that moves a project to another organization. None can now fail where it succeeded before.
- **Migration lens.** It checked fresh installs, upgraded databases, a missing unique index, project, organization and workspace deletes, the PGlite harness and the preflight's consumers. No case fails a deploy or a delete.
