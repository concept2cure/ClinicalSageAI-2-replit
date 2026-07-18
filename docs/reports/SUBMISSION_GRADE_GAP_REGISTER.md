# Submission-Grade Readiness — Gap Register & Remediation Roadmap

**Bar:** submission-grade (could a real biotech author/assemble actual filings to FDA/EMA/PMDA).
**Lead modality:** drug/biologic (device/IVD summarized).
**Method:** evidence-grounded reconnaissance (3 deep code audits) + hands-on remediation; a
max-depth adversarial multi-agent sweep is still running and will refine/extend this register.

> Bottom line: the platform is a **sophisticated UAT / GA-demo-stage system with unusually
> strong backend composition machinery and Part-11 *scaffolding*, not a submission-grade
> system today**. The blockers are integration/activation and last-mile fidelity, plus a set
> of asset/policy inputs only Concept2Cure can supply — not absence of capability. This pass
> closed several Critical integrity gates; the rest are mapped below with the input each needs.

## Severity key
- **Critical** — blocks a submission / clinical hold / Refuse-to-File / data-integrity finding.
- **High** — serious deficiency or major rework at review.
- **Medium** — quality/efficiency/compliance gap short of blocking.
- **Low** — polish.

---

## ✅ Cured (PRs #1027–#1032)

| Gap | Sev | Standard | PR / Commit |
|---|---|---|---|
| eCTD export could assemble a placeholder-leaky / empty dossier (no completeness gate) — the gate now also fails **draft/review (unfinalized)** leaves, not just empty placeholders (Codex P2) | Critical | FDA eCTD Tech Conformance Guide; ICH M8 | #1027 `5bb0d52` + hardening |
| eCTD **transmit** silently dropped leaves whose document couldn't be assembled → incomplete dossier sent to agency — the gate now blocks on **every** unresolved leaf incl. external vault/onboarding pointers (their bytes aren't materialized into the ZIP), not just "genuine defects" (Codex P1) | Critical | FDA eCTD; ICH M8 | #1027 `6e1c9e7` + hardening |
| e-signature route enforced identity (password+MFA) but **not signing authority** — any user could apply an approval signature | Critical | 21 CFR 11 §11.10(d)(g) | #1027 `0547a4f` |
| **§11.10(g) signing-authority gate covered only one route** — now enforced on **every** credential-verified signing route (submission sign-release, `/api/part11/signatures`, AnA verified-seal) via a shared authoritative role resolver (role read from the membership record, never the request body) | Critical | 21 CFR 11 §11.10(g) | #1028 |
| MDR/IVDR "content-addressed" ZIP wasn't deterministic (implicit folder timestamps) — reproducibility/integrity bug | High | data integrity / ALCOA+ | #1027 `92d9c02` |
| **PV expedited-reporting clock was stored, not computed** — now live-computed from sponsor **awareness date** + seriousness/causality/expectedness (7-day/15-day/none), fails safe when the awareness date is absent | High | 21 CFR 312.32(c); ICH E2A | #1027 `92df8e7` |
| **Investigator's Brochure had no v2 surface** — `ib-builder` now surfaced as an honest ICH E6(R2) §7 section tree (deterministic, AI-free, per-section readiness) | High | ICH E6(R2) §7 | #1027 `53d059e` |
| **Preclinical M2.6 / M4 / SEND were static surface fixtures** — the M2.6 composer, M4 study-report authoring, SEND gate + governed registry already existed but the `Nonclinical.tsx` cards weren't bound to them; now a live projection over the governed `nonclinical_studies` registry (M2.6 subsection readiness, 4.2.x placement = finalized/total, SEND package rollup), fail-closed to the honest skeleton | High | ICH M4S; CDISC SENDIG; FDA Study Data TCG | #1027 |
| **No non-US marketing-application Module-1 cockpit** — EMA/PMDA regional Module-1 readiness now live-computed by the deterministic `assessRegionalModule1` engine over a governed assembled-components store (`c2c_maa_module1_components`), per-market provided-vs-required | High | EU CTD Module 1; JP Module 1 | #1029 |
| **NDA/BLA cockpit read a demo mirror, not the real biologics workbench** — the three science engines (CQA analytical similarity, Q5E comparability, ADA/NAb immunogenicity) + RTF/CRL filing-risk were mounted at `/api/biopharma/bla` but their `c2c_bla_assessments` store had no migration (42P01 at runtime); now provisioned, hardened (fail-closed list), and surfaced as a live "BLA biologics" cockpit tab (only allowlisted passing verdicts render green — an unresolved blocker never shows complete, Codex P2) | High | BLA 351(a); ICH Q5E | #1031 |
| **EU SmPC (QRD) was notes-only** — now an authored EMA/HMA QRD section tree (1–10 with 4.x/5.x/6.x) with server-computed submission readiness over the required sections, live from a governed `c2c_smpc_sections` store | High | EMA/HMA QRD template; Dir 2001/83/EC Art. 11 | #1030 |
| **Post-approval renewal cycles were a static fixture** — the governed recurring-obligation engine (`/api/lifecycle`, `lifecycle_obligations` + tested `lifecycle-logic` composer) had no surface; the Lifecycle "Renewal cycles" card now projects it live (region→authority, recurrence→interval, deterministic urgency, next generated occurrence for undated recurring reports — Codex P2), fail-closed to the sample fixture | Medium | 21 CFR 314.70(d); EU Reg 1234/2008; ICH E2C | #1032 |
| Completeness observability absent on 2nd export path | Low | — | #1027 `7037796` |

