/**
 * @fileoverview Concept2Cure Landing Page
 * @module concept2cure/pages/LandingPage
 *
 * Clean overview page — renders at / when unauthenticated.
 */

import React from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.2, 0, 0, 1] } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

// ─────────────────────────────────────────────────────────────────────────────
// LANDING PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-[#1A1A18]" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-[#FAF9F5]/90 backdrop-blur-sm border-b border-[#E8E6DC]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#D97757] to-[#C15F3C] flex items-center justify-center">
              <span className="text-white text-sm font-bold">C2C</span>
            </div>
            <span className="text-lg font-semibold tracking-tight">Concept2Cure</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setLocation('/concept2cure/login')}
              className="text-sm text-[#6B6960] hover:text-[#1A1A18] transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => setLocation('/concept2cure/signup')}
              className="text-sm px-4 py-2 rounded-lg bg-[#D97757] text-white hover:bg-[#C15F3C] transition-colors"
            >
              Request Access
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <motion.section
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center"
      >
        <motion.div variants={fadeUp} className="inline-block mb-6 px-4 py-1.5 rounded-full bg-[#D97757]/10 text-[#D97757] text-sm font-medium">
          Coming Soon — Beta Access
        </motion.div>
        <motion.h1 variants={fadeUp} className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight tracking-tight mb-6">
          From Concept to Cure,<br />
          <span className="text-[#D97757]">Faster</span>
        </motion.h1>
        <motion.p variants={fadeUp} className="text-lg sm:text-xl text-[#6B6960] max-w-2xl mx-auto mb-10 leading-relaxed">
          Concept2Cure is an AI-powered regulatory intelligence platform that helps life sciences
          companies navigate FDA, EMA, and global regulatory submissions — in a fraction of the time.
        </motion.p>
        <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={() => setLocation('/concept2cure/signup')}
            className="px-6 py-3 rounded-lg bg-[#D97757] text-white font-medium hover:bg-[#C15F3C] transition-colors text-base"
          >
            Join the Beta Waitlist
          </button>
          <a
            href="#how-it-works"
            className="px-6 py-3 rounded-lg border border-[#E8E6DC] text-[#6B6960] font-medium hover:border-[#D97757] hover:text-[#D97757] transition-colors text-base"
          >
            Learn More
          </a>
        </motion.div>
      </motion.section>

      {/* ── What is Concept2Cure ───────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 py-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={stagger}
        >
          <motion.h2 variants={fadeUp} className="text-3xl font-bold mb-4 text-center">What is Concept2Cure?</motion.h2>
          <motion.p variants={fadeUp} className="text-[#6B6960] text-center max-w-2xl mx-auto mb-12 leading-relaxed">
            A single platform that replaces the fragmented toolchain life sciences teams
            use to prepare, review, and submit regulatory documents to agencies worldwide.
          </motion.p>
          <motion.div variants={stagger} className="grid sm:grid-cols-3 gap-8">
            {[
              {
                title: 'AI-Powered Drafting',
                description: 'Specialized AI agents research, draft, and cross-reference your regulatory documents — CSRs, CTDs, INDs — with source-level citations.',
              },
              {
                title: 'Multi-Agency Coverage',
                description: 'Built for FDA, EMA, PMDA, NMPA, MHRA, and TGA. One platform handles the regulatory requirements of six major global agencies.',
              },
              {
                title: 'Enterprise Compliance',
                description: '21 CFR Part 11 compliant with full audit trails, role-based access, and multi-tenant data isolation for regulated environments.',
              },
            ].map((item) => (
              <motion.div key={item.title} variants={fadeUp} className="bg-white rounded-xl p-6 border border-[#E8E6DC]">
                <h3 className="text-base font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-[#6B6960] leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* ── How It Works ──────────────────────────────────────────────── */}
      <section id="how-it-works" className="bg-white border-y border-[#E8E6DC]">
        <div className="max-w-4xl mx-auto px-6 py-20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            variants={stagger}
          >
            <motion.h2 variants={fadeUp} className="text-3xl font-bold mb-4 text-center">How It Works</motion.h2>
            <motion.p variants={fadeUp} className="text-[#6B6960] text-center max-w-xl mx-auto mb-12">
              Four steps from raw data to submission-ready documents.
            </motion.p>
            <motion.div variants={stagger} className="grid sm:grid-cols-2 gap-6">
              {[
                { step: '01', title: 'Connect Your Data', description: 'Import from ClinicalTrials.gov, PubMed, internal document systems, or upload directly.' },
                { step: '02', title: 'AI Builds Your Dossier', description: 'Specialized agents research, draft, and quality-check documents in parallel.' },
                { step: '03', title: 'Review & Collaborate', description: 'Your regulatory team reviews AI-generated drafts with tracked changes and inline comments.' },
                { step: '04', title: 'Submit with Confidence', description: 'Export eCTD-compliant packages validated against agency-specific requirements.' },
              ].map((item) => (
                <motion.div key={item.step} variants={fadeUp} className="flex gap-4 p-5 rounded-xl border border-[#E8E6DC] bg-[#FAF9F5]">
                  <span className="text-2xl font-bold text-[#D97757]/30 shrink-0">{item.step}</span>
                  <div>
                    <h3 className="font-semibold mb-1">{item.title}</h3>
                    <p className="text-sm text-[#6B6960] leading-relaxed">{item.description}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── What We Deliver ───────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 py-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={stagger}
        >
          <motion.h2 variants={fadeUp} className="text-3xl font-bold mb-4 text-center">What We Deliver</motion.h2>
          <motion.p variants={fadeUp} className="text-[#6B6960] text-center max-w-xl mx-auto mb-12">
            Measurable outcomes for regulatory teams.
          </motion.p>
          <motion.div variants={stagger} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { value: '68%', label: 'Faster Filing', detail: 'vs. manual workflows' },
              { value: '12→1', label: 'Tool Consolidation', detail: 'One platform replaces many' },
              { value: '6', label: 'Global Agencies', detail: 'FDA, EMA, PMDA & more' },
              { value: '0', label: 'Gateway Rejections', detail: 'AI-validated packages' },
            ].map((m) => (
              <motion.div key={m.label} variants={fadeUp} className="text-center p-6 rounded-xl bg-white border border-[#E8E6DC]">
                <div className="text-3xl font-bold text-[#D97757] mb-1">{m.value}</div>
                <div className="text-sm font-semibold mb-1">{m.label}</div>
                <div className="text-xs text-[#8A8880]">{m.detail}</div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* ── Why We're Different ────────────────────────────────────────── */}
      <section className="bg-white border-y border-[#E8E6DC]">
        <div className="max-w-4xl mx-auto px-6 py-20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            variants={stagger}
          >
            <motion.h2 variants={fadeUp} className="text-3xl font-bold mb-4 text-center">Why Concept2Cure Is Different</motion.h2>
            <motion.p variants={fadeUp} className="text-[#6B6960] text-center max-w-2xl mx-auto mb-12">
              Most regulatory tools digitize paperwork. We replace the entire workflow.
            </motion.p>
            <motion.div variants={stagger} className="space-y-6 max-w-2xl mx-auto">
              {[
                {
                  title: 'End-to-End, Not Point Solutions',
                  description: 'Competitors offer document management or submission gateways. Concept2Cure covers research, drafting, review, QC, and submission in one platform — no integrations required.',
                },
                {
                  title: 'AI That Understands Regulatory Context',
                  description: 'Our AI agents are trained on regulatory frameworks, not general-purpose text. They understand CTD structure, ICH guidelines, and agency-specific expectations.',
                },
                {
                  title: 'Regulatory Intelligence That Compounds',
                  description: 'Every submission enriches our proprietary intelligence layer. Over time, the platform learns patterns, anticipates deficiencies, and improves recommendations — a competitive moat that grows with use.',
                },
                {
                  title: 'Built for Teams, Not Individuals',
                  description: 'Multi-tenant architecture with role-based access, real-time collaboration, and audit trails designed for enterprise regulatory teams and CROs.',
                },
              ].map((item) => (
                <motion.div key={item.title} variants={fadeUp} className="flex gap-4 items-start">
                  <div className="w-2 h-2 rounded-full bg-[#D97757] mt-2 shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">{item.title}</h3>
                    <p className="text-sm text-[#6B6960] leading-relaxed">{item.description}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Coming Soon CTA ───────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 py-24 text-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={stagger}
        >
          <motion.div variants={fadeUp} className="inline-block mb-4 px-4 py-1.5 rounded-full bg-[#D97757]/10 text-[#D97757] text-sm font-medium">
            Beta Coming Soon
          </motion.div>
          <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-bold mb-4">
            Ready to transform your<br />regulatory workflow?
          </motion.h2>
          <motion.p variants={fadeUp} className="text-[#6B6960] max-w-lg mx-auto mb-8">
            We're onboarding select biotech, pharma, and CRO teams for early access.
            Join the waitlist to be first in line.
          </motion.p>
          <motion.button
            variants={fadeUp}
            onClick={() => setLocation('/concept2cure/signup')}
            className="px-8 py-3.5 rounded-lg bg-[#D97757] text-white font-medium hover:bg-[#C15F3C] transition-colors text-base"
          >
            Request Early Access
          </motion.button>
        </motion.div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#E8E6DC] bg-[#FAF9F5]">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-[#8A8880]">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-[#D97757] to-[#C15F3C] flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">C2C</span>
            </div>
            <span>&copy; {new Date().getFullYear()} Concept2Cure. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-[#8A8880]">
            <button onClick={() => setLocation('/concept2cure/legal/terms')} className="hover:text-[#6B6960] transition-colors">Terms</button>
            <button onClick={() => setLocation('/concept2cure/legal/privacy')} className="hover:text-[#6B6960] transition-colors">Privacy</button>
            <button onClick={() => setLocation('/concept2cure/login')} className="hover:text-[#6B6960] transition-colors">Sign In</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
