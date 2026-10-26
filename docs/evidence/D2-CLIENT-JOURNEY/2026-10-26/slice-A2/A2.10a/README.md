# A2.10a — filing catalogue folded into the core project workflow

Launch row D2. Work stays on `concept2cure-v2`. Discovery started at `a0d4ada6`;
initial implementation was qualified on `c89a7895`; final integration includes
`f033cc72` (the connected Account and reconciled creator-retirement work).

## What already exists

- `shared/regulatory/filing-catalog.ts` is the canonical filing taxonomy. The
  former `FilingsCatalog.tsx` and `fixtures/filings-catalog-data.ts` already
  provided descriptions, segment/category browse, search, authority/format/CTD
  facts, shared Ask wording and nine authored lifecycle guides. Their old Start
  lost the selected filing. These capabilities were carried, not recreated as a
  new app or service. Deleted-history searches over the filing surface/fixture
  and shared filing paths returned no prior deletion commits.
- `surfaces/AnaVerbs.tsx` `RegistryPicker` and `surfaces/Projects.tsx` already
  own the canonical New project wizard, server-derived market/build offers,
  refuse/retry states, exact filing selection and guarded project creation.
  This work extends those controls. It does not widen the supported market.
- `ProjectHome.tsx`/`ProjectPlan.tsx` already own the accessible project's real
  plan, team and tasks. The existing project serializer hides private metadata;
  it now exposes only a verified exact `submission_type_id` from the recorded
  metadata selection. GET detail and POST's `program` use that serializer;
  POST's portfolio `data` retains its existing shape.
- `registryModel.ts`, `routing.ts`, `V2App.tsx` and the shared surface registries
  already own aliases, the validated `projects.new-project` action, scope and
  canonical URL/history. The old catalogue is folded using this existing bus.
- Catalogue migrations already retire IDs absent from the live keep-list by
  merging `deprecated: true` into metadata. They preserve rows and subscriptions.
  Their replayed creating definitions were amended in place, with dated notes;
  no new DROP, table or production dependency was added.
- Existing formal Projects requirements and OQ-PROJ-12 cited the old catalogue.
  They were reconciled; historical execution remains historical. New
  URS-PROJ-007a and revised ad-hoc OQ-PROJ-12 are unexecuted and unsigned.

## Result and parity

The old `/concept2cure/filings-catalog` bookmark opens the canonical Projects
wizard once, preserving query/hash and leaving project scope intact. The old
surface, lazy view, client module entry, deferred identity and catalogue seed
are retired. Existing catalogue rows, unrelated metadata and subscriptions
survive two full catalogue replays, including a cascading subscription FK.

The existing picker now carries category explanations, workflow-label search,
segment labels on search results, selected authority/region, submission format,
CTD structure, description, authored stages/timing/return loop and the shared
Ask AnA question. Unoffered entries remain readable reference with the server's
refusal; they have no create/select affordance. The selected filing remains
selected through the existing wizard and is recorded by the existing writer.
Missing fields say they are not recorded. Pending/failed offer reads fail closed.

All nine original guide tables and workflow labels were relocated verbatim to
`shared/regulatory/filing-lifecycle-reference.ts`. Intake and Plan use this one
owner. A guide is labelled **authored filing-family guidance**, collapsed by
default and described as timing examples. It is not a calculated deadline,
readiness/eligibility verdict, live progress display or platform offer.

Selection requires an exact active catalogue ID, never generic `IND` or a legacy
alias. Plan additionally requires the saved program type and agency to agree
with an explicit admission. Missing/disputed identity withholds the guide while
keeping the real plan/team/tasks reachable. Coarse mappings that would attach
US clinical/device clocks to other jurisdictions, or Notified Body certification
to unnotified Class I/A, are intentionally withheld. Some known intake families
have no reliable modeled project type and therefore receive no Plan admission.
The public AnA context follows current browse/selection and clears on close or
actor/tenant change; private configure fields are not added.

