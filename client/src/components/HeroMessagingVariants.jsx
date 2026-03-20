// HeroMessagingVariants.jsx – Dynamic, role-aware hero messaging with analytics
// Auto-detects persona via URL, session, or last-viewed (localStorage)
// Tracks persona views and CTA clicks for analytics

import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter'; // Using wouter instead of react-router-dom

/* Inject analytics tracking helper - compatible with Segment, PostHog, or GTM */
const track = (event, props = {}) => {
  // Track with Segment if available
  if (window?.analytics && typeof window.analytics.track === 'function') {
    window.analytics.track(event, props);
  }

  // Track with Google Tag Manager if available
  if (window?.dataLayer && Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event, ...props });
  }

  // Log tracking in development
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Analytics Event: ${event}`, props);
  }
};

/* —————————————————  Persona Copy Variants  ————————————————— */
const variants = {
  exec: {
    headline: 'From Concepts to Cures — in Half the Time',
    subhead:
      'Concept2Cure automates regulatory writing, submission assembly, and ESG delivery across FDA, EMA, PMDA, and more. Cut costs. Launch faster. Stay compliant.',
    cta: { label: 'Calculate Your ROI', to: '/roi' },
  },
  medwriter: {
    headline: 'Let the Assistant Draft Your IND While You Sleep',
    subhead:
      'Generate Module 2 summaries, CERs, CSRs in hours — not weeks. Track reviews, collect e‑signatures, and stay always audit‑ready.',
    cta: { label: 'Try AI Drafting', to: '/demo' },
  },
  ops: {
    headline: 'Faster Documents, Smoother Approvals, Fewer Vendors',
    subhead:
      'Concept2Cure centralizes protocol authoring, team reviews, and submission packaging into one platform — no hand‑offs, no delays.',
    cta: { label: 'Launch a New Study', to: '/contact' },
  },
  qa: {
    headline: 'Audit Trails Built for Inspectors — Not Checklists',
    subhead:
      'Secure, time‑stamped logs. Immutable signatures. 21 CFR Part 11 compliance by default.',
    cta: { label: 'See Validation Tools', to: '/validation' },
  },
  investor: {
    headline: 'AI for Biotech That Actually Moves the Needle',
    subhead:
      'Concept2Cure cuts submission timelines 78% so capital works harder — therapies reach patients sooner.',
    cta: { label: 'Read Results', to: '/case-studies' },
  },
  biostats: {
    headline: 'Crunch the Numbers. Let Us Handle the Paperwork.',
    subhead:
      'Focus on analysis, not formatting. Auto‑generate stats sections for CSRs & INDs with traceable data links.',
    cta: { label: 'Explore Stats Toolkit', to: '/stats' },
  },
  sponsor: {
    headline: 'Run 3× More Trials with the Same Budget',
    subhead:
      'Automate submissions, streamline vendor oversight, and hit milestones early — all in one secure portal.',
    cta: { label: 'Request Sponsor Demo', to: '/demo' },
  },
  cro: {
    headline: 'Upgrade Your CRO Offering with White‑Label AI',
    subhead:
      'Embed Concept2Cure to cut client timelines and expand margins. Keep your brand, add our intelligence.',
    cta: { label: 'Partner Program', to: '/partners' },
  },
};
const VALID = Object.keys(variants);

/* Map session.user.role → persona key */
const roleMap = {
  RegulatoryLead: 'exec',
  Exec: 'exec',
  MedicalWriter: 'medwriter',
  ClinicalOps: 'ops',
  QA: 'qa',
  Biostatistician: 'biostats',
  Sponsor: 'sponsor',
  CRO: 'cro',
  Investor: 'investor',
};

export default function HeroMessagingVariants({ t }) {
  const [location] = useLocation();
  const stored = typeof window !== 'undefined' ? localStorage.getItem('persona') : null;
  const [persona, setPersona] = useState(stored || 'exec');

  /* Auto‑detect persona */
  useEffect(() => {
    // 1️⃣ URL param ?persona=medwriter
    const params = new URLSearchParams(window.location.search);
    const utm = params.get('persona');
    if (utm && VALID.includes(utm)) {
      setPersona(utm);
      localStorage.setItem('persona', utm);
      return;
    }

    // 2️⃣ No real session in this implementation, just use localStorage as fallback
    // In a real implementation, we would check session?.user?.role here
  }, [location]);

  /* Track persona view whenever it changes */
  useEffect(() => {
    track('hero_persona_view', { persona });
  }, [persona]);

  const { headline, subhead, cta } = variants[persona];

  // Get translated text if t function is available
  const getTranslatedText = text => {
    return t ? t(text) : text;
  };

  /* CTA render with analytics tracking */
  const CTAButton = () => (
    <a
      href={cta.to}
      onClick={() =>
        track('hero_cta_click', {
          persona,
          cta: cta.label,
          destination: cta.to,
        })
      }
      className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-3 rounded-lg text-sm font-medium shadow hover:bg-emerald-700 transition"
    >
      {getTranslatedText(cta.label)}
    </a>
  );

  return (
    <section className="text-center py-20 px-4 relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-sky-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Decorative gradient blob */}
      <div className="absolute -z-10 inset-0 flex justify-center opacity-15 blur-3xl pointer-events-none">
        <div className="bg-emerald-400 w-[340px] h-[340px] rounded-full mix-blend-multiply animate-pulse"></div>
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="inline-block px-3 py-1 mb-6 rounded-full border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/30 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-sm font-medium">
          {getTranslatedText('Trusted by 100+ Global Pharmaceutical Companies')}
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-emerald-700 dark:text-emerald-400 mb-4">
          {getTranslatedText(headline)}
        </h1>

        <p className="max-w-3xl mx-auto text-lg text-gray-700 dark:text-gray-300 mb-8 leading-relaxed">
          {getTranslatedText(subhead)}
        </p>

        <CTAButton />

        {/* Persona toggle (dev / exploration) */}
        <div className="mt-8 flex flex-wrap justify-center gap-2 text-xs">
          {VALID.map(k => (
            <button
              key={k}
              onClick={() => {
                setPersona(k);
                localStorage.setItem('persona', k);
                track('hero_persona_manual_change', {
                  previous: persona,
                  persona: k,
                });
              }}
              className={`px-3 py-1 rounded-full border ${
                k === persona
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400'
              } transition text-[10px] sm:text-xs capitalize`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
