# W1 / D2 retained compositor identity in the existing summary

The existing `DocumentAttributionSummary.spans` projection now includes
`machineAuthorId: string | null`, copied directly from the retained span. The
read model can distinguish `workflow_import` from `ana` without treating a
deterministic stored-source copy as AI generation. This does not identify the
original source's author or qualify a model. Source and author assertion spans
return null.

There is no schema, provenance-kind, governance, character-count or precedence
change. The existing `byKind` arithmetic remains authoritative; overlapping
display spans must not be summed to invent new counts.

The new PGlite case failed before the projection because all four identities
were omitted. It now preserves workflow and AnA identities and nulls while
asserting the same exact character partition. The final run passed 68 tests in
five summary, selection, unaccepted machine, document HTTP and deterministic
PDF files. Scoped lint has zero errors and the same three existing warnings;
the prior test-file lint log demonstrates its pre-existing long describe block.

Logs: `red.txt`, `green.txt`, `lint.txt`, and `test-lint-before.txt`.
