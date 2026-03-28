/**
 * Landing Page — Final CTA + Footer
 *
 * Fixed: footer links are real <a> elements (not <span>).
 * Fixed: proper routing paths.
 */
import React from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Section, fadeUp, ArrowRight, Logo } from './shared';

export function CtaSection() {
  const [, setLocation] = useLocation();

  return (
    <Section className="py-24 px-6 bg-gradient-to-br from-blue-600 to-violet-600 text-white relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-10" aria-hidden="true">
        <div className="absolute top-10 left-10 w-64 h-64 rounded-full bg-white/20 blur-3xl" />
        <div className="absolute bottom-10 right-10 w-80 h-80 rounded-full bg-white/10 blur-3xl" />
      </div>

      <div className="relative max-w-3xl mx-auto text-center">
        <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-bold mb-4">
          Ready to simplify your regulatory workflow?
        </motion.h2>
        <motion.p variants={fadeUp} className="text-lg text-white/80 mb-4">
          Try the live demo or start a free trial — no credit card, no sales call.
        </motion.p>
        <motion.p variants={fadeUp} className="text-sm text-white/60 mb-10">
          14-day free trial &middot; 21 CFR Part 11 compliant from day one
        </motion.p>
        <motion.div variants={fadeUp} className="flex items-center justify-center gap-4 flex-wrap">
          <button
            onClick={() => setLocation('/concept2cure/demo')}
            className="group px-8 py-3.5 text-base font-medium text-blue-600 bg-white hover:bg-blue-50 rounded-xl transition-all shadow-lg flex items-center gap-2"
          >
            Try the Demo
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
          <button
            onClick={() => setLocation('/concept2cure/signup')}
            className="px-8 py-3.5 text-base font-medium text-white border-2 border-white/30 hover:border-white/60 rounded-xl transition-all"
          >
            Start Free Trial
          </button>
        </motion.div>
      </div>
    </Section>
  );
}

export function Footer() {
  const [, setLocation] = useLocation();

  return (
    <footer className="py-12 px-6 bg-stone-900 text-stone-400" role="contentinfo">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Logo />
              <span className="font-semibold text-white">Concept2Cure</span>
            </div>
            <p className="text-sm text-stone-500 leading-relaxed">
              AI-powered regulatory intelligence for life sciences. From concept to cure, faster.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-stone-300 mb-3">Platform</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#features" className="hover:text-white transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-white transition-colors">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#security" className="hover:text-white transition-colors">
                  Security
                </a>
              </li>
              <li>
                <button
                  onClick={() => setLocation('/concept2cure/demo')}
                  className="hover:text-white transition-colors"
                >
                  Interactive Demo
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-stone-300 mb-3">Regulatory</h4>
            <ul className="space-y-2 text-sm">
              <li>FDA (510(k), IND, NDA)</li>
              <li>EMA (MAA, CTA)</li>
              <li>PMDA (CTN)</li>
              <li>NMPA (IND, NDA)</li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-stone-300 mb-3">Compliance</h4>
            <ul className="space-y-2 text-sm">
              <li>21 CFR Part 11</li>
              <li>SOC 2 Type II</li>
              <li>HIPAA</li>
              <li>GDPR</li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-stone-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-stone-500">
            &copy; {new Date().getFullYear()} Concept2Cure, Inc. All rights reserved.
          </p>
          <nav className="flex items-center gap-6 text-sm" aria-label="Legal">
            <a href="/terms" className="text-stone-500 hover:text-white transition-colors">
              Terms of Service
            </a>
            <a href="/privacy" className="text-stone-500 hover:text-white transition-colors">
              Privacy Policy
            </a>
            <a href="#security" className="text-stone-500 hover:text-white transition-colors">
              Security
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
