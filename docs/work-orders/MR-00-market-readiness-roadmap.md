# MR-00 — Market-readiness roadmap

| | |
|---|---|
| What | A cold evaluation of the whole repository for market readiness, and the work orders that finish the product for a first paid pilot and then enterprise GA |
| Audit basis | `92ccdba1` (2026-09-29) — 11 code lanes, a market lane and a process lane, read cold (no prior audits, evidence or handoffs) |
| Re-verified at | `94b4f9238` (2026-10-13): all 228 audit findings re-checked against code at this head; fresh-install and boot re-checked at `eeabd3cab`, and again at `aa4ee1e29` on 2026-10-18 through program, Vault upload and document. That run found one more defect (HT-01, finding 229), fixed by `969d1e727` the same day |
| Work orders | MR-01 … MR-17, one file each in this directory |
| Findings register | [`MR-findings-2026-10-13.json`](MR-findings-2026-10-13.json) — every finding with its status at head, severity, tester impact, instructions and acceptance |
| Human testing | [`docs/testing/HUMAN_TESTING_KNOWN_ISSUES_2026-10-13.md`](../testing/HUMAN_TESTING_KNOWN_ISSUES_2026-10-13.md) |
| Evidence | [`docs/evidence/reviews/2026-10-13-market-readiness/`](../evidence/reviews/2026-10-13-market-readiness/) — lane reports, re-verification records, market brief, method and limits |
| Landed at | `concept2cure-v2` on 2026-10-18, when the branch was ~7,900 commits past the re-verification head. Statuses are dated; every work order's first step re-confirms them at the current head |

> **The launch catalog moved during this evaluation.** The audit covered the
> six apps of 2026-09-29 (Projects, Vault, Authoring, Submission Center,
> Submission Readiness, QMS controlled documents) plus the MCP connector. Since
> then Reporting & analytics (2026-09-26 decision, listed after the basis) and
> CMC / Module 3 (P-28, 2026-10-12) joined, the IND forms screen joined
> Submission Center (P-32, 2026-10-15), and Submission Readiness was folded
> into Submission Center's Validation and Dispatch tabs (2026-10-17). Findings
> filed under Submission Readiness (MR-11) now apply to those tabs. **CMC /
> Module 3 and Reporting & analytics were not audited as launch apps here**;
> any instruction in these orders that would fence or remove code they now
> depend on is superseded by `shared/constants/launch-scope.ts`.

## 0. How to use this

**Founder:** read §1 (verdict), §3 (today), §7 (decisions). Everything that
needs money, an account, a signature or a product call is in §7, in the order
it blocks work.

**Implementation sessions:** pick the lowest-numbered phase with an unclaimed
work order (§6), claim it in [`README.md`](README.md) §0, and follow its "How to
run this order" section. Each order lists the findings it closes, their status
at head, numbered steps against current code, and acceptance checks that must
be shown failing before the fix and passing after. When a finding closes,
update its record in the findings register with the closing commit.

**Severity** is set against one target: the first paid design-partner pilot —
sales-led, one US small or mid-size biotech or medtech, FDA only, eCTD v3.2.2,
founder-supported, one AWS production environment.
**P0** — the pilot cannot start safely (security, tenant isolation, legal or
data-integrity exposure, or a core launch journey cannot work).
**P1** — must be fixed before pilot users rely on it in production.
**P2** — before enterprise GA. **P3** — polish.

## 1. Verdict

**Not ready for a paid regulated pilot today, and closer than its red CI
suggests.** The foundations a GxP buyer probes first are sound and
above the norm for a company this size: the sign-in core, tenant scoping,
the Part 11 signing ceremony and append-only audit stores, one-command
provisioning, and the governance scaffolding around AI. What stands between
this repository and a first paid pilot is specific and finite:

1. **Exposure.** The repository is public under an MIT licence, already
   forked, with three credentials its own scanner still marks live.
2. **Nothing has been deployed.** Terraform has never been applied, the AWS
   deploy workflow has never run, and 0 of the last 1,000 CI runs on the
   canonical branch were green, so no SHA can be promoted.
3. **The deliverables a regulatory buyer pays for are not filing-grade yet.**
   eCTD packages are not DTD-validated and the FDA gateway cannot deliver or
   record acknowledgments; Authoring exports PDF as a plain-text fallback; a
   QMS revision overwrites the version in force.
4. **AI drafting is refused in production** until a model passes PQ — the
   gate now works, which is correct, but nothing has passed it.
5. **No signable paper.** The pilot agreement, DPA and MSA are drafts with a
   placeholder legal entity.

With the founder decisions in §7 taken this week and up to four parallel
sessions, the pilot-ready gate (§5, Phase 1) is about six weeks out, and the
pilot's own success criterion — one FDA-valid v3.2.2 sequence sent to the ESG
test endpoint with acknowledgments filed — is reachable by late February 2027.

