# SEC-C-7: a review bound to an account was listed under whatever name was typed beside it

Periodic review 2026-09-28, editor family, security lens (high, per its
verifier).

The review assignment stored reviewer_name exactly as typed next to
reviewer_user_id, so a review bound to colleague B could be listed as
"Dr A", and once B signed, the Reviews pane and the signing dialog printed
"Dr A" over B's disposition. The AnA tool assign_protocol_reviewer wrote
the same way through the same function.

- assignReviewerTx resolves an account's name on the server
  (resolveSignerIdentity, the name a signature from it prints), stores
  that, and refuses a different typed name (case and spacing ignored;
  blank means the account's).
- The disposition signing dialog no longer prints a stored label for an
  account-bound review; only the assigned account can sign it.
- The request drawer says an account is listed under its own name.
- protocol-signature.pglite: its users table gains title (read by
  resolveSignerIdentity), and the REVIEWER account is named as its
  assignment helper already labels it.

Failing first: 7 of 11 new tests fail on the old code; 150/150 across 9
suites; 10/10 mutants caught.

Files: red.txt (before the fix), green.txt (after), mutants.txt.

## Not done here
- **The request drawer cannot show the account's name read-only yet.** `C2CForm.tsx` has no read-only or derived field. Until it does, a conflicting typed name is refused by the server and the drawer shows its sentence.
- **Older assignment rows** may carry a label that is not the account's name. A signed one now shows the signer from the signature row (P11-C-2); an unsigned one still shows the label.
