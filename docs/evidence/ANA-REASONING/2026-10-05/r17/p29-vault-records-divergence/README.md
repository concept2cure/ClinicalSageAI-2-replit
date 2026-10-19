# File-to-Vault records a divergence rather than refusing it

Rows **D5** and **D1**. Decision **P-29.2**
(`docs/EXIT_ATTESTATION_DECISION_2026-10-18.md`). Round 17.

## Why this exit records and the three seals refuse

Filing to the Vault is the one exit outside the seal cone. It takes working
drafts **by design** and stamps *"WORKING DRAFT — not a sealed 21 CFR Part 11
record"* on page one. A draft attests only to itself, and its own gates stop it
being transmitted. Refusing it because the filing holds other text would
dead-end a draft for no gain.

But a filed rendition whose source sections' filed copies are not this
document's text is a fact about **this artefact**, so it belongs on the
artefact's own record rather than being reconstructed later from two stores.
That distinction is the decision, not an implementation convenience, and the
P-29 review's own synthesis made it explicitly: *"exits that take an UNSEALED
document by design must RECORD a divergence, not refuse it."*

## The change

`recordFiling` (`server/services/authoring/authoring-file-to-vault.ts`) calls
`filingAgreesWithEditing` on the filing client, **inside the existing
`LOCK TABLE authoring_sections IN SHARE MODE`**, so the answer is the one these
bytes were rendered from. The result goes on the export record's metadata as
`filingDiverged` — key, kind and the contributing section's code — and only
when there is something to say.

It cannot throw the export: an absent governed store or an unbound document
answers "nothing to compare", which is the same fail-soft posture
`commitSectionToFiling` takes through the same probe.

## Red before green

`server/services/authoring/__tests__/authoring-file-to-vault-snapshot.pglite.integration.test.ts`

```
× records on the filed rendition that the filing holds other text, without refusing the draft
  → the filed rendition says nothing about a filing holding other text:
    expected undefined to deeply equal [ { key: '12', …(2) } ]
✓ says nothing on the record when the document is bound to no filing   (control, passes either way)
```

After: 9 passed, including the six cases that were already there.

## Three harness facts worth recording

1. **The agreement check was a no-op in this harness until it was given a
   filing.** `authoring_documents` had no `c2c_document_id` column, so
   `filingAgreesWithEditing` answered "the governed document store is not
   provisioned here" and recorded nothing — the correct fail-soft posture, and
   also the reason the divergence case could not be written here before.
2. **The shared fixture's governed tables are minimal stubs for another
   suite.** `disposition-fixture.ts` creates
   `c2c_document_sections (id, document_id, status)` — no `section_key`, no
   `content` — because the disposition suite only needs a status. The columns
   the agreement check reads are added in this file with
   `ADD COLUMN IF NOT EXISTS`, so no other suite's expectations move.
3. **Two self-inflicted detours, both from assuming instead of reading:** a
   `CREATE TABLE` for a table the fixture already had (42P07), and an
   `expect(out.ok).toBe(true)` on a function that does not answer `{ ok }`. The
   second mattered more than it looked: it would have passed vacuously had the
   value been truthy for another reason, so the assertion is now the export
   record's existence, which is what "the draft still filed" actually means.
