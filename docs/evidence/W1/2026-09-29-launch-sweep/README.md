# W1 — every launch surface after 121 upstream commits: 37 clean, 2 expected refusals (2026-09-29)

**Row:** D2 (the launch surfaces as a user meets them). **Head:** `2a2a25ba5`.

**Why:** 121 upstream commits landed on `concept2cure-v2` between the
2026-09-28 populated sweep (`../2026-09-28-populated/`) and this morning. This
re-checks, first-hand, that nothing a client opens broke.

## How

Headless Chromium on the running app, signed in as the demo organization's
admin (the organization seeded with the C2C-101 IND, two signers, two effective
SOPs). It visits every id in `LAUNCH_SURFACE_IDS` (39) and waits 7 seconds on
each. For each surface it records:

- every API response that was not 2xx/3xx;
- every JavaScript exception;
- any `role="alert"`;
- the error phrases the sweeps have used ("couldn't load", "didn't respond",
  "something went wrong", "failed to load", "unexpected error", "not found").

The full record is [`sweep.json`](sweep.json), with a screenshot of ten of the
surfaces in `shots/`.

## Result

| Surfaces | API failures | Exceptions | Error text or alerts |
|---|---|---|---|
| 37 | 0 | 0 | 0 |
| `master-licensing` | 403 `/api/admin/master/licensing` | 0 | "Master Administration access is restricted to platform administrators." |
| `identity-console` | 403 `/api/admin/scim-*` | 0 | 0 (the console says a platform administrator is required) |

Both refusals are correct for an organization admin who is not platform staff:

- **Master licensing** is platform-only. As of `d57bff619`, the account menu does
  not offer it to a customer admin; this was a deep link.
- **Organization-admin SCIM** is the founder decision #19, recorded in
  `../2026-09-23-surface-truth/README.md`.
