/**
 * Landing Page — How It Works
 *
 * Simple 4-step flow. No over-animated timeline.
 */
import React from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Section, fadeUp, ArrowRight } from './shared';

const STEPS = [
  {
    step: '1',
    title: 'Connect Your Data',
    description:
      'Import from ClinicalTrials.gov, PubMed, or upload directly. The platform indexes everything in minutes.',
    color: 'bg-blue-600',
  },
  {
    step: '2',
    title: 'AI Drafts Your Documents',
    description:
      'Specialized AI agents research, draft, cross-reference, and quality-check regulatory documents in parallel.',
    color: 'bg-violet-600',
  },
  {
    step: '3',
    title: 'Review & Collaborate',
    description:
      'Your team reviews AI-drafted sections with tracked changes, e-signatures, and full audit trails.',
    color: 'bg-stone-700',
  },
  {
    step: '4',
    title: 'Submit with Confidence',
    description:
      'Export validated eCTD v4 packages with automated gateway QC. Submit to any agency from one workspace.',
    color: 'bg-green-600',
  },
];

export function HowItWorksSection() {
  const [, setLocation] = useLocation();

  return (
    <Section id="how-it-works" className="py-24 px-6 bg-stone-50/50">
      <div className="max-w-4xl mx-auto">
        <motion.div variants={fadeUp} className="text-center mb-14">
          <h2 className="text-lg font-medium sm:text-lg font-semibold text-stone-900 mb-4">How it works</h2>
          <p className="text-lg text-stone-600 max-w-2xl mx-auto">
            From data ingestion to gateway submission in four steps.
          </p>
        </motion.div>

        <div className="space-y-6">
          {STEPS.map(step => (
            <motion.div key={step.step} variants={fadeUp} className="flex items-start gap-5">
              <div
                className={`${step.color} w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-md`}
              >
                {step.step}
              </div>
              <div className="pt-1">
                <h3 className="text-lg font-semibold text-stone-900 mb-1">{step.title}</h3>
                <p className="text-stone-600 leading-relaxed">{step.description}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div variants={fadeUp} className="text-center mt-12">
          <button
            onClick={() => setLocation('/concept2cure/demo')}
            className="group inline-flex items-center gap-2 px-7 py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md"
          >
            See It In Action
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </motion.div>
      </div>
    </Section>
  );
}
