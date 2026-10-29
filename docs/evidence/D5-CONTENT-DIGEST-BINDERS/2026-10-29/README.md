# D5: a labeling approval and a residual-risk acceptance bind the content they sign

Row **D5**, electronic signatures (21 CFR Part 11 §11.70: a signature is linked to the record it signs). 2026-10-29.

Three signed acts went through the platform's route-level ceremony, `signGovernedAct` (`server/routes/governed-signed-act.ts`), with no content binder for their target:

| Act | Target | Route |
|---|---|---|
| A labeling document's approval, its move to effective, its supersession | `labeling-document:<id>` | `PATCH /api/mdx/labeling/:id` (`server/routes/mdx-labeling-approvals.ts`, 96537cfe and 9975138ed) |
| A labeling translation's approval | `labeling-translation:<id>` | `PATCH /api/mdx/labeling/translations/:transId` |
| Accepting a hazard's residual risk | `risk-item:<id>` | `PATCH /api/mdx/risk-items/:id` (`server/routes/mdx-risk-management.ts`, 59b1482d2) |

So `deriveGovernedTargetBinding` fell back, and each signature bound the ledger's chain hash, with that basis named (`governed-action-sha256-chain`). Nothing tied the signature to the label or the hazard. Two edits are allowed after signing today, and neither could be detected against the signature:

- adding or removing a symbol on an approved label;
- rewriting a hazard's benefit-risk rationale, or a control's evidence, after its acceptance.

The two follow-up READMEs list this as not done:

- `docs/evidence/D5-LABELING-TRANSLATION-SIGNATURE/2026-10-29/followups/README.md`, "Not done";
- `docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1a-risk-design-controls-safety/README.md`, "Not done".

This change completes the content binding for those three targets. It reuses the existing binder registry and the one canonicalisation. It adds the read that each existing binder already has (drift detection), here for the two routes that had none.

## What already exists

Searches run:

- `contentDigest`, `content_digest`, `CONTENT_BINDERS`, `binder`, `BINDING_BASIS`, `binding_basis`, `basis !==`;
- `deriveGovernedTargetBinding`, `verifySignatureIntegrity`, `CONTENT_CHANGED`, `changed-after-approval`, `bindsRecord`;
- `labeling-document`, `labeling-translation`, `risk-item`, across `server/` and `tests/`;
- `git log --all --diff-filter=D` on `*binder*`, `*signed-content*`, `*content-digest*`, `*signature-facet*`, `*labeling*sign*` and `*risk*sign*`. Nothing was deleted under those names.
- `git log -S'labeling-document-content'`: no earlier attempt.

**Binding at signing time, extended, not rebuilt:**

- **`CONTENT_BINDERS`** (`server/services/part11/governed-target-binders.ts`): the registry of content binders by target prefix. It already held protocol, report run, interim snapshot, agency question, regulatory commitment, QMS document and, since 765f2b399 (merged in ca574ff80), the Vault data-room seal. It held no binder for the three targets above. **Extended**: three binders are registered here.
- **`deriveGovernedTargetBinding`** (`server/services/part11/signature-persistence.ts:597`): looks the prefix up, owns the 42P01 fallback, and rethrows any other error. Unchanged, except that a fallback now also says why, in words (`fallbackReason`, never written to the manifest).
- **`sha256CanonicalJson` / `canonicalJson`** (same file): the one canonicalisation (keys sorted, Dates to ISO). Used as is.
- **`sha256OfContent`** (`server/services/ana-ri/governed-command-signature.ts:151`): the sha256 of a `concept2cure_artifacts` row's content, as the AnA artifact binding takes it. Used as is for the label text an artifact pointer names. It is loaded lazily, as the QMS binder loads its recipe, to avoid an import cycle.
- **`persistGovernedSignSignature`** (`signature-persistence.ts:889`): derives the binding and writes the one row. The manifest always records `auditSha256Chain`, so the ledger-chain basis stays beside a content digest. **Extended**: an optional `requiredBasis` refuses a binding that does not carry it.
- **`signGovernedAct`**: had no way for an act to say that its signature must bind content. **Extended**: an optional `SignedAct.contentBasis`.
- No existing signing path refused a ledger fallback at sign time. The nearest are:
  - the commitment fulfilment, whose database trigger refuses at COMMIT;
  - the sequence release read (`sequence-release-signature.ts:185`), which refuses to honour one afterwards.

