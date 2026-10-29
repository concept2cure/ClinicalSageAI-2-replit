# Fold `setup` into administration (`admin-console`) (D2, 2026-10-29)

**Launch row:** D2 ("one AnA"; `docs/LAUNCH_DEFINITION_OF_DONE.md`).

**Founder direction, 2026-10-29:** "We are moving most 'app' into core functionality and away from any out of process 'app'."

**Plan:**
- the placement map: `.design/client-journey/FUNCTION_PARITY.md`, "Into administration (`admin-console`) / From `setup`";
- the common fold checklist: `docs/design/DEVICE_FOLDS_2026-10-29.md` (from `2168fd56`; it applies to any fold);
- the deletion rule: `CLAUDE.md`'s working agreement.

**The work, named for what it is:**
- **reach** Setup's governed settings inside the existing Admin and access surface: each is its existing card, **moved** (not copied) onto admin-console's Settings tab, with its own read and its own reasoned, audited write;
- **complete** admin-console's Settings tab, which said "Nothing on this tab changes them yet" beside a read-only "Session timeout" row;
- **reach** the Identity console from the SSO tab;
- **carry** Setup's AnA summary into admin-console's context;
- then **fold** `setup`: retire the id, alias it to admin-console's Settings tab, take it off every list (Part 2, after the shared checklist files are free).

