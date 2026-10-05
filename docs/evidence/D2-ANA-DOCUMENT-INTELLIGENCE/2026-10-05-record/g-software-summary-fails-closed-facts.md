# g-software-summary-fails-closed: facts relied on

Step: `GET /api/mdx/software-summary/:programId` (`server/routes/mdx-software.ts`)
no longer assumes a documentation level. It used to keep its own required-deliverable
lists. It now builds the required set from the canonical functions in
`server/services/market-specs/software-lifecycle.ts`, which landed in step
`g-fda-software-documentation-level`. Checked 2026-10-05.

This step adds no new regulatory fact. Every regulator statement it relies on is
already in `software-lifecycle.ts`, with the basis recorded in
`g-fda-software-documentation-level-facts.md`. The route returns that basis
unchanged in `basis`, de-duplicated by `ref`.

| # | Fact | Basis | Where used |
|---|---|---|---|
| 1 | FDA's 2023 guidance "Content of Premarket Submissions for Device Software Functions" has two Documentation Levels, Basic and Enhanced. A program has one level. | **Regulator text** (search extract of https://www.fda.gov/media/153781/download, checked 2026-10-05). See fact 2 of `g-fda-software-documentation-level-facts.md`. | Items recorded at two levels, or at a level other than basic or enhanced, give `undetermined` with no percentage. The response `basis` carries `fdaDocumentationLevel({}).basis`, the regulator-text entry. |
| 2 | At Basic, FDA recommends the system-level test protocol and report, plus a testing summary covering the unit, integration and system levels. Unit and integration test protocols and reports, and the SDS, are Enhanced only. | **Recall**, corroborated by a search extract. This is `SET_BASIS` in `FDA_SOFTWARE_DOCUMENTATION_SET` (fact 4 there). | The Basic matrix requires `system_test`. It does not require `unit_test`, `integration_test` or `sds`. Enhanced adds all three. |
| 3 | SBOM, threat model, cybersecurity risk assessment, cybersecurity testing and a postmarket vulnerability plan are required for a cyber device under FD&C Act §524B, independent of the documentation level. | **Recall** (`CYBER_BASIS`, fact 5 there). | Rows for `sbom`, `threat_model` and `pentest` are added only when `fdaCybersecurityDocumentation` returns `required`. If the program's intake never answered the cyber-device question, the cybersecurity status is `undetermined` and `completion` is null. |

## Platform conventions, not regulator text

- **The `LIFECYCLE_KINDS_FOR` mapping.** This maps an FDA documentation item to the lifecycle item kinds that evidence it:
  - `srs` → `srs`
  - `architecture_design_chart` → `arch`
  - `system_test_protocol_report` → `system_test`
  - `version_history` → `release_note`
  - `unresolved_anomalies` → `anomaly_log`
  - `sds` → `sds`
  - `unit_integration_test_protocols_reports` → `unit_test` and `integration_test`
  - `sbom` → `sbom`
  - `threat_model` → `threat_model`
  - `cybersecurity_testing` → `pentest`

  This is the register's own convention, not a regulator fact.
- **Untracked documentation.** Some recommended documents have no lifecycle item kind: documentation level evaluation, software description, risk management file, development practices, testing summary, configuration and maintenance plan, cybersecurity risk assessment, and the postmarket vulnerability plan. These are returned in `untracked` and named in `completionScope`. They are not counted as present, and they are not dropped silently.
- **Superseded items.** An item with status `superseded` does not vote on the documentation level. It is history.
- **Cyber-device status.** This is read from `regulatory_programs.metadata.deviceFlags` by `deviceFlagsFromMetadata` (`server/services/pathway-engines/estar/program-device-flags.ts`), the same parser that the eSTAR routes use.

## Not done here (reported as needs_elsewhere)

- `ots_list` and `cybersecurity_label` used to be required records. They are not items in the canonical `fdaCybersecurityDocumentation` set, so they are no longer required. Whether cybersecurity labeling belongs in that set needs the cybersecurity guidance to be read first (https://www.fda.gov/media/119933/download). That is owed by `g-fda-software-documentation-level` under DECISIONS.md #7.
- The client (`client/src/concept2cure/mdx/hooks/useSoftware.ts`, `surfaces/SoftwareSurface.tsx`) still types `docLevel` as `'basic' | 'enhanced'` and `completion` as a number. It needs to render `undetermined`, a null completion with `reason`, and the `untracked` list.
