# AnA tools prove a model-supplied record id is the caller's organization's

Row **D6** (security). P1-34 hand-on 2 (`docs/evidence/D6/2026-09-26-p1-34/README.md`):
dozens of AnA handlers took a `program_id` (or a site, risk item, document or
assessment id) from the model, checked that it looked like an id, and then
anchored a record to it or read for it. The row carried the caller's
organization but pointed at another tenant's program; where a read ran outside
the caller's tenant scope (the site-risk engine's `site_intel.sites`, the
governed-fact store), another tenant's data came back. A foreign-key check does
not stop the write: Postgres runs referential checks as the table owner, past
row-level security.

## What changed

`server/services/ana/tool-record-scope.ts`, checked once in the registry wrapper
every handler is registered through (`AnaToolExecutor.ts registerToolHandler`,
after the authorization and role refusals), so every path and every tool added
later is covered:

- **Programs.** Any call whose input names `program_id`, `programId` or
  `device_program_id` must name a program of the caller's organization, asked
  of `programBelongsToOrg` (`server/routes/innovation-routes.ts`), which
  consults all three program registries and throws rather than guess when none
  can be read. The scan found 111 handlers taking a record id; the program
  fields alone covered the RBM actuator tools, `assess_site_risk`,
  `establish_governed_fact`, the IVD, labeling, UDI, risk and study creators
  and every read tool that takes a program.
- **Other records, per tool** (`RECORD_SCOPES`, keyed by tool *and* field
  because `site_id` and `assessment_id` mean different tables in different
  tools): `add_risk_control.new_risk_item_id`, `log_study_ae.site_id`,
  `log_study_deviation.site_id`, `qms_change_create.qms_document_id`,
  `simulate_reviewer_challenges` / `assemble_briefing_book.assessment_id`
  (through the owning package), `approve_import.project_id`.
- Fails closed: no organization, or a check that cannot run, refuses; the
  model's id is never echoed back.

Already fixed on trunk when re-checked, so not touched here:
`set_protocol_budget_params` (SEC-C-3, `requireProtocolForWriteTx`).
Left, with the reason: `fire_notification.recipient_user_id` (notifications
are read org-scoped, so a stray recipient sees nothing);
`link_program_clinical_study.clinical_study_id` (a UUID that references no
`clinical_studies` key; only the caller's own program's metadata is written).

## Red, then green

- `red-wrapper.txt` — the registry cases with the wrapper call removed:
  **3 fail**, including a real read tool (`get_rbm_attention`) running for
  another tenant's program.
- `db-program-check.txt` — against the deploy-shaped database
  (`install-fresh` + `deploy-migrate`): a program of organization 2 is allowed
  for organization 2 and refused for organization 1.
- Every `RECORD_SCOPES` query was run against the same database schema
  (all seven valid); the test pins each scoped tool is registered and still
  declares the field.
- `green.txt` — `tool-record-scope.test.ts` 18 passed; `green-suites.txt` —
  the AnA, route, command and MCP suites: 3974 passed, 0 failed.

## Hand-ons

- `programBelongsToOrg`'s query helper runs `SET LOCAL app.bypass_rls = 'true'`
  — a session-settable RLS bypass. Its WHERE clause carries the organization,
  so the check is right, but the bypass setting is the shape the security
  lens looks for; worth a reviewed, role-based alternative.
- Two program-ownership helpers remain (`programBelongsToOrg`, three
  registries; `programInOrganization`, `regulatory_programs` only, honouring
  `deleted_at`). One should absorb the other.
