/**
 * Landing Page — Social Proof Section
 *
 * Honest framing: "Built for" personas with realistic value props.
 * No fake testimonials with made-up names.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { Section, fadeUp, CheckIcon } from './shared';

const AUDIENCES = [
  {
    persona: 'Biotech Startups',
    tagline: 'Move faster with a lean team',
    points: [
      'AI agents handle research, drafting, and QC',
      'Full IND/510(k) workflow out of the box',
      'No enterprise contract required — start free',
    ],
    accent: 'blue',
  },
  {
    persona: 'Mid-Size Pharma',
    tagline: 'Manage multi-program portfolios',
    points: [
      'Real-time submission dashboards across programs',
      'Multi-agency coverage (FDA, EMA, PMDA, NMPA)',
      'Team collaboration with RBAC and audit trails',
    ],
    accent: 'violet',
  },
  {
    persona: 'CROs & Consultancies',
    tagline: 'Serve more clients, higher quality',
    points: [
      'Multi-tenant workspaces for client isolation',
      'AI-accelerated document turnaround',
      'Enterprise SSO and compliance reporting',
    ],
    accent: 'indigo',
  },
];

const accentStyles: Record<string, { badge: string; border: string; bg: string }> = {
  blue: {
    badge: 'bg-stone-100 text-stone-700',
    border: 'border-stone-100 hover:border-stone-300',
    bg: 'from-stone-100/30 to-white',
  },
  violet: {
    badge: 'bg-stone-100 text-stone-700',
    border: 'border-stone-100 hover:border-stone-300',
    bg: 'from-stone-100/30 to-white',
  },
  indigo: {
    badge: 'bg-stone-100 text-stone-700',
    border: 'border-stone-100 hover:border-stone-300',
    bg: 'from-stone-100/30 to-white',
  },
};

export function SocialProofSection() {
  return (
    <Section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div variants={fadeUp} className="text-center mb-14">
          <h2 className="text-lg font-medium sm:text-lg font-semibold text-stone-900 mb-4">
            Built for every stage of regulatory maturity
          </h2>
          <p className="text-lg text-stone-600 max-w-2xl mx-auto">
            Whether you're filing your first IND or managing a global submission portfolio,
            Concept2Cure adapts to your workflow.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {AUDIENCES.map(a => {
            const styles = accentStyles[a.accent];
            return (
              <motion.div
                key={a.persona}
                variants={fadeUp}
                className={`p-7 rounded-2xl border ${styles.border} bg-gradient-to-b ${styles.bg} transition-all duration-200 hover:shadow-sm`}
              >
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mb-4 ${styles.badge}`}
                >
                  {a.persona}
                </span>
                <h3 className="text-lg font-bold text-stone-900 mb-4">{a.tagline}</h3>
                <ul className="space-y-3">
                  {a.points.map(point => (
                    <li key={point} className="flex items-start gap-2.5 text-sm text-stone-700">
                      <CheckIcon className="w-4 h-4 text-stone-900 mt-0.5 flex-shrink-0" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}
