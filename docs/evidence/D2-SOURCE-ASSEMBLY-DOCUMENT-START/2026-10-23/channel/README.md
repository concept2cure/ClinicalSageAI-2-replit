# Selected-source document start channel

## What already exists

`editorTarget.ts` already owns the one-shot editor window channel, TTL and
private source ownership. `assemblySourceIntent.ts` already captures current
actor/project intent for a real document. `SourceAssemblyDialog.tsx` already
lists selected sources and current working targets, but its creation remedy
closed the chooser and lost the selected source intent. Existing source-target
UUID checks, canonical creator/recovery and editor admission remain their owners.
This worker extends those paths; it adds no form, picker, store, writer or editor.

## Implemented contract

`sourceDocumentStart` is a distinct bounded command with null document/family/
section/return target and an exact project UUID. Mixed commands, invalid selectors,
copied/unowned objects and raw payload/timestamp changes are refused without
becoming an ordinary target. Existing `assemblySources` still needs a document
UUID. URLs do not reconstruct starts. Publication and each read copy canonical
selectors; normalized commands retain private ownership for receiver capture.

`setEditorTarget(target, sourceDocumentStartCurrent?)` accepts a setter-only
source-owner callback, never serialized. The chooser passes an independent
actor/project/source-origin guard that survives intentional chooser unmount.
Changes to selected sources or withdrawal/availability retire that original
owner, including A→B→A returns. Another governed form holds the remedy.

`captureEditorSourceDocumentStartOwner` admits only a fresh privately owned
untampered command. Its returned guard permits form editing beyond the channel
TTL while still checking source/actor/project ownership and snapshot integrity.
`captureSourceDocumentStartIntent` additionally checks receiver admission and
the captured selectors. No POST, generation, build, approval or filing occurs
when the chooser publishes its New document command.

## Retained results

- `red.json` / `red.log.gz`: meaningful pre-production RED, 10 failures and two
  existing guard passes across 12 cases. Assertions reached current code: the
  command was ignored or accepted as a plain target, and the chooser lacked the
  canonical New document remedy. No missing export was imported. All 16 declared
  input pins stayed unchanged during execution.
- `initial-green.json`: 64 passes across three suites after initial production
  completion, including ordinary editor targets and existing source entries.
- `ownership-check.json`: extra ownership checks retained 23 passes/two failures.
  One exposed mutation of captured intent selectors not retiring the intent.
  The other was a fixture using a wrapped refresh response while the canonical
  auth client expects a bare response. It is not called a product RED.
  Selector snapshots were pinned and the response fixture corrected; auth code
  was not changed.
- `qualified-green.json`: all 77 cases across three suites pass, exit 0, no
  drift in the 16 declared pins. Includes expiry at admission, long-lived current
  editing, namespace/checksum preservation, private copy/tamper refusals, source
  replacement/withdrawal, actor/organization/session/project round trips, real
  same-session refresh, ceremony holds and deliberate sender unmount.
- `initial-lint.json`: strict lint of all five owned files passes, zero warnings
  and errors, exit 0, no declared input drift. No baseline was changed.

Receipts retain exact argv, Node version, UTC time, exits, before/after pins and
compressed raw-output SHA-256. `sourceFreeze` is relative to the increment root;
`rawOutput` is relative to each receipt's `channel/` folder. Historical freezes
retain their own source hashes; `freeze.json` pins the final owned bytes.
The initial capture preparation corrected an `.ts` versus `.tsx` auth path before
any test ran; it is not feature RED.

This worker ran no compiler, build, global scan, Git mutation, native database,
provider, browser or deployment. Tests use declared jsdom and synthetic HTTP
seams. Root owns combined creation/workbench integration and publication.