No route was added. One route changed: `GET /api/mdx/admin` stops serving the read-only session-timeout row the session-policy card replaces, and its second-factor row says where a person sets up an authenticator app (Setup's Multi-factor row said it).

**Status:** Part 1 (product) done; Part 2 (retirement checklist) waits for the shared checklist files.

## What already exists

Searched by every name the capability could have:
- names: `Setup`, `setup`, `AdminConsole`, `admin-console`, `AdminAccess`, `Settings`, `settings`, `organization profile`, `OrgRecord`, `client type`, `CLIENT_TYPE`, `industry-profile`, `useIndustryProfile`, `saveFailure`, `GatewayAccountsSetting`, `gateway-accounts`, `SessionPolicySetting`, `session-ttl`, `Session timeout`, `PdfARequirementSetting`, `requirePdfA`, `RetentionPeriodCard`, `legal-holds`, `LegalHoldsCard`, `Place legal hold`, `IdentityConsole`, `identity-console`, `validation-kit`, `GAMP`, `Summarize my org configuration`, `openAdminTab`, `admin-console.open-tab`;
- across: `client/src`, `shared`, `server`, `scripts/ci`, `tests`, `db/migrations`, `migrations`, `docs`, `.design`.

| Piece | Path | What it does | What it does not do |
|---|---|---|---|
| Setup (the source) | `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx` `Setup` (:161-562 at `66efa6179`), mounted as `setup` in `surfaceViews.ts:557` | Organisation name and client type under one reason (`PATCH /api/organizations/:id/profile`, `PATCH /api/mdx/industry-profile`); an MFA row and an SSO row that name where each is governed; mounts the gateway, session, PDF/A, retention, legal-hold and company-document cards; publishes `setup` context (name, client type, unsaved, reason entered). | A separate admin "app" screen. Its load-failure state offered no retry while its AnA context offered one. |
| Admin and access (the target) | `client/src/concept2cure/v2/surfaces/AdminAccess.tsx`, mounted as `admin-console` (`surfaceViews.ts:380`) since `af973c5e8` (2026-07-27) | Members, roles, SSO, API keys, skills and Settings tabs over `GET /api/mdx/admin`; Settings showed the record's rows and mounted `ClaudeConnectorSetting` and `CompanyDocumentSettings`; tab actions `admin-console.open-tab` / `filter-members`. | Settings said "As set now. Nothing on this tab changes them yet." It served a read-only "Session timeout" row (once a "Change setting" sentence to AnA, `a70d06c56`), and mounted none of Setup's governed cards. The SSO tab had no way to the Identity console. Its context published no configuration. |
| The settings facet | `server/routes/mdx-admin.ts:345-360` | Second factor at sign-in (policy), session timeout, single sign-on, branding, from `organizations.settings`. | The session timeout row duplicated what `SessionPolicySetting` reads (both use `idleWindowSecondsOf`). |
| Gateway accounts | `surfaces/GatewayAccountsSetting.tsx` (`723395ed4`, 2026-10-01) | Per gateway × environment: platform or own account, with password re-auth and a reason. Mounted by Setup and by onboarding (`Onboarding.tsx:1205`). | Not offered at Submit: `SubmissionSeqWorkspaces.tsx` `TransmitPanel` says "An administrator adds them under Gateway accounts" and offers no choice. |
| Session policy | `onboarding/SessionPolicySetting.tsx` (`8fbe834fb`, 2026-10-14) | Idle sign-out and concurrent sessions under a reason, through `PATCH /api/organizations/:id/settings`. Mounted by Setup, by onboarding's security step (`OnboardingSecurity.tsx`) and by the unmounted `AdminConsole`. | — |
| Require PDF/A | `surfaces/PdfARequirementSetting.tsx` (`4fdafc362`) | `settings.submission.requirePdfA` under a reason. Mounted by Setup only. | — |
| Retention period | `surfaces/RetentionPeriodCard.tsx` (`cd68fb658`) | `GET/PUT /api/vault/legal-holds/retention`; shorter than the default takes a governing rule and a reason. Mounted by Setup only, worded through Setup's `saveFailure`. | — |
| Legal holds | `surfaces/LegalHoldsCard.tsx` (`0f34e50cd`) | List, place (project or document version) and lift (GovernedConfirmDialog, typed word) over `/api/vault/legal-holds`. Mounted by Setup only. | Vault offers no "Place legal hold": no Vault surface calls the hold routes; `DocumentDisposition.tsx:178` shows only a count of holds. |
| Identity console | `surfaces/IdentityConsole.tsx` (`1b2b07594`), `identity-console` | SAML endpoints, SCIM tokens, IdP allowlist. Reached from Setup's SSO row, onboarding and the rail. | — |
| Company documents | `surfaces/CompanyDocumentSettings.tsx` | Mounted by Setup **and** admin-console Settings (two mounts already). | — |
| The unmounted admin console | `AdminSurfaces.tsx` `AdminConsole` (:1500, now :1040) | Grants, org (empty state), subscription, SSO, security, modules, API keys, audit and "Compliance & validation" with the GAMP 5 kit over `/api/validation-kit`. | **Reached by nothing** since `af973c5e8` (2026-07-27) replaced it with `AdminAccess` as `admin-console`. The GAMP 5 kit has had no reachable screen since. Not touched here. |
| Admin tab helper | `surfaces/HomeSetup.tsx` `openAdminTab` | Opens admin-console on a named tab through `admin-console.open-tab`. | — |
| Callers of `setup` | `ComplianceReports.tsx:149`, `OnboardingSecurity.tsx:64`, `navEntitlements.tsx:362` | `onNav('setup')`. | They keep working through the Part 2 alias (`ALIAS_APPLIES` opens the Settings tab). |

### Deletion history search (Rule 3 step 2; the working agreement)

- The clone is shallow: 1,283 commits back to `892739bb7` (2026-10-22). `git log --all --diff-filter=D --name-only`, filtered for `setting | admin | setup | profile | retention | hold | gateway | session | identity | validation`: **no deleted paths**.
- GitHub history (`gh api repos/concept2cure/ClinicalSageAI-2-replit/commits?path=…`): no commits for `surfaces/Setup.tsx`, `OrgSettings.tsx`, `AdminSettings.tsx`, `OrganizationProfile.tsx`, `OrganizationSettings.tsx`, `AdminConsole.tsx`, `AdminSettingsTab.tsx` or `AdminOrgSettings.tsx`, so neither new file name has a predecessor.
- `AdminSurfaces.tsx` was created in `a32a0067c` (2026-07-13); Setup's governed history in it: `f04feac2c` (client type under a reason, 2026-09-28), `cd68fb658`, `723395ed4`, `4fdafc362` (2026-10-01), `0f34e50cd` and `8fbe834fb` (2026-10-14), and the translation card's removal (settings/integrity audit, 2026-10-17, noted in the file).
- `af973c5e8` (2026-07-27) made `AdminAccess` the one product admin and unmounted `AdminConsole` without deleting it.
- This is the capability's first fold. No predecessor was deleted and rebuilt.

## Parity

| Function | From | Goes to | Status |
|---|---|---|---|
| Rename the organisation under a reason | `AdminSurfaces.tsx` Setup :200-226, :426-458 | `OrganizationProfileCard.tsx` (moved), the Profile card first on admin-console Settings (`AdminSettings.tsx` `OrganizationSettingsCards`) | **Reached** |
| Choose the client type | Setup :246-290, :459-501 | the same card, saved under the same reason | **Reached** |
| Open the Identity console | Setup :525-542 | `IdentityConsoleDoor` on the SSO tab, shown also when the SSO read failed | **Reached** |
| Choose the gateway account, and its status | `GatewayAccountsSetting.tsx` | mounted on Settings | **Reached** |
| …offered at Submit on the first transmit | — | not offered today; see "Not carried" | **Handed on** |
| Session timeout and concurrent sessions | `SessionPolicySetting.tsx` | mounted on Settings; the read-only row is no longer served (`mdx-admin.ts`) | **Reached** |
| Require PDF/A | `PdfARequirementSetting.tsx` | mounted on Settings | **Reached** |
| See and set the retention period | `RetentionPeriodCard.tsx` | mounted on Settings, worded by the moved `saveFailure` | **Reached** |
| List, place and lift legal holds | `LegalHoldsCard.tsx` | mounted on Settings | **Reached** |
| …"Place legal hold" also in Vault | — | Vault does not offer it; see "Not carried" | **Handed on** |
| Ask AnA to summarise the configuration | Setup :292-340, :374-379 | admin-console's context: `facts.configuration` (the Profile card's saved name, client type, unsaved, reason entered, last save note, or the read failure) and its summary sentence, **only while Settings shows it**; "Ask AnA to summarise this configuration" in the tab head | **Reached** |
| Multi-factor row (not in the map) | Setup :502-524 | the second-factor row's description, served by `mdx-admin.ts` | **Reached** |
| GAMP 5 validation kit | `AdminSurfaces.tsx` `AdminConsole` :1393-1470, :1837-1880 | — | **Not real today; not carried** |

