# Do-Not-Demo List (RC Candidate 01)

Generated: 2026-04-01

Be explicit: the items below are out of bounds for founder partner demos and external human beta sessions.

| Route / module / flow | Why not | Use instead | Status |
|---|---|---|---|
| `/client-portal/*` deep links | Beta shell truth requires Concept2Cure-first path; portal deep links create routing ambiguity | `/concept2cure` then open project | Not beta-safe |
| Legacy CMC standalone paths | Not primary governed beta narrative; can misrepresent current RC priorities | Project-context governed workspace path | Out-of-scope for beta-safe storyline |
| Any blank-state-only workspace route without seeded project | Fails RC proof requirement for deterministic project context | Seeded RC projects from seed catalog | Incomplete as demo evidence |
| Broad legacy route museum surfaces in `App.jsx` | Exist for compatibility but not curated for human beta | Canonical allowlist surfaces only | Ambiguous |
| Non-governed AI entry points outside AnA project flow | Risks bypassing governed artifact lifecycle expectations | AnA in project context (`/concept2cure/project/:projectId`) | Not beta-safe |
