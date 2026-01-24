// HomeLandingProtected.jsx - Category-Defining Platform for Clinical Intelligence
import React, { useState } from 'react';
import { Link } from 'wouter';
import {
  ArrowRight,
  Clock,
  DollarSign,
  ShieldCheck,
  Brain,
  FileText,
  FileCheck,
  BarChart2,
  Zap,
  CheckCircle,
  X,
  ArrowUpRight,
  BookOpen,
  LayoutDashboard,
  Beaker,
} from 'lucide-react';

// The Status Quo Problems - based on customer pain points
const statusQuoProblems = [
  {
    title: 'CSRs: Massive PDFs Nobody Reads',
    description:
      "Critical CSRs are massive static PDFs that nobody reads in time. No insights until trial ends, then teams manually analyze documents when it's too late to make adjustments.",
    icon: <FileText className="w-6 h-6 text-red-500" />,
    stat: '500+',
    statLabel: 'Pages per CSR',
  },
  {
    title: 'INDs Take 12+ Months & $1M',
    description:
      'INDs take a full year and require expensive consultants. Teams compile applications in Word documents with high risk of missing critical pieces or regulatory issues.',
    icon: <Clock className="w-6 h-6 text-red-500" />,
    stat: '$1M+',
    statLabel: 'In consulting fees',
  },
  {
    title: 'Every Tool is a Silo',
    description:
      "Every submission is a war room. Regulatory submissions, trial operations, and data analysis live in separate systems that don't communicate, creating inefficiencies and delays.",
    icon: <X className="w-6 h-6 text-red-500" />,
    stat: '5-7',
    statLabel: 'Disconnected systems',
  },
  {
    title: 'Protocol Design is Guesswork',
    description:
      "Protocol design is based on intuition rather than data. AI 'assistants' don't understand regulatory requirements, leading to costly amendments and delays.",
    icon: <Brain className="w-6 h-6 text-red-500" />,
    stat: '2.3',
    statLabel: 'Amendments per study',
  },
];

// ROI Metrics - real numbers showing the business impact
const roiMetrics = [
  {
    metric: 'IND Preparation Time',
    traditional: '14 months',
    withTrialSage: '5-7 months',
    savings: '50-64%',
    icon: <Clock className="w-6 h-6 text-emerald-600" />,
  },
  {
    metric: 'Protocol Amendments',
    traditional: '2.3 per study',
    withTrialSage: '0.9 per study',
    savings: '61%',
    icon: <FileText className="w-6 h-6 text-emerald-600" />,
  },
  {
    metric: 'Regulatory Query Response',
    traditional: '8-12 days',
    withTrialSage: '24-48 hours',
    savings: 'Up to 83%',
    icon: <Zap className="w-6 h-6 text-emerald-600" />,
  },
  {
    metric: 'eCTD Publishing Costs',
    traditional: '$54,000/submission',
    withTrialSage: '$17,500/submission',
    savings: '68%',
    icon: <DollarSign className="w-6 h-6 text-emerald-600" />,
  },
  {
    metric: 'Clinical Trial Duration',
    traditional: 'Standard',
    withTrialSage: '15-25% faster',
    savings: '20% avg',
    icon: <BarChart2 className="w-6 h-6 text-emerald-600" />,
  },
];

