# GA Human User Testing Checklist

This checklist is for final pre-GA validation of concept2cure-V2 with human testers. Complete all sections before GA sign-off.

## 1) Test Session Setup

- [ ] Confirm target branch/release candidate (`concept2cure-V2`) and commit SHA.
- [ ] Confirm test environment URLs and credentials are provisioned.
- [ ] Confirm incident-response owner and on-call contact for the session.
- [ ] Confirm telemetry dashboards are available (errors, latency, auth failures).

## 2) Security and Static Analysis Gates

- [ ] CodeQL workflow passed for JavaScript/TypeScript and Python.
- [ ] Semgrep workflow passed and SARIF uploaded to Code Scanning.
- [ ] No open Critical/High code-scanning alerts without approved risk acceptance.
- [ ] Secrets scanning enabled in repository settings.

## 3) Core Human Flows (UAT)

For each flow, record tester initials, environment, and timestamp.

- [ ] Sign in / sign out / session timeout behavior.
- [ ] Primary clinical workflow happy path end-to-end.
- [ ] Document upload and processing flow.
- [ ] Review/edit flow with autosave and recovery.
- [ ] Error handling UX (network failure, validation errors, retries).
- [ ] Accessibility smoke checks (keyboard navigation, focus order, labels).

## 4) Non-Functional Acceptance

- [ ] p95 latency within GA SLO for critical endpoints.
- [ ] No blocker regressions in browser compatibility matrix.
- [ ] Audit/event logging visible for critical user actions.
- [ ] Backup/restore and rollback procedure validated for this release.

## 5) Go/No-Go Decision

- [ ] PM sign-off
- [ ] Engineering lead sign-off
- [ ] QA lead sign-off
- [ ] Security sign-off

### Sign-off Log

| Role | Name | Decision (Go/No-Go) | Date (UTC) | Notes |
| --- | --- | --- | --- | --- |
| PM |  |  |  |  |
| Engineering Lead |  |  |  |  |
| QA Lead |  |  |  |  |
| Security |  |  |  |  |
