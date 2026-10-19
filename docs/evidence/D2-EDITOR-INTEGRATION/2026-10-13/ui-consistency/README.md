# Editor UI consistency continuation

Launch row D2 / W1. This continues the existing editor integration on
`concept2cure-v2`, starting from `e198f24a`. DocumentAuthoring and DocumentCanvas
still mount the same DocumentWorkbench and RichSectionEditor. No editor,
authoring store, model provider, migration or production dependency was added.

## References and changes

The [design system](../../../../../design-system/README.md),
[token contract](../../../../../design-system/colors_and_type.css),
[authoring kit](../../../../../ui_kits/authoring/README.md),
[accessibility rules](../../../../../.claude/skills/accessibility-enforcement/SKILL.md)
and [one AnA, one canvas decision](../../../../design/ONE_ANA_ONE_CANVAS.md)
govern this pass. Corrections reuse the existing scope switch, data-entry
drawer, quiet source metadata, native details and redline treatments.

- Source and IND lanes now show their selected state. Search remains above
  the scrolling list; entries reveal details and actions on demand.
- Working-document states use the existing reader-facing status vocabulary.
  Catalogue and document read failures offer retry. Unmatched searches offer
  a working clear action.
- Source intake explains its required 8–2000 character reason before a
  request. Availability reasons remain visible and associated with disabled
  actions. Original hashes, conversion limits and warnings retain their
  provenance disclosure after intake.
- AnA review options and long remedy passages use native keyboard-operable
  disclosures. Reasons, tracked-change actions, saved/unsaved caveats and
  refusal explanations remain visible. Chrome uses the canonical sans stack;
  document passages use the reading serif and existing semantic redlines.
- Every editor AnA request reaches the existing ConversationThread and waits
  for explicit submission. The private editor input was removed. The same
  DocumentCanvas, DocumentWorkbench and RichSectionEditor remain reachable
  beside the conversation, with the exact saved document and section.
- Standalone requests retain the existing unsaved-work decision. Embedded
  requests snapshot saved section context before the phone canvas is hidden;
  the same mounted editor retains the local buffer. A later section request
  replaces an earlier pending request's context. No unsaved text is sent.
- New controls use canonical palette, spacing and radius tokens. Mobile
  controls retain 44px targets in all source-dialog hosts. Known off-palette
  and mismatched editor token fallbacks were removed without changing the
  normally loaded token values.
- Vault search retry issues a new request for the same query. Search hits
  retain server availability, disposition and current-version metadata so
  unavailable sources cannot misleadingly offer an editable working copy.

## Browser evidence

[browser-results.json](browser-results.json) records **9 Chromium scenarios**:
light/dark desktop source rails, a mobile source rail, mobile and dark desktop
source drawers, a dark mobile provenance disclosure, dark mobile AnA fixes,
and the canonical conversation with its existing editor on desktop and phone.
Expanded IND entries, successful import receipts and expanded redlines are also
checked within these scenarios.

The conversation checks verify a prefilled composer without an automatic
request, explicit Enter submission with the saved target section, and exactly
one native TipTap editor. Its ribbon labels also satisfy WCAG's visible-label
requirements while retaining their existing shortcuts and actions.

All scenarios have **zero page errors, zero horizontal overflow and zero
axe-core WCAG A/AA violations**. Keyboard checks cover Enter on disclosures,
visible focus rings, the import drawer's focus boundary and Escape dismissal.
Every measured mobile control meets the repository's 44px target requirement.
The light root resolves `--accent-100` to `#d97757` and `--bg-000` to `#faf9f5`;
the dark root uses the actual application's class and `data-theme` attributes.

Screenshots contain synthetic projects, sources and turn records. The IND
catalogue is generated from the real canonical builder. The probe renders the
actual product components and styles through a local Vite server; only API
responses are intercepted. Playwright and axe-core are external audit tools,
not application dependencies. This is local UI evidence, not staging,
deployment, live-provider or full launch qualification.

## Regression evidence

The initial library checks failed on raw status codes, missing document-read
recovery and missing clear-filter recovery. The repaired tests pass. Separate
Vault regressions cover retry without query changes and refusal from missing
original, withdrawn and earlier-version search results.

Both embedded-context regressions were reproduced failing before correction:
a phone review after the initial origin was spent omitted saved section context,
and switching sections before the first send retained the earlier section.
Both now pass through the actual conversation and native editor. They verify
the current section id, code and saved timestamp, retain local unsaved text,
and assert that no save is issued and no unsaved text enters the request.

UI, native proposal, scope, exact-ID handoff and source-intake checks are listed
in the parent evidence and scoped [source UI audit](../source-ui-audit.md) and
[AnA UI audit](../ANA_UI_CONSISTENCY.md).

The final combined regression run passed **246 tests across 23 suites**. It
covers the canonical conversation handoff, actual native editor insertion and
remedies, scope and saved-version refusals, context replacement on phones and
after section changes, source intake and provenance, library and Vault
recovery, accessible controls, Markdown, follow-up actions, record rails,
citations, cross-references and the one-shell contract. The five migrated
capability suites preserve their original outcomes through the canonical
conversation instead of asserting a second editor input.

The production client and server build passed. The canvas-path gate and its
failure-injection self-test passed, including deliberate breaks in each
required link and the founder walk. The single native canvas and AnA surface
context checks passed: **116 of 121 routable surfaces remain covered**, with
five existing exemptions and no baseline increase. Design-system, token
contrast, token cascade, phantom-token, CSS shadowing, fresh-build component
class coverage and generated text-ramp checks passed.

The complete repository TypeScript check passed with **zero errors**, matching
the zero baseline. The changed-file ESLint warning gate passed across **40
lintable files**, reducing the warning count by three. The final source UI and
canvas suites passed again after their fixture and lint corrections (4 and 21
checks), with zero scoped lint warnings. No lint suppressions, warning
baselines, token exceptions or dependency manifests were changed.

The tests use scripted local streams and emit existing React `act` warnings;
those messages do not establish provider performance. This continuation does
not qualify a model or declare the complete launch rows green.
