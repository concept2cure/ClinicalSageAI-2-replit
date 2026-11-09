# MDX M20: the PMA trial cards read only the project's linked study, and name what they count

From `.design/client-journey/MDX_JOURNEY_2026-11-01.md`, recorded on the PMA walk (slice 5b,
`../2026-11-02-slice-5b-pma-ivdr-walked/`). Plan: F1, a repair of shipped behaviour: no screen, mount or table.

## The defects

`getPmaTrialMetrics` (`server/services/regulatory-programs.service.ts`) feeds the PMA screen's four trial cards.

1. **A study was bound by its name.** With no link on the project, it took the organization's most recently updated
   `clinical_ops.studies` row whose name, indication or therapeutic area contained the product name. The cards did not
   say which study they had bound. So another product's enrolment could read as this project's. In the red run, the
   project "Corvant valve" was bound to "Corvant valve II pivotal", another product's study
   (`red/trial-metrics-before.txt`).
2. **"AE rate" counted protocol deviations.** The card divided the serious and critical rows of
   `clinical_ops.deviations` by the enrolled count, and coloured the result red above 5% and amber above 2%.
   `clinical_ops` records no adverse events: it is the risk-based-monitoring store (sites, visits, deviations,
   endpoint results).

## What already exists (RULE 3)

- **The link.** `program.metadata.clinicalStudyId`, written by AnA's `link_program_clinical_study`
  (`server/services/ana/mutation-surface-tool-defs.ts`, handler in `AnaToolExecutor.ts`). The function already read it
  first. The tool's own description warned that without it "the endpoint falls back to a fuzzy product-name match that
  can pick up the wrong study in orgs running multiple trials". `clinical_ops.studies` has no project column, so the
  link is the only binding there is.
- **The device journey's own study records**, `clinical_studies` (program-linked; `server/routes/mdx-clinical-studies.ts`),
  behind the Plan door "Record the clinical studies behind this filing". They hold planned and enrolled sizes and
  whether the primary endpoint was met, but no sites or deviations. Converging the cards onto them would drop two
  cards. That is a design question for founder question 1, so it is not done here.
- **The milestones repair** in the same service, which made a program's milestones its own
  (`server/services/__tests__/program-milestones-own-records.pglite.test.ts`).

## The change

- With no link, every card reads "No study linked to this project", and `study` is null.
- With a link to a study that is not there, it reads "The linked study was not found". That covers a deleted study,
  another organization's study, or a value that is not a study id. A malformed id is never sent to the database.
- The Enrolled card names the study it read: "50% of target · CV-01 pivotal IDE".
- "AE rate" becomes **"Serious deviations"**: the count of serious and critical protocol deviations, with no invented
  threshold.
- The AnA tool's description, and the route's and screen's comments, say the same. The capability manifest is
  regenerated (`npm run manifest:ana`). The schema-contract test's title no longer calls the deviations an
  adverse-event rate.

## Verified

| Check | Before | After |
|---|---|---|
| `server/services/__tests__/pma-trial-metrics-linked-study.pglite.test.ts` (PGlite: an unlinked project beside a more recently updated study naming its product; a linked one; a dangling link, a cross-organization link and a malformed link) | 4 failed (`red/trial-metrics-before.txt`) | 4 passed (`green/trial-metrics-after.txt`) |
