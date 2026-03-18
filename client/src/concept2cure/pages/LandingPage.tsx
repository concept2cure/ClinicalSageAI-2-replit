/**
 * @fileoverview Public DTC Landing Page
 * @module concept2cure/pages/LandingPage
 *
 * Self-service SaaS gateway — renders at / when unauthenticated.
 * Modeled after claude.ai's clean, conversion-focused approach.
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';

// ═══════════════════════════════════════════════════════════════════════════════
// PRICING TIERS (mirrors server/services/billing.ts DTC_PRICING)
// ═══════════════════════════════════════════════════════════════════════════════

const PRICING_TIERS = [
  {
    name: 'Researcher',
    price: 'Free',
    period: '',
    description: 'For individual researchers exploring regulatory intelligence',
    features: [
      '1 user',
      '2 projects',
      '5 deep research queries / month',
      'CSR search & analysis',
      'Basic AI chat',
      'Community support',
    ],
    cta: 'Get Started Free',
    tier: 'free',
    highlighted: false,
  },
  {
    name: 'Startup Biotech',
    price: '$499',
    period: '/month',
    description: 'For emerging biotechs building their first regulatory dossier',
    features: [
      'Up to 5 users',
      '10 projects',
      '50 deep research queries / month',
      'Full CSR builder',
      'Deep Research with ClinicalTrials.gov + PubMed',
      'eCTD authoring',
      'Intelligence hub access',
      'Email support',
    ],
    cta: 'Start 14-Day Free Trial',
    tier: 'standard',
    highlighted: true,
  },
  {
    name: 'Growth',
    price: '$1,499',
    period: '/month',
    description: 'For growing companies with multi-market submissions',
    features: [
      'Up to 25 users',
      '50 projects',
      '200 deep research queries / month',
      'Full CTD builder (all global agencies)',
      'Veeva Vault & Medidata connectors',
      'FDA, EMA, PMDA, NMPA templates',
      'Multi-agency eCTD export',
      'Priority support',
    ],
    cta: 'Start 14-Day Free Trial',
    tier: 'professional',
    highlighted: false,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For large pharma and CROs with enterprise-scale needs',
    features: [
      'Unlimited users',
      'Unlimited projects',
      'Unlimited deep research',
      'All connectors + custom integrations',
      'SSO & advanced security',
      'Dedicated account manager',
      'Custom SLA',
      '21 CFR Part 11 audit package',
    ],
    cta: 'Contact Sales',
    tier: 'enterprise',
    highlighted: false,
  },
];

const FEATURES = [
  {
    title: 'Deep Research Engine',
    description: 'Automated intelligence gathering from ClinicalTrials.gov, PubMed, FDA, EMA, PMDA, and NMPA. Connectors to Veeva Vault and Medidata populate your workspace automatically.',
    icon: 'search',
  },
  {
    title: 'Full CSR Builder',
    description: 'Generate complete ICH E3 Clinical Study Reports with AI-powered section drafting, cross-referencing, and compliance validation.',
    icon: 'file',
  },
  {
    title: 'Global CTD Builder',
    description: 'Build Common Technical Documents for FDA, EMA, PMDA, and NMPA with region-specific Module 1 templates and eCTD export.',
    icon: 'globe',
  },
  {
    title: 'Regulatory Intelligence',
    description: 'Real-time monitoring of regulatory signals, precedent analysis, and AI-powered insights to guide your strategy.',
    icon: 'brain',
  },
  {
    title: 'eCTD Authoring & Export',
    description: 'Collaborative document authoring with SmartTags, version control, provenance tracking, and one-click eCTD v4 package export.',
    icon: 'layers',
  },
  {
    title: 'Enterprise Compliance',
    description: 'FDA 21 CFR Part 11 compliant with immutable audit trails, e-signatures, role-based access, and hash chain validation.',
    icon: 'shield',
  },
];

const MARKETS = [
  { flag: 'US', name: 'United States', agency: 'FDA' },
  { flag: 'EU', name: 'European Union', agency: 'EMA' },
  { flag: 'JP', name: 'Japan', agency: 'PMDA' },
  { flag: 'CN', name: 'China', agency: 'NMPA' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// ICON COMPONENTS
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

// ═══════════════════════════════════════════════════════════════════════════════
// LOGO
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const LandingPage: React.FC = () => {
  const [, setLocation] = useLocation();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* ─── HEADER / NAV ─── */}
      <header className="sticky top-0 z-50 bg-[#FAFAF9]/80 backdrop-blur-lg border-b border-zinc-200/60">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-xl font-semibold text-zinc-900">Concept2Cure</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-zinc-600">
            <a href="#features" className="hover:text-zinc-900 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-zinc-900 transition-colors">Pricing</a>
            <a href="#markets" className="hover:text-zinc-900 transition-colors">Global Markets</a>
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation('/login')}
              className="px-4 py-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={() => setLocation('/signup')}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* ─── HERO ─── */}
      <section className="pt-24 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 rounded-full bg-blue-50 border border-blue-100">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-sm font-medium text-blue-700">Now available in US, EU, Japan & China</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-zinc-900 leading-tight mb-6">
            Regulatory intelligence,<br />
            <span className="text-blue-600">from concept to cure</span>
          </h1>
          <p className="text-xl text-zinc-600 max-w-2xl mx-auto mb-10 leading-relaxed">
            AI-powered deep research, CSR generation, and CTD building for every global market.
            Self-service. No sales calls. Start in minutes.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button
              onClick={() => setLocation('/signup')}
              className="px-8 py-3.5 text-base font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40"
            >
              Start Free
            </button>
            <button
              onClick={() => setLocation('/concept2cure/demo')}
              className="px-8 py-3.5 text-base font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-all shadow-lg shadow-violet-600/25 hover:shadow-violet-600/40"
            >
              Watch Interactive Demo
            </button>
            <button
              onClick={() => {
                document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-8 py-3.5 text-base font-medium text-zinc-700 bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl transition-all"
            >
              See How It Works
            </button>
          </div>
        </div>
      </section>

      {/* ─── GLOBAL MARKETS BAR ─── */}
      <section id="markets" className="py-12 border-y border-zinc-200/60 bg-white/50">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-sm font-medium text-zinc-500 mb-6">
            REGULATORY COVERAGE ACROSS THE TOP 4 GLOBAL MARKETS
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {MARKETS.map(m => (
              <div key={m.flag} className="flex items-center justify-center gap-3 p-4 rounded-xl bg-white border border-zinc-100">
                <span className="text-2xl">{m.flag === 'US' ? '\u{1F1FA}\u{1F1F8}' : m.flag === 'EU' ? '\u{1F1EA}\u{1F1FA}' : m.flag === 'JP' ? '\u{1F1EF}\u{1F1F5}' : '\u{1F1E8}\u{1F1F3}'}</span>
                <div>
                  <div className="text-sm font-semibold text-zinc-900">{m.agency}</div>
                  <div className="text-xs text-zinc-500">{m.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-zinc-900 mb-4">Everything you need for global regulatory success</h2>
            <p className="text-lg text-zinc-600 max-w-2xl mx-auto">
              From deep research to eCTD export, one platform replaces your entire regulatory toolkit.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map(f => {
              const Icon = IconMap[f.icon];
              return (
                <div key={f.title} className="p-6 rounded-2xl bg-white border border-zinc-100 hover:border-zinc-200 hover:shadow-sm transition-all">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                    {Icon && <Icon className="w-5 h-5 text-blue-600" />}
                  </div>
                  <h3 className="text-lg font-semibold text-zinc-900 mb-2">{f.title}</h3>
                  <p className="text-sm text-zinc-600 leading-relaxed">{f.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── PRICING ─── */}
      <section id="pricing" className="py-24 px-6 bg-white border-t border-zinc-200/60">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-zinc-900 mb-4">Simple, transparent pricing</h2>
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
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PRICING_TIERS.map(tier => (
              <div
                key={tier.name}
                className={`relative p-6 rounded-2xl border-2 transition-all ${
                  tier.highlighted
                    ? 'border-blue-600 bg-blue-50/30 shadow-lg shadow-blue-600/10'
                    : 'border-zinc-200 bg-white hover:border-zinc-300'
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
                      <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
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
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                  }`}
                >
                  {tier.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-zinc-900 mb-4">
            Ready to accelerate your regulatory strategy?
          </h2>
          <p className="text-lg text-zinc-600 mb-8">
            Join hundreds of life sciences teams using Concept2Cure to go from concept to cure faster.
          </p>
          <button
            onClick={() => setLocation('/signup')}
            className="px-8 py-3.5 text-base font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-lg shadow-blue-600/25"
          >
            Get Started Free
          </button>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="py-8 px-6 border-t border-zinc-200/60">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Logo />
            <span className="font-medium text-zinc-700">Concept2Cure</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-zinc-500">
            <span>FDA 21 CFR Part 11 Compliant</span>
            <span>SOC 2 Type II</span>
            <span>GDPR Ready</span>
          </div>
          <p className="text-sm text-zinc-400">
            &copy; {new Date().getFullYear()} Concept2Cure. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
