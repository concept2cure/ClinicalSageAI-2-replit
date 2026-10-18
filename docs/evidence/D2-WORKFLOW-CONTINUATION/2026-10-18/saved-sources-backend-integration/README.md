# Saved assembly source backend integration, 18 October 2026

Before publishing the governed authoring delivery, canonical `3cae08d23` added saved-source history and reuse. The merged server/shared run passes **74 tests in 3 suites**, with zero skips, in 55.24 seconds. `backend-green.txt` is the exact output; `summary.json` pins the tested boundary and fixtures. The final merged client/server production build passes (`build.txt`). The editor integration and its negative controls are recorded separately in `../saved-sources-current-read/`.

The read endpoint requires current whole-document authority before querying source history. It refuses section-only access, rechecks current source permissions, and rejects unpaired, damaged, stale or changed history rather than substituting an older record. It uses the request-owned database client and canonical current-read authority. No source copy or text mutation occurs on a history read.

These are explicit-seam PGlite and shared-boundary results. The existing Codespace, configured approved model, live project citations, supported CMC scenario acceptance, and two previously recorded Vault-placement TODOs remain unqualified here. The normal pre-push gates check the final merged TypeScript program; publication and hosted CI are observed after the push.