**Verification, the path the existing binders follow:**

- **The generic verify endpoint**, `GET /api/auth-enterprise/signatures/:id/verify` (`verifySignatureIntegrity`, `server/services/auth-security-service.ts:417`). It re-derives one basis only (document version content). For every governed basis it answers `NOT_REDERIVED_HERE`, "not verified here, and not evidence of tampering" (`resolveContentBinding`, `:358`). No client calls it. Unchanged.
- **Domain reads.** Every existing content binder has one, and each re-derives through `deriveGovernedTargetBinding` or the binder's own recipe:
  - protocol: `boundFacet`, `protocol-signature-manifestation.ts:217`, reports `contentBinding: 'changed'`;
  - agency response: `questionApproval`, `response-logic.ts:123`, reports `changed-after-approval`;
  - commitment fulfilment: `commitment-fulfilment.ts:559`, reports `bindsRecord`;
  - QMS release: `readCurrentQmsReleaseApproval`, `current-release-approval.ts:55`, reports `changed`;
  - eCTD sequence: `sequence-release-signature.ts:185`, reports `invalid`.

  Each also carries domain rules beyond the comparison (signing-policy qualification, renewal, training eligibility). None reads a labeling or risk target.
- **Labeling and risk had no such read.** `GET /api/mdx/labeling/:id` and `GET /api/mdx/risk-items/:id` returned the rows only. The read side is added as one function, `readSignedContentStates` (`server/services/part11/signed-content-state.ts`, new), used by both routes. It does not copy any recipe: it calls `deriveGovernedTargetBinding`, the binder the signature was taken with.
- **Not converged.** The protocol, agency, commitment, QMS and eCTD reads stay where they are, because their domain rules are more than the digest comparison. Moving any of them onto this function is not part of this change.

## What changed

| File | Change |
|---|---|
| `server/services/part11/governed-target-binders.ts` | Three binders, registered in `CONTENT_BINDERS` after the Vault seal binder: `labeling-document`, `labeling-translation`, `risk-item`. Recipe tags `labeling-document/v1`, `labeling-translation/v1`, `risk-residual-acceptance/v1` are inside the digested bytes. |
| `server/services/part11/signature-persistence.ts` | `BINDING_BASIS` names the three bases: `labeling-document-content-sha256`, `labeling-translation-content-sha256`, `risk-residual-acceptance-content-sha256`. A fallback records `fallbackReason`. New `GovernedSignParams.requiredBasis` and `SignatureContentUnboundError` (`SIGNATURE_CONTENT_UNBOUND`), thrown before the signer lookup and the INSERT. |
| `server/routes/governed-signed-act.ts` | New `SignedAct.contentBasis`, passed as `requiredBasis`. `SIGNATURE_CONTENT_UNBOUND` answers 409 with its sentence, ending "Nothing was signed." It is a 4xx because nothing was signed; the labeling client treats a 5xx as "unconfirmed". The header comment says which acts bind content. |
| `server/routes/mdx-labeling-approvals.ts` | The document act declares `LABELING_DOCUMENT_CONTENT`; the translation approval declares `LABELING_TRANSLATION_CONTENT`. |
| `server/routes/mdx-risk-management.ts` | The acceptance declares `RISK_RESIDUAL_ACCEPTANCE_CONTENT`. `GET /risk-items/:id` adds `signedContent`. |
| `server/routes/mdx-labeling.ts` | `GET /labeling/:id` adds `signedContent` to the document and to each nested translation. |
| `server/services/part11/signed-content-state.ts` (new) | `readSignedContentStates(client, orgId, targets)`: the newest signature in force on each target, compared with the record's digest now. |

No migration: `binding_basis` is free TEXT (`migrations/20260813d`, no CHECK). `scripts/db/migration-set.mjs` is unchanged.

### Fail closed

An act that declares its basis is refused when its binder cannot bind. The writer throws before anything is written, the ceremony rolls back, and the answer is 409 `SIGNATURE_CONTENT_UNBOUND` with the reason, for example "the label text it names (artifact 999) is not readable at signing time". The act is never signed over the chain hash instead. This covers:

