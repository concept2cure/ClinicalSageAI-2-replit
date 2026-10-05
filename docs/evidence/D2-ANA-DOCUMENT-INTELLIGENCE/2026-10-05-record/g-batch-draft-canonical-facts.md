# g-batch-draft-canonical — regulatory facts relied on (2026-10-05)

The change adds no regulatory content of its own. Every requirement a draft now
receives is rendered from the existing canonical record
(`server/services/ind/ctd/requirements-resolver.ts` → `section-brief.ts` →
`authoring-guidance.ts`). This file lists the facts that decided **routing**:
which record answers which request.

| # | Fact | Basis | Source / checked | Used for |
|---|---|---|---|---|
| 1 | In FDA's eCTD Module 1, heading 1.1 is "Forms" and 1.2 is "Cover letters". | regulator-hosted URL, content via search summary (not read in full). The PDF was not opened: regulator hosts are blocked for WebFetch. Agrees with recall. | FDA, *The Comprehensive Table of Contents Headings and Hierarchy*, v2.3.3: https://www.fda.gov/media/76444/download. The eCTD v4.0 edition is https://www.fda.gov/media/179699/download. Checked 2026-10-05. | Shows the CTD_SECTIONS blueprint row "1.2 — Administrative Forms" is wrong for a US entry. For US Module 1 the record (1.2 Cover Letter) wins and the blueprint row is never sent. |
| 2 | FDA Module 1 heading 1.14.4.1 holds the investigator's brochure. The search summary gives the heading text as "Investigational brochure". | regulator-hosted URL, content via search summary (not read in full), as in row 1. The heading wording ("Investigational brochure") is the summary's, not a read of the PDF. | Same documents as row 1. Checked 2026-10-05. | `ind` / `1.14.4.1` is answered from the record's entry. |
| 3 | Module 1 is regional. ICH M4 harmonises Modules 2–5 only. | recall. The registry's own `moduleAuthority` for ICH_CTD_M1 says the same ("Module 1 is regional by definition"). | — | The record's Module 1 (FDA-only entries) answers US entries only. Every other region gets "Module 1 is regional; … no <region> Module 1 entry — do not supply its requirements from memory". |
| 4 | In EU Module 1 the cover letter is at 1.0 and the application form at 1.2. | recall. | — | The reason an EU MAA's 1.2 must not be briefed as FDA's cover letter. The code does not assert this fact. It only declines to answer EU Module 1 until g-drafting-paths-scope answers it from REGIONAL_MODULE1. |
| 5 | 2.7.4 Summary of Clinical Safety and 5.3.5.3 Reports of Analyses of Data from More Than One Study come from ICH M4E(R2). 3.2.P.5 Control of Drug Product comes from ICH M4Q(R1). | recall (high confidence). The titles are the record's own (`authoring-guidance.ts`). | — | The red cases. They are not re-stated by this change. |
| 6 | NeeS (non-eCTD electronic submission) uses the CTD organisation. | recall. | — | `NeeS` is admitted to the CTD-framework gate with eCTD and CTD. EU_NEES therefore gets the regional Module 1 line instead of the blueprint's US-shaped "Administrative Forms" row. |
| 7 | An EU CTR clinical trial application (EU_CTA, `dossierStandard: 'regional'`) is a Part I / Part II submission, not a five-module CTD. An ACTD (SG) dossier is not the ICH CTD. | Registry text. EU_CTA `moduleAuthority` cites Regulation (EU) 536/2014 Annex I. ACTD is recall. | — | Both stay outside the CTD gate and keep their blueprint behaviour. |
| 8 | ICH M4Q places drug-substance stability at 3.2.S.7 and drug-product stability at 3.2.P.8; reference standards at 3.2.S.5 / 3.2.P.6; container closure at 3.2.S.6 / 3.2.P.7. | recall (high confidence). The record's own titles agree (`authoring-guidance.ts`: 3.2.S.7 "Stability (Drug Substance)", 3.2.P.8 "Stability"). | — | Review round 1: an entry whose outline holds "Stability" at 3.2.S.7 (US_DMF, ICH_M3_DS) is briefed as 3.2.S.7, never the record's same-titled 3.2.P.8. |
| 9 | The Module 2.3 Quality Overall Summary follows the Module 3 structure (2.3.S, 2.3.P, 2.3.A, 2.3.R), with its own introduction (2.3 "Introduction") distinct from the CTD Module 2.2 Introduction. | recall (high confidence). | — | Review round 1: ICH_QOS "Introduction" → its own row 2.3.I (record answer: ancestor 2.3), never 2.2; "Regional Information" → 2.3.R, never 3.2.R; a QOS asked for "Stability", which its outline lacks, gets `record:outside-outline`, never the Module 3 brief. |
| 10 | A Type II DMF holds drug-substance information (3.2.S), not drug-product sections (3.2.P). | recall. Not asserted by the code: the code only reads the DMF blueprint, whose rows are 1.x, 3.2.S.1–3.2.S.7 and 3.2.R. | — | Why a DMF's "Reference Standards or Materials" resolves to its own 3.2.S.5 row instead of listing 3.2.S.5 and 3.2.P.6: only 3.2.S.5 lies inside the blueprint's outline. |

## Not done here (owed elsewhere)

- **EU and JP Module 1 answered from REGIONAL_MODULE1.** This belongs to g-drafting-paths-scope, which depends on this step.
- **CTD_SECTIONS' own Module 1 rows** (1.1 "Cover Letter", 1.2 "Administrative Forms"). They seed persisted project sections, so correcting them is a Projects hand-off coordinated with g-m1-project-bootstrap / project-seed-module1 (DECISIONS.md #6).
