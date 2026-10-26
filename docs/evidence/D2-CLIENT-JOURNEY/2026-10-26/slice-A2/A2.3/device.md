# Shared pathways and device readiness

## What already exists

`shared/constants/mdx.ts` holds the pathway aliases and labels; the MDX adapter
already consumes it. `Overview.tsx` duplicates labels and offers only three
specific pathway chips. The adapter drops IDE and regional device filing rows.
`product-types.ts` supplies the canonical workstream classifier and SQL generator.

`useMdxPrograms.ts` turns the stored creation/stale progress column into readiness.
The Overview averages and draws that value. Validation separately labels the same
adapter field as recorded progress. `regulatory-programs.service.ts` serializes
missing progress as zero. The deployment MDX health probe has another alias map
and excludes programs with a null regulatory path. These implementations are
extended and converged here, rather than duplicated.

Searches covered pathway/ProgramPathway/RegulatoryPathway, readiness and progress
consumers across client/server/shared, and the deleted-path inventory recorded
by the parent slice. No surface or user capability is retired.

## Result

- The canonical alias map now classifies IDE, generic device, HDE, Canada and
  Japan device application types, plus Other. `pathwayForProgram` and
  `pathwaySqlCase` share aliases and exact-filing precedence. The SQL uses simple
  CASE expressions so normalization is evaluated per axis rather than per alias.
  Existing CER/IVDR identity still wins over a separately recorded US route.
- `ProgramPathway` aliases the shared union. The device adapter keeps previously
  dropped device rows and unknown device-family rows, while excluding medicinal
  filings. Overview filters and labels the full vocabulary, in grid and list.
- Device readiness is null until an assessment supplies it. Overview says
  **Not recorded**, omits its bar, and excludes missing figures from its mean.
  The API preserves missing raw progress as null. Raw recorded progress is
  carried separately to the existing validation view, so a real recorded value
  remains available without becoming a readiness assessment. That consumer also
  handles absent progress as Not recorded, with no bar.
- The deployment health probe uses the shared classifier over grouped program
  type/path/product class, including null paths and unknown device rows. It
  excludes medicinal projects. This remains a deployment-wide operator probe,
  separate from the access-scoped Projects counts.

These codes classify portfolio rows; they do not admit new authoring features or
change commercial entitlements. Existing pathway workspaces and project-home
navigation remain the destinations. The separate AnA draft-list route's
organization-level section linkage is not widened by this slice.

## Verification

| Check | Result | Artifact |
| --- | --- | --- |
| New JS/SQL parity and Overview checks against previous behavior | 29 failed | `device-red.txt.gz` |
| Restore the old progress/readiness defaults for targeted checks, then restore the fix | 3 failed, 22 skipped | `device-readiness-red.txt.gz` |
| Deployment health's previous alias map | 1 failed, 3 skipped | `device-health-red.txt.gz` |
| Final taxonomy, adapter, Overview, validation, services and existing API route checks | 11 suites, 203 passed | `device-final.txt.gz` |
| Actual device host/pathway consumers, including CER/IVDR routing regressions | 12 suites, 83 passed | `device-consumers.txt.gz` |
| Affected non-ignored files lint | 0 errors; 5 existing service warnings | `device-lint.txt.gz` |

The two green runs overlap and their counts must not be added. The final run is:

```
shared/constants/domain/__tests__/pathways.test.ts
shared/constants/domain/__tests__/product-types.test.ts
client/src/concept2cure/mdx/surfaces/__tests__/Overview.pathwayReadiness.test.tsx
client/src/concept2cure/mdx/hooks/__tests__/useMdxPrograms.productType.test.ts
client/src/concept2cure/mdx/hooks/__tests__/mdxPathwayIdentity.test.ts
client/src/concept2cure/mdx/workbench/__tests__/ValidationSurface.whatItReads.test.tsx
server/services/__tests__/regulatory-programs-progress.test.ts
server/services/__tests__/mdx-health-honest-probe.test.ts
server/services/__tests__/mdx-health.release.test.ts
tests/mdx-beta-surfaces-routes.test.ts
tests/regulatory-programs-routes.test.ts
```

SQL/JS parity executes generated SQL in PGlite, including casing, aliases,
conflicting evaluation routes, nulls, unknowns and object-prototype names. A
coverage assertion includes every admitted regional device application from the
filing catalog. Service and route unit tests replace their database boundary;
none of these checks proves native RLS. Browser/build/full gates are recorded in
the parent slice evidence. The repository deliberately ignores MDX files in its
ESLint configuration; lint results above do not claim those files were checked.

## Independent backend review

Read-only review of `project-portfolio.ts`, the Projects route diff, current
verified-anchor capture and final revalidation, UI facet consumption and new
backend tests found no blockers. Page/count queries share accepted anchor/client
joins and current tenant/archive/delete predicates. Filters bind before paging,
count failures after a page fail the read, page readiness remains bounded, and
the final access check covers the additional count read.
