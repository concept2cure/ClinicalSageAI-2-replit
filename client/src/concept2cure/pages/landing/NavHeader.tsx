/**
 * Landing Page — Navigation Header
 */
import React from 'react';
import { useLocation } from 'wouter';
import { Logo } from './shared';

export function NavHeader() {
  const [, setLocation] = useLocation();

  return (
    <header className="sticky top-0 z-50 bg-[#FAFAF9]/80 backdrop-blur-xl border-b border-stone-200/60">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-3"
          aria-label="Scroll to top"
        >
          <Logo />
          <span className="text-base font-medium text-stone-900">Concept2Cure</span>
        </button>

        <nav
          className="hidden md:flex items-center gap-8 text-sm text-stone-600"
          aria-label="Main navigation"
        >
          <a href="#platform" className="hover:text-stone-900 transition-colors">
            Platform
          </a>
          <a href="#how-it-works" className="hover:text-stone-900 transition-colors">
            How It Works
          </a>
          <a href="#security" className="hover:text-stone-900 transition-colors">
            Security
          </a>
          <a href="#pricing" className="hover:text-stone-900 transition-colors">
            Pricing
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation('/concept2cure/demo')}
            className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg transition-colors"
          >
            <span className="flex h-1.5 w-1.5 relative" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-500" />
            </span>
            Live Demo
          </button>
          <button
            onClick={() => setLocation('/concept2cure/login')}
            className="px-4 py-2 text-sm font-medium text-stone-700 hover:text-stone-900 transition-colors"
          >
            Sign in
          </button>
          <button
            onClick={() => setLocation('/concept2cure/signup')}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
          >
            Start Free Trial
          </button>
        </div>
      </div>
    </header>
  );
}
