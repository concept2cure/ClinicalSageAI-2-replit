# Existing editor browser evidence

Scope: W1 / D2, saved IND template oversight in the existing editor under
[the published contract](../../../../design/EDITOR_TEMPLATE_OVERSIGHT_2026-10-14.md).
The directly runnable [fixture](browser-eval-fixture/reproduce.txt) imports the
actual DocumentCanvas, DocumentWorkbench, RichSectionEditor and TemplateGuidance;
no replacement editor or product styling is used.

The recorded synthetic contracts cover all five actual modules: Form FDA 1571
preparation in M1; Clinical Overview narrative in M2; Drug Substance General
Information narrative in M3; nonclinical module-outline preparation in M4; and
Case Report Forms and Individual Patient Listings preparation in M5. A sixth
case preserves the GLP compliance statement deliverable's null recorded module.
Every working document was deliberately renamed. Its exact original template
ID, entry ID, version, SHA-256, kind, drafting flag, authoring mode, format and
limits remain recorded facts, independent of those new names.

The synthetic actor's regulatory-author role and allowed access response are
explicit fixture inputs. Every `/api/**` request is intercepted; unknown paths
and any mutation fail qualification. Each of the four existing oversight
actions reaches the actual Workbench `onAsk` conversation-prefill boundary,
including exact document/section IDs and recorded source facts. The host records
that callback and has no composer or stream implementation. Canonical standalone
conversation routing is independently covered by the root-owned UI suite.

Final capture passed after the lead froze production at base `269d2c18` plus
the working change. [Summary](browser-summary.json), [aggregate checks](browser-final-checks.json)
and the four context reports retain source and executable fixture SHA-256 pins,
the exact API contract, unchanged authored text, recorded source header,
complete section guidance/limits, all prefill callbacks and intercepted requests.
The production and executable fixture hashes still matched after capture.

After capture, the lead synchronized to base `71444466` and amended only the
server-side saved-template-review helper so empty JSON example/prompt fields do
not hide missing section guidance. The captured server-context SHA-256 changed
from `d3bf39a482e1c74132e23ba171872db4b4242b1dca194a6c217c1c7ee75a279c`
to `1d5d3e89b7080a5bdfefe941837a5ba881dc0ef6eb8326b7a831fa3451bcf703`.
[Post-capture reconciliation](browser-post-capture-reconciliation.json) retains
both original capture files byte for byte and records the explicit backend delta;
it does not refresh their captured hashes. All other 12 production source pins,
all 9 fixture asset pins, all 159 modules in the resolved static runtime graph
and all 13 style/data assets remained unchanged. The amended helper is absent
from [the browser runtime import graph](browser-runtime-import-graph-proof.json)
and is not executed by the intercepted fixture APIs. The independent backend
suite qualifies that amendment separately; no browser replay was needed.

| Context | Cases | Stage captures | Minimum visible editing viewport |
| --- | ---: | ---: | --- |
| Desktop light, 1440×1000 | 6 | 18 | 1104×320 |
| Desktop dark, 1440×1000 | 6 | 18 | 1104×320 |
| Touch light, 390×844 | 6 | 18 | 298×110 |
| Touch dark, 390×844 | 6 | 18 | 298×110 |

All 24 cases and 72 stage captures passed. There was one native editor throughout,
and all 48 editor/prefill captures include the complete visible synthetic paragraph.
All 96 oversight callbacks preserved exact saved document, section and recorded
template source IDs/limits. There were zero automatic mutations or stream requests,
unknown API endpoints, browser console errors, page exceptions or axe violations.
The known Vite host PID `2846` was stopped after final capture.

[Strict ESLint](browser-fixture-strict-eslint.txt) passed all seven executable fixture
files with zero warnings. [Relative-import proof](browser-fixture-import-proof.json)
resolved all 16 relative imports, including 13 imports of actual tracked production
sources. No production file was edited during evaluation.

Opened guidance uses the editor's native scroll region. A long disclosure can
place the paragraph outside the current viewport; closing it and native scrolling
to the paragraph restores the measured editable viewport. Editor and prefill
captures require at least 250×100 visible pixels and the full synthetic paragraph
inside the visible editor. Guidance captures record their actual viewport, even
when the paragraph is below it, rather than claiming simultaneous visibility.

This evidence qualifies local rendered wiring and conversation-prefill callbacks.
It does not qualify live AnA/model behavior, backend authorization, saved-review
paging, RLS, database persistence, deployment, original-record verification or
regulatory readiness. Automated axe passes are not a complete WCAG audit;
incomplete rules remain for manual review.
The incomplete rules observed were `aria-prohibited-attr`, `color-contrast` and
`label-content-name-mismatch`; their exact node targets remain in every stage's
metrics and context report.
