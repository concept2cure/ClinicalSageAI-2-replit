/**
 * @fileoverview World-Class Marketing Landing Page
 * @module concept2cure/pages/LandingPage
 *
 * Hyperscale SaaS marketing page — renders at / when unauthenticated.
 * Flow: Marketing → Demo → Auth → Platform
 */

import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion, useInView, useScroll } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.2, 0, 0, 1] } },
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

function Section({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.section
      ref={ref}
      id={id}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={stagger}
      className={className}
    >
      {children}
    </motion.section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════════════════════════

const HERO_STATS = [
  { value: '6', label: 'Global Agencies', sub: 'FDA · EMA · PMDA · NMPA · MHRA · TGA' },
  { value: '86+', label: 'Integrated Modules', sub: 'One connected platform' },
  { value: '68%', label: 'Faster Filing', sub: 'vs. manual workflows' },
  { value: '21 CFR', label: 'Part 11 Compliant', sub: 'Enterprise-grade' },
];

const ROI_METRICS = [
  {
    value: '$2.4M',
    label: 'Average Annual Savings',
    detail: 'Reduced headcount, eliminated tool sprawl, fewer CRO hours',
    icon: 'dollar',
  },
  {
    value: '68%',
    label: 'Faster Time-to-Filing',
    detail: 'From IND prep to gateway submission, across all agencies',
    icon: 'clock',
  },
  {
    value: '0',
    label: 'Gateway Rejections',
    detail: 'AI-validated eCTD packages with automated QC checks',
    icon: 'shield',
  },
  {
    value: '12→1',
    label: 'Tool Consolidation',
    detail: 'Replace fragmented point solutions with one platform',
    icon: 'layers',
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    step: '01',
    title: 'Connect Your Data',
    description: 'Import from ClinicalTrials.gov, PubMed, Veeva Vault, or upload directly. AnA indexes everything in minutes.',
    color: 'blue',
  },
  {
    step: '02',
    title: 'AI Builds Your Dossier',
    description: '12 specialized agents research, draft, cross-reference, and quality-check your regulatory documents in parallel.',
    color: 'violet',
  },
  {
    step: '03',
    title: 'Review & Collaborate',
    description: 'Your team reviews AI-drafted sections with tracked changes, e-signatures, and full audit trails.',
    color: 'indigo',
  },
  {
    step: '04',
    title: 'Submit with Confidence',
    description: 'One-click eCTD v4 export with automated gateway validation. Zero rejections guaranteed.',
    color: 'green',
  },
];

const CONSOLIDATION_TOOLS = [
  'PubMed Search', 'ClinicalTrials.gov', 'Word/SharePoint', 'Spreadsheets',
  'Manual eCTD Tools', 'CMC Trackers', 'Email/Slack', 'Compliance Tools',
  'LMS Training', 'Audit Systems', 'Project Mgmt', 'Document Vaults',
];

const FEATURES = [
  {
    title: 'Deep Research Engine',
    description: 'Automated intelligence from ClinicalTrials.gov, PubMed, FDA, EMA, PMDA, and NMPA. Veeva Vault & Medidata connectors auto-populate your workspace.',
    icon: 'search',
    stat: '50,000+',
    statLabel: 'Sources indexed',
  },
  {
    title: 'Full CSR Builder',
    description: 'Generate complete ICH E3 Clinical Study Reports with AI-powered section drafting, cross-referencing, and compliance validation.',
    icon: 'file',
    stat: '10x',
    statLabel: 'Faster CSR drafting',
  },
  {
    title: 'Global CTD Builder',
    description: 'Build Common Technical Documents for all 4 major agencies with region-specific Module 1 templates and one-click eCTD export.',
    icon: 'globe',
    stat: '4',
    statLabel: 'Agency templates',
  },
  {
    title: 'Regulatory Intelligence',
    description: 'Real-time monitoring of guidances, approval decisions, CRLs, advisory committees, enforcement actions, and warning letters.',
    icon: 'brain',
    stat: '24/7',
    statLabel: 'Real-time monitoring',
  },
  {
    title: 'eCTD Authoring & Export',
    description: 'Collaborative authoring with SmartTags, version control, provenance tracking, and one-click eCTD v4 package export.',
    icon: 'layers',
    stat: '100%',
    statLabel: 'eCTD v4 compliant',
  },
  {
    title: 'Enterprise Compliance',
    description: 'FDA 21 CFR Part 11 with immutable audit trails, e-signatures, RBAC, hash chain validation, and inspection-ready packages.',
    icon: 'shield',
    stat: 'Zero',
    statLabel: '483 observations',
  },
];

// Extended module showcase — the complete platform (86+ modules, organized by strategic group)
const PLATFORM_MODULES = [
  {
    category: 'Research & Intelligence',
    modules: [
      { name: 'Deep Research Engine', desc: 'AI-powered search across PubMed, ClinicalTrials.gov, FDA, EMA, PMDA databases. Auto-extract endpoints, populations, safety signals, and evidence.' },
      { name: 'Predicate Intelligence', desc: '510(k) predicate device analysis with substantial equivalence mapping, MAUDE adverse event mining, recall tracking, and competitive landscape.' },
      { name: 'CSR Intelligence', desc: 'Search, compare, and cluster Clinical Study Reports. AI extracts findings, endpoints, and statistical results across thousands of studies.' },
      { name: 'Regulatory Intelligence Hub', desc: 'Real-time monitoring of guidances, approvals, CRLs, advisory committees, enforcement actions, and warning letters across all agencies.' },
      { name: 'Biostatistics Engine', desc: 'Study design validation, power calculations, endpoint analysis, and statistical methodology support aligned with ICH E9/E10 guidelines.' },
    ],
  },
  {
    category: 'Document Authoring & Collaboration',
    modules: [
      { name: 'eCTD Co-Author', desc: 'AI-assisted authoring for CTD Modules 1-5 with SmartTags, claim verification, AI-generated citations, tracked changes, and redline alerts.' },
      { name: 'CSR Builder', desc: 'Full ICH E3-compliant Clinical Study Report generation. AI drafts sections, auto-generates tables/figures, and validates cross-references.' },
      { name: 'Document Sherpa', desc: 'AI guide that anticipates needs during authoring — proactive warnings about gaps, blocker detection, and journey progress tracking.' },
      { name: 'Collaboration Hub', desc: 'Real-time co-editing with team presence, @mentions, task assignments, review workflows, and timezone-aware global coordination.' },
      { name: 'DOCX Factory', desc: 'One-click export to Word with agency-specific formatting, headers, TOC, appendices, and regulatory-compliant templates.' },
    ],
  },
  {
    category: 'Submission & Regulatory Pathways',
    modules: [
      { name: 'eCTD Submission Builder', desc: 'Assemble, validate, and export eCTD v4 packages for all agencies. Automated gateway validation and zero-rejection guarantee.' },
      { name: '510(k) Automation', desc: 'End-to-end 510(k): predicate search, substantial equivalence analysis, comparison tables, decision trees, eSTAR tracking, and pre-sub assembly.' },
      { name: 'IND/NDA/BLA Wizard', desc: 'Guided assembly for INDs, NDAs, and BLAs with module checklists, cross-reference validation, and automated completeness checks.' },
      { name: 'IVDR / EU MDR', desc: 'EU IVDR 2017/746 compliance: Annex VIII classification, GSPR mapping, clinical evidence compilation, and notified body readiness.' },
      { name: 'FDA Meeting Prep', desc: 'Pre-IND, EOP2, Pre-NDA meeting request drafting, briefing document generation, Type A/B/C management, and action item tracking.' },
    ],
  },
  {
    category: 'Quality, CMC & Manufacturing',
    modules: [
      { name: 'CMC Platform', desc: 'Full Module 3 management: drug substance/product specs, analytical methods, stability data, batch records, and impurity profiles per ICH Q1-Q14.' },
      { name: 'Stability Tracking', desc: 'ICH Q1A-compliant studies with automated trending, OOS alerts, shelf-life predictions, graphical reporting, and comparability studies.' },
      { name: 'Analytical Validation', desc: 'Method validation and transfer tracking per ICH Q2/Q14 with acceptance criteria management and documentation generation.' },
      { name: 'CAPA Management', desc: 'Corrective and Preventive Action tracking with root cause analysis, effectiveness checks, and regulatory reporting workflows.' },
      { name: 'Post-Market Surveillance', desc: 'PSUR/PBRER generation, signal management, MedWatch/MDR reporting, PMCF planning, and vigilance tracking.' },
    ],
  },
  {
    category: 'AI Agents & Automation',
    modules: [
      { name: 'Agent Swarm', desc: 'Orchestrated multi-agent system: Coordinator, Drafter, Researcher, Statistician, QC Agent, and Compliance Agent working in parallel on submissions.' },
      { name: 'AnA SnowGlobe', desc: 'Prediction engine for regulatory outcomes — submission success modeling, pathway simulations, what-if analysis, and knowledge graphs.' },
      { name: 'Convergent Canvas', desc: 'Adaptive command center with Morning Briefings, Council Threads (multi-agent advisory), and industry-specific workspaces for every role.' },
      { name: 'Review Pulse', desc: 'Real-time review orchestration: activity tracking, blocker identification, artifact readiness, and workload distribution across teams.' },
      { name: 'Compliance Guardian', desc: 'Real-time regulatory compliance monitoring within documents — checks guideline adherence as you write and flags non-compliant language.' },
      { name: 'Nano Banana Visual AI', desc: 'Google Gemini-powered 4K image generation for regulatory infographics, study diagrams, slide decks, and publication-ready figures. Text-accurate rendering for medical/scientific content.' },
    ],
  },
  {
    category: 'Governance, Security & Audit',
    modules: [
      { name: '21 CFR Part 11 Suite', desc: 'Complete electronic records compliance: immutable audit trails, e-signatures, session management, and password policies per NIST 800-63B.' },
      { name: 'Proof Certificates', desc: 'Cryptographic hash-chain verification for every document version. Tamper-evident proof certificates for regulatory inspections.' },
      { name: 'Document Vault', desc: 'GxP-compliant repository with version control, approval workflows, RBAC, SSO (Microsoft/Google), and full provenance tracking.' },
      { name: 'Inspection Readiness', desc: 'FDA Form 483 preparation, documentation review, gap closure tracking, and inspection-ready audit trail dashboards with PDF/CSV export.' },
      { name: 'Auto-Traceability', desc: 'Automatic cross-reference linking, source-to-claim connections, forward/backward references, and dependency tracking across all documents.' },
    ],
  },
];

const AI_CAPABILITIES = [
  { name: 'Predicate Researcher', desc: 'Finds and analyzes predicate devices across FDA databases' },
  { name: 'Evidence Agent', desc: 'Gathers and validates clinical evidence from literature' },
  { name: 'Protocol Analyzer', desc: 'Reviews study protocols for regulatory compliance' },
  { name: 'Document Drafter', desc: 'AI co-writes submission-ready regulatory documents' },
  { name: 'QC Agent', desc: 'Automated quality checks across all submission modules' },
  { name: 'Compliance Agent', desc: 'Monitors regulatory requirements and flags gaps' },
  { name: 'CMC Specialist', desc: 'Generates CMC blueprints, stability summaries, and Module 3 drafts' },
  { name: 'Cross-Ref Validator', desc: 'Validates cross-references, citations, and data consistency' },
  { name: 'eCTD Assembler', desc: 'Packages and validates eCTD submissions for gateway acceptance' },
  { name: 'Risk Scorer', desc: 'Real-time regulatory risk scoring across your portfolio' },
  { name: 'Morning Briefing', desc: 'Daily intelligence digest of regulatory changes affecting your programs' },
  { name: 'Audit Sentinel', desc: 'Continuous monitoring of 21 CFR Part 11 compliance across all activities' },
  { name: 'Nano Banana Visual AI', desc: 'Generate 4K infographics, regulatory diagrams, slide decks, and publication-ready figures on demand via Google Gemini' },
];

const SOLUTIONS_BY_PERSONA = [
  {
    persona: 'Biotech',
    tagline: 'Move faster with fewer resources',
    description: 'Small teams, big ambitions. Concept2Cure gives lean regulatory teams the firepower of a big pharma operation — AI agents handle research, drafting, and QC while you focus on strategy.',
    stats: ['65% faster IND prep', '3-person team capacity of 15', 'First filing in 6 weeks'],
    color: 'blue',
  },
  {
    persona: 'Pharma',
    tagline: 'Orchestrate multi-program portfolios',
    description: 'Manage complex, global submission portfolios across FDA, EMA, PMDA, and NMPA. Real-time dashboards, centralized intelligence, and AI-powered consistency checks across your entire pipeline.',
    stats: ['4 agency coverage', 'Portfolio-wide intelligence', 'Enterprise SSO & RBAC'],
    color: 'violet',
  },
  {
    persona: 'CRO / Consultancy',
    tagline: 'Deliver more value to every client',
    description: 'Serve more clients with higher quality. Multi-tenant workspaces, white-label reporting, and AI-accelerated delivery that turns your team into a regulatory submission machine.',
    stats: ['3x client throughput', 'White-label reports', 'Multi-tenant workspaces'],
    color: 'indigo',
  },
];

const TESTIMONIALS = [
  {
    quote: 'Concept2Cure reduced our IND preparation time from 18 months to under 6. The AI agents handle what used to take our entire regulatory team weeks.',
    author: 'VP Regulatory Affairs',
    company: 'Series B Biotech',
    metric: '3x faster IND prep',
  },
  {
    quote: 'We replaced 12 separate tools with one platform. The consolidation alone saved us $200K annually, and the AI intelligence is on another level.',
    author: 'Chief Regulatory Officer',
    company: 'Mid-size Pharma',
    metric: '$200K saved/year',
  },
  {
    quote: 'The eCTD export is flawless. Zero gateway rejections in 14 submissions. Our previous vendor had a 20% rejection rate.',
    author: 'Regulatory Operations Director',
    company: 'Global CRO',
    metric: '0% gateway rejections',
  },
];

const PRICING_TIERS = [
  {
    name: 'Researcher',
    price: 'Free',
    period: '',
    description: 'Individual researchers exploring regulatory intelligence',
    features: [
      '1 user', '2 projects', '5 research queries/month',
      'CSR search & analysis', 'Basic AI chat', 'Community support',
    ],
    cta: 'Get Started Free',
    tier: 'free',
    highlighted: false,
  },
  {
    name: 'Startup Biotech',
    price: '$499',
    period: '/mo',
    description: 'Emerging biotechs building their first regulatory dossier',
    features: [
      'Up to 5 users', '10 projects', '50 research queries/month',
      'Full CSR builder', 'Deep Research (CT.gov + PubMed)',
      'eCTD authoring', 'Intelligence hub', 'Email support',
    ],
    cta: 'Start 14-Day Trial',
    tier: 'standard',
    highlighted: true,
  },
  {
    name: 'Growth',
    price: '$1,499',
    period: '/mo',
    description: 'Multi-market submissions at scale',
    features: [
      'Up to 25 users', '50 projects', '200 research queries/month',
      'Full CTD builder (all agencies)', 'Veeva Vault & Medidata',
      'FDA, EMA, PMDA, NMPA templates', 'Multi-agency eCTD', 'Priority support',
    ],
    cta: 'Start 14-Day Trial',
    tier: 'professional',
    highlighted: false,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'Large pharma and CROs with enterprise needs',
    features: [
      'Unlimited users & projects', 'Unlimited deep research',
      'All connectors + custom integrations', 'SSO & advanced security',
      'Dedicated account manager', 'Custom SLA',
      '21 CFR Part 11 audit package', 'On-premise deployment option',
    ],
    cta: 'Contact Sales',
    tier: 'enterprise',
    highlighted: false,
  },
];

const COMPLIANCE_BADGES = [
  { label: 'FDA 21 CFR Part 11', desc: 'Electronic records & signatures' },
  { label: 'SOC 2 Type II', desc: 'Security & availability' },
  { label: 'HIPAA Compliant', desc: 'Protected health information' },
  { label: 'GDPR Ready', desc: 'EU data protection' },
  { label: 'ICH E3/E6', desc: 'Clinical study standards' },
  { label: 'eCTD v4.0', desc: 'Electronic submission format' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════════

const IconMap: Record<string, React.FC<{ className?: string }>> = {
  search: ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  ),
  file: ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  globe: ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  ),
  brain: ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  ),
  layers: ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" />
    </svg>
  ),
  shield: ({ className }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
};

const Logo = () => (
  <svg viewBox="0 0 40 40" className="w-10 h-10" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2" className="text-blue-600" />
    <path d="M12 14C16 14 18 18 20 20C22 22 24 26 28 26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-blue-600" />
    <path d="M28 14C24 14 22 18 20 20C18 22 16 26 12 26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-violet-500" />
    <circle cx="14" cy="14" r="2" fill="currentColor" className="text-blue-600" />
    <circle cx="26" cy="14" r="2" fill="currentColor" className="text-violet-500" />
    <circle cx="14" cy="26" r="2" fill="currentColor" className="text-violet-500" />
    <circle cx="26" cy="26" r="2" fill="currentColor" className="text-blue-600" />
  </svg>
);

const CheckIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const ArrowRight = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
  </svg>
);

const SparklesIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMATED COUNTER
// ═══════════════════════════════════════════════════════════════════════════════

function AnimatedValue({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (!inView) return;
    const numMatch = value.match(/^(\d+)/);
    if (!numMatch) { setDisplay(value); return; }
    const target = parseInt(numMatch[1]);
    const suffix = value.slice(numMatch[1].length);
    const duration = 1200;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(`${Math.round(target * eased)}${suffix}`);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, value]);

  return <span ref={ref}>{display}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM MOCKUP (Product Preview)
// ═══════════════════════════════════════════════════════════════════════════════

function PlatformMockup() {
  return (
    <div className="relative mx-auto max-w-5xl">
      {/* Browser chrome */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-2xl shadow-blue-900/10 overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-zinc-50 border-b border-zinc-200">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="px-4 py-1 bg-white rounded-md border border-zinc-200 text-xs text-zinc-500 font-mono">
              app.concept2cure.pro/concept2cure
            </div>
          </div>
        </div>
        {/* App content mockup */}
        <div className="flex min-h-[340px]">
          {/* Sidebar */}
          <div className="w-56 bg-zinc-900 text-white p-4 hidden md:block">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                <SparklesIcon className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-semibold">Concept2Cure</span>
            </div>
            <div className="space-y-1 text-xs">
              {['Mission Control', 'Deep Research', 'CSR Builder', 'CTD Builder', 'eCTD Export', 'Intelligence Hub', 'CMC Platform', 'Audit Trail'].map((item, i) => (
                <div key={item} className={`px-3 py-2 rounded-lg ${i === 0 ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
                  {item}
                </div>
              ))}
            </div>
          </div>
          {/* Main content */}
          <div className="flex-1 p-6 bg-[#FAFAF9]">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">Mission Control</h3>
                <p className="text-xs text-zinc-500">3 active submissions &middot; 2 approaching PDUFA</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">All Systems Healthy</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: 'Readiness Score', value: '87%', color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Active Agents', value: '12', color: 'text-violet-600', bg: 'bg-violet-50' },
                { label: 'Days to PDUFA', value: '142', color: 'text-amber-600', bg: 'bg-amber-50' },
              ].map(m => (
                <div key={m.label} className={`${m.bg} rounded-xl p-4`}>
                  <div className={`text-2xl font-bold ${m.color}`}>{m.value}</div>
                  <div className="text-xs text-zinc-600 mt-1">{m.label}</div>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {[
                { name: 'IND-2024-0847', status: 'Module 2.7 Review', progress: 78, color: 'bg-blue-500' },
                { name: 'NDA-2024-1203', status: 'CSR Drafting', progress: 45, color: 'bg-violet-500' },
                { name: '510(k)-K241567', status: 'Predicate Analysis', progress: 92, color: 'bg-green-500' },
              ].map(s => (
                <div key={s.name} className="flex items-center gap-4 p-3 bg-white rounded-lg border border-zinc-200">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-zinc-900">{s.name}</div>
                    <div className="text-xs text-zinc-500">{s.status}</div>
                  </div>
                  <div className="w-32 h-2 rounded-full bg-zinc-100">
                    <div className={`h-full rounded-full ${s.color}`} style={{ width: `${s.progress}%` }} />
                  </div>
                  <div className="text-xs font-medium text-zinc-700 w-8 text-right">{s.progress}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Floating badges */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        className="absolute -left-4 top-1/3 hidden lg:flex items-center gap-2 px-3 py-2 bg-white rounded-xl shadow-lg border border-zinc-200"
      >
        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
          <SparklesIcon className="w-4 h-4 text-violet-600" />
        </div>
        <div>
          <div className="text-xs font-semibold text-zinc-900">AnA 1.0</div>
          <div className="text-xs text-zinc-500">AI Co-Pilot Active</div>
        </div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.0, duration: 0.5 }}
        className="absolute -right-4 top-2/3 hidden lg:flex items-center gap-2 px-3 py-2 bg-white rounded-xl shadow-lg border border-zinc-200"
      >
        <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
          <CheckIcon className="w-4 h-4 text-green-600" />
        </div>
        <div>
          <div className="text-xs font-semibold text-zinc-900">Part 11 Verified</div>
          <div className="text-xs text-zinc-500">Audit trail active</div>
        </div>
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const LandingPage: React.FC = () => {
  const [, setLocation] = useLocation();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const { scrollYProgress } = useScroll();

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* ─── SCROLL PROGRESS BAR ─── */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-600 via-violet-500 to-blue-600 z-[60] origin-left"
        style={{ scaleX: scrollYProgress }}
      />

      {/* ─── HEADER / NAV ─── */}
      <header className="sticky top-0 z-50 bg-[#FAFAF9]/80 backdrop-blur-xl border-b border-zinc-200/60">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Logo />
            <span className="text-xl font-semibold text-zinc-900">Concept2Cure</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-zinc-600">
            <a href="#platform" className="hover:text-zinc-900 transition-colors">Platform</a>
            <a href="#features" className="hover:text-zinc-900 transition-colors">Solutions</a>
            <a href="#nano-banana" className="hover:text-zinc-900 transition-colors">Visual AI</a>
            <a href="#security" className="hover:text-zinc-900 transition-colors">Security</a>
            <a href="#pricing" className="hover:text-zinc-900 transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation('/concept2cure/demo')}
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg transition-colors"
            >
              <span className="flex h-1.5 w-1.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-500" />
              </span>
              Live Demo
            </button>
            <button
              onClick={() => setLocation('/concept2cure/login')}
              className="px-4 py-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={() => setLocation('/concept2cure/signup')}
              className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
            >
              Start Free Trial
            </button>
          </div>
        </div>
      </header>

      {/* ─── HERO ─── */}
      <section className="relative pt-20 pb-16 px-6 overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-blue-100/40 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] rounded-full bg-violet-100/30 blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 mb-8 rounded-full bg-gradient-to-r from-blue-50 to-violet-50 border border-blue-100/60"
          >
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            <span className="text-sm font-medium text-blue-700">Regulatory submissions in weeks, not months</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl sm:text-6xl md:text-7xl font-bold text-zinc-900 leading-[1.08] tracking-tight mb-6"
          >
            The AI platform that
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-violet-500 to-blue-600 bg-clip-text text-transparent">
              replaces your entire
            </span>
            <br />
            regulatory toolkit
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg sm:text-xl text-zinc-600 max-w-2xl mx-auto mb-4 leading-relaxed"
          >
            Stop juggling 12+ disconnected tools. Concept2Cure unifies deep research,
            document authoring, eCTD submission, and compliance into one AI-powered platform &mdash;
            saving teams $2M+ annually and cutting filing timelines by 68%.
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="text-sm text-zinc-500 mb-10"
          >
            FDA &middot; EMA &middot; PMDA &middot; NMPA &mdash; one platform, all agencies
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex items-center justify-center gap-4 flex-wrap mb-6"
          >
            <button
              onClick={() => setLocation('/concept2cure/demo')}
              className="group px-8 py-3.5 text-base font-medium text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 rounded-xl transition-all shadow-lg shadow-violet-600/25 hover:shadow-violet-600/40 flex items-center gap-2"
            >
              <span className="flex h-2 w-2 relative mr-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              </span>
              See It In Action <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={() => setLocation('/concept2cure/signup')}
              className="group px-8 py-3.5 text-base font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-all flex items-center gap-2"
            >
              Start Free Trial <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="text-xs text-zinc-400 mb-16"
          >
            No credit card required &middot; 14-day free trial &middot; SOC 2 &amp; 21 CFR Part 11 compliant
          </motion.p>

          {/* Hero Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto"
          >
            {HERO_STATS.map(s => (
              <div key={s.label} className="p-4 rounded-xl bg-white/70 backdrop-blur border border-zinc-200">
                <div className="text-2xl font-bold text-zinc-900"><AnimatedValue value={s.value} /></div>
                <div className="text-sm font-medium text-zinc-700">{s.label}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{s.sub}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── AGENCY TRUST BAR ─── */}
      <Section className="py-10 border-y border-zinc-200/60 bg-white/50">
        <div className="max-w-5xl mx-auto px-6">
          <motion.p variants={fadeUp} className="text-center text-xs font-semibold tracking-widest text-zinc-400 uppercase mb-6">
            Regulatory Coverage Across the World's Top Markets
          </motion.p>
          <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
            {[
              { flag: '\u{1F1FA}\u{1F1F8}', agency: 'FDA', name: 'United States' },
              { flag: '\u{1F1EA}\u{1F1FA}', agency: 'EMA', name: 'European Union' },
              { flag: '\u{1F1EF}\u{1F1F5}', agency: 'PMDA', name: 'Japan' },
              { flag: '\u{1F1E8}\u{1F1F3}', agency: 'NMPA', name: 'China' },
              { flag: '\u{1F1EC}\u{1F1E7}', agency: 'MHRA', name: 'United Kingdom' },
              { flag: '\u{1F1E6}\u{1F1FA}', agency: 'TGA', name: 'Australia' },
            ].map(m => (
              <div key={m.agency} className="flex items-center gap-2">
                <span className="text-xl">{m.flag}</span>
                <div>
                  <span className="text-sm font-semibold text-zinc-800">{m.agency}</span>
                  <span className="text-xs text-zinc-500 ml-1.5">{m.name}</span>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </Section>

      {/* ─── PLATFORM PREVIEW ─── */}
      <Section id="platform" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div variants={fadeUp} className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4">
              Your entire regulatory operation, unified
            </h2>
            <p className="text-lg text-zinc-600 max-w-2xl mx-auto">
              Mission Control gives you real-time visibility across every submission,
              every agent, and every deadline — in one screen.
            </p>
          </motion.div>
          <motion.div variants={fadeUp}>
            <PlatformMockup />
          </motion.div>
        </div>
      </Section>

      {/* ─── ROI & VALUE ─── */}
      <Section className="py-24 px-6 bg-gradient-to-b from-blue-50/50 to-white">
        <div className="max-w-6xl mx-auto">
          <motion.div variants={fadeUp} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-4 rounded-full bg-green-50 border border-green-100">
              <span className="text-sm font-medium text-green-700">Measurable ROI from Day 1</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4">
              The numbers speak for themselves
            </h2>
            <p className="text-lg text-zinc-600 max-w-2xl mx-auto">
              Teams using Concept2Cure see measurable impact within the first 90 days.
              Here's what our customers report on average.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {ROI_METRICS.map(m => (
              <motion.div
                key={m.label}
                variants={fadeUp}
                className="relative p-6 rounded-2xl bg-white border border-zinc-200 hover:border-green-200 hover:shadow-lg hover:shadow-green-600/5 transition-all duration-300 group"
              >
                <div className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-2 group-hover:text-green-700 transition-colors">
                  <AnimatedValue value={m.value} />
                </div>
                <div className="text-sm font-semibold text-zinc-800 mb-1">{m.label}</div>
                <div className="text-xs text-zinc-500 leading-relaxed">{m.detail}</div>
              </motion.div>
            ))}
          </div>

          {/* Value Calculator Banner */}
          <motion.div
            variants={fadeUp}
            className="p-8 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 text-white flex flex-col md:flex-row items-center justify-between gap-6"
          >
            <div>
              <h3 className="text-xl font-bold mb-2">Calculate Your ROI</h3>
              <p className="text-green-100 text-sm max-w-lg">
                The average 50-person regulatory team spends $3.8M/year on tools, CRO hours, and manual processes.
                Concept2Cure typically delivers 3-5x ROI within the first year.
              </p>
            </div>
            <button
              onClick={() => setLocation('/concept2cure/demo')}
              className="whitespace-nowrap px-6 py-3 text-sm font-medium text-green-700 bg-white hover:bg-green-50 rounded-xl transition-all shadow-md flex items-center gap-2"
            >
              See Your Savings <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        </div>
      </Section>

      {/* ─── HOW IT WORKS ─── */}
      <Section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div variants={fadeUp} className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4">
              Four steps to faster submissions
            </h2>
            <p className="text-lg text-zinc-600 max-w-2xl mx-auto">
              From data ingestion to gateway submission — Concept2Cure handles the heavy lifting
              so your team can focus on science, not paperwork.
            </p>
          </motion.div>

          <div className="relative">
            {/* Connecting line */}
            <div className="absolute left-[28px] top-10 bottom-10 w-[2px] bg-gradient-to-b from-blue-200 via-violet-200 to-green-200 hidden md:block" />

            <div className="space-y-8">
              {HOW_IT_WORKS_STEPS.map((step, i) => (
                <motion.div
                  key={step.step}
                  variants={fadeUp}
                  className="flex items-start gap-6"
                >
                  <div className={`relative z-10 w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg flex-shrink-0 ${
                    step.color === 'blue' ? 'bg-blue-600 shadow-blue-600/30' :
                    step.color === 'violet' ? 'bg-violet-600 shadow-violet-600/30' :
                    step.color === 'indigo' ? 'bg-indigo-600 shadow-indigo-600/30' :
                    'bg-green-600 shadow-green-600/30'
                  }`}>
                    {step.step}
                  </div>
                  <div className="flex-1 pb-2">
                    <h3 className="text-xl font-semibold text-zinc-900 mb-2">{step.title}</h3>
                    <p className="text-zinc-600 leading-relaxed">{step.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.div variants={fadeUp} className="text-center mt-12">
            <button
              onClick={() => setLocation('/concept2cure/demo')}
              className="group px-8 py-3.5 text-base font-medium text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 rounded-xl transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2 mx-auto"
            >
              <SparklesIcon className="w-4 h-4" />
              Try the Interactive Demo
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </motion.div>
        </div>
      </Section>

      {/* ─── NARRATIVE / LIFECYCLE ─── */}
      <Section className="py-20 px-6 bg-gradient-to-b from-zinc-900 to-zinc-800 text-white">
        <div className="max-w-5xl mx-auto">
          <motion.div variants={fadeUp} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-4 rounded-full bg-white/10 border border-white/10">
              <span className="text-sm font-medium text-blue-300">The only platform built for the full regulatory lifecycle</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Don't just assemble data.<br />
              <span className="text-blue-400">Tell the story of your therapeutic.</span>
            </h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              From preclinical research through post-market surveillance, Concept2Cure manages
              your regulatory content across the entire lifecycle — in minutes, not months.
            </p>
          </motion.div>

          {/* Lifecycle stages */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-12">
            {[
              { stage: 'Discovery', desc: 'Deep research & intelligence', active: true },
              { stage: 'Preclinical', desc: 'CMC & protocol design', active: true },
              { stage: 'IND/CTA', desc: 'First-in-human filings', active: true },
              { stage: 'Clinical', desc: 'CSR & amendment mgmt', active: true },
              { stage: 'NDA/MAA', desc: 'Global submissions', active: true },
            ].map((s, i) => (
              <motion.div
                key={s.stage}
                variants={fadeIn}
                className="relative p-4 rounded-xl bg-white/5 border border-white/10 text-center group hover:bg-white/10 transition-all"
              >
                {i < 4 && <div className="absolute -right-2 top-1/2 -translate-y-1/2 text-zinc-600 hidden md:block">&rarr;</div>}
                <div className="text-sm font-semibold text-white mb-1">{s.stage}</div>
                <div className="text-xs text-zinc-400">{s.desc}</div>
                <div className="mt-2 w-full h-1 rounded-full bg-gradient-to-r from-blue-500 to-violet-500 opacity-60" />
              </motion.div>
            ))}
          </motion.div>

          {/* Tool consolidation */}
          <motion.div variants={fadeUp} className="text-center mb-8">
            <p className="text-sm text-zinc-500 uppercase tracking-widest font-semibold mb-6">
              Replace 12+ disconnected tools
            </p>
          </motion.div>

          <motion.div variants={fadeUp} className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mb-10">
            {CONSOLIDATION_TOOLS.map((tool) => (
              <motion.div
                key={tool}
                variants={fadeIn}
                className="relative px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-xs text-zinc-500 text-center"
              >
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500/80 flex items-center justify-center text-xs text-white">&#10005;</span>
                {tool}
              </motion.div>
            ))}
          </motion.div>

          <motion.div variants={fadeUp} className="text-center">
            <div className="inline-flex items-center gap-3 mb-6">
              <div className="w-12 h-[1px] bg-zinc-600" />
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              <div className="w-12 h-[1px] bg-zinc-600" />
            </div>
            <div className="max-w-lg mx-auto p-8 rounded-2xl bg-gradient-to-br from-blue-600/20 to-violet-600/20 border border-blue-500/30 shadow-lg shadow-blue-500/10">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Logo />
                <span className="text-2xl font-bold text-white">Concept2Cure</span>
              </div>
              <p className="text-blue-200 text-sm mb-3">
                One AI-native platform. One source of truth. One connected workspace.
              </p>
              <p className="text-zinc-400 text-xs">
                Deep research &middot; Document authoring &middot; CSR builder &middot; CTD assembly &middot; eCTD export &middot; CMC platform &middot; Compliance &middot; Post-market
              </p>
            </div>
          </motion.div>
        </div>
      </Section>

      {/* ─── FEATURES ─── */}
      <Section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div variants={fadeUp} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-4 rounded-full bg-blue-50 border border-blue-100">
              <span className="text-sm font-medium text-blue-700">Core Capabilities</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4">
              Create submission-ready content with<br />
              speed, structure, and confidence
            </h2>
            <p className="text-lg text-zinc-600 max-w-2xl mx-auto">
              Concept2Cure adapts to evolving data, helping your team generate, revise, and organize
              regulatory content that's ready for review — not someday, but today.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => {
              const Icon = IconMap[f.icon];
              return (
                <motion.div
                  key={f.title}
                  variants={fadeUp}
                  className="group p-6 rounded-2xl bg-white border border-zinc-200 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-600/5 transition-all duration-300"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                      {Icon && <Icon className="w-5 h-5 text-blue-600" />}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-blue-600">{f.stat}</div>
                      <div className="text-xs text-zinc-500 uppercase tracking-wide">{f.statLabel}</div>
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-zinc-900 mb-2">{f.title}</h3>
                  <p className="text-sm text-zinc-600 leading-relaxed">{f.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* ─── COMPREHENSIVE PLATFORM MODULES ─── */}
      <Section className="py-24 px-6 bg-white border-t border-zinc-200/60">
        <div className="max-w-6xl mx-auto">
          <motion.div variants={fadeUp} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-4 rounded-full bg-zinc-100 border border-zinc-200">
              <span className="text-sm font-medium text-zinc-700">86+ integrated modules across 6 strategic groups</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4">
              The complete regulatory platform
            </h2>
            <p className="text-lg text-zinc-600 max-w-2xl mx-auto">
              Every module your team needs — from first literature search through post-market surveillance —
              connected in one AI-native workspace. No integrations. No data silos.
            </p>
          </motion.div>

          <div className="space-y-12">
            {PLATFORM_MODULES.map(cat => (
              <motion.div key={cat.category} variants={fadeUp}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-blue-500 to-violet-500" />
                  <h3 className="text-lg font-bold text-zinc-900">{cat.category}</h3>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {cat.modules.map(mod => (
                    <motion.div
                      key={mod.name}
                      variants={fadeIn}
                      className="p-5 rounded-xl bg-zinc-50 border border-zinc-200 hover:bg-white hover:border-blue-200 hover:shadow-md transition-all duration-200 group"
                    >
                      <h4 className="text-sm font-semibold text-zinc-900 mb-2 group-hover:text-blue-700 transition-colors">{mod.name}</h4>
                      <p className="text-xs text-zinc-500 leading-relaxed">{mod.desc}</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div variants={fadeUp} className="text-center mt-12 p-8 rounded-2xl bg-gradient-to-r from-zinc-50 to-blue-50/50 border border-zinc-200">
            <p className="text-lg font-semibold text-zinc-900 mb-2">
              All modules included in every plan. No upsells. No add-ons.
            </p>
            <p className="text-sm text-zinc-500 mb-4">
              From Day 1, your team gets access to the entire platform.
            </p>
            <button
              onClick={() => setLocation('/concept2cure/demo')}
              className="group inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md"
            >
              Explore All Modules <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </motion.div>
        </div>
      </Section>

      {/* ─── AI AGENTS ─── */}
      <Section className="py-24 px-6 bg-gradient-to-br from-violet-50/50 via-white to-blue-50/50">
        <div className="max-w-6xl mx-auto">
          <motion.div variants={fadeUp} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-4 rounded-full bg-violet-50 border border-violet-100">
              <SparklesIcon className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-medium text-violet-700">Powered by AI</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4">
              An AI agent swarm that never sleeps
            </h2>
            <p className="text-lg text-zinc-600 max-w-2xl mx-auto">
              AnA 1.0 orchestrates a swarm of specialized agents — Coordinator, Drafter, Researcher,
              Statistician, QC, and Compliance — all working in parallel while your team focuses on strategy.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* Agent Grid */}
            <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {AI_CAPABILITIES.map((agent) => (
                <motion.div
                  key={agent.name}
                  variants={fadeUp}
                  className="p-3.5 rounded-xl bg-white border border-zinc-200 hover:border-violet-200 transition-all"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs font-semibold text-zinc-900">{agent.name}</span>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed">{agent.desc}</p>
                </motion.div>
              ))}
            </motion.div>

            {/* AnA + SnowGlobe + Dr. Sage */}
            <motion.div variants={fadeUp} className="space-y-4">
              <div className="p-6 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 text-white">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <SparklesIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="font-semibold">AnA 1.0</div>
                    <div className="text-xs text-white/70">Regulatory Intelligence Co-Pilot</div>
                  </div>
                </div>
                <p className="text-sm text-white/90 leading-relaxed">
                  Your always-on regulatory strategist. AnA orchestrates the entire agent swarm,
                  drafts submission documents, synthesizes evidence, and provides multi-agency
                  regulatory guidance across FDA, EMA, PMDA, NMPA, MHRA, and TGA.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-900 to-violet-900 text-white border border-indigo-700/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-sm">AnA SnowGlobe</div>
                    <div className="text-xs text-indigo-300">Predictive Intelligence Engine</div>
                  </div>
                </div>
                <p className="text-xs text-indigo-200 leading-relaxed">
                  Submission success prediction, pathway simulations, what-if analysis, and regulatory
                  outcome modeling. See the future of your filing before you file.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-zinc-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-zinc-900">Dr. Sage</div>
                    <div className="text-xs text-zinc-500">Academy &amp; Contextual Guidance</div>
                  </div>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Just-in-time regulatory training with learning paths, certifications, and micro-missions.
                  Reduces onboarding from months to weeks and keeps teams current on evolving requirements.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </Section>

      {/* ─── NANO BANANA VISUAL AI SHOWCASE ─── */}
      <Section id="nano-banana" className="py-24 px-6 bg-gradient-to-b from-amber-50/40 to-white">
        <div className="max-w-6xl mx-auto">
          <motion.div variants={fadeUp} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-4 rounded-full bg-amber-50 border border-amber-200">
              <span className="text-sm font-medium text-amber-700">Powered by Google Gemini</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4">
              Nano Banana Visual AI
            </h2>
            <p className="text-lg text-zinc-600 max-w-2xl mx-auto">
              Generate publication-ready infographics, regulatory diagrams, and slide decks
              in seconds — directly inside your workflow.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: 'Regulatory Infographics',
                desc: 'Generate 4K compliance visuals, safety profiles, and submission status dashboards with accurate text rendering.',
                icon: '📊',
              },
              {
                title: 'Slide Decks on Demand',
                desc: 'Create board presentations, advisory committee briefings, and investor decks — auto-generated PPTX with AI cover images.',
                icon: '📑',
              },
              {
                title: 'Scientific Figures',
                desc: 'Study design diagrams, patient flow charts, CONSORT diagrams, and pharmacokinetic curves — all AI-generated from your data.',
                icon: '🧬',
              },
            ].map(card => (
              <motion.div
                key={card.title}
                variants={fadeUp}
                className="group p-8 rounded-2xl border-2 border-amber-100 hover:border-amber-300 bg-white hover:shadow-xl hover:shadow-amber-600/10 transition-all duration-300"
              >
                <div className="text-4xl mb-4">{card.icon}</div>
                <h3 className="text-lg font-semibold text-zinc-900 mb-2">{card.title}</h3>
                <p className="text-sm text-zinc-600 leading-relaxed">{card.desc}</p>
              </motion.div>
            ))}
          </div>

          <motion.div variants={fadeUp} className="mt-12 text-center">
            <div className="inline-flex flex-wrap gap-3 justify-center">
              {['4K Resolution', 'Text-Accurate', 'Multi-Image Composition', 'PPTX Export', 'Conversational Editing'].map(tag => (
                <span key={tag} className="px-3 py-1.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  {tag}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </Section>

      {/* ─── SOLUTIONS BY PERSONA ─── */}
      <Section id="solutions" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div variants={fadeUp} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-4 rounded-full bg-blue-50 border border-blue-100">
              <span className="text-sm font-medium text-blue-700">Built for your team</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4">
              Solutions that scale with you
            </h2>
            <p className="text-lg text-zinc-600 max-w-2xl mx-auto">
              Whether you're a 3-person biotech or a global CRO, Concept2Cure adapts to your workflows
              and grows with your submission volume.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {SOLUTIONS_BY_PERSONA.map(s => (
              <motion.div
                key={s.persona}
                variants={fadeUp}
                className={`group p-8 rounded-2xl border-2 transition-all duration-300 hover:shadow-xl ${
                  s.color === 'blue' ? 'border-blue-100 hover:border-blue-300 bg-gradient-to-b from-blue-50/30 to-white hover:shadow-blue-600/10' :
                  s.color === 'violet' ? 'border-violet-100 hover:border-violet-300 bg-gradient-to-b from-violet-50/30 to-white hover:shadow-violet-600/10' :
                  'border-indigo-100 hover:border-indigo-300 bg-gradient-to-b from-indigo-50/30 to-white hover:shadow-indigo-600/10'
                }`}
              >
                <div className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold mb-4 ${
                  s.color === 'blue' ? 'bg-blue-100 text-blue-700' :
                  s.color === 'violet' ? 'bg-violet-100 text-violet-700' :
                  'bg-indigo-100 text-indigo-700'
                }`}>
                  {s.persona}
                </div>
                <h3 className="text-xl font-bold text-zinc-900 mb-3">{s.tagline}</h3>
                <p className="text-sm text-zinc-600 leading-relaxed mb-6">{s.description}</p>
                <ul className="space-y-2">
                  {s.stats.map(stat => (
                    <li key={stat} className="flex items-center gap-2 text-sm text-zinc-700">
                      <CheckIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                      {stat}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── SPEED / ACCURACY / COLLABORATION PILLARS ─── */}
      <Section className="py-20 px-6 bg-white border-y border-zinc-200/60">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-10">
            {[
              {
                title: 'Hyper-Speed',
                description: 'Generate submission-ready text, tables, and figures at unprecedented speed. What took weeks now takes hours.',
                gradient: 'from-blue-600 to-cyan-500',
                iconPath: 'M13 10V3L4 14h7v7l9-11h-7z',
              },
              {
                title: 'Pinpoint Accuracy',
                description: 'Every claim traced to source data. Automated consistency checks, cross-reference validation, and real-time flagging of potential issues.',
                gradient: 'from-violet-600 to-purple-500',
                iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
              },
              {
                title: 'Seamless Collaboration',
                description: 'Intuitive templates, real-time co-editing, and progress tracking keep teams aligned. No bottlenecks — just smooth, audited workflows.',
                gradient: 'from-green-600 to-emerald-500',
                iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
              },
            ].map(pillar => (
              <motion.div key={pillar.title} variants={fadeUp} className="text-center">
                <div className={`w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br ${pillar.gradient} flex items-center justify-center shadow-lg`}>
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={pillar.iconPath} />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-zinc-900 mb-2">{pillar.title}</h3>
                <p className="text-sm text-zinc-600 leading-relaxed">{pillar.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── COMPLIANCE & SECURITY ─── */}
      <Section id="security" className="py-24 px-6 bg-zinc-900 text-white">
        <div className="max-w-6xl mx-auto">
          <motion.div variants={fadeUp} className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Enterprise security. Regulatory compliance. <span className="text-blue-400">Built in.</span>
            </h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              Not bolted on. Every feature is built from the ground up for 21 CFR Part 11,
              HIPAA, SOC 2, and GDPR compliance.
            </p>
          </motion.div>

          <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {COMPLIANCE_BADGES.map(b => (
              <motion.div
                key={b.label}
                variants={fadeUp}
                className="p-5 rounded-xl bg-white/5 border border-white/10 hover:border-blue-500/30 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center mb-3">
                  <CheckIcon className="w-5 h-5 text-blue-400" />
                </div>
                <div className="text-sm font-semibold text-white mb-1">{b.label}</div>
                <div className="text-xs text-zinc-400">{b.desc}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </Section>

      {/* ─── TESTIMONIALS ─── */}
      <Section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div variants={fadeUp} className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4">
              Trusted by regulatory teams worldwide
            </h2>
            <p className="text-lg text-zinc-600">
              Life sciences companies accelerating their path from concept to cure.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="p-6 rounded-2xl bg-white border border-zinc-200 hover:shadow-lg transition-all duration-300"
              >
                <div className="inline-flex items-center gap-1 px-2.5 py-1 mb-4 rounded-full bg-blue-50 border border-blue-100">
                  <span className="text-xs font-semibold text-blue-700">{t.metric}</span>
                </div>
                <blockquote className="text-sm text-zinc-700 leading-relaxed mb-6">
                  "{t.quote}"
                </blockquote>
                <div className="flex items-center gap-3 pt-4 border-t border-zinc-200">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold">
                    {t.author.split(' ').map(w => w[0]).join('')}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-zinc-900">{t.author}</div>
                    <div className="text-xs text-zinc-500">{t.company}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── PRICING ─── */}
      <Section id="pricing" className="py-24 px-6 bg-white border-t border-zinc-200/60">
        <div className="max-w-6xl mx-auto">
          <motion.div variants={fadeUp} className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4">Simple, transparent pricing</h2>
            <p className="text-lg text-zinc-600 mb-8">
              No sales calls. No contracts. Start free and upgrade when you're ready.
            </p>
            <div className="inline-flex items-center gap-1 p-1 bg-zinc-100 rounded-lg">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  billingCycle === 'monthly' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  billingCycle === 'annual' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600'
                }`}
              >
                Annual <span className="text-green-600 text-xs ml-1">Save 15%</span>
              </button>
            </div>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PRICING_TIERS.map(tier => (
              <motion.div
                key={tier.name}
                variants={fadeUp}
                className={`relative p-6 rounded-2xl border-2 transition-all ${
                  tier.highlighted
                    ? 'border-blue-600 bg-blue-50/30 shadow-xl shadow-blue-600/10'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-md'
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-full">
                    Most Popular
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-zinc-900">{tier.name}</h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-zinc-900">
                      {tier.price === 'Custom' || tier.price === 'Free'
                        ? tier.price
                        : billingCycle === 'annual'
                          ? `$${Math.round(parseInt(tier.price.replace(/\D/g, '')) * 0.85)}`
                          : tier.price}
                    </span>
                    {tier.period && (
                      <span className="text-sm text-zinc-500">{tier.period}</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-zinc-600">{tier.description}</p>
                </div>
                <ul className="space-y-3 mb-8">
                  {tier.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-zinc-700">
                      <CheckIcon className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => {
                    if (tier.tier === 'enterprise') {
                      window.location.href = 'mailto:sales@concept2cure.pro?subject=Enterprise%20Inquiry';
                    } else {
                      setLocation(`/signup?plan=${tier.tier}`);
                    }
                  }}
                  className={`w-full py-2.5 px-4 text-sm font-medium rounded-xl transition-all ${
                    tier.highlighted
                      ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-600/20'
                      : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                  }`}
                >
                  {tier.cta}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── FINAL CTA ─── */}
      <Section className="py-24 px-6 bg-gradient-to-br from-blue-600 via-violet-600 to-blue-700 text-white relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 pointer-events-none opacity-10">
          <div className="absolute top-10 left-10 w-64 h-64 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-10 right-10 w-80 h-80 rounded-full bg-white/10 blur-3xl" />
        </div>

        <div className="relative max-w-3xl mx-auto text-center">
          <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-bold mb-4">
            Stop paying for 12 tools that don't talk to each other
          </motion.h2>
          <motion.p variants={fadeUp} className="text-lg text-white/80 mb-4">
            Join hundreds of regulatory teams saving $2M+ annually with Concept2Cure.
          </motion.p>
          <motion.p variants={fadeUp} className="text-sm text-white/60 mb-10">
            14-day free trial &middot; No credit card &middot; SOC 2 &amp; 21 CFR Part 11 from day one
          </motion.p>
          <motion.div variants={fadeUp} className="flex items-center justify-center gap-4 flex-wrap">
            <button
              onClick={() => setLocation('/concept2cure/demo')}
              className="group px-8 py-3.5 text-base font-medium text-blue-600 bg-white hover:bg-blue-50 rounded-xl transition-all shadow-lg flex items-center gap-2"
            >
              <span className="flex h-2 w-2 relative mr-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
              </span>
              See the Demo <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={() => setLocation('/concept2cure/signup')}
              className="px-8 py-3.5 text-base font-medium text-white border-2 border-white/30 hover:border-white/60 rounded-xl transition-all"
            >
              Start Free Trial
            </button>
          </motion.div>
        </div>
      </Section>

      {/* ─── FOOTER ─── */}
      <footer className="py-12 px-6 bg-zinc-900 text-zinc-400">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Logo />
                <span className="font-semibold text-white">Concept2Cure</span>
              </div>
              <p className="text-sm text-zinc-500 leading-relaxed">
                AI-powered regulatory intelligence for life sciences. From concept to cure, faster.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-zinc-400 mb-3">Platform</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Solutions</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#security" className="hover:text-white transition-colors">Security</a></li>
                <li><button onClick={() => setLocation('/concept2cure/demo')} className="hover:text-white transition-colors">Interactive Demo</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-zinc-400 mb-3">Regulatory</h4>
              <ul className="space-y-2 text-sm">
                <li>FDA (510(k), IND, NDA)</li>
                <li>EMA (MAA, CTA)</li>
                <li>PMDA (CTN)</li>
                <li>NMPA (IND, NDA)</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-zinc-400 mb-3">Compliance</h4>
              <ul className="space-y-2 text-sm">
                <li>21 CFR Part 11</li>
                <li>SOC 2 Type II</li>
                <li>HIPAA Compliant</li>
                <li>GDPR Ready</li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-zinc-500">
              &copy; {new Date().getFullYear()} Concept2Cure, Inc. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm text-zinc-500">
              <span>Terms of Service</span>
              <span>Privacy Policy</span>
              <span>Security</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
