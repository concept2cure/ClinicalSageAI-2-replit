import React, { useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Beaker, CheckCircle, ArrowRight, FileText, Plus, Atom } from 'lucide-react';
import ComprehensiveCMCPlatform from '../components/cmc/ComprehensiveCMCPlatform';

export default function CMCBlueprintGenerator() {
  const [activeTab, setActiveTab] = useState('generator');

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 bg-white">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center">
            <Link to="/" className="flex items-center text-[#0071e3] font-medium">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Link>
            <h1 className="text-xl font-semibold text-[#1d1d1f] ml-6">CMC Blueprint™ Generator</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-[#f2f7ff] p-6 rounded-lg mb-8">
            <h2 className="text-2xl font-semibold text-[#1d1d1f] mb-4">
              Chemistry, Manufacturing and Controls Blueprint Generator
            </h2>
            <p className="text-[#424245] mb-4">
              Create comprehensive CMC documentation for regulatory submissions with AI-powered
              insights. This module helps you generate high-quality Chemistry, Manufacturing, and
              Controls documents for FDA, EMA, and PMDA submissions.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div className="bg-white p-4 rounded border border-[#e5e5e7]">
                <h3 className="text-lg font-medium text-[#1d1d1f] mb-2">Key Features</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-[#06c] flex-shrink-0" />
                    <span>AI-powered document generation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-[#06c] flex-shrink-0" />
                    <span>Region-specific compliance checks</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-[#06c] flex-shrink-0" />
                    <span>Automatic risk assessment</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-[#06c] flex-shrink-0" />
                    <span>Formulation optimization</span>
                  </li>
                </ul>
              </div>
              <div className="bg-white p-4 rounded border border-[#e5e5e7]">
                <h3 className="text-lg font-medium text-[#1d1d1f] mb-2">Benefits</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-[#06c] flex-shrink-0" />
                    <span>71% faster module creation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-[#06c] flex-shrink-0" />
                    <span>Regulatory-compliant documentation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-[#06c] flex-shrink-0" />
                    <span>Traceable manufacturing processes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-[#06c] flex-shrink-0" />
                    <span>Integrated quality controls</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="border-b border-[#e5e5e7] mb-6">
            <div className="flex space-x-6">
              <button
                className={`pb-3 font-medium ${activeTab === 'generator' ? 'text-[#0071e3] border-b-2 border-[#0071e3]' : 'text-[#1d1d1f]'}`}
                onClick={() => setActiveTab('generator')}
              >
                Blueprint Generator
              </button>
              <button
                className={`pb-3 font-medium ${activeTab === 'templates' ? 'text-[#0071e3] border-b-2 border-[#0071e3]' : 'text-[#1d1d1f]'}`}
                onClick={() => setActiveTab('templates')}
              >
                Templates Library
              </button>
              <button
                className={`pb-3 font-medium ${activeTab === 'projects' ? 'text-[#0071e3] border-b-2 border-[#0071e3]' : 'text-[#1d1d1f]'}`}
                onClick={() => setActiveTab('projects')}
              >
                My Projects
              </button>
            </div>
          </div>

          {activeTab === 'generator' && (
            <div className="w-full">
              <ComprehensiveCMCPlatform />
            </div>
          )}

          {activeTab === 'templates' && (
            <div className="w-full">
              <iframe
                src="/document-templates"
                className="w-full h-[600px] border border-[#e5e5e7] rounded-lg"
                title="Document Templates"
              />
            </div>
          )}

          {activeTab === 'projects' && (
            <div className="bg-white border border-[#e5e5e7] rounded-lg">
              <div className="p-6 border-b border-[#e5e5e7] flex justify-between items-center">
                <h3 className="text-xl font-medium text-[#1d1d1f]">My CMC Projects</h3>
                <button className="px-4 py-2 bg-[#0071e3] text-white rounded-lg text-sm font-medium hover:bg-[#0077ed] transition-colors flex items-center">
                  <Plus className="w-4 h-4 mr-1" /> New Project
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#f5f5f7] text-[#1d1d1f]">
                    <tr>
                      <th className="px-6 py-3 text-left">Project Name</th>
                      <th className="px-6 py-3 text-left">Product Type</th>
                      <th className="px-6 py-3 text-left">Authority</th>
                      <th className="px-6 py-3 text-left">Last Updated</th>
                      <th className="px-6 py-3 text-left">Status</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5e5e7]">
                    <tr className="hover:bg-[#f5f5f7]">
                      <td className="px-6 py-4 text-[#1d1d1f] font-medium">XRT-290 CMC Package</td>
                      <td className="px-6 py-4 text-[#424245]">Small Molecule</td>
                      <td className="px-6 py-4 text-[#424245]">FDA</td>
                      <td className="px-6 py-4 text-[#424245]">April 20, 2025</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Complete
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-[#0071e3] hover:underline">View</button>
                      </td>
                    </tr>
                    <tr className="hover:bg-[#f5f5f7]">
                      <td className="px-6 py-4 text-[#1d1d1f] font-medium">BioCure mAb CMC</td>
                      <td className="px-6 py-4 text-[#424245]">Biologic</td>
                      <td className="px-6 py-4 text-[#424245]">EMA</td>
                      <td className="px-6 py-4 text-[#424245]">April 15, 2025</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          In Progress
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-[#0071e3] hover:underline">Continue</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