**Carried, each restated as a test against where it now lives:**
- the token's org claim addresses every governed URL, never a stale `currentOrganizationId` (`adminSettingsGoverned.test.tsx`);
- nothing is sent until something changed, and nothing without a reason of 3 or more characters;
- a refused section stays dirty and only it is re-sent; an unreachable server reads as unreachable;
- a failed record read leaves every field read-only;
- the client type is pending until saved, saved with the reason, named in words (`adminSettingsClientTypeGoverned.test.tsx`);
- no translation-workspace card and no switch for anything enforced elsewhere;
- the retention period's honest states (`adminSettingsRetentionPeriod.test.tsx`);
- the second factor's wording (`mdx-admin-facets.test.ts`) and its row on Settings (`adminSetupMfaCopy.test.tsx`).

**Tightened:**
- the Profile card's failed read offers Try again (Setup's context offered a retry its screen did not have);
- AnA is never handed the configuration on another tab, not even for the render between the tab switch and the card's unmount (`withConfiguration`; mutation M9);
- the other cards' values are named in the summary as on screen and not published, so AnA does not describe them from nothing.

## The deletion rule

Part 1 deletes no user-facing capability. Setup stays mounted until Part 2: it now mounts the same `OrganizationSettingsCards` and publishes the Profile card's context under `setup`, so there is one implementation with two mounts until the alias lands.

Moved, with their cases:
- `adminSetupGoverned.test.tsx` → `adminSettingsGoverned.test.tsx` (renders `OrganizationSettingsCards`);
- `adminSetupClientTypeGoverned.test.tsx` → `adminSettingsClientTypeGoverned.test.tsx` (renders `OrganizationProfileCard`);
- `adminSetupRetentionPeriod.test.tsx` → `adminSettingsRetentionPeriod.test.tsx`;
- `adminSetupMfaCopy.test.tsx` keeps its name; it now tests the second-factor row on admin-console Settings.

