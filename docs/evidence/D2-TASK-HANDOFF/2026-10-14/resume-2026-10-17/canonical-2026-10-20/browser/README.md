# Current canonical Workbench recovery — Chromium

The same retained actual Workbench scenario passed on `ec57b5519f8765096f79d437ffcdaeff40a016b4` in Chromium: pending Back refusal, HTTP 408 uncertain-outcome refusal, refusal while the verified host read is pending, actual host acknowledgement, and one explicit Back callback after whole-document inspection. It made one structural request, two recovery section reads and no AI generation or acceptance. The active rich-editor DOM and buffer stayed intact while the explicit whole-document view displayed refreshed saved sections.

All **1,980** measured source/config hashes stayed unchanged before/after the scenario and independently match that Git commit. The measured set includes all tracked client/shared/design-system runtime modules, the retained harness, package manifests, tsconfig/PostCSS, and current `shared/navigation/index.ts` / `shared/navigation/surface-actions.ts`. The saved-source reference notice rendered at all five stages; its history actions were not clicked.

No page errors or unexpected API requests occurred. The single HTTP 408 console message is expected. Two captures were visually inspected. A prior blocked-click toast can remain briefly in the final image; the measured current leave guard clears and the actual Back callback fires once. Own server/browser closed and port 5309 refused connections; older proof is unchanged.

The first readiness-only wrapper checked `/`, which has no root index and returned 404. It timed out before launching Chromium and stopped its own server. Those diagnostics remain under `readiness-preflight/`. The qualified replay uses the retained probe URL and preserves every original scenario assertion.

[Summary and artifact digests](browser-summary.json) retain the exact executed driver/server, complete report, measured pins, independent Git verification, commands, cleanup, five captures and readiness diagnostics. This is synthetic local browser regression evidence, not native backend authorization/persistence, live-provider execution, hosted CI success or human acceptance. Overall publication and broader qualification remain in the parent packet.
