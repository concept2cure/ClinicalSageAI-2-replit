import React from 'react';
import { Link } from 'wouter';
import { ArrowLeft, FileText, CheckCircle, Download } from 'lucide-react'

export default function CERGenerator() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 bg-white">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center">
            <Link to="/" className="flex items-center text-[#0071e3] font-medium">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Link>
            <h1 className="text-xl font-semibold text-[#1d1d1f] ml-6">CER Generator™</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-[#f2f7ff] p-6 rounded-lg mb-8">
            <h2 className="text-2xl font-semibold text-[#1d1d1f] mb-4">
              Clinical Evaluation Report Generator
            </h2>
            <p className="text-[#424245] mb-4">
              Generate compliant clinical evaluation reports with intelligent data extraction from
              regulatory sources. This module leverages AI to streamline the creation of CERs for
              medical devices and pharmaceuticals.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div className="bg-white p-4 rounded border border-[#e5e5e7]">
                <h3 className="text-lg font-medium text-[#1d1d1f] mb-2">Key Features</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-[#06c] flex-shrink-0" />
                    <span>Automated report generation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-[#06c] flex-shrink-0" />
                    <span>Literature review automation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-[#06c] flex-shrink-0" />
                    <span>MDR/IVDR compliance tools</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-[#06c] flex-shrink-0" />
                    <span>Regulatory gap analysis</span>
                  </li>
                </ul>
              </div>
              <div className="bg-white p-4 rounded border border-[#e5e5e7]">
                <h3 className="text-lg font-medium text-[#1d1d1f] mb-2">Benefits</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-[#06c] flex-shrink-0" />
                    <span>68% reduction in report creation time</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-[#06c] flex-shrink-0" />
                    <span>Ensures latest regulatory requirements</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-[#06c] flex-shrink-0" />
                    <span>Reduces regulatory submission risk</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-[#06c] flex-shrink-0" />
                    <span>Comprehensive data tracking</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#e5e5e7] rounded-lg p-6 mb-8">
            <h3 className="text-xl font-medium text-[#1d1d1f] mb-4">Generate New CER</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-[#1d1d1f] mb-2">
                  Product Name
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-[#e5e5e7] rounded focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  placeholder="Enter product name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1d1d1f] mb-2">
                  Device Category
                </label>
                <select className="w-full px-3 py-2 border border-[#e5e5e7] rounded focus:outline-none focus:ring-2 focus:ring-[#0071e3]">
                  <option>Select category</option>
                  <option>Medical Device</option>
                  <option>In Vitro Diagnostic</option>
                  <option>Digital Therapeutic</option>
                  <option>Software as Medical Device</option>
                </select>
              </div>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-[#1d1d1f] mb-2">
                Upload Supporting Documents
              </label>
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[#e5e5e7] rounded cursor-pointer hover:bg-[#f5f5f7]">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <FileText className="w-8 h-8 mb-3 text-[#86868b]" />
                    <p className="text-sm text-[#424245]">
                      Drag and drop files here, or click to browse
                    </p>
                    <p className="text-xs text-[#86868b]">PDFs, DOC, XML up to 50MB each</p>
                  </div>
                  <input type="file" className="hidden" multiple />
                </label>
              </div>
            </div>
            <div className="flex justify-end">
              <button className="px-6 py-2.5 bg-[#0071e3] text-white rounded-lg font-medium hover:bg-[#0077ed] transition-colors">
                Generate CER Report
              </button>
            </div>
          </div>

          <div className="bg-white border border-[#e5e5e7] rounded-lg p-6">
            <h3 className="text-xl font-medium text-[#1d1d1f] mb-4">Recent Reports</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#f5f5f7] text-[#1d1d1f]">
                  <tr>
                    <th className="px-4 py-2 text-left">Report Name</th>
                    <th className="px-4 py-2 text-left">Generated Date</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e5e7]">
                  <tr className="hover:bg-[#f5f5f7]">
                    <td className="px-4 py-3 text-[#1d1d1f]">CardiaSense CER 2025</td>
                    <td className="px-4 py-3 text-[#86868b]">April 15, 2025</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Complete
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button className="flex items-center text-[#0071e3] hover:underline">
                        <Download className="w-4 h-4 mr-1" /> Download
                      </button>
                    </td>
                  </tr>
                  <tr className="hover:bg-[#f5f5f7]">
                    <td className="px-4 py-3 text-[#1d1d1f]">GlucoMonitor Plus CER</td>
                    <td className="px-4 py-3 text-[#86868b]">April 2, 2025</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Complete
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button className="flex items-center text-[#0071e3] hover:underline">
                        <Download className="w-4 h-4 mr-1" /> Download
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