// Platform Differentiators vs. Legacy Systems
const platformDifferences = [
  {
    category: 'IND Preparation',
    trialsage: {
      title: 'Automated & AI-Assisted',
      description:
        'Auto-builds IND sections with AI suggestions; ensures no module is overlooked. Teams review high-level content, not stitch pages together.',
    },
    legacy: {
      title: 'Manual & Labor-Intensive',
      description:
        'IND dossiers drafted in Word by humans or from templates. High risk of missing pieces, requires external medical writers. Takes months of effort.',
    },
    icon: <FileCheck className="h-10 w-10 text-white" />,
  },
  {
    category: 'CSR Creation & Analysis',
    trialsage: {
      title: 'Real-Time & Data-Driven',
      description:
        'CSR evolves live during trial via interactive dashboard. AI highlights trends and outliers as data arrives. By study end, CSR is essentially done.',
    },
    legacy: {
      title: 'After-the-Fact & Static',
      description:
        'CSR compiled after trial as a static document. No insights until trial ends, then teams manually analyze PDFs. Opportunities to adjust are lost.',
    },
    icon: <LayoutDashboard className="h-10 w-10 text-white" />,
  },
  {
    category: 'CER & Report Generation',
    trialsage: {
      title: 'One-Click Automated',
      description:
        'Generates CERs and other reports using validated AI trained on past submissions. Writers just refine the auto-generated draft. Consistent compliance every time.',
    },
    legacy: {
      title: 'Hand-Crafted Each Time',
      description:
        'Each report written from scratch or outdated templates. Inconsistent styles and potential errors without extensive review. Slow turnaround, often weeks or months.',
    },
    icon: <FileText className="h-10 w-10 text-white" />,
  },
  {
    category: 'Analytics & Insights',
    trialsage: {
      title: 'Predictive & Transparent',
      description:
        'Built-in ML models predict outcomes with explainable factors. Drill down into why a prediction was made. Advanced queryable databases for ad-hoc questions.',
    },
    legacy: {
      title: 'Limited or Opaque',
      description:
        'Basic reporting at best. Any AI features are separate add-ons with black-box outputs that few trust. Teams rely on manual data science or intuition.',
    },
    icon: <Brain className="h-10 w-10 text-white" />,
  },
];