| At `94b4f9238` | |
|---|---|
| Findings | 229 — 11 fixed or refuted since the audit, 80 partly fixed, 138 still open |
| Open P0 / P1 against the pilot target | 12 / 49 |
| Open and blocking a human-testing journey | 10 at `94b4f9238`. 4 on 2026-10-18, after the re-check at `8ca7e74ca` and the two fixes that landed with this roadmap: HT-01 (`969d1e727`) and MR-08 Stage 1, the compose scanner (`fb95b9680`). Workarounds are in the testers' guide. |
| GA probe blockers ready (`scripts/ops/ga-readiness-report.mjs`) | 0 / 19 |
| Agency artifacts present (`scripts/ops/submission-preflight.mjs`) | 2 / 15 |
| Fresh install → boot → sign-in → program → Vault upload → document | works at `aa4ee1e29` (2026-10-18). Its one setup workaround (HT-01) was removed by `969d1e727` the same day. |

## 2. Scorecard

Scores are the lane auditors' judgement at the audit basis against the pilot
target. The columns to the right are the re-verification at `94b4f9238`: what
the two weeks of work since then fixed, and what remains.

| Area | Score at audit (0–10) | Findings | Fixed since | Partly fixed | Still open | Open P0 / P1 at head | Open and blocks testing |
|---|---|---|---|---|---|---|---|
| Security & tenant isolation | 6.5 | 28 | 2 | 12 | 14 | 0 / 4 | 1 |
| Data layer | 6 | 19 | 0 | 8 | 11 | 0 / 5 | 0 |
| Part 11 / GxP | 5 | 15 | 2 | 8 | 5 | 0 / 3 | 0 |
| Frontend & UX | 5 (first 30 min: 2 self-serve, 5 invited) | 25 | 0 | 6 | 19 | 0 / 2 | 1 |
| Projects · Vault · Authoring | 5 · 4 · 5 | 24 | 1 | 6 | 17 | 0 / 5 | 1 |
| AI layer | 4 | 17 | 2 | 8 | 7 | 1 / 6 | 1 |
| Architecture & codebase health | 4 | 21 | 0 | 8 | 13 | 0 / 3 | 0 |
| Commercial & GTM | pilot 4 · GA 2 · self-serve 2 | 22 | 1 | 3 | 18 | 1 / 5 | 1 |
| Infra, CI/CD, operations | 3.5 | 30 | 2 | 10 | 18 | 4 / 7 | 1 |
| Submission Center · Readiness · QMS | 3 · 4 · 3 | 27 | 0 | 11 | 16 | 6 / 9 | 4 |
| **All** | | **229** | **11** | **80** | **138** | **12 / 49** | **10** |

## 3. Do these today

| # | Action | Who | Why |
|---|---|---|---|
| 1 | Make `concept2cure/ClinicalSageAI-2-replit` private; replace the MIT licence; ask the one fork's owner to delete it (F-1) | Founder | The full product, its infrastructure and its security gates are public under a licence that lets anyone reuse them, and a copy already exists outside your control |
| 2 | Rotate the three credentials `.gitleaksignore` still marks `status: live`, record each rotation, then clear the markers (F-2) | Founder | They are readable in public git history today |
| 3 | Run human testing at `969d1e727` or later, and record the SHA on every defect report | Test lead | At `94b4f9238` a fresh database cannot be provisioned (migration `20260813_knowledge_graph_tenant_keys.sql` fails, 172/375 applied); `2ef129e54` fixed that; `969d1e727` removed the last setup workaround (HT-01). From empty at `d0cde23b9` plus that fix, the testers' guide recipe provisions 408/408 migrations, boots, signs in and creates a program |
| 4 | Use invited accounts and keep self-serve sign-up off for the pilot (F-3) | Founder | Public sign-up is open with no AI spend cap and no recorded consent |
| 5 | Put required checks (or a merge queue) on `concept2cure-v2` and stop the bot that refreshes baselines after every push (F-7) | Founder + one session | 0 of the last 1,000 CI runs on the canonical branch are green; nothing stops red from landing |
| 6 | Give human testers [`docs/testing/HUMAN_TESTING_KNOWN_ISSUES_2026-10-13.md`](../testing/HUMAN_TESTING_KNOWN_ISSUES_2026-10-13.md) | Test lead | It lists every issue they will hit at this head, so known defects are not re-reported |

## 4. Stop-ship — open P0s at `94b4f9238`

Nothing on this list may be open when the pilot starts. Each line names the
order that closes it.

