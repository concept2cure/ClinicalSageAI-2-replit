# Hosted verification of the completed onboarding implementation

The source head is `342ffc8d0d6465a85942518da59a1d01e45c6aa4` on
`concept2cure-v2`. [Tier 5 Browser Smoke run 38508480912](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38508480912)
completed successfully at 2026-10-14 03:54:48 UTC. Its
[authenticated-app job](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38508480912/job/115671315425)
uses real PostgreSQL, an application server and Chromium.

## Executed hosted checks

- Fresh schema provisioning passed after the narrow report-index repair. The
  migration replay also applied all 380 configured files, including the repair.
- All four installer AnA bootstrap tests passed before the browser checks.
- Both authenticated smoke cases passed: a real session renders protected
  landing/projects surfaces, and the same protected route redirects an
  unauthenticated visitor to login.
- The governed golden journey passed: evidence persistence, review, provenance
  and governed draft export. The workflow uploaded its traces, screenshots and
  results successfully.

The relevant safe step excerpts are in
[hosted-browser-green.txt](hosted-browser-green.txt). These are selected test
and migration verdicts, not an environment dump.

## Scope of that result

The existing Tier 5 suite proves application boot, protected-route behavior and
the named governed journey. It does not individually exercise every new
discovery, invitation, API-key, platform-grant, legal-hold or permission control.
Their specific authority, tenant, revision, delivery and audit cases are covered
by the workstream regressions linked from [README](README.md). The local browser
screenshots use actual components with synthetic API replies and establish
layout behavior, not live delivery.

At this source head CodeQL, Semgrep, C2C Agent validation and repository-health
refresh completed successfully. Main [CI run 38508480776](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38508480776)
passed Security Scan and Security Contract Tests. Its full-history secret scan
reported seven findings, also reported on the upstream head. Its Lint job then
failed on the request-database guard, canonical fixture omissions and the
saved-document actor query. Production-mode boot progressed past provisioning
but stalled before opening a port. [Final CI follow-up](ci-followup-repairs.md)
records the resulting repairs and their local proofs; the seven secret-scan
findings were independently established as historical source checksums. This
is not a claim that all jobs in that earlier source-head CI run passed.

No production runtime or deployment credentials are configured in this session.
Passing the isolated hosted CI environment does not establish production
availability or live SMTP, identity-provider or payment delivery, and does not
close a production launch row requiring those proofs.

## Published delivery verification

Delivery commit `b50b330977c8563e3fd715d956430fe5501429cb` subsequently passed
[Tier 5 run 38516972230](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38516972230):
the real database/application/Chromium smoke and governed customer journey.
In [main CI run 38516972339](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38516972339),
Security Scan and the pinned full-history secret scan also passed. Every
pre-push gate passed for that delivery, including cold incremental TypeScript
checking with zero errors and no new ESLint warnings.

The hosted Security Contract job found one older invitation fixture mismatch
(493 checks passed, one failed). The accepted-invitation service now reads the
actual persisted membership role; that fixture returned no row for its
`INSERT … RETURNING role`. The correction emulates the actual return and
conflict-role read, and parameterizes the success check for a new member and an
existing viewer. Authorization, tenant and no-mutation checks remain intact;
actual response role, chained audit and no role UPDATE are asserted.

Both exact hosted job commands then passed locally with `CI=true`:
`npm run test:security` passed **495 tests in 51 files**, and
`npm run test:mcp-sdk-issuer` passed **both tests**. Their safe verdicts are in
`security-contract-final-status.json` and `mcp-issuer-final-status.json`.
The fixture adds no lint warnings. Production source is unchanged from the
browser-verified delivery by this correction. That older failed workflow job
retains its conclusion; this local result is not a claim that its historical
status changed or that the broader CI run has completed.

## Final security-fixture head

Commit `0259c8f5505398749dd796a030bc37f709ae26b3` passed the hosted
[Security Contract Tests job](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38518859745/job/115703706537),
including the MCP SDK issuer check, at 2026-10-14 05:53:10 UTC. The same
[main CI run](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38518859745)
passed Security Scan and the full-history secret scan.
[Tier 5 run 38518859782](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38518859782)
also completed successfully at 05:53:50 UTC: fresh database provisioning,
authenticated browser smoke and the governed golden journey all passed.

The Semgrep blocking diff scan on the preceding application-source delivery
identified one new test-only finding: a dynamic `RegExp` interpolating a
bounded role fixture in `accountOnboardingSettings.test.tsx`. The assertion
was changed to match the exact expected acceptance message as plain text.
This preserves verification of the returned membership role without a dynamic
regex, a suppression or a scanner configuration change. The production
application source is unchanged by this assertion correction.
The affected Account suite passed all 24 tests on Node 22.23.3; targeted
ESLint reported zero errors and zero warnings.

## Final main-CI guard review

The main CI runs at `b50b33097` and `0259c8f55` additionally reported two
concrete guard failures. They were replayed locally using their exact npm
commands before correction.

- Raw SQL isolation found a new actor-email lookup in the concurrently merged
  `authoring-template-guidance.ts` without an organization constraint. The
  repair binds the lookup to the captured tenant's canonical membership and an
  active account before program authorization. This changes the query rather
  than suppressing or baselining the finding.
- The entry-point guard required re-reading the changed `mdx-admin.ts` digest.
  Upstream `8fbe834fb` changes only its session-timeout display to use the
  runtime's canonical clamped preference. Its one `GET /admin` remains mounted
  at `/api/mdx` behind session authentication and the tenant lifecycle guard,
  with its own organization/admin checks and tenant-qualified facets. The
  existing justification still applies: the shape matcher sees the
  `scim_tenants` facet, not alternative SCIM authentication. Only this reviewed
  digest is refreshed. The stale API-key management entry no longer matches
  the alternative-authentication shape and is removed; the baseline shrinks
  from nine entries to eight. No new exception is added.

These corrections retain the concurrently delivered template and session
features. Historical workflow failures keep their original conclusions; local
guard results and subsequent hosted runs are separate evidence.

The exact entry-point command passes with thirteen discovered surfaces and
eight baselined entries. All 29 of its positive/negative selftest controls pass;
the selftest continues to report its three pre-existing known detection gaps.
The dated boundary review and safe command summaries are in
[final-entitlement-guard-review.json](final-entitlement-guard-review.json).

The new real-PGlite test first failed against the original query because it
read the foreign-only identity. With the repair, all **22 tests in three
affected suites pass**, including the active member's retained template
reference, the foreign-only actor and inactive-member refusals, and existing
template HTTP/UI behavior. Selected verdicts are in
[template-guidance-isolation-red.txt](template-guidance-isolation-red.txt) and
[template-guidance-isolation-green.txt](template-guidance-isolation-green.txt).
The adjacent creation and workflow-import suites also pass all 29 tests;
their verdicts are in
[template-guidance-authority-green.txt](template-guidance-authority-green.txt).
Targeted ESLint passes for the changed service and new test with no warnings.
This proves executed SQL and the saved-guidance helper; it does not qualify
native PostgreSQL RLS or concurrent transactions. The exact raw-SQL guard now
passes with zero current findings. The complete client/server build also
passes; its safe verdict is in
[build-final-guards-verdict.txt](build-final-guards-verdict.txt).
