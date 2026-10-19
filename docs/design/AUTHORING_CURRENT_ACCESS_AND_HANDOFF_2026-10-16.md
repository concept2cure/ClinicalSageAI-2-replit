# Current access and exact specialist document handoff

W1 / D2, 2026-10-16. Canonical branch `concept2cure-v2`; initial synchronized
source `990a687c6`. Local Codespaces testing only. This increment enhances the
existing authoring tools and editor; it adds no editor, surface, provider or
regulatory composition scope.

## AnA reads

`list_authoring_outline`, `read_authoring_section` and
`search_authoring_sections` must recheck the identified actor's current access
to the conversation's project on every invocation, including each continuation
page. Admission uses the existing `admitAnaProjectScope` policy before any
authoring data query. A project admitted at the start of a turn does not confer
access after membership, account standing or private project sharing changes.

Use the current request SQL client when available; otherwise use the existing
tenant connection. Missing identity, conflicting project references and a failed
policy read refuse without returning document text or inventory. Preserve the
existing no-project explanation, result budgets, cursors, offsets and tracked
suggestion rendering. This change does not redefine individual document or
section ACL visibility. The difference between ordinary reads and full saved
critique remains a separately recorded access-policy question.

## Specialist handoff

The canonical `saveToAuthoring` helper continues to own the specialist-to-editor
writer. A successful handoff must identify the exact saved document, project
and section code, with confirmed success and matching ownership in both server
receipts. Callers open that identity through the existing editor-target channel
instead of relying on list order. A changed account, organization or project
must not let an older completion navigate or change the current host's status.

Save and filing are distinct outcomes. Preserve the existing governance-binding
notice and do not call an unbound working document filed into a dossier.

The existing two-request writer can leave a confirmed empty document when the
section write is refused. A missing, malformed or lost response can also leave
an unknown committed outcome. Messages must state that uncertainty and retain
the exact confirmed document identity when known; they must not claim nothing
was saved. No request is automatically retried or compensated by deleting data.
Any unresolved repeat-creation risk must be recorded explicitly rather than
claimed fixed by better wording. A shared recovery change requires its own
bounded contract and proof against the existing creation behavior.

## Evidence and publication

Capture the actual previous failures and final focused regression runs under
`docs/evidence/D2-EDITOR-INTEGRATION/2026-10-16/`. Exercise current private
project admission with real local SQL and editor navigation with the actual
handoff channel. Preserve existing UI tokens, controls and interaction patterns.
Run strict lint, the repository compiler, build and normal publication checks.
Push verified increments directly to `concept2cure-v2` without a PR.

Local automated checks do not establish provider-backed AnA performance,
independent human review, agency acceptance, deployment readiness or a green
launch row.
