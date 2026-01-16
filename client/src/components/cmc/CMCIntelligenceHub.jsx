import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import {
  Brain, BarChart3, Shield, Clock, Users, Target, AlertTriangle, CheckCircle2, Plus, Edit, Download, Upload, Search, Filter, Microscope, TestTube, Activity, Clipboard, Settings, Database, FileCheck, TrendingUp, AlertCircle, Calendar, User, Eye, Trash2, Save, X, Package, Pill, ArrowRight, FileText, PlayCircle, Lightbulb, Zap, MessageSquare, ChartLine, Globe, Award, Fingerprint, Calculator, Gauge, RefreshCw, Scale, Thermometer, Timer, Container, HardDrive, Lock, PenTool, CopyIcon, Hash, Layers, GitBranch, FileSearch } from 'lucide-react'
import { useToast } from '@/hooks/use-toast';

// CMC Intelligence Hub - AI-Powered Regulatory Intelligence
const CMCIntelligenceHub = ({ organizationId = 7 }) => {
  const [activeTab, setActiveTab] = useState('ai-advisor');
  const [loading, setLoading] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const { toast } = useToast();

  // Enhanced AI Regulatory Advisor with Gap Analysis
  const renderAIAdvisor = () => (
    <div className="space-y-6" data-testid="ai-advisor">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">AI Gap Analyzer & Regulatory Advisor</h2>
          <p className="text-gray-600 mt-1">AI-powered gap detection, compliance analysis, and regulatory guidance</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="bg-red-100 text-red-700">
            <AlertTriangle className="w-4 h-4 mr-1" />
            Gap Analysis
          </Badge>
          <Badge variant="secondary" className="bg-blue-100 text-blue-700">
            <Brain className="w-4 h-4 mr-1" />
            AI Powered
          </Badge>
        </div>
      </div>

      {/* AI Gap Analysis Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gradient-to-r from-red-50 to-orange-50 rounded-lg border border-red-200">
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600">12</div>
          <p className="text-sm text-red-700">Critical Gaps</p>
          <Badge variant="destructive" className="mt-1 text-xs">
            Requires Action
          </Badge>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-600">8</div>
          <p className="text-sm text-orange-700">Missing Documents</p>
          <Badge variant="secondary" className="mt-1 text-xs bg-orange-100 text-orange-700">
            In Progress
          </Badge>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">94%</div>
          <p className="text-sm text-blue-700">Compliance Score</p>
          <Badge variant="outline" className="mt-1 text-xs bg-blue-100 text-blue-700">
            Above Target
          </Badge>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">3 days</div>
          <p className="text-sm text-green-700">Avg Resolution Time</p>
          <Badge variant="default" className="mt-1 text-xs bg-green-100 text-green-700">
            AI Optimized
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              AI Gap Analyzer & Advisor
            </CardTitle>
            <CardDescription>
              Analyze submissions for gaps, ask questions about CMC requirements, or get compliance guidance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Gap Analysis Actions */}
              <div className="border rounded-lg p-4 bg-gradient-to-r from-purple-50 to-blue-50">
                <h5 className="font-medium text-sm mb-3 flex items-center">
                  <Search className="w-4 h-4 mr-2 text-purple-600" />
                  Intelligent Gap Detection
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" className="justify-start" data-testid="button-analyze-submission">
                    <FileSearch className="w-4 h-4 mr-2" />
                    Analyze Current Submission
                  </Button>
                  <Button size="sm" variant="outline" className="justify-start" data-testid="button-compliance-check">
                    <Shield className="w-4 h-4 mr-2" />
                    Run Compliance Check
                  </Button>
                  <Button size="sm" variant="outline" className="justify-start" data-testid="button-document-audit">
                    <Clipboard className="w-4 h-4 mr-2" />
                    Document Audit
                  </Button>
                  <Button size="sm" variant="outline" className="justify-start" data-testid="button-risk-assessment">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Risk Assessment
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="ai-query">Your Question or Document Upload</Label>
                <Textarea
                  id="ai-query"
                  value={aiQuery}
                  onChange={e => setAiQuery(e.target.value)}
                  placeholder="e.g., 'Analyze my analytical method validation data for FDA compliance gaps' or 'What are the FDA requirements for analytical method validation?'"
                  rows={3}
                />
              </div>

              <Button
                onClick={() => {
                  setLoading(true);
                  // Simulate enhanced AI response with gap analysis
                  setTimeout(() => {
                    setAiResponse(`🔍 **AI GAP ANALYSIS COMPLETE**

**CRITICAL GAPS IDENTIFIED:**
❌ **Missing Forced Degradation Studies** (CRITICAL)
   Impact: FDA may issue CRL - Est. 6-month delay
   Action: Execute ICH Q1A(R2) stress testing protocol

❌ **Incomplete Method Transfer Data** (HIGH)
   Impact: Manufacturing site qualification at risk  
   Action: Complete 3-batch transfer validation

⚠️ **Missing Container-Closure Studies** (MEDIUM)
   Impact: Potential stability data gaps
   Action: Initiate USP <381> extractables testing

**COMPLIANCE SCORE: 87%** (Target: >95%)

**AI RECOMMENDATIONS:**
1. **Immediate Action (0-7 days):**
   - Submit degradation study protocol to FDA
   - Begin forced degradation studies for all stress conditions
   
2. **Short-term (1-4 weeks):**
   - Complete method transfer to 2 additional sites
   - Validate analytical methods at receiving sites
   
3. **Medium-term (1-3 months):**
   - Generate 6-month stability data
   - Complete container-closure compatibility studies

**PREDICTED OUTCOMES:**
✅ Following these recommendations: 96% approval probability
❌ Current state: 73% approval probability  
⏰ Timeline impact: +14 days if gaps addressed now vs +6 months if discovered during review

**SMART NEXT STEPS:**
1. Auto-generate gap resolution workflows ➤ 
2. Schedule regulatory meeting ➤
3. Update project timeline ➤`);
                    setLoading(false);
                  }, 3000);
                }}
                disabled={!aiQuery.trim() || loading}
                className="w-full"
                data-testid="button-ask-ai"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing for Gaps...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Run AI Gap Analysis
                  </>
                )}
              </Button>

              {aiResponse && (
                <div className="p-4 border rounded-lg bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Brain className="w-5 h-5 text-purple-600" />
                    <span className="font-medium text-purple-900">AI Gap Analyzer Results</span>
                    <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Analysis Complete
                    </Badge>
                  </div>
                  <div className="whitespace-pre-line text-sm text-gray-800">{aiResponse}</div>
                  
                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-4">
                    <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
                      <Zap className="w-3 h-3 mr-1" />
                      Auto-Resolve Gaps
                    </Button>
                    <Button size="sm" variant="outline">
                      <Download className="w-3 h-3 mr-1" />
                      Export Report
                    </Button>
                    <Button size="sm" variant="outline">
                      <Calendar className="w-3 h-3 mr-1" />
                      Schedule Review
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Real-time Gap Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                {
                  gap: 'Missing Stability Data',
                  severity: 'critical',
                  impact: '6-month delay risk',
                  action: 'Initiate studies now'
                },
                {
                  gap: 'Incomplete Process Validation',
                  severity: 'high', 
                  impact: 'Manufacturing hold risk',
                  action: 'Complete Stage 3 PPQ'
                },
                {
                  gap: 'Method Transfer Pending',
                  severity: 'medium',
                  impact: 'Site qualification delay',
                  action: 'Schedule transfer studies'
                },
                {
                  gap: 'Container Closure Studies',
                  severity: 'low',
                  impact: 'Minor review delay',
                  action: 'Plan extraction studies'
                }
              ].map((item, index) => (
                <div key={index} className={`p-3 border rounded-lg ${
                  item.severity === 'critical' ? 'bg-red-50 border-red-200' :
                  item.severity === 'high' ? 'bg-orange-50 border-orange-200' :
                  item.severity === 'medium' ? 'bg-yellow-50 border-yellow-200' :
                  'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex justify-between items-start mb-2">
                    <h5 className="font-medium text-sm">{item.gap}</h5>
                    <Badge variant={
                      item.severity === 'critical' ? 'destructive' :
                      item.severity === 'high' ? 'secondary' : 'outline'
                    } className="text-xs">
                      {item.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-600 mb-2">Impact: {item.impact}</p>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs w-full">
                    <Zap className="w-3 h-3 mr-1" />
                    {item.action}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <FileText className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">1,247</p>
                <p className="text-sm text-gray-600">Guidance Documents</p>
                <Badge variant="default">FDA, EMA, ICH</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">98%</p>
                <p className="text-sm text-gray-600">Accuracy Rate</p>
                <Badge variant="secondary">AI Responses</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Clock className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">3.2s</p>
                <p className="text-sm text-gray-600">Avg Response Time</p>
                <Badge variant="outline">Real-time</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Users className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">156</p>
                <p className="text-sm text-gray-600">Questions Answered</p>
                <Badge variant="default">This Month</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  // Enhanced Predictive Analytics with Gap Impact Analysis
  const renderPredictiveAnalytics = () => (
    <div className="space-y-6" data-testid="predictive-analytics">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Predictive Analytics & Gap Impact Assessment</h2>
          <p className="text-gray-600 mt-1">
            AI-powered predictions with gap analysis impact on regulatory and manufacturing outcomes
          </p>
        </div>
        <Button variant="outline" data-testid="button-run-prediction">
          <BarChart3 className="w-4 h-4 mr-2" />
          Run Prediction
        </Button>
      </div>

      {/* Predictive Overview with Gap Impact */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">87%</div>
          <p className="text-sm text-green-700">Current Success Rate</p>
          <Badge variant="default" className="mt-1 text-xs bg-green-100 text-green-700">
            Above Industry
          </Badge>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">96%</div>
          <p className="text-sm text-blue-700">After Gap Resolution</p>
          <Badge variant="outline" className="mt-1 text-xs bg-blue-100 text-blue-700">
            <TrendingUp className="w-3 h-3 mr-1" />
            +9% Improvement
          </Badge>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-600">-14</div>
          <p className="text-sm text-orange-700">Days Timeline Impact</p>
          <Badge variant="secondary" className="mt-1 text-xs bg-orange-100 text-orange-700">
            If Gaps Addressed
          </Badge>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600">+180</div>
          <p className="text-sm text-red-700">Days if Ignored</p>
          <Badge variant="destructive" className="mt-1 text-xs">
            High Risk
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ChartLine className="w-5 h-5" />
              Regulatory Success Prediction with Gap Analysis
            </CardTitle>
            <CardDescription>Predict approval likelihood and identify submission gaps impacting success</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                {
                  submission: 'IND-2024-015',
                  probability: 92,
                  factors: ['Complete CMC data', 'Strong preclinical'],
                  gaps: 1,
                  gapImpact: 'Low',
                  gapDetails: 'Minor container-closure study gap'
                },
                {
                  submission: 'NDA-2024-008',
                  probability: 87,
                  factors: ['Phase 3 success', 'Manufacturing ready'],
                  gaps: 3,
                  gapImpact: 'Medium',
                  gapDetails: 'Missing forced degradation, incomplete tech transfer'
                },
                {
                  submission: 'ANDA-2024-012',
                  probability: 78,
                  factors: ['BE study complete', 'Minor CMC gaps'],
                  gaps: 5,
                  gapImpact: 'High',
                  gapDetails: 'Critical stability data missing, process validation incomplete'
                },
              ].map((prediction, index) => (
                <div key={index} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h5 className="font-medium">{prediction.submission}</h5>
                      <div className="text-sm text-gray-600 mt-1">
                        Success Probability: {prediction.probability}%
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={
                          prediction.probability >= 85
                            ? 'default'
                            : prediction.probability >= 70
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {prediction.probability >= 85
                          ? 'High'
                        : prediction.probability >= 70
                          ? 'Medium'
                          : 'Low'}
                      </Badge>
                    </div>
                    <Progress value={prediction.probability} className="h-3 mb-2" />
                    <div className="text-xs text-gray-600">
                      Key factors: {prediction.factors.join(', ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Quality Risk Prediction
            </CardTitle>
            <CardDescription>Predict quality issues before they occur</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                {
                  batch: 'BT-2024-089',
                  risk: 15,
                  issue: 'Yield below target',
                  action: 'Process optimization',
                },
                {
                  batch: 'BT-2024-090',
                  risk: 8,
                  issue: 'Impurity spike risk',
                  action: 'Enhanced monitoring',
                },
                {
                  batch: 'BT-2024-091',
                  risk: 23,
                  issue: 'Dissolution variance',
                  action: 'Formulation review',
                },
              ].map((prediction, index) => (
                <div key={index} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h5 className="font-medium">{prediction.batch}</h5>
                      <div className="text-sm text-gray-600">Risk: {prediction.risk}%</div>
                    </div>
                    <Badge
                      variant={
                        prediction.risk >= 20
                          ? 'destructive'
                          : prediction.risk >= 10
                            ? 'secondary'
                            : 'default'
                      }
                    >
                      {prediction.risk >= 20
                        ? 'High Risk'
                        : prediction.risk >= 10
                          ? 'Medium Risk'
                          : 'Low Risk'}
                    </Badge>
                  </div>
                  <div className="text-sm">
                    <p className="text-gray-800">{prediction.issue}</p>
                    <p className="text-gray-600 text-xs mt-1">Recommended: {prediction.action}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Market Intelligence
          </CardTitle>
          <CardDescription>Competitive landscape and market trend analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <h5 className="font-medium mb-2">Competitive Submissions</h5>
              <p className="text-2xl font-bold text-blue-600">23</p>
              <p className="text-sm text-gray-600">Similar products in pipeline</p>
              <div className="mt-2">
                <Badge variant="outline">Therapeutic Area: Oncology</Badge>
              </div>
            </div>

            <div className="p-4 border rounded-lg">
              <h5 className="font-medium mb-2">Market Opportunity</h5>
              <p className="text-2xl font-bold text-green-600">$2.8B</p>
              <p className="text-sm text-gray-600">Estimated market size</p>
              <div className="mt-2">
                <Badge variant="default">Growth: 12% CAGR</Badge>
              </div>
            </div>

            <div className="p-4 border rounded-lg">
              <h5 className="font-medium mb-2">Regulatory Trends</h5>
              <p className="text-2xl font-bold text-orange-600">↑ 15%</p>
              <p className="text-sm text-gray-600">Approval time reduction</p>
              <div className="mt-2">
                <Badge variant="secondary">Fast Track Eligible</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Compliance Monitor
  const renderComplianceMonitor = () => (
    <div className="space-y-6" data-testid="compliance-monitor">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Compliance Monitor</h2>
          <p className="text-gray-600 mt-1">Real-time compliance tracking and alerts</p>
        </div>
        <Button variant="outline" data-testid="button-compliance-report">
          <FileCheck className="w-4 h-4 mr-2" />
          Generate Report
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-green-600">96%</p>
                <p className="text-sm text-gray-600">Overall Compliance</p>
              </div>
              <Shield className="w-8 h-8 text-green-600" />
            </div>
            <Progress value={96} className="h-2 mt-3" />
          </CardContent>
        </Card>

        <Card className="border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-blue-600">12</p>
                <p className="text-sm text-gray-600">Active Audits</p>
              </div>
              <Eye className="w-8 h-8 text-blue-600" />
            </div>
            <div className="text-xs text-gray-600 mt-2">8 internal, 4 external</div>
          </CardContent>
        </Card>

        <Card className="border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-orange-600">5</p>
                <p className="text-sm text-gray-600">Open Findings</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-orange-600" />
            </div>
            <div className="text-xs text-gray-600 mt-2">2 critical, 3 minor</div>
          </CardContent>
        </Card>

        <Card className="border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-purple-600">28</p>
                <p className="text-sm text-gray-600">CAPA Actions</p>
              </div>
              <RefreshCw className="w-8 h-8 text-purple-600" />
            </div>
            <div className="text-xs text-gray-600 mt-2">24 on track, 4 overdue</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Critical Compliance Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                {
                  alert: 'GMP deviation - Batch BT-2024-087',
                  severity: 'Critical',
                  date: '2025-08-14',
                },
                {
                  alert: 'Method validation overdue - AM-2024-015',
                  severity: 'High',
                  date: '2025-08-13',
                },
                { alert: 'Stability data review pending', severity: 'Medium', date: '2025-08-12' },
              ].map((alert, index) => (
                <div
                  key={index}
                  className={`p-3 rounded border-l-4 ${
                    alert.severity === 'Critical'
                      ? 'bg-red-50 border-red-200'
                      : alert.severity === 'High'
                        ? 'bg-orange-50 border-orange-200'
                        : 'bg-yellow-50 border-yellow-200'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">{alert.alert}</p>
                      <p className="text-xs text-gray-600">{alert.date}</p>
                    </div>
                    <Badge
                      variant={
                        alert.severity === 'Critical'
                          ? 'destructive'
                          : alert.severity === 'High'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {alert.severity}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Compliance Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { metric: 'GMP Compliance', current: 96, trend: '+2%', status: 'improving' },
                { metric: 'Audit Findings', current: 5, trend: '-3', status: 'improving' },
                { metric: 'CAPA Effectiveness', current: 89, trend: '+5%', status: 'improving' },
                { metric: 'Documentation Quality', current: 94, trend: '+1%', status: 'stable' },
              ].map((trend, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center p-3 border rounded-lg"
                >
                  <div>
                    <h5 className="font-medium text-sm">{trend.metric}</h5>
                    <p className="text-lg font-bold">
                      {trend.current}
                      {trend.metric.includes('Compliance') ||
                      trend.metric.includes('Quality') ||
                      trend.metric.includes('Effectiveness')
                        ? '%'
                        : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={trend.status === 'improving' ? 'default' : 'secondary'}>
                      {trend.trend}
                    </Badge>
                    <p className="text-xs text-gray-600 mt-1">{trend.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">CMC Intelligence Hub</h1>
          <p className="text-gray-600 mt-2">
            AI-powered regulatory intelligence and compliance monitoring
          </p>
        </div>

        {/* Intelligence Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3" data-testid="intelligence-tabs">
            <TabsTrigger value="ai-advisor" data-testid="tab-ai-advisor">
              AI Advisor
            </TabsTrigger>
            <TabsTrigger value="predictive-analytics" data-testid="tab-predictive">
              Predictive Analytics
            </TabsTrigger>
            <TabsTrigger value="compliance-monitor" data-testid="tab-compliance">
              Compliance Monitor
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ai-advisor">{renderAIAdvisor()}</TabsContent>
          <TabsContent value="predictive-analytics">{renderPredictiveAnalytics()}</TabsContent>
          <TabsContent value="compliance-monitor">{renderComplianceMonitor()}</TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CMCIntelligenceHub;
