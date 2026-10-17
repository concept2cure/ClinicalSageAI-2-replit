# CSR source readiness and first-study drafting

Continuation: the [canonical supporting-source adapter](csr-source-input-adapter.md) and active package controls now support exact Vault JSON → deterministic table preview → frozen run review. The narrative limitation described below still applies to first-study AI drafting. Supporting JSON is not a qualified CDISC/FDA dataset or an automatically placed eCTD leaf. The earlier readiness checkpoint below is retained for its original scope.

The canonical program build can reuse completed, accessible CSR summaries in
Module 2. It cannot presently initiate a first study's CSR from linked clinical
observations. The source loader reads completed `csr_build_jobs` and
`csr_section_outputs`; those records do not provide the raw tabulation inputs
or all the study information required to draft a new CSR. Turning on narrative
drafting reused a completed study's summary and substituted `[sponsor]` where
the original full study information was missing.

The remediation preserves completed-summary composition and retained-run
continuation, provides a scoped source-readiness read, and refuses the
unsupported opt-in before creating a run. It does not pretend that an uploaded
file, protocol design, dataset profile, or previously generated narrative is
qualified clinical data.

## Endpoint contract

`GET /api/submission-orchestrator/csr/readiness?programId=<UUID>` returns:

```json
{
  "programId": "11111111-2222-4333-8444-000000000011",
  "projectLinked": true,
  "completedSummaryCount": 2,
  "rawTabulation": { "status": "not-linked", "studyCount": null },
  "narrative": {
    "available": false,
    "code": "CSR_NARRATIVE_INPUTS_REQUIRED",
    "message": "First-study CSR drafting is unavailable until verified study data and complete study information are linked to this program. Completed CSR summaries can be reused in a package; they do not supply those source inputs."
  },
  "requiredInputs": {
    "studyData": {
      "required": ["studyId", "protocolNumber", "treatmentArms", "disposition", "demographics", "efficacy", "adverseEvents"],
      "optional": ["exposure", "labShifts"]
    },
    "studyInfo": {
      "required": ["title", "protocolNumber", "phase", "indication", "sponsor", "investigationalProduct", "studyDesign", "primaryEndpoint"],
      "optional": ["comparator", "secondaryEndpoints", "sampleSize", "treatmentDuration", "targetAgencies"]
    }
  },
  "recovery": [
    { "appId": "vault", "label": "Review study source records", "message": "Retain study source files and their provenance in this program's Vault. Uploading a file does not yet connect its observations to CSR tabulation." },
    { "appId": "authoring", "label": "Review or author the CSR", "message": "Use this program's Authoring workspace for a governed CSR document and source review. Authoring a document does not qualify a clinical-data adapter." }
  ]
}
```

`completedSummaryCount` counts distinct studies with a completed job in the
selected program's unique project anchor, matching the canonical reader's
latest-completed-per-study denominator. Failed, in-progress, needs-data,
unfiled and foreign-project jobs are excluded. A uniquely anchored, accessible
program with no completed studies reports zero. No unique anchor reports
`projectLinked: false` and a null count; the route does not broaden the query to
the organization. A store failure returns an error, never a fabricated zero.

The route checks current active user and organization membership, organization
ownership of the undeleted program, the canonical unique project anchor, and
the canonical project-sharing policy. Read-only shares may inspect readiness;
revoked shares and stale session management roles cannot bypass current
private-project access. The response exposes no study identifiers, generated
content, participant observations or internal snapshots. It makes no writes.

`POST /api/submission-orchestrator/runs/for-program` with
`enableCSRNarrative: true` returns HTTP 409 with
`error: CSR_NARRATIVE_INPUTS_REQUIRED` after current governed program-write
access is established and before source loading, run creation or job creation.
The default package build still reuses completed accessible summaries. This
change does not alter continuation of an already retained asynchronous run or
release ceremony.

## Remaining adapter work

First-study initiation remains incomplete. The required arrays and study
information above come directly from `StudyData` in
`server/services/csr-tabulation-builders.ts` and
`CSRBuildRequest['studyInfo']` in `server/services/csr-builder.ts`. Nested
treatment-arm populations, disposition, demographics, efficacy and adverse
event records must satisfy those existing interfaces with actual source
values. The optional fields remain optional; missing values must not be
invented.

A future program loader must bind the study's actual source observations,
recorded full study information, tenant/program/project access, source
version/hash and retained input provenance before this refusal can be removed.
Source withdrawal or version changes must invalidate fresh drafting inputs.
Neither the summary-count endpoint nor a dataset's structure profile provides
that qualification. Canonical Vault and Authoring destinations offer current
source retention, review and document work without claiming to complete this
missing adapter.

## Verification

The actual Express route against synthetic PGlite rows failed seven of eight
cases before the change: readiness was absent and the unsupported narrative
opt-in returned success. Final focused verification covers ten readiness
cases plus five existing program-start cases (15 tests across two files).

It covers completed generations, excluded statuses, tenant/project isolation,
zero versus unknown, ambiguous anchors, current private-project sharing and
revocation, stale roles, anonymous and inactive principals, deleted programs,
source-store failure, opt-in refusal before effects, and preserved default
package composition. No external AI provider or participant data was used.
No schema or production dependency was added.

Evidence: `csr-readiness-before.txt` and `csr-readiness-after.txt` in this
directory. The first-study adapter remains an explicit F05 gap even though
retained-run continuation is implemented.