---

## ⛔ Open — Critical / High (drug-biologic lead)

Each row: the gap, what it blocks, the standard, and **the input needed to cure it** (why it
isn't a code-only fix I can land unilaterally).

| Gap | Sev | Blocks | Standard | Input needed |
|---|---|---|---|---|
| **Official FDA forms not installed** — every IND form renders a DRAFT "template not installed" PDF; Form 1573 / NDA 356h absent | Critical | IND (1571/1572/3674), NDA (356h) filing | 21 CFR 312.23 / 314.50 | **Asset**: official FDA fillable PDFs. `fda.gov` egress-blocked here → **allowlist** or **drop** the files; the fill service activates them on contact. |
| **No licensed eCTD validator bundled** — Pinnacle21/eValidator is a fail-closed hook awaiting an engine; no in-repo ESG technical-rejection check | Critical | Any eCTD submission (can't prove ESG conformance) | FDA eCTD validation criteria | **Asset**: licensed validator binary/endpoint (`EVALIDATOR_*`) or vendored ICH/FDA DTDs. **Update (recon):** the ICH backbone DTD (`ich-ectd-3-2.dtd`) is publicly available and integrity-verified (byte-identical across two independent public repos), so acquisition is technically unblocked — but the repo's own `assets/ectd-dtd` policy marks agency DTDs *licensed, "do not commit,"* gated behind the `docs/runbooks/ectd-dtd-vendoring.md` legal-review → sign-off workflow: **a maintainer/legal drop, not an autonomous commit.** The **FDA US-Regional DTD** (`us-regional-v2-01.dtd`) has **no verifiable public source** (fda.gov egress-blocked) → still allowlist/official-source drop. |
| **21 CFR Part 11 not fully activated** — RLS off by default; global audit trail default-off pending provisioning; e-signatures span 3 stores | Critical | GxP deployment inside a regulated company | 21 CFR 11 §11.10(c)(e); Annex 11 | **(a) RLS — mostly OPS, not build:** the policy is installed + proven (integration test filters correctly on-enforce; 36 unit tests green), with a per-request tenant-scoped client (`requireTenantContext`/`LazyRequestDbClient`), miss-counter observability, a full staged **`docs/rls-rollout-runbook.md`**, and env-flag + SQL rollback all shipped. What remains is the **operator flip** (drive the missing-counter to zero on real traffic → canary `RLS_ENFORCE=on` in staging → 48 h soak → prod), gated on production observability — not new code. **(b) Audit interception — already built, also OPS:** a **global** tamper-proof mutation interceptor exists (`server/startup/audit-trail.ts`, mounted after auth on every `/api` mutation, SHA-256 hash-chain + HMAC to `audit.tamper_proof_log`), with a 5-min chain-integrity monitor, shutdown handling, evidence-pack, and regression tests — **default-off pending operator provisioning** (audit schema + `AUDIT_HMAC_SECRET` + `AUDIT_TRAIL_ENABLED=true`), the same posture as RLS. Now carries a **boot-time production-visibility guardrail** (warns when audit is off in prod; fail-closed only via `AUDIT_REQUIRE_ENFORCE=true`). The per-route `recordGovernedAction` path is the transactional fail-closed §11.10(e) trail; the global interceptor is best-effort defense-in-depth. **(c) signature-authority convergence — largely landed:** the §11.10(g) signing-authority gate, previously on only `/api/esignature/sign` (`0547a4f`), now covers **every credential-verified signing route** — submission sign-release, `/api/part11/signatures`, and the AnA verified-seal route — via a shared authoritative role resolver (`resolve-signer-role.ts`, role read from the membership record, never the body). The workflow-signing route (`/api/signing/requests/:id/sign`) is **demo-grade** (body identity, no §11.200 credential check) and is explicitly flagged for hardening (Step 1b) rather than given a theater gate. Store *unification* (one canonical `applySignature()` + one manifest table across the 3 signature stores) remains a larger, deferred refactor. |
| **CSV (IQ/OQ/PQ) 100% DRAFT/PENDING, unexecuted** | Critical | Any GxP use | GAMP 5; Annex 11 | **Human process**: executed & signed by your quality unit against the deployed build. Not a file to download. |
| **AI generation key-gated** — CSR/IB/M3-narrative real AI drafting only fires with the AI-gateway key; M2 summaries are deterministic concatenation, not reasoned drafting | High | Reasoned narrative authoring (2.5/2.7, CSR discussion) | ICH E3/M4 | **Config**: AI-gateway key. (Deterministic composition works without it.) |
| **Marketing-application cockpits are US-first** — NDA/BLA anchored (356h/PDUFA/RTF). **Partly closed:** EMA/PMDA regional **Module-1 readiness** cockpits now live (#1029) and the BLA biologics workbench is surfaced (#1031); still **no fully executable** MAA/J-NDA end-to-end workflow, and HC/TGA/NMPA remain reference-only in global-RI | High | Non-US marketing applications | region CTD Module 1 | **Design/build**: remaining per-region workflow slices (HC/TGA/NMPA; executable MAA/J-NDA beyond Module-1 readiness). |

## Open — Medium (representative)
- Exporter placeholder handling is now gated at submission grade, but draft exports still ship placeholders by design — ensure the client's "final" action always sets `requireComplete`.
- Labeling: USPI live (`c2c_labeling_pi`) and **EU SmPC (QRD) now live** (`c2c_smpc_sections`, #1030); other regional labels (JP, RoW) remain out of scope.
- Post-approval lifecycle: **renewal/periodic-report cycles now live** (governed `lifecycle_obligations`, #1032); the **variations/supplements CMC change-control card, PIP/PREA milestones, and orphan RPD/advocacy cards remain static fixtures** (the SUPAC/Q5E variation-classification composers and the governed obligation store exist — a follow-on binding slice, same pattern as #1032).

---

## How to drive the rest
1. **You unblock the assets** (allowlist or drop): FDA forms + eCTD DTDs → I land those cures with provenance + checksums.
2. **Deep Part-11**: RLS activation is now an **operator flip** per `docs/rls-rollout-runbook.md` (machinery/plan/rollback/proof all shipped) — you run the staged flip; I do NOT flip it unilaterally on production, and I do NOT speculatively convert routes (the runbook's miss-counter drives that, by data not guessing). The remaining **build** work — mandatory audit interception + signature-store convergence — I sequence behind flags with a rollback path and route tests on your green-light.
3. **The feature-level slices** — now landed: IB surface, PV awareness-date clock, M2.6/M4/SEND projection (#1027), signing-authority convergence (#1028), EMA/PMDA Module-1 cockpit (#1029), EU SmPC (#1030), BLA biologics-workbench convergence (#1031), post-approval renewal cycles (#1032). **Remaining:** HC/TGA/NMPA cockpits + executable non-US workflow, and the lifecycle CMC-change/PIP-PREA/orphan cards → I build them one verified slice at a time, same pattern (governed store → tested composer → read-route → surface binding → seed → tests, fail-closed to a visibly-tagged sample).
4. The running adversarial sweep will add any gaps this evidence-grounded pass missed; I'll reconcile it in when it completes.

_Nothing here is fabricated: every "cured" row has a commit; every open row names the standard it
fails and the concrete input it needs. "Ready for real human submission-grade use" is not asserted —
it is not true yet, and won't be until the Critical rows above are closed and the CSV is executed._