- a malformed pointer;
- a row not readable;
- a label or translation naming a text artifact this organisation cannot read (`artifact_id` is a plain integer, with no key);
- a backing table absent (42P01).

The ledger-chain basis is kept where the mechanism records both: the manifest's `auditSha256Chain` is written on every row. The research-administration acts, RIM, IRB and the others declare no basis and behave exactly as before.

### The read

`signedContent` is one of:

- `matches`: same basis, same digest;
- `changed`: same basis, another digest, so the record changed after signing;
- `unverified`, with its reason, in any of these cases:
  - the row does not hash to its manifest;
  - a signature from before this change, which binds the chain hash;
  - no 64-hex digest;
  - the content cannot be derived now;
- `withdrawn`: every signature on the target is revoked or voided;
- `unsigned`;
- `unavailable`: the signatures could not be read, never shown as unsigned.

The facet also carries `signatureId`, `signerName`, `signedAt`, `meaning`, `bindingBasis`, `signedDigest`, `currentDigest` and `reason`.

## The attested fields

Every recipe is **content only**: it excludes anything the signing act itself writes. The binder runs after the act's write, on the same transaction and under the act's row lock, so the digest it takes equals the digest of the record as the signer reviewed it. A signature therefore still re-derives after a later workflow step that changed nothing it attested, which is the lesson the protocol and eCTD binders record.

### `labeling-document:<id>`, recipe `labeling-document/v1`

One digest serves the approval, the move to effective and the supersession.

| Field | In/out | Why |
|---|---|---|
| `id` | In (`labelingDocumentId`) | Which record. |
| `device_name`, `doc_kind`, `version`, `language`, `region`, `udi_di` | In | What the label is and says: the device, the kind of document, its printed revision, its language and market, and the UDI-DI printed on it. The Labeling screen shows the signer these fields. |
| `expires_at` | In, as `yyyy-mm-dd` text | A controlled attribute the editor sets, as QMS binds its next review date. Read as text, because node-pg reads a DATE as a local midnight. |
| `artifact_id` → `concept2cure_artifacts.content` | In, as `{ id, contentSha256 }` | The label's words, when the row names them. An unreadable artifact refuses the act and is not treated as "no text". The artifact's own `version` counter is out: it is not the text. |
| `labeling_symbols` (code, name, description, required_by), ordered by code, id | In | The ISO 15223-1 symbols are part of the label. Today they can be added to an approved label. Symbol ids, metadata and timestamps are out. |
| `status`, `approved_by`, `approved_at`, `effective_date`, `updated_at` | Out | Written by the signed act itself. The effective date is on the effective signature's manifest (`act.effectiveDate`). |
| `created_by`, `created_at`, `deleted_at` | Out | Who and when, not what. The creator is the separation-of-duties input. |
| `program_id` | Out | Places the record in a project; it does not say what the label is. |
| `metadata` | Out | No writer, and not shown to the signer. |
| Translations | Out | Each is signed on its own target. |

### `labeling-translation:<id>`, recipe `labeling-translation/v1`

| Field | In/out | Why |
|---|---|---|
| `id`, `labeling_document_id` | In | Which translation, of which document. The document must be live and the organisation's, as the approval requires. |
| `language`, `translator`, `translation_method`, `back_translation_verified` | In | What the approver attests: the language, who translated it and how, and the back-translation check. The approval's ledger payload already records the method and the check. |
| `artifact_id` → content sha256 | In | The translated text, when named; refuses when unreadable. |
| `status`, `approved_by`, `approved_at`, `updated_at`, `created_by`, `created_at`, `metadata` | Out | Written by the act, or not content. |
| The source document's content or version | Out | The source has its own signature. Whether a translation's approval should bind the source version it translates is a domain decision, listed below. |

### `risk-item:<id>`, recipe `risk-residual-acceptance/v1`

