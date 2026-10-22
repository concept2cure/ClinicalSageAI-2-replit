# Current combined-source browser recovery

**Passed one scenario/five measured stages** on `6562dd67aeb13edd17a1d9c62f214163a4e8e6a3`, preserving incoming selected-source assembly and the existing host guards. [Summary and artifact hashes](browser-summary.json), [full report](report.json.gz), [before](source-pins-before.json.gz) and [after](source-pins-after.json.gz) pin maps retain the receipts.

1. Pending structural commit: Back refused; original rich-editor node and buffer retained.
2. HTTP408 after synthetic persistence: outcome unknown; Back and automatic retry held.
3. Exact recovery read reaches its delayed second host sections read: Back remains held.
4. Host applies verified saved sections: guard clears while the RTE buffer stays unchanged.
5. Explicit whole-document view displays refreshed saved text; Back calls the host once.

Exactly one structural commit request, two recovery sections reads, zero generation/acceptance requests, zero page errors and zero unexpected API calls were recorded. The one console error is the deliberately injected HTTP408. All1,942 measured source hashes match before/after and the declared Git commit. The conservative map includes every tracked client/src/shared/design-system TS/JS/CSS/JSON module, package manifests, the original31 source/harness paths and new assembly-source helpers; it is a source binding, not a claim that every pinned module was exercised. Supplementary [configuration binding](configuration-binding.json.gz) verifies post-run tsconfig/PostCSS bytes against656; it is labeled separately from measured before/after maps.

The retained original harness was copied into a new scratch directory. Only loopback port, output location and pin/report metadata changed from the preceding five-stage runner. [Executed server](server.mjs.gz), [driver](browser.mjs.gz), [commands](commands.txt.gz), [server log](server.log.gz), [browser log](browser.log.gz) and [cleanup](cleanup.json.gz) are preserved. Scratch transforms retain the existing matching synthetic claims through real AuthService, expose the native Back control and count its callback. The original evidence and earlier results were untouched. The owned server and browser are closed; port5197 refuses connections.

All five screenshots are retained as deterministic gzip: [pending](pending-back-held.png.gz), [unknown408](408-unknown-back-held.png.gz), [host-read pending](verified-host-read-pending.png.gz), [host read applied](verified-host-read-applied.png.gz), and [whole-document/Back released](back-released-after-recovery.png.gz). The408 and final captures were inspected visually. A previous blocked-click toast can remain briefly in a later screenshot; the report records the current leave guard clearing only after verified recovery.

This is the actual Workbench and shared leave registry with synthetic account/HTTP replies. TaskTray/full shell and the new selected-source interaction are not exercised. No database, product edit, backend authorization/persistence, live model, deployment, complete CI or human acceptance is claimed. Compiler and direct-publication receipts belong to root; human witnessing remains unexecuted.
