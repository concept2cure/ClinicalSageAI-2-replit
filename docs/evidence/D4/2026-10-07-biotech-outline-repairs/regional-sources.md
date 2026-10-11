# W2 / D4 — EU and Canadian trial outline repair

Verified on **7 October 2026**. This repair replaces inappropriate full marketing CTD inheritance in `EU_CTA` and `CA_CTA`, and supplies a distinct `CA_CTA_A` outline. It improves document preparation structure; it does not qualify these routes for agency submission or establish that D4 is fully green.

| Registry type | Blueprint export | Preparation rows | Structure |
| --- | --- | ---: | --- |
| EU_CTA | `euCtaBlueprint.sectionBlueprint` | 28 | CTIS Form/MSC, common Part I, national Part II |
| CA_CTA | `canadaCtaBlueprint.sectionBlueprint` | 20 | Module 1 administrative/clinical, Module 2 quality summary, Module 3 supporting quality |
| CA_CTA_A | `canadaCtaBlueprint.amendmentSectionBlueprint` | 19 | Amendment-specific clinical and/or quality content; excludes initial-only PSEAT |

The existing task blueprint ids, milestone ids and task ids remain compatible. Task descriptions now distinguish quality summaries from supporting data and pre-start/site-record obligations from application attachments. Canonical lookup, project initialization, drafting, readiness and manifest integration are validated separately by the parent tranche; these source/test files alone are not evidence that every consumer uses the repaired outlines.

## EU basis and scope

The legal basis is [Regulation (EU) No 536/2014, Annex I](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX%3A32014R0536), adopted **16 April 2014**. Annex I establishes the trial application framework rather than the marketing CTD. EUR-Lex identifies **5 December 2022** as its current consolidated version. Automated access to the consolidated text was intermittently blocked; the Annex I structure was checked against official EUR-Lex indexed material and current EMA operational guidance, not treated as a successful full legal-consolidation audit.

The operational source is the [EMA CTIS Sponsor Handbook v6.4](https://www.ema.europa.eu/system/files/documents/other/sponsor-handbook-v-64_clean-version_20260716-en.pdf), **cover date 7 July 2026** (the filename contains `20260716`). Sections 2.2, 2.4.5 and 2.4.6 distinguish Form/MSC data, protocol/synopsis, product-specific dossiers and national participant/site material. The rows include justified dossier alternatives and conditional GMP, auxiliary-product, advice, paediatric, fee and sample material. The publication-copy and IB/SmPC upload distinctions matter to confidentiality.

The numeric `module` field is a platform grouping: **1 = Form/MSC, 2 = Part I, 3 = Part II**. These numbers must not be displayed as ICH CTD module names. CTIS structured fields and uploaded documents are different preparation artifacts. No eCTD envelope is implied. The baseline represents a complete initial Part I + II application. Article 11 Part I-only submission, later national Part II material, substantial modifications, additional Member States and lifecycle notifications need their own applicability decisions; this static outline does not dynamically filter them.

## Canada basis and current-source precedence

The [final CTA guidance](https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/guidance-documents/clinical-trials/clinical-trial-sponsors-applications.html) is **effective 29 May 2013**, records a **17 March 2016** revision and displays page details **17 August 2026**. A webpage update is not a new regulatory effective date. Sections 2.3.2 and 2.4.4, with Appendix 3, establish the three-module application and amendment-specific exclusions. Module 2 contains quality information only; full marketing nonclinical/clinical summaries and Modules 4–5 are not automatically required. The initial outline preserves the regional clinical sections and conditional supporting quality.

The [current Canadian Module 1 placement table](https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/guidance-documents/organization-document-placement-canadian-module-1.html), revision history **2 April 2024**, expressly takes precedence for placement. It makes the Module 1 contents table non-eCTD-only, keeps HC/SC 3011 and applicable appendices together, and points CTSI to the online form. Its catalogue also contains marketing-only documents; that is not authority to require them in every CTA.

The separate amendment outline asks for change-specific evidence. Clinical amendments need the amended/working and most recently authorised protocols, visible original/revised wording and rationales. PSEAT is excluded from every CTA-A. CTSI, international information and ICF are conditional clinical rows and are excluded from quality-only CTA-A scope; updated IB support depends on treatment extension or relevant biologic/radiopharmaceutical quality changes. Conditional content is not reduced to a duplicate initial CTA.

The [management guidance](https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/guidance-documents/management-drug-submissions-applications/pre-application-filing.html), page details **20 May 2026**, accepts CTA/CTA-A in eCTD or non-eCTD and gives specific email/courier-on-electronic-media delivery instructions. Its general CESG/REP paragraph must not override its specific CTA/CTA-A instructions.

The [interim modernization notice](https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/announcements/interim-policy-modernization-clinical-trial-framework-notice.html), **14 September 2026**, addresses REB information, investigator qualifications and documented consent. It does not make the proposed replacement regulations effective. The blueprint avoids requiring a universal initial REB approval/QIU upload or restricting every consent process to a paper form. Pre-start approvals and retained records remain separate sponsor obligations.

## Required flags and remaining qualification work

`required: true` means a baseline platform preparation expectation, sometimes satisfied by an eligible alternative or justification. `required: false` means applicability must be resolved, not that the content may always be omitted. In particular Canada quality summaries/supporting quality depend on product status, phase, prior authorisation/reference and change scope. CTA-A marks only cover/application unconditionally required; clinical- or quality-specific content remains necessary when applicable. A readiness result based only on these booleans cannot prove filing completeness.

Remaining work includes product/phase-specific CMC granularity, per-product and per-MSC repeatability, language and publication-copy review, conditional applicability gates, amendment classification, migrated-project outline reconciliation, real document/evidence binding and signed specialist validation. Representative live authoring-to-package walkthroughs, agency format validation and authority acceptance have not been established by these unit tests.

## Focused regression evidence

`regional-red.txt` records **9 failures before the repair**. `regional-green.txt` records **9 passes after the repair**, using:

```text
vitest run --config vitest.config.ts server/services/regulatory/registry/__tests__/regional-cta-blueprints.test.ts
```

The tests check native structure, clinical/quality placement, conditional alternatives, distinct CTA-A content, source provenance and task-id compatibility. Focused ESLint and `git diff --check` passed. The tests do not independently certify regulatory interpretation, live workflows or complete D4 qualification.
