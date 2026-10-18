# Deterministic clinical source to CSR tables

2026-10-14 continuation of F05; launch rows D2/D5/D7. This closes the explicit supporting-source → deterministic tabulation → saved-run review path in Submission Center. F05 remains partial for first-study narrative generation and dataset/clinical qualification.

## User workflow

1. Download the source contract from Submission Center. Its JSON Schema is generated from the same Zod schema the server validates; semantic cross-record rules and limits accompany it.
2. Retain the actual supporting study extract as a `.json` file in this program’s existing Vault. The format marker is `concept2cure.csr-source.v1`. This is an application supporting-source contract, not CDISC Dataset-JSON.
3. Choose the exact current Vault version and preview its tables. The response identifies original SHA-256, version, data-cut date, study/protocol identifiers and supplied study information. It returns aggregate tables, never participant rows. Draft source previews are clearly unapproved.
4. Review and approve that exact version using the existing Vault canonical document lifecycle. Only an approved current version with the same content hash can be selected for a run.
5. Build the run. The server rechecks current membership, private-project access, source eligibility, version, approval and actual stored bytes. It freezes validated observations plus the source receipt in the existing immutable `submission_orchestrator_inputs` record before any composer runs.
6. Reload a saved run to inspect aggregate tables and provenance. Clinical tables are supporting review outputs. They are not automatically placed into eCTD or converted into filing leaves.

No selection preserves the existing package workflow. The application does not infer a program-wide clinical binding from an uploaded file or a completed narrative summary.

## Data and permission contract

The envelope supplies complete recorded StudyInfo, explicit participant/population flags, typed StudyData, data-cut date and explicit domain-completeness declarations. Counts must agree with the participant roster; subject identifiers and per-domain records are unique; AE participants belong to the recorded arm’s safety population; protocols and primary endpoints agree; CI, probability and lab-count bounds are checked. No p-value, effect, confidence interval or missing observation is inferred. Recorded endpoint result display strings are carried as supplied, not independently verified analyses.

This contract supports the existing fixed-arm randomized tabulator: at least one recorded randomized participant is required, identifiers cannot cross arms, and baseline demographics cover randomized participants. Crossover/reassignment, generic SDTM/ADaM extraction, SAS/XPORT, arbitrary scientific mapping and dataset packaging are not supported. Source JSON is capped at 5 MiB, participants at 100,000 and arms at 100. Candidate discovery shows at most 100 current JSON files and declares when that limit is reached.

All source and aggregate reads enforce current membership and the canonical project sharing policy through the request connection. Selection uses exact document/org/program identity, current-version and data-disposition predicates. Source storage uses the existing provider and original-content verifier. Missing, corrupt, withdrawn or inaccessible bytes are errors. Source approval means the existing platform lifecycle approved those bytes; it does not establish clinical verification, statistical validation, CDISC conformance or FDA qualification.

## Concurrency, signatures and historical records

The adapter uses the existing per-program disposition advisory lock, the original Vault version’s share lock and the canonical lifecycle record’s share lock. It rereads current-version status after taking the predecessor lock. Locks release only after the existing run service durably captures its sealed original inputs; unrelated composers then proceed without holding this source transaction.

Release preparation and continuation recheck source eligibility without replacing frozen observations. The canonical signature service gained an optional generic transaction guard. The submission release route enlists the source guard on the actual signature transaction before the signature INSERT, preventing a withdrawal or check-in during password/MFA verification from crossing the check/write boundary. Other signature callers retain their existing behavior.

Saved table reconstruction verifies the frozen digest/seal and current project access. A normal later Vault check-in permits authorized historical review of the old source. Explicit `remove_data`/`supersede` dispositions refuse reconstruction with `CSR_SOURCE_DATA_UNAVAILABLE`, rather than returning successful empty tables. `keep_data` permits retained aggregate reconstruction without rereading removed original bytes. Immutable input receipts remain retained under the existing regulated-content offboarding refusal; no erase bypass or new clinical data store was introduced.

Preview generation records a request-bound canonical audit outcome. An audit outage after a completed preview returns the actual unpersisted-audit warning with the completed tables. Retrying performs the real operation and records its current result.

Validation failures return canonical field/index paths and fixed messages. Zod’s enum and unknown-key errors can contain uploaded values, so those raw messages are never returned. A sentinel participant-cell/unknown-key regression was observed failing before this correction and passing after it.

## Tabulator corrections

Before exposing the existing engine through this source path, seven incorrect/incomplete behaviors were repaired: sample SD uses the `n-1` denominator and is unknown for one observation; sex summaries include Other; disposition includes screen failures; fatal-AE counts no longer claim to count every study death; laboratory shifts retain the baseline-normal denominator instead of treating baseline-abnormal subjects as staying normal; optional population totals stay unknown if any arm’s denominator was not recorded; and AE percentages remain unknown when an arm has no safety participants.

An independent runner compiled the audited HEAD and repaired implementations and applied the same seven assertions. Original: 0/7, exit 1. Repaired: 7/7, exit 0. See `csr-source-tabulation-regression.txt`.

## Verification and limits

The native suite `tests/db/csr-vault-source-input.dbtest.ts` passed 7/7 against the provisioned local PostgreSQL database using actual authentication, tenant async scope, `LazyRequestDbClient`, verified TLS and `app_service` with neither superuser nor BYPASSRLS. It exercises the shipped source preview, actual `/runs/for-program` input capture, aggregate reload, private/foreign/viewer refusals, draft-source rejection before a run is created, failed-audit/retry recovery, actual signature source guard locks against check-in/disposition writers, historical check-in review, and remove-data/keep-data behavior. Its synthetic run correctly fails package validation because no approved Module 3/agency package was supplied. This is a positive source/tabulation persistence proof, not successful agency packaging.

Focused source/schema/history, release-transaction and route suites accompany the native proof. The signature tests show actual same-transaction guard success and rollback before signature/audit persistence; a route test withdraws the source during password/MFA verification and refuses the subsequent signature guard. No new dependency, migration, provider call or agency transaction was required. Test records and bytes are explicitly synthetic and are never default source data.

First-study narrative generation remains refused. The legacy narrative step still maps completed summary inputs to an invented title, `[sponsor]`, fallback indication/product and incomplete StudyInfo. `CSRBuildRequest`/the worker snapshot currently carries study metadata rather than the exact clinical source context. A future narrative adapter must propagate the genuine complete StudyInfo, exact approved source receipt and deterministic table context through the immutable job snapshot, recheck current authority/eligibility in the worker, preserve source citations and model qualification gates, and retain `needs_data` for unsupported/missing clinical sections. Merely filling the sponsor field or treating a completed summary as observations does not complete that work.
