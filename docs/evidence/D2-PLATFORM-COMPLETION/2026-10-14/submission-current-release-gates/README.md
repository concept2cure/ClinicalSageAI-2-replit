# Current Required deliverables release gates

W1 / D2 on `concept2cure-v2`, merged source base
`31ec977a619ebb380f8e06737b8692ab852e7d15`. The full source inventories identify
the uncommitted feature and final boundary repairs; the base commit alone does
not identify those working-tree changes.

| Check | Observed result |
| --- | --- |
| Canonical full compiler | 0 errors; 10,497 stable inputs; Node 22; 352.964 seconds |
| Actual production build | Exit 0; 46.664 seconds; existing bundle-size warnings retained |
| Global ESLint | Exit 0; 0 errors; 6,088 warnings across 8,515 file entries |
| Unchanged warning ratchet | Exit 0; no new warning baseline |
| Final affected backend replay | 69/69; prior five meaningful failures retained separately |
| Final actual native database replay | 38/38; observed process exit 0; 43 unchanged pins |
| Existing UI regression phase | 251/251 across 23 suites, before the later backend-only boundary repairs |

Native and live-browser proof have separate manifests. Native checks use actual
request authentication, the held request database client and FORCE RLS; they do
not establish production deployment or agency acceptance. Browser checks use
the existing application routes and development-only login with retained QA
records, without response mocks or generated editor targets.

The manifest seals exact compressed logs, compiler inventories and metadata.
The published ESLint report removes only optional embedded source text; all
messages and counts are preserved, and its full private original byte hash is
retained. It is explicitly a derived artifact.

Earlier failed and successful source phases are preserved under their original
directories. Whole-platform CI is not claimed green: the preceding fa39 hosted
native and integration failures have their own source-pinned censuses. Full
IND/NDA/BLA coverage, scientific verification of arbitrary binary content and
the remaining legacy Authoring read endpoints remain separate work.

After these gates, the ordinary upstream synchronization adopted
`6ffcb425284d68c159fbfc8c4af78e52b589504a`: a Review queue wording correction,
review fixture schema/auth alignment, and the identical 16 verified digest
dispositions. The Required deliverables readers, UI and native dependencies
were preserved. These full-gate inventories remain the earlier source phase;
the normal pre-push compiler and lint checks verify the final merged commit.
