# QMS and inspection deployment repair

Workstream W1, launch row D2, connected D1/D6 checks. This closes D-2's concrete
schema blocker in the 2026-10-12 reporting-coverage decisions. It repairs existing
launch infrastructure rather than introducing another Quality app.

The raw migration journal's `electronic_signatures` table has no `created_at`.
The existing controlled-document guard requires it, alongside six other columns,
and therefore failed deployment when the QMS creator was enabled. The negative
control applies the actual journal table and real preceding signature migrations:

```text
[qms-document-signature-required] public.electronic_signatures lacks created_at;
the guard would refuse every approval.
```

The canonical set now applies the signature prerequisite, nine QMS/labeling
stores and four inspection stores, then the existing deferred approval/retirement
guard. The final sweep establishes tenant RLS for all 13 stores. The prerequisite
adds nullable `created_at` with no default on the ADD statement, then sets the
future-insert default to `LOCALTIMESTAMP`. Retained unknown creation times stay
NULL; existing recorded timestamps remain unchanged. Historical `signed_at` is
not substituted into the guard's same-transaction predicate.

Nine validated composite foreign keys hold the actual organization-scoped links:
document supersession, training/document, supplier/quality agreement,
labeling/program, translations/document, symbols/document,
findings/inspection, responses/finding and assessments/inspection. Existing
single-column keys alone admitted foreign parentage in the negative control.
The new migration checks every retained link before adding keys. Foreign or
missing historical parents fail with
`QMS_TENANT_PARENTAGE_RECONCILIATION_REQUIRED`, naming the table, column and record.
It never deletes, relabels or fabricates history. A matching retained NOT VALID
key is validated; a same-named incompatible key fails explicitly. Global actor
user references remain forensic identities, independent of current membership.
Untyped artifact references are not guessed into another identity store.

The C-33 fixture now applies the real pre-batch orchestrator store port followed
by the existing electronic-signature port. Its slice previously omitted these;
the actual production set already applies them in that order. The fixture does
not hand-create signature prerequisites or hide their failure.

Verification on Node 22:

- 41/41 focused schema-contract tests passed: raw-journal refusal, additive
  replay twice, unknown/preserved historical timestamps, unsigned effective and
  retired refusal, new same-transaction signed acts, foreign signatures,
  nine owned-parent insert/update checks, retained-history reconciliation,
  constraint-definition checks and the full C-33 migration/RLS contract.
- Migration set order, guarded-table order, DROP safety and deploy reachability
  gates passed. Reachability reports the two former exclusions now reachable.
- Focused test lint found no errors; C-33 retains its existing caught-error
  warning. Complete typecheck/build/release checks are recorded by the control
  tower alongside this evidence.

Source logs: `/tmp/platform-qms-original-refusal.txt`,
`/tmp/platform-qms-parentage-red.txt`, `/tmp/platform-qms-final.txt` and
`/tmp/platform-qms-{guard-order,set-order,drop-safety,deploy-path,lint}.txt`.

These code checks do not establish regulatory certification or production
deployment. The unchanged deferred guard covers new transitions into effective
or retired; it does not retroactively certify legacy documents already in those
states. A retained foreign reference requires an authorized, evidence-backed
reconciliation before deployment can succeed.

Native PostgreSQL validation completed after the changes:

- The full canonical migration set, including both QMS migrations, replayed
  successfully on PostgreSQL 16. Privileged migration provisioning and grants
  completed; this was a local validation database, not production deployment.
- 22/22 native tests passed across controlled-document same-transaction
  signatures, protocol-reviewer signing authority and authoring section
  concurrency. Runtime operations used `app_service` with RLS on, without
  superuser or BYPASSRLS authority. The QMS test also proves unsigned transitions
  are refused even for the table owner.
- The local signature tests used the existing development audit-HMAC fallback,
  disclosed in the retained log. This proves the database/signing workflow and
  authorization behavior; it does not attest production key configuration.

Sanitized execution transcripts: [migration replay](native-migration-replay.txt)
and [native governance tests](native-governance-tests.txt).
