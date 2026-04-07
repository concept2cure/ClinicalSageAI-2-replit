/**
 * Landing Page — Security & Compliance Section
 */
import React from 'react';
import { motion } from 'framer-motion';
import { Section, fadeUp, CheckIcon } from './shared';

const BADGES = [
  { label: 'FDA 21 CFR Part 11', desc: 'Electronic records & signatures' },
  { label: 'SOC 2 Type II', desc: 'Security & availability' },
  { label: 'HIPAA', desc: 'Protected health information' },
  { label: 'GDPR', desc: 'EU data protection' },
  { label: 'ICH E3 / E6(R2)', desc: 'Clinical study standards' },
  { label: 'eCTD v4.0', desc: 'Electronic submission format' },
];

export function SecuritySection() {
  return (
    <Section id="security" className="py-24 px-6 bg-stone-900 text-white">
      <div className="max-w-5xl mx-auto">
        <motion.div variants={fadeUp} className="text-center mb-14">
          <h2 className="text-lg font-medium sm:text-lg font-semibold mb-4">
            Enterprise security. Regulatory compliance.{' '}
            <span className="text-blue-400">Built in.</span>
          </h2>
          <p className="text-stone-400 text-lg max-w-2xl mx-auto">
            Every feature is designed from the ground up for GxP compliance — not bolted on as an
            afterthought.
          </p>
        </motion.div>

        <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {BADGES.map(b => (
            <div
              key={b.label}
              className="p-5 rounded-xl bg-white/5 border border-white/10 hover:border-blue-500/30 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center mb-3">
                <CheckIcon className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-sm font-semibold text-white mb-1">{b.label}</div>
              <div className="text-xs text-stone-400">{b.desc}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </Section>
  );
}
