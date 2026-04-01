# Beta Allowlist (RC Candidate 01)

Generated: 2026-04-01

## Classification key
- **Primary beta path**
- **Secondary deep-link only**
- **Compatibility fence**
- **Hidden/internal**
- **Blocked from demo**

## Route/surface allowlist

| Surface | Class | Notes |
|---|---|---|
| `/` | Primary beta path | Entry resolves toward Concept2Cure shell flow. |
| `/concept2cure/login` | Primary beta path | Canonical authentication entry. |
| `/concept2cure` | Primary beta path | Canonical shell landing after login. |
| `/concept2cure/project/:projectId` | Primary beta path | Primary project work context. |
| `/concept2cure/project/:projectId/:rest*` | Primary beta path | Governed project-context module routing. |
| `/sign-in`, `/auth`, `/login` | Compatibility fence | Redirect aliases to `/concept2cure/login`. |
| `/client-portal` and `/client-portal/:rest*` | Compatibility fence | Redirect fence to `/concept2cure` for beta-safe path integrity. |
| `/concept2cure/legal/*` | Secondary deep-link only | Reachable, but not core founder demo path. |
| `/concept2cure/billing` | Secondary deep-link only | Not needed for core workflow proof. |
| `/concept2cure/demo` | Hidden/internal | Internal demo aid; not primary human beta route. |
| Legacy CMC / alternate AI surfaces | Blocked from demo | Not on canonical beta-safe navigation truth. |

## Beta CTA policy
- No primary beta CTA may land in `/client-portal/*`.
- No primary beta CTA may require legacy deep links to complete the governed workflow.
- If a CTA cannot guarantee project context, it is demoted to secondary or blocked.
