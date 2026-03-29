/**
 * Landing Page — Platform Preview
 *
 * Clean mockup of Mission Control. Replaces the old fake dashboard
 * with a cleaner representation + honest framing.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { Section, fadeUp } from './shared';

function PlatformMockup() {
  return (
    <div className="relative mx-auto max-w-5xl">
      <div className="rounded-xl border border-stone-200 bg-white shadow-sm shadow-blue-900/8 overflow-hidden">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-4 py-3 bg-stone-50 border-b border-stone-200">
          <div className="flex gap-1.5" aria-hidden="true">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="px-4 py-1 bg-white rounded-md border border-stone-200 text-xs text-stone-500 font-mono">
              app.concept2cure.pro
            </div>
          </div>
        </div>

        {/* App content */}
        <div className="flex min-h-[320px]">
          {/* Sidebar */}
          <div className="w-52 bg-stone-900 text-white p-4 hidden md:block">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center">
                <svg
                  className="w-3.5 h-3.5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                  />
                </svg>
              </div>
              <span className="text-sm font-semibold">Concept2Cure</span>
            </div>
            <div className="space-y-1 text-xs">
              {[
                'Mission Control',
                'Deep Research',
                'CSR Builder',
                'eCTD Export',
                'CMC Platform',
                'Audit Trail',
              ].map((item, i) => (
                <div
                  key={item}
                  className={`px-3 py-2 rounded-lg ${i === 0 ? 'bg-white/10 text-white' : 'text-stone-500'}`}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 p-6 bg-[#FAFAF9]">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">Mission Control</h3>
                <p className="text-xs text-stone-500">3 active submissions</p>
              </div>
              <div className="px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                All Systems Healthy
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Readiness', value: '87%', bg: 'bg-blue-50', color: 'text-blue-600' },
                {
                  label: 'Active Agents',
                  value: '12',
                  bg: 'bg-violet-50',
                  color: 'text-violet-600',
                },
                {
                  label: 'Days to PDUFA',
                  value: '142',
                  bg: 'bg-amber-50',
                  color: 'text-amber-600',
                },
              ].map(m => (
                <div key={m.label} className={`${m.bg} rounded-xl p-3`}>
                  <div className={`text-base font-semibold ${m.color}`}>{m.value}</div>
                  <div className="text-[11px] text-stone-600 mt-0.5">{m.label}</div>
                </div>
              ))}
            </div>

            <div className="space-y-2.5">
              {[
                {
                  name: 'IND-2024-0847',
                  status: 'Module 2.7 Review',
                  progress: 78,
                  color: 'bg-blue-500',
                },
                {
                  name: 'NDA-2024-1203',
                  status: 'CSR Drafting',
                  progress: 45,
                  color: 'bg-violet-500',
                },
                {
                  name: '510(k)-K241567',
                  status: 'Predicate Analysis',
                  progress: 92,
                  color: 'bg-green-500',
                },
              ].map(s => (
                <div
                  key={s.name}
                  className="flex items-center gap-3 p-3 bg-white rounded-lg border border-stone-100"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-stone-900">{s.name}</div>
                    <div className="text-xs text-stone-500">{s.status}</div>
                  </div>
                  <div className="w-28 h-1.5 rounded-full bg-stone-100">
                    <div
                      className={`h-full rounded-full ${s.color}`}
                      style={{ width: `${s.progress}%` }}
                    />
                  </div>
                  <div className="text-xs font-medium text-stone-600 w-8 text-right">
                    {s.progress}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlatformSection() {
  return (
    <Section id="platform" className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div variants={fadeUp} className="text-center mb-12">
          <h2 className="text-lg font-medium sm:text-lg font-semibold text-stone-900 mb-4">
            Your entire regulatory operation, unified
          </h2>
          <p className="text-lg text-stone-600 max-w-2xl mx-auto">
            Mission Control gives you real-time visibility across every submission, every agent, and
            every deadline.
          </p>
        </motion.div>
        <motion.div variants={fadeUp}>
          <PlatformMockup />
        </motion.div>
      </div>
    </Section>
  );
}
