/**
 * @fileoverview Branded Legal Page Layout
 * Consistent layout for all legal/compliance documents with company branding.
 */

import React from 'react';
import logoSrc from '@/assets/concept2cure-logo.jpg';

interface LegalPageLayoutProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

const LegalPageLayout: React.FC<LegalPageLayoutProps> = ({ title, lastUpdated, children }) => (
  <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'Lora', Georgia, serif" }}>
    {/* Header */}
    <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
        <a href="/concept2cure" className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-xl overflow-hidden shadow-sm">
            <img src={logoSrc} alt="Concept2Cure" className="w-full h-full object-cover object-center" />
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, transparent 40%, white 100%)' }} />
          </div>
          <span className="text-lg font-semibold text-stone-900" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
            Concept2Cure
          </span>
        </a>
        <a
          href="/concept2cure"
          className="text-sm text-stone-500 hover:text-stone-700 transition-colors"
          style={{ fontFamily: "'Poppins', Arial, sans-serif" }}
        >
          Back to Platform
        </a>
      </div>
    </header>

    {/* Document */}
    <main className="max-w-4xl mx-auto px-6 py-12">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        {/* Document header with brand accent */}
        <div className="px-10 pt-10 pb-6 border-b border-stone-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-8 rounded-full" style={{ background: 'linear-gradient(180deg, #d97757, #c15f3c)' }} />
            <h1 className="text-base font-semibold text-stone-900" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
              {title}
            </h1>
          </div>
          <p className="text-sm text-stone-500" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
            Last updated: {lastUpdated}
          </p>
          <p className="text-sm text-stone-500 mt-1" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
            Concept2Cure, Inc. — AI-Powered Regulatory Intelligence Platform
          </p>
        </div>

        {/* Document body */}
        <div className="px-10 py-8 prose prose-stone max-w-none">
          {children}
        </div>

        {/* Document footer */}
        <div className="px-10 py-6 bg-stone-50 border-t border-stone-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative w-8 h-8 rounded-lg overflow-hidden">
                <img src={logoSrc} alt="Concept2Cure" className="w-full h-full object-cover" />
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, transparent 40%, #faf9f5 100%)' }} />
              </div>
              <div>
                <p className="text-xs font-medium text-stone-700" style={{ fontFamily: "'Poppins', Arial, sans-serif" }}>
                  Concept2Cure, Inc.
                </p>
                <p className="text-[11px] text-stone-400">
                  Regulatory Intelligence for Life Sciences
                </p>
              </div>
            </div>
            <p className="text-[11px] text-stone-400">
              © {new Date().getFullYear()} Concept2Cure, Inc. All rights reserved.
            </p>
          </div>
        </div>
      </div>

      {/* Related legal links */}
      <div className="mt-8 flex flex-wrap gap-4 justify-center">
        {[
          { label: 'Terms of Service', href: '/concept2cure/legal/terms' },
          { label: 'Privacy Policy', href: '/concept2cure/legal/privacy' },
          { label: 'Data Processing Agreement', href: '/concept2cure/legal/dpa' },
          { label: 'Business Associate Agreement', href: '/concept2cure/legal/baa' },
          { label: 'Service Level Agreement', href: '/concept2cure/legal/sla' },
          { label: 'Cookie Policy', href: '/concept2cure/legal/cookies' },
          { label: 'Acceptable Use Policy', href: '/concept2cure/legal/aup' },
        ].map(link => (
          <a
            key={link.href}
            href={link.href}
            className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
            style={{ fontFamily: "'Poppins', Arial, sans-serif" }}
          >
            {link.label}
          </a>
        ))}
      </div>
    </main>
  </div>
);

export default LegalPageLayout;
