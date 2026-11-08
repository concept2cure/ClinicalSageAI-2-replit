# S2: the Data Room says a refusal as itself, never as a failed read

**Spine step 2, the data room.** `Plan: S2`. Session `session_01QoxbLcnW5jPvJSjjKQtvTA`, 2026-11-05.

> The founder, 2026-11-05: "A feature can be not licensed, not relevant to this project, blocked by missing
> evidence, or unavailable to this user. Those are different conditions and should not be collapsed into a generic
> failure."

## The defect

The project's Data Room (`client/src/concept2cure/v2/editor/DataRoomSourcesPanel.tsx`) answered every unsuccessful
sources read the same way: "The data room could not be read", with **Try again**. That covered:

- a plan without the feature (`MODULE_NOT_LICENSED`);
- a part not in this release (`LAUNCH_SCOPE`);
- a role that cannot read it;
- an organization that could not be confirmed;
- a project not in this organization;
- an expired session.

So a licensing answer read as a fault, and offered a retry that could not change it. The Vault had the same defect
until `3c84ddc6ac`.

## What already exists (RULE 3)

| Piece | Path | Role |
|---|---|---|
| The one read classifier | `client/src/concept2cure/mdx/hooks/useFetchJson.ts`: `readFailureFor`, `describeReadFailure` | Tells the refusals apart by status and the server's code, with one set of words. |
| The read's status and code | `client/src/concept2cure/v2/dataConnect.tsx` (`DataState.status`, `.code`; `failureFrom`) | Already carried to the panel; the panel ignored them. |
| The gate's bodies | `server/middleware/moduleEntitlementGate.ts` (`MODULE_NOT_LICENSED`, and the `LAUNCH_SCOPE` envelope) | What the server sends. |
| The same fix on the Vault | `client/src/concept2cure/v2/surfaces/Vault.tsx` (`vaultReadFailure`), `3c84ddc6ac` | The pattern followed here. |

## The change

`dataRoomReadFailure` classifies the read through `readFailureFor` and words it through `describeReadFailure`:

- each refusal is said as itself, with no retry;
- an expired session says so, with no retry;
- only a failure to answer offers **Try again**: a 5xx, no response at all, or a page whose metadata could not be
  confirmed.

Behaviour only: no layout, no class, no new component (D4 owns the editor's layout).

Three other suites around this panel were red on trunk. Each asserted the data layer's read without its abort
signal. They now assert `undefined, undefined, expect.any(AbortSignal)`, as the Vault suites do. One case in
`dataRoomSourceReads.test.tsx` had the same cause.

## Evidence

- `01-red.txt`: the new cases before the change. All six refusals fail; the three genuine failures already pass.
- `02-green.txt`: the four Data Room editor suites after it, 61 of 61. Trunk had 3 failing.
- **The running app** (`walk.cjs`, `walk.json`, `screenshots/`):
  - one dev-login, a project made through the API, a conversation file adopted into its Data Room;
  - then the project page's Evidence step, Project files, Data room, at 1440 and 390 wide;
  - the sources read answered by the server: the source is listed;
  - then answered with the gate's own 403 bodies, injected at the browser, because the dev account is a platform
    admin the gate lets through:
    - "Not enabled for your organization … so the data room was not read", with no retry;
    - "Not in this release …", with no retry;
  - and a 500: "The data room could not be read", with **Try again**.

## Found, for others

- **D0 (design system).** A refusal is drawn in the same red error tone as a failure, here and in the Vault. Whether
  a refusal should be drawn more quietly is a D0 question. Both screens use the same tone today, so they agree.
- **D3 (the project page).** The Evidence step shows a "What to do now:" guidance box with "Next step". That is a
  retired pattern (`ONE_DESIGN_PLAN.md` §2), visible in `screenshots/1440-normal.png`.
- **D4 (the editor).** The other catalog reader, `client/src/concept2cure/v2/editor/useProjectSourceCatalog.ts`,
  words every failure from the server's message and does not classify refusals. It is in D4's paths, not S2's, so it
  is not changed here.
