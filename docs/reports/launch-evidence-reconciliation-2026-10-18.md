# Launch rows D1–D10 against the evidence on file

Date: 2026-10-18. Source: [LAUNCH_DEFINITION_OF_DONE.md](../LAUNCH_DEFINITION_OF_DONE.md)
and `docs/evidence/`, at `c821b0a7`. Priority 8 of the
[remaining-needs assessment](data-room-research-2026-10-14/remaining-needs-2026-10-18.md).

This is a read-only reconciliation, gathered by a subagent from the files
themselves. I re-checked the key claims myself:

- `docs/evidence/validation/` and `docs/evidence/D10/` do not exist.
- VSR-001 is `DRAFT — UNSIGNED`.
- All 17 PQ entries in `server/services/ai-governance/approved-models.ts` are
  `pending`, and none has passed.

It records what the evidence says. It does not certify anything, and it
infers nothing about production systems that this repository cannot show.

**No row is green.** All evidence is local, Codespace, CI or draft. Nothing
comes from a deployed environment.

| Row | Evidence status | Most important missing piece |
| --- | --- | --- |
| D1 Hosted production | Blocked. Terraform is tested only with mocked providers ("Nothing in `terraform/` has been applied yet", `W2/2026-10-01-vpc-private-paths/README.md`). The only recorded `/readyz` is local and returned 503 (`LIVE-PROOF/2026-09-21`). | Founder: AWS account, IAM, DNS, secrets; then `terraform apply` and a hosted restore drill |
| D2 Launch catalog | Partial, local. The gate-blocks-fixture proof is a local script, not a CI run (`W1/2026-09-23-d2-fixture-gate`). Staging screenshots are owed with D1. | Fresh-org screenshots on staging |
| D3 Tenant isolation | Partial. Proven locally as `app_service` with RLS. The staging contract run is owed with D1. | Staging two-tenant contract log |
| D4 Validation package | Blocked. `docs/evidence/validation/` is missing. VSR-001 signature lines are unsigned. OQ-007/008 do not exist. Every model PQ is `pending`; the PQ protocol is a draft with no approver. | Signatures, plus an approved PQ protocol that has been executed |
| D5 Part 11 | Partial. The second signature route is deleted and the verifier is proven locally. The KMS signer was tested against a fake KMS. A production verifier run and `AUDIT_HMAC_KEY` in KMS are owed. | A real KMS key and a production verifier run |
| D6 Security posture | Partial; sign-offs explicitly absent. The trust statement says no SOC 2 window is open, no pen test has been done, and the BAA is unsigned. `.gitleaksignore` still lists three history credentials as `live — revoke`. | A third-party pen test, plus credential revocation confirmed |
| D7 One real sequence | Blocked. The latest recorded preflight is 2/15 (`W5/2026-09-24`). The 2026-10-17 audit records that AS2 is not S/MIME, the MDN is unverified and there is no ack poller. | One FDA test-environment sequence for a real sponsor, with the ack chain filed |
| D8 Connector | Partial. The only transcript is against localhost. Staging, a second-machine client and the directory submission are owed. | Staging origin (D1), then a second-machine transcript |
| D9 Commercial paper | Partial. Every document is "DRAFT — FOR LAWYER REVIEW". No lawyer has reviewed anything and no price has been decided (`W6/2026-09-20`). | Lawyer review and the pricing decision |
| D10 One customer | Missing. No evidence directory, no signed pilot, no sponsor acknowledgement. | A signed pilot with a fee |

## Contradictions to resolve

- The definition's header dashboard (4/40 readiness, 2/15 preflight) is
  stale. The latest recorded readiness output is 5/40
  (`W5/2026-09-22/before/ga-readiness-report.txt`).
- The definition calls Opus 5 the validated fallback, yet its registry entry
  is `pq: pending`. The 2026-10-13 governance decision says no approved model
  has passed PQ in production.
- CLAUDE.md Rule 2 still names eight launch apps, including Submission
  Readiness. P-36 and the 2026-10-17 audit count seven.
- `docs/evidence/D9/` holds only a Semgrep repair, nothing commercial.
- `docs/commercial/ORDER_FORM.md` names Opus 5 as primary; the definition
  now says Opus 5.5.
- The 2026-10-16 show-and-tell got a 401 from Anthropic and ran AnA through
  the OpenAI fallback, which is capped below high-risk work.
- D6 cites a green Security Scan run. Semgrep was red from 2026-10-01 and
  green on the 2026-10-11 head, with no recorded recheck since.

## What engineering can still move without the founder

D2 and D3 evidence is ready to re-run the moment a staging origin exists. The
code-side work this session filed under D2 (batch cancellation, Japanese
source windows, OCR budgets) is local qualification. It does not change any
row's colour.
