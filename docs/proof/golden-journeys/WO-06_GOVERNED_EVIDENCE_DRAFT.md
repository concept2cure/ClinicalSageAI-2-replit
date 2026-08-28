# WO-06 — Fixture-free governed evidence draft

## Selected commercial journey

**Buyer:** a regulatory affairs author at a sponsor. **Job:** turn identified source evidence into a
traceable, human-reviewed draft artifact. **Outcome:** a persisted draft export that is explicitly
not agency-validated. Agency dispatch and autonomous submission are excluded.

This path was selected because the canonical Concept2Cure project and artifact routes already share
tenant resolution, authorization, audit logging, version persistence, provenance emission, lifecycle
transitions, and governed exporters. The IND route-level golden journey has deeper signature coverage
but no completed browser layer; submission-package journeys introduce unnecessary compile/release
surface and risk implying agency readiness.

## Route, component, API, and persistence map

| Step                          | Browser/component             | API                                          | Canonical persistence                                      |
| ----------------------------- | ----------------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| Authenticate                  | `/concept2cure/login`         | canonical login flow                         | `users`, `organization_users`, session/token store         |
| Create project                | authenticated browser context | `POST /api/concept2cure/projects`            | `projects`                                                 |
| Reject invalid evidence draft | browser fetch                 | `POST .../artifacts`                         | none (fails closed)                                        |
| Add labeled source evidence   | browser fetch                 | `POST .../artifacts` (`category=evidence`)   | `concept2cure_artifacts`, `concept2cure_artifact_versions` |
| Reject missing evidence link  | browser fetch                 | `POST .../artifacts` with unknown source ID  | none (fails closed)                                        |
| Create sourced draft          | browser fetch                 | `POST .../artifacts` with source artifact ID | artifact/version rows plus `data_lineage_records`          |
| Inspect provenance            | browser fetch                 | `GET .../artifacts/:id/provenance`           | `concept2cure_provenance_events`                           |
| Request review                | author browser context        | status transition to `review`                | artifact status                                            |
| Assign reviewer               | reviewer browser context      | `POST .../reviewers` (role matrix permits admin/approver/reviewer — not the author) | `concept2cure_review_assignments`                          |
| Reject unreviewed export      | author browser context        | `GET /api/artifacts-center/:id/export`       | none (fails closed)                                        |
| Record human decision         | separate reviewer browser     | `POST .../reviews/submit`                    | `concept2cure_review_decisions`, audit, provenance         |
| Export reviewed draft         | author browser context        | `GET /api/artifacts-center/:id/export`       | downloaded DOCX; governance headers                        |
| Reload proof                  | browser reload + fetch        | `GET .../artifacts`                          | same persisted project/artifact rows                       |

## Fixture and fallback inventory

The superseded `governed-lifecycle.e2e.spec.ts` is not proof for this journey: it chooses the first
project in the database, falls back to project `1`, uses a default `dev-api-key`, conditionally skips
assertions, and accepts multiple success/error statuses. `authoring.e2e.spec.ts` is only a smoke test
and depends on an already-openable document. `tests/e2e/seed-data.json` is generated synthetic setup
state, not customer data, and is not read by this journey.

The WO-06 test creates its project and artifact through authenticated live APIs. Its deterministic
credentials and all created records use `Synthetic` labels. There is no project/artifact fixture
fallback and every expected status is exact. Production does not invoke or depend on the seed path.

## Data lineage

| Displayed/verified field     | Source                           | Transformation                                    | Persistence/read location                                               |
| ---------------------------- | -------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| Project name and description | browser test input               | server sanitization                               | `projects.name`, `projects.description`                                 |
| Submission type/product      | browser test input               | project metadata mapping                          | `projects.metadata`                                                     |
| Draft title/content          | browser test input               | sanitization + SHA-256 hash                       | `concept2cure_artifacts`; version 1 in `concept2cure_artifact_versions` |
| Source evidence              | visibly labeled synthetic input  | sanitization + SHA-256 hash                       | evidence-category artifact and immutable version                        |
| Source reference             | persisted evidence artifact ID   | tenant/project validation and lineage write       | draft metadata, creation provenance, and `data_lineage_records`         |
| Version                      | artifact creation service        | initial version `1`                               | artifact and artifact-version rows                                      |
| Review state/reason          | authenticated human action       | lifecycle validation + audit emission             | artifact status and audit/provenance stores                             |
| Reviewer assignment/decision | separate authenticated reviewer  | separation-of-duties and current-version checks   | review assignment, decision, audit, and provenance tables               |
| Export authorization         | persisted current-version review | server-side lookup; caller cannot assert approval | artifact-center export gate and governance headers                      |
| Draft disclaimer             | server-owned constant            | prepended by DOCX/PDF/PPTX exporters              | exported bytes                                                          |

## Honest states and evidence

The browser test exercises usable validation failures (empty content and a nonexistent source-evidence
link) and the meaningful governance failure (export before a persisted decision). It uses separate author and reviewer browser sessions,
inspects provenance before export, records a formal current-version approval, reloads the browser, and
verifies the same artifact and review state. Export authorization is derived from persisted state rather
than a caller-supplied `humanReviewApproved` boolean.
Playwright opens the live Artifacts Center after reload and, before export, requires the persisted draft
row plus its `1 cited source · Human review recorded` governance label to be visible. It then attaches
`golden-journey-after-review.png` plus `golden-journey-browser-evidence.json`. Traces and failure
screenshots use the repository Playwright configuration.

Run from a fresh migrated database:

```bash
DATABASE_URL=... node tests/e2e/seed-governed-workflow.cjs
# EXPORT_REVIEW_GATE=enforce must be set on the SERVER process (the
# artifacts-center gate reads it server-side); setting it on the Playwright
# process does nothing and the pre-review export-denial step would see the
# gate off in dev.
EXPORT_REVIEW_GATE=enforce npm run dev   # (server terminal)
BASE_URL=http://localhost:5000 npx playwright test tests/e2e/golden-customer-journey.e2e.ts --project=chromium
```

## Explicitly out of scope

- Agency dispatch, gateway transmission, acknowledgement, or autonomous submission.
- Submission-package compilation, eCTD validation, release candidates, and agency acceptance claims.
- AI provider generation and provider-denied UI; this narrow journey is deliberately human-authored.
- Remediation of fixture/fallback behavior on unrelated routes and legacy smoke tests.
- Treating synthetic seed evidence as real scientific or regulatory evidence.
