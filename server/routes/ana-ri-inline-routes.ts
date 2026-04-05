/**
 * ana-ri-inline-routes.ts
 * Express Router for the AnA 1.0 RI endpoint + compatibility facades
 * Extracted from server/index.ts for maintainability.
 *
 * Mount with: app.use('/api', createAnaRiInlineRoutes(pool, deps))
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import type { Request, Response } from 'express';

interface AnaRiDeps {
  csrSearchService: any;
  getEndpointRecommenderService: () => any;
  sanitizeAskAnaInput: (input: any) => any;
}

export function createAnaRiInlineRoutes(pool: Pool, deps: AnaRiDeps): Router {
  const router = Router();
  const { csrSearchService, getEndpointRecommenderService, sanitizeAskAnaInput } = deps;

router.post('/search/vector', async (req: Request, res: Response) => {
  try {
    const query = String(req.body?.query || '').trim();
    const k = Math.max(1, parseInt(String(req.body?.k || 5), 10));
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const searchResult = await csrSearchService.searchCSRs({
      query_text: query,
      limit: Math.min(50, k),
    });

    const vectorLikeRows = (searchResult.csrs || []).slice(0, k).map((csr: any, idx: number) => ({
      content: csr.summary || csr.context_summary || csr.outcome || csr.title || '',
      relevance:
        typeof csr.relevance_score === 'number'
          ? csr.relevance_score
          : typeof csr.similarity === 'number'
          ? csr.similarity
          : null,
      document_id: csr.id || csr.csr_id || idx,
      document_title: csr.title || 'Untitled CSR',
      source_page: csr.source_page ?? null,
      source_section: csr.source_section || csr.phase || null,
    }));

    return res.json(vectorLikeRows);
  } catch (error) {
    console.error('Vector search failed:', error);
    return res.status(500).json({ error: 'Vector search failed' });
  }
});

// Endpoint recommendation compatibility facade (P0 route recovery)
router.post('/endpoint/recommend', async (req: Request, res: Response) => {
  try {
    const indication = String(req.body?.indication || 'General');
    const phase = String(req.body?.phase || 'Phase 2');
    const therapeuticArea = String(req.body?.therapeuticArea || '');
    const service = getEndpointRecommenderService();
    const recommendations = await service.getComprehensiveEndpointRecommendations(
      indication,
      phase,
      10,
      therapeuticArea
    );

    return res.json(
      recommendations.map((rec: any) => ({
        endpoint: rec.endpoint,
        summary:
          rec.evidence?.[0]?.reference_text ||
          `${phase} ${indication} endpoint recommendation based on available evidence.`,
        matchCount: rec.occurrence_count ?? 0,
        successRate:
          typeof rec.success_rate === 'number'
            ? rec.success_rate > 1
              ? rec.success_rate / 100
              : rec.success_rate
            : null,
        reference: rec.evidence?.[0]?.title || null,
      }))
    );
  } catch (error) {
    console.error('Endpoint recommendation failed:', error);
    return res.status(500).json({ error: 'Endpoint recommendation failed' });
  }
});

// Retention policy compatibility facade (P0 route recovery)
const RETENTION_SERVICE_UNAVAILABLE = {
  success: false,
  error: 'Retention service unavailable',
  message:
    'Retention policy APIs are temporarily disabled until persistent storage and job execution are fully wired.',
};

router.get('/retention/policies', async (_req: Request, res: Response) => {
  return res.status(503).json(RETENTION_SERVICE_UNAVAILABLE);
});

router.get('/retention/document-types', async (_req: Request, res: Response) => {
  return res.status(503).json(RETENTION_SERVICE_UNAVAILABLE);
});

router.post('/retention/policies', async (_req: Request, res: Response) => {
  return res.status(503).json(RETENTION_SERVICE_UNAVAILABLE);
});

router.put('/retention/policies/:id', async (_req: Request, res: Response) => {
  return res.status(503).json(RETENTION_SERVICE_UNAVAILABLE);
});

router.delete('/retention/policies/:id', async (_req: Request, res: Response) => {
  return res.status(503).json(RETENTION_SERVICE_UNAVAILABLE);
});

router.post('/retention/run-job', async (_req: Request, res: Response) => {
  return res.status(503).json(RETENTION_SERVICE_UNAVAILABLE);
});

// AnA 1.0 RI endpoint
router.post('/ask-ana-ri', async (req: Request, res: Response) => {
  try {
    const {
      context,
      sessionId,
      documentContent,
      model = 'openai',
      audience: bodyAudience = 'regulatory_lead',
      responseFormat: bodyResponseFormat = 'markdown',
    } = req.body;
    const sanitized = sanitizeAskAnaInput({
      query: req.body?.query,
      audience: bodyAudience,
      responseFormat: bodyResponseFormat,
      documentContent,
    });
    if (!sanitized.ok) {
      return res.status(sanitized.status).json({
        success: false,
        error: sanitized.error,
        message: sanitized.message,
      });
    }
    const { query, audience, responseFormat, sanitizedDocumentContent, warnings } = sanitized.value;

    // AnA RI request received (debugLog removed)

    const audienceProfileMap: Record<string, string> = {
      executive: 'Focus on business impact, timeline risk, and go/no-go recommendations.',
      regulatory_lead:
        'Focus on submission quality, compliance strategy, and deficiency prevention.',
      medical_writer: 'Focus on narrative quality, source traceability, and consistency controls.',
      qa_reviewer: 'Focus on auditability, verification checks, and remediation priority.',
      engineer: 'Focus on implementation details, API contracts, and automation reliability.',
    };

    const responseFormatMap: Record<string, string> = {
      markdown: 'Use clean markdown with headings, bullet points, and short actionable sections.',
      json: 'Provide machine-readable JSON structure with fields for plan, risks, and actions.',
      brief: 'Provide a concise executive answer with top 3 actions and key risk.',
    };

    const audienceDirective = audienceProfileMap[audience] || audienceProfileMap['regulatory_lead'];
    const formatDirective = responseFormatMap[responseFormat] || responseFormatMap['markdown'];

    // System prompt for AnA regulatory expert
    const systemPrompt = `You are AnA 1.0 RI (AnA Regulatory Intelligence).
AnA stands for Audit, Narrate, Author.
Never use any legacy product naming.

Core identity:
- Regulatory strategist, medical writer, auditor, and technical implementation partner
- Senior-level expertise in FDA, EMA, MHRA, PMDA, ICH, ISO 13485, ISO 14971, GCP, GMP, and eCTD lifecycle requirements
- Able to reason through uncertainty, justify tradeoffs, and recommend decision pathways

Operating modes (blend as needed):
1) Build & Design: propose submission architectures, document plans, timelines, and risk controls
2) Author: draft high-quality regulatory narratives, protocols, SAP/SOP language, and response letters
3) Audit: find gaps, contradictions, traceability breaks, and compliance vulnerabilities
4) Evaluate: compare options with explicit pros/cons, impact, and recommendation confidence
5) Predict: forecast likely agency questions, deficiency risks, and mitigation strategies
6) Code: produce production-ready Python utilities for validation, parsing, analytics, and automation
7) DOCX: generate structured content ready for section-level export into DOCX templates

Response standards:
- Be precise, practical, and evidence-aware; avoid vague advice
- Cite specific regulations/guidances when relevant (e.g., 21 CFR, ICH E3, ICH M4, ISO 14971)
- Separate facts, assumptions, and recommendations
- For code requests, provide secure, maintainable Python with clear function boundaries and tests when feasible
- For document requests, output sectioned, publication-grade text with headings, bullets, and traceability notes
- If information is missing, ask targeted follow-up questions and provide a best-effort interim path

Tone and personality:
- Calm, strategic, accountable, and collaborative
- Speak like a trusted principal advisor: direct, respectful, and action-oriented

Audience adaptation:
- ${audienceDirective}

Formatting adaptation:
- ${formatDirective}`;

    const normalizedQuery = String(query || '').toLowerCase();
    const resolveAnaMode = () => {
      const modeRules: Array<{ mode: string; patterns: string[] }> = [
        { mode: 'build_design', patterns: ['build', 'design', 'architecture', 'plan', 'roadmap'] },
        { mode: 'author', patterns: ['write', 'author', 'draft', 'compose', 'narrative'] },
        { mode: 'audit', patterns: ['audit', 'gap', 'deficiency', 'inspect', 'review'] },
        { mode: 'evaluate', patterns: ['evaluate', 'compare', 'tradeoff', 'option', 'decision'] },
        { mode: 'predict', patterns: ['predict', 'forecast', 'likely question', 'risk signal'] },
        { mode: 'code', patterns: ['python', 'script', 'code', 'function', 'api', 'automation'] },
        { mode: 'docx', patterns: ['docx', 'template', 'section', 'ctd', 'ectd', 'cer'] },
      ];

      const directContextMap: Record<string, string> = {
        python_implementation: 'code',
        docx_authoring: 'docx',
        clinical_documentation: 'author',
        submission_readiness: 'audit',
        client_enablement: 'evaluate',
        regulatory_affairs: 'evaluate',
      };

      if (context && directContextMap[context]) return directContextMap[context];

      for (const rule of modeRules) {
        if (rule.patterns.some(pattern => normalizedQuery.includes(pattern))) {
          return rule.mode;
        }
      }

      return 'evaluate';
    };

    const indPyramidTemplateLibrary: Record<string, string[]> = {
      'Module 1': [
        'Cover Letter',
        'FDA Forms (1571/1572/3674) Checklist',
        'Investigator Brochure Change Summary',
        'Cross-Reference & Lifecycle Manifest',
      ],
      'Module 2': [
        'Quality Overall Summary (QOS)',
        'Nonclinical Overview & Written Summaries',
        'Clinical Overview & Clinical Summary',
        'Benefit-Risk Framing Narrative',
      ],
      'Module 3': [
        'Drug Substance (3.2.S) Template Pack',
        'Drug Product (3.2.P) Template Pack',
        'Analytical Method Validation Template (ICH Q2)',
        'Stability Protocol + Report Template (ICH Q1)',
      ],
      'Module 4': [
        'Pharmacology/Toxicology Study Report Shell',
        'GLP Compliance Statement Template',
        'Nonclinical Tabulation Pack',
      ],
      'Module 5': [
        'Clinical Study Protocol Template',
        'SAP Template (ICH E9 aligned)',
        'CSR Template (ICH E3 aligned)',
        'ISS/ISE Evidence Integration Shell',
      ],
    };

    const therapeuticTemplateLibrary: Record<string, string[]> = {
      oncology: [
        'RECIST Endpoint Justification Template',
        'Dose Escalation + DLT Decision Log',
        'Biomarker Stratification Narrative',
      ],
      cardiology: [
        'MACE Endpoint Adjudication Template',
        'QT/QTc Risk Management Narrative',
        'CV Outcomes Study Synopsis Template',
      ],
      neurology: [
        'Cognitive Endpoint Validation Template',
        'Relapse/Progression Adjudication Narrative',
        'Neuroimaging Evidence Summary Template',
      ],
      immunology: [
        'Immunogenicity Risk Assessment Template',
        'Cytokine Release Monitoring Plan',
        'Long-Term Safety Extension Synopsis',
      ],
      infectious_disease: [
        'Antimicrobial Resistance Surveillance Template',
        'Virologic Response Endpoint Narrative',
        'Pathogen Subgroup Analysis Shell',
      ],
      rare_disease: [
        'Natural History Evidence Integration Template',
        'External Control Justification Narrative',
        'Accelerated Approval Readiness Checklist',
      ],
      endocrinology: [
        'Glycemic Endpoint & Rescue Criteria Template',
        'Metabolic Safety Monitoring Narrative',
        'Device-Drug Combination Use-Case Template',
      ],
      respiratory: [
        'Exacerbation Endpoint Definition Template',
        'Pulmonary Function Analysis Shell',
        'Inhalation Device Human Factors Narrative',
      ],
    };

    const pythonSkillPack = [
      'Pydantic schemas for dossier entities and controlled terminology checks',
      'DOCX assembly pipelines (python-docx/docxtpl) with section-level merge controls',
      'Traceability matrix generation (claim → evidence → source → citation)',
      'Regulatory linting scripts for placeholders, contradictions, and missing references',
      'Submission packaging utilities for eCTD folder validation and index checks',
      'FastAPI services for authoring, review, and approval workflows with audit logging',
    ];

    const therapeuticArea = (() => {
      const rules = [
        { key: 'oncology', patterns: ['oncology', 'tumor', 'cancer'] },
        { key: 'cardiology', patterns: ['cardiology', 'cardiac', 'heart'] },
        { key: 'neurology', patterns: ['neurology', 'neuro', 'cns'] },
        { key: 'immunology', patterns: ['immunology', 'immune', 'autoimmune'] },
        { key: 'infectious_disease', patterns: ['infectious', 'antiviral', 'antibiotic'] },
        { key: 'rare_disease', patterns: ['rare disease', 'orphan'] },
        { key: 'endocrinology', patterns: ['endocrine', 'diabetes', 'metabolic'] },
        { key: 'respiratory', patterns: ['respiratory', 'pulmonary', 'asthma', 'copd'] },
      ];
      return (
        rules.find(rule => rule.patterns.some(p => normalizedQuery.includes(p)))?.key || 'oncology'
      );
    })();

    const indTemplateBlock = Object.entries(indPyramidTemplateLibrary)
      .map(([module, templates]) => `- ${module}: ${templates.slice(0, 2).join('; ')}`)
      .join('\n');

    const therapyTemplateBlock = therapeuticTemplateLibrary[therapeuticArea]
      .map(template => `- ${template}`)
      .join('\n');

    const pythonSkillBlock = pythonSkillPack.map((skill, idx) => `${idx + 1}. ${skill}`).join('\n');

    const clientSegment = (() => {
      const segmentRules = [
        { key: 'startup', patterns: ['startup', 'seed', 'series a', 'early stage'] },
        { key: 'mid_market', patterns: ['mid-market', 'growth', 'scaleup'] },
        { key: 'enterprise', patterns: ['enterprise', 'global', 'multi-region', 'portfolio'] },
        {
          key: 'consultancy',
          patterns: ['consultancy', 'agency', 'service line', 'client delivery'],
        },
      ];
      return (
        segmentRules.find(rule => rule.patterns.some(p => normalizedQuery.includes(p)))?.key ||
        'startup'
      );
    })();

    const clientOutcomeMap: Record<string, string[]> = {
      startup: [
        'Reduce time-to-IND by standardized authoring and validation workflows',
        'Lower consultant dependency with repeatable templates and automation',
        'Increase first-cycle response quality with pre-audit checks',
      ],
      mid_market: [
        'Scale regulatory operations across concurrent programs',
        'Improve cross-functional consistency between CMC, clinical, and safety',
        'Decrease rework via reusable evidence-linked drafting pipelines',
      ],
      enterprise: [
        'Standardize global dossier quality across regions and therapeutic franchises',
        'Improve governance with auditable AI-assisted authoring checkpoints',
        'Optimize submission throughput with portfolio-level template libraries',
      ],
      consultancy: [
        'Deliver faster, more consistent client-ready regulatory outputs',
        'Productize repeatable templates and SOP-linked automation assets',
        'Increase margins by reducing manual rewrite and QA cycles',
      ],
    };

    const clientPlanBlock = [
      '**30-Day client value plan**',
      '1. Baseline current document stack and identify highest-risk gaps.',
      '2. Deploy module + therapeutic templates for top-priority programs.',
      '3. Activate Python validation scripts for quality gates and traceability.',
      '',
      '**60-Day acceleration plan**',
      '1. Automate DOCX section assembly with evidence-linking.',
      '2. Implement deficiency prediction and remediation workflows.',
      '3. Track KPI dashboard (cycle time, rework %, finding density).',
      '',
      '**90-Day scale plan**',
      '1. Roll out cross-program template governance.',
      '2. Expand automation coverage to review and packaging steps.',
      '3. Institutionalize continuous improvement loop from agency feedback.',
    ].join('\n');

    const clientOutcomeBlock = clientOutcomeMap[clientSegment].map(item => `- ${item}`).join('\n');

    const buildCapabilityFallback = (mode: string): string => {
      const responseByMode: Record<string, string> = {
        build_design: `I can lead this as a build/design problem.

**Proposed execution frame**
1. Define objective + submission endpoint (IND/NDA/BLA/510(k)/CER/eCTD module).
2. Map required evidence artifacts and identify missing inputs.
3. Build a phase plan (authoring → QC → audit → submission readiness).
4. Create owner-level tasks with quality gates and date-based risk controls.

**Immediate next step**
Share your target submission type, deadline, and top 3 constraints so I can generate a concrete implementation roadmap.`,

        author: `I can author this to submission-grade quality.

**Writing method**
1. Extract claims, evidence, and regulatory basis per section.
2. Draft in reviewer-friendly structure (objective, methods, results, interpretation, conclusion).
3. Add traceability notes for each critical assertion.
4. Run consistency and completeness checks before finalization.

**Immediate next step**
Provide the intended document type and section list, and I will draft the first complete section.`,

        audit: `I can audit this for regulatory and quality vulnerabilities.

**Audit lens**
1. Completeness gaps against expected section requirements.
2. Contradictions across protocol/SAP/CSR or dossier modules.
3. Traceability breaks between claims and evidence.
4. High-risk language likely to trigger agency deficiencies.

**Immediate next step**
Share the draft text (or section excerpts) and I will return a prioritized finding log with remediation actions.`,

        evaluate: `I can evaluate options and recommend a defensible path.

**Decision framework**
1. Compare options on compliance fit, execution risk, and time-to-submission.
2. Separate known facts from assumptions and uncertainties.
3. Provide ranked recommendation with confidence and rationale.
4. Define contingency if primary path fails.

**Immediate next step**
List the options you are considering and your success criteria (speed, risk, cost, evidence burden).

**Client outcome focus (${clientSegment.replace('_', ' ')})**
${clientOutcomeBlock}`,

        predict: `I can forecast likely agency concerns and preempt them.

**Predictive approach**
1. Detect weak claims, unsupported assumptions, and consistency risks.
2. Anticipate probable information requests and deficiency themes.
3. Prioritize mitigations by likelihood × impact.
4. Prepare response-ready evidence packaging.

**Immediate next step**
Provide your current strategy summary and I will generate a risk-ranked question forecast with mitigations.`,

        code: `I can implement this in production-grade Python.

**Engineering blueprint**
1. Typed models for inputs/outputs and regulatory constraints.
2. Validation layer for required fields, controlled terms, and audit trails.
3. Service layer for business rules and deterministic transforms.
4. Tests for nominal paths, edge cases, and compliance guardrails.

**Expanded Python skill library**
${pythonSkillBlock}

**Immediate next step**
Tell me your target runtime (FastAPI/CLI/batch), and I will provide an executable scaffold plus tests.

${clientPlanBlock}`,

        docx: `I can prepare this for DOCX-native regulatory authoring.

**DOCX pipeline**
1. Section map aligned to CTD/eCTD/CER structure.
2. Heading-safe narrative blocks with evidence anchors.
3. Table-ready stubs for key results, risks, and justifications.
4. Final QC pass for placeholders, consistency, and citation sufficiency.

**IND Pyramid template library (starter pack)**
${indTemplateBlock}

**Therapeutic area templates (${therapeuticArea.replace('_', ' ')})**
${therapyTemplateBlock}

**Immediate next step**
Share your template structure and target module so I can generate insertion-ready section content.

${clientPlanBlock}`,
      };

      return responseByMode[mode] || responseByMode['evaluate'];
    };

    let response;
    let resolvedMode = resolveAnaMode();

    // Choose AI model based on user preference
    if (model === 'gemini' && process.env.GOOGLE_API_KEY) {
      // Use Google Gemini Pro
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      const geminiModel = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4000,
        },
      });

      const prompt = documentContent
        ? `${systemPrompt}\n\nDocument context: ${sanitizedDocumentContent}\n\nUser question: ${query}`
        : `${systemPrompt}\n\nUser question: ${query}`;

      const result = await geminiModel.generateContent(prompt);
      response = result.response.text();
    } else {
      // Fallback to contextual regulatory guidance (when no AI service available)
      const contextualResponses: Record<string, string> = {
        regulatory_affairs: `Based on current FDA guidelines, I recommend focusing on the following key areas for your regulatory submission:

1. **Clinical Data Package**: Ensure your clinical study reports include comprehensive efficacy and safety analyses with appropriate statistical methods.

2. **Quality Information**: Manufacturing controls, analytical methods validation, and stability data should align with ICH Q guidelines.

3. **Risk Management**: Implement a robust pharmacovigilance plan and risk evaluation and mitigation strategies (REMS) if applicable.

For your specific query about "${query}", I'd recommend consulting the most recent FDA guidance documents and considering pre-submission meetings to align on regulatory expectations.`,

        clinical_documentation: `For clinical documentation best practices:

1. **Protocol Design**: Ensure endpoints are clinically meaningful and align with FDA guidance for your therapeutic area.

2. **Statistical Analysis Plan**: Pre-specify all analyses, including sensitivity analyses and handling of missing data.

3. **Clinical Study Report**: Follow ICH E3 structure with clear presentation of results and benefit-risk assessment.

Regarding "${query}", consider reviewing recent FDA approvals in your therapeutic area for benchmark standards.`,

        python_implementation: `I can help you implement this in Python with a production-ready approach:

1. **Architecture First**: Define modules for data models, validation, business rules, and adapters (APIs/files/DB).
2. **Compliance by Design**: Add validation layers for required regulatory fields, controlled vocabularies, and audit trails.
3. **Quality Controls**: Include unit tests, schema validation, deterministic outputs, and error handling pathways.
4. **Operational Reliability**: Add logging, metrics, configuration management, and clear dependency boundaries.

For "${query}", I can draft an executable Python scaffold with typed models, validation rules, and test cases in the next step.`,

        docx_authoring: `For DOCX-ready regulatory authoring, use a structured content pipeline:

1. **Template Mapping**: Align each section to CTD/eCTD or CER structure with required evidence inputs.
2. **Narrative Rules**: Use consistent terminology, objective claim language, and source traceability for each assertion.
3. **Quality Gates**: Run checks for completeness, contradictions, placeholders, and citation sufficiency before export.
4. **Export Readiness**: Produce heading-safe content, table-ready data blocks, and appendix cross-references.

**IND Pyramid template library**
${indTemplateBlock}

**Therapeutic area templates (${therapeuticArea.replace('_', ' ')})**
${therapyTemplateBlock}

For "${query}", I can generate a complete section draft with regulatory citations and a DOCX insertion map.`,

        ind_pyramid_templates: `I can generate templates for every IND Pyramid module.

**IND Pyramid library**
${indTemplateBlock}

**Therapeutic area templates (${therapeuticArea.replace('_', ' ')})**
${therapyTemplateBlock}

For "${query}", I can output a complete DOCX-ready template pack for your selected module and therapeutic area.`,

        python_skill_library: `I can expand AnA's Python execution capabilities with this skill stack:

${pythonSkillBlock}

For "${query}", I can now produce implementation-ready code blueprints tied to your regulatory workflow.

${clientPlanBlock}`,

        client_enablement: `I can optimize AnA specifically for end-user client delivery.

**Expected client outcomes (${clientSegment.replace('_', ' ')})**
${clientOutcomeBlock}

${clientPlanBlock}

For "${query}", I can produce a client-ready enablement package with templates, automation scripts, and adoption metrics.`,

        submission_readiness: `I can run a submission-readiness preflight for your team.

**Readiness preflight checklist**
1. Content completeness across required modules/sections.
2. Evidence traceability from claim to source artifact.
3. Consistency checks across protocol, SAP, CSR, and summaries.
4. Deficiency-risk language scan and remediation plan.

**Primary output package**
- Risk-ranked findings ledger
- Corrective action plan with owners and due dates
- Re-submission confidence forecast with blockers

For "${query}", I can generate a structured readiness report in your preferred format.`,

        default: `As your regulatory AI expert, I recommend:

1. **Regulatory Strategy**: Develop a comprehensive regulatory strategy early in development.
2. **Quality by Design**: Implement QbD principles throughout development.
3. **Stakeholder Engagement**: Maintain regular communication with regulatory agencies.

For "${query}", I suggest consulting the latest ICH guidelines and FDA guidance documents relevant to your therapeutic area.`,
      };

      response =
        contextualResponses[context as string] ||
        buildCapabilityFallback(resolvedMode) ||
        contextualResponses['default'];
    }

    const recommendedArtifactsByMode: Record<string, string[]> = {
      build_design: ['Regulatory strategy memo', 'Submission roadmap', 'Risk register'],
      author: ['Section draft pack', 'Citation traceability matrix', 'Terminology style guide'],
      audit: ['Gap report', 'CAPA action list', 'Evidence coverage heatmap'],
      evaluate: ['Option comparison table', 'Recommendation memo', 'Decision log'],
      predict: ['Likely agency question bank', 'Mitigation plan', 'Pre-briefing deck'],
      code: ['Python scaffold', 'Validation test suite', 'Automation runbook'],
      docx: ['DOCX template pack', 'Section insertion map', 'Export QA checklist'],
    };

    const nextQuestionsByMode: Record<string, string[]> = {
      build_design: [
        'Which submission type and region are in scope?',
        'What is your target filing date?',
      ],
      author: ['Which section should be drafted first?', 'What source evidence is available now?'],
      audit: [
        'Do you want risk-ranked findings or full line-by-line review?',
        'What is your remediation deadline?',
      ],
      evaluate: [
        'What are the options under consideration?',
        'Which KPI matters most: speed, risk, or cost?',
      ],
      predict: [
        'Which agencies do you expect to engage first?',
        'What prior deficiencies should be considered?',
      ],
      code: [
        'Preferred runtime: FastAPI, CLI, or batch?',
        'Do you require strict validation schemas?',
      ],
      docx: [
        'Which template standard do you use?',
        'Do you need module-level or full dossier output?',
      ],
    };

    const deliveryPackageByMode: Record<
      string,
      { kpis: string[]; timeline: string[]; automation: string[] }
    > = {
      build_design: {
        kpis: ['Roadmap approval cycle time', 'Planning rework rate', 'Critical risk closure time'],
        timeline: [
          'Week 1: scope + gap map',
          'Week 2-3: roadmap + ownership',
          'Week 4: governance sign-off',
        ],
        automation: ['Requirements extraction', 'Dependency mapping', 'Milestone status alerts'],
      },
      author: {
        kpis: ['Draft turnaround time', 'Reviewer comment density', 'Citation completeness %'],
        timeline: [
          'Week 1: section drafting',
          'Week 2: evidence reconciliation',
          'Week 3: QC pass',
        ],
        automation: ['Section auto-assembly', 'Citation linting', 'Terminology consistency checks'],
      },
      audit: {
        kpis: ['Open findings count', 'High-risk finding closure SLA', 'Repeat issue rate'],
        timeline: [
          'Day 1-3: baseline audit',
          'Day 4-7: remediation planning',
          'Week 2: verification audit',
        ],
        automation: ['Gap scanning', 'Contradiction detection', 'CAPA tracking notifications'],
      },
      evaluate: {
        kpis: ['Decision latency', 'Post-decision rework %', 'Risk-adjusted schedule variance'],
        timeline: ['Day 1: option framing', 'Day 2-3: tradeoff analysis', 'Day 4: decision memo'],
        automation: ['Scenario comparison tables', 'Risk scoring', 'Decision log generation'],
      },
      predict: {
        kpis: [
          'Predicted vs actual agency queries',
          'Mitigation completion %',
          'Deficiency recurrence rate',
        ],
        timeline: ['Week 1: risk forecast', 'Week 2: mitigation execution', 'Week 3: dry-run Q&A'],
        automation: ['Question forecasting', 'Signal clustering', 'Mitigation tracker updates'],
      },
      code: {
        kpis: ['Automation coverage %', 'Validation failure rate', 'Manual effort reduction hours'],
        timeline: [
          'Week 1: scaffold + schemas',
          'Week 2: validators + tests',
          'Week 3: deploy + monitor',
        ],
        automation: [
          'Schema validation pipelines',
          'DOCX generation jobs',
          'Submission package checks',
        ],
      },
      docx: {
        kpis: ['Template reuse %', 'Formatting defect rate', 'Approval cycle duration'],
        timeline: [
          'Week 1: template mapping',
          'Week 2: section population',
          'Week 3: QA + final export',
        ],
        automation: [
          'Template merge engines',
          'Cross-reference integrity checks',
          'Export QA gates',
        ],
      },
    };

    res.json({
      success: true,
      response: response,
      answer: response, // Also provide as 'answer' for compatibility
      confidence: model === 'gemini' ? 0.95 : 0.85,
      mode: resolvedMode,
      audience: audience,
      responseFormat: responseFormat,
      warnings,
      recommendedArtifacts:
        recommendedArtifactsByMode[resolvedMode] || recommendedArtifactsByMode['evaluate'],
      nextQuestions: nextQuestionsByMode[resolvedMode] || nextQuestionsByMode['evaluate'],
      deliveryPackage: deliveryPackageByMode[resolvedMode] || deliveryPackageByMode['evaluate'],
      timestamp: new Date().toISOString(),
      context: context || 'regulatory_affairs',
      sessionId: sessionId,
    });
  } catch (error) {
    console.error('Error in AnA RI endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Unable to process regulatory consultation request',
    });
  }
});


  return router;
}
