/**
 * Landing Page — Hero Section
 *
 * Focused: one clear headline, one clear value prop, two CTAs.
 * No animated counters, no stat overload.
 */
import React from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { ArrowRight } from './shared';

export function HeroSection() {
  const [, setLocation] = useLocation();

  return (
    <section className="relative pt-20 pb-24 px-6 overflow-hidden">
      {/* Subtle background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-blue-100/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-violet-100/20 blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-2 px-4 py-2 mb-8 rounded-full bg-blue-50 border border-blue-100/60"
        >
          <span className="text-sm font-medium text-blue-700">
            AI-powered regulatory intelligence for life sciences
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="text-4xl sm:text-5xl md:text-6xl font-bold text-stone-900 leading-[1.1] tracking-tight mb-6"
        >
          From research to submission
          <br />
          <span className="text-blue-600">in one workspace</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="text-lg text-stone-600 max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Concept2Cure unifies deep research, document authoring, eCTD assembly, and compliance into
          one AI-native platform — built for FDA, EMA, PMDA, and NMPA submissions.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="flex items-center justify-center gap-4 flex-wrap mb-6"
        >
          <button
            onClick={() => setLocation('/concept2cure/demo')}
            className="group px-8 py-3.5 text-base font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md flex items-center gap-2"
          >
            Try the Live Demo
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
          <button
            onClick={() => setLocation('/concept2cure/signup')}
            className="group px-8 py-3.5 text-base font-medium text-stone-700 bg-white hover:bg-stone-50 border border-stone-200 rounded-xl transition-all flex items-center gap-2"
          >
            Start Free Trial
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="text-sm text-stone-400"
        >
          No credit card required &middot; 14-day trial &middot; 21 CFR Part 11 compliant
        </motion.p>

        {/* Compact agency bar — replaces the old huge stat grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-stone-500"
        >
          {[
            { flag: '\u{1F1FA}\u{1F1F8}', agency: 'FDA' },
            { flag: '\u{1F1EA}\u{1F1FA}', agency: 'EMA' },
            { flag: '\u{1F1EF}\u{1F1F5}', agency: 'PMDA' },
            { flag: '\u{1F1E8}\u{1F1F3}', agency: 'NMPA' },
            { flag: '\u{1F1EC}\u{1F1E7}', agency: 'MHRA' },
            { flag: '\u{1F1E6}\u{1F1FA}', agency: 'TGA' },
          ].map(m => (
            <span key={m.agency} className="flex items-center gap-1.5">
              <span aria-hidden="true">{m.flag}</span>
              <span className="font-medium text-stone-700">{m.agency}</span>
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
