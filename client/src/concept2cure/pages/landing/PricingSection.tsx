/**
 * Landing Page — Pricing Section
 *
 * Fixed routing: uses /concept2cure/signup path.
 * Honest framing, no inflated claims.
 */
import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Section, fadeUp, CheckIcon } from './shared';

const TIERS = [
  {
    name: 'Researcher',
    price: 'Free',
    period: '',
    description: 'Individual researchers exploring regulatory intelligence',
    features: [
      '1 user, 2 projects',
      '5 research queries / month',
      'CSR search & analysis',
      'Basic AI chat',
      'Community support',
    ],
    cta: 'Get Started Free',
    slug: 'free',
    highlighted: false,
  },
  {
    name: 'Startup',
    price: '$499',
    period: '/mo',
    description: 'Emerging biotechs preparing their first dossier',
    features: [
      'Up to 5 users, 10 projects',
      '50 research queries / month',
      'Full CSR builder & deep research',
      'eCTD authoring & export',
      'Email support',
    ],
    cta: 'Start 14-Day Trial',
    slug: 'standard',
    highlighted: true,
  },
  {
    name: 'Growth',
    price: '$1,499',
    period: '/mo',
    description: 'Multi-market submissions at scale',
    features: [
      'Up to 25 users, 50 projects',
      '200 research queries / month',
      'Multi-agency CTD builder',
      'CMC platform & stability tracking',
      'Priority support',
    ],
    cta: 'Start 14-Day Trial',
    slug: 'professional',
    highlighted: false,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'Large pharma and CROs with global needs',
    features: [
      'Unlimited users & projects',
      'SSO, advanced RBAC & security',
      'Dedicated account manager',
      '21 CFR Part 11 audit package',
      'On-premise deployment option',
    ],
    cta: 'Contact Sales',
    slug: 'enterprise',
    highlighted: false,
  },
];

export function PricingSection() {
  const [, setLocation] = useLocation();
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');

  function getDisplayPrice(price: string): string {
    if (price === 'Custom' || price === 'Free') return price;
    const num = parseInt(price.replace(/\D/g, ''));
    return billing === 'annual' ? `$${Math.round(num * 0.85)}` : price;
  }

  return (
    <Section id="pricing" className="py-24 px-6 bg-white border-t border-stone-200/60">
      <div className="max-w-6xl mx-auto">
        <motion.div variants={fadeUp} className="text-center mb-12">
          <h2 className="text-lg font-medium sm:text-lg font-semibold text-stone-900 mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-stone-600 mb-8">
            Start free. Upgrade when you're ready. No surprises.
          </p>

          <div
            className="inline-flex items-center gap-1 p-1 bg-stone-100 rounded-lg"
            role="radiogroup"
            aria-label="Billing cycle"
          >
            <button
              role="radio"
              aria-checked={billing === 'monthly'}
              onClick={() => setBilling('monthly')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                billing === 'monthly' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
              }`}
            >
              Monthly
            </button>
            <button
              role="radio"
              aria-checked={billing === 'annual'}
              onClick={() => setBilling('annual')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                billing === 'annual' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
              }`}
            >
              Annual <span className="text-stone-700 text-xs ml-1">Save 15%</span>
            </button>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {TIERS.map(tier => (
            <motion.div
              key={tier.name}
              variants={fadeUp}
              className={`relative p-6 rounded-2xl border transition-all ${
                tier.highlighted
                  ? 'border-stone-600 bg-stone-100/30 shadow shadow-stone-600/10'
                  : 'border-stone-200 bg-white hover:border-stone-300 hover:shadow-md'
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-stone-600 text-white text-xs font-medium rounded-full">
                  Most Popular
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-stone-900">{tier.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-lg font-medium text-stone-900">
                    {getDisplayPrice(tier.price)}
                  </span>
                  {tier.period && <span className="text-sm text-stone-500">{tier.period}</span>}
                </div>
                <p className="mt-2 text-sm text-stone-600">{tier.description}</p>
              </div>

              <ul className="space-y-2.5 mb-8">
                {tier.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-stone-700">
                    <CheckIcon className="w-4 h-4 text-stone-1000 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => {
                  if (tier.slug === 'enterprise') {
                    window.location.href =
                      'mailto:sales@concept2cure.pro?subject=Enterprise%20Inquiry';
                  } else {
                    setLocation(`/concept2cure/signup?plan=${tier.slug}`);
                  }
                }}
                className={`w-full py-2.5 px-4 text-sm font-medium rounded-xl transition-all ${
                  tier.highlighted
                    ? 'bg-stone-600 text-white hover:bg-stone-700 shadow-md'
                    : 'bg-stone-100 text-stone-800 hover:bg-stone-200'
                }`}
              >
                {tier.cta}
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}