// Main component
export default function HomeLandingProtected() {
  const [activeTab, setActiveTab] = useState('problems');

  return (
    <div className="min-h-screen bg-white">
      {/* Enterprise-grade navigation */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto flex justify-between items-center py-4 px-4 md:px-6">
          <div className="flex items-center">
            <Link
              href="/"
              className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-teal-600"
            >
              Concept2Cures.AI
            </Link>
          </div>

          <nav className="hidden md:flex items-center space-x-8">
            <div className="relative group">
              <span className="text-gray-700 font-medium cursor-pointer flex items-center">
                Solutions
                <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </span>
              <div className="absolute top-full left-0 mt-2 w-64 rounded-md shadow-lg bg-white py-2 z-50 hidden group-hover:block">
                <Link
                  to="/ind-architect"
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                >
                  Global IND Architect
                </Link>
                <Link
                  to="/csr-intelligence"
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                >
                  Protocol Designer + CSR Oracle
                </Link>
                <Link
                  to="/document-suite"
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-100"
                >
                  SmartDoc Suite: CER + Narratives
                </Link>
                <Link to="/portal" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">
                  Insight360 Vault & Dashboard
                </Link>
              </div>
            </div>

            <Link to="/case-studies" className="text-gray-700 font-medium hover:text-blue-600">
              Case Studies
            </Link>

            <Link to="/portal" className="text-gray-700 font-medium hover:text-blue-600">
              Client Portal
            </Link>

            <Link
              to="/builder"
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-teal-600 text-white hover:from-blue-700 hover:to-teal-700 shadow-md font-medium transition-all flex items-center gap-1"
            >
              Launch eCTD Builder <ArrowRight size={16} />
            </Link>
          </nav>

          <button className="md:hidden text-gray-700">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Hero Section - Category-Defining Positioning */}
      <section className="relative bg-gradient-to-r from-gray-900 to-blue-900 py-16 md:py-28">
        <div className="absolute inset-0 opacity-10"></div>
        <div className="container mx-auto px-4 md:px-6 relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-medium text-sm mb-6">
              The World's First Clinical Development Intelligence Platform
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              The Clinical Intelligence System
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400 block mt-2">
                That Thinks Like a Biotech Founder.
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-blue-100 mb-10 max-w-3xl mx-auto">
              Not a better document manager. Not another AI chatbot. Not a clinical trial plugin. A
              category-defining Clinical Intelligence System that gets your science to
              regulators—and to patients.
            </p>

            <div className="flex flex-wrap justify-center gap-4">
              <Link
                to="/builder"
                className="px-6 py-3 rounded-lg bg-gradient-to-r from-blue-500 to-teal-500 text-white hover:from-blue-600 hover:to-teal-600 shadow-xl flex items-center gap-2 font-medium transition-all text-lg"
              >
                Launch eCTD Builder <ArrowRight size={20} />
              </Link>
              <Link
                to="/demo"
                className="px-6 py-3 rounded-lg bg-white/10 border border-white/30 hover:bg-white/20 flex items-center gap-2 font-medium text-lg text-white"
              >
                Request Demo
              </Link>
              <button
                onClick={() => (window.location.href = '/ai')}
                className="px-6 py-3 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 shadow-xl flex items-center gap-2 font-medium transition-all text-lg"
              >
                💬 Coding Agent
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* The Status Quo is Broken Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              The Legacy Approach is Holding You Back
            </h2>
            <p className="text-xl text-gray-700">
              Current industry-standard platforms and processes waste your time, budget, and
              competitive edge. TrialSage changes everything.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {statusQuoProblems.map((problem, index) => (
              <div
                key={index}
                className="bg-white rounded-lg shadow-lg p-6 flex flex-col h-full border border-gray-100 hover:shadow-xl transition-all"
              >
                <div className="flex items-center mb-4">
                  {problem.icon}
                  <h3 className="text-xl font-bold ml-3 text-gray-900">{problem.title}</h3>
                </div>
                <p className="text-gray-700 mb-6 flex-grow">{problem.description}</p>
                <div className="border-t border-gray-100 pt-4 mt-auto">
                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold text-red-600">{problem.stat}</div>
                    <div className="text-sm text-gray-500">{problem.statLabel}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link
              to="/pain-points"
              className="inline-flex items-center text-blue-600 font-medium hover:text-blue-800"
            >
              See how we solve these challenges <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ROI Section - Hard Numbers */}
      <section className="py-20 bg-gradient-to-br from-blue-50 to-blue-100">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-gray-900">
              Game-Changing ROI That Legacy Vendors Cannot Match
            </h2>
            <p className="text-xl text-gray-700">
              What does upgrading to an intelligent, integrated platform mean for your organization?
              Tangible results that translate directly to your bottom line.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-blue-600 to-teal-600 text-white">
              <h3 className="text-xl font-bold">
                TrialSage ROI Metrics vs. Traditional Approaches
              </h3>
              <p className="opacity-90">
                Based on aggregate customer data across multiple therapeutic areas
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                      Metric
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                      Traditional Approach
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                      With TrialSage
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                      Improvement
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {roiMetrics.map((metric, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          {metric.icon}
                          <span className="ml-3 font-medium text-gray-900">{metric.metric}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-700">{metric.traditional}</td>
                      <td className="px-6 py-4 text-emerald-600 font-medium">
                        {metric.withTrialSage}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full font-medium text-sm">
                          {metric.savings}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100">
              <div className="flex items-start gap-3">
                <div className="bg-blue-100 p-2 rounded-full">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">Bottom line:</h4>
                  <p className="text-gray-700">
                    Shorter timelines, lower costs, fewer risks. In an industry where each month can
                    mean millions in opportunity or expenses, TrialSage pays for itself many times
                    over by turbocharging your development and de-risking your path to approval.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Core Systems Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <div className="inline-block px-3 py-1 rounded-full bg-teal-100 text-teal-800 font-medium text-sm mb-6">
              CATEGORY-DEFINING INNOVATION
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-gray-900">
              The Core Systems That Power TrialSage
            </h2>
            <p className="text-xl text-gray-700">
              TrialSage is a real-time, AI-powered platform that automates the parts of clinical and
              regulatory development that don't need to be manual anymore—and enhances the parts
              that do, with precision insight and smart, embedded copilots.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-16">
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-xl overflow-hidden">
              <div className="p-8">
                <div className="bg-white/20 p-3 rounded-full w-max mb-4">
                  <FileCheck className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">IND ARCHITECT™</h3>
                <p className="text-blue-100 text-lg font-medium italic mb-4">
                  "Build an IND in ⅓ the time—with zero guesswork."
                </p>
                <ul className="space-y-2 text-white">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-teal-300 flex-shrink-0" />
                    <span>FDA, EMA, PMDA ready</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-teal-300 flex-shrink-0" />
                    <span>Auto-generate Modules 1–5</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-teal-300 flex-shrink-0" />
                    <span>AI-guided summaries, rationales, cover letters</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-teal-300 flex-shrink-0" />
                    <span>Prebuilt rules engine for compliance</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-teal-300 flex-shrink-0" />
                    <span>Direct FDA ESG submission pipeline</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="bg-gradient-to-br from-teal-600 to-teal-700 rounded-xl shadow-xl overflow-hidden">
              <div className="p-8">
                <div className="bg-white/20 p-3 rounded-full w-max mb-4">
                  <LayoutDashboard className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">CSR ORACLE™</h3>
                <p className="text-teal-100 text-lg font-medium italic mb-4">
                  "Turn 500-page reports into live intelligence."
                </p>
                <ul className="space-y-2 text-white">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-blue-300 flex-shrink-0" />
                    <span>Upload any CSR → Get structured JSON, KPIs, and smart dashboards</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-blue-300 flex-shrink-0" />
                    <span>Compare across trials by AE, MoA, endpoints, population</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-blue-300 flex-shrink-0" />
                    <span>Ask: "What studies had over 60% efficacy in patients over 65?"</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-blue-300 flex-shrink-0" />
                    <span>Real-time safety signal monitoring</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-blue-300 flex-shrink-0" />
                    <span>Auto-summarize CSR content by site, arm, or outcome</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl shadow-xl overflow-hidden">
              <div className="p-8">
                <div className="bg-white/20 p-3 rounded-full w-max mb-4">
                  <FileText className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">SMARTDOCS GENERATOR™</h3>
                <p className="text-purple-100 text-lg font-medium italic mb-4">
                  "CERs, protocols, summaries—drafted in hours, not weeks."
                </p>
                <ul className="space-y-2 text-white">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-yellow-300 flex-shrink-0" />
                    <span>Auto-generate Clinical Evaluation Reports (MDR/IVDR)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-yellow-300 flex-shrink-0" />
                    <span>Extract evidence from CSRs + literature in one pass</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-yellow-300 flex-shrink-0" />
                    <span>GSPR + risk/benefit rationale completion</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-yellow-300 flex-shrink-0" />
                    <span>Write-ready narratives for regulatory sections</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-yellow-300 flex-shrink-0" />
                    <span>Full formatting, references, and traceability baked in</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-xl shadow-xl overflow-hidden">
              <div className="p-8">
                <div className="bg-white/20 p-3 rounded-full w-max mb-4">
                  <BarChart2 className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">INSIGHTVAULT™</h3>
                <p className="text-gray-200 text-lg font-medium italic mb-4">
                  "A DMS that actually understands your trial."
                </p>
                <ul className="space-y-2 text-white">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-blue-300 flex-shrink-0" />
                    <span>Full document version control</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-blue-300 flex-shrink-0" />
                    <span>Tagging by indication, molecule, site, or phase</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-blue-300 flex-shrink-0" />
                    <span>
                      Dashboard visualizations of submission status, trial risk, AE trends
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-blue-300 flex-shrink-0" />
                    <span>AI audit checks + document readiness validation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 mt-0.5 text-blue-300 flex-shrink-0" />
                    <span>21 CFR Part 11-aligned audit trails</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-12">
            {platformDifferences.map((diff, index) => (
              <div key={index} className="bg-white rounded-xl shadow-xl overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-teal-600 py-4 px-6 flex items-center">
                  <div className="bg-white/20 p-2 rounded-full mr-4">{diff.icon}</div>
                  <h3 className="text-xl font-bold text-white">{diff.category}</h3>
                </div>

                <div className="grid md:grid-cols-2 divide-x divide-gray-100">
                  <div className="p-6">
                    <div className="flex items-center mb-4">
                      <div className="p-1.5 rounded-full bg-teal-100 mr-3">
                        <CheckCircle className="h-5 w-5 text-teal-600" />
                      </div>
                      <h4 className="font-bold text-lg text-teal-700">TrialSage Approach</h4>
                    </div>
                    <div className="mb-3 font-semibold text-gray-900">{diff.trialsage.title}</div>
                    <p className="text-gray-700">{diff.trialsage.description}</p>
                  </div>

                  <div className="p-6 bg-gray-50">
                    <div className="flex items-center mb-4">
                      <div className="p-1.5 rounded-full bg-red-100 mr-3">
                        <X className="h-5 w-5 text-red-600" />
                      </div>
                      <h4 className="font-bold text-lg text-red-700">Legacy Approach</h4>
                    </div>
                    <div className="mb-3 font-semibold text-gray-900">{diff.legacy.title}</div>
                    <p className="text-gray-700">{diff.legacy.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 max-w-3xl mx-auto text-center">
            <div className="p-8 bg-blue-900 rounded-2xl shadow-xl">
              <h3 className="text-2xl font-bold text-white mb-4">
                All of this in one unified interface
              </h3>
              <p className="text-blue-100 mb-6">
                No more jumping between a CTMS, an EDC, a document repository, and an analytics
                dashboard – TrialSage is your clinical and regulatory command center.
              </p>
              <Link
                to="/platform"
                className="px-6 py-3 bg-white text-blue-800 rounded-lg inline-flex items-center font-medium hover:bg-blue-50 transition-colors"
              >
                Explore the full platform <ArrowUpRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Action Path Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-all flex flex-col h-full">
              <div className="p-3 bg-teal-100 rounded-lg w-max mb-4">
                <LayoutDashboard className="h-6 w-6 text-teal-700" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">See It in Action</h3>
              <p className="text-gray-700 mb-6 flex-grow">
                Schedule a live demo with our product specialists to see how TrialSage transforms
                your clinical and regulatory workflows.
              </p>
              <Link
                to="/demo"
                className="mt-auto inline-flex items-center text-teal-600 font-medium hover:text-teal-800"
              >
                Request Demo <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-all flex flex-col h-full">
              <div className="p-3 bg-blue-100 rounded-lg w-max mb-4">
                <BookOpen className="h-6 w-6 text-blue-700" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Read Customer Stories</h3>
              <p className="text-gray-700 mb-6 flex-grow">
                Discover how leading biotechs and pharma companies are using TrialSage to accelerate
                their development timelines.
              </p>
              <Link
                to="/case-studies"
                className="mt-auto inline-flex items-center text-blue-600 font-medium hover:text-blue-800"
              >
                View Case Studies <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-all flex flex-col h-full">
              <div className="p-3 bg-purple-100 rounded-lg w-max mb-4">
                <Beaker className="h-6 w-6 text-purple-700" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Start Using TrialSage</h3>
              <p className="text-gray-700 mb-6 flex-grow">
                Ready to transform your clinical and regulatory operations? Connect with our team to
                get started with TrialSage.
              </p>
              <Link
                to="/contact"
                className="mt-auto inline-flex items-center text-purple-600 font-medium hover:text-purple-800"
              >
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* First-to-Market Advantage */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="bg-white p-8 md:p-12 rounded-2xl shadow-xl">
            <div className="max-w-3xl mx-auto text-center mb-10">
              <div className="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-medium text-sm mb-6">
                FIRST-TO-MARKET ADVANTAGE
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6 text-gray-900">
                Not a Plugin. Not a Widget.
                <br />
                Not a Data Viewer.
              </h2>
              <p className="text-xl text-gray-700">
                TrialSage is the first platform that turns your clinical data + regulatory knowledge
                into an AI-augmented intelligence engine.
              </p>
            </div>

            <div className="grid md:grid-cols-4 gap-6 mb-12">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl">
                <h3 className="text-xl font-bold text-blue-800 mb-3 flex items-center">
                  <span className="p-2 rounded-full bg-blue-200 mr-3">
                    <CheckCircle className="h-5 w-5 text-blue-700" />
                  </span>
                  Actionable
                </h3>
                <p className="text-gray-700">
                  Never just insight—always integrated into your next step
                </p>
              </div>

              <div className="bg-gradient-to-br from-teal-50 to-teal-100 p-6 rounded-xl">
                <h3 className="text-xl font-bold text-teal-800 mb-3 flex items-center">
                  <span className="p-2 rounded-full bg-teal-200 mr-3">
                    <CheckCircle className="h-5 w-5 text-teal-700" />
                  </span>
                  Explainable
                </h3>
                <p className="text-gray-700">Never a black box—always traceable and editable</p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-xl">
                <h3 className="text-xl font-bold text-purple-800 mb-3 flex items-center">
                  <span className="p-2 rounded-full bg-purple-200 mr-3">
                    <CheckCircle className="h-5 w-5 text-purple-700" />
                  </span>
                  Auditable
                </h3>
                <p className="text-gray-700">Built for submission, built for safety</p>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-6 rounded-xl">
                <h3 className="text-xl font-bold text-emerald-800 mb-3 flex items-center">
                  <span className="p-2 rounded-full bg-emerald-200 mr-3">
                    <CheckCircle className="h-5 w-5 text-emerald-700" />
                  </span>
                  Strategic
                </h3>
                <p className="text-gray-700">
                  Aligned to your trial, your risk profile, your success
                </p>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-10 flex flex-col md:flex-row items-center justify-between">
              <div className="mb-6 md:mb-0 text-center md:text-left">
                <h4 className="text-xl font-bold text-gray-900 mb-2">Who trusts TrialSage?</h4>
                <ul className="text-gray-700 space-y-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                    <span>Teams with ex-FDA and ex-EMA leadership</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                    <span>Early adopters already submitting INDs</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                    <span>HIPAA | 21 CFR Part 11 | EU MDR compliant</span>
                  </li>
                </ul>
              </div>

              <div className="flex flex-wrap justify-center md:justify-end gap-4">
                <Link
                  to="/builder"
                  className="px-6 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-teal-600 text-white hover:from-blue-700 hover:to-teal-700 shadow-lg font-medium transition-all flex items-center gap-2"
                >
                  Launch Platform Now <ArrowRight size={18} />
                </Link>
                <Link
                  to="/demo"
                  className="px-6 py-3 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 flex items-center gap-2 font-medium"
                >
                  Request Live Demo
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-24 bg-gradient-to-r from-gray-900 to-blue-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"></div>
        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Build Smarter Biotech Together</h2>
          <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto">
            TrialSage is how tomorrow's biotech gets built: faster, safer, smarter. If you're tired
            of waiting on consultants, wrangling PDFs, or crossing your fingers at submission— this
            is your moment.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/builder"
              className="px-8 py-4 rounded-lg bg-gradient-to-r from-blue-500 to-teal-500 text-white hover:from-blue-600 hover:to-teal-600 shadow-xl flex items-center gap-2 font-medium transition-all text-lg"
            >
              Launch eCTD Builder Now
            </Link>
            <Link
              to="/pricing"
              className="px-8 py-4 rounded-lg bg-white/10 border border-white/30 hover:bg-white/20 flex items-center gap-2 font-medium text-lg text-white"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <h4 className="font-bold text-xl mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400">
                Concept2Cures.AI
              </h4>
              <p className="text-gray-400 mb-6">
                From scientific concepts to approved therapies with AI-driven regulatory
                intelligence and automation.
              </p>
              <div className="flex space-x-4">
                <a href="#" className="text-gray-400 hover:text-white">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.794.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.325-1.325z" />
                  </svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-white">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z" />
                  </svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-white">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                  </svg>
                </a>
              </div>
            </div>

            <div>
              <h5 className="font-semibold mb-4">Solutions</h5>
              <ul className="space-y-2">
                <li>
                  <Link to="/ind-architect" className="text-gray-400 hover:text-white">
                    Global IND Architect
                  </Link>
                </li>
                <li>
                  <Link to="/csr-intelligence" className="text-gray-400 hover:text-white">
                    Protocol Designer + CSR Oracle
                  </Link>
                </li>
                <li>
                  <Link to="/document-suite" className="text-gray-400 hover:text-white">
                    SmartDoc Suite
                  </Link>
                </li>
                <li>
                  <Link to="/builder" className="text-gray-400 hover:text-white">
                    eCTD Builder
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h5 className="font-semibold mb-4">Resources</h5>
              <ul className="space-y-2">
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    Documentation
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    Webinars
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    Case Studies
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    Knowledge Base
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    API Reference
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h5 className="font-semibold mb-4">Company</h5>
              <ul className="space-y-2">
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    About Us
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    Leadership
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    Careers
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    Contact
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    News
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-gray-800 flex flex-wrap justify-between items-center">
            <div className="text-gray-400 text-sm">
              © {new Date().getFullYear()} Concept2Cures.AI. All rights reserved.
            </div>
            <div className="flex space-x-6 text-sm text-gray-400">
              <a href="#" className="hover:text-white">
                Terms
              </a>
              <a href="#" className="hover:text-white">
                Privacy
              </a>
              <a href="#" className="hover:text-white">
                Security
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
