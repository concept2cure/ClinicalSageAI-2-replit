# Exact specialist document handoff

W1 / D2, 2026-10-16. Initial synchronized canonical source: `990a687c6`.
This increment changes the existing specialist-to-editor writer and its current
callers. It adds no editor, surface, provider, production dependency or endpoint.
The contract is [current access and exact specialist handoff](../../../../design/AUTHORING_CURRENT_ACCESS_AND_HANDOFF_2026-10-16.md).

## Result

`saveToAuthoring` now requires confirmed document and section receipts with the
requested project and document ownership. Successful handoffs carry the exact
saved document ID, project and section code through the existing editor-target
channel. They no longer rely on the newest document in an editor list.

The existing AuthService session revision and captured actor/organization guard
own account consistency. The existing shell-project channel now also owns a
project-visit revision, so A → B → A invalidates the earlier pending handoff.
Same-project metadata updates and same-actor token refresh remain current. A
thin React wrapper contributes mount ownership; it creates no creation ledger.
Scope is checked between response headers and body reads, before the section
write, and before caller status, toast, navigation or correspondence effects.

Biostatistics preserves the server's binding notice when saving without leaving
its surface. A saved, unbound working document is no longer announced as filed
into a dossier. Lost, malformed or server-failure outcomes are described as
unknown; section failures retain the confirmed document ID when available.
Explicit refusal, confirmed partial creation, unknown outcome and stale context
are separate helper results. No write is automatically retried or deleted.

All six actual caller modules are covered: Biostatistics, BiostatWorkbench,
PvCockpit, CmcModule, CmcQuality and ReportEngine. Both CMC change assessment and
agency-response entry points use the same corrected helper.

## Verification

- [Final regression receipt](regression-final.txt): **7 files, 117/117 tests**.
  Includes helper receipt/scope cases, shell-project guards, prior actual
  specialist controls and correspondence tests, and the existing
  `no-ghost-globals` contract.
- [Independent actual-caller evaluation](independent/README.md): **19/19 tests**
  with the real helper, editor-target channel and AuthService. It demonstrates
  exact target selection, project/account/org changes, host unmount, stale
  refusals, correspondence follow-up suppression, true token refresh and
  honest binding messages. API/session responses are synthetic; this is client
  integration evidence, not a new full-server or provider execution claim.
- [Final strict lint](lint-final.json): **0 errors**. The helper, shell guard and
  five changed/new test files have **0 warnings**. The six existing caller
  surfaces retain their previous **39 warnings**; none grew. The helper's
  previous one warning is removed. Independent test lint is recorded separately.
- [Source pins](source-pins.json) identify the exact production and regression
  files exercised. Root publication evidence owns full compiler/build/hook
  results; they are not inferred from the focused tests here.

The previous actual-caller failures are independently retained: **9 failures,
1 pass** against unchanged source. The new helper RED receipt has **20 failures,
1 pass** and includes new result-shape/opener contract assertions as well as the
existing receipt/scope defects. The new project-visit guard initially failed all
3 assertions because that guard did not exist. These counts are not claimed as
separate production incidents.

Earlier candidate receipts remain visible. The first helper candidate passed
46/48; an old uncertainty-copy assertion was aligned and a preserved 401
explanation was restored. The legacy three-file candidate passed 50/69: old
synthetic receipts lacked project/section ownership, one mock hid the now-used
canonical AuthService, and historical error assertions claimed nothing was
saved after a transport/500 failure. Fixture fields and honest-copy assertions
were corrected while preserving exact payload, navigation and retained-work
checks. The final seven-file run passed all 117 tests.

[Receipt storage metadata](receipt-storage.json) records each original captured
output hash and stored repository-copy hash. Stored text differs only where
trailing line endings were normalized to one LF.

## Remaining limitation

**Generic recovery and duplicate creation after an unknown or partial specialist
handoff are not resolved by this increment.** Existing busy guards settle when
the request finishes; another explicit retry can create another document.
Biostatistics Open and Attach retain separate existing pending guards, so
cross-action overlap also remains possible. The warning directs the user to
check working documents in the original project before creating another copy.
A future shared recovery change must extend the existing creation mechanism
with its own contract and evidence.

Existing busy-state cleanup may settle after a context change. A pending
same-action ref prevents a newer same-action request until that cleanup occurs;
cleanup only releases the previous pending control. It does not publish saved
content, filing/status claims, toasts, targets or navigation into the new scope.

The two-request writer remains intact. No speculative origin classification or
alternate creation store was added. These automated checks do not establish
provider-backed AnA performance, independent human review, deployment readiness
or agency acceptance.