Part 2 deletes `Setup`. Its replacement by path is `client/src/concept2cure/v2/surfaces/AdminSettings.tsx`, mounted by `AdminAccess.tsx` on the Settings tab; the proof of reach is `adminConsoleSettings.test.tsx` now and the fold guard in Part 2.

## Red, green, mutations

- **`red.txt`:** `adminConsoleSettings.test.tsx` **11/11 failed** before the change; the 2 new server cases failed (13 existing passed).
- **`green.txt`:** 51 suites (everything that renders AdminAccess, AdminSurfaces, a moved card or HomeSetup, names `setup` or `identity-console`, and the server facet test), **471/471**; the six fold suites **51/51**.
- **`mutations.txt`:** **21/21 killed**: each card unmounted (6), the door missing or misdirected (2), configuration published on any tab or not at all (2), the reason dropped from the check, the rename or the client type (3), unsaved state hidden, a failed read published as a profile, an unreachable server worded as a refusal, the old "Nothing on this tab" copy, Ask AnA inert, the session row served again, the enrolment pointer dropped, the row description dropped. Each reversed by replacement and md5-checked.

## Gates (Part 1)

`gates.txt`, on `984913ea5` + this change, all green: ci:launch-scope-api (547 paths, none refused), ci:ana-surface-context, ci:undefined-css-classes, ci:surface-discoverability, ci:launch-scope, check:microcopy, ci:unreferenced-modules (73 = baseline).

`eslint.txt`: 0 errors; net warnings over the fold's files HEAD 14 → 14. Scoped `tsc` over 21 changed files: 0 errors in them (the 8 reported elsewhere are ambient declarations a scoped program does not load, in untouched files).

File sizes: `AdminSurfaces.tsx` 2,340 → 1,880 lines; `AdminAccess.tsx` 776 → 774; `OrganizationProfileCard.tsx` 389 and `AdminSettings.tsx` 150 (new).

## Not carried, and found

- **GAMP 5 validation kit.** It lives only in `AdminConsole`, which nothing has mounted since `af973c5e8` (2026-07-27). The placement map calls it "Not real today". It is not carried. Whether to reach it (a card on Settings over `/api/validation-kit`) or delete `AdminConsole` (about 840 lines, with no reachable replacement for the kit) is a decision for the founder; this fold changes neither.
- **The gateway account at Submit, on the first transmit.** Submit's `TransmitPanel` (`SubmissionSeqWorkspaces.tsx`) says when a gateway has no credentials and that an administrator adds them under Gateway accounts. It does not offer the choice. `GatewayAccountsSetting` does not fit there: it lists every gateway and environment, its PUT is owner or administrator only (a transmitter who is neither would be offered Change… buttons the server refuses), and the host file is 2,403 lines. Handed on.
- **"Place legal hold" in Vault.** Vault does not offer it. `LegalHoldsCard`'s `PlaceHoldForm` asks for a project and then a document; reaching it from Vault's document pane needs that project and document preset, and `Vault.tsx` is 2,620 lines. Handed on.
- **The AnA summary covers the Profile card only**, as Setup's did. The other cards' values are on screen and are not published; the summary says so.
- **Found:** the Settings tab's "Org branding" row shows the organisation's name a second time, beside the Profile card. It is served by `mdx-admin.ts` and is not part of this fold.
- **Found:** `SessionPolicySetting`'s "Reopen setup" message now says "Reopen this page", since the card is on admin-console and in onboarding.

## Part 2 (pending "checklist go")

Delete `Setup` from `AdminSurfaces.tsx`; alias `setup` → `admin-console` with `ALIAS_APPLIES` `admin-console.open-tab { tab: 'settings' }`; remove `setup` from `surfaceViews.ts`, `ui-surface-registry.ts` (its `apiPrefixes` move onto admin-console's entry in `ui-surface-registry.ui-v2.ts`), `NAV_GROUP_OF`, `LAUNCH_SHELL_SURFACES` (guard in `launch-scope.test.ts`), `check-surface-discoverability.mjs`; `ID_BASELINE` minus one; tours; the catalogue if it has a row; `REAL.components`, `dump-v2-surfaces.spec.tsx`, `NO_PROJECT_DOOR` where listed; a fold guard `foldSetup.test.ts`, red first.
