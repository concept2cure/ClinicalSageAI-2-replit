# Anna IA completion — owner and expert execution handoff

This is an unsigned execution handoff, not a qualification certificate. A developer test, source summary, requested model name or instruction to continue cannot substitute for an attributable live run or an expert's approval.

The document/data lifecycle contract is recorded in [DOCUMENT_DATA_LIFECYCLE_2026-10-06.md](../../../../architecture/DOCUMENT_DATA_LIFECYCLE_2026-10-06.md). It is the governing design for the next implementation slice: a source removal must ask whether derived data is kept, withdrawn, or superseded, and must retain the complete lineage in every case.

## Access and accountable people

| Needed | Concrete provision | Why execution is currently blocked |
|---|---|---|
| Model provider | Configure the authorized provider account and secret for the selected existing registry model through the deployment secret manager; confirm its placement approval and access to the pinned version. | This runtime has no configured provider keys. Do not paste keys into chat or commit them. |
| Evaluation tenant | Supply the real organization UUID and programme UUID, runtime application-role database connection, and authorized Vault access. | No database or tenant credentials are present. Fixture UUIDs are not operational tenants. |
| Reviewed corpus | Review official full-text identity, edition, downloaded-byte hash and reuse terms; admit through the existing Vault ingestion path; confirm matching versions/hashes and embedded chunks. | All 24 current manifest entries are unverified. No qualification corpus can be inferred from search summaries. |
| Expert adjudication | Name regulatory and scientific reviewers competent for the intended device, IVD, biotech, pharmaceutical and CRO use cases in the EU, US, Japan, Canada and China. Review source applicability, draft cases and live answers. | The 34 IA cases are reviewer drafts; their scores and reviewer identities are unfilled. "Europe" also needs an actual country/jurisdiction. |
| PQ criteria approval | The responsible system owner reviews and approves the canonical protocol and records their real identity and date. | `pq-protocol.json` remains draft; approval fields are null. Model registry PQ claims remain pending. |
| Production-image staging | Provide the deployed image digest, staging HTTPS origin, production boot configuration, non-owner database role with RLS, and real mail/identity configuration. | No staging endpoint, deployment account or local running application is available. Parent CI boot smoke is not an IQ/OQ execution against this release's staging installation. |
| Validation identities | Provision the run user and separate authorized signer/admin identities with their enrolled authentication factors via the existing administration process. | Passwords, enrolled TOTP factors and signing identities are absent. A developer-auth session cannot stand in for a production signature. |
| Release sign-off | Founder/system owner and qualified contractor review actual run evidence, deviations and traceability, then sign using the existing ceremony. | No signatures have been supplied or created. |

## Execution order

1. Review the [IA reviewer packet](../2026-10-06-ana-qualification/reviewer-packet.md), [source register](../2026-10-06-ana-qualification/source-register.md) and [blank scorecard](../2026-10-06-ana-qualification/reviewer-scorecard-template.json). Correct applicability and scientific expectations before accepting results. A finite case bank does not establish exhaustive regulatory expertise.
2. Review and complete the [RAG corpus prerequisites](../2026-10-06-ana-rag-qualification/README.md). Resolve the five open official-text checks and add supporting source quotes. The draft criterion requires at least 30 scored positive items for each retrieval/faithfulness metric, so the current 18 positives need at least 12 more reviewed positives (32 total with the two controls). Negative controls cannot fill those floors. Keep source identities and gold keys consistent in the same change.
3. Provide model/corpus access, approve the criteria, and run the controlled live PQ and IA capture commands documented in the [qualification package](../2026-10-06-ana-qualification/README.md). Keep every failed/unassessed case. Review immutable captures against the blank scorecard; do not convert `PENDING_REVIEW` or `NOT_EXECUTED` into a pass.
4. Deploy the reviewed release through the existing staging/release pipeline with its required checks. Verify the exact candidate commit/image before running installation and operational qualification.
5. Run all six OQ protocols with real identities; resolve failures/deviations and generate a traceability matrix from that same execution directory. Review and sign the completed package before release.

The current document-quality bank already has 30 generation tasks (10 each for 510(k), CER and IND) and 12 extraction tasks. Its current sample floor passes. RAG corpus review and representative coverage remain separate obligations.

## Staging commands

Run from the repository root with Node 22 and the existing validation dependencies/browser installed. Provision credentials and `VALIDATION_BASE_URL` in the approved execution environment first. Use a fresh execution directory/date; do not overwrite this session's blocked attempt or earlier signed evidence.

```bash
set -euo pipefail
export VALIDATION_RUN_DATE="$(date -u +%F)"
export VALIDATION_EVIDENCE_ROOT="$PWD/docs/evidence/W3/${VALIDATION_RUN_DATE}-ana-release"
npm run validation:iq
npm run validation:oq
npm run validation:traceability -- --out "$VALIDATION_EVIDENCE_ROOT/traceability"
```

An IQ or OQ nonzero exit is a finding to investigate, not an instruction to continue to approval. A traceability-builder exit zero says the matrix was generated consistently; it does not say requirements passed. Check the matrix's uncovered and failed rows explicitly.

## Owner decisions to record

| Decision | Required record | Current state |
|---|---|---|
| Intended use and country/product boundaries | Specific permitted client use cases, named countries, scientific context and review limits | Awaiting owner/expert review |
| IA acceptance | Named reviewer, reviewed case expectations, source applicability and capture-linked adjudication | Unsigned; all dimension scores null |
| PQ acceptance | Approved canonical criteria and real complete attributable execution record for each selected model/version | Draft; 0 registry PQ passes |
| Corpus acceptance | Official edition/hash/reuse verification plus tenant-bound Vault admission | Unverified |
| Validation acceptance | Exact image/environment, completed IQ/OQ, resolved deviations and complete current traceability | Blocked local attempt only |
| Existing dependency risk ownership | Named accountable person to re-review the unchanged braces and image-size dispositions | Existing deadlines: 2026-11-05 and 2026-11-25 |
| Release authorization | Actual founder/system-owner and qualified-contractor review/signature | Unsigned |

No owner identity, approval, confidence score, provider response, tenant, production deployment or signature is invented in this handoff.
