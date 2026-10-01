# The report seal: stored, read back, re-verified (reporting review 2026-10-01, Part 11)

Finalize stored `{ seal, finalizedAt }` over a render nothing could reproduce, and nothing read it
again. Now:
- finalize stores the sealed document beside its seal;
- `GET /runs/:id/seal` reads the act back and re-verifies it;
- `GET /runs/:id/rendered` shows a final run as the verified sealed document, or refuses.

Code: `server/services/report-os/sealing/run-seal.ts`, `server/services/audit/chain-row.ts`,
`server/routes/report-os.ts`.

## Three rounds of adversarial review

`verifier-results.json` holds every reviewer's full return, from workflow `wf_02901519-e7b`.

1. **Ten defects in the first version, all fixed in `82450092`:**
   - a forged or stale seal read as intact;
   - fields returned beside "intact" that were never checked;
   - a removed document read as "not verifiable";
   - duplicate finalization rows went unseen;
   - and others.
2. **Re-verification.** Each fix holds. Three regressions no test would catch were found, plus a
   status-rewrite gap. Tests were added, and every one was shown failing on a mutant copy
   (`mutations-round-1/`, 6 mutants, all caught).
3. **A fresh review found five new defects.** All are fixed in the commit that files this directory:
   - **High.** The app role could insert an *unchained* `report_os.run_finalized` row. The trigger
     lets such a row through as legacy, and the reader trusted it. Three app-role writes made a
     never-finalized run read "intact" over a forged document. The finalization row must now:
     - hold a chain position;
     - re-derive from the predecessor its writer linked it to;
     - carry a valid HMAC seal over that link wherever `AUDIT_HMAC_KEY` is configured
       (`chain-row.ts verifySequencedRow`).

     The finalization's electronic signature must also exist and must have signed the same seal hash.
   - **Low.** A legacy finalization whose seal was removed from a snapshot that still exists read
     "not verifiable". It is now a mismatch.
   - **Low.** A malformed stored document crashed verification with a 500. It is now a failed check.
   - **Low.** Check details contradicted each other when the chain check failed. The other checks
     now say "Not checked", and none claims agreement.
   - **Low.** Reading the status before the chain let a concurrent finalize read as a mismatch.
     The chain is now read first, then the status inside the same transaction, then the chain again
     if needed.

## Shown failing first

- `red/dbtest-previous-run-seal.txt`: the real-database suite against the previous `run-seal.ts`.
  The forgery case fails: app_service, RLS on, the forged run read as not a mismatch.
- `red/unit-previous-run-seal.txt`: 22 of the 45 unit cases fail against the previous module.
- `mutations-round-2/`: six mutants of the new protections, each caught.
- `dbtest-with-hmac-key.txt`: 16 of 16 with `AUDIT_HMAC_KEY` set. The real writer sealed the
  finalization row, and the reader verified that seal on a real chain.
