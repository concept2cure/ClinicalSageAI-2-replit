# Approved Route Policy Proof

## Canonical policy
Implemented in `client/src/concept2cure/router/approvedRoutePolicy.ts` and consumed by `ZenApp.tsx` via a canonical `ROUTE_POLICY_TABLE` + evaluator.

## Route table
| Path Pattern | Decision | Rationale |
|---|---|---|
| `/concept2cure` | allowed | base app entry is test-safe |
| `/concept2cure/projects` | allowed | core project selection path |
| `/concept2cure/project/:id/510k` | allowed | primary external testing module |
| `/concept2cure/project/:id/pma` | allowed | primary external testing module |
| `/concept2cure/project/:id/cer` | allowed | primary external testing module |
| `/concept2cure/project/:id/<other>` | redirected | not in approved external module set |
| `/concept2cure/admin/*` | hidden | internal-only surface |
| `/concept2cure/internal/*` | hidden | internal-only surface |
| non-allowlisted route | redirected | outside launch-safe external surface |

## Determinism
- In external testing mode, all non-allowlisted paths are redirected to a stable fallback.
- Founder route panel displays route, disposition, and reason.


- Founder debug panel now surfaces `ruleId` for each decision, making redirects/allowances traceable to a specific policy row.
