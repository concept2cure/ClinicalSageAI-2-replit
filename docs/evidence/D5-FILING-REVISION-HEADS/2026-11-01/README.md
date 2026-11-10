# A Vault filing names the revision of each section it rendered — 2026-11-01

Package **L1**, row **D5** (Part 11 evidence: which prompt, model and source produced a section of
the dossier). It completes **LX-10** of `docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md`, the item
"the chained row carries … revision heads". Gap analysis:
`docs/design/AI_PLATFORM_BLUEPRINT_GAP_2026-10-25.md`, capability 7.

## What was missing

AI provenance is recorded at the section level when a draft is written and accepted:
- the revision's `origin` (`ai-draft-accept`, `genesis`, `human-edit`, …);
- `inputs.contributors`, the machine authors;
- the audit trail row's `generator`: model, provider, prompt hash and turn record.

The Vault filing's chained row (`authoring.document.file_to_vault`) recorded the document version
and a digest of its sections, but not which revision of each section it rendered. A filed
rendition, and the eCTD package that carries it, could not be walked back to who or what wrote
each section.

## What already exists (RULE 3)

- **The revision ledger**, `doc_revisions` (`server/services/authoring/revision-ledger.ts`). It is
  append-only by trigger and hash-chained per section, with `origin` and `inputs`.
- **The filing receipt.** `recordFiling` in `server/services/authoring/authoring-file-to-vault.ts`
  writes it, inside a `LOCK TABLE authoring_sections` and a REPEATABLE READ transaction.
  `readAuthoringVaultFilingReceipt` (`authoring-vault-filing-receipt.ts`) reads and verifies it,
  checking payload hash, chain link and seal.
- **The package governance record.** The receipt's derivation travels into it:
  `server/services/ectd/assemble-from-core.ts:407`, `sources[].derivation`, outside the eCTD
  backbone.

## What changed

- **At filing.** In the same lock as the sections, `readFiledSectionRevisions` reads each filed
  section's head revision. The receipt records, per section, `{ sectionId, code, revisionId,
  origin, chainSha256, machineContributors, matchesFiledText }`. `matchesFiledText` is false when
  the head's content is not the text that was filed, so that case is stated, never assumed. A
  section with no revision records `revisionId: null`.
- **On read.** The receipt reader projects the heads onto the derivation, so they reach the package
  governance record. A receipt from before this change states none: the key is absent, never an
  empty list. A malformed entry makes the receipt `unverified: receipt_malformed`.
- **No schema change.** The heads go into the chained row's payload, which already exists.

## Proof

- **Red:** `red/revision-heads-on-unchanged-filing.txt`, three cases against the unchanged filing
  and reader.
- **Green:** `green-summary.txt`, four suites, 85/85: file-to-vault, the receipt reader, the
  snapshot suite and approval carry.
  - The file-to-vault case drafts a document through the canvas path, files it, and checks each
    section's recorded head against `doc_revisions`: origin, chain hash, `machineContributors:
    ['ana']`, `matchesFiledText: true`.
  - The snapshot suite's hand-built database gains `doc_revisions` in the real migrations' shape.
- **Pre-existing failures:** `preexisting-failures-identical-without-change.txt`. The founder-path
  lineage walk (LX-00) and the tenant-isolation sweep contract fail identically with and without
  this change.

## Not done

- **The generator itself is not copied into the filing.** It stays on the audit trail row of the
  revision's write, and the revision id is the key to it.
- **No reader joins them for a person yet.** Showing "this filed section was accepted from model
  X, turn Y" on the Vault version or the leaf is a reach for R1, D6 (Vault) or D7 (Submission
  Center).
- **LX-10's other items stay open:** the seal, the signature ids, the lineage digest and the alias
  vocabulary.