| Field | In/out | Why |
|---|---|---|
| `id`, `ref_code` | In | Which hazard, as the risk file numbers it. |
| `hazard`, `hazardous_situation`, `harm`, `sequence_of_events` | In | The hazard analysis the acceptance rests on (ISO 14971). |
| `severity`, `probability`, `detectability`, `initial_risk` | In | The initial estimate. The stored product is bound too, so a product that contradicts its factors is visible. |
| `residual_severity`, `residual_probability`, `residual_risk` | In | The estimate being accepted. |
| `control_strategy`, `source` | In | How the risk is controlled, and where the hazard came from. |
| `benefit_risk_rationale` | In | The justification an acceptance stands on. Today it can be rewritten after the acceptance. |
| `risk_controls` (description, type, the three evidence fields, `introduces_new_risk`, `new_risk_item_id`, status), in id order | In | The residual estimate rests on the controls and their verification. Control ids and timestamps are out. |
| `status`, `acceptable` | Out | Written by the acceptance itself. The decision is on the manifest (`act.acceptable: true`). |
| `program_id` | Out | Places the hazard. The same-organisation key can null it on a project's deletion, which would read as a change no one made. |
| `assigned_to`, `metadata`, `created_at`, `updated_at`, `deleted_at` | Out | Who owns the work, an unwritten blob, and times. |

## Tests

New:

- `server/__tests__/routes/content-digest-binders.pglite.test.ts`, 16 tests. It runs the real labeling and risk routers, `signGovernedAct`, `persistGovernedSignSignature` with the binders, `resolveSignerIdentity` and the `electronic_signatures` INSERT on PGlite. It applies `20260511`, `20261029b` and `20260507` to get the real tables. Stubbed at module boundaries: the password check, the signer's role, the tenant context, and the ledger pair, which returns a fixed chain hash so its survival on the manifest is asserted. Each digest is recomputed by the test from the record, by the recipe above, as an inspector would.
- `server/services/part11/__tests__/labeling-risk-content-binders.test.ts`, 74 tests. Field by field: each attested field moves the digest, and each excluded field does not. Reads are organisation-scoped. Fallbacks give their reason. The writer refuses a declared basis it cannot bind, and inserts nothing.

### Red at HEAD: `red.txt`

