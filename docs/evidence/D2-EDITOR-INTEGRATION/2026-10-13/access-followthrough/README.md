# Existing editor: source access and current AnA context

W1 / D2 continuation from `1c7d319a` on `concept2cure-v2`. The existing
DocumentWorkbench and RichSectionEditor remain the editor, mounted by
DocumentAuthoring and the canonical ConversationThread / DocumentCanvas.
No surface, conversation, model provider, production dependency or migration
was added. Scope follows the [implementation contract](../../../../design/EDITOR_ACCESS_FOLLOWTHROUGH_2026-10-13.md).

## Changes and failing reproductions

The Vault rail formerly stopped at 25 search matches, kept an earlier query's
rows visible during a new read, and preferred stale browse-tree availability
over a newer matching search hit. Five regressions failed before repair.
Search now uses the existing project-scoped paged endpoint. More results
append to the loaded list; a failed later read retains that list and retries
the same offset. Query/project changes reject stale completions. Working-copy
intake uses the exact selected source and confirmed returned document id.
Same-file checksum/citation metadata is retained, with current search
availability taking precedence.

The search query's non-unique ordering could omit a source across page
boundaries. Real full-text PGlite reads with equal-ranked, equal-timestamp rows
and a physical reorder returned only 31 unique documents from 32 matches.
The canonical query now uses document id as its final sort key. The client
also treats overlapping pages as a changed result set with a working Refresh
search action, rather than silently consuming the remaining cursor. Missing
counts, duplicate rows and inconsistent empty pages remain read failures.

Native Word files with repeated coded headings formerly failed at the unique
section index. The converter now retains every title, body and source position
with unique deterministic working identifiers, and records displaced original
codes in visible warnings and import provenance. Superseded Vault sources,
including versions changed during conversion, are refused before either
creation or existing-copy reuse; the source id is never silently substituted.

At explicit AnA submission, the current canvas's saved section/version now
takes precedence over an earlier authoring attachment. A hidden retained
canvas refreshes only that exact attached document/section's saved version.
Project switches retain dirty native editor buffers while withholding
incompatible context and disabling insertion/remedies. Intentional source
removal and the existing saved-only context, model/version/quote and unsaved
work decisions remain in effect.

## UI and browser evidence

Paging reuses the existing `pf-search` / `pf-actions` layout and quiet button.
Failures use the canonical ErrorState renderer and retry controls. The source
intake drawer, status wording, palette, fonts and spacing use existing product
patterns. A browser check exposed low contrast for selected-row metadata;
the selected row now uses the existing `--text-200` foreground token.

[Vault browser results](vault-browser-results.json) cover three scenarios:
light desktop, light phone and dark phone, with 12 stage checks for later-page
failure, exact-source intake, changed results and refreshed results. Phone
contexts use real touch/coarse-pointer emulation. Every measured phone target
is at least 44px, with zero axe WCAG A/AA violations, page errors or horizontal
overflow. The probe loads the same shared stylesheet order as these product
components, including the canonical status-chip styles.

[Canvas browser results](canvas-browser-results.json) cover desktop and phone
through the actual ConversationThread → DocumentCanvas → DocumentWorkbench →
RichSectionEditor path. They verify explicit Enter, exact saved-section
context and one native editor, with no accessibility violation or overflow.
All five scenarios use actual product components/styles and synthetic local
API records. They establish local UI behavior, not staging, live-provider or
overall launch qualification.

## Validation and detailed evidence

The final combined regression run passed **309 tests across 32 suites**. It
includes native source conversion and canonical HTTP/SQL creation, exact edited
copy reuse and rollback, full IND catalogue coverage, stable tenant-scoped
paging, source UI recovery, saved context and dirty native buffers, existing
AnA model/unfinished-answer refusals, attribution, tracked remedies and the
one-shell contract. Legacy canvas/refusal fixtures now name a real project and
UUID section; their original outcome and refusal assertions remain intact.

- [Source conversion, version races and exact-copy reuse](source-import.md)
- [Saved AnA context, scope and dirty-buffer preservation](ANA_SAVED_CONTEXT_FOLLOWTHROUGH.md)
- [Stable full-text paging and tenant/current-version checks](VAULT_SEARCH_ORDER.md)

The complete TypeScript gate passed with zero errors, matching the zero
baseline. The production client/server build passed with its existing Vite
bundle-size advisory. The changed-file ESLint warning gate passed across 17
lintable files with three fewer warnings; no lint suppressions or warning
baseline changes were made. Design-system, token contrast/cascade, CSS
shadowing, phantom-token, generated text-ramp and fresh-build class coverage
checks passed. Canvas-path reachability and its failure-injection self-test,
single native canvas and AnA surface-context checks passed; all 116 covered
surface ids remain covered without raising their baseline.

The SQL scanner first rejected the sole added interpolation, then passed after
review: `supersededSql('d')` uses a fixed code alias in the existing canonical
version predicate. Source, project and tenant ids remain bound parameters.
Only the importer allowance changes from four to five sites, with its reason
recorded in the implementation contract and commit.

Scripted UI streams and in-process PostgreSQL tests do not qualify model
performance, independent-connection locking or production-role RLS. Original
forms, datasets and unsupported source structure retain their stated limits;
this pass does not declare the overall D2 or D5 launch rows green.
