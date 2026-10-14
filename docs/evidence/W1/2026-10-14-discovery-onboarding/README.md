# W1 / D2 — discovery onboarding and setup handoffs

This moves launch onboarding within the existing catalog. It does not declare
the hosted-production or tenant-isolation launch rows complete.

The previous UI advanced directly from organization type to pricing without
asking discovery questions. `discovery-red.txt` runs the new requirement against
the original `Onboarding` implementation: the continuation button incorrectly
remains enabled without a company goal or use. The updated implementation is
covered by `onboardingDiscovery.test.tsx`, the existing activation and current-org
tests, and the focused onboarding component suites.

Backend fail-first evidence exercises malformed discovery snapshots, missing
invitation names/audit transactions, and the legacy session-timeout display.
Those checks fail against the original handlers and pass against the updated
code. Backend tests use recorder clients and real scope utilities; they are not
a live PostgreSQL/RLS isolation proof.

`browser-check.json` and the four PNGs show the actual React wizard and canonical
CSS in Chromium at desktop and mobile widths. The check fills discovery, follows
the IVD questions, activates a free-plan setup and observes the settings request.
The APIs are mocked; the screenshots are review evidence, not production data.
There was no horizontal overflow at 390 pixels and no browser page error.

The release-check logs added here record the final targeted tests, TypeScript,
build and relevant repository gates. Production deployment is separate: this
workspace has no configured AWS/deployment credentials. SAML configuration is a
deployment task because its backend offers no write endpoint. Neither is
reported as configured by the onboarding UI.

The final focused regression run passed 369 tests across 37 files, covering the
wizard, Account, current-org prefill, project intake, existing administration,
API-key audit outcomes, invitation consent, SCIM policy audit rollback, session
policy and the shared discovery contract. The production client/server build
passes. The full-program TypeScript check uses the existing zero-error gate.
API-key creation preserves its existing best-effort audit policy while reporting
the outcome; SCIM token administration's existing audit gap is distinct from the
newly audited IP-rule mutations and remains disclosed in the report.
