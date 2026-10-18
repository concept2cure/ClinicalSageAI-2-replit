# Canonical-branch consolidation and final verification

While the CI follow-up was being validated, the canonical upstream advanced
through `8e99dc867`, the consolidation of concurrent onboarding work, and
repository-health refresh `3412596c1`. That upstream merge already includes
the earlier onboarding/index-repair head `342ffc8d` and preserves this
revisioned discovery wizard, canonical discovery API, current-tenant wrapper
and explicit project handoff.

The final integration keeps upstream's named invitation consent, shared
invitation-delivery outcomes, session-policy consumers and transaction-bound
SCIM IP-rule audit controls. Its additional supported setup paths and earlier
merged checks are documented in
[the upstream consolidation record](../../W1/2026-10-14-discovery-onboarding/README.md).

## Reconciled behavior

- API-key mutations retain the request-pinned transaction and rollback on
  chained-audit failure. Upstream's truthful `auditTrail` responses are retained;
  refused attempts use the general audit recorder. The outcome test now
  supplies the same request client used by credential and audit writes, and
  traps any fallback to a shared-pool transaction. Both route suites and both
  service suites pass 36 tests.
- Invitation acceptance validates the accepted response's invitation,
  organization, user and actual persisted role. Existing membership may retain
  member, admin, owner or another existing role instead of the invited role;
  the UI confirms that result, refreshes memberships/invitations and explains
  a preserved role. It does not derive or grant privileges from that display.
  Malformed/mismatched confirmation remains refused. The account suite passes
  24 checks.
- Session-policy controls capture their original organization. Late data and
  save completion cannot display another workspace's policy, and an
  organization change prevents PATCH. Ten focused checks cover those races.
  The onboarding AnA summary now accurately states that discovery drafts and
  session policy can be saved explicitly before activation; discovery
  narratives remain outside that summary.

The core discovery settings contract and revision protection are unchanged by
this merge. The report tenant index, canonical fixture corrections, actor
membership proof and pure digest import-cycle repair remain in place.

## Verification boundary

The selected 77-suite run combines the upstream workstream's 67 suites with all
follow-up startup, signature, migration, scanner-contract and service checks.
All **827 tests in 77 files passed** in **242.05 seconds** on Node 22.23.3.
Its exact list and safe verdicts are in `post-consolidation-test-files.txt` and
`post-consolidation-regressions.txt`. The complete client/server build also
passed and is recorded in `build-consolidated.txt`. Earlier subset counts
overlap this consolidated run.

The pinned full-history scan at the captured repair head passed with zero
findings after seven exact, proven checksum dispositions. The independently
scanned additional upstream range also had zero findings. The pinned scanner
then verified every committed addition from the full-history-verified repair
head through final code merge `bbe4cee7152bbe0cb38adff52a454af1f04fb93b`:
exit zero, zero findings. [The safe committed-range record](final-commit-range-scan.json)
identifies the exact revisions and scanner settings. Hosted reruns are
separate evidence; older failed workflow runs retain their conclusions.

## Subsequent authoring update

The first final push passed every pre-push gate, including a cold incremental
TypeScript check with zero errors, but its remote ref update raced an independent
IND authoring/template delivery. That update and its repository-health refresh
through `fe2545537` were merged without conflict in `4546acd6d`.

The shared workbench retains both document Access and the new template guidance.
Template creation retains project/tenant authorization, atomic creator grants,
sections/revisions/audit and verified handoff to the existing editor. The pure
digest functions and their public re-exports are unchanged. A focused post-merge
run passed **301 tests in 19 suites**, covering the new IND templates and the
existing permission, review, workflow and actual bundled-startup paths. The
creation picker separately passed **26 tests**. The rebuilt client/server also
passed. These are follow-up integration checks, not additional unique tests to
sum into the preceding 827-test run.

Safe records are `authoring-sync-regressions.txt`, `authoring-sync-test-files.txt`,
`authoring-sync-creation-picker.txt` and `build-authoring-sync.txt`. The added
browser-evidence scan findings and their provenance are recorded in the linked
[authoring evidence dispositions](authoring-evidence-scan-dispositions.md).
Those 12 matches are four artifact checksums and eight static regulatory prose
spans at nine immutable fingerprints. After those precise dispositions, the
same pinned added-history range scan passed with zero findings; the scanner
rules and previous ignore content remain unchanged.

The original isolated hosted browser proof and local bundled-initialization
proof retain the boundaries described in [hosted verification](hosted-verification.md)
and [CI follow-up](ci-followup-repairs.md). Production delivery, SMTP, identity
provider and payment services still require their actual runtime evidence.
