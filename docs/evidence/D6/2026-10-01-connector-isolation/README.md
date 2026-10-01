# D6 — a connector search runs on the calling tenant's own credentials

Row **D6** (security posture; the DoD's connector scope). AnA local-safe-AI plan **WS5**,
connector half. Session `…01SuVLo2`, 2026-10-01.

## The defect

`server/services/connectors/connector-registry.ts` kept **one instance per connector for
every tenant**. `getAuthenticatedConnector` loaded the calling organization's stored
credentials and wrote them onto that shared instance, and the Google Drive, Box and
OneDrive connectors return early from `refreshToken` while a cached access token is
valid. So:

- organization B searching within the hour after organization A went out with **A's
  access token** — B's search ran against A's Drive, Box or OneDrive;
- two tenants' concurrent calls shared one instance's fields (credentials, token,
  expiry) mid-request.

Reached through `searchConnectors`: AnA's `search_connected_repositories`, the knowledge
base's connector search, and deep research. (`routes/knowledge-base.ts`'s save-to-
connector routes already built a fresh instance per call.)

## The fix

The registry holds a factory per connector and builds a **new instance per call**,
authenticated with the caller's credentials and discarded after. No connector keeps
state beyond its credentials and token, so nothing else changes.

## Red and green

| What | Red | Green |
|---|---|---|
| Two tenants through the real registry, connectors and credential encryption (store and providers stubbed): `connector-tenant-isolation.test.ts` | `red/connector-isolation.txt`: 3 of 4 fail at `7fca9601`. Organization B's Drive request carried `Bearer drive-token-svc-a@a.iam`; B's Box request `Bearer box-token-box-a`; of four concurrent Box searches, all four carried A's token | `green/connector-isolation.txt`: the connector and integration suites pass |

The fourth case (an organization with no stored credentials gets no search, even right
after another authenticated) passed before and after: the credential lookup was already
per organization; only the instance was shared.

## Not done here

- **The platform mailbox** (`search_regulatory_correspondence`, one platform-wide Gmail
  inbox visible to every tenant) — plan WS5's other half. Retiring it or binding it to
  a per-tenant credential removes the only working correspondence search, which is the
  founder's call (plan open decision 10).
- `reg_mail_ingest` rows carry no organization id (same decision).