The full function mapping and bounded exclusions are in
[the parity record](../../../../../../.design/client-journey/A2_10_FILING_CATALOG_PARITY.md).
Only this remaining fold is complete. Mission control, CRO portfolio, device
portfolio and program journey retain recorded-data or reachable-function gaps;
they remain until their replacement and store/tenant prerequisites are proven.
Shared review/approval, quality, reporting and administration/audit remain
central service owners alongside the services named by the founder.

## Red/green evidence before final integration

Logs here are compressed and retain their actual execution scope. Earlier runs
are not represented as runs on the later shared-branch tree.

| Check | Recorded result |
| --- | --- |
| Exact safe project projection | 23 red failures, then 59/59 including canonical create-anchor coverage |
| Lifecycle admission | 25 intended coarse-mapping/guard failures plus one test key-sort error; corrected specification green |
| Shared reference owner | 87/87 across three suites; prose/declaration parity recorded separately |
| Picker carry | Three intended reds (after waiting for the offer read); all carry tests green |
| Plan and AnA context | 11 intended reds / four pass, then 42/42 across three suites |
| Alias and catalogue retirement | Six metadata reds / 11 pass, then 123/123 across six suites; actual shell cases also pass |
| Core fold | 128/128 across seven suites after disambiguating refused-guide accessible names |
| Targeted regression on `c89a7895` | 381/381 across 25 suites |
| Native browser on `c89a7895` | One test passed in 15.5s (14.4s test), desktop 1440 and mobile 390 |
| Production build on `c89a7895` | Passed in 25.43s; client/server and audit verifier |

The first browser-test attempt mistakenly inspected POST's portfolio `data`
instead of the existing detail `program`. The test was corrected; no API shape
was broadened to accommodate it. The formal helper uses the same detail field.

Initial desktop screenshots and `filing-core-result.json` show the canonical
alias, visible reference, exact created/read identity, reload-preserved Plan,
no document-wide mobile overflow and shared Ask prefill with zero model
requests or project writes. `pre-account-source-sha256.json` identifies that
source snapshot. The initial mobile capture had navigation open; the final
`accepted/` capture closes that drawer and visibly shows the guide. It is local
synthetic development-auth evidence, not production
authentication or formal OQ/release certification.

## Final integrated verification

On the integrated `f033cc72` base, 460/460 tests passed across 29 suites
(63.67s), including incoming Account ownership/switcher/reporting and the single
creator-owner guard. The final browser check passed (27.5s test, 28.9s total),
including an unobstructed 390px Plan capture and reload. The production build
passed (Vite 21.99s plus server and audit verifier). Scoped ESLint reported zero
errors and 18 existing warnings in four existing large functions/files; the
new shared component, tests and formal helper have none. The source-text ramp,
113-publisher context and validation traceability checks pass. The full TypeScript
program passes with zero errors against the existing zero-error baseline.

Final logs and source hashes are recorded in `accepted/` and
`verification-summary.json`. Required publication checks are recorded there too. The browser
uses a fresh provisioned PostgreSQL database, `app_service` runtime role,
`RLS_ENFORCE=on`, audit enabled and no model provider. Only safe screenshots and
result JSON are retained; auth/runtime logs and credentials are excluded.

Formal validation remains limited: 117 requirements, 69 historical passes,
two partial and 46 uncovered using the explicitly selected historical evidence.
URS-PROJ-007a has no executed steps. Updating a runner or traceability citation
is not an executed or signed protocol and does not establish release readiness.

The first normal publication attempt stopped on an undefined, redundant
`rpk-chip-segment` class. It was removed; the existing styled `rpk-chip` remains.
The removed name had no stylesheet rule or consumer, so rendered styling and
behavior are unchanged. `accepted/source-sha256.json` identifies the tested
pre-cleanup snapshot; final publication hashes and the repeated picker/CSS
checks identify this narrow follow-up. No gate or baseline was bypassed.
