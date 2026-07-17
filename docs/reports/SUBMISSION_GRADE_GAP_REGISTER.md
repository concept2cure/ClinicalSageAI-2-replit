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
| Completeness observability absent on 2nd export path | Low | — | `7037796` |

---

## ⛔ Open — Critical / High (drug-biologic lead)

Each row: the gap, what it blocks, the standard, and **the input needed to cure it** (why it
isn't a code-only fix I can land unilaterally).

| Gap | Sev | Blocks | Standard | Input needed |
|---|---|---|---|---|
| **Official FDA forms not installed** — every IND form renders a DRAFT "template not installed" PDF; Form 1573 / NDA 356h absent | Critical | IND (1571/1572/3674), NDA (356h) filing | 21 CFR 312.23 / 314.50 | **Asset**: official FDA fillable PDFs. `fda.gov` egress-blocked here → **allowlist** or **drop** the files; the fill service activates them on contact. |
| **No licensed eCTD validator bundled** — Pinnacle21/eValidator is a fail-closed hook awaiting an engine; no in-repo ESG technical-rejection check | Critical | Any eCTD submission (can't prove ESG conformance) | FDA eCTD validation criteria | **Asset**: licensed validator binary/endpoint (`EVALIDATOR_*`) or vendored ICH/FDA DTDs (`estri.ich.org` egress-blocked → allowlist/drop). |
| **21 CFR Part 11 not activated** — RLS off by default & live routes bypass the tenant-scoped connection; audit is opt-in per route (no global mutation interception); e-signatures siloed across 3 stores | Critical | GxP deployment inside a regulated company | 21 CFR 11 §11.10(c)(e); Annex 11 | **Policy + careful build**: green-light to (a) turn RLS on and route live queries through the tenant connection, (b) add mandatory audit interception, (c) converge signature stores — behind flags with a rollback path. |
| **CSV (IQ/OQ/PQ) 100% DRAFT/PENDING, unexecuted** | Critical | Any GxP use | GAMP 5; Annex 11 | **Human process**: executed & signed by your quality unit against the deployed build. Not a file to download. |
| **AI generation key-gated** — CSR/IB/M3-narrative real AI drafting only fires with the AI-gateway key; M2 summaries are deterministic concatenation, not reasoned drafting | High | Reasoned narrative authoring (2.5/2.7, CSR discussion) | ICH E3/M4 | **Config**: AI-gateway key. (Deterministic composition works without it.) |
| **Investigator's Brochure has no v2 surface** — `ib-builder` exists in the backend but isn't wired into the shell | High | IND (IB per ICH E6 §7) | ICH E6 | **Design/build**: wire `ib-builder` into a surface (feature slice). |
| **Preclinical M2.6/M4 doc-gen is fixture** — study registry + SEND-readiness are live, but the Module 2.6 written/tabulated summary and Module 4 placement aren't generated | High | NDA/BLA Module 2.6 / Module 4 | ICH M4S | **Design/build**: an M2.6 builder + M4 placement over the real nonclinical data (feature slice). |
| **PV expedited-reporting clock is stored, not computed** — `c2c_sae_cases` carries static `due/clock/due_days`; no live deadline from sponsor **awareness date** + seriousness | High | IND safety reporting timeliness | 21 CFR 312.32; ICH E2A | **Schema + design**: add an awareness/receipt date, then a deterministic 7-day/15-day clock. (Computing from onset would give *wrong* safety deadlines — deliberately not shipped.) |
| **Marketing-application cockpits are US-first** — NDA/BLA anchored (356h/PDUFA/RTF); no executable MAA (EMA)/J-NDA (PMDA)/HC/TGA/NMPA workflow (reference-only in global-RI) | High | Non-US marketing applications | region CTD Module 1 | **Design/build**: per-region Module-1 + workflow slices. |

## Open — Medium (representative)
- NDA/BLA live cockpit reads a `c2c_*` demo mirror, not the real BLA workbench (`c2c_bla_assessments` is separate/kit-only) — converge them.
- Exporter placeholder handling is now gated at submission grade, but draft exports still ship placeholders by design — ensure the client's "final" action always sets `requireComplete`.
- Labeling: USPI live (`c2c_labeling_pi`); SmPC (EU QRD) is notes-only.
- Post-approval lifecycle (variations/supplements, PIP/PREA, orphan) is kit-only, unseeded.

---

## How to drive the rest
1. **You unblock the assets** (allowlist or drop): FDA forms + eCTD DTDs → I land those cures with provenance + checksums.
2. **You green-light the deep Part-11 work** → I sequence RLS-on + mandatory-audit + signature convergence behind flags with a rollback path and route tests.
3. **The feature-level slices** (IB surface, M2.6/M4 doc-gen, PV awareness-date clock, non-US cockpits) → I build them one verified slice at a time, same pattern as this PR.
4. The running adversarial sweep will add any gaps this evidence-grounded pass missed; I'll reconcile it in when it completes.

_Nothing here is fabricated: every "cured" row has a commit; every open row names the standard it
fails and the concrete input it needs. "Ready for real human submission-grade use" is not asserted —
it is not true yet, and won't be until the Critical rows above are closed and the CSV is executed._
