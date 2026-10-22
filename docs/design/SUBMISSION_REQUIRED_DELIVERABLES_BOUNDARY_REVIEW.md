# Required deliverables: final boundary review

W1 / D2, `concept2cure-v2`. This follow-up preserves the existing Required
deliverables contract, canonical requirement engines, dispatch gates and UI.

The final independent audit identified three defects in the new read boundary.
They were reproduced on the preceding source before repair: five negative
tests failed while 40 controls passed. The repaired affected replay passed all
69 tests across four files. Earlier compiler, native and UI records remain
separate source phases; final qualification has its own pins and results.

- A Vault source with NULL `organization_id` must not inherit ownership from
  its programme. After current programme admission, it returns the canonical
  `409 VAULT_TENANT_RECONCILIATION_REQUIRED` before source metadata or provider
  reads. Metadata SQL also binds the recorded organization. Foreign ownership
  retains a generic refusal.
- Initial Authoring ACL refusals retain their canonical 404 or verification
  503 status through the submission route. Verification faults use the existing
  safe response message and disclose no source prose or database diagnostics.
- A programme's integer project anchor must match the admitted identity at the
  late read checks. A transfer to another still-accessible project refuses the
  old response, even when actor, role and programme UUID are unchanged. Source
  checks apply this before repeated provider reads and again afterward.

These changes add no permission policy, dependency, migration, writer or
approval mechanism. The late checks observe changes under READ COMMITTED;
they do not reserve a future administrative state. Complete IND/NDA/BLA
coverage, scientific verification of binary content, and regulatory acceptance
remain outside this bounded view's claims.
