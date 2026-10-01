# D6 — the deployment's own mailbox, calendar and CRM serve one named organisation (2026-10-01)

Row **D6**. Lane: `…session_01SuVLo2`, claimed `457476f6`. AnA local-safe-AI plan WS5, the mailbox half. Open decision 10 is decided as **P-8** in `docs/LAUNCH_DEFINITION_OF_DONE.md`.

## Before (measured at `51dd1eae`)

Three integrations are each **one account for the whole deployment**, set in the environment. Every organisation reached them:

| Door | Account | What another organisation could do |
|---|---|---|
| AnA `search_regulatory_correspondence` | The Gmail mailbox `GMAIL_OAUTH_JSON` configures | Read it. The tool's description said "the organization's connected regulatory mailbox". |
| AnA `search_crm` | The HubSpot account `HUBSPOT_ACCESS_TOKEN` configures | Search its contacts, companies and deals |
| AnA `create_calendar_event` | The team calendar | Write events onto it |
| `POST /api/stability/studies/:id/timepoints/push-calendar` | The same calendar | Push its study's sampling dates onto it |
| AnA's own account of its integrations (`getIntegrationStatuses`) | — | Was told all three were live |

## After

`server/services/integrations/platform-integration-owner.ts` holds the one rule:
- **Who they serve.** The three accounts serve only the organisation `PLATFORM_INTEGRATIONS_ORGANIZATION_ID` names.
- **Where the caller comes from.** The running request's tenant scope, never a tool input.
- **Everyone else.** Every other organisation, an unscoped call, and the estate-wide system scope (`'0'`) are told the account is not connected for them. The account is not reached.
- **Unset.** No organisation reaches them.

The three services, the stability route and the status all apply this one rule:
- `correspondence-search.ts`
- `hubspot-client.ts`
- `calendar-event.ts`
- `stability.router.ts`
- `integration-status.ts`

`.env.example` documents the variable.

## Red, then green

| Suite | Red on trunk | Green |
|---|---|---|
| `platform-integration-owner.test.ts` (new; the real services, the real tenant scope, `fetch` stubbed) | `red/owner-rule.txt`: **5 of 6**. Another organisation, the system scope and an unscoped call each reach all three accounts. With no owner named, the mailbox and calendar still answer. The status reports them live to another organisation. A first draft left `fetch` unstubbed, and on trunk it reached HubSpot itself (403 for the test token), so the stub went in. | 6/6 |
| `stability-calendar-owner.test.ts` (new) | `red/stability-calendar.txt`: another organisation's study is pushed onto the calendar (200, one event created) | 2/2 |

`green/integrations-and-stability.txt` covers every integration and stability-router suite: **148/148**.

The existing unit suites test each client's own behaviour (filtering, normalisation, request shape) **as the owner**. They now mock `callerOwnsPlatformIntegrations` to true, and say so. The rule itself is tested for every caller, through those same clients, in the new file.

The status suite's two cases are restated:
- the live case names its owner;
- the summary counts the three accounts as not configured for a caller with no organisation.

## Not done, recorded

- **AnA's tool definitions** (`AnaToolExecutor.ts`, `evidence-literature-tool-defs.ts`) are unchanged. The first was changed today by two lanes. The rule sits beneath them, in the services they call. The mailbox tool's description ("the organization's connected regulatory mailbox") is now true for its owner, and the tool tells anyone else it is not connected.
- **The mailbox ingest.** `gmailIngestToReg` (`server/src/services/integrations/gmail.ts`) writes `reg_mail_ingest` rows with no organisation, but nothing calls it. It is unreachable, so it is recorded, not deleted here.
- **Per-tenant mailboxes and CRMs**, on a tenant's own credential, are a connector capability for after launch (P-8).
- **The WAF (P-11).** The Terraform is handed on to the holder of `terraform/modules/cloudfront` (`…01GSjEDJ`, `9cb30bda`).
