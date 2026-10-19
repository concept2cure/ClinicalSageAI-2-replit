# Existing editor citation integration

W1 / D2 continuation from `920b230b` on `concept2cure-v2`. Contract:
`docs/design/EDITOR_CITATION_INTEGRATION_2026-10-14.md`.

The current editor now walks the complete paged project catalogue before
numbering references. New insertion choices require current eligible extracted
text. Citation insertion waits for server registration and retains the exact
document, section, selection and editor lifetime; refusal, cancellation or a
changed target leaves no new marker. The existing Vault rail awaits that
outcome, and Data Room reads validate scope and paging while hiding old search
actions immediately.

Canvas and export admission require a recorded citation in the exact section.
Other sections' admitted references still advance the one document registry;
an unregistered pasted marker cannot borrow their authority. Eligible recorded
historical references, including organization-wide sources and unfiled
documents, remain readable. New grounding and refresh check the current
source/project/disposition under the existing transaction and program lock.
DOCX/PDF and Vault filing use that supplied executor. Refresh refusals offer
specific current-source or project guidance through shared wording.

No editor, model provider, production dependency, route or migration was added.
The same source rows, disclosure, picker, error/retry states, typography and
theme tokens remain in use. Browser checks exposed citation text contrast and
the touch track-changes target; fixes use the existing accent text token,
missing-state styling and native control sizing. The generated text ramp was
refreshed. No lint/type baseline or gate suppression was added. The two SQL
helper fragments are explicitly reviewed in the contract.

## Verification

- `failures-before.txt` records the failing citation, scope, metadata and source
  read cases before the repairs. `browser-accessibility-before.txt` records the
  citation contrast and touch-target failures before their CSS fixes.
- `tests.txt`: **491 tests / 46 suites pass**, covering the existing editor
  directory, Workbench/Vault citation wiring, real PGlite citation writes and
  read scope, actual DOCX rendering, disposition, filing snapshots and XML
  figure fidelity. A later **39-test / 3-suite** check verifies shared refresh
  guidance and its route/canvas consumers. It does not increase the unique
  491-test count. The final Sources-rail freshness regression adds one unique
  case; all five catalogue tests pass after restoring refresh on rail open.
- The filing snapshot fixture now supplies the current membership/sharing
  records required by the existing imported-source verifier; the production
  verifier and its refusal were preserved. Source-usage fixtures apply the real
  existing versioning migration rather than omitting `is_current`.
- `typecheck.txt`: zero TypeScript errors against the zero-error baseline.
  Client and server production builds pass; the existing large-chunk advisory
  remains informational.
- `gates.txt`: design-system compliance, token contrast/cascade, selector
  shadowing, phantom tokens, text ramp, shipped component classes, canonical
  canvas path and its failing-path self-test, single native canvas, AnA surface
  context and SQL interpolation pass. `warning-ratchet.txt` verifies no warning
  count increase in any changed file. The normal pre-push check caught a final
  effect dependency warning (`warning-ratchet-before.txt`); using the stable
  retry callback fixed it without changing the baseline.
- `browser-results.json`: nine scenarios across desktop/touch and light/dark
  themes for IND/Data Room work, source intake, import limits, AnA remedies and
  the one conversation canvas. `citation-browser-results.json`: three further
  desktop/touch/light/dark scenarios read **201 sources**, retain historical
  numbering, refuse a pasted current-section marker, refuse an insertion, then
  register and insert successfully through the same editor. All **12** have no
  browser errors, horizontal overflow or WCAG A/AA violations.

Browser APIs are intercepted with synthetic records. The AnA send is observed
through the existing shell conversation seam; no live provider request occurs.
Database and DOCX tests use real PostgreSQL semantics in PGlite and real Word
rendering. External storage/scanner and live concurrent database locks are not
qualified by these local checks.

## Reproduction

Run the scoped Vitest files above with `vitest.config.ts`. Browser harnesses are
saved as `browser-harness.txt` and `citation-browser-harness.txt`, with the
actual-component fixture in `browser-probe.txt` and the complete deterministic
IND catalogue in `browser-catalog.json`. Restore the fixture to
`.visual-qa/editor-consistency/probe.tsx` with its root HTML and serve it with
Vite on port 5174. The harnesses use system Chromium, Playwright and axe, and
record the full mocked request contract. They never invoke a production API or
add fixture data to the product.
