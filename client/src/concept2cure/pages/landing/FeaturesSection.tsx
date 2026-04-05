/**
 * Landing Page — Features Section
 *
 * 6 core capabilities only. No 86-module catalog.
 * Each card: icon, title, one-line description.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { Section, fadeUp } from './shared';

const FEATURES = [
  {
    title: 'Deep Research Engine',
    description:
      'AI-powered search across ClinicalTrials.gov, PubMed, FDA databases, and more. Auto-extract endpoints, populations, and safety signals.',
    iconPath: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
  },
  {
    title: 'CSR Builder',
    description:
      'Generate ICH E3-compliant Clinical Study Reports with AI-assisted section drafting, cross-references, and tables.',
    iconPath:
      'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  },
  {
    title: 'eCTD Assembly & Export',
    description:
      'Build and validate eCTD v4 submission packages for all major agencies with automated gateway QC checks.',
    iconPath:
      'M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3',
  },
  {
    title: 'Regulatory Intelligence',
    description:
      'Real-time monitoring of guidances, approvals, CRLs, advisory committees, and warning letters across agencies.',
    iconPath:
      'M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418',
  },
  {
    title: 'CMC Platform',
    description:
      'Full Module 3 management — drug substance specs, analytical methods, stability data, and batch records per ICH Q1-Q14.',
    iconPath:
      'M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5',
  },
  {
    title: '21 CFR Part 11 Compliance',
    description:
      'Immutable audit trails, e-signatures, RBAC, session management, and hash-chain verification for every document version.',
    iconPath:
      'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  },
];

export function FeaturesSection() {
  return (
    <Section id="features" className="py-24 px-6 bg-white border-t border-stone-200/60">
      <div className="max-w-6xl mx-auto">
        <motion.div variants={fadeUp} className="text-center mb-14">
          <h2 className="text-lg font-medium sm:text-lg font-semibold text-stone-900 mb-4">
            Everything you need for regulatory submissions
          </h2>
          <p className="text-lg text-stone-600 max-w-2xl mx-auto">
            Six integrated capabilities that replace the fragmented toolchain most teams struggle
            with today.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(f => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              className="group p-6 rounded-2xl bg-stone-50 border border-stone-100 hover:bg-white hover:border-stone-200 hover:shadow-sm hover:shadow-stone-600/5 transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center mb-4 group-hover:bg-stone-600 transition-colors">
                <svg
                  className="w-5 h-5 text-stone-600 group-hover:text-white transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={f.iconPath} />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-stone-900 mb-2">{f.title}</h3>
              <p className="text-sm text-stone-600 leading-relaxed">{f.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}
