# External Testing Mode Proof

## Feature behavior
- Founder/Admin-only toggle added in shell UI (`External testing: ON/OFF`).
- Mode persisted in localStorage key: `concept2cure_external_testing_mode`.
- When ON, route policy evaluation enforces allowlist/denylist containment.
- Founder visibility panel shows:
  - current route
  - decision status (`allowed`, `redirected`, `hidden`)
  - reason text

## Launch-safe path containment
- Redirects non-approved routes to deterministic fallback.
- Hides known internal path families.

- Route policy behavior is now covered by unit tests in `client/src/concept2cure/router/__tests__/approvedRoutePolicy.test.ts`.

- Founder panel now includes **Capture issue** (copies route/status/reason snapshot) and **Reset route** (returns to known-good project route).
