# Support policy

> **DRAFT — FOR FOUNDER AND LAWYER REVIEW.** Prepared 2026-09-20 by a
> Claude Code session (workstream W6). This policy is written for the
> company as it is: one founder, with operations run largely by Claude Code
> sessions under the founder's account. The targets below are what that
> company can actually meet; they are deliberately not the targets of a
> vendor with a support desk. Referenced by the MSA and Pilot Agreement; an
> operational document, not a warranty. Launch row moved: **D9**.

## 1. Who provides support

Support is provided by the founder, assisted by AI-run operations (Claude
Code sessions that triage, reproduce, and prepare fixes). A human — the
founder — makes every decision that touches a customer tenant, and every
action on a tenant is recorded in the platform audit trail under the account
that took it. There is no 24×7 desk. Customers should plan on a single point
of contact and, for a Sev-1, on the founder's phone.

Coverage hours: **[Mon–Fri, 08:00–18:00 US Eastern]**, excluding US federal
holidays. Sev-1 incidents are monitored outside those hours through
automated alerting (uptime probes and Sentry) with best-effort response.

## 2. How to contact support

| Channel | Use for |
|---|---|
| support@[domain] | All requests; creates the ticket record |
| Shared channel (Slack Connect / Teams) — [set up at onboarding] | Day-to-day questions during a pilot |
| [Founder mobile — given to the customer admin at onboarding] | Sev-1 only |
| security@concept2cure.pro | Security vulnerabilities and suspected data incidents |

Include: organisation name, user, surface, what you expected, what happened,
timestamp, and whether a governed record is affected.

## 3. Severity levels and response targets

| Severity | Definition | Acknowledge | Status updates | Target to workaround or fix |
|---|---|---|---|---|
| **Sev-1** | Production tenant unavailable; data loss or integrity concern in a Governed Record or the audit trail; suspected security incident; no user can log in (e.g. OTP delivery down) | 2 hours in coverage hours; 4 hours outside | Every 4 hours until resolved | Workaround within 1 business day; root-cause note within 5 business days |
| **Sev-2** | A launch-catalog workflow is blocked for the named regulatory user with no workaround; a figure, verdict or status is wrong or fabricated; fixture/sample data visible in a customer tenant; a governed action cannot be signed | 1 business day | Daily | Workaround within 3 business days; fix in the next release |
| **Sev-3** | Defect with a workaround; usability problem; documentation gap | 2 business days | Weekly (in the check-in) | Prioritised for a release within [30] days |
| **Sev-4** | Question, enhancement request, out-of-scope request | 3 business days | — | Logged; out-of-scope requests answered "not in this release" |

"Acknowledge" means a human reply confirming severity and owner, not an
auto-response. If Provider cannot meet a target it says so in the ticket
rather than letting the target lapse silently.

A fabricated value or a fabricated success state is always at least Sev-2:
the platform's rule is fail closed, never fabricate.

## 4. Escalation

1. Ticket owner (founder or AI-run triage) — all severities.
2. Founder personally — any Sev-1, any Sev-2 older than its target, any
   ticket the customer asks to escalate.
3. There is no level 3. If the founder is unavailable for more than
   [48] hours, the designated backup contact is [NAME — founder to
   nominate]; this is a stated single-point-of-failure risk and the customer
   should factor it into its own business-continuity plan.

## 5. What support includes and excludes

Included: defects in the Launch Catalog; access and account issues; help
using a workflow; export assistance; validation-document requests (MSA §6);
inspection support (MSA §7.2); release-note questions.

Excluded: regulatory advice or medical writing; review of the content of a
submission; custom development; support for surfaces outside the Launch
Catalog ("not in this release"); support of a customer's own infrastructure,
identity provider, or ESG account.

## 6. Maintenance windows

- **Routine releases** deploy through the CI/CD pipeline
  (`.github/workflows/deploy-aws.yml`) with the migration set applied
  before services roll; they are designed to be zero-downtime and may
  happen on any business day. Release notes are sent on the day of
  deployment.
- **Planned maintenance** that may interrupt service (database
  maintenance, infrastructure changes) is scheduled in the window
  **[Saturday 02:00–06:00 US Eastern]** with at least [5] business days'
  notice by email and in the shared channel. Maintenance time in the window
  is excluded from the availability calculation.
- **Part 11-affecting changes** (Governed Record format, signature flow,
  audit trail, eCTD packaging or validation rules) get at least [5]
  business days' notice with the validation impact assessment, per MSA §6.2.
- **Emergency changes** (security fix) may deploy without notice, followed
  within 1 business day by release notes and, within 5 business days, by
  the break-glass retrospective under `docs/RELEASE_GOVERNANCE.md`.

## 7. Incident communication

For any Sev-1, or any incident affecting more than one tenant:

1. **Initial notice** within the acknowledgement target: what is known,
   what is affected, what the customer should do (e.g. do not sign until
   further notice).
2. **Updates** on the cadence in §3, even when the update is "no change".
3. **Resolution notice** with the time of resolution and any action the
   customer must take (e.g. re-run an export).
4. **Post-incident report** within 5 business days: timeline, root cause,
   customer impact including any Governed Record or audit-trail impact
   (stated precisely, never minimised), corrective actions with dates, and
   the audit-chain verification result (`npm run audit:verify:full`) after
   the fix.
5. **Personal-data breach** notices follow the DPA §7 timeline (within
   [48] hours of confirmation) regardless of severity.

Status is communicated by email and the shared channel. There is no public
status page at launch; [founder decision whether to publish one].

## 8. Customer responsibilities

Keep the admin and named regulatory user contacts current; reproduce issues
with the information in §2; apply workarounds when given; do not share
credentials; report suspected security issues to security@ first.

## 9. Review

This policy is reviewed at every launch-row change to D1, D5 or D6 and at
least quarterly. Changes are versioned and notified with the next release
notes; a change that reduces a target does not apply to a current
subscription term without the customer's consent.
