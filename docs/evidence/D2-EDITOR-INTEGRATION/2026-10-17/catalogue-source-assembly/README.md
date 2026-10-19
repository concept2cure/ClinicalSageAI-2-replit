# Catalogue-first document assembly qualification

W1 / D2; canonical `concept2cure-v2`; initial source `ff5e065a7`.
User-authorized continuation of the existing editor assembly workflow, beginning
with explicit source selection in the data catalogue / Data Room.

The [contract](../../../../design/CATALOGUE_SOURCE_ASSEMBLY_2026-10-17.md)
keeps one editor, one structural build controller and one retained draft-review
path. Source IDs preserve Vault/Data Room namespaces. Whole-source verbatim
import remains available through the existing Work on document action.

## Delivered behavior

Explicit Project Data Room selections, current-project Vault details and the
editor's existing source rail offer **Build in editor**. One shared read-only
chooser lists the original project's saved working documents; it neither creates
documents nor starts generation. The exact document opens through the existing
dirty-work and ceremony guards, with the build disclosure and selected references.
The launcher, publisher and receiver retain the original account/session,
organisation and project visit. A late handoff cannot revive a previous visit.

Without AnA, the existing structural build adds missing sections with recorded
template content and saves source-reference intent, including when all target
sections already exist. It preserves existing prose, order and original import
provenance. With AnA, the existing candidate queue uses precisely the previewed
source spans, retains individual reviews and never accepts automatically. Manual
regeneration keeps that same selection. Source changes cannot become broader
project retrieval or adopt responses from a preceding selection.

The shared private source reader verifies current actor/project admission,
original and extracted-text hashes, exact excerpt coordinates/hash, current
version and data disposition. Preview, commit, generation and acceptance reuse
that reader. Acceptance reserves and rechecks selected sources before writing;
actual generation input survives candidate consumption in the chained audit.
Unknown commit/rollback outcomes remain held and discard their connection.

Source-reference intent, recorded generation input, citation support, scientific
qualification and filing approval are separate outcomes. A genuine linked CRE
identity is required for source lineage; an unlinked Vault upload remains uncited.
Selected readable excerpts are bounded to five sources and 8,000 UTF-16 characters
per source. Eligible retained text can be used without original bytes; the existing
**Work on document** import retains its separate original-file requirements.

## Qualification receipts

- [Backend](backend/README.md): 114/114 in nine files, including 48 authenticated
  assembly HTTP/SQL cases and complete planning coverage of 305 builtin outlines.
- [AnA server](ana-server/README.md): 89/89 in 12 files, including 14 new actual
  HTTP/PGlite cases for exact selected input, accepted audit persistence and
  uncertain transaction responses.
- [Source entry](entry-ui/README.md): final 50/50 source/dialog/channel cases,
  including meaningful failures and fixes for a publisher-to-receiver context
  change. The earlier 120-case surface regression is separately qualified.
- [Editor orchestration](orchestration/README.md): 60/60 in four files; source
  controller, native creation and actual Workbench build behavior.
- [Independent integration](independent/README.md): 27/27 actual client flows and
  existing AI review cases, including a demonstrated selection-switch fallback
  defect, late-response suppression, pinned-canvas handoff and held outcomes.
- [Browser](browser/README.md): final 10/10 actual client surface cases with
  synthetic HTTP; desktop/touch, light/dark and both build modes. Mobile wheel
  navigation reaches the final review and existing native editor.
- Root [combined tests](release/integration.json): 418/418 across 18 files on
  final production/test bytes, including source-first entry/build/AnA HTTP flows,
  existing import and from-draft behavior, source identities, provider source
  checkpoints and incoming batch termination receipts.
- Root [production build](release/build.json) and
  [compiler](release/typecheck.json) passed on the final synchronized source;
  the compiler reports zero errors against the unchanged zero baseline.
- [Nine editor/design/security gates](release/static-gates.json) passed.
  The [warning ratchet](release/warning-ratchet.json) passed for all 40 changed
  lintable files; no individual file increased its warning count. No baseline
  was raised.
- [Incoming canonical compatibility](release/canonical-compatibility.json):
  34/34 component and actual HTTP boundary cases after the final fast-forward.

The initial compiler run found 22 errors: source-reader narrowing and two test
fixtures. Explicit never-returning guard declarations fixed the production
narrowing without changing its refusals; the
[62-case HTTP remedy replay](backend/compiler-remedy/README.md) passed. The two
fixtures now use a properly typed PGlite query and named selector-array cases.
The latter correction also ensures malformed-selection assertions exercise
whole arrays. Initial compiler failures and earlier integration/build receipts
remain archived in `release/`; the final combined replay follows those remedies.

Owner receipts preserve exact before/after source hashes and original failures.
Some earlier runs include cross-owner dependencies that subsequently changed;
their pins describe their original replay, not later bytes. Root combined checks
and the definitive browser replay qualify the final integrated source set.
Canonical advanced from `ff5e065a7` to `8d06f7156` through disjoint company/legal,
branding and batch-draft evidence work before the 418-case replay. The final
fast-forward to `87824205c` adds BatchDraft termination handling and an exactly
shared classifier move. The [incoming review](release/canonical-incoming-review.json)
records no owned-source overlap; compiler/build and targeted incoming component/HTTP
checks follow that synchronization. No existing work was replaced. Counts above
overlap and must not be summed as distinct tests.

[Release checks and final source pins](release/checks.json) record 452 targeted
tests across 20 distinct files (418 integration plus 34 incoming compatibility),
the ten browser cases and current source-byte verification. The final
compiler/build follow the last canonical synchronization; the 418-case source
replay's production/test inputs still match the final tree. Earlier failed
compiler and pre-remedy receipts remain historical and are not counted as passes.

## Local testing limits

PGlite executes actual SQL and the HTTP suites use the canonical routes. Model
generation, selected transport faults and browser HTTP fixtures are synthetic.
These checks do not qualify native PostgreSQL concurrency/RLS, live providers,
export/transmission, human review or agency suitability. No provider/deployment
configuration or live provider call is part of this work.

The [local guide](../../../../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md)
contains 33 human cases; every case remains **Not run**. Codespaces/local testing
is the target; no deployment or agency transmission is authorized by this change.
