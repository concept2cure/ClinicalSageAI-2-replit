# P11-C-2: who signed a protocol was shown once in the modal and then nowhere

Periodic review 2026-09-28, editor family, Part 11 lens (medium, confirmed
by its verifier).

Finalization and review dispositions each write an electronic_signatures
row with the 21 CFR 11.50 printed name, time, meaning and reason, and
nothing read it back: the workspace read model, the Reviews pane and the
protocol export carried no signer, and a decision recorded on behalf of a
reviewer with no account read like the reviewer's own.

- protocol-signature-manifestation.ts: one org-scoped read of
  electronic_signatures by signed_target (signer_name as recorded, UTC
  time, meaning, reason, on-behalf-of; revoked via isSignatureWithdrawn; an
  unreadable store stays on this facet as "unavailable", never "unsigned",
  and never blanks the workspace). No new columns: revocation stays true.
- The read model carries doc.finalization and review.signature; review
  rows print the signer, meaning and time, a revoked state, and "no
  signature on record" where one is expected. The protocol header shows the
  finalization's line.
- The export states the status and a signature block (name, UTC time,
  meaning, reason) before the content, so MD, DOCX and PDF carry it; a
  finalized protocol whose signature cannot be read is not exported.
- signatureMeaningLabel gains Responsibility.

Failing first: 29 of 30 new tests fail on the old code; 364/364 across 23
suites; 29/29 mutants caught.

Files: red.txt (before the fix), green.txt (after), mutants.txt.

## Not done here
- Reviewer disposition signatures are not on the printout, only the finalization. The same facet would supply them.
- `routes/protocol-export.ts` answers 500 for `SIGNATURE_UNREADABLE`; 503 would fit better.
