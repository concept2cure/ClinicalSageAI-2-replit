# Legacy panel lint and final expression

The first --max-warnings=0 production lint attempt found two existing AuthoringAiDraft warnings: function length and complexity. The pre-change canonical blob has 301 counted lines and complexity43. The first patch has 300 lines/complexity44, with unchanged warning counts; its initial counts-only comparison and source inputs remain historical.

Root changed only the default/input merge expression from nullish choice to object spread. Typed full generation inputs behave the same; the existing panel warning metrics now remain at or below the canonical values. The final checker enforces both warning counts and their numeric metrics against the actual canonical pre-change blob, with no lint baseline or suppression change. Other three production files and worker fixtures use strict zero-warning lint. Final tests/gates/build use final-source-freeze.json; original qualified-source-freeze.json and receipts are retained as historical.
