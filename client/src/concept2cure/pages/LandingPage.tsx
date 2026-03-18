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
  { value: '4', label: 'Global Agencies', sub: 'FDA · EMA · PMDA · NMPA' },
  { value: '12+', label: 'AI Agents', sub: 'Working in parallel' },
  { value: '75%', label: 'Faster Submissions', sub: 'vs. manual workflows' },
  { value: '21 CFR', label: 'Part 11 Compliant', sub: 'Enterprise-grade' },
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

const AI_CAPABILITIES = [
  { name: 'Predicate Researcher', desc: 'Finds and analyzes predicate devices across FDA databases' },
  { name: 'Evidence Agent', desc: 'Gathers and validates clinical evidence from literature' },
  { name: 'Protocol Analyzer', desc: 'Reviews study protocols for regulatory compliance' },
  { name: 'Document Drafter', desc: 'AI co-writes submission-ready regulatory documents' },
  { name: 'QC Agent', desc: 'Automated quality checks across all submission modules' },
  { name: 'Compliance Agent', desc: 'Monitors regulatory requirements and flags gaps' },
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
                <div key={s.name} className="flex items-center gap-4 p-3 bg-white rounded-lg border border-zinc-100">
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
        className="absolute -left-4 top-1/3 hidden lg:flex items-center gap-2 px-3 py-2 bg-white rounded-xl shadow-lg border border-zinc-100"
      >
        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
          <SparklesIcon className="w-4 h-4 text-violet-600" />
        </div>
        <div>
          <div className="text-xs font-semibold text-zinc-900">AnA 1.0</div>
          <div className="text-[10px] text-zinc-500">AI Co-Pilot Active</div>
        </div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.0, duration: 0.5 }}
        className="absolute -right-4 top-2/3 hidden lg:flex items-center gap-2 px-3 py-2 bg-white rounded-xl shadow-lg border border-zinc-100"
      >
        <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
          <CheckIcon className="w-4 h-4 text-green-600" />
        </div>
        <div>
          <div className="text-xs font-semibold text-zinc-900">Part 11 Verified</div>
          <div className="text-[10px] text-zinc-500">Audit trail active</div>
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
            <a href="#features" className="hover:text-zinc-900 transition-colors">Features</a>
            <a href="#security" className="hover:text-zinc-900 transition-colors">Security</a>
            <a href="#pricing" className="hover:text-zinc-900 transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation('/concept2cure/demo')}
              className="hidden sm:inline-flex px-4 py-2 text-sm font-medium text-violet-700 hover:text-violet-900 transition-colors"
            >
              Live Demo
            </button>
            <button
              onClick={() => setLocation('/login')}
              className="px-4 py-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={() => setLocation('/signup')}
              className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
            >
              Get Started
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
            <span className="text-sm font-medium text-blue-700">The regulatory intelligence platform for life sciences</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl sm:text-6xl md:text-7xl font-bold text-zinc-900 leading-[1.08] tracking-tight mb-6"
          >
            From concept to cure,
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-violet-500 to-blue-600 bg-clip-text text-transparent">
              10x faster
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg sm:text-xl text-zinc-600 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            One AI-powered platform replaces your entire regulatory toolkit.
            Deep research, document authoring, eCTD submission, and compliance &mdash;
            unified for FDA, EMA, PMDA, and NMPA.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex items-center justify-center gap-4 flex-wrap mb-16"
          >
            <button
              onClick={() => setLocation('/signup')}
              className="group px-8 py-3.5 text-base font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 flex items-center gap-2"
            >
              Start Free <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={() => setLocation('/concept2cure/demo')}
              className="group px-8 py-3.5 text-base font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-all flex items-center gap-2"
            >
              <span className="flex h-2 w-2 relative mr-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
              </span>
              Watch Interactive Demo
            </button>
          </motion.div>

          {/* Hero Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto"
          >
            {HERO_STATS.map(s => (
              <div key={s.label} className="p-4 rounded-xl bg-white/70 backdrop-blur border border-zinc-100">
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

      {/* ─── CONSOLIDATION SECTION ─── */}
      <Section className="py-20 px-6 bg-gradient-to-b from-zinc-900 to-zinc-800 text-white">
        <div className="max-w-5xl mx-auto">
          <motion.div variants={fadeUp} className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-4 rounded-full bg-white/10 border border-white/10">
              <span className="text-sm font-medium text-blue-300">Why teams switch to Concept2Cure</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Replace <span className="text-blue-400">12+ disconnected tools</span><br />
              with one intelligent platform
            </h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              Your team is juggling too many tools. Regulatory submissions shouldn't require
              a dozen logins and manual data transfers.
            </p>
          </motion.div>

          <motion.div variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-10">
            {CONSOLIDATION_TOOLS.map((tool) => (
              <motion.div
                key={tool}
                variants={fadeIn}
                className="relative px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-zinc-400"
              >
                <span className="absolute top-2 right-2 text-red-400/60 text-xs">&#10005;</span>
                {tool}
              </motion.div>
            ))}
          </motion.div>

          <motion.div variants={fadeUp} className="text-center">
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-10 h-[2px] bg-zinc-600" />
              <span className="text-zinc-500 text-sm">becomes</span>
              <div className="w-10 h-[2px] bg-zinc-600" />
            </div>
            <div className="max-w-lg mx-auto p-6 rounded-2xl bg-gradient-to-br from-blue-600/20 to-violet-600/20 border border-blue-500/20">
              <div className="flex items-center justify-center gap-3 mb-3">
                <Logo />
                <span className="text-2xl font-bold text-white">Concept2Cure</span>
              </div>
              <p className="text-blue-200 text-sm">
                One platform. One AI co-pilot. One source of truth.<br />
                <span className="text-zinc-400">From deep research to eCTD submission to post-market surveillance.</span>
              </p>
            </div>
          </motion.div>
        </div>
      </Section>

      {/* ─── FEATURES ─── */}
      <Section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div variants={fadeUp} className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4">
              Everything you need for global regulatory success
            </h2>
            <p className="text-lg text-zinc-600 max-w-2xl mx-auto">
              From deep research to eCTD export, one platform replaces your entire regulatory toolkit.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => {
              const Icon = IconMap[f.icon];
              return (
                <motion.div
                  key={f.title}
                  variants={fadeUp}
                  className="group p-6 rounded-2xl bg-white border border-zinc-100 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-600/5 transition-all duration-300"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                      {Icon && <Icon className="w-5 h-5 text-blue-600" />}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-blue-600">{f.stat}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wide">{f.statLabel}</div>
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

      {/* ─── AI AGENTS ─── */}
      <Section className="py-24 px-6 bg-gradient-to-br from-violet-50/50 via-white to-blue-50/50">
        <div className="max-w-6xl mx-auto">
          <motion.div variants={fadeUp} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-4 rounded-full bg-violet-50 border border-violet-100">
              <SparklesIcon className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-medium text-violet-700">Powered by AI</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4">
              12 AI agents working in parallel
            </h2>
            <p className="text-lg text-zinc-600 max-w-2xl mx-auto">
              AnA 1.0, your regulatory intelligence co-pilot, orchestrates a swarm of
              specialized agents that handle research, drafting, QC, and compliance simultaneously.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* Agent Grid */}
            <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3">
              {AI_CAPABILITIES.map((agent) => (
                <motion.div
                  key={agent.name}
                  variants={fadeUp}
                  className="p-4 rounded-xl bg-white border border-zinc-100 hover:border-violet-200 transition-all"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs font-semibold text-zinc-900">{agent.name}</span>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed">{agent.desc}</p>
                </motion.div>
              ))}
            </motion.div>

            {/* AnA + Dr. Sage */}
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
                  Your always-on regulatory strategist. AnA understands FDA, EMA, PMDA, and NMPA
                  requirements, drafts submission documents, and orchestrates the entire agent swarm
                  to accelerate your regulatory timeline.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-white border border-zinc-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-900">Dr. Sage</div>
                    <div className="text-xs text-zinc-500">Contextual Training & Guidance</div>
                  </div>
                </div>
                <p className="text-sm text-zinc-600 leading-relaxed">
                  Just-in-time regulatory training and contextual help. Dr. Sage guides your team
                  through complex regulations, reduces onboarding from months to weeks, and ensures
                  everyone stays current on evolving requirements.
                </p>
              </div>
            </motion.div>
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
                className="p-6 rounded-2xl bg-white border border-zinc-100 hover:shadow-lg transition-all duration-300"
              >
                <div className="inline-flex items-center gap-1 px-2.5 py-1 mb-4 rounded-full bg-blue-50 border border-blue-100">
                  <span className="text-xs font-semibold text-blue-700">{t.metric}</span>
                </div>
                <blockquote className="text-sm text-zinc-700 leading-relaxed mb-6">
                  "{t.quote}"
                </blockquote>
                <div className="flex items-center gap-3 pt-4 border-t border-zinc-100">
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
            Ready to accelerate your regulatory strategy?
          </motion.h2>
          <motion.p variants={fadeUp} className="text-lg text-white/80 mb-10">
            Join hundreds of life sciences teams using Concept2Cure to go from concept to cure faster.
            Start free — no credit card required.
          </motion.p>
          <motion.div variants={fadeUp} className="flex items-center justify-center gap-4 flex-wrap">
            <button
              onClick={() => setLocation('/signup')}
              className="group px-8 py-3.5 text-base font-medium text-blue-600 bg-white hover:bg-blue-50 rounded-xl transition-all shadow-lg flex items-center gap-2"
            >
              Get Started Free <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={() => setLocation('/concept2cure/demo')}
              className="px-8 py-3.5 text-base font-medium text-white border-2 border-white/30 hover:border-white/60 rounded-xl transition-all"
            >
              Watch Interactive Demo
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
              <h4 className="text-sm font-semibold text-zinc-300 mb-3">Platform</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#security" className="hover:text-white transition-colors">Security</a></li>
                <li><button onClick={() => setLocation('/concept2cure/demo')} className="hover:text-white transition-colors">Interactive Demo</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-zinc-300 mb-3">Regulatory</h4>
              <ul className="space-y-2 text-sm">
                <li>FDA (510(k), IND, NDA)</li>
                <li>EMA (MAA, CTA)</li>
                <li>PMDA (CTN)</li>
                <li>NMPA (IND, NDA)</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-zinc-300 mb-3">Compliance</h4>
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
