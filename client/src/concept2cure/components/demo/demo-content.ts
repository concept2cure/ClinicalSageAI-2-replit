/**
 * @fileoverview Interactive Demo — Complete narration scripts & step definitions
 * @module concept2cure/components/demo/demo-content
 *
 * Pure data file. No React. AnA 1.0 narrates each step with regulatory expertise,
 * workflow-consolidation messaging, and sales consequence framing.
 *
 * 8 demo paths covering the ENTIRE platform:
 *  1. Regulatory Submissions    5. AI Agents & Automation
 *  2. Research & Intelligence   6. Project Management & Ops
 *  3. Document Authoring        7. Security, Compliance & Audit
 *  4. CMC & Quality             8. Collaboration, Reporting & Post-Market
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DemoChoice {
  label: string;
  description?: string;
  nextStepId: string;
}

export interface DemoStep {
  id: string;
  narration: string;
  previewType: string;
  choices?: DemoChoice[];
  nextStep?: string;
}

export interface DemoPath {
  id: string;
  title: string;
  icon: string;
  description: string;
  salesHook: string;
  steps: DemoStep[];
}

// ─── Navigation constants ───────────────────────────────────────────────────

const EXPLORE_ANOTHER: DemoChoice = { label: 'Explore Another Path', nextStepId: 'path-selector' };
const START_TRIAL: DemoChoice = { label: 'Start Free Trial', nextStepId: '__signup__' };

// ─── Welcome ────────────────────────────────────────────────────────────────

export const WELCOME_STEP: DemoStep = {
  id: 'welcome',
  narration:
    "Welcome! I'm **AnA 1.0** — your regulatory intelligence co-pilot.\n\n" +
    'Right now, your team probably juggles 10-15 disconnected tools — PubMed searches in one tab, Word documents in another, spreadsheets for gap analysis, ' +
    'email threads for reviews, and a separate eCTD publisher that costs six figures.\n\n' +
    '**ClinicalSageAI replaces all of it.** One platform. One AI co-pilot. One source of truth.\n\n' +
    'Let me show you how. **What would you like to explore?**',
  previewType: 'hero',
  choices: [
    { label: 'Regulatory Submissions', description: '510(k), IND, NDA, MAA — every filing type', nextStepId: 'sub-command-center' },
    { label: 'Research & Intelligence', description: 'ClinicalTrials.gov, PubMed, regulatory alerts', nextStepId: 'res-engine' },
    { label: 'Document Authoring', description: 'eCTD, CSR, templates, vault', nextStepId: 'doc-coauthor' },
    { label: 'CMC & Quality', description: 'Chemistry, manufacturing, controls', nextStepId: 'cmc-blueprint' },
  ],
};

export const WELCOME_STEP_2: DemoStep = {
  id: 'welcome-2',
  narration: 'There\'s more — pick another area to explore:',
  previewType: 'hero',
  choices: [
    { label: 'AI Agents & Automation', description: 'Agent Swarm, SnowGlobe, Review Pulse', nextStepId: 'ai-swarm' },
    { label: 'Project Management', description: 'Mission Control, timelines, task boards', nextStepId: 'pm-mission' },
    { label: 'Security & Compliance', description: '21 CFR Part 11, audit trails, RBAC', nextStepId: 'sec-cfr' },
    { label: 'Collaboration & Reporting', description: 'Team, reviews, reports, post-market', nextStepId: 'collab-hub' },
    { label: 'Nano Banana Visual AI', description: 'AI image generation, infographics, slide decks', nextStepId: 'nb-visual-ai' },
  ],
};

// ─── Nano Banana Visual AI Demo Path ────────────────────────────────────────

export const NANO_BANANA_DEMO_PATH: DemoPath = {
  id: 'nano-banana',
  title: 'Nano Banana Visual AI',
  icon: '🍌',
  description: 'Generate 4K infographics, regulatory diagrams, and slide decks on demand',
  salesHook: 'Your team spends 40+ hours per month creating presentation visuals. Nano Banana does it in seconds.',
  steps: [
    {
      id: 'nb-visual-ai',
      narration:
        "**Nano Banana** is our visual AI engine — powered by Google Gemini's image generation.\n\n" +
        'Instead of spending hours in PowerPoint or hiring a designer, your team can generate:\n' +
        '- **Publication-ready infographics** for advisory committees\n' +
        '- **Study design diagrams** (CONSORT, PK curves, patient flow)\n' +
        '- **Slide decks** with AI-generated cover images\n' +
        '- **Regulatory timeline visuals** for board presentations\n\n' +
        "It's built into every module — reports, documents, dashboards, and the chat. Let me show you how it works.",
      previewType: 'nano-banana-overview',
      nextStep: 'nb-generate-demo',
    },
    {
      id: 'nb-generate-demo',
      narration:
        'Here\'s the magic: type a description like *"infographic showing IND submission timeline with milestones"* and Nano Banana generates a 4K image in under 12 seconds.\n\n' +
        '**Key capabilities:**\n' +
        '- Text renders accurately in images (logos, labels, chart text)\n' +
        '- Multiple styles: infographic, illustration, photorealistic, slide visual\n' +
        '- Edit existing images with natural language prompts\n' +
        '- Auto-generates PPTX decks with cover images\n\n' +
        '**Cost control built in:** per-user rate limits, response caching, and tier-based access — so your API bill stays predictable.',
      previewType: 'nano-banana-generate',
      nextStep: 'nb-integration-demo',
    },
    {
      id: 'nb-integration-demo',
      narration:
        "Nano Banana isn't a standalone tool — it's woven into the platform:\n\n" +
        '- **Reports**: Generate compliance visuals alongside readiness briefs\n' +
        '- **Document Builder**: Insert AI figures while authoring CSRs and CTDs\n' +
        '- **Dashboards**: Export analytics as infographics or slide decks\n' +
        '- **AnA Chat**: Switch to Nano Banana mode and describe what you need\n' +
        '- **Training**: Auto-generate training materials with regulatory visuals\n\n' +
        'Every image includes a SynthID watermark for traceability. What would you like to explore next?',
      previewType: 'nano-banana-integrations',
      choices: [EXPLORE_ANOTHER, START_TRIAL],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// PATH 1: REGULATORY SUBMISSIONS
// ═══════════════════════════════════════════════════════════════════════════

const PATH_SUBMISSIONS: DemoStep[] = [
  {
    id: 'sub-command-center',
    narration:
      "This is the **Submission Command Center** — your portfolio view across every active filing.\n\n" +
      'We support **15+ submission types** across 4 major agencies:\n' +
      '- **FDA**: 510(k), IND, NDA, BLA, PMA, De Novo, ANDA, HDE, EUA\n' +
      '- **EMA**: MAA, CTA, IMPD\n' +
      '- **PMDA**: CTN, MAA (Japan)\n' +
      '- **NMPA**: IND, NDA (China)\n\n' +
      'Every submission has milestones, PDUFA dates, and real-time readiness scores. No more spreadsheet tracking.',
    previewType: 'sub-portfolio',
    nextStep: 'sub-510k',
  },
  {
    id: 'sub-510k',
    narration:
      "Here's the **510(k) & Device Submission** workspace. Over **75% of 510(k) refusals** cite inadequate predicate comparison.\n\n" +
      'Our Predicate Research Engine searches the entire FDA database, cross-referencing product codes, intended use, and technological characteristics. ' +
      'The **Substantial Equivalence Matrix** auto-generates side-by-side comparisons validated against **21 CFR 807.87**.\n\n' +
      'Your team is probably doing this in Excel today. That stops here.',
    previewType: 'sub-510k',
    nextStep: 'sub-ind',
  },
  {
    id: 'sub-ind',
    narration:
      "The **IND/NDA/BLA workspace** handles drug and biologic submissions end-to-end.\n\n" +
      'eCTD Modules 1-5 are structured and auto-populated. Our AI agents run protocol analysis against **ICH E6(R3) GCP**, ' +
      'validate statistical designs, and check compliance against **21 CFR 312** — all in parallel.\n\n' +
      'Breakthrough, orphan drug, accelerated approval, and priority review pathway guidance is built right in.',
    previewType: 'sub-ind',
    nextStep: 'sub-global',
  },
  {
    id: 'sub-global',
    narration:
      "Filing in multiple markets? The **Global Multi-Agency** view lets you prepare submissions for FDA, EMA, PMDA, and NMPA simultaneously.\n\n" +
      'Region-specific Module 1 templates, agency-specific formatting, and **simultaneous multi-market filing strategy** — ' +
      'all coordinated from one workspace. No duplicate effort across geographies.',
    previewType: 'sub-global',
    nextStep: 'sub-meetings',
  },
  {
    id: 'sub-meetings',
    narration:
      "Before you file, there are meetings. **Pre-IND, End-of-Phase-2, Pre-NDA** — our meeting workspace generates briefing document templates, " +
      'captures minutes, and tracks action items.\n\n' +
      '**Teams without structured meeting prep face 40% more FDA information requests.** ' +
      "Don't let a disorganized Pre-IND meeting set your program back 6 months.",
    previewType: 'sub-meetings',
    choices: [EXPLORE_ANOTHER, START_TRIAL],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// PATH 2: RESEARCH & INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════

const PATH_RESEARCH: DemoStep[] = [
  {
    id: 'res-engine',
    narration:
      "The **Deep Research Engine** replaces your manual PubMed and ClinicalTrials.gov searches.\n\n" +
      'Ask a question in natural language — AnA queries across **ClinicalTrials.gov, PubMed, FDA, EMA, PMDA, and NMPA databases** simultaneously. ' +
      'Veeva Vault and Medidata connectors auto-populate your workspace with source data.\n\n' +
      'Instead of 5 browser tabs and a spreadsheet, everything is synthesized in one view.',
    previewType: 'res-search',
    nextStep: 'res-results',
  },
  {
    id: 'res-results',
    narration:
      "Here's a live research result. The engine pulls **structured trial data** — enrollment numbers, primary/secondary endpoints, phases, sponsors — " +
      'and cross-references it with published literature.\n\n' +
      'Every data point links back to its source. **No hallucinations, no uncited claims** — just verified, traceable regulatory intelligence.',
    previewType: 'res-results',
    nextStep: 'res-intel',
  },
  {
    id: 'res-intel',
    narration:
      "The **Regulatory Intelligence Feed** monitors signals across all major agencies in real time:\n\n" +
      '- New & draft guidances\n' +
      '- Approval decisions & Complete Response Letters\n' +
      '- Advisory committee outcomes\n' +
      '- Enforcement actions & warning letters\n' +
      '- Competitive pipeline movements\n\n' +
      'Custom alerts notify your team the moment something relevant drops. No more finding out a week late from a colleague.',
    previewType: 'res-intelligence',
    nextStep: 'res-precedent',
  },
  {
    id: 'res-precedent',
    narration:
      "The **Precedent Finder** answers the critical question: *How did similar products get approved?*\n\n" +
      'Regulatory pathway analysis, review timelines, endpoint acceptance history, competitor submission tracking — all searchable. ' +
      'The **Authority Tracker** even shows which FDA division reviewed similar products and their historical approval patterns.',
    previewType: 'res-precedent',
    nextStep: 'res-evidence',
  },
  {
    id: 'res-evidence',
    narration:
      "The **Evidence Manager** builds a knowledge graph linking every piece of evidence to your submission sections.\n\n" +
      'Citation tracking, gap identification, and provenance chains — so when an FDA reviewer asks "where does this claim come from?", ' +
      'you have the answer instantly.\n\n' +
      '**Companies relying on manual literature review spend 3x longer and miss 60% of relevant precedents.** This changes that.',
    previewType: 'res-evidence',
    choices: [EXPLORE_ANOTHER, START_TRIAL],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// PATH 3: DOCUMENT AUTHORING & MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const PATH_AUTHORING: DemoStep[] = [
  {
    id: 'doc-coauthor',
    narration:
      "The **eCTD Co-Author** is where regulatory writers work alongside AI — not instead of AI.\n\n" +
      'Real-time suggestions, automatic cross-references to source data, and compliance validation against agency requirements — ' +
      'all in a clean, distraction-free editor. Think of it as your best regulatory writer\'s brain, always available.\n\n' +
      'This replaces Word + SharePoint + manual compliance checklists.',
    previewType: 'doc-editor',
    nextStep: 'doc-csr',
  },
  {
    id: 'doc-csr',
    narration:
      "The **CSR Builder** generates **ICH E3-compliant** Clinical Study Reports. Select your study, and AI drafts every section:\n\n" +
      '- Synopsis & study objectives\n' +
      '- Study design & methodology\n' +
      '- Efficacy & safety results tables\n' +
      '- Statistical analysis narratives\n\n' +
      'Every claim links to source data with full traceability. Your medical writers focus on strategy, not copy-paste.',
    previewType: 'doc-csr',
    nextStep: 'doc-templates',
  },
  {
    id: 'doc-templates',
    narration:
      "Our **Template Library** covers **15+ submission types across 4 agencies**:\n\n" +
      '- **FDA**: IND, NDA, BLA, 510(k), PMA, De Novo\n' +
      '- **EMA**: MAA, CTA, PSUR, RMP\n' +
      '- **PMDA**: CTN, MAA (Japan)\n' +
      '- **NMPA**: IND, NDA (China)\n\n' +
      'Each template auto-populates with your project data and follows the latest agency-specific formatting. No more outdated Word templates from 2019.',
    previewType: 'doc-templates',
    nextStep: 'doc-vault',
  },
  {
    id: 'doc-vault',
    narration:
      "The **Document Vault** is your single source of truth. Full-text search, metadata tagging, branch/merge version control, " +
      'rollback capabilities, and change annotations.\n\n' +
      'Provenance tracking follows every document from source → draft → review → final. ' +
      'This replaces your shared drive chaos and gives you Veeva-grade document control without the Veeva price tag.',
    previewType: 'doc-vault',
    nextStep: 'doc-sherpa',
  },
  {
    id: 'doc-sherpa',
    narration:
      "**Document Sherpa** guides authors step-by-step through complex documents with best-practice suggestions, " +
      'IFU consistency checking, labeling compliance, and cross-reference validation.\n\n' +
      '**Regulatory submissions with unvalidated cross-references face a 52% higher refusal rate at the gateway.** ' +
      'Sherpa catches these before you ever hit "submit".',
    previewType: 'doc-sherpa',
    choices: [EXPLORE_ANOTHER, START_TRIAL],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// PATH 4: CMC & QUALITY
// ═══════════════════════════════════════════════════════════════════════════

const PATH_CMC: DemoStep[] = [
  {
    id: 'cmc-blueprint',
    narration:
      "The **CMC Platform** is one of our most comprehensive modules — **25,000 lines of code, 102 API endpoints** dedicated to Chemistry, Manufacturing & Controls.\n\n" +
      'Drug substance and product specifications, manufacturing process descriptions, stability protocols, batch records — all in one workspace. ' +
      'This replaces your standalone CMC tracking system and the spreadsheets that supplement it.',
    previewType: 'cmc-blueprint',
    nextStep: 'cmc-analytical',
  },
  {
    id: 'cmc-analytical',
    narration:
      "**Analytical Methods & Validation** gives you real-time tracking dashboards, OOS investigation workflows, " +
      'and **ICH Q2(R2) compliance** validation.\n\n' +
      'Method validation parameters, system suitability criteria, and acceptance criteria are tracked automatically. ' +
      'No more hunting through binders to find validation records during an inspection.',
    previewType: 'cmc-analytical',
    nextStep: 'cmc-manufacturing',
  },
  {
    id: 'cmc-manufacturing',
    narration:
      "**Manufacturing & Scale-Up** tracks your process from lab bench to commercial production.\n\n" +
      'Process control documentation, scale-up management, impurity characterization, container/closure system validation, ' +
      'and batch record management — all with built-in compliance checks against **ICH Q7 GMP** requirements.\n\n' +
      'When your CMO asks for process specs, you export them in seconds.',
    previewType: 'cmc-manufacturing',
    nextStep: 'cmc-readiness',
  },
  {
    id: 'cmc-readiness',
    narration:
      "**CMC Readiness & Gap Analysis** runs automated checks against **ICH Q8-Q12** requirements and scores your Module 3 completeness.\n\n" +
      '**CMC deficiencies account for 30% of FDA Complete Response Letters.** Our platform catches them before submission — ' +
      'saving you the average 12-month delay and $10M+ cost of a CRL.\n\n' +
      "If you're still managing CMC in spreadsheets, every day without this platform is a risk.",
    previewType: 'cmc-readiness',
    choices: [EXPLORE_ANOTHER, START_TRIAL],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// PATH 5: AI AGENTS & AUTOMATION
// ═══════════════════════════════════════════════════════════════════════════

const PATH_AI: DemoStep[] = [
  {
    id: 'ai-swarm',
    narration:
      "This is the **Agent Swarm** — 12+ specialized AI agents that work in parallel on your submission.\n\n" +
      '- **Predicate Researcher** — scans FDA databases\n' +
      '- **Evidence Agent** — gathers clinical evidence\n' +
      '- **Protocol Analyzer** — validates study design (ICH E6)\n' +
      '- **Drafter** — generates regulatory sections\n' +
      '- **Statistician** — reviews sample size & endpoints\n' +
      '- **QC Agent** — quality checks completeness\n' +
      '- **Compliance Agent** — checks against applicable CFR\n' +
      '- **Translator** — adapts for regional requirements\n' +
      '- **Compiler** — assembles eCTD packages\n\n' +
      'They work simultaneously. What takes a team weeks, our swarm completes in hours.',
    previewType: 'ai-swarm',
    nextStep: 'ai-snowglobe',
  },
  {
    id: 'ai-snowglobe',
    narration:
      "**SnowGlobe** is our prediction and simulation engine. Before you file, it models what-if scenarios:\n\n" +
      '- *What if we choose a different predicate device?*\n' +
      '- *What if FDA asks for additional clinical data?*\n' +
      '- *What\'s the probability of approval with this endpoint?*\n\n' +
      'Isolated "chambers" let you compare scenarios side-by-side. Make decisions backed by data, not gut feeling.',
    previewType: 'ai-snowglobe',
    nextStep: 'ai-review-pulse',
  },
  {
    id: 'ai-review-pulse',
    narration:
      "**Review Pulse** is your real-time submission health monitor. It tracks signals across every module:\n\n" +
      '- Readiness scores by section\n' +
      '- Risk heatmaps with severity ranking\n' +
      '- Trend analysis (improving / stable / degrading)\n' +
      '- **AI Sentinel** — automated findings that flag issues before humans notice\n\n' +
      'Think of it as a "check engine light" for your submission. You always know where you stand.',
    previewType: 'ai-review-pulse',
    nextStep: 'ai-dual',
  },
  {
    id: 'ai-dual',
    narration:
      "You've already met me — **AnA**, your regulatory co-pilot. But I'm not alone.\n\n" +
      '**Dr. Sage** provides contextual training and just-in-time help on every screen. Together, we form a **dual-AI system**: ' +
      'I handle strategy and authoring, Dr. Sage handles learning and enablement.\n\n' +
      '**Manual regulatory review cycles take 2-4 weeks. Our AI agents compress this to hours — without sacrificing quality.** ' +
      'The question isn\'t whether AI will transform regulatory affairs. It\'s whether you\'ll lead or follow.',
    previewType: 'ai-dual',
    choices: [EXPLORE_ANOTHER, START_TRIAL],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// PATH 6: PROJECT MANAGEMENT & OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

const PATH_PM: DemoStep[] = [
  {
    id: 'pm-mission',
    narration:
      "**Mission Control** is your portfolio-level command center.\n\n" +
      'Project hierarchy with rollup aggregates, Rules Engine execution feed, AI Sentinel risk heatmap, and module integration summary — ' +
      'all in one view. Your VP of Regulatory sees the forest. Your writers see the trees. Same platform.\n\n' +
      'This replaces your Monday.com / Smartsheet / Jira regulatory workaround with a purpose-built tool.',
    previewType: 'pm-mission',
    nextStep: 'pm-timelines',
  },
  {
    id: 'pm-timelines',
    narration:
      "**Project Timelines & Milestones** give you PDUFA date management, commitment tracking, phase transitions, " +
      'dependency visualization, and critical path analysis.\n\n' +
      'When a CMC section slips by 2 weeks, the timeline automatically recalculates downstream impact on your filing date. ' +
      "No one is surprised at the 11th hour.",
    previewType: 'pm-timelines',
    nextStep: 'pm-tasks',
  },
  {
    id: 'pm-tasks',
    narration:
      "**Task Boards** provide Kanban-style tracking with deadline alerts, owner assignment, and SLA monitoring.\n\n" +
      'The **Rules Engine** automates workflow triggers — when a section passes QC review, the next reviewer is automatically notified, ' +
      'the compliance agent runs a check, and the readiness score updates in real time.',
    previewType: 'pm-tasks',
    nextStep: 'pm-decisions',
  },
  {
    id: 'pm-decisions',
    narration:
      "Every critical decision is captured in the **Decision Log** with rationale, stakeholder sign-offs, and a complete audit trail.\n\n" +
      '**Program Analytics** shows portfolio metrics, team utilization, budget vs. actual, and submission velocity. ' +
      'Executives get the dashboards they need without asking for status updates.',
    previewType: 'pm-decisions',
    nextStep: 'pm-gaps',
  },
  {
    id: 'pm-gaps',
    narration:
      "**Submission Gap Analysis** runs automated completeness scoring across every module. Missing content, cross-document impact analysis, " +
      'and change propagation tracking — all flagged before submission.\n\n' +
      '**60% of regulatory teams discover submission gaps at the 11th hour.** Our real-time gap analysis eliminates last-minute scrambles ' +
      "and the all-nighters that come with them.",
    previewType: 'pm-gaps',
    choices: [EXPLORE_ANOTHER, START_TRIAL],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// PATH 7: SECURITY, COMPLIANCE & AUDIT
// ═══════════════════════════════════════════════════════════════════════════

const PATH_SECURITY: DemoStep[] = [
  {
    id: 'sec-cfr',
    narration:
      "Compliance isn't a feature we bolted on — it's in the platform's DNA.\n\n" +
      '**21 CFR Part 11** compliance includes:\n' +
      '- Immutable audit trails (action, timestamp, user, IP address)\n' +
      '- Electronic signatures (**FIPS 186-5** compliant)\n' +
      '- Content integrity hashing (**SHA-256**)\n' +
      '- Automated session management with configurable timeout\n\n' +
      'Every click, every edit, every approval — logged and tamper-proof.',
    previewType: 'sec-audit',
    nextStep: 'sec-rbac',
  },
  {
    id: 'sec-rbac',
    narration:
      "**Role-Based Access Control** with multi-tenancy isolation.\n\n" +
      'Granular permissions by workspace, subscription tier, and document level. Organization → ClientWorkspace → Project scoping ensures ' +
      'complete data isolation between clients (critical for CROs).\n\n' +
      'MFA, OAuth2/OpenID Connect, and SSO integration for enterprise deployments. Your IT team will love us.',
    previewType: 'sec-rbac',
    nextStep: 'sec-inspection',
  },
  {
    id: 'sec-inspection',
    narration:
      "When FDA shows up for an inspection, you need to be ready. **Inspection Readiness** provides:\n\n" +
      '- Warning letter pattern analysis\n' +
      '- Document staging for inspector access\n' +
      '- One-click audit trail export\n' +
      '- Compliance scoring by regulation\n' +
      '- Inspection package generation\n\n' +
      'No more scrambling to pull records. Everything is pre-staged and inspection-ready.',
    previewType: 'sec-inspection',
    nextStep: 'sec-governance',
  },
  {
    id: 'sec-governance',
    narration:
      "**Proof Certificates** provide blockchain-style proof of compliance — shareable, verifiable, immutable.\n\n" +
      'Plus full **HIPAA** data encryption, **GDPR** right-to-be-forgotten, and configurable data retention policies.\n\n' +
      '**FDA 483 observations for inadequate electronic records have increased 35% year-over-year.** ' +
      'With ClinicalSageAI, you\'re not just compliant — you\'re inspection-ready at all times.',
    previewType: 'sec-governance',
    choices: [EXPLORE_ANOTHER, START_TRIAL],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// PATH 8: COLLABORATION, REPORTING & POST-MARKET
// ═══════════════════════════════════════════════════════════════════════════

const PATH_COLLAB: DemoStep[] = [
  {
    id: 'collab-hub',
    narration:
      "The **Collaboration Hub** replaces your email threads and Slack channels with structured, auditable team coordination.\n\n" +
      'Thread-based discussions per submission, @mentions, role-based views, activity feeds — all with context preservation. ' +
      "When a new team member joins mid-project, they read the thread. They don't ask 'what did I miss?'",
    previewType: 'collab-hub',
    nextStep: 'collab-review',
  },
  {
    id: 'collab-review',
    narration:
      "**Review Queues & Approvals** bring structure to your review process.\n\n" +
      'QA, compliance, and regulatory review workflows with SLA tracking, peer review, inline comments, ' +
      'and electronic signature workflows (approve / review / reject). ' +
      'Every review decision is captured with a full audit trail — no more "I thought someone else reviewed that."',
    previewType: 'collab-review',
    nextStep: 'collab-reports',
  },
  {
    id: 'collab-reports',
    narration:
      "The **Report Center** generates AI-powered reports and exports in multiple formats:\n\n" +
      '- **PDF** and **Word** for internal distribution\n' +
      '- **eCTD XML** for regulatory submission\n' +
      '- Compliance validation reports\n' +
      '- Submission progress dashboards\n' +
      '- Risk assessment summaries\n\n' +
      'Reports are provenance-tracked and indemnified — they reflect the truth of your data, not a manual interpretation of it.',
    previewType: 'collab-reports',
    nextStep: 'collab-postmarket',
  },
  {
    id: 'collab-postmarket',
    narration:
      "After approval, the work continues. **Post-Market Surveillance** tracks:\n\n" +
      '- Adverse event reporting\n' +
      '- Complaint handling workflows\n' +
      '- CAPA management\n' +
      '- Post-market clinical follow-up\n' +
      '- Continuous compliance monitoring\n\n' +
      'Your regulatory lifecycle is end-to-end in one platform. No handoff, no data migration, no lost context.',
    previewType: 'collab-postmarket',
    nextStep: 'collab-academy',
  },
  {
    id: 'collab-academy',
    narration:
      "Finally — **Academy & Enablement**. Dr. Sage and AnA serve as your AI co-teachers.\n\n" +
      'Self-paced courses, certification programs, role-specific curricula, and contextual help overlays — built into the platform, not a separate LMS.\n\n' +
      '**The average regulatory team spends 6 months onboarding new hires.** Our AI-guided enablement cuts this to weeks. ' +
      'Your newest team member is productive on day one.',
    previewType: 'collab-academy',
    choices: [EXPLORE_ANOTHER, START_TRIAL],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// SPECIAL STEPS
// ═══════════════════════════════════════════════════════════════════════════

export const PATH_SELECTOR_STEP: DemoStep = {
  id: 'path-selector',
  narration: "What would you like to explore next?",
  previewType: 'hero',
  choices: [
    { label: 'Regulatory Submissions', description: '510(k), IND, NDA, MAA — every filing type', nextStepId: 'sub-command-center' },
    { label: 'Research & Intelligence', description: 'ClinicalTrials.gov, PubMed, regulatory alerts', nextStepId: 'res-engine' },
    { label: 'Document Authoring', description: 'eCTD, CSR, templates, vault', nextStepId: 'doc-coauthor' },
    { label: 'CMC & Quality', description: 'Chemistry, manufacturing, controls', nextStepId: 'cmc-blueprint' },
    { label: 'AI Agents & Automation', description: 'Agent Swarm, SnowGlobe, Review Pulse', nextStepId: 'ai-swarm' },
    { label: 'Project Management', description: 'Mission Control, timelines, task boards', nextStepId: 'pm-mission' },
    { label: 'Security & Compliance', description: '21 CFR Part 11, audit trails, RBAC', nextStepId: 'sec-cfr' },
    { label: 'Collaboration & Reporting', description: 'Team, reviews, reports, post-market', nextStepId: 'collab-hub' },
  ],
};

export const CTA_SIGNUP_STEP: DemoStep = {
  id: 'cta-signup',
  narration:
    "You've seen what ClinicalSageAI can do — **one platform replacing 10-15 disconnected tools**.\n\n" +
    'Every day without workflow consolidation costs your team:\n' +
    '- **Hours** lost switching between tools\n' +
    '- **Weeks** lost on manual reviews AI can accelerate\n' +
    '- **Months** lost to preventable CRLs and 483s\n' +
    '- **Millions** in delayed market entry\n\n' +
    "Start with our **free Researcher tier** — no credit card required. Or let's talk enterprise.",
  previewType: 'cta',
  choices: [
    { label: 'Start Free Trial', nextStepId: '__signup__' },
    { label: 'Explore More Features', nextStepId: 'path-selector' },
    { label: 'Back to Home', nextStepId: '__home__' },
  ],
};

// ─── ALL STEPS MAP ──────────────────────────────────────────────────────────

const ALL_STEPS: DemoStep[] = [
  WELCOME_STEP,
  WELCOME_STEP_2,
  ...PATH_SUBMISSIONS,
  ...PATH_RESEARCH,
  ...PATH_AUTHORING,
  ...PATH_CMC,
  ...PATH_AI,
  ...PATH_PM,
  ...PATH_SECURITY,
  ...PATH_COLLAB,
  PATH_SELECTOR_STEP,
  CTA_SIGNUP_STEP,
];

export const STEP_MAP: Record<string, DemoStep> = Object.fromEntries(
  ALL_STEPS.map((s) => [s.id, s]),
);

// ─── DEMO PATHS (for display in path selector) ─────────────────────────────

export const DEMO_PATHS: DemoPath[] = [
  {
    id: 'submissions',
    title: 'Regulatory Submissions',
    icon: 'FileCheck',
    description: '510(k), IND, NDA/BLA, PMA, MAA — every filing type across FDA, EMA, PMDA, NMPA',
    salesHook: 'Teams without structured submission management face 2x higher refusal rates',
    steps: PATH_SUBMISSIONS,
  },
  {
    id: 'research',
    title: 'Research & Intelligence',
    icon: 'Search',
    description: 'ClinicalTrials.gov, PubMed, regulatory alerts, precedent analysis, evidence graphs',
    salesHook: 'Manual literature review takes 3x longer and misses 60% of relevant precedents',
    steps: PATH_RESEARCH,
  },
  {
    id: 'authoring',
    title: 'Document Authoring',
    icon: 'FileText',
    description: 'eCTD Co-Author, CSR Builder, templates, vault, version control, Document Sherpa',
    salesHook: 'Unvalidated cross-references face a 52% higher gateway refusal rate',
    steps: PATH_AUTHORING,
  },
  {
    id: 'cmc',
    title: 'CMC & Quality',
    icon: 'FlaskConical',
    description: 'Chemistry, manufacturing, controls, analytical validation, stability, scale-up',
    salesHook: 'CMC deficiencies account for 30% of FDA Complete Response Letters',
    steps: PATH_CMC,
  },
  {
    id: 'ai',
    title: 'AI Agents & Automation',
    icon: 'Bot',
    description: 'Agent Swarm, SnowGlobe predictions, Review Pulse, AnA + Dr. Sage dual-AI',
    salesHook: 'Manual regulatory review cycles take 2-4 weeks — AI compresses this to hours',
    steps: PATH_AI,
  },
  {
    id: 'pm',
    title: 'Project Management',
    icon: 'LayoutDashboard',
    description: 'Mission Control, timelines, task boards, decision logs, gap analysis, rules engine',
    salesHook: '60% of teams discover submission gaps at the 11th hour',
    steps: PATH_PM,
  },
  {
    id: 'security',
    title: 'Security & Compliance',
    icon: 'Shield',
    description: '21 CFR Part 11, e-signatures, audit trails, RBAC, HIPAA, GDPR, inspection readiness',
    salesHook: 'FDA 483 observations for inadequate electronic records have increased 35% YoY',
    steps: PATH_SECURITY,
  },
  {
    id: 'collab',
    title: 'Collaboration & Reporting',
    icon: 'Users',
    description: 'Team coordination, review queues, report center, post-market surveillance, academy',
    salesHook: 'Average regulatory team spends 6 months onboarding new hires — AI cuts this to weeks',
    steps: PATH_COLLAB,
  },
];
