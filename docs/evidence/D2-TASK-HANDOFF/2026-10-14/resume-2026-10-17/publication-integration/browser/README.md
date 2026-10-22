# Saved-source integration: existing host recovery browser check

**Passed one scenario/five measured stages** on `aa4dd090ffe408b119bf8ed4a842f95f8df71311`, integrating saved-source canonical `3cae08d236ba5be6dd96284bca2c47b4605c007d`. The new “Last recorded build source references” notice is rendered throughout the existing structural408 recovery scenario. [Summary and artifact hashes](browser-summary.json) and the [complete raw report](report.json.gz) preserve the result.

1. A pending structural commit holds Back and retains the rich-editor node/buffer.
2. Synthetic persistence followed by HTTP408 leaves the outcome unknown and Back held.
3. Recovery reaches its delayed second host sections read; Back remains held.
4. The verified host read applies saved sections and clears the guard while preserving the existing rich-editor buffer.
5. Explicit whole-document view exposes refreshed saved text; Back calls the host once.

There is exactly one structural commit request, two recovery sections reads, zero generation/acceptance requests, zero page errors and zero unexpected API calls. The only console error is the deliberately injected HTTP408. The notice's distinct “Check saved sources” control is not clicked; no history GET or reuse claim is inferred from rendering it. The recovery control remains “Check saved document”.

All1,952 measured [before](source-pins-before.json.gz)/[after](source-pins-after.json.gz) hashes are identical and independently match the declared Git commit. The conservative scope includes tracked client/src/shared/design-system TS/JS/CSS/JSON modules, package manifests, tsconfig/PostCSS, the retained31 source/harness paths, and new saved-source notice/controller/state/transport/shared modules. Pinning a module does not claim its behavior was exercised. The [executed server](server.mjs.gz) and [driver](browser.mjs.gz) have separate hashes from retained historical harness scripts.

The preceding frozen synthetic harness was copied into uniquely named `/workspace/scratch/saved-source-browser-aa4dd090f-20261018`; only port, output location and pin/report metadata changed. Auth still adopts matching synthetic claims through the real AuthService. [Commands](commands.txt.gz), [browser log](browser.log.gz), [server log](server.log.gz) and [cleanup](cleanup.json.gz) are retained. The browser and owned server are stopped, port5201 refuses connections, and earlier results remain untouched.

All five captures are preserved as deterministic gzip: [pending](pending-back-held.png.gz), [unknown408](408-unknown-back-held.png.gz), [host-read pending](verified-host-read-pending.png.gz), [host read applied](verified-host-read-applied.png.gz), and [whole-document/Back released](back-released-after-recovery.png.gz). The unknown408 and final captures were visually inspected. A toast from a previous blocked click may remain briefly while the report already records the current guard as clear.

This bounded actual Workbench regression uses synthetic account/HTTP replies. It does not exercise saved-source check/reuse, new selected-source interactions, TaskTray/full shell, backend authorization/persistence, a live provider or native database scheduling. No product edits or database work were performed. Root records compiler and direct-publication outcomes separately; human witnessing remains unexecuted.
