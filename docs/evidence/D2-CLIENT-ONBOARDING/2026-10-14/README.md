# Client discovery and existing backend UI completion

D2 / W1 · `concept2cure-v2` · 2026-10-14

The existing workspace wizard now discovers the organization's needs before
activation. It captures the respondent's role and experience, company context
and goals, project objectives, product types, therapeutic areas and indication
or device intended use, markets, first deliverable, workflows, collaboration,
source readiness, success criteria, constraints and security requirements.
Medicine, device, combination-product and client-service answers ask different
follow-up questions. Guidance comes from the shared deterministic contract.

The wizard uses the existing onboarding/project form vocabulary and canonical
design tokens. Its ten steps are Organization, Client discovery, Project
discovery, Pricing model, Choose plan, Invite personnel, Modules, Security &
setup, Agency accounts, and Review & activate.

Discovery is explicitly organization-wide. Drafts can be saved and resumed;
members can review them, while only an owner or administrator can save them.
Concurrent edits require reconciliation. Completion means that required
questions were answered, not that a security control was configured or a
regulatory decision was made. Activation completes discovery before its
organization, invitation and billing writes. A refused completion stops those
later operations. The settings change and its chained audit record are atomic;
generic settings and AnA writers cannot bypass the discovery write contract.

## Where the added capabilities are reached

| Entry | Result |
| --- | --- |
| Account menu → Set up a workspace | Conditional discovery, draft saving, observed account-security status, setup links and honest activation outcomes. |
| Onboarding → Create your first project | Opens the canonical New Project wizard. Configure → Review saved discovery → Use saved discovery in blank fields copies only user-stated name/date/indication or intended use. Filing type, product identity, classification and final creation remain explicit choices. |
| Account → Organization invitations | Accept or decline an existing account's pending membership invitations. |
| Account → Organization switcher | Lists proven memberships; rotates and verifies the new session before adopting it, clears old credentials and project state, then reloads the application to discard prior-tenant caches and conversation state. |
| Account → Reporting role | Saves the canonical membership persona and initializes the existing report catalog role filter, preserving manual filter choices. This does not grant report execution. |
| Admin console → API keys | Creates a key, offers its secret once, displays usage and revokes it. Credential changes roll back on chained-audit failure. |
| Admin console → Roles + scopes | Reads and manages platform personnel grants using server-verified standing. Finance roles require business standing. Existing DP-75 withdrawal behavior remains intact and reports an unavailable audit record honestly. |
| Admin → Setup → Legal holds | Lists named targets, places holds on actual tenant projects/Vault versions, and lifts them with a governed reason. Stored target names cannot leak across tenants. |
| Authoring workbench → Access | Reads document access history and grants/revokes actual tenant-member roles at document/section scope. Mutation, authorization recheck and audit are atomic; the final active whole-document owner cannot be removed by counting section owners. |

Invitation creation preserves the server's delivery outcome (`email`, `link`,
`failed`) and existing-user pending memberships. Setup links remain only in
component state, with explicit private-copy handover. Checkout is prepared
after setup and offered through an explicit Continue to secure checkout action,
so navigation cannot erase links before the administrator can copy them.
Neither links nor discovery narratives are automatically published to AnA.

## Evidence

- [Backend/UI inventory](backend-ui-inventory.md) records mounted capabilities,
  active renderer ownership, implemented gaps and scope boundaries.
- [Discovery contract](../../../architecture/ONBOARDING_DISCOVERY.md) documents
  the API, revision protection, conditional requirements and managed settings.
- [Discovery backend](discovery-backend.md), [Account and workspace switching](account-self-service.md),
  [Admin console](admin-access.md), [Legal holds](legal-holds.md), and
  [Document access](authoring-document-access.md) describe their changes and checks.
- `combined-regressions-green.txt` records the consolidated changed-behavior and
  existing regression run. SQL/PGlite tests exercise real statements, tenant
  isolation and rollback; HTTP/service recorder tests are identified as such.
