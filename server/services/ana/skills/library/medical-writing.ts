/**
 * Medical writing skills: the craft and checks every regulatory document gets,
 * and the methods for clinical overviews and summaries, briefing documents,
 * citations, reporting guidelines and plain-language text.
 *
 * @module server/services/ana/skills/library/medical-writing
 */

import { skill, type LibrarySkillSource } from '../types.js';

const MW_KNOWLEDGE = 'server/services/ana/medical-writing.ts';

export const MEDICAL_WRITING_SKILLS: LibrarySkillSource[] = [
  skill({
    key: 'medical-writing',
    name: 'Medical writing',
    description:
      'Regulatory writing quality for any document: findings first, consistent terminology, every number traced to its source, working cross-references, defined abbreviations and readable prose, checked by the deterministic writing tools.',
    disciplines: ['medical-writing'],
    useCases: ['drafting', 'review'],
    surfaces: ['document-authoring'],
    triggers: [
      'medical writing',
      'medical writer',
      'regulatory writing',
      'scientific writing',
      'writing style',
      'style guide',
      'readability',
      'abbreviation list',
      'list of abbreviations',
      'abbreviations',
      'cross-references',
      'cross-reference',
      'terminology consistency',
      'inconsistent numbers',
      'numbers do not match',
      'copy edit',
      'proofread',
      'qc the draft',
      'tighten the writing',
      'revise the draft',
    ],
    tools: [
      'medical_writing_guidance',
      'project_knowledge_search',
      'narrate_statistical_result',
      'critique_draft',
      'verify_revision',
      'critique_document',
      'medical_writing_review',
      'check_numerical_integrity',
      'check_dossier_consistency',
      'check_consistency',
      'validate_cross_references',
      'build_abbreviation_list',
      'assess_readability',
    ],
    references: [
      { kind: 'record', id: MW_KNOWLEDGE, label: 'Medical-writing knowledge base (document types, conventions)' },
      { kind: 'ich', id: 'E3' },
      { kind: 'ich', id: 'M4(R4)' },
    ],
    instructions: `
## When this applies
Writing, revising or quality-checking any regulatory or scientific document: protocol, CSR, CTD summaries, briefing documents, responses to agency questions, CERs, manuscripts. The document-specific sub-skills add their structure; this is the craft and the checks every document gets.

## Method
1. Establish the document type, its governing standard, the audience and the region. Run \`medical_writing_guidance\` with document_type (and therapeutic_area, region, audience and client_segment when known) before drafting or critiquing, and follow the structure and conventions it returns.
2. Read the sources before writing. Use \`project_knowledge_search\` for the project's study reports, analyses and agency correspondence, and write from them. A statement whose source cannot be found is marked as needing one.
3. Write findings first. Each section opens with its conclusion, then the evidence for it. One message per paragraph. Past tense for what a study did and found; present tense for what the document concludes.
4. Hold terminology steady. The product name, population names, endpoint names and treatment-arm labels are used exactly as the protocol and SAP define them, every time. Each abbreviation is defined at first use.
5. Trace every number to its table, listing or governed value. Never compute, round or re-derive a figure in the text. Word statistical results with \`narrate_statistical_result\` from the reported estimate, interval and p-value, so the language claims no more than the analysis supports, including for exploratory and multiplicity-uncontrolled results.
6. Check the draft with the deterministic tools:
   - \`critique_draft\` runs grounding, in-document consistency, readability, abbreviation, claims-language and structure checks and returns a revision brief; revise against it, then confirm with \`verify_revision\` that the revision improved and introduced nothing new.
   - \`critique_document\` does the same across a whole saved multi-section document.
   - \`medical_writing_review\` checks headings against the document type's outline; heading coverage is not completeness.
   - \`check_numerical_integrity\` finds one labelled quantity stated two ways in a document; \`check_dossier_consistency\` compares a draft with the project's other artifacts; \`check_consistency\` records figure-level comparisons for a submission in Submission Center.
   - \`validate_cross_references\` checks that CTD section references resolve to a section that exists.
   - \`build_abbreviation_list\` returns the abbreviation table and the abbreviations left undefined.
   - \`assess_readability\` scores reading level against the audience.
7. Report each tool's findings as found. A candidate inconsistency is adjudicated by the author, not dismissed by AnA.

## Before answering
- Every figure has a source, and none was calculated in the text.
- Terms and abbreviations are consistent and defined.
- No claim is stronger than its data; results are not called successful or approvable.
- The checks run are named, with what they found.

## Not AnA's to decide
- Scientific conclusions belong to the responsible clinicians, statisticians and authors.
- A document is approved and released by the people with that authority. AnA drafts, checks and revises.
`,
  }),

  skill({
    key: 'medical-writing.clinical-overview',
    name: 'Clinical Overview (CTD Module 2.5)',
    description:
      'Writing or reviewing the Module 2.5 Clinical Overview under ICH M4E: the critical analysis of the clinical data for the reviewer, cross-referenced to Module 5 and the 2.7 summaries, ending in the structured benefits and risks conclusions.',
    disciplines: ['medical-writing', 'clinical'],
    useCases: ['drafting', 'review', 'analysis'],
    segments: ['pharma', 'biotech'],
    documentTypes: ['ICH_CLIN_OVERVIEW'],
    triggers: [
      'clinical overview',
      'module 2.5',
      'section 2.5',
      'm2.5',
      '2.5.6',
      'benefits and risks conclusions',
      'benefit-risk conclusions',
      'product development rationale',
      'overview of efficacy',
      'overview of safety',
      'm4e',
    ],
    tools: [
      'draft_clinical_overview_m2_5',
      'plan_ind_module_authoring',
      'build_effects_table',
      'validate_cross_references',
      'reconcile_dossier_numbers',
      'critique_draft',
    ],
    references: [
      { kind: 'ich', id: 'M4(R4)' },
      { kind: 'record', id: MW_KNOWLEDGE, label: 'Medical-writing knowledge base: clinical overview' },
    ],
    instructions: `
## When this applies
Writing or reviewing CTD Module 2.5, the Clinical Overview (ICH M4E): the critical analysis of the clinical data for the reviewer, ending in the benefits and risks conclusions.

## Method
1. Establish what exists: the completed CSRs, the integrated analyses, the 2.7 summaries and the proposed labeling. The overview interprets them; it does not repeat Module 5 or 2.7. Where 2.7 presents the data, 2.5 says what they mean, how strong they are, and where they are weak.
2. Draft with \`draft_clinical_overview_m2_5\`. When the program has completed CSRs it composes the overview from those records, with the pivotal efficacy and benefit-risk tables and a completeness and gaps report; otherwise it returns the outline with drafting guidance. Do not pass results, counts or rates to it, and do not add any to its draft. Report its gaps as gaps. For an IND transcription scaffold from facts the person supplies, \`plan_ind_module_authoring\` (module 2.5) returns a plan only: its facts are unverified, and the real artifact and its sources are checked separately before sealing.
3. Keep the M4E order: product development rationale; overview of biopharmaceutics; overview of clinical pharmacology; overview of efficacy; overview of safety; benefits and risks conclusions; literature references.
4. Analyze in each section rather than describe:
   - development rationale: the condition, the pharmacological class, the development program, and the agency advice that shaped it;
   - biopharmaceutics and clinical pharmacology: what matters for dosing, interactions and special populations;
   - efficacy: the design choices, endpoints and comparators, consistency across studies and subgroups, dose-response, durability, and the limitations that bound the claim;
   - safety: the extent of exposure, the adverse reaction profile, serious and special-interest events, special populations, and how the risks can be managed.
5. The benefits and risks conclusions follow M4E's structured approach: the therapeutic context (the condition and current therapies), the key benefits, the key risks, and the assessment that weighs them with the uncertainties named. \`build_effects_table\` arranges the program's favourable and unfavourable effect estimates into an effects table; report its values as returned. The conclusion is the sponsor's.
6. Cross-reference each claim to the study report in Module 5 and to the 2.7 section that summarizes it, and check the references with \`validate_cross_references\`.
7. Reconcile figures across 2.5, 2.7 and Module 5 with \`reconcile_dossier_numbers\`, and run \`critique_draft\` with the clinical overview document type before release.

## Pitfalls reviewers raise
- An overview that summarizes 2.7 instead of interpreting it.
- Benefit-risk not tied to the proposed indication and population.
- Limitations of the program left unstated.

## Before answering
- No section restates 2.7 without interpreting it.
- Each claim cites its study and its 2.7 section.
- Figures came from records or tools, unchanged.
- Uncertainties and limitations are stated.

## Not AnA's to decide
- The benefit-risk conclusion and the proposed indication are the sponsor's; approval is the agency's.
- AnA does not seal or submit the overview.
`,
  }),

  skill({
    key: 'medical-writing.clinical-summary',
    name: 'Clinical Summary (CTD Module 2.7)',
    description:
      'Writing or reviewing the Module 2.7 Clinical Summary under ICH M4E: the factual cross-study summaries of biopharmaceutics, clinical pharmacology, efficacy and safety, the literature references and the study synopses.',
    disciplines: ['medical-writing', 'clinical', 'clinical-pharmacology'],
    useCases: ['drafting', 'review'],
    segments: ['pharma', 'biotech'],
    documentTypes: ['ICH_CLIN_SUMMARY'],
    triggers: [
      'clinical summary',
      'module 2.7',
      'section 2.7',
      'm2.7',
      '2.7.1',
      '2.7.2',
      '2.7.3',
      '2.7.4',
      'summary of clinical efficacy',
      'summary of clinical safety',
      'summary of clinical pharmacology',
      'study synopses',
      'integrated summary of safety',
      'integrated summary of efficacy',
    ],
    tools: [
      'draft_clinical_summary_m2_7',
      'plan_ind_module_authoring',
      'narrate_statistical_result',
      'get_csr_template',
      'lookup_fda_guidance',
      'medical_writing_review',
      'check_numerical_integrity',
      'reconcile_dossier_numbers',
    ],
    references: [
      { kind: 'ich', id: 'M4(R4)' },
      { kind: 'ich', id: 'E3' },
      { kind: 'record', id: MW_KNOWLEDGE, label: 'Medical-writing knowledge base: clinical summary' },
    ],
    instructions: `
## When this applies
Writing or reviewing CTD Module 2.7, the Clinical Summary (ICH M4E): the detailed, factual cross-study summaries of biopharmaceutics, clinical pharmacology, efficacy and safety, the literature references and the study synopses.

## Method
1. Establish the study set: every completed study that goes in Module 5, its CSR, the integrated analyses and the SAP's pooling definitions. 2.7 summarizes and integrates; interpretation belongs in 2.5.
2. Draft with \`draft_clinical_summary_m2_7\`. It composes 2.7.1 to 2.7.4 from the program's completed CSR records and flags gaps. Do not pass results, counts or rates to it; if the program has no completed CSR, say so. For an IND scaffold from supplied facts, \`plan_ind_module_authoring\` (module 2.7) returns a plan only, built on unverified facts.
3. Keep the M4E structure: 2.7.1 biopharmaceutic studies and associated analytical methods; 2.7.2 clinical pharmacology studies; 2.7.3 clinical efficacy; 2.7.4 clinical safety; 2.7.5 literature references; 2.7.6 synopses of individual studies. When the application covers more than one indication, follow M4E on presenting efficacy for each.
4. Efficacy: describe each study's design and population, then compare results across studies, subgroups and doses using the analyses the SAP defined. Word results with \`narrate_statistical_result\` from the reported estimates, never from rounded or recalculated ones.
5. Safety: exposure; common adverse events; deaths, serious and other significant events; laboratory findings; special populations; postmarketing data where they exist. Use the integrated safety analysis's pooling definitions and say which pool each table comes from.
6. The 2.7.6 synopses come from each study's CSR synopsis (ICH E3); \`get_csr_template\` returns the E3 synopsis form when one has to be written.
7. In a US marketing application the integrated summaries of safety and of effectiveness are separate requirements placed in Module 5; whether a 2.7 section can serve as one is set out in FDA's guidance on their location in the CTD. Confirm it with \`lookup_fda_guidance\` before advising.
8. Check the draft: \`medical_writing_review\` for heading coverage, \`check_numerical_integrity\` within the document, and \`reconcile_dossier_numbers\` against the protocol, SAP, CSRs and 2.5.

## Pitfalls reviewers raise
- Editorializing in 2.7.
- Pooling definitions that differ from the SAP, or tables with no stated pool.
- The same figure stated differently in 2.7, 2.5 and the CSR.

## Before answering
- Every number traces to a CSR or integrated analysis table.
- Pooling and denominators are named.
- Nothing in 2.7 argues a conclusion.

## Not AnA's to decide
- Pooling strategy and analysis choices belong to the sponsor's statisticians and the SAP.
- AnA does not seal or submit the summary.
`,
  }),

  skill({
    key: 'medical-writing.briefing-documents',
    name: 'Agency meeting briefing documents',
    description:
      'Writing a briefing document for a formal agency meeting or scientific advice: specific questions first, then the sponsor position and the supporting data for each, consistent with prior agency advice.',
    disciplines: ['medical-writing', 'regulatory-strategy'],
    useCases: ['drafting', 'agency-interaction'],
    triggers: [
      'briefing document',
      'briefing book',
      'briefing package',
      'meeting package',
      'meeting questions',
      'questions for the agency',
      'sponsor position',
      'pre-ind meeting',
      'end-of-phase 2 meeting',
      'eop2 meeting',
      'pre-nda meeting',
      'pre-bla meeting',
      'type b meeting',
      'type c meeting',
      'scientific advice',
      'pre-submission package',
    ],
    tools: [
      'plan_fda_meeting',
      'lookup_fda_guidance',
      'medical_writing_guidance',
      'project_knowledge_search',
      'check_dossier_consistency',
      'critique_document',
      'create_ha_interaction',
    ],
    references: [
      { kind: 'record', id: MW_KNOWLEDGE, label: 'Medical-writing knowledge base: meeting and briefing package' },
      { kind: 'record', id: 'shared/regulatory/agency-interaction.ts', label: 'Agency interaction and meeting types' },
    ],
    instructions: `
## When this applies
Writing a briefing document for a formal agency meeting or scientific advice: a formal FDA meeting (such as pre-IND, end-of-phase-2, pre-NDA or pre-BLA), a CDRH Pre-Submission, or EMA or national scientific advice.

## Method
1. Start from the questions. Before any background, write the questions the sponsor needs answered, each specific enough for the agency to agree or disagree ("Does the Agency agree that ...", not "What does the Agency think of ..."). Order them by consequence and group them by discipline.
2. Choose the meeting and its package. For an FDA drug or biologic meeting, \`plan_fda_meeting\` classifies the meeting type and returns the request package and a briefing document structure. Report its timelines as the engine's, and confirm them and the meeting types against FDA's current guidance on formal meetings with \`lookup_fda_guidance\`; do not quote meeting timelines from memory. \`medical_writing_guidance\` with the meeting package document type returns the writing conventions.
3. For each question write, in order: the question; the sponsor's position, stated plainly; the rationale; and the data that support it, summarized in the package or pointed to precisely. The agency answers on what it can see: a position with no data behind it in the package will not get agreement.
4. Background is the minimum the reviewers need to answer the questions: the product, the condition, development so far, and prior agency advice and how it was followed. Find earlier minutes and agreements with \`project_knowledge_search\`, and say where the current proposal departs from earlier advice.
5. Keep the package consistent with itself and with what the agency already holds: \`check_dossier_consistency\` against the project's artifacts, and \`critique_document\` across the whole draft for precision and coherence.
6. When the meeting should be tracked in the platform, open it with \`create_ha_interaction\`; it is governed and audited and takes the person's stated reason.

## Pitfalls reviewers raise
- Open questions that invite a general discussion rather than an answer.
- Positions without the data to support them, or data with no position.
- More questions than the meeting can cover.
- Silence about earlier advice the proposal does not follow.

## Before answering
- Every question has a position and supporting data.
- Meeting type and timelines are reported as the tool returned them and marked for confirmation.

## Not AnA's to decide
- The sponsor requests a meeting type; the agency grants it and decides what it answers.
- The positions are the sponsor's. AnA drafts and tests them.
`,
  }),

  skill({
    key: 'medical-writing.citations-and-references',
    name: 'Citations and references',
    description:
      'Citation integrity for regulatory and scientific documents: finding and verifying every source, formatting and linting reference lists, checking regulatory citations for currency, and tracing repeated program values to their governed source.',
    disciplines: ['medical-writing'],
    useCases: ['review', 'drafting'],
    triggers: [
      'citation',
      'citations',
      'reference list',
      'bibliography',
      'verify references',
      'verify citations',
      'check the references',
      'vancouver style',
      'ama style',
      'ris file',
      'endnote',
      'zotero',
      'retracted',
      'pmid',
      'doi',
      'outdated guidance',
      'literature references',
    ],
    tools: [
      'search_literature',
      'generate_citation',
      'import_ris_references',
      'lint_references',
      'format_references',
      'verify_citations',
      'check_guidance_freshness',
      'scan_document_citations',
      'check_grounding',
    ],
    references: [
      { kind: 'currency-fact', id: 'us-qmsr' },
      { kind: 'currency-fact', id: 'ich-e6r3-gcp-step4' },
    ],
    instructions: `
## When this applies
Building, formatting or auditing the references and citations of a regulatory or scientific document: literature citations, regulatory citations (ICH, CFR, guidance), and numbers that repeat governed program values.

## Method
1. Find a source before citing it. For literature, \`search_literature\` returns candidate publications with DOIs. Cite only what was found, never a reference reconstructed from memory.
2. Format a single citation with \`generate_citation\`. A journal article is looked up in PubMed or Crossref and formatted only when found; an ICH guideline takes its title from the ICH corpus; FDA guidance, CFR, EU and ISO citations are formatted from the identifier given and labelled not verified. Pass that label on.
3. For an exported library, parse the RIS text with \`import_ris_references\`, check it with \`lint_references\` for missing fields and duplicates, and format it with \`format_references\` in Vancouver or AMA style. Report the formatted output verbatim.
4. Audit a draft's reference list with \`verify_citations\`. Each reference comes back verified, not found, unverifiable or error, with retraction status and any field that disagrees with the record. Report its verdicts. A reference not found or retracted is raised to the author, not silently dropped. With the organization's public-source lookups off, every reference comes back unverifiable; say so.
5. Check that each citation supports the sentence it is attached to. A real reference attached to a claim it does not make is still a citation error.
6. Check regulatory citations for currency with \`check_guidance_freshness\`. An ICH code or registry entry comes back current or not, with its basis; anything it cannot identify is unverified, never current. Superseded citations to look for include the removed QSR sections (cite the QMSR, fact us-qmsr) and ICH E6(R2) (E6(R3) is in force, fact ich-e6r3-gcp-step4).
7. Where a document repeats a governed program value (a sample size, a dose, a sensitivity), \`scan_document_citations\` finds each occurrence and flags any that has drifted from the governed value; binding them makes future changes to the value flag them.
8. Find unsourced numbers in the prose with \`check_grounding\`; each one gets a source or is removed.

## Before answering
- No reference was invented or completed from memory.
- Verification results are reported as the tool returned them.
- Regulatory citations are current, or marked.

## Not AnA's to decide
- Whether a source is adequate support for a claim is the author's scientific judgment; AnA reports what the source says.
`,
  }),

  skill({
    key: 'medical-writing.reporting-guidelines',
    name: 'Reporting guidelines',
    description:
      'Checking a manuscript, protocol publication or study report against the reporting guideline for its design (CONSORT, SPIRIT, STROBE, PRISMA, STARD, ARRIVE, CARE), with ICMJE and good publication practice for sponsored publications.',
    disciplines: ['medical-writing', 'clinical'],
    useCases: ['drafting', 'review'],
    triggers: [
      'reporting guideline',
      'consort',
      'spirit checklist',
      'strobe',
      'prisma',
      'stard',
      'arrive guidelines',
      'care checklist',
      'equator network',
      'icmje',
      'gpp 2022',
      'good publication practice',
      'manuscript',
      'journal submission',
      'publication plan',
    ],
    tools: ['advise_reporting_guideline', 'medical_writing_guidance', 'critique_draft'],
    references: [
      { kind: 'record', id: MW_KNOWLEDGE, label: 'Medical-writing knowledge base: manuscript conventions' },
      { kind: 'ich', id: 'E3' },
    ],
    instructions: `
## When this applies
Preparing or checking a manuscript, protocol publication or study report against the reporting guideline for its design: CONSORT for randomised trials, SPIRIT for trial protocols, STROBE for observational studies, PRISMA for systematic reviews and meta-analyses, STARD for diagnostic accuracy studies, ARRIVE for animal research, CARE for case reports.

## Method
1. Establish the study design and the output (journal article, protocol publication, conference abstract). The design decides the guideline. A design with a recognized extension (for example non-inferiority or cluster randomised trials under CONSORT) uses the extension as well.
2. Run \`advise_reporting_guideline\` with the guideline or the study type. It returns the essential checklist items and common pitfalls. Guidelines are revised over time: name the version the checklist comes from, and use the version the target journal or registry requires.
3. Go item by item through the draft: reported, partly reported or missing, with the section where it is. Items often missed: the flow of participants with numbers at each stage, how the sample size was set, the primary outcome as registered, harms, and departures from the registered protocol.
4. Check outcome reporting against the registration and the protocol or SAP. An outcome switched, added or dropped is disclosed and explained.
5. For a sponsored publication, apply ICMJE authorship criteria and good publication practice (GPP 2022): disclose funding, conflicts of interest and medical writing support. \`medical_writing_guidance\` with the manuscript document type returns these conventions.
6. Keep the abstract and the conclusions to what the primary analysis shows. Run \`critique_draft\`; its claims check flags overstatement and spin.
7. A clinical study report for an agency follows ICH E3, not a journal guideline. When the person is writing a CSR, say so and follow the CSR method instead.

## Before answering
- The guideline and its version are named.
- Each checklist item has a status and a location.
- Outcome changes from the registration are disclosed.

## Not AnA's to decide
- Authorship and the decision to publish belong to the authors and the sponsor; the journal decides what it accepts.
`,
  }),

  skill({
    key: 'medical-writing.plain-language',
    name: 'Plain-language and lay summaries',
    description:
      'Writing or reviewing text for patients and the public, such as lay summaries of trial results and plain-language summaries of publications: the same content as the technical results, in plain words, with no promotion.',
    disciplines: ['medical-writing'],
    useCases: ['drafting', 'review'],
    triggers: [
      'plain language',
      'plain-language summary',
      'lay summary',
      'lay summaries',
      'layperson summary',
      'summary for laypersons',
      'patient-friendly',
      'reading level',
      'grade level',
      'health literacy',
      'flesch',
      'lay language',
      'patient audience',
    ],
    tools: ['medical_writing_guidance', 'screen_promotional_language', 'assess_readability', 'critique_draft'],
    references: [
      { kind: 'currency-fact', id: 'eu-ctis-only-trials' },
      { kind: 'record', id: MW_KNOWLEDGE, label: 'Medical-writing knowledge base: plain-language summary' },
    ],
    instructions: `
## When this applies
Writing or reviewing text for patients and the public: lay summaries of clinical trial results, plain-language summaries of publications, and patient-facing passages where readability is the question.

## Method
1. Establish the text's purpose, its audience and any rule that governs it. A summary of results for laypersons is required for trials under the EU Clinical Trials Regulation (EU) No 536/2014, with content set by its Annex V, and is submitted through CTIS (fact eu-ctis-only-trials). Patient labeling and informed consent forms have their own content methods; use this one for the language and theirs for the content.
2. Run \`medical_writing_guidance\` with the plain-language summary document type for the structure and conventions.
3. Take the content from the technical results only: the same population, the same results, the same side effects, and no new analyses. A lay summary that says more, or less, than the technical results is wrong.
4. Write for the reader: short sentences, everyday words, technical terms explained when they must be used, numbers given as natural frequencies (so many out of 100 people) taken from the reported results, with the comparison group alongside. Report harms with the same care as benefits.
5. Keep it non-promotional. Run \`screen_promotional_language\` and resolve its flags. A lay summary does not say a treatment works or is safe beyond what the results show, and does not recommend a product.
6. Score readability with \`assess_readability\` for the patient audience and revise against its suggestions. The score is an indicator, not proof that readers understand. Then run \`critique_draft\` with the patient audience for the remaining checks.
7. When the summary will be translated, write so it translates cleanly: no idioms, one term per concept.

## Before answering
- Every result in the lay text appears in the technical results, with the same meaning.
- Readability was scored, and the score is reported with what it can and cannot show.
- No promotional language remains.

## Not AnA's to decide
- Release of the lay summary, and any patient review of it, belong to the sponsor's process.
`,
  }),
];
