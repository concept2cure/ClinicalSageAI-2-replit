// IMPORTANT: THIS FILE IS A HARD-CODED VERSION OF AppPackagesBanner.jsx
// DO NOT MODIFY THIS FILE OR THE ORIGINAL COMPONENT
// This preserves the perfect enterprise-grade styling and alignment that was requested
// Created to prevent any future accidental changes or regressions

import React from 'react';
import { Link } from 'wouter';
import { FileArchive, Database, Globe, Beaker, ChevronRight } from 'lucide-react'

function AppPackagesBanner() {
  return (
    <>
      {/* Hero Section with Intro Text */}
      <div className="bg-gradient-to-b from-slate-900 to-indigo-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl font-extrabold text-white sm:text-5xl mb-6 tracking-tight">
              <span className="text-blue-400">TrialSage</span>™ - AI-Powered Clinical Intelligence
            </h1>
            <p className="mt-5 text-lg text-blue-100 mb-12">
              The industry leader in AI-driven regulatory technology, transforming how
              pharmaceutical and biotech organizations navigate global submission processes.
            </p>
          </div>

          {/* Feature Tiles Grid - Top row */}
          <div className="flex justify-center mb-4 px-6">
            <div
              className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 w-full max-w-6xl"
              style={{ gap: '1px' }}
            >
              {/* Tile 1: Accelerate IND */}
              <Link to="/ind-solution" className="block">
                <div
                  className="bg-purple-600 hover:brightness-110 transition-all duration-200 border-t-0 border-l-0 border-r-0 border-b-[1px] border-white/10 h-full flex flex-col justify-between"
                  style={{ padding: '10px', minHeight: '82px' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div
                        className="bg-white/10 rounded-sm flex items-center justify-center"
                        style={{ width: '18px', height: '18px' }}
                      >
                        <FileArchive size={10} />
                      </div>
                      <h3 className="text-xs font-semibold text-white ml-1.5 tracking-tight">
                        Accelerate IND
                      </h3>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] leading-tight text-white/75 mt-1.5">
                      Your AI partner for IND success
                    </p>
                    <div className="flex justify-end mt-1">
                      <ChevronRight size={9} className="text-white/60" />
                    </div>
                  </div>
                </div>
              </Link>

              {/* Tile 2: CSR Intelligence */}
              <Link to="/csr-intelligence" className="block">
                <div
                  className="bg-emerald-600 hover:brightness-110 transition-all duration-200 border-t-0 border-l-0 border-r-0 border-b-[1px] border-white/10 h-full flex flex-col justify-between"
                  style={{ padding: '10px', minHeight: '82px' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div
                        className="bg-white/10 rounded-sm flex items-center justify-center"
                        style={{ width: '18px', height: '18px' }}
                      >
                        <Database size={10} />
                      </div>
                      <h3 className="text-xs font-semibold text-white ml-1.5 tracking-tight">
                        CSR Intelligence
                      </h3>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] leading-tight text-white/75 mt-1.5">
                      CSR analysis and optimization
                    </p>
                    <div className="flex justify-end mt-1">
                      <ChevronRight size={9} className="text-white/60" />
                    </div>
                  </div>
                </div>
              </Link>

              {/* Tile 3: CER Module */}
              <Link to="/cer-generator" className="block">
                <div
                  className="bg-rose-600 hover:brightness-110 transition-all duration-200 border-t-0 border-l-0 border-r-0 border-b-[1px] border-white/10 h-full flex flex-col justify-between"
                  style={{ padding: '10px', minHeight: '82px' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div
                        className="bg-white/10 rounded-sm flex items-center justify-center"
                        style={{ width: '18px', height: '18px' }}
                      >
                        <FileArchive size={10} />
                      </div>
                      <h3 className="text-xs font-semibold text-white ml-1.5 tracking-tight">
                        CER Module
                      </h3>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] leading-tight text-white/75 mt-1.5">
                      Clinical evaluation reports
                    </p>
                    <div className="flex justify-end mt-1">
                      <ChevronRight size={9} className="text-white/60" />
                    </div>
                  </div>
                </div>
              </Link>

              {/* Tile 4: Study & Protocol */}
              <Link to="/study-protocol-builder" className="block">
                <div
                  className="bg-blue-600 hover:brightness-110 transition-all duration-200 border-t-0 border-l-0 border-r-0 border-b-[1px] border-white/10 h-full flex flex-col justify-between"
                  style={{ padding: '10px', minHeight: '82px' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div
                        className="bg-white/10 rounded-sm flex items-center justify-center"
                        style={{ width: '18px', height: '18px' }}
                      >
                        <Beaker size={10} />
                      </div>
                      <h3 className="text-xs font-semibold text-white ml-1.5 tracking-tight">
                        Study & Protocol
                      </h3>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] leading-tight text-white/75 mt-1.5">
                      Statistical model-driven design
                    </p>
                    <div className="flex justify-end mt-1">
                      <ChevronRight size={9} className="text-white/60" />
                    </div>
                  </div>
                </div>
              </Link>

              {/* Tile 5: Use Case Library */}
              <Link to="/usecase-library" className="block">
                <div
                  className="bg-teal-600 hover:brightness-110 transition-all duration-200 border-t-0 border-l-0 border-r-0 border-b-[1px] border-white/10 h-full flex flex-col justify-between"
                  style={{ padding: '10px', minHeight: '82px' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div
                        className="bg-white/10 rounded-sm flex items-center justify-center"
                        style={{ width: '18px', height: '18px' }}
                      >
                        <Database size={10} />
                      </div>
                      <h3 className="text-xs font-semibold text-white ml-1.5 tracking-tight">
                        Use Case Library
                      </h3>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] leading-tight text-white/75 mt-1.5">
                      Regulatory case studies & templates
                    </p>
                    <div className="flex justify-end mt-1">
                      <ChevronRight size={9} className="text-white/60" />
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </div>

          {/* Client Portal Tiles */}
          <div className="flex justify-center px-6">
            <div
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 w-full max-w-6xl"
              style={{ gap: '1px' }}
            >
              {/* Client Access Portal */}
              <Link to="/client-portal" className="block">
                <div
                  className="bg-red-600 hover:brightness-110 transition-all duration-200 border-t-0 border-l-0 border-r-0 border-b-[1px] border-white/10 h-full flex flex-col justify-between"
                  style={{ padding: '10px', minHeight: '82px' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div
                        className="bg-white/10 rounded-sm flex items-center justify-center"
                        style={{ width: '18px', height: '18px' }}
                      >
                        <FileArchive size={10} />
                      </div>
                      <h3 className="text-xs font-semibold text-white ml-1.5 tracking-tight">
                        Client Access
                      </h3>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] leading-tight text-white/75 mt-1.5">
                      Secure portal login
                    </p>
                    <div className="flex justify-end mt-1">
                      <ChevronRight size={9} className="text-white/60" />
                    </div>
                  </div>
                </div>
              </Link>

              {/* AI Co-pilot */}
              <Link to="/ai-copilot" className="block">
                <div
                  className="bg-violet-600 hover:brightness-110 transition-all duration-200 border-t-0 border-l-0 border-r-0 border-b-[1px] border-white/10 h-full flex flex-col justify-between"
                  style={{ padding: '10px', minHeight: '82px' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div
                        className="bg-white/10 rounded-sm flex items-center justify-center"
                        style={{ width: '18px', height: '18px' }}
                      >
                        <Globe size={10} />
                      </div>
                      <h3 className="text-xs font-semibold text-white ml-1.5 tracking-tight">
                        AI Co-pilot
                      </h3>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] leading-tight text-white/75 mt-1.5">
                      Advanced AI assistance
                    </p>
                    <div className="flex justify-end mt-1">
                      <ChevronRight size={9} className="text-white/60" />
                    </div>
                  </div>
                </div>
              </Link>

              {/* SmartDocs Generator */}
              <Link to="/smartdocs-generator" className="block">
                <div
                  className="bg-purple-600 hover:brightness-110 transition-all duration-200 border-t-0 border-l-0 border-r-0 border-b-[1px] border-white/10 h-full flex flex-col justify-between"
                  style={{ padding: '10px', minHeight: '82px' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div
                        className="bg-white/10 rounded-sm flex items-center justify-center"
                        style={{ width: '18px', height: '18px' }}
                      >
                        <Database size={10} />
                      </div>
                      <h3 className="text-xs font-semibold text-white ml-1.5 tracking-tight">
                        SmartDocs Generator™
                      </h3>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] leading-tight text-white/75 mt-1.5">
                      CERs, protocols, summaries—drafted in hours, not weeks
                    </p>
                    <div className="flex justify-end mt-1">
                      <ChevronRight size={9} className="text-white/60" />
                    </div>
                  </div>
                </div>
              </Link>

              {/* InsightVault */}
              <Link to="/insight-vault" className="block">
                <div
                  className="bg-gray-700 hover:brightness-110 transition-all duration-200 border-t-0 border-l-0 border-r-0 border-b-[1px] border-white/10 h-full flex flex-col justify-between"
                  style={{ padding: '10px', minHeight: '82px' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div
                        className="bg-white/10 rounded-sm flex items-center justify-center"
                        style={{ width: '18px', height: '18px' }}
                      >
                        <Database size={10} />
                      </div>
                      <h3 className="text-xs font-semibold text-white ml-1.5 tracking-tight">
                        InsightVault™
                      </h3>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] leading-tight text-white/75 mt-1.5">
                      A DMS that actually understands your trial
                    </p>
                    <div className="flex justify-end mt-1">
                      <ChevronRight size={9} className="text-white/60" />
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </div>

          {/* Intelligence Library - metrics design */}
          <div className="mt-6">
            <div className="bg-[#0f1625] py-3 rounded-lg">
              <div className="max-w-3xl mx-auto px-4">
                <div className="text-center mb-2">
                  <h2 className="inline-flex items-center px-2 py-1 rounded-full bg-[#1b2235] text-blue-200 text-xs font-medium mb-1">
                    <Database className="w-3 h-3 mr-1" />
                    INTELLIGENCE LIBRARY
                  </h2>
                  <h3 className="text-lg font-bold text-white mb-1">
                    Comprehensive CSR Intelligence
                  </h3>
                  <p className="text-blue-200 text-sm max-w-md mx-auto">
                    Deep learning models trained on the world's largest collection of clinical
                    reports.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-center mt-3">
                  {/* CSR Reports */}
                  <div className="group relative">
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -mt-2.5 w-5 h-5 rounded-full bg-blue-500"></div>
                    <div className="bg-[#0c111d] pt-4 pb-2 px-3 rounded-md">
                      <div className="font-bold text-white text-lg">
                        5,248<span className="text-xs font-normal text-blue-300">+</span>
                      </div>
                      <div className="text-xs text-blue-200 mt-0.5">CSR Reports</div>
                    </div>
                  </div>

                  {/* Academic Papers */}
                  <div className="group relative">
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -mt-2.5 w-5 h-5 rounded-full bg-purple-500"></div>
                    <div className="bg-[#0c111d] pt-4 pb-2 px-3 rounded-md">
                      <div className="font-bold text-white text-lg">
                        12,735<span className="text-xs font-normal text-blue-300">+</span>
                      </div>
                      <div className="text-xs text-blue-200 mt-0.5">Papers</div>
                    </div>
                  </div>

                  {/* Regulatory Guidelines */}
                  <div className="group relative">
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -mt-2.5 w-5 h-5 rounded-full bg-cyan-500"></div>
                    <div className="bg-[#0c111d] pt-4 pb-2 px-3 rounded-md">
                      <div className="font-bold text-white text-lg">327</div>
                      <div className="text-xs text-blue-200 mt-0.5">Guidelines</div>
                    </div>
                  </div>

                  {/* Therapeutic Areas */}
                  <div className="group relative">
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -mt-2.5 w-5 h-5 rounded-full bg-emerald-500"></div>
                    <div className="bg-[#0c111d] pt-4 pb-2 px-3 rounded-md">
                      <div className="font-bold text-white text-lg">48</div>
                      <div className="text-xs text-blue-200 mt-0.5">Areas</div>
                    </div>
                  </div>

                  {/* Global Regions */}
                  <div className="group relative">
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -mt-2.5 w-5 h-5 rounded-full bg-rose-500"></div>
                    <div className="bg-[#0c111d] pt-4 pb-2 px-3 rounded-md">
                      <div className="font-bold text-white text-lg">14</div>
                      <div className="text-xs text-blue-200 mt-0.5">Regions</div>
                    </div>
                  </div>

                  {/* Model Parameters */}
                  <div className="group relative">
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -mt-2.5 w-5 h-5 rounded-full bg-amber-500"></div>
                    <div className="bg-[#0c111d] pt-4 pb-2 px-3 rounded-md">
                      <div className="font-bold text-white text-lg">2.4B</div>
                      <div className="text-xs text-blue-200 mt-0.5">Params</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TrialSage Platform Section - Enterprise Grade */}
      <div className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row gap-16">
            <div className="md:w-5/12">
              <div className="sticky top-10">
                <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold mb-6">
                  INTRODUCING
                </div>
                <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-6">
                  The TrialSage<span className="text-blue-600">™</span> Platform
                </h2>
                <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                  Our flagship AI-driven platform transforms regulatory workflows with unprecedented
                  efficiency, data-backed insights, and multi-region compliance automation.
                </p>
                <div className="space-y-6 mb-8">
                  <div className="flex">
                    <div className="flex-shrink-0 h-10 w-10 rounded-md bg-blue-600 flex items-center justify-center">
                      <FileArchive className="h-5 w-5 text-white" />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Accelerate Submissions
                      </h3>
                      <p className="mt-1 text-gray-600">
                        Reduce preparation time by 60% with AI-powered generation, validation, and
                        formatting.
                      </p>
                    </div>
                  </div>

                  <div className="flex">
                    <div className="flex-shrink-0 h-10 w-10 rounded-md bg-indigo-600 flex items-center justify-center">
                      <Database className="h-5 w-5 text-white" />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-semibold text-gray-900">CSR Intelligence</h3>
                      <p className="mt-1 text-gray-600">
                        Access insights from thousands of clinical study reports to optimize your
                        approach.
                      </p>
                    </div>
                  </div>

                  <div className="flex">
                    <div className="flex-shrink-0 h-10 w-10 rounded-md bg-emerald-600 flex items-center justify-center">
                      <Globe className="h-5 w-5 text-white" />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-semibold text-gray-900">Global Compliance</h3>
                      <p className="mt-1 text-gray-600">
                        Automated validation for FDA, EMA, PMDA and Health Canada regulatory
                        standards.
                      </p>
                    </div>
                  </div>
                </div>

                <Link to="/platform">
                  <button className="inline-flex items-center px-5 py-3 border border-transparent rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 font-medium transition-colors">
                    Explore Platform Capabilities
                    <ChevronRight className="ml-2" />
                  </button>
                </Link>
              </div>
            </div>

            <div className="md:w-7/12 relative">
              <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-2xl">
                <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 border-b border-slate-700 flex items-center">
                  <div className="flex space-x-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  </div>
                  <div className="flex-1 text-center text-gray-400 text-sm">
                    TrialSage™ Intelligence Dashboard{' '}
                    <span className="px-1.5 py-0.5 text-xs bg-slate-700 rounded ml-1">
                      Interface Preview
                    </span>
                  </div>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-gradient-to-br from-blue-900/40 to-indigo-900/40 backdrop-blur-sm border border-blue-800/30 rounded-lg p-4">
                      <div className="text-sm font-medium text-gray-400 mb-1">
                        Active Submissions
                      </div>
                      <div className="text-2xl font-bold text-blue-300">14</div>
                      <div className="text-xs mt-2 text-emerald-400 flex items-center">
                        <span className="mr-1">↑</span> 3 from last month
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-emerald-900/40 to-teal-900/40 backdrop-blur-sm border border-emerald-800/30 rounded-lg p-4">
                      <div className="text-sm font-medium text-gray-400 mb-1">Time Saved</div>
                      <div className="text-2xl font-bold text-emerald-300">1,243 hrs</div>
                      <div className="text-xs mt-2 text-emerald-400 flex items-center">
                        <span className="mr-1">↑</span> 412 from Q1
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="bg-slate-800/70 border border-slate-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <div className="h-8 w-8 rounded-md bg-blue-900/50 flex items-center justify-center text-blue-400 mr-3">
                            <FileArchive className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-gray-200 font-medium">Oncology IND-23845</div>
                            <div className="text-xs text-gray-400">FDA Submission</div>
                          </div>
                        </div>
                        <div className="bg-emerald-900/30 text-emerald-400 text-xs font-medium px-2.5 py-1 rounded">
                          Ready to Submit
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-xs text-gray-400 mt-3">
                        <div>Technical validation: 100%</div>
                        <div>Last updated: 2h ago</div>
                      </div>
                    </div>

                    <div className="bg-slate-800/70 border border-slate-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <div className="h-8 w-8 rounded-md bg-indigo-900/50 flex items-center justify-center text-indigo-400 mr-3">
                            <Database className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-gray-200 font-medium">LUM-578 CSR Analysis</div>
                            <div className="text-xs text-gray-400">Phase 2 Reports</div>
                          </div>
                        </div>
                        <div className="bg-amber-900/30 text-amber-400 text-xs font-medium px-2.5 py-1 rounded">
                          In Progress
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-xs text-gray-400 mt-3">
                        <div>Analysis: 75% complete</div>
                        <div>ETA: 3h remaining</div>
                      </div>
                    </div>

                    <div className="bg-slate-800/70 border border-slate-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <div className="h-8 w-8 rounded-md bg-purple-900/50 flex items-center justify-center text-purple-400 mr-3">
                            <Beaker className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-gray-200 font-medium">
                              MHRA Investigational Device
                            </div>
                            <div className="text-xs text-gray-400">CER Validation</div>
                          </div>
                        </div>
                        <div className="bg-blue-900/30 text-blue-400 text-xs font-medium px-2.5 py-1 rounded">
                          QC Review
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-xs text-gray-400 mt-3">
                        <div>Review cycle: 2 of 3</div>
                        <div>Due: Tomorrow</div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-700/50 pt-4">
                    <div className="flex justify-between items-center mb-3">
                      <div className="text-sm font-medium text-gray-300">Recent Insights</div>
                      <div className="text-xs text-blue-400">View all</div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-start gap-3">
                        <div className="h-6 w-6 rounded-full bg-blue-600/30 flex-shrink-0 flex items-center justify-center mt-0.5">
                          <span className="text-xs text-blue-300">AI</span>
                        </div>
                        <div>
                          <p className="text-xs text-gray-300 leading-relaxed">
                            We analyzed your endpoints and found 3 similar trials with 15% higher
                            success rates using modified dosing schedule.
                          </p>
                          <div className="text-[10px] text-gray-500 mt-1">12 minutes ago</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="h-6 w-6 rounded-full bg-emerald-600/30 flex-shrink-0 flex items-center justify-center mt-0.5">
                          <span className="text-xs text-emerald-300">QC</span>
                        </div>
                        <div>
                          <p className="text-xs text-gray-300 leading-relaxed">
                            Your Oncology IND has passed all 247 regulatory checks and is cleared
                            for submission.
                          </p>
                          <div className="text-[10px] text-gray-500 mt-1">1 hour ago</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default AppPackagesBanner;
