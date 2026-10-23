# Saved-source history / current-read merge successor

W1 / D2 UI reconciliation of incoming `3cae08d23`. The Workbench conflict keeps
both the existing partial/read refusal and the incoming draft-review reuse hold.
No source-selection, session/project guard, unsaved-work decision or warning
remedy was removed.

One bounded UI integration repair extends the existing assembly host predicate:
partial or refused current document reads now withhold saved whole-document
source history. This blocks a new history check and removes cached source titles
from the rendered notice. Full-document view-only actors retain the incoming
read-only Check behavior; Use retains its separate editing/review/ceremony holds.
The server endpoint's current full-document admission is separately root-owned.

Three actual-editor controls failed before repair: partial detail, partial
sections and cached-history withdrawal after a partial refresh. Exact RED proof
is `current-read-red.txt.gz` (three failures, twelve name-filtered skips).

The finite affected run passed **106 cases / six suites**, zero skips/failures
(106.45s), in `integration-node22.txt.gz`. It covers saved history/reuse,
session/project/source ownership, manual review buffers, current-read refusals,
source-first handoffs and unsaved filtering. Incoming flow fixtures now dispatch
pathname while retaining exact selected-program GETs. All assertions remain.

Node 22.22.0, Vitest 4.1.7, existing config, heap 4096, one worker and no parallel
files. Scoped ESLint has zero errors and twelve existing Workbench warnings;
the saved-source notice/controller/transport and both incoming suites have zero
warnings. No threshold, suppression, dependency or baseline changed.

`result.json`, `regression-files.json`, `lint-summary.json` and `source-pins.json`
record exact coverage and frozen inputs. `archives.json` pins deterministic gzip
(`mtime=0`) and decoded SHA-256, preserving raw proof bytes and React act warnings.
Historical proof packets were not rewritten. This mocked-HTTP evidence does not
qualify native RLS, browser behavior, providers, deployment or source-writer
authority. No staging, commit or push was performed by this UI delegate.
