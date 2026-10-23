# Correct existing document read windows — D2 / W2

## What already exists

[INVENTORY.md](INVENTORY.md) records the canonical registered handler, generic fitter, host budget and guarded receipt writer. Correct the existing handler and tool descriptions; do not add a parallel reader or alter the receipt writer, schema, provider, tool registry, generic fitter or Authoring behavior.

## Accepted behavior

1. Coordinates and totalChars remain UTF-16 code units. Preserve exact source bytes/text; do not normalize, trim, replace or reindex by code points.
2. A requested start inside a valid surrogate pair moves backward one unit so no source character is silently skipped. Returned window.start explicitly reports the actual start. Existing finite/default/clamp, unknown-source, actor and past-end refusals remain.
3. Every rendered candidate computes its actual safe end. A split end moves backward one unit when text remains. If that would empty the window, include the whole two-unit character instead. Thus max_chars1 may return2 units for one supplementary character, as existing Authoring does. Disclose this and the actual-bounds continuation rule in the tool's input descriptions.
4. Every candidate's text is exactly source.slice(actualStart,actualEnd). Prospective coverage uses that span. Recompute the selected span deterministically from final fit.size; never capture the last render callback's candidate. Both deferred receipt.span and sourceSnapshot.span equal the returned window bounds, and receipt.result equals the exact returned serialization.
5. Keep generic fitReadWindow and comprehension withholding intact; safe end mapping can plateau but must not move backward as nominal size grows. Ordinary results fit the existing RESULT_BUDGET. Preserve the existing minimum-result fallback when metadata alone is too large; for current receipt-eligible reads, whole-or-nothing host admission must still refuse/replace results exceeding its per-result, round or context budget without recording those withheld results. A legacy minimum result above RESULT_BUDGET can still fit the host ceiling and be admitted. Do not claim an impossible universal serialization cap or provider delivery.
6. Advancing by actual returned end covers valid source text without gaps and terminates at totalChars, including max_chars1 and dense supplementary/scientific/Japanese text. ASCII/BMP/default normalization and historical/no-host read behavior remain unchanged.
7. For current receipt-eligible reads, actual executor and stream dispatch seams must keep intact admitted results byte-for-byte and settle only their exact actual spans; round/body/context refusal, changed source/access and cancellation before admission or committed receipt insertion still earn no new receipt. Late cancellation after a possible commit retains the existing unconfirmed-outcome behavior rather than claiming rollback. Scripted gateway requests prove host dispatch parameters, not live provider delivery. In-memory or synthetic writer seams must be labelled honestly.
8. No malformed-original encoding repair/refusal is added; promise valid-pair preservation only. Existing source identity/guard behavior is unchanged. No historical repair, deployment, native RLS, live provider, agency acceptance or complete launch claim.

## Qualification

Publish this contract, independently author new handler/host/receipt tests, show semantic baseline failures and preserve controls, freeze hashes before production edits, then run targeted existing regression and unchanged-source verification. Changed-file lint must add no errors/warnings; normal direct canonical pushes must pass every mandatory gate including whole-project TypeScript. Merge incoming history without force or bypass and publish evidence in this directory.