| Finding | What is wrong at head | Status | Owner | Effort | Work order |
|---|---|---|---|---|---|
| AI-01 | The gateway now enforces the PQ rule in production, but no model has passed PQ, so production AI drafting is refused | partially fixed; re-checked at `8ca7e74ca`: partially fixed (5e8a3cc5f, 8ee5a12dd) | mixed | M | MR-13 |
| CAT2-01 | Agency DTDs, stylesheets and the STF DTD are still not vendored, so no package is ever DTD-validated (the FDA region-conformance over-claim is gone) | partially fixed | mixed | M | MR-10 |
| CAT2-02 | FDA us-regional.xml: applicant name, id element, contact wrappers, application-containing-files and heading order are fixed; the sequence path still writes a placeholder DUNS, no contacts, untyped phones, flat Module 1 headings and forms in the wrong place | partially fixed | engineering | M | MR-10 |
| CAT2-03 | ICH index.xml heading tree is still truncated, with no substance, manufacturer, product, dosage-form or indication attributes, no node-extension and non-ICH folder names | still open | engineering | L | MR-10 |
| CAT2-04 | STF rewritten to the study-identifier / doc-content→index.xml#ID shape, but its DOCTYPE cannot resolve, its DTD is neither shipped nor validated, and the new 1789 gate blocks FDA sequences with study reports because the UI cannot record a study id or file-tag | partially fixed; re-checked at `8ca7e74ca`: partially fixed | engineering | M | MR-10 |
| CAT2-05 | FDA ESG still cannot deliver a conformant message or record FDA's acknowledgments: no S/MIME AS2, no MDN verification, no ACK1-3 ingestion, no center routing; SFTP dependency still absent | still open; re-checked at `8ca7e74ca`: partially fixed (e1f3fd425) | mixed | XL | MR-10 |
| CAT2-18 | QMS still has no version history: a revision overwrites the effective controlled document in place, and no version is ever superseded | still open | engineering | L | MR-12 |
| GTM-01 | Legal pack is still unsigned drafts: entity name, SCC/UK annex, insurance, governing law and two subprocessors are placeholders | still open | founder | M | MR-16 |
| OPS-01 | AWS stack never applied and never deployed: 0 deploy-aws and 0 provision-database runs at HEAD | still open | mixed | L | MR-03 |
| OPS-02 | Canonical branch still red: 0 green in the last 1000 CI runs, HEAD cannot provision a fresh database, nothing gates landing (deploy-time CI gate added) | still open; re-checked at `8ca7e74ca`: partially fixed (2ef129e54, e1f3fd425) | mixed | M | MR-02 |
| OPS-03 | Terraform state bucket name c2c-terraform-state is still taken (eu-west-1) and still hard-coded in bootstrap and both backends | still open | engineering | S | MR-03 |
| OPS-05 | Public repo still carries 3 credentials marked live in git history (2 Neon owner passwords, 1 Hugging Face token); the HS256 token is closed as not a credential | partially fixed | mixed | S | MR-01 |

## 5. Phases

Dates assume up to four concurrent implementation sessions, each owning one
work order, and founder decisions taken on the dates in §7. A phase ends on its
exit criteria, not on its date.

### Phase 0 — Unblock human testing · 19–23 Oct 2026

Contents: MR-01; every open finding marked **blocks** in the
[findings register](MR-findings-2026-10-13.json); the testers' guide.

Exit criteria:
- The repository is private and the live credentials are rotated.
- Testers complete journeys 1–7 of the testers' guide on a recorded SHA, on a
  local or staging deployment provisioned from empty.
- No open finding is marked **blocks**, or each has a documented workaround the
  test lead accepts.

### Phase 1 — Pilot-ready · 26 Oct – 4 Dec 2026 (6 weeks)

Contents: MR-02, MR-03, MR-05 (credential separation and RLS bypass), MR-06,
MR-07, MR-08, MR-09 (filing-grade PDF), MR-13 (governed primary model, PQ
executed), MR-15, MR-16 (signable paper, recorded consent, one mailer with a
verified domain, support channel), and the first stage of MR-10 (agency DTDs
vendored, FDA Module 1 and ICH tree DTD-valid).

Exit criteria:
- 20 consecutive green CI runs on `concept2cure-v2`, and red cannot land.
- Staging and production applied from Terraform; one image digest promoted
  from staging to production; `/readyz` green on both.
- No open P0. Every P1 that touches a pilot user's records is closed.
- A pen test (including a two-tenant isolation test) is booked; SOC 2 Type I
  auditor engaged.
- Pilot agreement, DPA and order form reviewed by counsel and signable.

### Phase 2 — Pilot live · 7 Dec 2026 – 19 Feb 2027 (10 weeks)

Contents: the rest of MR-10 (validator licence, STF, PDF technical conformance,
ESG NextGen test transmission with acknowledgments), MR-11, MR-12, MR-04,
MR-17, remaining P1s, and the release-bound validation pack (MR-02 stage).

