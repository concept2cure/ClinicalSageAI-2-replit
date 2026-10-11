# W2 / D4: Japan CTN, US IND amendments and nonclinical summaries

Checked 7 October 2026. These repairs use the existing SectionBlueprint catalog contract and existing canonical authoring records. They add authoring organization, not a second renderer, an agency submission schema, or a readiness decision.

## Exact registry outlines

| Registry ID | Public constant | Blueprint ID | Source classification |
| --- | --- | --- | --- |
| `JP_CTN` | `JP_CTN_SECTION_BLUEPRINT` | `jp_ctn_sections` | Platform groups of verified notification fields and conditional attachments |
| `US_IND_AMENDMENT` | `US_IND_AMENDMENT_SECTION_BLUEPRINT` | `us_ind_amendment_sections` | Existing lifecycle component titles/types, with subtype-specific verified guidance |
| `ICH_NONCLIN_SUMMARY` | `NONCLINICAL_SUMMARY_SECTION_BLUEPRINT` | `ich_nonclin_summary_sections` | Verified M4S 2.6 organization projected from canonical authoring records |

Each module exports the constant as `sectionBlueprint`, plus `outlineBasis` and `outlineLimitations`. Each blueprint ID matches its existing registry `defaultSectionBlueprint`. The Japan `taskBlueprint` retains its nine task identities, order, roles and planning estimates. Its prose now qualifies timing, local evidence and language assumptions.

## Japan primary sources

- [Company-sponsored drug CTN handling notice, 0831-10 as amended by 0820-1, 20 August 2024](https://www.pmda.go.jp/files/000270151.pdf). Sections 1(4)–(7), Attachment 1 and schema attachments support the notification grouping. The notice distinguishes trial-plan, change, completion, trial-discontinuation and development-discontinuation handling. It provides category-dependent timing, including a defined 30-day group tied to planned site contracts, rather than a universal trial-start clock. Supporting protocol, consent, CRF, IB and scientific records are conditional; a CRF can be unnecessary if the protocol sufficiently identifies its items. Attachment 1 distinguishes planned quantities/counts from actual completion/discontinuation accountability. XML/PDF delivery and retained receipts are a separate technical workflow. English outline headings and `required` flags are platform conventions; the compatibility `module` field does not assert a CTD Module 1 notification.
- [PMDA Early Consideration quality checklist, 3 July 2026](https://www.pmda.go.jp/files/000281590.pdf), opening scope statement. This reference checklist concerns biotechnology test drugs manufactured using human/animal cell lines when their notification is subject to 30-day review. The scaffold points to applicable quality records without transcribing example results, thresholds, or treating this guidance as a universal attachment mandate.
- [MHLW 1225-2, 25 December 2023](https://www.mhlw.go.jp/web/t_doc?dataId=00tc8153&dataType=1&pageNo=1), Attachment 2 §§2–4. For overseas-led multinational development, additional Japanese phase I work depends on the product, available evidence, participant safety and PMDA assessment. The task prompts that assessment; it does not impose automatic bridging studies or exempt them.

Document-level language acceptance remains a client/agency inquiry. No blanket Japanese-language requirement or English-language exemption is inferred from marketing-application FAQs or a different investigator-sponsored pathway. The notification categories do not create a separate formal suspension category for a temporary trial pause.

## United States primary sources

- [21 CFR 312.30, current eCFR](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-312/subpart-B/section-312.30), displayed Title 21 current through 5 October 2026. New protocols, protocol changes and new investigators have distinct content branches. Paragraph (d) supports significant-difference/change descriptions, prior submission references, investigator identity/qualifications, necessary technical references and requested FDA comments/questions. The scaffold does not turn every branch into a universal requirement. Implementation, IRB and immediate-hazard conditions require category-specific review.
- [21 CFR 312.31, current eCFR](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-312/subpart-B/section-312.31), same displayed currency. Essential new information outside protocol amendments, safety reports and annual reports is handled by topic. Content identifies its nature/purpose, organizes relevant data for scientific review, and requests FDA comment only if desired. Clinical, nonclinical and CMC evidence are selected by the actual amendment; a new full CTD is not automatically required.
- FDA's [Protocol Amendments](https://www.fda.gov/drugs/investigational-new-drug-application-ind/ind-application-reporting-protocol-amendments) and [Information Amendments](https://www.fda.gov/drugs/investigational-new-drug-application-ind/ind-application-reporting-information-amendments) pages corroborate those reporting distinctions.

`LIFECYCLE_DOCUMENT_TYPES` supplies existing titles and content types from `ind_protocol_amendment`, `ind_information_amendment` and `ind_cmc_amendment`. The CMC update uses the existing `MODULE3-UPDATE` component. Existing broad lifecycle guidance and flags are not copied as new binding requirements. Administrative grouping and the cover-form scaffold remain platform conventions; current FDA forms, technical delivery instructions and the affected actual CTD locations require separate review.

## Nonclinical primary sources and canonical projection

- FDA's current [M4S: The CTD — Safety guidance page](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/m4s-ctd-safety) lists the final August 2001 guidance.
- [Current FDA-hosted M4S PDF](https://www.fda.gov/media/71628/download), organization and §§2.6.1–2.6.7, supports separate pharmacology, pharmacokinetics and toxicology written/tabulated summaries plus their introduction. M4S organizes acquired data; it does not determine the studies that every product must conduct.

The outline projects the seven existing `CTD_AUTHORING_GUIDANCE` records in the 2.6 subtree, preserving their codes, titles, content types and authoring-purpose guidance. It includes neither all Module 2, the 2.4 Nonclinical Overview, nor Module 4 study reports. Source confidence distinguishes verified organization from platform purpose notes. Legacy initial-IND flags are not reused as universal legal requirements; selected scaffold flags require product/regional applicability review. Source-linked results, deterministic analysis, scientific approval and package validation remain separate.

## Verification

- `japan-us-nonclinical-red.txt`: six behavior tests failed against the previous Japan marketing-CTD scaffold, US generic fallback and nonclinical all-Module-2 scaffold before production changes.
- `japan-us-nonclinical-green.txt`: the final six behavior tests plus three provenance/applicability cases pass (9 tests). Tests cover exact registry identities, conditional evidence branches, task compatibility, canonical title/type reuse, the exclusive 2.6 subtree and checked provenance.
- `japan-us-nonclinical-lint.txt`: focused ESLint completed successfully for the three blueprint files and their test.

Catalog integration and integration-wide verification are owned by the control-tower session. No generation of official forms/XML, actual evidence validation, agency approval, automatic readiness, new dependency or additional engine is claimed by these records.
