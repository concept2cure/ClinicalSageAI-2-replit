# D2: three small defects a reader sees at once: "1 submissions", a clipped outline pane, a caveat said twice (2026-10-31)

Found on the same Chromium walk ("The UI doesn't work / design", the founder, 2026-10-31).

## What already exists

- **CMC overview** (`client/src/concept2cure/v2/surfaces/CmcModule.tsx`, `CmOverview`). The lead sentence already counted in words ("spans 1 submission"). The line under the title, the lead's eyebrow and the Portfolio card did not.
- **The editor's outline-basis band** (`DocumentWorkbench.tsx` `.ed-basis`, styles in `authoring-v2.css`). It shows what the section tree was built from.
- **The provenance description** (`shared/rule-pack-provenance.ts`, `describeRulePackProvenance`). It joins the basis, the governing rule, the pack's own uncertainties note, and the review state.

## 1. CMC overview: "1 submissions — RPI — average"

**What the person saw** (`cmc-overview-before.png`):
- under the title, "1 submissions — RPI — average";
- above the lead, "Is your CMC package ready across all 1 submissions";
- in the Portfolio card, "1 submissions".

**Fix.** Each now counts in words. The title line says "1 submission — no preparedness index computed yet" when there is no index, and "N submissions — RPI x average" when there is (`cmc-overview-after.png`). The eyebrow reads "…ready for its submission" for one, and keeps "…across all N submissions" otherwise.

**Proof.** `cmcOverviewCompleteness.test.tsx`, "counts its submissions in words". The singular cases fail before the fix and the plural case passes (`01-red.txt`). After the fix:
- the overview suite passes, 18 of 18;
- every CMC client suite passes, 274 tests across 22 files.

## 2. The editor's outline pane cut its own text off

**What the person saw** (`outline-basis-before.png`). The "Harmonised standard" chip and "outline basis" label did not fit side by side in the 220 px pane. The band grew to their width, and the description wrapped at that width, so the right edge of every line was cut off ("Governing rule: IC…").

**Fix.** The label wraps under the chip, and the band's column never grows past the pane.

**Proof.** Measured live (`02-outline-basis-measured.txt`): the band's content was 237 px in a 219 px band, and the text ended 17 px past the pane. After the fix both are within the pane (`outline-basis-after.png`). This is a layout fix that jsdom cannot see, so its evidence is the measurement.

## 3. "Not reviewed by a regulatory professional" twice in a row

**What the person saw.** The IND pack's own note ends "Not reviewed by a regulatory professional; confirm against current FDA IND eCTD guidance before filing." The description then appended "Not reviewed by a regulatory professional." again.

**Fix.** When the pack's note already says it, the sentence is not repeated. When it does not, it is still added, so an unreviewed pack always says it is unreviewed.

**Proof.**
- `rule-pack-provenance.test.ts` has two new cases: once when the note says it, still said when the note does not. The first fails before the fix (`01b-red-provenance.txt`).
- After the fix, 38 of 38 pass, and `outlineProvenanceVisible.test.tsx` passes, 7 of 7.
