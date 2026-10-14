# Complete retained report-pack backend evidence

The reports selector returns all admitted retained report bodies in the exact saved caller-selected `runIds` order, with the original sealed document for a verified final and the canonical retained-run renderer for other supported records. The default and explicit manifest selectors remain reachable. These checks establish implementation behavior; they do not establish clinical/scientific, agency, full IND/BLA/CTD, PDF/A or production qualification.

## Verified behavior

- Final canonical route tests: **71/71 across four files, zero skips**, 22.67 seconds. The same cases passed before the warning-only refactor (71/71 across three files, 12.63 seconds). Original audit, saved access and bundle recording cases remain; new packet cases were separated into a bounded test file without duplication.
- Initial unchanged-source red controls: audit suite 21 failures / 19 passes (all 18 original cases passed); saved-access suite seven new failures / 12 original passes. Expanded selected new cases produced 33 failures / two passes; 30 original cases were intentionally filtered in that one run and had already passed in the preceding full red harness runs. No filtered run is presented as a zero-skip regression run.
- Final focused lint: zero errors and the **five existing warnings in `server/routes/report-os.ts`**. New route helper/test warnings observed during implementation were removed through bounded helper/test extraction. Owned tests, including the native file, have no warnings. No warning baseline or suppression was added.
- Actual restricted-runtime native tests: **8/8, zero skips**, 36.01 seconds, on `platform_ci_native_recheck_20261013`. The actual role was `app_service`, non-superuser, `NOBYPASSRLS`, with enforcement on. All seven asserted report, snapshot, memory, sharing, signature and audit stores had enabled and forced RLS.

The native positive packet has **29 pages and 131,328 bytes**. Its audit hash/length match the exact response buffer and the filed synthetic PDF. Actual saved order, verified-final source/manifestation, long retained table through its last row, provenance, Unicode and per-page status ranges were checked. One actual finalized report and its signature were created through the real authenticated finalize/password ceremony; exporting the positive packet did not add a signature. Fixture values are invented QA data and are not measured scientific confidence or readiness.

Private, foreign and missing constituents each produced the same generic whole-packet 404 refusal, without attachment/PDF bytes or a successful export event. Current foreign/rebound identity unit cases also assert that no full-body SELECT preceded refusal. Duplicate/unsafe IDs and invalid retained UUIDs refuse as typed corruption before the bound integer-array query.

## Coherent content and current access

One actual owned tenant-stamped READ COMMITTED connection reads the active actor, current canonical sharing and scope policy, registry, retained run data and the canonical seal boundary. The route reserves selected IDs with ordered `FOR SHARE`, projects only current identity and canonical historical parent IDs, admits those actual current scopes, and only then loads full body metadata. It deliberately avoids reading a full `dependencySummary` before admission because that field can contain the complete stored lineage report.

An independent native PostgreSQL observer saw the real export's idle-in-transaction source-name query interval and the real canonical finalizer blocked by the export PID. The observed source-query timestamps advanced from `06:40:36.518` to `06:40:40.689` UTC. The first packet retained the earlier completed/non-final record; finalization then succeeded after reservation release, and the next packet used its verified sealed final. This uses actual lock waiters and actual PDF work, with no renderer hook/mock. The observation is a bounded backend query-progression/lock sample; it is not an invented claim that every millisecond or every independent writer was sampled.

Separate restricted `app_service` transactions changed only fresh QA sharing/membership rows during actual PDF work. Scope and role withdrawals were observed before late canonical actor reads (about four-second source-to-late-read intervals), and both packets refused with 404 before bytes or successful export audit. The owner connection only seeded and inspected invented records. Every QA record, audit and signature remains retained; no immutability trigger was disabled, no row was deleted, and no runtime grant/RLS policy was altered.

Fresh actor/scope, entitlement, retained row/seal/name, registry and bundle checks run after rendering, before the existing durable audit/send path. This covers the observed admission-to-after-render interval. It does **not** claim universal COMMIT serialization against independent sharing writers through the later audit/send transaction.

## Entitlements and refusal

The canonical resolver/gate reads on the actual supplied SQL executor and reports whether one valid recorded tier was read. An unresolved plan refuses every reporting family; the packet maps this to typed 503, while a known ineligible plan remains 403. Both manifest and reports routes have unavailable-plan controls, and reports mode rechecks an observed downgrade after rendering.

The native resolver fault is a real division-by-zero transaction error on the actual tenant-stamped restricted client. A standard positive decision became `tierResolved:false`, `entitled:false` when the production resolver/gate was called on that same aborted executor. This is a native production-service fault proof paired with exact-route unit availability refusals; it is not an HTTP-level PostgreSQL fault-injection claim. Compatibility fallback text never authorizes a standard/base export when the tier was not verified.

The shared individual-run body loader and canonical `readSealForExport`/`buildRenderedFromRun` boundaries remain the only source selection/render path. A mismatch refuses the packet. A legacy final is explicitly not verifiable and reconstructed; actual signature/verification facts remain, with no intact claim. No provider recomputation, extra finalization, alternative source store or audit chain was introduced.

## Artifact integrity

`source-and-artifact-manifest.json` lists explicit source/artifact records with byte lengths and SHA-256 digests. It pins the exact checked route, tests, PDF and entitlement bytes. Text-log copies normalize EOF line breaks only; their original byte lengths/digests and private `/tmp` paths are recorded, and the raw logs remain preserved there. The observation JSON and PDF were copied byte-for-byte. Existing sealed evidence was not rewritten.
