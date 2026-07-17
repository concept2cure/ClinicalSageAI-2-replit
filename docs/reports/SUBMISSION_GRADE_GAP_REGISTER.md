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

## ✅ Cured this pass (PR #1027)

| Gap | Sev | Standard | Commit |
|---|---|---|---|
| eCTD export could assemble a placeholder-leaky / empty dossier (no completeness gate) | Critical | FDA eCTD Tech Conformance Guide; ICH M8 | `5bb0d52` |
| eCTD **transmit** silently dropped leaves whose document couldn't be assembled → incomplete dossier sent to agency | Critical | FDA eCTD; ICH M8 | `6e1c9e7` |
| e-signature route enforced identity (password+MFA) but **not signing authority** — any user could apply an approval signature | Critical | 21 CFR 11 §11.10(d)(g) | `0547a4f` |
| MDR/IVDR "content-addressed" ZIP wasn't deterministic (implicit folder timestamps) — reproducibility/integrity bug | High | data integrity / ALCOA+ | `92d9c02` |
| **PV expedited-reporting clock was stored, not computed** — now live-computed from sponsor **awareness date** + seriousness/causality/expectedness (7-day/15-day/none), fails safe when the awareness date is absent | High | 21 CFR 312.32(c); ICH E2A | `92df8e7` |
| **Investigator's Brochure had no v2 surface** — `ib-builder` now surfaced as an honest ICH E6(R2) §7 section tree (deterministic, AI-free, per-section readiness) | High | ICH E6(R2) §7 | `53d059e` |
| Completeness observability absent on 2nd export path | Low | — | `7037796` |

---

## ⛔ Open — Critical / High (drug-biologic lead)

Each row: the gap, what it blocks, the standard, and **the input needed to cure it** (why it
isn't a code-only fix I can land unilaterally).

| Gap | Sev | Blocks | Standard | Input needed |
|---|---|---|---|---|
| **Official FDA forms not installed** — every IND form renders a DRAFT "template not installed" PDF; Form 1573 / NDA 356h absent | Critical | IND (1571/1572/3674), NDA (356h) filing | 21 CFR 312.23 / 314.50 | **Asset**: official FDA fillable PDFs. `fda.gov` egress-blocked here → **allowlist** or **drop** the files; the fill service activates them on contact. |
| **No licensed eCTD validator bundled** — Pinnacle21/eValidator is a fail-closed hook awaiting an engine; no in-repo ESG technical-rejection check | Critical | Any eCTD submission (can't prove ESG conformance) | FDA eCTD validation criteria | **Asset**: licensed validator binary/endpoint (`EVALIDATOR_*`) or vendored ICH/FDA DTDs. **Update (recon):** the ICH backbone DTD (`ich-ectd-3-2.dtd`) is publicly available and integrity-verified (byte-identical across two independent public repos), so acquisition is technically unblocked — but the repo's own `assets/ectd-dtd` policy marks agency DTDs *licensed, "do not commit,"* gated behind the `docs/runbooks/ectd-dtd-vendoring.md` legal-review → sign-off workflow: **a maintainer/legal drop, not an autonomous commit.** The **FDA US-Regional DTD** (`us-regional-v2-01.dtd`) has **no verifiable public source** (fda.gov egress-blocked) → still allowlist/official-source drop. |
| **21 CFR Part 11 not fully activated** — RLS off by default; audit is opt-in per route (no global mutation interception); e-signatures span 3 stores | Critical | GxP deployment inside a regulated company | 21 CFR 11 §11.10(c)(e); Annex 11 | **(a) RLS — mostly OPS, not build:** the policy is installed + proven (integration test filters correctly on-enforce; 36 unit tests green), with a per-request tenant-scoped client (`requireTenantContext`/`LazyRequestDbClient`), miss-counter observability, a full staged **`docs/rls-rollout-runbook.md`**, and env-flag + SQL rollback all shipped. What remains is the **operator flip** (drive the missing-counter to zero on real traffic → canary `RLS_ENFORCE=on` in staging → 48 h soak → prod), gated on production observability — not new code. **(b) mandatory audit interception** and **(c) signature-store convergence** are genuine remaining build work (signing-authority gate now enforced, `0547a4f`); both behind flags with rollback. |
| **CSV (IQ/OQ/PQ) 100% DRAFT/PENDING, unexecuted** | Critical | Any GxP use | GAMP 5; Annex 11 | **Human process**: executed & signed by your quality unit against the deployed build. Not a file to download. |
| **AI generation key-gated** — CSR/IB/M3-narrative real AI drafting only fires with the AI-gateway key; M2 summaries are deterministic concatenation, not reasoned drafting | High | Reasoned narrative authoring (2.5/2.7, CSR discussion) | ICH E3/M4 | **Config**: AI-gateway key. (Deterministic composition works without it.) |
| **Preclinical M2.6/M4 doc-gen is fixture** — study registry + SEND-readiness are live, but the Module 2.6 written/tabulated summary and Module 4 placement aren't generated | High | NDA/BLA Module 2.6 / Module 4 | ICH M4S | **Design/build**: an M2.6 builder + M4 placement over the real nonclinical data (feature slice). |
| **Marketing-application cockpits are US-first** — NDA/BLA anchored (356h/PDUFA/RTF); no executable MAA (EMA)/J-NDA (PMDA)/HC/TGA/NMPA workflow (reference-only in global-RI) | High | Non-US marketing applications | region CTD Module 1 | **Design/build**: per-region Module-1 + workflow slices. |

## Open — Medium (representative)
- NDA/BLA live cockpit reads a `c2c_*` demo mirror, not the real BLA workbench (`c2c_bla_assessments` is separate/kit-only) — converge them.
- Exporter placeholder handling is now gated at submission grade, but draft exports still ship placeholders by design — ensure the client's "final" action always sets `requireComplete`.
- Labeling: USPI live (`c2c_labeling_pi`); SmPC (EU QRD) is notes-only.
- Post-approval lifecycle (variations/supplements, PIP/PREA, orphan) is kit-only, unseeded.

---

## How to drive the rest
1. **You unblock the assets** (allowlist or drop): FDA forms + eCTD DTDs → I land those cures with provenance + checksums.
2. **Deep Part-11**: RLS activation is now an **operator flip** per `docs/rls-rollout-runbook.md` (machinery/plan/rollback/proof all shipped) — you run the staged flip; I do NOT flip it unilaterally on production, and I do NOT speculatively convert routes (the runbook's miss-counter drives that, by data not guessing). The remaining **build** work — mandatory audit interception + signature-store convergence — I sequence behind flags with a rollback path and route tests on your green-light.
3. **The feature-level slices** (M2.6/M4 doc-gen, non-US cockpits; IB surface + PV awareness-date clock now landed) → I build them one verified slice at a time, same pattern as this PR.
4. The running adversarial sweep will add any gaps this evidence-grounded pass missed; I'll reconcile it in when it completes.

_Nothing here is fabricated: every "cured" row has a commit; every open row names the standard it
fails and the concrete input it needs. "Ready for real human submission-grade use" is not asserted —
it is not true yet, and won't be until the Critical rows above are closed and the CSV is executed._