- `root-ui-red-negative-control.txt` proves that the invitation-delivery
  contract test fails when the real `email` value is replaced with `sent`.
  Other workstreams preserve their failing audit/authority/storage/mount cases.
- `browser-verification.txt` and discovery screenshots check actual Vite-rendered
  components at desktop/390px widths and settled light/dark themes, with
  synthetic replies. The authoring browser evidence follows the same boundary.
- [Hosted verification](hosted-verification.md) records the successful real
  PostgreSQL/server/Chromium smoke and governed journey on the schema-repair
  head, with its distinct scope and remaining CI status.
- [Report tenant index repair](report-index-repair.md) records the inherited
  fresh-install defect, narrow replayable migration, and 405 installer/schema
  checks that enabled that hosted browser proof.
- [Final CI follow-up](ci-followup-repairs.md) records request-pinned API-key
  writes, canonical fixtures, tenant-qualified actor identity and the inherited
  production-bundle import-cycle repair. It links their negative controls and
  focused checks, plus the seven independently verified historical checksum
  dispositions.

Final local checks passed: 354 tests in 36 consolidated suites; 43 additional
post-merge editor/onboarding checks and the canonical Access reachability test;
the 38 organization-directory checks after a test-fixture-only refactor; full
TypeScript checking; and the client/server build. These are separate runs with
overlapping cases, not a summed unique-test count. The warning ratchet reports
seven fewer warnings. Design, CSS, authenticated-fetch and tracked-import gates
passed. The required test-presence script completed in its standard warning
mode: its basename heuristic does not recognize all of the behavior suites
listed in the workstream evidence.

Latest upstream saved-document review and working-copy handoff changes were
merged without discarding either implementation. The post-merge checks cover
the shared editor integration. Final command logs are `typecheck-final.txt`,
`build-final.txt`, `post-merge-regressions.txt`,
`post-merge-access-reachability.txt`, `organization-directory-final.txt`,
`lint-ratchet-final.txt`, `client-gates-final.txt`, and
`test-presence-check.txt`.

The pre-push SQL guard also required its legal-hold interpolation allowance to
shrink from three to two after the list moved to the tenant-parameterized query
constant. The baseline was lowered, preserving the guard's smaller budget; no
new interpolation exception or bypass was added.

The final CI follow-up also passes full TypeScript checking and the complete
client/server build on Node 22.23.3. Their command logs are
`typecheck-followup.txt` and `build-followup.txt`. Its focused checks and
successful pinned full-history rescan are recorded in the linked follow-up
and checksum-disposition evidence; their subset totals overlap earlier runs.

## Limits

No new dependency, model call or production capability flag is introduced. The
one database migration restores the already-required report tenant index;
it adds no table, column, data or access policy. Stored notification/display
preferences lack active consumers,
and stored project rules lack their event executor, so a UI that only saves
those fields would not complete their behavior. Intentionally excluded or
unmapped APIs remain recorded in the inventory rather than reopened implicitly.

This work supplies implementation, local validation and isolated hosted CI
browser evidence. The session has no production runtime or deployment
credentials. It does not establish production availability, successful live
SMTP/SSO/payment delivery, or complete the production launch rows that require
those proofs.

## Consolidation with concurrent setup safeguards

The final canonical-branch integration retains this revisioned discovery and
account/admin implementation while adding named invitation consent, effective
session policy and transaction-bound SCIM IP-rule audit controls. Parallel
discovery and API-key UI implementations were migrated and removed. Final
merged verification and replacement paths are recorded in
[the W1/D2 consolidation evidence](../../W1/2026-10-14-discovery-onboarding/README.md).

[Final canonical-branch verification](final-consolidation.md) records the
follow-up integration of tenant-pinned API-key audit outcomes, preserved-role
invitation acceptance and stale-organization session-policy guards, together
with the 77-suite regression list and final build. All 827 tests in that final
consolidated run passed; the complete reconciled client/server build passed.
The subsequent concurrent IND-template update was preserved and verified with
301 editor/backend/startup checks, 26 creation-picker checks and a fresh build.
Its evidence checksum/prose scan dispositions and exact range proof are linked
from that final verification record.
