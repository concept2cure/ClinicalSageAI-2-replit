# Canonical platform integration checkpoint

W1 / D2, `concept2cure-v2`, 2026-10-14. Publication and hosted release gates are pending. Local compiler, build
and bounded merge checks pass. This is a working integration record, not a production qualification.

The control tower preserved Claude's reporting-persona, account, organization,
authoring-access and governed onboarding changes through canonical merges. The
later consolidation at `3412596c16283567c34b3d900bdbb0ef5eef0497` merged cleanly
after the first onboarding merge checkpoint `caa39331f`. The subsequent
`b50b33097` IND authoring increment is now integrated with the existing requester
and source-access guards preserved.

The root changes reserve a protocol's authoritative parent before reading
authorship for a signature, and reserve an open editor before a tenant switch
can spend its bearer. Reporting personalization remains separate from access
authorization. Unavailable permission details do not assert that a member or
section was removed.

## Verified increments

* [Protocol reservation](../protocol-sod-reservation/green/README.md): three
  actual native API cases pass, with the retained red fixture unchanged. The
  independent approver and author positive controls retain genuine content
  bindings. The separate native regression lane passes 89 cases.
* [Protocol route neighbours](../protocol-signature-preparation/README.md):
  85 cases pass, including post-reservation independence and rollback controls.
* [Editor and session guard](../auth-org-consistency/README.md): the first
  bounded repair passes 97 cases across 11 files. The separate
  [startup-probe and revocation follow-up](../auth-org-consistency-followup/README.md)
  passes 121 cases across 12 files, including those regressions. Logout retains
  server revocation of the exact original or settled credential pair; delayed
  work in a held editor retains the existing browser discard guard.
* [Final session guard](../auth-org-consistency-final/README.md): 122 cases
  across 12 files pass, including a same-bearer role-refresh/logout regression
  demonstrated red by omitting the corrected predicate.
* [IND catch-up merge](../latest-claude-consolidation/ind-template-merge/README.md):
  363 tests across 24 unique files pass. A duplicate fixture-only column
  declaration caused the preserved initial failure; its 15 tests pass after
  removing that declaration. The three resolved section-schema suites also
  pass 30 cases without skipped tests.
* [Latest Claude consolidation](../latest-claude-consolidation/delta-focused-tests/README.md):
  219 cases across 21 exact delta files pass without fixture edits.
* [Fresh schema replay](../fresh-schema-replay/README.md): strict installation,
  deploy replay, report index, tenant policy coverage and 1,299 runtime relation
  grants pass on a new isolated database. Existing roles and credentials remain
  unchanged. The first installation's missing-tool-path failure is preserved.

These counts describe separate runs, including overlapping regressions; they
must not be added as a unique whole-suite total. Previously filed browser and
SQL evidence retain their original source and execution qualifications.

The first whole TypeScript run after this merge found two test geometry-shim
typing errors. Its raw log is retained at
`/tmp/project-vault-current-merged-typecheck-final.txt`; the zero-error baseline
is unchanged. The production build passes on the frozen follow-up source.
The final IND-merged compiler finds zero errors; the merged production build,
SQL interpolation ratchet, tenant isolation ratchet and eight security-contract
tests pass. Their exact raw and filed digests are recorded in
`merged-gate-artifacts.json`. The next small Claude merge (`bd8738868`) adds an exact active same-tenant
identity check before saved template guidance and two fixture corrections.
Its [four exact suites](../latest-claude-consolidation/guidance-tenant-merge/README.md)
pass 78 cases. The later normal push refused net warning growth, preserved in
[the warning repair](lint-repair/README.md); canonical extractions remove all
three new warnings without expanding a baseline. Source Tracer passes ten
cases, protocol routes 26, and five ingest neighbours 57. The final compiler
again has zero errors and build completes in 32.30 seconds with server output
complete, pinned in `final-guards-gate-artifacts.json`. History scan, normal
pre-push gates, publication and remote checks remain pending. Earlier lint and history results remain
qualified to their original phase; their baselines were not expanded.

## Next reporting increment

[Complete retained report-pack PDF](../../../../design/RETAINED_REPORT_PACK_PDF.md)
is the approved next implementation. It will expose full saved report bodies
and evidence alongside the current manifest action, using canonical renderers
and exact-byte audited delivery. Implementation has not begun.

No result here establishes scientific validity, agency acceptance, full
IND/BLA/CTD coverage, model PQ, production audit-chain assurance or a production
deployment. Those qualifications require their own authoritative evidence and
release procedures.
