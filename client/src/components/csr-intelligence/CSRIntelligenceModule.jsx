import React, { useState } from 'react';
import {
  FileText,
  BookOpen,
  Zap,
  Users,
  BarChart2,
  Layout,
  Search,
  CheckCircle,
  FileQuestion,
  Pen,
  Brain,
  AlignLeft,
  FileDown,
  AlertTriangle,
  Activity,
  TrendingUp,
  Shield,
  Radar,
  Target,
  Eye,
  Clock,
  AlertCircle,
  GitBranch,
  Database,
  Pulse,
} from 'lucide-react';
import { useIntegration } from '../integration/ModuleIntegrationLayer';

const CSRIntelligenceModule = () => {
  const { data, aiProcessing, runAiAnalysis, addAuditEntry } = useIntegration();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0);
  const [safetySignalFilters, setSafetySignalFilters] = useState({
    severity: 'all',
    timeframe: '30d',
    signalType: 'all'
  });
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [showSafetyCorrelation, setShowSafetyCorrelation] = useState(false);

  // CSR Template data
  const csrTemplates = [
    {
      id: 'csr-ich-e3',
      name: 'ICH E3 Compliant Template',
      description: 'Standard template following ICH E3 guidance for Clinical Study Reports',
      regulatory: ['FDA', 'EMA', 'PMDA', 'NMPA'],
      popularity: 'High',
      sections: 16,
      lastUpdated: '2025-03-01',
    },
    {
      id: 'csr-ema-2025',
      name: 'EMA Enhanced Template',
      description:
        'Optimized for European Medicines Agency with additional data transparency sections',
      regulatory: ['EMA'],
      popularity: 'Medium',
      sections: 18,
      lastUpdated: '2025-02-15',
    },
    {
      id: 'csr-fda-expedited',
      name: 'FDA Expedited Review Template',
      description: 'Streamlined template for expedited review pathways with the FDA',
      regulatory: ['FDA'],
      popularity: 'Medium',
      sections: 14,
      lastUpdated: '2025-01-20',
    },
    {
      id: 'csr-japan-pmda',
      name: 'PMDA Specialized Template',
      description: 'Customized for Japanese PMDA submissions with country-specific requirements',
      regulatory: ['PMDA'],
      popularity: 'Low',
      sections: 17,
      lastUpdated: '2024-12-10',
    },
  ];

  // RWE Safety Signal Data
  const safetySignals = [
    {
      id: 'signal1',
      type: 'adverse_event',
      description: 'Increased hepatotoxicity reports in Phase 2 studies',
      severity: 'high',
      detectedDate: '2025-03-18T10:30:00Z',
      affectedStudies: ['XYZ-123', 'DEF-456'],
      patternStrength: 92,
      rweSource: 'FDA FAERS',
      status: 'investigating',
      trend: 'increasing'
    },
    {
      id: 'signal2', 
      type: 'efficacy_concern',
      description: 'Reduced efficacy in elderly population across multiple studies',
      severity: 'medium',
      detectedDate: '2025-03-17T14:22:00Z',
      affectedStudies: ['ABC-789', 'GHI-012'],
      patternStrength: 78,
      rweSource: 'EMA EudraVigilance',
      status: 'monitoring',
      trend: 'stable'
    },
    {
      id: 'signal3',
      type: 'drug_interaction',
      description: 'Potential interaction with common cardiovascular medications',
      severity: 'medium',
      detectedDate: '2025-03-16T09:15:00Z',
      affectedStudies: ['JKL-345'],
      patternStrength: 65,
      rweSource: 'WHO VigiBase',
      status: 'resolved',
      trend: 'decreasing'
    }
  ];

  // Recently generated CSRs with RWE safety signal integration
  const recentCsrs = [
    {
      id: 'csr1',
      title: 'Phase 2 Study XYZ-123 in Rheumatoid Arthritis',
      template: 'ICH E3 Compliant',
      status: 'Complete',
      generatedDate: '2025-03-10T15:22:43Z',
      progress: 100,
      safetySignals: [
        {
          id: 'signal1',
          severity: 'high',
          description: 'Increased hepatotoxicity reports',
          status: 'investigating'
        }
      ],
      rweAnalysis: {
        completed: true,
        signalsDetected: 1,
        complianceScore: 94,
        lastUpdated: '2025-03-18T16:30:00Z'
      }
    },
    {
      id: 'csr2',
      title: 'Phase 1b Safety Study ABC-456 in Healthy Volunteers',
      template: 'FDA Expedited Review',
      status: 'In Progress',
      generatedDate: '2025-03-08T09:15:30Z',
      progress: 65,
      safetySignals: [],
      rweAnalysis: {
        completed: false,
        signalsDetected: 0,
        complianceScore: null,
        lastUpdated: null
      }
    },
    {
      id: 'csr3',
      title: 'Phase 3 Pivotal Study DEF-789 in Type 2 Diabetes',
      template: 'ICH E3 Compliant',
      status: 'Complete',
      generatedDate: '2025-02-22T14:05:11Z',
      progress: 100,
      safetySignals: [
        {
          id: 'signal2',
          severity: 'medium',
          description: 'Reduced efficacy in elderly population',
          status: 'monitoring'
        }
      ],
      rweAnalysis: {
        completed: true,
        signalsDetected: 1,
        complianceScore: 89,
        lastUpdated: '2025-03-17T14:22:00Z'
      }
    },
  ];

  // Enhanced stats for dashboard with RWE safety signals
  const stats = [
    {
      name: 'Total CSRs Generated',
      value: '24',
      icon: <FileText size={20} className="text-blue-500" />,
      testId: 'stat-total-csrs'
    },
    { 
      name: 'Time Saved', 
      value: '312 hrs', 
      icon: <Zap size={20} className="text-yellow-500" />,
      testId: 'stat-time-saved'
    },
    {
      name: 'RWE Safety Signals',
      value: '3',
      icon: <Shield size={20} className="text-red-500" />,
      testId: 'stat-safety-signals',
      trend: '+2 this week'
    },
    {
      name: 'Cross-Study Correlations',
      value: '12',
      icon: <GitBranch size={20} className="text-indigo-500" />,
      testId: 'stat-correlations',
      trend: 'Active monitoring'
    },
  ];

  // Additional RWE-focused stats
  const rweStats = [
    {
      name: 'Real-time Monitoring',
      value: 'Active',
      icon: <Activity size={20} className="text-green-500" />,
      testId: 'stat-monitoring'
    },
    {
      name: 'Pattern Recognition',
      value: '98.5%',
      icon: <Target size={20} className="text-purple-500" />,
      testId: 'stat-pattern-accuracy'
    },
    {
      name: 'Signal Detection Rate',
      value: '15.2/day',
      icon: <Radar size={20} className="text-orange-500" />,
      testId: 'stat-detection-rate'
    },
    {
      name: 'Compliance Score',
      value: '97%',
      icon: <CheckCircle size={20} className="text-green-500" />,
      testId: 'stat-compliance'
    },
  ];

  const handleTabChange = tab => {
    setActiveTab(tab);
    addAuditEntry('csr_tab_changed', { tab });
  };

  const handleSafetySignalClick = (signal) => {
    setSelectedSignal(signal);
    addAuditEntry('safety_signal_clicked', { signalId: signal.id });
  };

  const runSafetyAnalysis = async (csrId) => {
    try {
      await runAiAnalysis({ csrId, analysisType: 'rwe_safety_signals' }, 'safety_analysis');
      addAuditEntry('safety_analysis_triggered', { csrId });
    } catch (error) {
      console.error('Error running safety analysis:', error);
    }
  };

  const runCrossStudyCorrelation = async (signalId) => {
    try {
      await runAiAnalysis({ signalId, analysisType: 'cross_study_correlation' }, 'correlation_analysis');
      setShowSafetyCorrelation(true);
      addAuditEntry('correlation_analysis_triggered', { signalId });
    } catch (error) {
      console.error('Error running correlation analysis:', error);
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-100';
      case 'medium': return 'text-orange-600 bg-orange-100';
      case 'low': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'increasing': return <TrendingUp size={12} className="text-red-500" />;
      case 'stable': return <Activity size={12} className="text-yellow-500" />;
      case 'decreasing': return <TrendingUp size={12} className="text-green-500 rotate-180" />;
      default: return null;
    }
  };

  const handleGenerateClick = () => {
    setShowGenerate(true);
  };

  const handleTemplateSelect = index => {
    setSelectedTemplateIndex(index);
  };

  const startGeneration = async () => {
    try {
      await runAiAnalysis({ templateId: csrTemplates[selectedTemplateIndex].id }, 'csr_generation');
      setShowGenerate(false);

      // Add to recent CSRs (in a real app, this would come from the backend)
      const newCsr = {
        id: 'csr' + (recentCsrs.length + 1),
        title: 'New CSR from ' + csrTemplates[selectedTemplateIndex].name,
        template: csrTemplates[selectedTemplateIndex].name,
        status: 'In Progress',
        generatedDate: new Date().toISOString(),
        progress: 10,
      };

      // We would update state here in a real application
      console.log('New CSR started:', newCsr);
    } catch (error) {
      console.error('Error generating CSR:', error);
    }
  };

  const formatDate = dateString => {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  return (
    <div className="flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">CSR Intelligence™ + RWE Safety Signals</h1>
        <p className="text-gray-600">
          AI-powered creation and analysis of clinical study reports with real-time safety signal detection and cross-study correlation
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex -mb-px">
          <button
            className={`py-3 px-4 flex items-center text-sm font-medium ${
              activeTab === 'dashboard'
                ? 'border-b-2 border-pink-600 text-pink-600'
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => handleTabChange('dashboard')}
          >
            <Layout size={16} className="mr-2" />
            Dashboard
          </button>
          <button
            className={`py-3 px-4 flex items-center text-sm font-medium ${
              activeTab === 'templates'
                ? 'border-b-2 border-pink-600 text-pink-600'
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => handleTabChange('templates')}
          >
            <BookOpen size={16} className="mr-2" />
            Templates
          </button>
          <button
            className={`py-3 px-4 flex items-center text-sm font-medium ${
              activeTab === 'analysis'
                ? 'border-b-2 border-pink-600 text-pink-600'
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => handleTabChange('analysis')}
          >
            <BarChart2 size={16} className="mr-2" />
            Analysis
          </button>
          <button
            className={`py-3 px-4 flex items-center text-sm font-medium ${
              activeTab === 'review'
                ? 'border-b-2 border-pink-600 text-pink-600'
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => handleTabChange('review')}
          >
            <Users size={16} className="mr-2" />
            Review
          </button>
        </nav>
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {stats.map((stat, index) => (
              <div
                key={index}
                className="bg-white p-4 rounded-lg border border-gray-200 flex items-center"
              >
                <div className="mr-4">{stat.icon}</div>
                <div>
                  <div className="text-sm text-gray-500">{stat.name}</div>
                  <div className="text-xl font-semibold">{stat.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Recent CSRs */}
          <div className="bg-white p-5 rounded-lg border border-gray-200 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium">Recent CSRs</h2>
              <button className="hot-pink-btn flex items-center" onClick={handleGenerateClick}>
                <Pen size={16} className="mr-2" />
                Generate New CSR
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Template</th>
                    <th className="px-4 py-3">Generated</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {recentCsrs.map(csr => (
                    <tr key={csr.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 font-medium text-gray-900">{csr.title}</td>
                      <td className="px-4 py-4 text-gray-500">{csr.template}</td>
                      <td className="px-4 py-4 text-gray-500">{formatDate(csr.generatedDate)}</td>
                      <td className="px-4 py-4">
                        {csr.status === 'Complete' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle size={12} className="mr-1" />
                            Complete
                          </span>
                        ) : (
                          <div>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mb-1">
                              In Progress
                            </span>
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-blue-600 h-1.5 rounded-full"
                                style={{ width: `${csr.progress}%` }}
                              ></div>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center space-x-3">
                          <button className="p-1 text-gray-500 hover:text-gray-700">
                            <FileDown size={16} />
                          </button>
                          <button className="p-1 text-gray-500 hover:text-gray-700">
                            <Pen size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Getting Started */}
          <div className="bg-white p-5 rounded-lg border border-gray-200">
            <h2 className="text-lg font-medium mb-4">Getting Started</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border border-gray-200 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mb-3">
                  <BookOpen size={18} className="text-blue-600" />
                </div>
                <h3 className="font-medium mb-1">1. Choose a Template</h3>
                <p className="text-sm text-gray-600">
                  Select from our library of regulatory-compliant CSR templates
                </p>
              </div>
              <div className="p-4 border border-gray-200 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mb-3">
                  <AlignLeft size={18} className="text-green-600" />
                </div>
                <h3 className="font-medium mb-1">2. Import Trial Data</h3>
                <p className="text-sm text-gray-600">
                  Connect your clinical trial data or import from TrialSage Vault
                </p>
              </div>
              <div className="p-4 border border-gray-200 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center mb-3">
                  <Brain size={18} className="text-purple-600" />
                </div>
                <h3 className="font-medium mb-1">3. Generate with AI</h3>
                <p className="text-sm text-gray-600">
                  Let our AI engine create a compliant CSR draft in minutes
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
            <div className="relative w-full sm:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search templates..."
                className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-md text-sm"
              />
            </div>
            <button className="hot-pink-btn flex items-center" onClick={handleGenerateClick}>
              <FileText size={16} className="mr-2" />
              Generate New CSR
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {csrTemplates.map((template, index) => (
              <div
                key={template.id}
                className="bg-white p-5 rounded-lg border border-gray-200 flex flex-col"
              >
                <div className="font-medium text-lg mb-2">{template.name}</div>
                <p className="text-gray-600 text-sm mb-4 flex-grow">{template.description}</p>

                <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                  <div>
                    <span className="text-gray-500">Sections:</span>
                    <span className="ml-2 font-medium">{template.sections}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Popularity:</span>
                    <span className="ml-2 font-medium">{template.popularity}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Updated:</span>
                    <span className="ml-2 font-medium">{template.lastUpdated}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Agencies:</span>
                    <span className="ml-2 font-medium">{template.regulatory.join(', ')}</span>
                  </div>
                </div>

                <button
                  className="hot-pink-btn"
                  onClick={() => {
                    handleTemplateSelect(index);
                    handleGenerateClick();
                  }}
                >
                  Use Template
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analysis Tab */}
      {activeTab === 'analysis' && (
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h2 className="text-lg font-medium mb-6">CSR Intelligent Analysis</h2>

          <div className="mb-6">
            <p className="text-gray-600 mb-4">
              Upload an existing CSR to receive AI-powered analysis, compliance checking, and
              enhancement recommendations.
            </p>

            <div className="border-2 border-dashed border-gray-300 rounded-md p-6 flex flex-col items-center justify-center">
              <FileQuestion size={48} className="text-gray-400 mb-2" />
              <p className="text-sm text-gray-500 text-center mb-2">
                Drag and drop a CSR document here, or click to select a file
              </p>
              <button className="bg-gray-200 text-gray-800 px-3 py-1 rounded-md text-sm font-medium">
                Browse Files
              </button>
              <input type="file" className="hidden" />
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h3 className="font-medium mb-3">Recent Analyses</h3>

            <div className="space-y-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="font-medium">Phase 3 Study CSR Analysis</div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Complete
                  </span>
                </div>
                <div className="text-sm text-gray-500 mb-3">Analyzed on March 15, 2025</div>
                <div className="flex space-x-2">
                  <button className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded">
                    View Report
                  </button>
                  <button className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded">
                    Download Analysis
                  </button>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="font-medium">Safety Study CSR Analysis</div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Complete
                  </span>
                </div>
                <div className="text-sm text-gray-500 mb-3">Analyzed on March 10, 2025</div>
                <div className="flex space-x-2">
                  <button className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded">
                    View Report
                  </button>
                  <button className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded">
                    Download Analysis
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Tab */}
      {activeTab === 'review' && (
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h2 className="text-lg font-medium mb-6">Collaborative Review</h2>

          <div className="mb-6">
            <p className="text-gray-600 mb-4">
              Collaborate with your team to review and finalize CSR documents with real-time
              comments and tracked changes.
            </p>

            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 text-center">
              <Users size={48} className="text-gray-400 mx-auto mb-2" />
              <h3 className="font-medium mb-1">No active review sessions</h3>
              <p className="text-sm text-gray-500 mb-4">
                Start a new review session by uploading a CSR document or selecting one from your
                recent CSRs
              </p>
              <button className="hot-pink-btn mx-auto">Start New Review</button>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h3 className="font-medium mb-3">Recent Reviews</h3>

            <div className="space-y-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium mb-1">Phase 2 Study CSR Review</div>
                    <div className="text-sm text-gray-500">
                      Started on March 12, 2025 • 3 participants
                    </div>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    In Progress
                  </span>
                </div>
                <div className="mt-3 flex space-x-2">
                  <button className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded">
                    Resume Review
                  </button>
                  <button className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded">
                    Review Status
                  </button>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium mb-1">Phase 1 PK Study CSR Review</div>
                    <div className="text-sm text-gray-500">
                      Completed on March 5, 2025 • 4 participants
                    </div>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Completed
                  </span>
                </div>
                <div className="mt-3 flex space-x-2">
                  <button className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded">
                    View Review
                  </button>
                  <button className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded">
                    Download Report
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate CSR Modal */}
      {showGenerate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
            <h3 className="text-lg font-semibold mb-4">Generate New CSR</h3>

            <div className="mb-6">
              <h4 className="font-medium mb-2">Selected Template</h4>
              <div className="p-4 border border-pink-100 bg-pink-50 rounded-lg">
                <div className="font-medium">{csrTemplates[selectedTemplateIndex].name}</div>
                <p className="text-sm text-gray-600 mt-1">
                  {csrTemplates[selectedTemplateIndex].description}
                </p>
                <div className="mt-2 text-xs text-gray-500">
                  <span className="mr-4">
                    Regulatory: {csrTemplates[selectedTemplateIndex].regulatory.join(', ')}
                  </span>
                  <span>Sections: {csrTemplates[selectedTemplateIndex].sections}</span>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Study Title</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Enter the title of your clinical study"
              />
            </div>

            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Protocol Number
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="e.g., ABC-123-P2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Study Phase</label>
                <select className="w-full border border-gray-300 rounded-md px-3 py-2">
                  <option value="">Select study phase</option>
                  <option value="phase1">Phase 1</option>
                  <option value="phase2">Phase 2</option>
                  <option value="phase3">Phase 3</option>
                  <option value="phase4">Phase 4</option>
                </select>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Source</label>
              <select className="w-full border border-gray-300 rounded-md px-3 py-2">
                <option value="">Select data source</option>
                <option value="import">Import from TrialSage Vault</option>
                <option value="upload">Upload clinical trial data</option>
                <option value="manual">Enter data manually</option>
              </select>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={() => setShowGenerate(false)}
              >
                Cancel
              </button>
              <button
                className="hot-pink-btn"
                onClick={startGeneration}
                disabled={aiProcessing.status === 'processing'}
              >
                {aiProcessing.status === 'processing' ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                    Processing...
                  </>
                ) : (
                  'Generate CSR'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CSRIntelligenceModule;
