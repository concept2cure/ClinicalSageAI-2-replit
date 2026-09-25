# LX-00 (D4, serving D7/D10): the founder-path walk test

`tests/lineage/founder-path-lineage.pglite.test.ts` walks the founder's path through
the **real services**, one `it` per hop:

project → Data Room capture → AnA canvas draft → edit and save → seal → file to Vault
→ place as leaves → freeze, dispatch and transmit (FDA ESG gateway, wire stubbed)

It then walks **back** from the transmittal to the project and to
`cre_evidence_sources.checksum = sha256(X)`, and **forward** from the project and
the source, by recorded keys only.

Only what leaves the process is stubbed: object storage (in memory, same
interface), PDF rendering and extraction, embeddings, and the agency wire. The real
gateway, its guard and its transmittal ledger all run.

## The baseline is shrink-only

`founder-path-lineage.baseline.json` lists each check that is broken at HEAD. Each
entry records the verified finding, the LX fix that closes it, and the exact value
the check observes today. The run fails when:

- a check that is not baselined fails;
- a baselined check passes (delete its entry);
- a baselined check fails on a different value, or throws anything other than an
  assertion;
- an entry names a check that did not run;
- the baseline grows past its ceiling.

The builder showed each of those failing (`lx00-neg1…4` logs in the session
scratchpad). This session showed the second one when the save fix landed: the run
failed with "now PASSES … the baseline only shrinks".

## At HEAD after `eb1073a6` (`01-walk-at-head.txt`): 26 green, 18 baselined red

- **Holds:**
  - the project, its chained creation audit, its scaffolded filing;
  - the source under sha256(X) in the project's Data Room;
  - the document in the project;
  - genesis revisions and the chained edit;
  - the seal hashes and the approver signature binding;
  - the Vault row in the project and its filing audit;
  - the filing copy naming its seal;
  - both leaves pinning their digests;
  - the transmittal hashing exactly the bytes that left;
  - the audit ledger verifying;
  - project ← leaves and sequence.
- **Red, first break on the path: AnA.** The canvas tool takes no sources, records
  no model and no turn, and writes no source span (LX-06). Every later lineage check
  inherits that break.
- **Red elsewhere:**
  - capture bytes on local disk (LX-02);
  - spans not bound to revisions (LX-08);
  - the seal not binding lineage (LX-09);
  - Vault filing not naming the sealed version (LX-10);
  - placement audit (LX-11);
  - transmit not reachable from the product, bytes not retained, and the
    transmittal naming no sequence or project (LX-12/13);
  - the Data Room not showing use (LX-14).

## Found by this test

- **LX00-F1:** every section save failed. Fixed in `eb1073a6`
  (`docs/evidence/D2-AUTHORING-SECTION-SAVE/`).
- **Project anchoring:** `submissions`, `ectd_sequences` and `submission_transmittals`
  carry no project key, and the transmittal's `program_id` is NULL. The only
  recorded sequence → project link is the project-creation audit row. This goes to
  the project-anchoring audit's PF fixes.

Every hop with no project key is where the project-first principle
(`docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md` §0) does not yet hold.
