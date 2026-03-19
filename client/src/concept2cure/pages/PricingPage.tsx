/**
 * @fileoverview Concept2Cure Pricing Page
 * Anthropic-style clean pricing with industry-specific tiers,
 * bundle discounts, and Stripe checkout integration.
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import logoSrc from '@/assets/concept2cure-logo.jpg';
import {
  Check,
  ArrowRight,
  Users,
  Zap,
  Shield,
  Building2,
  GraduationCap,
  Cpu,
  ChevronDown,
  MessageSquare,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & DATA
// ═══════════════════════════════════════════════════════════════════════════════

type IndustryTab = 'pharma' | 'medtech' | 'academic';
type BillingCycle = 'monthly' | 'annual';

interface PlanData {
  name: string;
  price: number; // per user per month in dollars
  annualPrice: number;
  description: string;
  tokens: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
  enterprise?: boolean;
}

const PLANS: Record<IndustryTab, PlanData[]> = {
  pharma: [
    {
      name: 'Standard',
      price: 459,
      annualPrice: 399,
      description: 'For regulatory teams getting started with AI-powered submissions.',
      tokens: '4M tokens/mo',
      features: [
        'AI Copilot for regulatory writing',
        'eCTD document authoring',
        'CER generation engine',
        '510(k) submission module',
        'Compliance analysis & audit trails',
        'Basic integrations (Slack, Jira)',
        '21 CFR Part 11 compliant',
        '25 GB document storage',
      ],
      cta: 'Start 3-Month Trial',
    },
    {
      name: 'Professional',
      price: 399,
      annualPrice: 347,
      description: 'For growing teams with advanced regulatory workflows.',
      tokens: '8M tokens/mo',
      features: [
        'Everything in Standard',
        'Advanced analytics & dashboards',
        'Priority support (4hr P1 response)',
        'Custom workflow automation',
        'All integrations (Veeva, Medidata, etc.)',
        'SAML SSO & enterprise auth',
        'Biostatistics module',
        '100 GB document storage',
      ],
      cta: 'Start Professional',
      highlighted: true,
    },
    {
      name: 'Enterprise',
      price: 0,
      annualPrice: 0,
      description: 'For large organizations with custom requirements.',
      tokens: '20M+ tokens/mo',
      features: [
        'Everything in Professional',
        'Dedicated customer success manager',
        'Custom AI model fine-tuning',
        'On-premises deployment option',
        '99.95% SLA guarantee',
        'Compliance audit package',
        'Custom training & onboarding',
        '1 TB+ document storage',
      ],
      cta: 'Contact Sales',
      enterprise: true,
    },
  ],
  medtech: [
    {
      name: 'Standard',
      price: 349,
      annualPrice: 304,
      description: 'Built for medical device regulatory teams.',
      tokens: '2M tokens/mo',
      features: [
        'AI Copilot for device submissions',
        '510(k) workflow & predicate finder',
        'CER generation for EU MDR',
        'eSTAR builder & submission prep',
        'GSPR mapping & traceability',
        'Basic integrations',
        '21 CFR Part 11 compliant',
        '25 GB document storage',
      ],
      cta: 'Start 3-Month Trial',
    },
    {
      name: 'Professional',
      price: 299,
      annualPrice: 260,
      description: 'Full regulatory suite for growing device companies.',
      tokens: '4M tokens/mo',
      features: [
        'Everything in Standard',
        'EU MDR/IVDR full support',
        'Advanced analytics & risk assessment',
        'Priority support',
        'All integrations (Veeva Vault, Adobe)',
        'SAML SSO & enterprise auth',
        'Multi-market submission support',
        '100 GB document storage',
      ],
      cta: 'Start Professional',
      highlighted: true,
    },
    {
      name: 'Enterprise',
      price: 0,
      annualPrice: 0,
      description: 'For device companies with complex product portfolios.',
      tokens: '20M+ tokens/mo',
      features: [
        'Everything in Professional',
        'Dedicated CSM & implementation',
        'Custom validation protocols',
        'On-premises deployment option',
        '99.95% SLA guarantee',
        'Audit readiness package',
        'Custom training & onboarding',
        '1 TB+ document storage',
      ],
      cta: 'Contact Sales',
      enterprise: true,
    },
  ],
  academic: [
    {
      name: 'Research',
      price: 149,
      annualPrice: 119,
      description: 'For academic researchers and clinical investigators.',
      tokens: '500K tokens/mo',
      features: [
        'AI Copilot for research',
        'Literature review & synthesis',
        'Protocol design assistance',
        'Basic CER generation',
        'Evidence synthesis engine',
        'PDF & DOCX export',
        '10 projects included',
        '10 GB document storage',
      ],
      cta: 'Start Research Plan',
    },
    {
      name: 'Department',
      price: 119,
      annualPrice: 95,
      description: 'For research departments and multi-PI teams.',
      tokens: '1M tokens/mo',
      features: [
        'Everything in Research',
        'Biostatistics module',
        'Advanced analytics',
        'Team collaboration tools',
        'All integrations',
        'Shared project workspaces',
        '50 projects included',
        '50 GB document storage',
      ],
      cta: 'Start Department Plan',
      highlighted: true,
    },
    {
      name: 'Institution',
      price: 0,
      annualPrice: 0,
      description: 'For universities and research institutions.',
      tokens: '5M+ tokens/mo',
      features: [
        'Everything in Department',
        'Unlimited projects',
        'Custom training program',
        'Dedicated support',
        'SAML SSO',
        'Institutional license management',
        'Volume academic pricing',
        '500 GB+ document storage',
      ],
      cta: 'Contact Academic Sales',
      enterprise: true,
    },
  ],
};

const BUNDLE_DISCOUNTS = [
  { min: 5, pct: 10, label: '5+ users' },
  { min: 10, pct: 15, label: '10+ users' },
  { min: 25, pct: 20, label: '25+ users' },
  { min: 50, pct: 25, label: '50+ users' },
];

const INDUSTRY_TABS: { key: IndustryTab; label: string; icon: React.ReactNode }[] = [
  { key: 'pharma', label: 'Pharma / Biotech / CRO', icon: <Zap className="w-4 h-4" /> },
  { key: 'medtech', label: 'Medical Device', icon: <Cpu className="w-4 h-4" /> },
  { key: 'academic', label: 'Academic Research', icon: <GraduationCap className="w-4 h-4" /> },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const PricingPage: React.FC = () => {
  const [industry, setIndustry] = useState<IndustryTab>('pharma');
  const [billing, setBilling] = useState<BillingCycle>('monthly');
  const [showFaq, setShowFaq] = useState<string | null>(null);

  const plans = PLANS[industry];

  return (
    <div className="min-h-screen bg-zinc-50" style={{ fontFamily: "'Lora', Georgia, serif" }}>
      {/* Header */}
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/concept2cure" className="flex items-center gap-3">
            <div className="relative w-9 h-9 rounded-xl overflow-hidden shadow-sm">
              <img src={logoSrc} alt="Concept2Cure" className="w-full h-full object-cover" />
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, transparent 40%, white 100%)' }} />
            </div>
            <span className="text-lg font-semibold text-zinc-900" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
              Concept2Cure
            </span>
          </a>
          <a
            href="/concept2cure/signup"
            className="text-sm font-medium px-4 py-2 rounded-lg text-white transition-colors"
            style={{ background: 'linear-gradient(135deg, #d97757, #c15f3c)', fontFamily: "'Poppins', Arial, sans-serif" }}
          >
            Get Started
          </a>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-white pt-16 pb-12 text-center">
        <h1
          className="text-4xl font-bold text-zinc-900 mb-4"
          style={{ fontFamily: "'Poppins', Arial, sans-serif" }}
        >
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-zinc-500 max-w-2xl mx-auto mb-8">
          AI-powered regulatory intelligence for life sciences. Per-user pricing with no hidden fees.
          3-month minimum commitment.
        </p>

        {/* Industry tabs */}
        <div className="flex justify-center gap-2 mb-8">
          {INDUSTRY_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setIndustry(tab.key)}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all',
                industry === tab.key
                  ? 'bg-zinc-900 text-white shadow-lg'
                  : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
              )}
              style={{ fontFamily: "'Poppins', Arial, sans-serif" }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <span className={cn('text-sm font-medium', billing === 'monthly' ? 'text-zinc-900' : 'text-zinc-400')}
            style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
            Monthly
          </span>
          <button
            onClick={() => setBilling(billing === 'monthly' ? 'annual' : 'monthly')}
            className={cn('relative w-12 h-6 rounded-full transition-colors', billing === 'annual' ? 'bg-green-500' : 'bg-zinc-300')}
          >
            <span className={cn('absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform', billing === 'annual' && 'translate-x-6')} />
          </button>
          <span className={cn('text-sm font-medium', billing === 'annual' ? 'text-zinc-900' : 'text-zinc-400')}
            style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
            Annual
          </span>
          {billing === 'annual' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium"
              style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
              Save 13-20%
            </span>
          )}
        </div>
      </div>

      {/* Pricing cards */}
      <div className="max-w-6xl mx-auto px-6 -mt-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {plans.map(plan => (
            <div
              key={plan.name}
              className={cn(
                'rounded-2xl border p-8 flex flex-col',
                plan.highlighted
                  ? 'border-blue-200 bg-white ring-2 ring-blue-100 shadow-xl relative'
                  : 'border-zinc-200 bg-white shadow-sm'
              )}
            >
              {plan.highlighted && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #d97757, #c15f3c)', fontFamily: "'Poppins', Arial, sans-serif" }}
                >
                  Most Popular
                </div>
              )}

              <h3 className="text-lg font-semibold text-zinc-900 mb-1" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
                {plan.name}
              </h3>
              <p className="text-sm text-zinc-500 mb-6">{plan.description}</p>

              {/* Price */}
              <div className="mb-6">
                {plan.enterprise ? (
                  <p className="text-3xl font-bold text-zinc-900" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
                    Custom
                  </p>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-zinc-900" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
                        ${billing === 'annual' ? plan.annualPrice : plan.price}
                      </span>
                      <span className="text-sm text-zinc-500">/user/month</span>
                    </div>
                    {billing === 'annual' && (
                      <p className="text-xs text-green-600 mt-1 font-medium" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
                        Billed annually (${(plan.annualPrice * 12).toLocaleString()}/user/year)
                      </p>
                    )}
                  </>
                )}
                <p className="text-xs text-zinc-400 mt-2 flex items-center gap-1" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
                  <Zap className="w-3 h-3" />
                  {plan.tokens} AI tokens included
                </p>
              </div>

              {/* CTA */}
              <a
                href={plan.enterprise ? 'mailto:sales@concept2cure.com' : '/concept2cure/signup'}
                className={cn(
                  'w-full py-3 px-4 rounded-xl text-sm font-semibold text-center transition-all mb-6 block',
                  plan.highlighted
                    ? 'text-white shadow-lg hover:shadow-xl'
                    : plan.enterprise
                      ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                      : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
                )}
                style={plan.highlighted ? { background: 'linear-gradient(135deg, #d97757, #c15f3c)', fontFamily: "'Poppins', Arial, sans-serif" } : { fontFamily: "'Poppins', Arial, sans-serif" }}
              >
                {plan.cta} <ArrowRight className="w-4 h-4 inline ml-1" />
              </a>

              {/* Features */}
              <ul className="space-y-3 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-600">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bundle discounts */}
      <div className="bg-white border-t border-b border-zinc-200 py-12">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-zinc-900 mb-2" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
            Team & Volume Discounts
          </h2>
          <p className="text-sm text-zinc-500 mb-8">
            Bundle discounts applied automatically based on team size. Combine with annual billing for maximum savings.
          </p>
          <div className="grid grid-cols-4 gap-4">
            {BUNDLE_DISCOUNTS.map(b => (
              <div key={b.min} className="p-4 rounded-xl border border-zinc-200 bg-zinc-50">
                <Users className="w-5 h-5 text-zinc-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-zinc-900" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
                  {b.pct}% off
                </p>
                <p className="text-xs text-zinc-500 mt-1" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>{b.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Overage pricing */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-zinc-900 mb-6 text-center" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
          AI Token Usage & Overages
        </h2>
        <div className="bg-white rounded-2xl border border-zinc-200 p-8">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h3 className="text-sm font-semibold text-zinc-700 mb-3" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
                Included Tokens
              </h3>
              <p className="text-sm text-zinc-600 mb-4">
                Every plan includes a generous monthly AI token allocation per user. Tokens are used for document
                generation, compliance analysis, literature review, and all AI-powered features.
              </p>
              <p className="text-xs text-zinc-400">
                Unused tokens do not roll over. Token usage is visible in your billing dashboard in real-time.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-700 mb-3" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
                Overage Charges
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg">
                  <span className="text-sm text-zinc-600">Standard tier overage</span>
                  <span className="text-sm font-semibold text-zinc-900" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>$0.025 / 1K tokens</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg">
                  <span className="text-sm text-zinc-600">Professional tier overage</span>
                  <span className="text-sm font-semibold text-zinc-900" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>$0.020 / 1K tokens</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg">
                  <span className="text-sm text-zinc-600">Enterprise tier overage</span>
                  <span className="text-sm font-semibold text-zinc-900" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>$0.015 / 1K tokens</span>
                </div>
              </div>
              <p className="text-xs text-zinc-400 mt-3">
                Set spending alerts and hard limits in your billing dashboard. Overages are billed monthly.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Security & Compliance */}
      <div className="bg-white border-t border-zinc-200 py-12">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-zinc-900 mb-8 text-center" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
            Enterprise-Grade Security & Compliance
          </h2>
          <div className="grid grid-cols-3 gap-6">
            {[
              { icon: <Shield className="w-5 h-5" />, title: 'FDA 21 CFR Part 11', desc: 'Immutable audit trails, electronic signatures, and access controls compliant with FDA regulations.' },
              { icon: <Building2 className="w-5 h-5" />, title: 'HIPAA & GDPR', desc: 'BAA available for all tiers. GDPR-compliant data processing with DPA. SOC 2 Type II.' },
              { icon: <Zap className="w-5 h-5" />, title: 'Data Privacy', desc: 'Your data is never used for AI training (default). API data deleted from Anthropic within 7 days.' },
            ].map(item => (
              <div key={item.title} className="text-center">
                <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center mx-auto mb-3 text-zinc-600">
                  {item.icon}
                </div>
                <h3 className="text-sm font-semibold text-zinc-900 mb-2" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
                  {item.title}
                </h3>
                <p className="text-xs text-zinc-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-zinc-900 mb-8 text-center" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
          Frequently Asked Questions
        </h2>
        {[
          { q: 'Is there a minimum commitment?', a: 'Yes, all plans require a 3-month minimum commitment. After the initial period, you can cancel at the end of any billing cycle.' },
          { q: 'What happens if I exceed my token allocation?', a: 'Overage charges apply at the rate for your tier ($0.015-$0.025 per 1,000 tokens). You can set spending alerts and hard limits in your billing dashboard to prevent unexpected charges.' },
          { q: 'Can I change plans or add users mid-cycle?', a: 'Yes, you can upgrade your plan or add users at any time. Changes are prorated for the remaining billing period. Downgrades take effect at the end of the current billing cycle.' },
          { q: 'Is my data used to train AI models?', a: 'No, by default your data is never used for AI model training. You can optionally opt in to allow anonymized, de-identified patterns to improve our models. Your data processed through Anthropic\'s API is never used for their model training and is deleted within 7 days.' },
          { q: 'Do you offer HIPAA BAA?', a: 'Yes, Business Associate Agreements are available for all subscription tiers at no additional cost. Contact legal@concept2cure.com to execute a BAA.' },
          { q: 'What payment methods do you accept?', a: 'We accept all major credit cards, ACH direct debit, and wire transfers (enterprise only). Payments are processed securely through Stripe with Link enabled for faster checkout.' },
        ].map(faq => (
          <div key={faq.q} className="border-b border-zinc-200 last:border-0">
            <button
              onClick={() => setShowFaq(showFaq === faq.q ? null : faq.q)}
              className="w-full flex items-center justify-between py-4 text-left"
            >
              <span className="text-sm font-medium text-zinc-900" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>{faq.q}</span>
              <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform', showFaq === faq.q && 'rotate-180')} />
            </button>
            {showFaq === faq.q && (
              <p className="text-sm text-zinc-600 pb-4 pr-8">{faq.a}</p>
            )}
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="text-center py-16" style={{ background: 'linear-gradient(135deg, #d97757, #c15f3c)' }}>
        <h2 className="text-3xl font-bold text-white mb-4" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
          Ready to transform your regulatory workflow?
        </h2>
        <p className="text-white/80 mb-8 max-w-lg mx-auto">
          Start your 3-month subscription today. No setup fees, no implementation costs.
        </p>
        <div className="flex justify-center gap-4">
          <a
            href="/concept2cure/signup"
            className="px-8 py-3 rounded-xl bg-white text-zinc-900 font-semibold text-sm hover:bg-zinc-100 transition-colors"
            style={{ fontFamily: "'Poppins', Arial, sans-serif" }}
          >
            Get Started <ArrowRight className="w-4 h-4 inline ml-1" />
          </a>
          <a
            href="mailto:sales@concept2cure.com"
            className="px-8 py-3 rounded-xl border border-white/30 text-white font-semibold text-sm hover:bg-white/10 transition-colors flex items-center gap-2"
            style={{ fontFamily: "'Poppins', Arial, sans-serif" }}
          >
            <MessageSquare className="w-4 h-4" />
            Talk to Sales
          </a>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-zinc-900 text-zinc-400 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <p className="text-xs">© {new Date().getFullYear()} Concept2Cure, Inc. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="/concept2cure/legal/terms" className="text-xs hover:text-white transition-colors">Terms</a>
            <a href="/concept2cure/legal/privacy" className="text-xs hover:text-white transition-colors">Privacy</a>
            <a href="/concept2cure/legal/sla" className="text-xs hover:text-white transition-colors">SLA</a>
            <a href="/concept2cure/legal/baa" className="text-xs hover:text-white transition-colors">BAA</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PricingPage;
