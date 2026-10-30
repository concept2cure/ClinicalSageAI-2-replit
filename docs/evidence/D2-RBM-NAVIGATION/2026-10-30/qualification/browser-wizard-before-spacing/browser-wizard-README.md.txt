# Actual-component project setup browser proof

The actual NewProjectWizard, actual filing picker, auth and tenant providers and
shipped styles run in installed Chromium through the existing private Vite host.
This is an explicit synthetic component harness. Filing offers, actor/workspace
reads and the intercepted POST /api/c2c/projects response are fixtures.
No real backend project, subscription grant or assessment is created.

Twelve checks pass across desktop1440x1000 and phone390x844: RBM begins unchecked,
selection stays checked, Review repeats Included for this project, actual create
handler sends riskBasedMonitoring:true with the reviewed workspace, exact mocked
project receipt drives the real shell channel/project-home callback, no seed/grant
request is issued, and neither viewport has horizontal document overflow.
Both sent payloads are in browser-wizard-result.json.

All28selected source/harness pins stayed unchanged and exact bytes are archived
in browser-wizard-source/. Six screenshots are in browser-wizard-result/.
The first attempt reached the actual unchecked checkbox then timed out on an
overly exact accessible label selector; its harness/output/failure/screenshot are
retained in browser-wizard-attempt-01/ with the selector correction record.

Original rail5-check proof and23selected sources were preserved before this
extension in browser-rail-original/. Every original artifact-manifest item is
verified in its artifacts/ subdirectory, including the exact original server log.

This does not establish backend persistence, authenticated hosted acceptance,
clinical validation or agency acceptance. Root server/SQL tests supply separate
backend evidence; cohorts must not be conflated or summed.
