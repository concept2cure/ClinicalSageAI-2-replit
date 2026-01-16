import React, { useState, useEffect } from 'react';
import { Database, FileText, BarChart, Shield, Zap, Globe, Code, PieChart, Server, GitBranch, FileLock, BarChart2, ChevronRight, CheckCircle, Clock, FileArchive, Briefcase, Layers, ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion';

const UnifiedPlatformFeatures = () => {
  const [activeTab, setActiveTab] = useState('vision');
  const [trainingCount, setTrainingCount] = useState(0);
  const [complianceScore, setComplianceScore] = useState(0);
  const [efficiencyRate, setEfficiencyRate] = useState(0);

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        when: 'beforeChildren',
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.4 },
    },
  };

  // Animate stats
  useEffect(() => {
    const interval = setInterval(() => {
      setTrainingCount(prev => (prev < 12500 ? prev + 125 : prev));
      setComplianceScore(prev => (prev < 99.9 ? prev + 0.999 : 99.9));
      setEfficiencyRate(prev => (prev < 98.7 ? prev + 0.987 : 98.7));
    }, 20);

    return () => clearInterval(interval);
  }, []);

  // Platform features data
  const platformFeatures = [
    {
      id: 'submissions',
      title: 'Accelerate Submissions',
      description:
        'Reduce preparation time by 60% with AI-powered generation, validation, and formatting.',
      icon: <FileText className="h-5 w-5 text-white" />,
      color: 'bg-blue-600',
      metrics: '60% faster',
    },
    {
      id: 'csr',
      title: 'CSR Intelligence',
      description:
        'Access insights from thousands of clinical study reports to optimize your approach.',
      icon: <Database className="h-5 w-5 text-white" />,
      color: 'bg-indigo-600',
      metrics: '12,500+ reports',
    },
    {
      id: 'compliance',
      title: 'Global Compliance',
      description:
        'Automated validation for FDA, EMA, PMDA and Health Canada regulatory standards.',
      icon: <Globe className="h-5 w-5 text-white" />,
      color: 'bg-emerald-600',
      metrics: '4 major authorities',
    },
  ];

  // Platform capabilities data
  const platformCapabilities = [
    {
      id: 'builder',
      title: 'Submission Builder',
      description: 'Build and validate eCTD submissions with region-specific validation',
      icon: <FileText className="h-5 w-5 text-blue-600" />,
      color: 'bg-blue-100',
    },
    {
      id: 'csr-intel',
      title: 'CSR Intelligence',
      description: 'Deep learning-powered CSR analysis and optimization',
      icon: <Database className="h-5 w-5 text-indigo-600" />,
      color: 'bg-indigo-100',
    },
    {
      id: 'ind',
      title: 'IND Architect',
      description: 'Design and manage INDs with multi-region compliance',
      icon: <FileArchive className="h-5 w-5 text-violet-600" />,
      color: 'bg-violet-100',
    },
    {
      id: 'ectd',
      title: 'eCTD Manager',
      description: 'Centralized eCTD lifecycle management and tracking',
      icon: <Briefcase className="h-5 w-5 text-emerald-600" />,
      color: 'bg-emerald-100',
    },
    {
      id: 'study',
      title: 'Study Designer',
      description: 'Statistical model-driven clinical study design',
      icon: <BarChart className="h-5 w-5 text-amber-600" />,
      color: 'bg-amber-100',
    },
  ];

  return (
    <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
      <div className="container mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Intelligent Regulatory Platform</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Our unified suite of tools transforms regulatory workflows with unprecedented
            efficiency, data-backed insights, and multi-region compliance automation.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex rounded-md shadow-sm">
            <button
              onClick={() => setActiveTab('vision')}
              className={`px-6 py-3 text-sm font-medium border ${
                activeTab === 'vision'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              } rounded-l-lg transition-colors`}
            >
              Platform Vision
            </button>
            <button
              onClick={() => setActiveTab('features')}
              className={`px-6 py-3 text-sm font-medium border-t border-b ${
                activeTab === 'features'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              } transition-colors`}
            >
              Key Features
            </button>
            <button
              onClick={() => setActiveTab('capabilities')}
              className={`px-6 py-3 text-sm font-medium border rounded-r-lg ${
                activeTab === 'capabilities'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              } transition-colors`}
            >
              Platform Capabilities
            </button>
          </div>
        </div>

        {/* Vision Section */}
        {activeTab === 'vision' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <motion.div
              className="bg-gradient-to-br from-indigo-900 to-blue-800 text-white p-8 rounded-2xl shadow-xl border border-indigo-700/30"
              variants={itemVariants}
              initial="hidden"
              animate="visible"
            >
              <div className="flex items-center mb-6">
                <div className="w-12 h-12 rounded-lg bg-indigo-700/50 flex items-center justify-center mr-4">
                  <Globe className="h-6 w-6 text-indigo-300" />
                </div>
                <h3 className="text-2xl font-bold">Industry Vision</h3>
              </div>

              <p className="text-blue-100 mb-6">
                Built upon deep understanding of regulatory frameworks and pharmaceutical
                development processes to address the most critical challenges in global submissions.
              </p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-indigo-800/40 border border-indigo-600/30 rounded-lg p-4">
                  <div className="text-sm font-medium text-indigo-300 mb-1">Compliance Rate</div>
                  <div className="text-2xl font-bold">{complianceScore.toFixed(1)}%</div>
                </div>
                <div className="bg-indigo-800/40 border border-indigo-600/30 rounded-lg p-4">
                  <div className="text-sm font-medium text-indigo-300 mb-1">Global Scope</div>
                  <div className="text-2xl font-bold">8 Regions</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-indigo-300 mr-3" />
                  <span>Continuous regulatory intelligence</span>
                </div>
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-indigo-300 mr-3" />
                  <span>GxP-validated workflows</span>
                </div>
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-indigo-300 mr-3" />
                  <span>21 CFR Part 11 compliant</span>
                </div>
              </div>
            </motion.div>

            <motion.div
              className="bg-gradient-to-br from-blue-800 to-purple-900 text-white p-8 rounded-2xl shadow-xl border border-blue-700/30"
              variants={itemVariants}
              initial="hidden"
              animate="visible"
            >
              <div className="flex items-center mb-6">
                <div className="w-12 h-12 rounded-lg bg-blue-700/50 flex items-center justify-center mr-4">
                  <Database className="h-6 w-6 text-blue-300" />
                </div>
                <h3 className="text-2xl font-bold">Data-Backed Innovation</h3>
              </div>

              <p className="text-blue-100 mb-6">
                Our AI models are trained on thousands of regulatory documents, clinical study
                reports, and historical submission data to ensure precise, compliant outputs.
              </p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-blue-800/40 border border-blue-600/30 rounded-lg p-4">
                  <div className="text-sm font-medium text-blue-300 mb-1">Training Corpus</div>
                  <div className="text-2xl font-bold">{trainingCount.toLocaleString()}+</div>
                </div>
                <div className="bg-blue-800/40 border border-blue-600/30 rounded-lg p-4">
                  <div className="text-sm font-medium text-blue-300 mb-1">Efficiency Rate</div>
                  <div className="text-2xl font-bold">{efficiencyRate.toFixed(1)}%</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-blue-300 mr-3" />
                  <span>Neural network validation</span>
                </div>
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-blue-300 mr-3" />
                  <span>Semantic document analysis</span>
                </div>
                <div className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-blue-300 mr-3" />
                  <span>Predictive approval analytics</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Key Features Section */}
        {activeTab === 'features' && (
          <motion.div
            className="space-y-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {platformFeatures.map(feature => (
              <motion.div
                key={feature.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-shadow hover:shadow-md"
                variants={itemVariants}
              >
                <div className="flex flex-col md:flex-row">
                  <div
                    className={`${feature.color} p-6 md:w-20 flex items-center justify-center md:justify-start`}
                  >
                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                      {feature.icon}
                    </div>
                  </div>
                  <div className="p-6 flex-1">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">{feature.title}</h3>
                        <p className="text-gray-600">{feature.description}</p>
                      </div>
                      <div className="mt-4 md:mt-0">
                        <span className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 text-sm font-medium">
                          <Clock className="w-4 h-4 mr-1" />
                          {feature.metrics}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}

            <div className="text-center mt-8">
              <button className="inline-flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow transition-colors">
                Explore All Features
                <ChevronRight className="ml-2 h-5 w-5" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Platform Capabilities Section */}
        {activeTab === 'capabilities' && (
          <motion.div variants={containerVariants} initial="hidden" animate="visible">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {platformCapabilities.map(capability => (
                <motion.div
                  key={capability.id}
                  className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
                  variants={itemVariants}
                >
                  <div className="flex items-center mb-4">
                    <div
                      className={`w-12 h-12 rounded-lg ${capability.color} flex items-center justify-center mr-4`}
                    >
                      {capability.icon}
                    </div>
                    <h3 className="text-xl font-medium text-gray-900">{capability.title}</h3>
                  </div>
                  <p className="text-gray-600 mb-4">{capability.description}</p>
                  <a
                    href="#"
                    className="inline-flex items-center text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Learn more
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </a>
                </motion.div>
              ))}
            </div>

            <div className="text-center mt-10">
              <button className="inline-flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow transition-colors">
                Explore Platform Documentation
                <ChevronRight className="ml-2 h-5 w-5" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Common metrics footer - appears on all tabs */}
        <div className="mt-16 pt-12 border-t border-gray-200">
          <div className="text-center mb-8">
            <h3 className="text-xl font-bold text-gray-900">Driving Regulatory Success</h3>
            <p className="text-gray-600 mt-2">
              Trusted by leading pharmaceutical and biotech companies worldwide
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="bg-gradient-to-br from-gray-50 to-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-3xl font-bold text-indigo-600 mb-1">60%</div>
              <p className="text-gray-700 font-medium">Time Savings</p>
            </div>
            <div className="bg-gradient-to-br from-gray-50 to-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-3xl font-bold text-indigo-600 mb-1">98.7%</div>
              <p className="text-gray-700 font-medium">Validation Rate</p>
            </div>
            <div className="bg-gradient-to-br from-gray-50 to-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-3xl font-bold text-indigo-600 mb-1">12,500+</div>
              <p className="text-gray-700 font-medium">Study Reports</p>
            </div>
            <div className="bg-gradient-to-br from-gray-50 to-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-3xl font-bold text-indigo-600 mb-1">$2.1M</div>
              <p className="text-gray-700 font-medium">Average Savings</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default UnifiedPlatformFeatures;
