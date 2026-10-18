# Organization discovery during onboarding

The onboarding wizard captures what a client is trying to achieve before asking
them to choose a plan, invite a team and configure their workspace. The
questionnaire is organization-wide. Its respondent role, experience and support
preference describe the person completing discovery; they do not change that
person's account persona or any account permission.

The contract is [shared/types/onboarding-discovery.ts](../../shared/types/onboarding-discovery.ts).
The server door is [server/routes/onboarding-discovery-routes.ts](../../server/routes/onboarding-discovery-routes.ts),
statically registered in the existing tenant bootstrap.

## Questions and applicability

Discovery covers organization context and stage, company goals, respondent
experience, product modality, development stage, therapeutic area and indication,
first project and deliverable, markets and target date, intended workflows,
collaboration, team size, source readiness, existing systems, security needs,
constraints and measurable success criteria.

All enum options and field labels are shared between client and server. Empty
strings and empty arrays are valid drafts. Completing discovery requires the base
questions and the questions applicable to the recorded product and business
context:

- Small molecules, biologics, cell/gene therapies and combination products require
  therapeutic areas and an indication or patient population.
- Devices, diagnostics, software and combination products require intended use.
- Service providers require the services they deliver for their clients.

The target date, existing systems and constraints are optional. A selected
security requirement describes a need; it is never interpreted as evidence that
MFA, SSO, retention, residency or collaborator access is configured. Choosing
"Help me establish the requirements" is an explicit answer when requirements
are still being discovered.

## API

`GET /api/onboarding/discovery` returns:

```ts
{
  success: true,
  data: {
    discovery: null | {
      schemaVersion: 1,
      revision: number,
      answers: OnboardingDiscoveryAnswers,
      updatedAt: string,    // server ISO-8601 timestamp
      updatedBy: number,    // authenticated actor
      completedAt: string | null
    },
    assessment: {
      requiredFields: DiscoveryField[],
      missingFields: DiscoveryField[],
      completionPercent: number,
      readyToComplete: boolean,
      recommendations: DiscoveryRecommendation[]
    },
    canEdit: boolean
  }
}
```

`null` means no discovery record has been saved. A read error returns an error,
never a manufactured empty questionnaire. A saved completion marker with missing
required answers is invalid and is refused.

`PATCH /api/onboarding/discovery` accepts only:

```ts
{
  answers: OnboardingDiscoveryAnswers,
  expectedRevision: number, // 0 for the first save
  complete: boolean,        // defaults to false
  reason: string            // the person's reason, 10–500 characters
}
```

The request supplies the complete questionnaire snapshot. The shared schema fills
missing draft keys with their empty defaults. It refuses unknown fields,
unsupported options, duplicate multi-select options, invalid calendar dates and
oversized text. The organization, actor, revision and timestamps never come from
request ownership fields.

Only an active organization's authenticated administrator or owner can save its
shared discovery. Members can read it with `canEdit: false`. Platform-role
spellings or role arrays do not replace organization membership standing.

| Result | HTTP | Meaning |
| --- | --- | --- |
| Saved | 200 | New revision and its audit record committed |
| Invalid body | 400 | Nothing written |
| Unauthorized | 401/403 | No storage access / mutation granted |
| Missing organization | 404 | No write matched |
| `DISCOVERY_REVISION_CONFLICT` | 409 | Reload the teammate's newer answers before saving |
| `DISCOVERY_INCOMPLETE` | 422 | Required applicable answers missing; `missingFields` supplied |
| Read/write unavailable | 503 | No invented read result; refused write changes nothing |

Saving `complete: false` clears any previous completion marker. Saving
`complete: true` validates conditional completeness and records the current
timestamp. Completion measures questionnaire coverage, not regulatory readiness.

## Persistence and audit

The record lives at `organizations.settings.onboardingDiscovery`. There is no
new table, migration or alternate settings writer. The existing
`writeTenantSettings` function selects the active organization's row `FOR UPDATE`
on the tenant-pinned connection. The revision comparison runs inside its locked
`next` callback. It preserves unrelated sections and writes the discovery record
and chained audit row in one transaction. A failed audit insert rolls both back.

The canonical writer protects this section from general settings mutations:
only the discovery endpoint supplies `discoveryDoor: true`. A generic update,
reset or AnA settings tool cannot create, replace, remove or null the discovery
record. It cannot bypass the guard by mutating the existing object in place.
General organization and tenant settings APIs refuse a named discovery section
with 403 before validating or silently stripping it; unrelated updates preserve
the discovery record. Completion metadata is never a free-form setting.

The canonical audit action is `tenant_settings_changed`, section
`onboardingDiscovery`. Its row carries the authenticated actor, organization,
reason and changed field names. Questionnaire narrative is not copied into the
append-only audit details. Discovery is protected by the existing organization
RLS policy, and is included with organization settings in existing tenant export
and retention behavior.

Discovery does not update organization identity, industry profile, learned client
intelligence, personal persona, security policy, invitations, entitlements,
projects, controlled artifacts or billing. Those keep their existing governed
doors. The stored questionnaire is the canonical record of the client's stated
setup goals, not an AI-extracted or approved regulatory artifact.

## Guidance

`assessOnboardingDiscovery` deterministically selects recommendations from the
answers. It suggests reachable launch destinations: project setup, Vault,
authoring, Submission Center, submission readiness, controlled quality documents,
reporting and administrative/account setup. The navigation layer still decides
entitlement. Recommendations never grant a module or assert a completed setup.

CMC guidance preserves the launch composition boundary: a single small-molecule
modality, a US market, a preclinical or clinical stage and a submission goal are
needed even to suggest reviewing CMC scope. The suggestion explicitly asks the
person to confirm that the actual filing is a US IND. It does not widen the CMC
composition engine's supported filing types.

## Verification

Run the focused suite:

```sh
npx vitest run shared/types/__tests__/onboarding-discovery-contract.test.ts \
  server/routes/__tests__/discovery-questionnaire-routes.test.ts \
  server/routes/__tests__/discovery-settings.pglite.integration.test.ts \
  server/routes/__tests__/discovery-managed-setting.test.ts
```

The contract and route tests cover conditional questions, draft/resume,
completeness, attribution, access denial, strict validation, revision conflict,
honest failures and scope-limited recommendations. The PGlite integration uses
real PostgreSQL statements and the canonical settings writer with a non-superuser,
non-bypass-RLS role. It proves saved readback, row locking, security and connector
preservation, stale-edit refusal and rollback after a real audit-insert error.
Its negative control widens the test policy, observes the isolation assertion
fail, rolls the policy back and verifies isolation again. The authentication
session and audit insertion adapter are test seams; production authentication and
audit-chain cryptography retain their existing dedicated database suites.

Evidence: [D2 client onboarding, 2026-10-14](../evidence/D2-CLIENT-ONBOARDING/2026-10-14/discovery-backend.md).
