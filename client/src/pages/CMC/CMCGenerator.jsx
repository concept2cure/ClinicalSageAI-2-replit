import React, { useState, useEffect } from 'react';
import { ArrowLeft, Beaker, FileText, Download, CheckCircle2, Brain, Shield, Database, Workflow, ChevronRight, AlertTriangle, TrendingUp, BarChart3, Globe, Settings, Clock, Users, Target, Zap, Activity, LineChart, PieChart, FlaskConical, Microscope, BookOpen, Award, Eye, Search, Filter, Calendar, Bell, Star } from 'lucide-react'
import SmartWorkflowsInterface from '@/components/cmc/SmartWorkflowsInterface';
import CMCBlueprintGenerator from '@/components/cmc/CMCBlueprintGenerator';
import CMCDocumentManager from '@/components/cmc/CMCDocumentManager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useLocation } from 'wouter';

const CMCGenerator = () => {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('authoring');
  const [drugName, setDrugName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedBlueprint, setGeneratedBlueprint] = useState(null);
  const [complianceScore, setComplianceScore] = useState(85);
  const [riskAlerts, setRiskAlerts] = useState([]);
  const [workflowProgress, setWorkflowProgress] = useState(0);
  const [qbdAnalysis, setQbdAnalysis] = useState(null);
  const [methodValidation, setMethodValidation] = useState(null);
  const [regulatoryUpdates, setRegulatoryUpdates] = useState([]);
  const [isLoadingAdvanced, setIsLoadingAdvanced] = useState(false);
  const [structuredInputs, setStructuredInputs] = useState({
    molecularWeight: '',
    synthesisRoute: '',
    drugSubstance: '',
    dosageForm: '',
    excipients: '',
    manufacturingSite: '',
  });

  useEffect(() => {
    // Simulate real-time compliance monitoring
    const timer = setInterval(() => {
      setComplianceScore(prev => Math.min(100, prev + Math.random() * 2));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleGenerateBlueprint = async () => {
    if (!drugName.trim()) {
      alert('Please enter a drug name or code.');
      return;
    }

    setIsGenerating(true);
    setWorkflowProgress(0);

    try {
      // Simulate multi-step generation process
      setWorkflowProgress(25);

      const response = await fetch('/api/cmc/generate-enhanced-blueprint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          drugName: drugName.trim(),
          structuredInputs,
          generateTables: true,
          generateFlowcharts: true,
          generateProtocols: true,
        }),
      });

      setWorkflowProgress(75);
      const result = await response.json();
      setWorkflowProgress(100);

      if (response.ok) {
        setGeneratedBlueprint(result);
        setRiskAlerts(result.riskAlerts || []);
        alert('Enhanced CMC Blueprint generated successfully!');
      } else {
        throw new Error(result.error || 'Failed to generate CMC blueprint');
      }
    } catch (error) {
      // Fallback to basic generation
      const fallbackResponse = await fetch('/api/cmc/generate-blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drugName: drugName.trim() }),
      });

      if (fallbackResponse.ok) {
        const result = await fallbackResponse.json();
        setGeneratedBlueprint(result);
        alert('Basic CMC Blueprint generated successfully!');
      } else {
        alert('Error: ' + error.message);
      }
    } finally {
      setIsGenerating(false);
      setWorkflowProgress(0);
    }
  };

  const handleInputChange = (field, value) => {
    setStructuredInputs(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  // Advanced CMC Features
  const handleQbDAnalysis = async () => {
    if (!drugName.trim()) {
      alert('Please enter a drug name first.');
      return;
    }

    setIsLoadingAdvanced(true);
    try {
      const response = await fetch('/api/cmc/qbd-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drugName: drugName.trim(), structuredInputs }),
      });

      const result = await response.json();
      if (response.ok) {
        setQbdAnalysis(result.data);
        alert('QbD Analysis completed successfully!');
      } else {
        throw new Error(result.error || 'Failed to perform QbD analysis');
      }
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsLoadingAdvanced(false);
    }
  };

  const handleMethodValidation = async () => {
    if (!drugName.trim()) {
      alert('Please enter a drug name first.');
      return;
    }

    setIsLoadingAdvanced(true);
    try {
      const response = await fetch('/api/cmc/method-validation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drugName: drugName.trim(), structuredInputs }),
      });

      const result = await response.json();
      if (response.ok) {
        setMethodValidation(result.data);
        alert('Method Validation Protocol generated successfully!');
      } else {
        throw new Error(result.error || 'Failed to generate method validation');
      }
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsLoadingAdvanced(false);
    }
  };

  const loadRegulatoryUpdates = async () => {
    try {
      const response = await fetch('/api/cmc/regulatory-updates');
      const result = await response.json();
      if (response.ok) {
        setRegulatoryUpdates(result.data);
      }
    } catch (error) {
      console.error('Failed to load regulatory updates:', error);
    }
  };

  const handleAdvancedRiskAssessment = async () => {
    if (!drugName.trim()) {
      alert('Please enter a drug name first.');
      return;
    }

    setIsLoadingAdvanced(true);
    try {
      const response = await fetch('/api/cmc/risk-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drugName: drugName.trim(), structuredInputs }),
      });

      const result = await response.json();
      if (response.ok) {
        setRiskAlerts(result.data);
        alert('Advanced Risk Assessment completed!');
      } else {
        throw new Error(result.error || 'Failed to perform risk assessment');
      }
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsLoadingAdvanced(false);
    }
  };

  // Load regulatory updates on component mount
  useEffect(() => {
    loadRegulatoryUpdates();
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-indigo-600 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/client-portal')}
              className="text-white hover:bg-indigo-700"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Portal
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Beaker className="h-8 w-8" />
            <div>
              <h1 className="text-3xl font-bold">CMC Wizard™</h1>
              <p className="text-indigo-200">
                Chemistry, Manufacturing, and Controls Blueprint Generator
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Tabbed Interface */}
      <div className="max-w-7xl mx-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6 mb-6">
            <TabsTrigger value="authoring" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              AI Co-Pilot
            </TabsTrigger>
            <TabsTrigger value="blueprint" className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              Blueprint Generator
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Document Manager
            </TabsTrigger>
            <TabsTrigger value="workflows" className="flex items-center gap-2">
              <Workflow className="h-4 w-4" />
              Smart Workflows
            </TabsTrigger>
            <TabsTrigger value="compliance" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Compliance Guardian
            </TabsTrigger>
            <TabsTrigger value="governance" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Data Orchestrator
            </TabsTrigger>
          </TabsList>

          {/* Tab Content */}
          <TabsContent value="authoring" className="space-y-6">
            {/* Quick Access to Document Editor */}
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-600" />
                Professional Document Authoring
              </h2>
              <p className="text-gray-600 mb-4">
                Use the enhanced Document Editor with eCTD-aware rich text capabilities,
                ICH-compliant formatting, and real-time compliance analysis.
              </p>
              <Button
                onClick={() => window.open('/document-editor', '_blank')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <FileText className="h-4 w-4 mr-2" />
                Open Document Editor
              </Button>
            </div>

            {/* Proactive Authoring Interface */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* Structured Input Form */}
                <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Brain className="h-5 w-5 text-indigo-600" />
                    Proactive AI Prompting
                  </h2>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Drug Name *
                      </label>
                      <Input
                        placeholder="e.g., Pembrolizumab"
                        value={drugName}
                        onChange={e => setDrugName(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Molecular Weight (Da)
                      </label>
                      <Input
                        placeholder="e.g., 149,000"
                        value={structuredInputs.molecularWeight}
                        onChange={e => handleInputChange('molecularWeight', e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Drug Substance
                      </label>
                      <Input
                        placeholder="e.g., Monoclonal antibody"
                        value={structuredInputs.drugSubstance}
                        onChange={e => handleInputChange('drugSubstance', e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Dosage Form
                      </label>
                      <Input
                        placeholder="e.g., Solution for injection"
                        value={structuredInputs.dosageForm}
                        onChange={e => handleInputChange('dosageForm', e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Proposed Synthesis Route
                      </label>
                      <Input
                        placeholder="Describe the manufacturing process..."
                        value={structuredInputs.synthesisRoute}
                        onChange={e => handleInputChange('synthesisRoute', e.target.value)}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Generation Options */}
                  <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h3 className="font-semibold text-blue-900 mb-2">Multi-Format Generation</h3>
                    <div className="grid grid-cols-3 gap-2 text-sm text-blue-800">
                      <div>✓ Narrative Sections</div>
                      <div>✓ Data Tables</div>
                      <div>✓ Process Flowcharts</div>
                      <div>✓ Stability Protocols</div>
                      <div>✓ Module 3 Compliance</div>
                      <div>✓ GxP Language</div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {isGenerating && workflowProgress > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between text-sm text-gray-600 mb-1">
                        <span>Generating Blueprint...</span>
                        <span>{workflowProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${workflowProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 mt-6">
                    <Button
                      onClick={handleGenerateBlueprint}
                      disabled={isGenerating || !drugName.trim()}
                      className="w-full bg-indigo-600 hover:bg-indigo-700"
                      size="lg"
                    >
                      {isGenerating ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Generating Enhanced Blueprint...
                        </>
                      ) : (
                        <>
                          <Brain className="mr-2 h-4 w-4" />
                          Generate AI-Enhanced CMC Blueprint
                        </>
                      )}
                    </Button>

                    {/* Advanced Features Row */}
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        onClick={handleQbDAnalysis}
                        disabled={isLoadingAdvanced || !drugName.trim()}
                        variant="outline"
                        size="sm"
                        className="border-purple-300 text-purple-700 hover:bg-purple-50"
                      >
                        {isLoadingAdvanced ? (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-600 mr-2"></div>
                        ) : (
                          <Target className="mr-2 h-3 w-3" />
                        )}
                        QbD Analysis
                      </Button>
                      <Button
                        onClick={handleMethodValidation}
                        disabled={isLoadingAdvanced || !drugName.trim()}
                        variant="outline"
                        size="sm"
                        className="border-blue-300 text-blue-700 hover:bg-blue-50"
                      >
                        {isLoadingAdvanced ? (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-2"></div>
                        ) : (
                          <FlaskConical className="mr-2 h-3 w-3" />
                        )}
                        Method Validation
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Results Display */}
                {generatedBlueprint && (
                  <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <h3 className="text-xl font-semibold text-green-800">
                        Enhanced Blueprint Generated
                      </h3>
                    </div>
                    <p className="text-gray-700 mb-4">{generatedBlueprint.message}</p>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <Button size="sm" className="bg-green-600 hover:bg-green-700">
                        <Download className="h-4 w-4 mr-2" />
                        Download Full Module 3
                      </Button>
                      <Button size="sm" variant="outline">
                        <FileText className="h-4 w-4 mr-2" />
                        View Process Flowcharts
                      </Button>
                    </div>

                    <div className="text-sm text-gray-600">
                      <p>
                        <strong>Generated Components:</strong> Module 3.2.S, Module 3.2.P, Process
                        maps, Stability protocols, Quality control specifications
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* AI Assistant Sidebar */}
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-6">
                  <h3 className="font-semibold text-indigo-900 mb-3 flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    AI Co-Pilot Assistant
                  </h3>
                  <div className="space-y-3 text-sm text-indigo-800">
                    <div className="p-3 bg-white rounded border border-indigo-100">
                      <strong>Smart Suggestion:</strong> Based on your drug type, consider including
                      extractables & leachables data for container closure systems.
                    </div>
                    <div className="p-3 bg-white rounded border border-indigo-100">
                      <strong>Auto-Complete:</strong> "The drug substance is manufactured using a
                      well-established cell culture process consistent with ICH Q11 guidelines..."
                    </div>
                    <div className="p-3 bg-white rounded border border-indigo-100">
                      <strong>Citation Suggested:</strong> Reference stability study ST-2024-001 for
                      shelf-life justification.
                    </div>
                  </div>
                </div>

                {/* QbD Analysis Results */}
                {qbdAnalysis && (
                  <Card className="border-purple-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg text-purple-900 flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        Quality by Design Framework
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-purple-800 max-h-40 overflow-y-auto">
                        <pre className="whitespace-pre-wrap font-sans">
                          {qbdAnalysis.qbdFramework?.substring(0, 500)}...
                        </pre>
                      </div>
                      <Button size="sm" className="mt-3 bg-purple-600 hover:bg-purple-700">
                        <Download className="h-3 w-3 mr-2" />
                        Download Full QbD Report
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Method Validation Results */}
                {methodValidation && (
                  <Card className="border-blue-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg text-blue-900 flex items-center gap-2">
                        <FlaskConical className="h-5 w-5" />
                        Method Validation Protocol
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-blue-800 max-h-40 overflow-y-auto">
                        <pre className="whitespace-pre-wrap font-sans">
                          {methodValidation.validationProtocol?.substring(0, 500)}...
                        </pre>
                      </div>
                      <Button size="sm" className="mt-3 bg-blue-600 hover:bg-blue-700">
                        <Download className="h-3 w-3 mr-2" />
                        Download Protocol
                      </Button>
                    </CardContent>
                  </Card>
                )}

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-yellow-900">AI Recommendations</h3>
                    <Button
                      onClick={handleAdvancedRiskAssessment}
                      disabled={isLoadingAdvanced || !drugName.trim()}
                      size="sm"
                      className="bg-yellow-600 hover:bg-yellow-700 text-white"
                    >
                      {isLoadingAdvanced ? (
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                      ) : (
                        <Eye className="mr-2 h-3 w-3" />
                      )}
                      AI Risk Analysis
                    </Button>
                  </div>
                  <ul className="text-sm text-yellow-800 space-y-2">
                    {riskAlerts.length > 0 ? (
                      riskAlerts
                        .slice(0, 4)
                        .map((alert, index) => <li key={index}>• {alert.message}</li>)
                    ) : (
                      <>
                        <li>• Include ICH Q1A stability study design</li>
                        <li>• Add forced degradation studies</li>
                        <li>• Consider nitrosamine impurity assessment</li>
                        <li>• Update manufacturing site qualification</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="compliance" className="space-y-6">
            {/* Compliance Guardian Interface */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Shield className="h-5 w-5 text-green-600" />
                    Predictive Compliance Monitor
                  </h2>

                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                      <div className="text-2xl font-bold text-green-700">{complianceScore}%</div>
                      <div className="text-sm text-green-600">Compliance Score</div>
                    </div>
                    <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="text-2xl font-bold text-blue-700">3</div>
                      <div className="text-sm text-blue-600">Active Monitors</div>
                    </div>
                    <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                      <div className="text-2xl font-bold text-yellow-700">2</div>
                      <div className="text-sm text-yellow-600">Risk Alerts</div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-5 w-5 text-yellow-600" />
                        <h4 className="font-semibold text-yellow-800">New ICH Guideline Impact</h4>
                      </div>
                      <p className="text-sm text-yellow-700">
                        ICH Q1F stability data package update affects Module 3.2.P.8. Review
                        required by March 2025.
                      </p>
                      <Button
                        size="sm"
                        className="mt-2 bg-yellow-600 hover:bg-yellow-700 text-white"
                      >
                        Review Impact
                      </Button>
                    </div>

                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                        <h4 className="font-semibold text-red-800">Mock Inspection Finding</h4>
                      </div>
                      <p className="text-sm text-red-700">
                        Module 3.2.S.4.4 batch analyses show incomplete analytical method validation
                        data.
                      </p>
                      <Button size="sm" className="mt-2 bg-red-600 hover:bg-red-700 text-white">
                        Address Finding
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Approval Timeline Predictor
                  </h3>
                  <div className="text-sm text-green-800">
                    <div className="mb-3">
                      <div className="flex justify-between mb-1">
                        <span>Estimated Approval</span>
                        <span className="font-semibold">8-12 months</span>
                      </div>
                      <div className="w-full bg-green-200 rounded-full h-2">
                        <div className="bg-green-600 h-2 rounded-full w-3/4"></div>
                      </div>
                    </div>
                    <p>
                      <strong>Confidence:</strong> 78% based on current compliance score and
                      historical data
                    </p>
                  </div>
                </div>

                <Card className="border-blue-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-blue-900 flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      Regulatory Intelligence
                      <Badge variant="secondary" className="ml-auto">
                        {regulatoryUpdates.length} Updates
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 max-h-48 overflow-y-auto">
                      {regulatoryUpdates.slice(0, 3).map((update, index) => (
                        <div key={index} className="p-3 bg-blue-50 rounded border border-blue-100">
                          <div className="flex items-center justify-between mb-1">
                            <Badge variant="outline" className="text-xs">
                              {update.source}
                            </Badge>
                            <span className="text-xs text-blue-600">{update.date}</span>
                          </div>
                          <h4 className="font-semibold text-blue-900 text-sm mb-1">
                            {update.title}
                          </h4>
                          <p className="text-xs text-blue-700">{update.impact}</p>
                          <p className="text-xs text-blue-600 mt-1">{update.action}</p>
                        </div>
                      ))}
                    </div>
                    <Button
                      onClick={loadRegulatoryUpdates}
                      size="sm"
                      variant="outline"
                      className="w-full mt-3 border-blue-300 text-blue-700 hover:bg-blue-50"
                    >
                      <Activity className="h-3 w-3 mr-2" />
                      Refresh Updates
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="governance" className="space-y-6">
            {/* Data Governance Interface */}
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Database className="h-5 w-5 text-purple-600" />
                AI-Verified Data Lineage & Integrity
              </h2>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <h4 className="font-semibold text-purple-900">Data Traceability</h4>
                  <p className="text-sm text-purple-700 mt-2">
                    Every data point maintains auditable links to primary sources with AI
                    verification.
                  </p>
                </div>
                <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                  <h4 className="font-semibold text-indigo-900">Integrity Checks</h4>
                  <p className="text-sm text-indigo-700 mt-2">
                    Cross-module consistency monitoring with automated conflict detection.
                  </p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-semibold text-blue-900">Content Control</h4>
                  <p className="text-sm text-blue-700 mt-2">
                    Smart repository with auto-categorization and version control.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 border border-gray-200 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2">Recent Data Integrity Checks</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span>Dissolution data consistency (Module 2.3 ↔ Module 3.2.P)</span>
                      <span className="text-green-600 font-semibold">✓ Verified</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Stability claim alignment (CMC ↔ Clinical)</span>
                      <span className="text-green-600 font-semibold">✓ Verified</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Manufacturing site qualification status</span>
                      <span className="text-yellow-600 font-semibold">⚠ Needs Update</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="blueprint" className="space-y-6">
            <CMCBlueprintGenerator />
          </TabsContent>

          <TabsContent value="documents" className="space-y-6">
            <CMCDocumentManager />
          </TabsContent>

          <TabsContent value="workflows" className="space-y-6">
            <SmartWorkflowsInterface
              drugName={drugName}
              structuredInputs={structuredInputs}
              onWorkflowComplete={result => {
                setGeneratedBlueprint(result);
                setActiveTab('authoring');
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CMCGenerator;
