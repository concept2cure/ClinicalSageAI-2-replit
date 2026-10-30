# CSR drafting slices 3 and 4: work in progress, not landed

**Status: stopped mid-work on 2026-10-30.** The account's weekly agent limit stopped the worker. Nothing here is in the product. Slice 1 (`7b4a16cf8`) is landed and unaffected.

**What the patch holds.** Slice 3, revise by instruction, partly written:
- a read-only candidate read, `readDraftCandidate`, in `draft-candidate-store.ts`;
- `draftRevisionFor` and a revision prompt in `authoring-draft-template.ts`;
- the draft route's use of both (`authoring.router.ts`, CSR hunks only);
- the panel and editor-state changes;
- two new tests, `authoringDraftRevise.test.tsx` and `authoring-ai-draft-revise.pglite.test.ts`.

The worker's last step was the store-read test. Slice 4 (alternatives for a selected passage) was not started. The patch has not been verified green; treat its tests as red until they are run.

**To resume:** `git apply docs/evidence/D2-CSR-DRAFT-CONTROL/2026-10-29/slice-3-4-wip/csr-slices-3-4.patch.txt` on a tree where `git apply --check` passes, then continue from `brief.md`. It applied cleanly to `776d9da46`, alone and together with the P-72 slice-1a patch. The brief and the design (`docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md`, its decisions section included) bind the work.