Exit criteria (the pilot's own success criteria, §9):
- One FDA-valid eCTD v3.2.2 sequence for the pilot program, zero high-severity
  validator errors on first pass, sent to the ESG test endpoint under the
  customer's account, acknowledgments filed.
- Every factual statement in pilot drafts resolves to a Vault citation; no
  figure on any screen comes from a model.
- The pilot customer's QA signs the supplier assessment; a validation summary
  for the release in use is delivered.
- Restore drill run against the real schema, RPO/RTO measured and documented.

### Phase 3 — Enterprise GA · Mar – Jun 2027

Contents: the P2s — MR-14 completed (the production bundle is the launch
catalog), enterprise identity (OIDC, per-org SAML, SCIM self-service), data
room sharing, live co-editing, QMS training and periodic review, eCTD v4.0
decision (F-23), SOC 2 Type II observation window, Connectors Directory
submission.

Exit criteria:
- SOC 2 Type II window open; pen-test findings closed.
- Every launch app has a customer-runnable IQ/OQ pack per release.
- A second customer onboarded without engineering help.

## 6. Work orders

Status counts, highest open severity and tester impact include the 2026-10-18 re-check of
every finding that stopped a tester's journey at `94b4f9238`; each order's own file
says which of its findings that re-check changed.

| Order | Title | Phase | Highest open severity | Human testing | Owner | Effort | Depends on | Findings (open · partial · fixed) |
|---|---|---|---|---|---|---|---|---|
| [MR-01](MR-01-repo-exposure-and-credentials.md) | Close the public-repository and leaked-credential exposure | Phase 0 | P0 | — | founder | S total — S + S + S | F-1, F-2, MR-02 | 2 (0 · 2 · 0) |
| [MR-02](MR-02-green-gated-trunk-and-release-validation.md) | A green, gated canonical branch and a release-bound validation pack | Phase 0, Phase 1, Phase 2, Phase 3, Backlog | P0 | degrades | mixed | M + M + S + M + S + L | F-7, F-22, MR-03, F-1, new decisions | 8 (5 · 3 · 0) |
| [MR-03](MR-03-first-deploy-staging-to-production.md) | First real deploy: staging, then production, from one promoted image | Phase 1, Phase 3 | P0 | degrades | mixed | M + M + M + L + L + M + M + S | MR-02, MR-01, F-1, F-2, MR-04, MR-14, F-4, F-6, F-25, F-27 | 24 (12 · 10 · 2) |
| [MR-04](MR-04-operate-observe-recover.md) | Operate, observe and recover: alarms, detective controls, DR | Phase 1, Phase 2, Phase 3, Backlog | P1 | — | mixed | L–XL in total: S + M + M + M + S + L + S | MR-03, MR-02, F-22, F-4, F-21, F-25 | 5 (5 · 0 · 0) |
| [MR-05](MR-05-tenant-isolation-as-a-hard-boundary.md) | Make tenant isolation a hard database boundary | Phase 1, Phase 2, Phase 3, Backlog | P1 | — | engineering | XL in total: S + M + M + M + M + S + S | MR-06, MR-03, MR-17, MR-14, F-17, F-21 | 12 (7 · 4 · 1) |
| [MR-06](MR-06-part11-record-integrity.md) | Part 11 record integrity: authority, signatures, immutable trails | Phase 1, Phase 2, Phase 3, Backlog | P1 | degrades | engineering | XL in total: M + M + M + M + L + S + M + L + M… | MR-11, MR-12, MR-05, F-12, F-13 | 21 (9 · 10 · 2) |
| [MR-07](MR-07-second-door-authorization.md) | Bring every second door up to the main door's standard | Phase 0, Phase 3, Backlog | P2 | degrades | engineering | L in total: S + S + M + M + M + S + S | MR-03, F-11, F-12, new decisions | 10 (2 · 7 · 1) |
| [MR-08](MR-08-vault-upload-safety-and-document-control.md) | Vault: scanned uploads and real document control | Phase 0, Phase 1, Phase 2, Phase 3 | P1 | degrades | mixed | S + S + M + M + M + L + L | MR-03, MR-09, MR-15, F-4, F-6, F-18, F-27 | 10 (3 · 6 · 1) |
| [MR-09](MR-09-authoring-filing-grade-output.md) | Authoring: filing-grade output, SSO signing, Vault-grounded drafting | Phase 1, Phase 2, Phase 3, Backlog | P1 | degrades | engineering | XL in total: M + M + M + M + M + M + S + XL + M… | MR-02, MR-08, MR-13, MR-06, MR-16, MR-10, MR-17, F-5, F-10, F-12, F-13, F-16, F-24, F-27, new decisions | 12 (12 · 0 · 0) |
| [MR-10](MR-10-ectd-conformance-and-transmission.md) | eCTD v3.2.2 conformance and a real FDA transmission path | Phase 0, Phase 1, Phase 2, Phase 3, Backlog | P0 | **blocks** | mixed | XL overall — S + M + M + M + L + M + M + L + L… | MR-11, MR-03, MR-08, MR-02, F-8, F-9, F-10, F-23, new decisions | 14 (8 · 6 · 0) |
| [MR-11](MR-11-readiness-determinism-and-one-transmit-spine.md) | Submission Readiness: deterministic verdicts and one transmit spine | Phase 1, Phase 2, Phase 3, Backlog | P1 | degrades | engineering | XL in total: M + M + M + M + S + M + S | MR-10, MR-12, MR-09, MR-14, F-9, F-10, new decisions | 5 (0 · 5 · 0) |
| [MR-12](MR-12-qms-controlled-document-control.md) | QMS: versioned controlled documents, training and periodic review | Phase 0, Phase 1, Phase 3 | P0 | degrades | engineering | XL in total: M + L + M + M + M + M + L + M | MR-06, MR-02, F-11, F-12, F-13, new decisions | 10 (7 · 3 · 0) |
| [MR-13](MR-13-ai-governance-gxp-grade.md) | AI governance to GxP grade: governed model, PQ, grounding, data placement | Phase 0, Phase 1, Phase 3, Backlog | P0 | **blocks** | mixed | 2L + 6M + 2S — stages: S + L + L + M + M + M +… | MR-02, MR-03, MR-05, MR-09, MR-14, MR-16, F-5, F-14, F-15, F-16, F-20, F-25, F-26 | 18 (7 · 8 · 3) |
| [MR-14](MR-14-scope-contraction-and-codebase-health.md) | Ship only the launch catalog: scope contraction and codebase health | Phase 0, Phase 1, Phase 3, Backlog | P1 | degrades | Engineering | About 15 engineer-weeks: XS + S + L + M + M + X… | MR-05, MR-13, MR-03, MR-16, MR-09, MR-02, F-4, F-10, F-14, F-20, F-22 | 22 (16 · 6 · 0) |
| [MR-15](MR-15-first-run-and-launch-catalog-ux.md) | First-run experience and a navigation that matches the launch catalog | Phase 0, Phase 1, Phase 2, Phase 3, Backlog | P2 | degrades | engineering | S + M + M + L + L + L + M + M + M + L | MR-02, MR-14, MR-16, MR-06, MR-08, F-3, F-4, F-10, F-18 | 25 (16 · 7 · 2) |
| [MR-16](MR-16-commercial-readiness.md) | Commercial readiness: signable paper, consent, billing, email, support, SSO | Phase 0, Phase 1, Phase 3, Backlog | P0 | degrades | mixed: founder and counsel own Stage 2… | XL in total: M + M + M + M + M + L + L + L + L… | MR-03, MR-04, F-21, MR-07, MR-13, F-26, MR-15, F-3, F-4, F-19, F-20, F-24, new decisions | 22 (19 · 3 · 0) |
| [MR-17](MR-17-data-layer-correctness-at-scale.md) | Data layer: upgrade convergence, retrieval correctness, deploy scale | Phase 1, Phase 3, Backlog | P1 | degrades | engineering | L in total: S + M + M + M + M + S | MR-02, F-7, MR-03, MR-05, MR-13, F-4, F-16 | 9 (7 · 2 · 0) |

## 7. Founder decisions register

Engineering cannot close these. Each names the work order it unblocks. Decide
them in this order — the first block gates human testing on a real deployment
and the first paid pilot.

### Decide this week

| # | Decision | Recommendation | Unblocks |
|---|---|---|---|
| F-1 | Make the repository private, and decide the licence | Private now; replace MIT with a proprietary licence; ask the one fork's owner to delete it | MR-01 |
| F-2 | Rotate the credentials `.gitleaksignore` still marks `status: live` | Rotate today; record each rotation; then clear the markers | MR-01 |
| F-3 | Self-serve signup at launch | **Off.** Sales-led, invite-only orgs for the pilot; revisit at GA | MR-15, MR-16 |
| F-4 | Hosting inputs: AWS account(s), region, domain, DNS, certificates, SMTP provider and sending domain, monthly budget ceiling | One AWS org with separate staging and production accounts, `us-east-1`, one domain for app, mail, SAML entity IDs and MCP; SES with DKIM/SPF/DMARC; budget ~$1k/month for both environments hardened, plus model spend | MR-03, MR-04, MR-16 |
| F-5 | Primary model provider and data terms | Anthropic (direct or Bedrock) as primary, zero-data-retention terms signed, Claude Opus 5.5 primary + one validated fallback; no Moonshot | MR-13 |
| F-6 | Antivirus for uploads | Managed S3 malware scanning or a clamd service; one owner | MR-08 |
| F-7 | Merge discipline under Rule 0 | Keep one branch, add required status checks or a merge queue on `concept2cure-v2` so red cannot land | MR-02 |

### Decide before the pilot starts

| # | Decision | Recommendation | Unblocks |
|---|---|---|---|
| F-8 | FDA transmission model: customer-owned ESG NextGen account, C2C as transmission agent, or a certified partner | Customer-owned account, test endpoint only during the pilot; partner if NextGen REST is not built in time | MR-10 |
| F-9 | External eCTD validator licence (LORENZ eValidator, EXTEDO or GlobalSubmit) | Buy one; FDA profile only | MR-10, MR-11 |
| F-10 | Regions and formats at launch | FDA only, eCTD v3.2.2; hide EU/JP/CA and every other regional Module 1; v4.0 later; eSTAR only if the pilot is medtech | MR-10, MR-15 |
| F-11 | QMS positioning | "Controlled SOP register with signed approval and training" for the pilot — not a MasterControl replacement | MR-12 |
| F-12 | Signing roles and segregation of duties | Grantable `approver` and `qa` roles; admins administer but do not sign; author ≠ approver by default | MR-06 |
| F-13 | Second factor for signers and admins | TOTP or WebAuthn required for admin and signing roles; email OTP for others | MR-06 |
| F-14 | The AnA tool surface in production | Default-deny with a per-app allowlist; remove model-authored code execution from production | MR-13, MR-14 |
| F-15 | PQ protocol approval, system owner, and who writes the gold tasks | Approve the protocol; founder is system owner; one contract regulatory writer authors the gold bank | MR-13 |
| F-16 | Regulatory corpus licensing | FDA guidance and eCFR (public domain) first; ICH reuse terms checked; no MedDRA/WHODrug at launch | MR-13 |
| F-17 | Cross-tenant learning | Off for launch; no customer text leaves its tenant | MR-05 |
| F-18 | Project visibility default | Need-to-know (project membership) — required for any CRO or consultancy customer | MR-15 |
| F-19 | Legal entity, signer, counsel, insurance | Complete before the first order form is sent | MR-16 |
| F-20 | Pilot price and packaging | $15k–$25k fixed, 90 days, credited to year 1; one plan catalog served by the server | MR-16 |
| F-21 | SOC 2 and penetration test | Type I with an auditor engaged at pilot kickoff; external pen test including a two-tenant isolation test before the pilot handles customer data | MR-04, MR-16 |
| F-22 | Where evidence lives | An artifact store with hashes, not the product repository | MR-02 |

### Decide before GA

| # | Decision | Unblocks |
|---|---|---|
| F-23 | eCTD v4.0 timing (FDA optional; PMDA mandatory for new applications since 2026-04) | MR-10 |
| F-24 | Enterprise identity scope: OIDC, per-org SAML UI, SCIM self-service | MR-16 |
| F-25 | Data residency beyond `us-east-1`; BAA posture if any customer brings PHI | MR-04, MR-13 |
| F-26 | Anthropic Connectors Directory submission | MR-13, MR-16 |
| F-27 | Live co-editing and external data-room sharing | MR-08, MR-09 |

## 8. Operating model — what has to change for the work orders to land

The code is not the main risk. The way it is produced is. Over the two weeks
between the audit basis and this head (`92ccdba1..94b4f9238`, 2,455 non-merge
commits, almost all authored by AI sessions):

| Measure | Value |
|---|---|
| Non-merge commits touching `docs/evidence/` | 1,096 (45%) |
| Evidence added | 7,337 files, +1.39M lines; `docs/evidence` now holds 11,773 files |
| Code added (server, client, shared) | +388k / −66k lines; server is now 1.61M lines, client 336k |
| Automated baseline-refresh commits | 341 |
| `ci:*` gate scripts | 234 → 274 |
| `CI` workflow on `concept2cure-v2` | red on 8 of the last 10 runs |
| GA probe blockers ready | 1 / 19 → 0 / 19 |

Three changes, in order of leverage:

1. **Red must not land.** Rule 0 removed pull requests, and with them every
   required check. The pre-push hook runs no tests. A bot refreshes baselines
   after every push, so whatever lands becomes the new normal. Keep one branch,
   but put required status checks (or a merge queue) on it, stop the
   auto-refresh, and move the hook-only gates into CI. This is MR-02 and it is
   the precondition for every other work order holding.
2. **Contract before you add.** The launch catalog is seven apps, yet the server
   grew by about 190k lines in two weeks and 262 of 366 mounted API prefixes
   answer 403 in production. Every new line is validation scope a GxP buyer
   will ask about. Adopt a rule that a session may add code only inside a
   launch-catalog work order, and run MR-14 (scope contraction) as a standing
   lane until the production bundle is the catalog.
3. **Evidence is an output, not the work.** Evidence that a fix works belongs
   next to the fix — a failing-first test in the suite and a short note — and
   bulk artifacts belong in an artifact store with hashes (F-22). When nearly
   half of all commits are evidence, the evidence is the product.

Concurrency: at most four implementation sessions at once, each owning one
MR work order and one directory set, claimed in `docs/work-orders/README.md` §0.
A session that cannot show its acceptance criterion failing first and then
passing reports **blocked**, not done.

## 9. Market context and positioning

From [`market-brief.md`](../evidence/reviews/2026-10-13-market-readiness/market-brief.md)
(search-sourced 2026-09-29; re-open a page before quoting it):

- **The US format has not changed.** Production is eCTD v3.2.2 over ESG
  NextGen; v4.0 is optional at FDA with no mandatory date. PMDA has required
  v4.0 for new applications since April 2026, so Japan is out of scope until
  MR-10's v4.0 stage. eSTAR is mandatory for 510(k) and De Novo.
- **Incumbents are adding agents to systems buyers already validated.** Veeva
  (Basics with no implementation fee, 100+ emerging biotechs; Falcon agents with
  early adopters in 2026; Agentic Authoring expected late 2027) and IQVIA.
- **AI-native competitors are funded and moving into publishing.** Weave Bio
  (own eCTD builder, SOC 2 Type II, Parexel exclusive), Kivo (same buyer,
  published price of $24k/yr + $5k setup, CSA validation included, an MCP layer
  already shipped), Collate, Peer, Biolevate.
- **Price band for the target buyer is $10k–$60k/yr.** Outsourced eCTD
  publishing costs $5k–$25k+ per sequence — the pilot's deliverable replaces one.

**What C2C can claim once the pilot proves it:**

1. Evidence → draft → deterministic readiness → eCTD sequence → FDA gateway in
   one governed system. AI writers stop at the draft; publishers do not author.
2. Per-output provenance: every drafted claim traces to a Vault document
   version and page, a pinned model version and its eval reference.
3. Deterministic, version-pinned verdicts; the model narrates and never
   produces a figure.
4. A published price and a paid, fixed-scope pilot.

**What C2C must not claim:** "Part 11 certified", "FDA-validated" or "validated
system" (say "Part 11 controls; validation evidence supplied"); Annex 11/22
compliance (neither is adopted); EU AI Act status before counsel review; "first
regulatory MCP" (Kivo shipped one); eCTD v4.0, EU or Japan readiness; SOC 2 or
any Anthropic partnership before it exists; any figure or verdict produced by a
model.

**Recommended first customer:** a US venture-backed biotech, 10–150 staff,
preclinical to Phase 2, with an FDA filing 3–9 months out and not on Veeva
Basics — plus a parallel channel pilot with a boutique regulatory consultancy.
Defer top-20 pharma and medtech.

**Pilot shape:** 90 days, one program, one real deliverable — the scoped
Module 2/3 sections plus a v3.2.2 sequence that passes FDA validation and an
ESG NextGen **test** transmission under the customer's own account. Success
criteria in the SOW: first-draft time down ≥50% against the customer's own
baseline; every factual statement resolves to a Vault citation; zero
high-severity validation errors on first pass; acknowledgments received; QA
signs the supplier assessment.

## 10. What is genuinely strong — keep it, do not rebuild it

This repository has a documented history of deleting working subsystems as
"unreachable" and rebuilding them. These are the parts the evaluation found
sound at the audit basis. Each work order builds on them; none replaces them.

| Area | What to keep | Where |
|---|---|---|
| Sign-in core | Default-deny auth boundary forced in production; token-class assertion; HS256 pinned; revocation that outlives the token; idle/lifetime/concurrent-session limits enforced server-side; role read from the membership row on every request; MFA always issued on the password door; per-account lockout; timing pad against enumeration; single-use TOTP steps | `server/middleware/authBoundary.ts`, `server/middleware/auth.ts`, `server/services/session-inactivity.ts`, `server/routes/auth.ts`, `server/services/mfaService.ts` |
| Tenant scope | Scope taken from the verified membership; FORCE RLS on 888 of 976 public tables; the request client clears its settings on release; boot refuses a superuser, BYPASSRLS or table-owning runtime role | `server/middleware/establishRequestTenantScope.ts`, `server/middleware/lazyRequestDbClient.ts`, `server/db/rlsEnforcement.ts` |
| Provisioning | One command from an empty database to a verified schema in 24 s, deterministic, refuses before writing when pgvector/CREATEROLE/psql are missing, verifies as the non-owner role; replay-safe runner with per-file transactions, lock timeout and an advisory lock | `scripts/db/provision.mjs`, `scripts/db/migration-set.mjs`, `scripts/db/deploy-migrate.mjs` |
| Part 11 core | One signing ceremony for every signer (standing, lockout, password, enrolled factor); one INSERT path into `electronic_signatures` that states what each digest covers; append-only triggers on the core audit and signature stores; per-tenant hash chain sealed with an HMAC key held outside the database; boot refuses production when a trigger is missing; daily integrity sweep | `server/services/part11/reverify-signer.ts`, `server/services/part11/signature-persistence.ts`, `server/services/audit/chain.ts`, `server/startup/audit-enforcement.ts`, `server/jobs/auditChainIntegritySweep.ts` |
| Governed writes done right | Legal holds, Vault ingest (antivirus fail-closed, chained audit row in the same transaction), QMS approve/retire and change approve, submission sign-release, tenant purge with hold and export preconditions — the pattern every second door should copy | `server/routes/vault-legal-holds.ts`, `server/services/vault/vault-ingest.service.ts`, `server/services/qms/document-approval-signature.ts`, `server/routes/submission-sign-release.ts`, `server/services/tenant/tenant-offboarding.ts` |
| Honest state | Empty and error are distinct; errors redact internals and carry a correlation id; counts that fail to load show "?" not 0; dispatch readiness never treats "never reviewed" as clean; compliance status reports "not assessed" rather than certifying itself | `client/src/concept2cure/v2/dataConnect.tsx`, `TaskTray.tsx`, `server/services/submission-gateways/dispatch-gate.ts`, `server/routes/part11-compliance.ts` |
| eCTD core | MD5 over the exact bytes shipped; lifecycle correctness (modified-file must resolve to a prior leaf; delete carries no bytes); every governed step needs a signature bound to the sequence; transmit claim/lock; fingerprint drift refused; official FDA forms filled into the agency's own PDFs | `server/services/submission-gateways/regional-packager.ts`, `submission-service.ts`, `governed-transmit.ts`, `server/services/ind-forms/*` |
| AI governance scaffolding | One gateway with a 42-column ledger per call; approved-models lockfile checked at every selection point; sensitive-data placement fails closed at boot and before every dispatch; demo mode fenced out of production; every AnA tool classified, writes need confirmation, high tier needs a signature; PQ harness that fails closed | `server/services/ai-gateway/gateway.ts`, `server/services/ai-governance/approved-models.ts`, `sensitive-placement-policy.ts`, `server/services/ana/tool-authorization.ts`, `server/eval/pq/` |
| MCP connector | OAuth 2.1 with PKCE, dynamic registration and discovery metadata; 19 tools each with a scope and all four annotations; tenant-scoped and audited | `server/mcp/` |
| Editor | TipTap 3 with tables, captions, cross-references, citations, anchored comments, tracked text changes, round-trip fidelity gate, crash cache, optimistic concurrency; AnA draft → canvas → editor → Vault path implemented as designed | `client/src/concept2cure/v2/editor/`, `server/routes/authoring.router.ts`, `docs/design/ANA_DOCUMENT_CANVAS.md` |
| Infrastructure design | One Terraform composition with thin staging/production roots; OIDC deploy roles split build/deploy; image pinned by digest; migrate as a one-off task; CloudFront as the only way to the ALB; customer-managed KMS keys; Object Lock evidence bucket; asymmetric release-signing key | `terraform/stack/`, `terraform/modules/`, `.github/workflows/deploy-aws.yml` |
| Launch scope | Server-side launch-scope gate mounted before every feature family, on by default in production, refusing to boot on an unparseable value | `server/services/entitlements/launch-scope.ts`, `shared/constants/launch-scope.ts` |
| Tests | ~35,000 vitest tests; the launch-catalog subset green; behaviour-level client tests with user events and no snapshots | `tests/`, `client/src/concept2cure/v2/__tests__/` |
| Commercial paper | Pilot agreement, GxP-edition MSA, DPA with annexes, order form, support policy, onboarding runbook, SIG Lite and policies drafted and honest about their gaps | `docs/commercial/`, `docs/security/` |

## 11. Method and limits

- **Cold.** Lanes did not open prior audits, assessments, evidence packs,
  handoffs, changelogs or status narratives, and treated comments and commit
  messages that say "fixed" as claims to check in code.
- **Runtime where it mattered.** Provisioning from an empty PostgreSQL 16 with
  pgvector (24 s at the basis; fails at `94b4f9238`; 30 s at `eeabd3cab`), a
  replay and an upgrade simulation; the canonical eCTD packager on a toy FDA IND
  sequence; ~35,000 vitest tests in five shards; RLS bypass and signature
  mutability demonstrated as the runtime role; 19 repository security gates;
  `npm audit`; GitHub run history for every workflow; the app booted at
  `eeabd3cab` and a seeded user signed in through the email second factor.
- **A tester's first hour, run for real (2026-10-18).** At `aa4ee1e29`, from an
  empty database: provision (408/408 migrations), boot, sign in, create an IND
  program, upload a PDF to its Vault, and create a 3.2.P document from its
  template ([smoke-at-head.md](../evidence/reviews/2026-10-13-market-readiness/smoke-at-head.md)).
  Program creation failed until a workaround was applied (HT-01). The fix,
  `969d1e727`, was proved on a fresh database at `d0cde23b9`: 409 before, 201
  after, on the same running app
  ([evidence](../evidence/W1/2026-10-18-seeded-workspace/)).
- **Re-verified at head.** Every finding was re-checked against `94b4f9238` by
  skeptical verifiers that had to cite code at head for any "fixed" verdict.
  Thorough checks (4 findings per agent) for P0/P1, lighter checks (8 per agent)
  for P2/P3. Statuses, severities, tester impact and instructions in this
  roadmap and the work orders come from those records, not from the audit.
- **Limits.** The quality-engineering lane was cut short by a usage limit
  before typecheck, lint, build and Playwright, so those results are CI's own.
  Nothing was checked against live AWS, a live model provider or an agency
  gateway; anything depending on them is marked UNVERIFIABLE. Market claims
  come from search extracts (the sandbox could not open fda.gov, ema.europa.eu
  or most vendor sites) and are tagged primary or secondary. Lane scores are
  the lane auditors' judgement against the pilot target.

Full method, file index and reproduction notes:
[`docs/evidence/reviews/2026-10-13-market-readiness/README.md`](../evidence/reviews/2026-10-13-market-readiness/README.md).
