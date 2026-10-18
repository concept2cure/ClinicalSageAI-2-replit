# Document and section build qualification

W1 / D2, canonical `concept2cure-v2`, initial source `eceb747d3`.
Implements the [approved build contract](../../../../design/AUTHORING_ASSEMBLY_BUILD_2026-10-17.md)
inside the one DocumentWorkbench used by the Authoring surface and AnA canvas.

## Result

**Build document or section** connects the existing template catalogue to a
server-computed preview and an automatic, atomic structural build. The target
is the exact open working document. Choose the entire template or one section.
Existing sections, text, identities, indexes, citations, parent template and
provenance remain intact. Missing sections append in template order. Stored
organization-template text is copied; empty reference outlines remain empty
with explicit content gaps. No model request occurs without the AnA option.

The AnA option prepares selected empty, eligible sections in sequence through
the existing generation endpoint. Each retained candidate is reviewed in the
existing AuthoringAiDraft panel, beside the same native editor. Candidates,
edited bodies and reasons survive review switches. Stop retains a confirmed
in-flight result before halting; retry addresses remaining or explicitly
selected candidates. Nothing is accepted automatically. The queue limit is 20
candidates, with an explicit single-section remedy; structural assembly is not
limited by the unrelated from-draft section cap.

The server binds a candidate to its exact saved section base. Changed, missing
or malformed bases refuse before candidate consumption. Unsaved editor changes
also block acceptance. Unknown acceptance stays held; an explicit check shows
the exact saved text read-only beside the retained candidate without inferring
which request wrote it. Generation checks current project access and scopes
Data Room retrieval; an unbound document does not search every project.

All writes use the canonical transaction-owned section seed writer. Document
starts, single section creation and assembly now commit section content,
lineage, genesis and CREATE audit together. Preview is read-only; commit freshly
verifies authority, parent, template, section snapshot, code uniqueness and
ordering. No new schema, dependency, provider, CSS or editor was introduced.

## Verification

Counts overlap between runs; do not sum them as unique cases.

| Evidence | Result | Scope |
| --- | --- | --- |
| [Backend](backend/README.md) | 54/54 in six files | Actual HTTP/PGlite assembly and rollback, creator atomicity, saved guidance, placement, all regional templates, and all 305 built-in outlines |
| [AnA server](ana-server/README.md) | 53/53 in seven files | Saved-base and missing-base refusals before consume, current project access, scoped retrieval, single-use/expiry, accept/evidence rollback |
| [AnA panel](ana-core/README.md) | 41/41 | Existing panel behavior plus retained reviews, dirty/stale/receipt guards and exact saved-text inspection |
| [Orchestration](orchestration/README.md) | 12/12 | Sequential preparation, stop/retry, exact receipts, context guards, selective retry above the queue limit, controlled review continuity and recorded guidance |
| [Independent Workbench](independent/README.md) | 16/16 | Actual Workbench, controller, transport, native editor and existing review panel with synthetic HTTP |
| [Related regression](release/related-regression-final.json) | 266/266 in ten files | Canonical document starts/imports, template/source identity, locks, existing Workbench/conversation behavior and incoming source-checkpoint integration |
| [Root checks](canonical-integration/release/checks.json) | See final receipts | Related regression, official compiler/build, warning ratchet and existing editor/UI gates |
| [Browser](browser/README.md) | 8/8 | Actual embedded Workbench and product styles; desktop/touch light/dark; synthetic HTTP |

The planner exercises all 305 built-in templates: 4,308 rows in total, with a
maximum of 295 in the Module 5 preparation outline. This proves outline
planning, not that every template permits model drafting or that every
scientific section is complete. The regional HTTP checks exercise FDA, Health
Canada, EMA/EU and Japan metadata and drafting-region decisions.

Meaningful RED receipts are retained: single-section evidence failures formerly
left committed rows/order changes; semantic template-header changes escaped
the first fingerprint; an inherited 200-section cap refused a real 295-section
outline; stale and missing candidate bases were accepted; and existing panel
dirty/late-response guards were absent. Independent missing-disclosure evidence
is qualified as an absent feature, not an existing write defect. Fixture-only
errors and active-source/pin changes are documented separately.

The root related regression initially passed 222/230. All eight failures came
from a legacy AuthService mock hiding the newly used canonical session object.
The mock now preserves actual module exports while retaining its display-only
user stub; all assertions remain intact and the affected eight cases pass.
The official compiler also found nine test-fixture typing errors, corrected
with explicit PGlite projection types and the canonical typed no-project
publisher. No production diagnostic or baseline increase was involved; the
affected backend and independent suites were replayed after those corrections.

Six newer canonical commits were fast-forwarded to `4b0e3ff1e` before final
compiler/build qualification. They strengthen genuine AnA source-context and
generation checkpoints without overlapping the assembly implementation. The
266-case run includes their gateway and drafting-service integration checks.

Browser diagnostics also exposed real mobile defects: a long canonical template
label widened the controls, and a long expanded build panel became unreachable
in the bounded canvas host. Existing form classes constrain width. The workflow
now lives inside the existing document scroll region, preserving fixed header
actions and avoiding another scroll pane. The manual-wheel proof records the
last review control becoming reachable, rather than relying on programmatic
scrolling to conceal clipping.

The final frozen mixed integration passes [37/37](release/final-integration.json),
including 12 controller, 16 actual Workbench and nine saved-base HTTP cases.
The browser replay matches 23/23 production and 5/5 fixture pins. The historical
independent receipt predates four later controller/transport/state/queue refinements;
the final mixed integration and browser replay cover those final source bytes.
A stable Workbench callback alias then removes a new hook dependency warning.
New canonical audit changes at `accf8c6ba` were integrated before publication.
See the [combined qualification](canonical-integration/README.md) for final source
pins, current access/Vault safeguards and combined test/browser receipts.
The combined regression passes 313/313 in 12 files; frontend integration passes
242/242 in 11 files; AnA/Vault integration passes 75/75 in 11 files; the embedded
browser replay passes 9/9, including the exact read-only refusal. These counts
overlap and are not a unique-case total. Earlier receipts retain their original
source qualifications.

## Scope and handoff

The [local Codespaces guide](../../../../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md)
now has 27 manual cases. Every human result remains **Not run**. An unavailable
approved provider lane is recorded as blocked; no live provider was exercised
by this qualification. Build, candidate generation, candidate acceptance,
approval and filing remain distinct factual outcomes.

This workflow assembles missing template sections and their recorded content;
it does not overwrite existing prose or invent missing science. Unknown
template drafting eligibility, incompatible scope and preparation/original-form
restrictions remain explicit. It does not compose arbitrary saved machine
sections through a human-seed path or claim selected-source receipts where
only project retrieval was used. Component-owned recovery does not persist
across reload, remount or tabs. PGlite and synthetic generation do not prove
native PostgreSQL/RLS, live provider behavior, accessibility compliance,
independent human review, agency acceptance or deployment readiness.
