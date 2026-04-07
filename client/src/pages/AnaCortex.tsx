/**
 * AnA Cortex AI Assistant Page
 *
 * Full-page conversational AI interface for regulatory intelligence.
 * This is the standalone page version of the AnA Cortex chat.
 *
 * @module client/pages/AnaCortex
 */

import React from 'react';
import AnaCortexChat from '@/components/AnaCortexChat';
import { Brain, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

export default function AnaCortex() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200/60 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/client-portal">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Portal
                </Button>
              </Link>
              <div className="h-6 w-px bg-slate-200/60" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">Regulatory Intelligence</h1>
                  <p className="text-xs text-slate-500">Regulatory Intelligence Assistant</p>
                </div>
              </div>
            </div>
            <div className="text-sm text-slate-500">Powered by Concept2Cure RI</div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <AnaCortexChat className="h-[calc(100vh-180px)] shadow-sm border border-slate-200/60 bg-white/80" />
        </div>
      </main>

      {/* Footer hint */}
      <footer className="fixed bottom-0 left-0 right-0 py-2 text-center text-xs text-slate-500 bg-white/80 backdrop-blur-sm border-t border-slate-200/60">
        Concept2Cure RI provides regulatory guidance based on FDA regulations and industry best
        practices. Always verify critical information with official sources.
      </footer>
    </div>
  );
}
