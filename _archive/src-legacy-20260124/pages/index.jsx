import React from 'react';
import { Link } from 'wouter';
import { Sparkles, FileText, ArrowRight } from 'lucide-react';
import Layout from '../components/Layout';
import OnboardingTour from '../components/OnboardingTour';

export default function Home() {
  return (
    <Layout>
      <OnboardingTour />
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 text-gray-800">
        <main className="max-w-6xl mx-auto py-24 px-6 text-center animate-fadeIn">
          <h1 className="text-5xl font-bold mb-6 text-blue-900 leading-tight">
            AI-Powered Chemistry, Manufacturing & Controls
          </h1>
          <p className="text-lg text-gray-600 max-w-4xl mx-auto mb-4">
            TrialSage™ eliminates manual bottlenecks in regulatory document creation by using AI to
            generate, analyze, and version ICH-compliant CMC documentation. Speed up IND, CTA, NDA,
            and global filing timelines with the only platform built for biotech execution speed.
          </p>
          <p className="text-md font-semibold text-blue-700 mb-10">
            One platform. Three modules. Total control:
            <span className="animate-pulse"> Generate ➝ Compare ➝ Export</span>
          </p>

          <div className="flex justify-center space-x-6 mb-12">
            <Link href="/module32">
              <a className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg shadow-lg flex items-center space-x-2 transition duration-150 ease-in-out cta-pulse">
                <Sparkles className="w-5 h-5" />
                <span className="relative group">
                  Start Generating
                  <span className="absolute -top-10 left-1/2 -translate-x-1/2 w-max px-2 py-1 text-xs bg-blue-800 text-white rounded shadow opacity-0 group-hover:opacity-100 transition duration-300">
                    Instantly draft ICH Module 3.2
                  </span>
                </span>
              </a>
            </Link>
            <Link href="/versions">
              <a className="bg-white hover:bg-gray-100 border border-blue-300 text-blue-800 font-medium px-8 py-3 rounded-lg shadow flex items-center space-x-2 transition duration-150 ease-in-out">
                <FileText className="w-5 h-5" />
                <span>View History</span>
              </a>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div className="p-6 bg-white rounded shadow hover:shadow-lg transition duration-150 ease-in-out">
              <h3 className="text-lg font-semibold text-blue-800 mb-2">Regulatory-Ready Output</h3>
              <p className="text-sm text-gray-600 mb-2">
                Generate fully structured ICH Module 3.2 documentation with AI-powered alignment to
                FDA, EMA, and global guidelines.
              </p>
              <Link href="/module32">
                <a className="inline-flex text-sm text-blue-700 hover:underline items-center">
                  View Generator <ArrowRight className="ml-1 w-4 h-4" />
                </a>
              </Link>
            </div>

            <div className="p-6 bg-white rounded shadow hover:shadow-lg transition duration-150 ease-in-out">
              <h3 className="text-lg font-semibold text-blue-800 mb-2">
                Version Control + Comparison
              </h3>
              <p className="text-sm text-gray-600 mb-2">
                Automatically save every draft. Visualize changes. Export annotated PDF and Word
                reports for regulatory tracking.
              </p>
              <Link href="/versions">
                <a className="inline-flex text-sm text-blue-700 hover:underline items-center">
                  Explore History <ArrowRight className="ml-1 w-4 h-4" />
                </a>
              </Link>
            </div>

            <div className="p-6 bg-white rounded shadow hover:shadow-lg transition duration-150 ease-in-out">
              <h3 className="text-lg font-semibold text-blue-800 mb-2">
                Built for Biotech Velocity
              </h3>
              <p className="text-sm text-gray-600 mb-2">
                Empower regulatory teams, scientists, and executives with intelligent document
                workflows and predictive quality insights.
              </p>
              <span className="inline-flex text-sm text-gray-400">
                Demo walk-through available at login
              </span>
            </div>
          </div>

          <div className="mt-20">
            <p className="text-sm text-gray-400">
              © {new Date().getFullYear()} TrialSage by Concept2Cures.AI. All rights reserved.
            </p>
          </div>
        </main>
      </div>
    </Layout>
  );
}
