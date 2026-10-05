# The typeset Module 3 leaf files every recorded character

Row **D2 / D7**. Corrects a regression in `af3df074c` (slice 01 of this lane),
found the same day by the discovery map's Module 3 mapper
(`typeset-emphasis-alters-recorded-values`).

## The defect

Slice 01 typeset the stored Module 3 composition with `marked`'s lexer. The
narrative and table cells are recorded text, not markdown, and the lexer read
them as markdown:

- Emphasis took asterisks: "Charge 2*3 kg, then wash 4*5 L." was filed as
  "Charge 23 kg, then wash 45 L.", and a cell "TAMC NMT 1*10^3 CFU/g; TYMC NMT
  1*10^2 CFU/g" as "… 110^3 … 110^2 …".
- A recorded numbered step was renumbered: "1. Dissolve / 3. Filter" became
  "1. Dissolve / 2. Filter".
- Lines starting "#", ">" or "---" became a heading, a quote or a rule, and
  their characters were lost.

`probe-before-after.txt` holds the text read back with pdfjs from trunk's
renderer and from this one, on the same input.

## The fix

`server/services/ectd/typeset-blocks.ts` no longer parses markdown. It reads
the one format its one writer emits
(`module3Composer.renderComposedSectionMarkdown`), and reads it exactly:

- the `## label` heading;
- the narrative, as literal paragraphs with every character kept;
- the appended `### title` + pipe-table blocks.

It undoes only the escape the writer makes (`\|` inside a cell). Content not
in that format is kept whole as literal paragraphs. The orchestrator's
composed-section path uses the same literal paragraphs. The `marked` lexer
path, the list and code-block kinds and `renderMarkdownLeafPdf` are deleted;
`renderComposedSectionLeafPdf` replaces them (`leaf-source-resolver.ts`).

The mapper proposed escaping markdown in the composer instead. That would
change the stored bytes, and with them every approved section's signed
snapshot, sending every approval back to "changed since it was approved".
Reading the format exactly needs no stored byte to change.

## Red, then green

`module3-leaf-typeset.test.ts` adds a round trip through the real writer. A
narrative of asterisks, underscores, backticks, brackets, tildes, "1." / "3."
steps, "#", ">", "---", "<LOQ", "&ge;" and a backslash, plus tables with
escaped pipes, an empty cell and an empty table, must come back
character-for-character. The PDF must contain "1*10^3 CFU/g", "2*3 kg",
"# not a heading" and "98.0–102.0% | anhydrous".

First run: 2 failed. Both came from a writer edge case, where a table with no
rows ends in one extra newline. The fix handles it, then 15/15 pass.
`server/services/ectd` and `server/services/cmc`: all green (see commit).
