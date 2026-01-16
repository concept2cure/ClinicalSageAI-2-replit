import React, { useState, useEffect } from 'react';
import { Database, FileText, BarChart, Shield, Zap, Globe, Code, PieChart, Server, GitBranch, FileLock, BarChart2 } from 'lucide-react'
import { motion } from 'framer-motion';

const EnhancedVisionCards = () => {
  // Animation variants for the cards
  const cardVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: 'easeOut',
      },
    },
  };

  // Stats that will be animated/counted up
  const [trainingCount, setTrainingCount] = useState(0);
  const [docCount, setDocCount] = useState(0);
  const [efficiencyRate, setEfficiencyRate] = useState(0);
  const [complianceScore, setComplianceScore] = useState(0);

  // Use effect for animated counting
  useEffect(() => {
    const interval = setInterval(() => {
      setTrainingCount(prev => (prev < 12500 ? prev + 125 : prev));
      setDocCount(prev => (prev < 75000 ? prev + 750 : prev));
      setEfficiencyRate(prev => (prev < 98.7 ? prev + 0.987 : 98.7));
      setComplianceScore(prev => (prev < 99.9 ? prev + 0.999 : 99.9));
    }, 20);

    return () => clearInterval(interval);
  }, []);

  return (
    <section className="py-20 bg-gradient-to-b from-gray-900 to-indigo-950 text-white">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 text-transparent bg-clip-text">
            Our Sophisticated Intelligence Architecture
          </h2>
          <p className="text-xl text-blue-200 max-w-3xl mx-auto">
            Leveraging advanced computational models and domain-specific expertise to transform
            regulatory operations
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* Industry Vision Card - Enhanced */}
          <motion.div
            className="bg-gradient-to-br from-indigo-900/70 to-blue-900/70 rounded-2xl overflow-hidden border border-indigo-700/50 shadow-xl"
            variants={cardVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <div className="p-8">
              <div className="flex items-center mb-6">
                <div className="w-14 h-14 rounded-lg bg-indigo-700/50 flex items-center justify-center mr-4">
                  <Globe className="h-8 w-8 text-indigo-300" />
                </div>
                <h3 className="text-2xl font-bold text-white">Strategic Regulatory Intelligence</h3>
              </div>

              <p className="text-blue-100 mb-6 text-lg">
                Our platform is architected upon deep analysis of evolving global regulatory
                frameworks, cross-jurisdictional harmonization patterns, and emerging pharmaceutical
                development paradigms to address mission-critical challenges in multi-regional
                submissions.
              </p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-indigo-800/40 border border-indigo-600/30 rounded-lg p-4">
                  <div className="text-sm font-medium text-indigo-300 mb-1">Regulatory Bodies</div>
                  <div className="flex items-center">
                    <div className="text-2xl font-bold text-white">8</div>
                    <div className="text-sm ml-2 text-indigo-300">major jurisdictions</div>
                  </div>
                </div>
                <div className="bg-indigo-800/40 border border-indigo-600/30 rounded-lg p-4">
                  <div className="text-sm font-medium text-indigo-300 mb-1">
                    Market Adaptability
                  </div>
                  <div className="flex items-center">
                    <div className="text-2xl font-bold text-white">100%</div>
                    <div className="text-sm ml-2 text-indigo-300">framework coverage</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center">
                  <div className="h-6 w-6 rounded-full bg-indigo-700/50 flex items-center justify-center mr-3 flex-shrink-0">
                    <Shield className="h-3 w-3 text-indigo-300" />
                  </div>
                  <span className="text-blue-100">21 CFR Part 11 compliant infrastructure</span>
                </div>
                <div className="flex items-center">
                  <div className="h-6 w-6 rounded-full bg-indigo-700/50 flex items-center justify-center mr-3 flex-shrink-0">
                    <GitBranch className="h-3 w-3 text-indigo-300" />
                  </div>
                  <span className="text-blue-100">Real-time adaptation to regulatory changes</span>
                </div>
                <div className="flex items-center">
                  <div className="h-6 w-6 rounded-full bg-indigo-700/50 flex items-center justify-center mr-3 flex-shrink-0">
                    <FileLock className="h-3 w-3 text-indigo-300" />
                  </div>
                  <span className="text-blue-100">Validated for GxP-critical applications</span>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-indigo-700/30 bg-indigo-950/50">
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <PieChart className="h-5 w-5 text-indigo-400 mr-2" />
                  <span className="text-indigo-300 font-medium">Intelligence Framework</span>
                </div>
                <div className="text-indigo-300 flex items-center text-sm">
                  <span className="font-medium text-indigo-400">Compliance Score:</span>
                  <span className="ml-2 font-bold">{complianceScore.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Data-Backed Innovation Card - Enhanced */}
          <motion.div
            className="bg-gradient-to-br from-blue-900/70 to-purple-900/70 rounded-2xl overflow-hidden border border-blue-700/50 shadow-xl"
            variants={cardVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <div className="p-8">
              <div className="flex items-center mb-6">
                <div className="w-14 h-14 rounded-lg bg-blue-700/50 flex items-center justify-center mr-4">
                  <Database className="h-8 w-8 text-blue-300" />
                </div>
                <h3 className="text-2xl font-bold text-white">
                  Advanced Computational Intelligence
                </h3>
              </div>

              <p className="text-blue-100 mb-6 text-lg">
                Our proprietary machine learning architecture leverages a comprehensive corpus of
                regulatory precedents, clinical study reports, and historical submission outcomes to
                deliver unprecedented precision in document generation, validation, and compliance
                assurance.
              </p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-blue-800/40 border border-blue-600/30 rounded-lg p-4">
                  <div className="text-sm font-medium text-blue-300 mb-1">Training Documents</div>
                  <div className="flex items-center">
                    <div className="text-2xl font-bold text-white">
                      {trainingCount.toLocaleString()}
                    </div>
                    <div className="text-xs ml-2 text-blue-300">regulatory precedents</div>
                  </div>
                </div>
                <div className="bg-blue-800/40 border border-blue-600/30 rounded-lg p-4">
                  <div className="text-sm font-medium text-blue-300 mb-1">Analysis Corpus</div>
                  <div className="flex items-center">
                    <div className="text-2xl font-bold text-white">{docCount.toLocaleString()}</div>
                    <div className="text-xs ml-2 text-blue-300">analyzed data points</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center">
                  <div className="h-6 w-6 rounded-full bg-blue-700/50 flex items-center justify-center mr-3 flex-shrink-0">
                    <Zap className="h-3 w-3 text-blue-300" />
                  </div>
                  <span className="text-blue-100">Neural network-based document analytics</span>
                </div>
                <div className="flex items-center">
                  <div className="h-6 w-6 rounded-full bg-blue-700/50 flex items-center justify-center mr-3 flex-shrink-0">
                    <Server className="h-3 w-3 text-blue-300" />
                  </div>
                  <span className="text-blue-100">
                    Cross-reference validation at semantic level
                  </span>
                </div>
                <div className="flex items-center">
                  <div className="h-6 w-6 rounded-full bg-blue-700/50 flex items-center justify-center mr-3 flex-shrink-0">
                    <Code className="h-3 w-3 text-blue-300" />
                  </div>
                  <span className="text-blue-100">Accelerated learning from approval patterns</span>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-blue-700/30 bg-blue-950/50">
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <BarChart2 className="h-5 w-5 text-blue-400 mr-2" />
                  <span className="text-blue-300 font-medium">Performance Metrics</span>
                </div>
                <div className="text-blue-300 flex items-center text-sm">
                  <span className="font-medium text-blue-400">Efficiency Rate:</span>
                  <span className="ml-2 font-bold">{efficiencyRate.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Trust Indicators Section */}
        <div className="mt-16 text-center">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-indigo-800/50 backdrop-blur-sm text-indigo-200 text-sm font-medium mb-6">
            <Shield className="h-4 w-4 mr-2" />
            Trusted by Leading Pharmaceutical Organizations
          </div>

          <div className="flex flex-wrap justify-center gap-8 mt-6">
            <div className="flex flex-col items-center">
              <div className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-indigo-300 text-transparent bg-clip-text">
                16
              </div>
              <p className="text-blue-300 mt-2">Global Pharma Partners</p>
            </div>

            <div className="flex flex-col items-center">
              <div className="text-4xl font-bold bg-gradient-to-r from-indigo-400 to-purple-300 text-transparent bg-clip-text">
                $2.8B
              </div>
              <p className="text-blue-300 mt-2">Submission Value</p>
            </div>

            <div className="flex flex-col items-center">
              <div className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-blue-300 text-transparent bg-clip-text">
                120+
              </div>
              <p className="text-blue-300 mt-2">Technology Integrations</p>
            </div>

            <div className="flex flex-col items-center">
              <div className="text-4xl font-bold bg-gradient-to-r from-blue-300 to-indigo-400 text-transparent bg-clip-text">
                99.8%
              </div>
              <p className="text-blue-300 mt-2">Technical Validation Rate</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default EnhancedVisionCards;
