# Document fidelity: what reaches the filed document, 2026-09-24

**Launch rows:** D5 Part 11 evidence (F-40), D7 one real sequence (F-38), and
D4 validation package (all seven, recorded in VSR-001 §17).
**Scope:** seven defects in the paths that turn authored content into the
documents a sponsor files. Each one changed what a filed document says, or
what it claims about itself, and none produced an error.

**How the evidence was produced.** `red/F-xx.txt` is that finding's tests run
against the current tree with only that fix's logic reverted. Each file lists
the exact lines reverted; they were restored byte-for-byte after the run.
`green/F-xx.txt` is the same tests against the tree as committed. Every red
run exited non-zero on the named defect, and every green run exited zero. The
generator restored all sources, and `git status` showed only this directory
changed afterwards.

The red runs revert the fix inside today's tree rather than check out the
parent commit. The five 2026-09-05 fixes predate refactors of the files they
touch, so a transplanted parent file would fail on import rather than on the
defect. Reverting in place also shows that each test still catches its
regression today, which is what a gate is for.

## Findings

| Id | Defect | Red | Green | Commit |
|---|---|---|---|---|
| **F-34** | **FDA forms asserted facts nobody entered.** Form 3881 set `prescriptionUse` with `!== false`, so a device with no `device_information` was filed as "Prescription Use (21 CFR 801 Subpart D)". Form 3654 set `financialInterests` to `\|\| false`, and the renderer checked "No financial interests to disclose (Form FDA 3454 attached)" whenever that value was falsy. An unanswered form therefore carried an affirmative 21 CFR Part 54 certification under the certifier's typed name. | 2 of 6 fail. The rendered HTML carries `checked` on both boxes. | 6/6. Both are opt-in, and an unanswered Part 54 block says so. | `380bd650a`. The Part 54 half was found and fixed in parallel by another session, and its test is kept. |
| **F-35** | **A specification limit was deleted from the built .docx.** `htmlToOoxml` decoded entities *before* stripping tags. `&lt; 0.05% and assay was &gt;` became a literal `<…>`, which the next rule deleted as a tag. The chain also decoded `&amp;` first under a comment claiming this avoided double-decoding. In fact it caused it: an author's literal `&amp;lt;` became `<`. | 3 of 6 fail. The output is `'Total impurities were  98.0%'`. | 6/6. A single-pass decoder (`server/export/decode-html-entities.ts`) runs after every strip and is shared with the eCTD leaf fallback. | `cd716f6d6` |
| **F-36** | **A plain-text stand-in passed as the formatted PDF.** `puppeteer` is not installed, so the PDFKit fallback renders every HTML export. `renderHtmlToPdf` discards `usedFallback`, and the 510(k), PMA, CER and authoring exports all call it. Nothing in the file said that it lacked its typesetting. | 2 of 7 fail. The extracted PDF text has no notice. | 7/7. Page one states that it is a plain-text rendering and must not be filed as the formatted document. A Puppeteer driver is resolved without being required, and `puppeteer-core` against an existing Chromium was proven to render with `usedFallback=false`. | `b34301f6b` |
| **F-37** | **The PDF branch dropped what the DOCX branch kept.** One TipTap document is converted twice. `nodeToHtml`, used for every PDF, never read `node.marks`. The result read "10⁶ CFU/mL" in the .docx and "106 CFU/mL" in the PDF. Images returned `''`. Table cells ran together with no delimiter. An unresolved tracked change lost both marks, so the PDF stated one value as settled. | 4 of 6 fail: superscript, both sides of the change, table delimiters, and the figure marker. | 6/6 | `d52b24909` |
| **F-38** | **The FDA backbone declared a filing identity nobody supplied.** A missing application type defaulted to `?? 'fdaat1'` (NDA), so 510(k), De Novo and PMA dossiers, and every package built without an `fda` block, declared themselves New Drug Applications. The orchestrator passed an *application* type into the *submission*-type vocabulary, so every IND sequence was coded `fdast9`, "IND Safety Reports". | 4 of 5 fail. A 510(k) builds, and an original IND carries `fdast9`. | 5/5. Both attributes fail closed, and every caller now states the identity it holds. **Behaviour change:** device pathways cannot be packaged on the FDA eCTD backbone, which has no code for them. | `6d1b9a5df` |
| **F-39** | **A draft cut off at the token limit was filed as finished.** The gateway records `finishReason`. The drafting service dropped it, so a narrative truncated at 8,192 tokens was accepted into `coauthor_documents`, the source eCTD leaves are materialized from. The 400,000-character cap cannot catch a truncation that happens far below it. | 2 of 11 fail. The truncated draft is accepted with 200 and supersedes the version. | 11/11. 422 `DRAFT_TRUNCATED`, and nothing is written. | `e854953f8` |
| **F-40** (§11.70, §11.50(b)) | **The signature manifest printed a hash nobody compared.** The export computed the live hash of the sections with the same function the signing routes store as `content_hash`, and never compared the two. A filed document could carry "Signed by … / Meaning: Approval / Content hash at signing: …" above prose that hashed to something else. | 3 of 12 fail: no verdict, and a sealed record that no signature covers exports with 200. | 12/12. Every signature line carries a verdict. A sealed document whose signatures all fail to cover its content is refused with 409 `SIGNATURE_CONTENT_MISMATCH` before the EXPORT audit event is written. An AUTHOR signature from before later edits still exports and is marked as not covering the content. | `7087ae5c4` |

## Wider runs at the time of each commit

- F-38: 134 test files and 1,391 tests across eCTD, gateways, `tests/unit` and
  `tests/routes`; 526 files and 5,725 tests after the caller changes.
- F-39: 263 files. The 14 failures, in `deepening-tools.test.ts` and
  `intelligence-flow-sessions.test.ts`, fail identically with the change
  stashed and are pre-existing.
- F-40: golden journeys, authoring routes and authoring contracts pass, 66
  files and 499 tests. The IND journey signs and then exports against a real
  database.

## Limits

- **F-39:** the client sends the drafted content back to the accept route. A
  caller that omits `finish_reason` is not caught. Closing that gap needs a
  server-side draft record keyed by id, which is a schema change.
- **F-36:** the notice makes the degraded rendering visible, but it does not
  restore the typesetting. Styled output still needs `puppeteer`, or
  `puppeteer-core` with a Chromium, in the deployment image. That is a D1 image
  decision.
- **F-38:** whether device submissions should reach the eCTD packager at all is
  a routing question for the product owner. Refusing to build is correct, and
  labelling a device dossier as an NDA was not.
- These runs are local, with mocked HTTP and PGlite where noted. Evidence from
  staging with the production image is still owed under D1.

## Reproduce

`gen_evidence.py` in this directory produced every file here. From the repo
root, run `python3 docs/evidence/DOCUMENT-FIDELITY/2026-09-24/gen_evidence.py [F-xx ...]`.
Each finding's revert asserts that its anchor text still exists. On a tree
where the fixed code has since moved, the script stops rather than reverting
the wrong lines. It restores every file it touched, even if a run fails.
