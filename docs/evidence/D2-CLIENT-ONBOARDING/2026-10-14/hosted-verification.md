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