At 8b3ee4b57, HEAD at the time and an ancestor of ca574ff80, with only the two test files present and every implementation file unchanged (the file's header shows an empty `git status` for them): **90 of 90 failed**, for these reasons:

- Each act's row carried `governed-action-sha256-chain`, with the chain hash as its digest: the signature carried no content digest.
- A label naming an unreadable text artifact was signed: 201, over the chain hash.
- After a symbol was added, a rationale rewritten or a control's evidence changed, nothing reported a change. No read had a `signedContent` facet.
- No binder was registered.

The first run failed on a fixture table (`ectd_templates`, indexed by `20260507`'s last statement). That was fixed, and `red.txt` is the second run.

### Green: `green.txt`

**565 of 565, 23 files.**

| Suite | Tests |
|---|---|
| `content-digest-binders.pglite` (new) | 16 |
| `labeling-risk-content-binders` (new) | 74 |
| `mdx-labeling-approval-controls.pglite` (keep green) | 54 |
| `mdx-labeling-translation-approval-signature` (keep green) | 24 |
| `mdx-risk-accept-residual-signature` (keep green) | 33 |
| `domain-sign-ceremony.routes` (the other `signGovernedAct` acts) | 68 |
| `governed-signed-act.request-context` | 5 |
| `signature-content-verification` (the generic verify endpoint) | 13 |
| `governed-sign-esignature.pglite.integration` (the writer, real migration) | 15 |
| `vault-seal.service` (the binder merged beside these) | 9 |
| `protocol-signatures.routes`, `commitment-fulfil-route`, `commitment-fulfilment-binder` | 28, 12, 5 |
| `labeling-translations-shape`, `mdx-labeling-writes-require-editor` | 3, 24 |
| `mdx-risk-assignee-membership`, `mdx-risk-program-scope`, `mdx-risk-recompute` | 5, 35, 9 |
| `device-project-reads-admit-program`, `device-project-writes-admit-program` | 20, 39 |
| `mdx-engineering.contract`, `tests/mdx-beta-surfaces-routes`, `tests/mdx-qms-labeling-search-analytics-routes` | 19, 27, 28 |

### Mutations: `mutations.txt`

**15 of 15 red.** Each mutation:

1. is an exact replacement, with each old string occurring once;
2. runs against the two new suites;
3. is restored from the bytes read before it;
4. has its restore checked by sha256.

The file ends with each file's sha256, equal to its value before the run.

| | Mutation | Red | Caught by |
|---|---|---|---|
| M1 | The label digest omits the symbols | 11 | The symbol added after signing; the recipe pins |
| M2 | The label digest omits the label text | 6 | The text edited after signing; the recipe pins |
| M3 | The translation digest omits the translator | 4 | The edit after a withdrawal; the recipe pins |
| M4 | The hazard digest omits the benefit-risk rationale | 4 | The rationale rewritten after acceptance |
| M5 | The hazard digest omits the controls | 12 | The control changed after acceptance; the control field pins |
| M6 | **Digest after the write**: the label digest covers the status the act writes | 7 | The signed digest is not the reviewed one; effective breaks the approval's match; status is excluded |
| M7 | **Digest after the write**: the hazard digest covers the status the acceptance writes | 4 | The signed digest is not the reviewed one; status is excluded |
| M8 | **Fallback to the chain hash**: the ceremony drops the declared basis | 2 | Both fail-closed tests |
| M9 | **Fallback to the chain hash**: the writer ignores `requiredBasis` | 4 | Both fail-closed tests; the writer refusal |
| M10 | **Fallback to the chain hash**: the label approval declares no basis | 1 | The label fail-closed test |
| M11 | **Fallback to the chain hash**: the acceptance declares no basis | 1 | The hazard fail-closed test |
| M12 | Unreadable label text is treated as "no text" | 3 | The label fail-closed test; the fallback reason |
| M13 | The read does not compare digests | 6 | Every "detected" test |
| M14 | The read takes a pre-binding (chain-hash) signature at face value | 1 | "unverified, never matches or changed" |
| M15 | The read takes a withdrawn signature as in force | 1 | "a revoked signature reads as withdrawn" |

### Typecheck, lint, gates

- **`typecheck.txt`.** Scoped `tsc` over the changed files and their imports, with the repo's ambient declarations and the three modules that augment `Express.Request`: exit 0.
- **`eslint.txt`.** 0 errors. Two warnings, both head's baseline:
  - `persistElectronicSignature`, complexity 23;
  - the risk PATCH handler, complexity 21.

  Every other changed file has 0.
- **`gates.txt`.**
  - `ci:sign-ceremony` OK, 29 baselined sites, as baselined.
  - `ci:sql-interpolation` OK; no value is interpolated into the new SQL.
  - `ci:server-error-leaks` OK.

## Not done

- **The client does not show `signedContent`.** This worker was not to edit `client/`. The Labeling screen's list read (`GET /labeling?program_id`) and `GET /labeling/:id/translations` do not carry it; `GET /labeling/:id` does. The Risk screen reads `GET /risk-items`, which does not carry it; `GET /risk-items/:id` does.
- **Detected, not refused.** A symbol can still be added to or removed from an approved or effective label, through the route and through AnA's `add_labeling_symbol`. An accepted hazard and its controls can still be edited. Both now read `changed` against the signature. Whether either should be refused, as an approved translation's fields are, is a domain rule for the founder.
- **Signatures taken before this change** bind the chain hash and read `unverified`. They are not re-signed.
- **The RIM label approval** (`rim-product:<id>`, `server/routes/rim.ts`) still binds the chain hash. It is a different target, outside this task.
- **A translation's source version** is not bound (see the table).
- **The generic verify endpoint** still answers `NOT_REDERIVED_HERE` for these bases, as for every governed basis.
- **The other domain reads are not converged** onto `readSignedContentStates` (see "What already exists").
- **Not run:** the full-repo typecheck (it runs out of memory under parallel load) and the rest of the test tree.

## Files

- Changed:
  - `server/services/part11/governed-target-binders.ts`
  - `server/services/part11/signature-persistence.ts`
  - `server/routes/governed-signed-act.ts`
  - `server/routes/mdx-labeling-approvals.ts`
  - `server/routes/mdx-labeling.ts`
  - `server/routes/mdx-risk-management.ts`
- New:
  - `server/services/part11/signed-content-state.ts`
  - `server/__tests__/routes/content-digest-binders.pglite.test.ts`
  - `server/services/part11/__tests__/labeling-risk-content-binders.test.ts`
- Evidence: `red.txt`, `green.txt`, `mutations.txt`, `typecheck.txt`, `eslint.txt`, `gates.txt`, this README.
