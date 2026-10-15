# SEC-B-1/2 follow-ons a, b1 and b6: create, AI drafting and export apply the section figure rule

**Finding.** `ce56754d` made the section save refuse any image that is not a
governed upload or an inline PNG, JPEG or GIF. Three other doors still took
or filed any src, and the filed eCTD leaf printed a figure's src:
- (a) the authoring export and the leaf PDF;
- (b1) section create and org-template seeding;
- (b6) AI section generation.

The triage is in `../../triage/figure-followons.md`.

**Cycles.** Each was shown failing first:

| Cycle | Evidence | Reviewer's finding it closed |
|---|---|---|
| 1 | `red.txt`, `green.txt`, `mutant-*.txt` | — |
| Fix-up | `fixup-*.txt` | a declined figure with no alt printed its whole base64 payload as the export placeholder; the renderers took the patch in `authoring-blocks-to-{html,docx}.ts` |
| 2c | `r2c-*.txt` | a generated draft was double-escaped ("R&amp;D" in the editor, written back on save); `plainTextToHtml` moved to `shared/authoring/plain-text-html.ts` so there is one implementation; the leaf named a figure by the tail of its src |
| 2d (self-reviewed) | `r2d-*.txt` | an empty model body was stored as `<p></p>`, which the leaf resolver files as a blank leaf; now `""` |

The 2d cycle was reviewed by the lead against the round-2c reviewer's exact
points. The subagent weekly limit ended the independent review.

**Still open.**
- The router and co-author writers, in held files: work orders items 5 and 13.
- The eCTD resolvers' emptiness checks accept `<p></p>`, which the co-author
  editor writes when a person empties a document. They are next for this lane.
- `renderM26Html` is a second text-to-paragraph converter for the same column.
