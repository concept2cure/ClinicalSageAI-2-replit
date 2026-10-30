# Regional redrafting through the existing source-first editor

The existing `sourceFirstAssemblyFlow.test.tsx` mounts the actual source chooser,
DocumentWorkbench, assembly controller/queue and individual AnA review panel. The
same synthetic HTTP fixture supplies scoped source manifests, template plans and
draft candidates. Its existing unrelated panel mocks remain unchanged. No
replacement editor/host, browser session or live provider is introduced.

The existing two-mode source-preservation case is extended to four verified plan
regions: FDA, EMA, PMDA and Health Canada, retaining coverage of both existing
consumeDeepLinks values. Every case travels chooser → exact working document →
template → build → review → another section → Close → original review → Draft
again. Nonempty per-section template guidance is checked inside the bounded
reference JSON, separately from trimmed author requirements and exact selected
source manifests. Editing the assembly form's requirements after the build must
not change the retained candidate's regeneration request. The regenerated HTTP
body must equal the captured original body. No acceptance/PATCH, duplicate
structural commit or duplicate editor is permitted.

`red.json` records a focused pre-fix run: exit 1, four behavioral failures and nine
skipped controls. All reach the request-body equality assertion. FDA loses
context and requirements; EMA, PMDA and Health Canada also silently become FDA.
The exact source manifests already survive, and their assertions pass.
`red.log` retains raw combined output; `red-source-snapshot.json.gz` retains the
test, production owners and configuration. Metadata records SHA-256 before/after
hashes with no source drift. `run-check.py` runs only this fixture or strict lint.

The first post-fix full run (`green.json`) passes all 13 cases. Its separate
strict lint run (`strict-lint.json`) truthfully records exit 1 for an unqualified
`structuredClone` global. The fixture was corrected to
`globalThis.structuredClone`, preserving the same captured request and assertions;
no lint rule/baseline was changed. Final full-suite and strict-lint results are
retained separately.

Independent review found no blocking issue in the four production changes. The
queue copies professional tone, verified region, bounded reference context and
trimmed requirements before awaiting generation. The existing review buffer owns
editable options; the hook merges explicit edits from its latest state and
copies the invoked options before generation. Source/section/project authority
continues to come from the existing request owner and session, and selected
sources remain separate. Failed generation still preserves the prior candidate,
body and reason. Existing currentness, acceptance holds and explicit acceptance
paths remain unchanged. The panel's existing controls, markup and styling are
reused, with no inference from optional provider metadata or mutable build fields.

`final-green.json` records the first corrected fixture qualification: all 13
actual source-first editor cases passing, exit 0, with no React diagnostics.
`final-strict-lint.json` records exit 0 with empty output (zero errors/warnings).
Both remain historical after the root's final equivalent panel expression:
existing defaults are spread before the retained generation inputs, preserving
the existing complexity metric instead of increasing its baseline. Independent
review confirms retained fields override defaults; no source/target authority,
controls, layout or request behavior changes.

`settled-green.json` and `settled-strict-lint.json` qualify that final expression
with the unchanged fixture. `final-source-freeze.json` compares their hashes with
current files; the preceding freeze remains in `pre-settled-source-freeze.json`.
`artifact-manifest.json` hashes the packet artifacts. No helper extraction or
assertion removal was needed.

Automated jsdom with synthetic HTTP does not establish scientific correctness,
live-provider availability, real agency delivery, or completed human testing.
