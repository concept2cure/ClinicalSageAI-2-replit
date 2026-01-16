// HomeLandingEnhanced.jsx – enterprise-grade landing page with hero section, metrics, features, and testimonials

import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import {
  FileText, BarChart2, Clock, Check, Zap, Shield, Globe, Sparkles, Users, ArrowRight, Database, FileSymlink, Loader2, ChevronDown, ChevronUp, PieChart, DollarSign, BarChart } from 'lucide-react'

// Interactive Disruption Card Component with expandable case studies
const DisruptionCard = ({ icon, title, legacy, summary, caseStudies }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg overflow-hidden">
      {/* Header Section - Always Visible */}
      <div className="p-4 sm:p-5 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="bg-blue-900/30 w-10 h-10 rounded-full flex items-center justify-center mr-4 flex-shrink-0">
              {icon}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {title}
                <span className="ml-2 line-through text-red-400 text-sm">Legacy: {legacy}</span>
              </h3>
              <p className="text-slate-300 text-sm">{summary}</p>
            </div>
          </div>
          <div className="flex-shrink-0 ml-4">
            {expanded ? (
              <ChevronUp className="w-5 h-5 text-blue-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-blue-400" />
            )}
          </div>
        </div>
      </div>

      {/* Expandable Case Studies */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-700 pt-4">
          <h4 className="text-sm font-semibold text-blue-300 mb-3">REAL-WORLD CASE STUDIES</h4>
          <div className="space-y-4">
            {caseStudies.map((study, index) => (
              <div key={index} className="bg-slate-800/50 rounded-lg p-4">
                <div className="flex flex-col sm:flex-row sm:items-center mb-3">
                  <h5 className="font-semibold text-white">{study.title}</h5>
                  <span className="text-xs text-slate-400 sm:ml-auto">{study.company}</span>
                </div>
                <p className="text-sm text-slate-300 mb-3">{study.results}</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                  {Object.entries(study.stats).map(([key, value], i) => {
                    // Determine icon based on stat key
                    let StatIcon = PieChart;
                    if (
                      key.toLowerCase().includes('cost') ||
                      key.toLowerCase().includes('saved') ||
                      key.toLowerCase().includes('dollar')
                    ) {
                      StatIcon = DollarSign;
                    } else if (
                      key.toLowerCase().includes('time') ||
                      key.toLowerCase().includes('speed')
                    ) {
                      StatIcon = Clock;
                    } else if (
                      key.toLowerCase().includes('rate') ||
                      key.toLowerCase().includes('efficiency')
                    ) {
                      StatIcon = BarChart;
                    }

                    return (
                      <div key={i} className="flex items-center bg-slate-700/30 rounded px-3 py-2">
                        <StatIcon className="w-4 h-4 text-slate-400 mr-2" />
                        <div className="flex flex-col text-xs">
                          <span className="text-slate-400 capitalize">
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          <span className="font-semibold text-white">{value}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

import AppPackagesBanner from '../components/AppPackagesBanner';
// SimpleSolutionBundles section removed as requested
import AdvancedFeatureCards from '../components/AdvancedFeatureCards';
{
  /* Removed CSRLibraryMetrics import - now integrated in AppPackagesBanner */
}
import { apiRequest } from '../lib/queryClient';

const TAGLINES = [
  'Turning Concepts into Cures – 2× faster INDs',
  'Automated CER & CSR intelligence that eliminates 90% manual formatting',
  'Regulatory‑grade PDFs, eCTD, ESG in one click',
  'AI‑guided study protocols save $2M average per trial',
];

const FEATURES = [
  {
    title: 'AI-powered Protocol Optimization',
    description:
      'Intelligently build stronger protocols using CSR data from thousands of similar trials',
    icon: <Sparkles className="w-6 h-6 text-blue-500" />,
  },
  {
    title: 'Automatic Document Generation',
    description: 'Create submission-ready regulatory documents with a single click',
    icon: <FileText className="w-6 h-6 text-indigo-500" />,
  },
  {
    title: 'Multi-region Compliance',
    description: 'Ensure compliance with FDA, EMA, PMDA and Health Canada standards automatically',
    icon: <Globe className="w-6 h-6 text-emerald-500" />,
  },
  {
    title: 'Real-time Validation',
    description: 'Identify and fix regulatory issues before submission with built-in validation',
    icon: <Check className="w-6 h-6 text-green-500" />,
  },
  {
    title: 'Accelerated Time-to-Market',
    description: 'Reduce regulatory preparation time by up to 60% with automated workflows',
    icon: <Zap className="w-6 h-6 text-amber-500" />,
  },
  {
    title: 'Enterprise-grade Security',
    description: 'HIPAA, GDPR and 21 CFR Part 11 compliant with SOC 2 Type II certification',
    icon: <Shield className="w-6 h-6 text-red-500" />,
  },
];

const METRICS = [
  {
    label: 'Time Savings',
    value: '60%',
    description: 'Average reduction in regulatory preparation time',
    icon: <Clock className="w-12 h-12 text-blue-500" />,
  },
  {
    label: 'Cost Reduction',
    value: '$2M',
    description: 'Average savings per trial with AI-guided protocols',
    icon: <BarChart2 className="w-12 h-12 text-indigo-500" />,
  },
  {
    label: 'Success Rate',
    value: '98%',
    description: 'First-time acceptance rate for submissions',
    icon: <Check className="w-12 h-12 text-emerald-500" />,
  },
  {
    label: 'Client Satisfaction',
    value: '4.9/5',
    description: 'Average client satisfaction rating',
    icon: <Users className="w-12 h-12 text-amber-500" />,
  },
];

// TESTIMONIALS and AGENCIES arrays removed as the sections are no longer needed

export default function HomeLandingEnhanced() {
  const [location] = useLocation();
  const [csrCount, setCsrCount] = useState(3021);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchCSRCount = async () => {
      setIsLoading(true);
      try {
        const response = await apiRequest('GET', '/api/reports/count');
        const data = await response.json();
        if (data && data.count) {
          setCsrCount(data.count);
        }
      } catch (error) {
        console.error('Error fetching CSR count:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCSRCount();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
      {/* Application Packages Banner */}
      <AppPackagesBanner currentPath={location} />

      {/* Hero Section - Compact Version */}
      <section className="relative overflow-hidden bg-gradient-to-b from-indigo-900 via-blue-900 to-blue-800 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[url('https://raw.githubusercontent.com/Concepts2Cures/assets/main/dna-pattern.svg')] bg-repeat opacity-30"></div>
        </div>
        <div className="container mx-auto px-6 pt-12 pb-16 relative z-10">
          <div className="max-w-4xl mx-auto text-center mb-8">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-700/30 backdrop-blur-sm text-blue-200 text-xs font-medium mb-4">
              <span className="flex h-1.5 w-1.5 rounded-full bg-blue-400 mr-1.5"></span>
              Enterprise Regulatory Intelligence Platform
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 bg-gradient-to-r from-blue-300 via-blue-100 to-indigo-200 text-transparent bg-clip-text">
              Transforming Regulatory <br className="hidden md:block" /> Intelligence for Life
              Sciences
            </h1>
            <p className="text-base text-blue-100 max-w-2xl mx-auto mb-6">
              Concept2Cures.AI delivers a comprehensive regulatory suite integrating advanced
              machine learning with industry-compliant frameworks to revolutionize global
              submissions and regulatory strategy.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <Link
                to="/signup"
                className="px-6 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-sm font-medium rounded-md shadow shadow-blue-900/30 transition-all duration-200"
              >
                Start Free Trial
              </Link>
              <Link
                to="/demo"
                className="px-6 py-2 bg-blue-800/40 hover:bg-blue-700/40 border border-blue-600/30 backdrop-blur-sm text-blue-100 text-sm font-medium rounded-md shadow-sm transition-all duration-200"
              >
                Request Demo
              </Link>
            </div>
          </div>

          {/* Highlighted Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
            {METRICS.map((metric, i) => (
              <div
                key={i}
                className="bg-gradient-to-br from-blue-800/40 to-indigo-900/40 backdrop-blur-sm border border-blue-700/30 rounded-md p-3 text-center transition-all duration-200 hover:bg-blue-800/50"
              >
                <div className="flex justify-center mb-2">
                  {React.cloneElement(metric.icon, { className: 'w-8 h-8', size: 20 })}
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-white mb-0.5">{metric.value}</h3>
                <p className="font-medium text-blue-200 text-sm mb-1">{metric.label}</p>
                <p className="text-xs text-blue-300">{metric.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 1440 80"
            className="w-full h-auto -mb-1"
          >
            <path
              fill="#ffffff"
              fillOpacity="1"
              d="M0,64L80,69.3C160,75,320,85,480,80C640,75,800,53,960,48C1120,43,1280,53,1360,58.7L1440,64L1440,80L1360,80C1280,80,1120,80,960,80C800,80,640,80,480,80C320,80,160,80,80,80L0,80Z"
            ></path>
          </svg>
        </div>
      </section>

      {/* CSR Intelligence Library Metrics - Now integrated into AppPackagesBanner */}

      {/* Value Proposition Section */}
      <AdvancedFeatureCards />

      {/* Disrupting the Status Quo Section - Compact, Interactive Version */}
      <section className="py-12 bg-gradient-to-r from-slate-900 to-indigo-900 text-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-8">
            <h2 className="inline-flex mx-auto px-6 py-2 rounded-full bg-blue-900/30 text-blue-300 text-sm font-medium mb-4">
              REIMAGINING REGULATORY INTELLIGENCE
            </h2>
            <h2 className="text-3xl font-bold mb-4">Disrupting the Status Quo</h2>
            <p className="text-lg text-slate-300 max-w-3xl mx-auto">
              Our AI-driven platform eliminates inefficiencies that have plagued the industry for
              decades with measurable, proven results.
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="space-y-3">
              {/* Time & Resource Efficiency */}
              <DisruptionCard
                icon={<Clock className="w-5 h-5 text-blue-400" />}
                title="60% Time Reduction"
                legacy="Months of Manual Work"
                summary="AI-driven workflow automation reduces submission time from months to weeks."
                caseStudies={[
                  {
                    title: 'Oncology IND Submission',
                    company: 'BioGenesis Therapeutics',
                    results:
                      'Submission preparation time reduced from 4 months to 6 weeks with 82% reduction in formatting errors',
                    stats: {
                      timeSaved: '70%',
                      costSaved: '$420,000',
                      accuracy: '99.2%',
                    },
                  },
                  {
                    title: 'Multi-Regional Protocol Submissions',
                    company: 'LumenTrials Inc.',
                    results:
                      'Simultaneous submissions to FDA and EMA prepared in parallel, reducing review cycles by 40%',
                    stats: {
                      timeSaved: '58%',
                      costSaved: '$280,000',
                      accuracy: '98.7%',
                    },
                  },
                ]}
              />

              {/* Data Unification */}
              <DisruptionCard
                icon={<BarChart2 className="w-5 h-5 text-indigo-400" />}
                title="Unified Intelligence Platform"
                legacy="Isolated Data Silos"
                summary="Connect thousands of CSRs and regulatory documents across therapeutic areas and regions."
                caseStudies={[
                  {
                    title: 'Cross-Program Insight Engine',
                    company: 'Phoenix Biologics',
                    results:
                      'Identified recurring regulatory issues across 3 development programs, preventing 7-figure submission delays',
                    stats: {
                      dataConnected: '12,400+ documents',
                      insightsGenerated: '341 actionable recommendations',
                      compliance: '100% regulatory alignment',
                    },
                  },
                  {
                    title: 'Historical Submission Analysis',
                    company: 'TheraSage Oncology',
                    results:
                      'Leveraged insights from 200+ prior submissions to optimize study design and documentation strategy',
                    stats: {
                      approvalRate: 'Increased by 27%',
                      reviewTime: 'Reduced by 31%',
                      costEfficiency: '42% budget reduction',
                    },
                  },
                ]}
              />

              {/* Multi-Regional Compliance */}
              <DisruptionCard
                icon={<Globe className="w-5 h-5 text-violet-400" />}
                title="Dynamic Multi-Region Compliance"
                legacy="Region-Specific Rework"
                summary="One platform handles FDA, EMA, PMDA and Health Canada submissions simultaneously."
                caseStudies={[
                  {
                    title: 'Global Phase 3 Submission',
                    company: 'Celeste Bio',
                    results:
                      'Concurrent submissions to 4 regulatory authorities with region-specific validation and zero rework',
                    stats: {
                      regionsSupported: 'FDA, EMA, PMDA, Health Canada',
                      complianceRate: '100% first-time acceptance',
                      resourceSaving: '62% resource reduction',
                    },
                  },
                  {
                    title: 'Adaptive Protocol Management',
                    company: 'NeuroBright Therapies',
                    results:
                      'Real-time compliance verification across multiple jurisdictions, enabling rapid protocol amendments',
                    stats: {
                      amendmentSpeed: '72% faster approval',
                      regulatoryChanges: 'Automatically incorporated',
                      validationTime: 'Minutes vs. weeks',
                    },
                  },
                ]}
              />
            </div>

            <div className="text-center mt-8">
              <Link to="/impact-analysis">
                <button className="inline-flex items-center px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-all duration-300 shadow-lg hover:shadow-blue-500/20">
                  See Detailed ROI Analysis
                  <ArrowRight className="ml-2 h-4 w-4" />
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="lg:w-1/2">
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                Redefining Regulatory Intelligence for the Modern Life Sciences Enterprise
              </h2>
              <p className="text-lg text-gray-700 mb-8">
                Concept2Cures.AI's proprietary intelligence platform streamlines complex regulatory
                processes through sophisticated machine learning algorithms, delivering
                unprecedented efficiency and precision while maintaining rigorous compliance with
                evolving global regulatory frameworks. Our platform offers 99.99% uptime with
                enterprise-grade SLAs and comprehensive disaster recovery.
              </p>
              <ul className="space-y-4">
                {TAGLINES.map((tagline, i) => (
                  <li key={i} className="flex items-start">
                    <span className="flex-shrink-0 h-6 w-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 mr-3">
                      <Check size={14} />
                    </span>
                    <span className="text-gray-700">{tagline}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link
                  to="/features"
                  className="inline-flex items-center text-blue-600 font-medium hover:text-blue-800"
                >
                  Explore All Features <ArrowRight size={16} className="ml-2" />
                </Link>
              </div>
            </div>
            <div className="lg:w-1/2 relative">
              <div className="absolute -top-6 -left-6 w-64 h-64 bg-blue-100 rounded-full mix-blend-multiply filter blur-2xl opacity-70 animate-blob"></div>
              <div className="absolute -bottom-8 -right-8 w-64 h-64 bg-indigo-100 rounded-full mix-blend-multiply filter blur-2xl opacity-70 animate-blob animation-delay-2000"></div>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-100 to-blue-100 transform rotate-6"></div>
              <div className="relative">
                <div className="bg-white shadow-xl rounded-2xl p-6 overflow-hidden">
                  <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">
                        TrialSage AI Dashboard
                      </h3>
                      <p className="text-sm text-gray-500">Real-time submission status</p>
                    </div>
                    <span className="px-3 py-1 text-xs font-semibold text-green-800 bg-green-100 rounded-full">
                      LIVE
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="text-sm font-medium text-gray-500 mb-1">Current Projects</div>
                      <div className="text-2xl font-bold text-gray-900">12</div>
                      <div className="text-xs mt-1 text-green-600">↑ 3 from last month</div>
                    </div>
                    <div className="bg-indigo-50 rounded-lg p-4">
                      <div className="text-sm font-medium text-gray-500 mb-1">
                        Avg. Time Savings
                      </div>
                      <div className="text-2xl font-bold text-gray-900">68%</div>
                      <div className="text-xs mt-1 text-green-600">↑ 5% from last quarter</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-3">
                          IND
                        </div>
                        <div>
                          <div className="text-sm font-medium">Oncology IND-23845</div>
                          <div className="text-xs text-gray-500">Phase 1/2 Trial</div>
                        </div>
                      </div>
                      <div className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded">
                        Ready for submission
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 mr-3">
                          CSR
                        </div>
                        <div>
                          <div className="text-sm font-medium">Phase 2 Report: LUM-578</div>
                          <div className="text-xs text-gray-500">Final Report</div>
                        </div>
                      </div>
                      <div className="bg-amber-100 text-amber-800 text-xs font-medium px-2 py-1 rounded">
                        95% Complete
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mr-3">
                          CER
                        </div>
                        <div>
                          <div className="text-sm font-medium">Regulatory Response MHRA</div>
                          <div className="text-xs text-gray-500">Expedited Review</div>
                        </div>
                      </div>
                      <div className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded">
                        In Progress
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integrated AI-Powered Solutions section completely removed as requested */}

      {/* Testimonials and Regulatory Authority sections completely removed as requested */}

      {/* Security & Compliance Section */}
      <section className="py-12 bg-slate-900">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center mb-10">
            <div className="inline-flex mx-auto px-4 py-1 rounded-full bg-blue-900/50 text-blue-300 text-sm font-medium mb-4">
              <Shield className="w-4 h-4 mr-2" />
              ENTERPRISE-GRADE SECURITY & COMPLIANCE
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">
              Built for Enterprise Life Sciences
            </h2>
            <p className="text-lg text-slate-300 max-w-3xl mx-auto">
              Our platform is designed with security-first architecture and maintains the highest
              industry standards for data protection and regulatory compliance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
              <div className="w-12 h-12 bg-blue-900/50 rounded-lg flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Enterprise Security</h3>
              <ul className="space-y-2 text-slate-300">
                <li className="flex items-start">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>SOC 2 Type II certified</span>
                </li>
                <li className="flex items-start">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>HIPAA and GDPR compliant</span>
                </li>
                <li className="flex items-start">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>End-to-end data encryption (AES-256)</span>
                </li>
                <li className="flex items-start">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Regular penetration testing</span>
                </li>
              </ul>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
              <div className="w-12 h-12 bg-indigo-900/50 rounded-lg flex items-center justify-center mb-4">
                <FileText className="w-6 h-6 text-indigo-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Regulatory Compliance</h3>
              <ul className="space-y-2 text-slate-300">
                <li className="flex items-start">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>21 CFR Part 11 compliant</span>
                </li>
                <li className="flex items-start">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>GxP validation framework</span>
                </li>
                <li className="flex items-start">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Comprehensive audit trail</span>
                </li>
                <li className="flex items-start">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Electronic signature capabilities</span>
                </li>
              </ul>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
              <div className="w-12 h-12 bg-emerald-900/50 rounded-lg flex items-center justify-center mb-4">
                <Clock className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Enterprise SLAs</h3>
              <ul className="space-y-2 text-slate-300">
                <li className="flex items-start">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>99.99% uptime guarantee</span>
                </li>
                <li className="flex items-start">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>24/7/365 dedicated support</span>
                </li>
                <li className="flex items-start">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>1-hour response for critical issues</span>
                </li>
                <li className="flex items-start">
                  <Check className="w-5 h-5 text-green-400 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Comprehensive disaster recovery</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="flex flex-col md:flex-row">
              <div className="md:w-2/3 p-10">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  Ready to accelerate your regulatory process?
                </h2>
                <p className="text-lg text-gray-600 mb-6">
                  Schedule a personalized demo to see how TrialSage can transform your clinical and
                  regulatory operations.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link
                    to="/signup"
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-md transition-colors"
                  >
                    Start Free Trial
                  </Link>
                  <Link
                    to="/demo"
                    className="px-6 py-3 bg-white border border-blue-600 text-blue-600 font-medium rounded-lg shadow-sm hover:bg-blue-50 transition-colors"
                  >
                    Request Demo
                  </Link>
                </div>
              </div>
              <div className="md:w-1/3 bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-10 flex flex-col justify-center">
                <h3 className="text-xl font-bold mb-4">Enterprise Solutions</h3>
                <p className="mb-6">
                  Custom solutions available for enterprise teams managing multiple programs.
                </p>
                <Link
                  to="/enterprise"
                  className="text-white font-medium inline-flex items-center hover:underline"
                >
                  Learn More <ArrowRight size={16} className="ml-2" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="text-white text-lg font-semibold mb-4">TrialSage Platform</h3>
              <ul className="space-y-2">
                <li>
                  <Link to="/solutions" className="hover:text-white transition-colors">
                    Solutions
                  </Link>
                </li>
                <li>
                  <Link to="/features" className="hover:text-white transition-colors">
                    Features
                  </Link>
                </li>
                <li>
                  <Link to="/pricing" className="hover:text-white transition-colors">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link to="/enterprise" className="hover:text-white transition-colors">
                    Enterprise
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-white text-lg font-semibold mb-4">Resources</h3>
              <ul className="space-y-2">
                <li>
                  <Link to="/blog" className="hover:text-white transition-colors">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link to="/case-studies" className="hover:text-white transition-colors">
                    Case Studies
                  </Link>
                </li>
                <li>
                  <Link to="/documentation" className="hover:text-white transition-colors">
                    Documentation
                  </Link>
                </li>
                <li>
                  <Link to="/webinars" className="hover:text-white transition-colors">
                    Webinars
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-white text-lg font-semibold mb-4">Company</h3>
              <ul className="space-y-2">
                <li>
                  <Link to="/about" className="hover:text-white transition-colors">
                    About Us
                  </Link>
                </li>
                <li>
                  <Link to="/team" className="hover:text-white transition-colors">
                    Team
                  </Link>
                </li>
                <li>
                  <Link to="/careers" className="hover:text-white transition-colors">
                    Careers
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="hover:text-white transition-colors">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-white text-lg font-semibold mb-4">Legal</h3>
              <ul className="space-y-2">
                <li>
                  <Link to="/privacy" className="hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:text-white transition-colors">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link to="/compliance" className="hover:text-white transition-colors">
                    Compliance
                  </Link>
                </li>
                <li>
                  <Link to="/security" className="hover:text-white transition-colors">
                    Security
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p>© {new Date().getFullYear()} Concepts2Cures.AI – All rights reserved.</p>
            <p className="mt-4 md:mt-0">
              Logos shown for regulatory context only; no endorsement implied.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
