# D5: an assembled CSR file is not released until an approved, signed CSR covers it (2026-10-30)

Session `…01E8btkB`, D5 CSR-path lane (release). Found independently by two
of the sweep's finders, release and placement, and verified by hand. The
sweep's verifiers did not run: they failed on a billing error.

## What already exists

| Exists | Path | What it does | What was wrong |
|---|---|---|---|
| The assembly | `server/services/csr/csr-assembly-run.ts` (CSR slice 8, `b265d6fc0`) | Renders the body, §14, §14.3.3 and §16 files from the build job's own sections and stores each as `rendered_leaf_files` with `rendered_from = 'csr_assembly'` | — |
| Placement | `csr-assembly-placement.ts` `placeCsrAssembly`, served under `/api/csr/jobs` (eCTD Compile claims it) | Puts those files under 5.3.5.1 | It checks sequence state, appendices, staleness and placeholders, but no approval. The other lane's evidence assumed "the sequence's own freeze, validation, signature and dispatch gates ... still run" |
| The release rule | P-22: only approved documents are released. `DOCUMENT_NOT_APPROVED` (`dispatch-readiness.ts`) and `noteUnfinalized` (`leaf-source-resolver.ts`) | Every other store gives a verdict: co-author, unified, Vault, section | `rendered_leaf_files` gave none, in the readiness resolver and in the assembler. So an assembled CSR drew no `DOCUMENT_NOT_APPROVED`, freeze and transmit had nothing to refuse, and the compile reported it submission-ready |
| The CSR's approval | The Authoring document (scientific review, approval, Part 11 signature) | — | Nothing binds an assembly to an approved Authoring CSR, and the assembly renders from the job's outputs, not from the approved copy |

**What it allowed.** A model-drafted LMN-201 CSR could be assembled, placed,
frozen and transmitted toward FDA with no review, approval or signature
anywhere. It took two API calls, served in production. No screen calls them
yet: the control is on the CSR board, which production refuses.

## What changed

- `renderedLeafNotTransmittable` (`leaf-source-resolver.ts`): an
  assembled-CSR file reads "an assembled clinical study report, not bound to
  an approved and signed CSR".
  - The readiness resolver returns it as `notTransmittable`, so Validation and
    Dispatch show `DOCUMENT_NOT_APPROVED`, which blocks release.
  - The assembler notes it unfinalized, so freeze and transmit refuse.
- The server's own rendered forms and reports keep their rules.
- **Handed to the CSR end-to-end lane:** bind an assembly to the approved,
  signed Authoring CSR it was made from, or assemble from that approved copy.
  The verdict above is where that binding lifts the hold.

## Evidence: seen failing first

| Check | Red (`red.txt`) | Green (`green.txt`) |
|---|---|---|
| `rendered-csr-assembly-not-released.pglite.test.ts` (new): the readiness resolver says not approved | fails: no verdict | passes |
| The assembler notes it unfinalized | fails: 0 noted | passes |
| A rendered safety report releases as before (control) | passes | passes |
| `server/services/ectd` (129 files) | — | 1,715 passed. 1 failed, `lifecycle-parent-leaf-binding`, red on the committed code and fixed here (see below) |
| `server/services/csr` and the CSR job, compile, export, dispatch and transmit routes (51 files) | — | 408/408 |
| `server/services/submission-gateways`, `tests/golden-journeys` (66 files) | — | 617 passed. 18 failed: the slice-1 packaging baseline, same five files and counts |

**Also fixed:** `lifecycle-parent-leaf-binding.test.ts` (CSR lane,
`7c464cf1b`) has been red since it was committed. Its follow-up sequence
0001 kept the default type 'original', so the FDA identity rule (`6e3918f45`,
before it) refused a second Original Application. The fixture now records
0001 as an amendment. Red on the committed code:
`FdaSubmissionIdentityRefusal`. Green: 1/1.

## Disclosed (files another lane changed in the last 24 hours)

- `server/services/ectd/leaf-source-resolver.ts`: CSR lane (`b265d6fc0`).
  One exported function and two lines in the rendered branch.
- `server/services/ectd/__tests__/lifecycle-parent-leaf-binding.test.ts`: CSR
  lane (`7c464cf1b`). The sequence type in the fixture.
