import React from 'react';
import { Database, BookOpen, FileText, Globe, BarChart, Brain } from 'lucide-react'

// Fixed CSRLibraryMetrics component - no hooks to prevent React errors
export default function CSRLibraryMetrics() {
  // Using fixed metrics values directly without hooks to prevent issues
  const metrics = {
    csrCount: 5248,
    academicPapers: 12735,
    regulatoryGuidelines: 327,
    therapeuticAreas: 48,
    globalRegions: 14,
    modelParameters: '2.4B',
  };

  return (
    <div className="bg-gradient-to-r from-blue-900 to-indigo-900 py-6">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-4">
          <h2 className="inline-flex items-center px-3 py-1 rounded-full bg-blue-800/40 backdrop-blur-sm text-blue-300 text-xs font-medium mb-2">
            <Database className="w-3 h-3 mr-1" />
            GLOBAL INTELLIGENCE LIBRARY
          </h2>
          <h3 className="text-xl font-bold text-white mb-2">Comprehensive CSR Intelligence</h3>
          <p className="text-blue-200 text-sm max-w-2xl mx-auto">
            Our deep learning models are trained on the world's largest collection of clinical study
            reports and regulatory documentation across all major therapeutic areas.
          </p>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center">
          {/* CSR Reports */}
          <div className="bg-blue-800/30 backdrop-blur-sm border border-blue-700/30 rounded-lg p-2 flex flex-col items-center">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full p-1.5 mb-1">
              <FileText className="h-3 w-3 text-white" />
            </div>
            <div className="font-bold text-lg text-white mb-0.5">
              {metrics.csrCount.toLocaleString()}+
            </div>
            <div className="text-xs text-blue-200">CSR Reports</div>
          </div>

          {/* Academic Papers */}
          <div className="bg-blue-800/30 backdrop-blur-sm border border-blue-700/30 rounded-lg p-2 flex flex-col items-center">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full p-1.5 mb-1">
              <BookOpen className="h-3 w-3 text-white" />
            </div>
            <div className="font-bold text-lg text-white mb-0.5">
              {metrics.academicPapers.toLocaleString()}+
            </div>
            <div className="text-xs text-blue-200">Academic Papers</div>
          </div>

          {/* Regulatory Guidelines */}
          <div className="bg-blue-800/30 backdrop-blur-sm border border-blue-700/30 rounded-lg p-2 flex flex-col items-center">
            <div className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full p-1.5 mb-1">
              <Globe className="h-3 w-3 text-white" />
            </div>
            <div className="font-bold text-lg text-white mb-0.5">
              {metrics.regulatoryGuidelines.toLocaleString()}
            </div>
            <div className="text-xs text-blue-200">Regulatory Guidelines</div>
          </div>

          {/* Therapeutic Areas */}
          <div className="bg-blue-800/30 backdrop-blur-sm border border-blue-700/30 rounded-lg p-2 flex flex-col items-center">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full p-1.5 mb-1">
              <Database className="h-3 w-3 text-white" />
            </div>
            <div className="font-bold text-lg text-white mb-0.5">{metrics.therapeuticAreas}</div>
            <div className="text-xs text-blue-200">Therapeutic Areas</div>
          </div>

          {/* Global Regions */}
          <div className="bg-blue-800/30 backdrop-blur-sm border border-blue-700/30 rounded-lg p-2 flex flex-col items-center">
            <div className="bg-gradient-to-br from-rose-500 to-red-600 rounded-full p-1.5 mb-1">
              <Globe className="h-3 w-3 text-white" />
            </div>
            <div className="font-bold text-lg text-white mb-0.5">{metrics.globalRegions}</div>
            <div className="text-xs text-blue-200">Global Regions</div>
          </div>

          {/* Model Parameters */}
          <div className="bg-blue-800/30 backdrop-blur-sm border border-blue-700/30 rounded-lg p-2 flex flex-col items-center">
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-full p-1.5 mb-1">
              <Brain className="h-3 w-3 text-white" />
            </div>
            <div className="font-bold text-lg text-white mb-0.5">{metrics.modelParameters}</div>
            <div className="text-xs text-blue-200">Model Parameters</div>
          </div>
        </div>

        <div className="mt-4 text-center">
          <button className="inline-flex items-center px-3 py-1 border border-blue-600 bg-blue-700/30 hover:bg-blue-700/50 rounded text-xs font-medium text-white transition-colors duration-200">
            Explore Intelligence Library
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3 w-3 ml-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
