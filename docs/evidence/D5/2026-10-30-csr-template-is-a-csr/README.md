# D5: a CSR made from a CSR template needs its scientific review, whatever its title says (2026-10-30)

Session `…01E8btkB`, D5 CSR-path lane. Found by the CSR path sweep's
scientific-review finder and verified by hand. The sweep's verifiers did not
run: they failed on a billing error.

## What already exists

| Exists | Path | What it does | What was wrong |
|---|---|---|---|
| The one CSR rule | `server/services/authoring/csr-scientific-review.ts` `requiresCsrScientificReview` | Decides from stored identity whether approving, signing, freezing, exporting or filing a document needs a scientific-review receipt | It read labels only, plus an import origin or an earlier receipt |
| The label rule | `shared/authoring/csr-scientific-review.ts` `labelledCsr` | "CSR", "Clinical Study Report" | Refused the plural, so "5.3.5.1 · Clinical Study Reports of Controlled Studies" was not a CSR |
| The template branch | the same rule | Passed `template_id` to the label rule | `template_id` is a UUID, so that branch could never match |
| The CSR templates | `ind-authoring-templates.ts`, `builtin-authoring-templates.ts` | The IND library offers `section:m5.3.5.1` and `section:m5.3.5.2` as AI-draftable narrative templates; the catalog has `registry:ICH_CSR` and `component:clinical_study_report` | Their ids were never treated as identity |
| The review dialog | `usePeerReviewDecision.ts` | Opened the CSR step from the labels | The same blind spot as the server |
| A third copy of the label rule | `server/services/ana/saved-document-critique.ts` `savedIsCsr` | AnA's critique of a saved CSR | Its own regex |

**What reached production.** An LMN-201 writer can open the editor, then
Project files, then IND documents, and choose "5.3.5.1 · Clinical Study
Reports of Controlled Studies". From there:
- the CSR is drafted and sent for review;
- the reviewer saw no CSR step;
- the approval, `/e-sign APPROVER`, freeze, export and file-to-Vault all
  passed with no figure mapped to a retained cell.

All of it is served under `/api/authoring` (document-authoring). The same
happened to a CSR made from the E3 template and then renamed. The D2 change
of 2026-10-29 tells sponsors to author the CSR in the IND project, and this
is the template they would pick there.

## What changed

- **`CSR_TEMPLATE_IDS`** (shared) lists the four built-in CSR templates by
  their stored id. They are written out, so the release gate does not load
  the template library. The new test proves each is the id
  `getBuiltinAuthoringTemplate` resolves to that entry.
- **`requiresCsrScientificReview`** treats a document made from one of them
  as a CSR. It reads the template from the stored row as well as from the
  caller's copy, because some callers select only some columns (the router's
  read at `authoring.router.ts:6527` carries no `template_id`). This is the
  same single query, shaped as before.
- **`labelledCsr`** accepts the plural ("CSRs", "Clinical Study Reports").
- **The review context** carries `csrScientificReviewRequired`, the server's
  own answer, and the dialog follows it. The label is the floor. When the
  answer cannot be read, the step is shown; the approval refuses either way.
- **`savedIsCsr`** now uses the shared rule, so there is one copy.

## Evidence: seen failing first

| Check | Red (`red.txt`) | Green (`green.txt`) |
|---|---|---|
| `csr-template-identity.pglite.test.ts` (new, real tables) | 5 of 8 fail:<ul><li>the 5.3.5.1, 5.3.5.2 and renamed-E3 documents are not CSRs;</li><li>the release gate resolves with no receipt;</li><li>the plural label fails.</li></ul>Passing on the committed code: the id pin, the 5.3.5.3 control and the negatives | 8/8 |
| `reviewDecisionCsrEvidence.test.tsx`: the step opens before any approval for a CSR the server names | fails: no panel | 4/4 |
| 68 files reaching the review context, the critique, the rule, `/sign` and the workflow steps | — | 1,293/1,293 |

## Not done

- A tenant's own template that is a CSR is not recognised by template. Only
  the built-in ones are. "Unknown native templates still require separate
  inventory qualification" stays the rule.
- The verifier's exact-number check inside a claimed span (the sweep's other
  scientific-review finding) is not addressed here.

## Disclosed (files another lane changed in the last 24 hours)

- `server/services/ana/saved-document-critique.ts`: CSR lane, slice 5 and the
  re-check (`0a2ee31fe`, `f09dc11dd`). `savedIsCsr` uses the shared rule, and
  nothing else changed.
- `shared/authoring/peer-review.ts`, `server/services/authoring/peer-review.ts`:
  one optional context field and its writer.
