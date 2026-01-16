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
  FileText, BarChart3, Shield, Clock, Users, Target, AlertTriangle, CheckCircle2, Plus, Edit, Download, Upload, Search, Filter, Eye, Activity, Calendar, User, Trash2, Save, X, Package, Pill, ArrowRight, PlayCircle, History, BookOpen, FileCheck, Clipboard, Database, Settings, PenTool, Hash, Lock, Globe, Award, Fingerprint, Brain, Zap, MessageSquare, ChartLine, Container, HardDrive, RefreshCw, Scale, Thermometer, Timer, Lightbulb, Archive, FolderOpen, GitBranch, Layers, CopyIcon, Gauge } from 'lucide-react'
import { useToast } from '@/hooks/use-toast';

// CMC Audit and Documentation System - Comprehensive Regulatory Documentation
const CMCAuditAndDocumentation = ({ organizationId = 7 }) => {
  const [activeTab, setActiveTab] = useState('audit-trail');
  const [loading, setLoading] = useState(false);
  const [auditData, setAuditData] = useState([]);
  const [documents, setDocuments] = useState([]);
  const { toast } = useToast();

  useEffect(() => {
    loadAuditData();
    loadDocuments();
  }, []);

  const loadAuditData = () => {
    // Simulate loading comprehensive audit trail data
    setAuditData([
      {
        id: 1,
        timestamp: '2025-08-15 14:30:22',
        user: 'Dr. Sarah Johnson',
        action: 'Method Validation Completed',
        entity: 'AM-2024-015',
        details: 'HPLC method validation completed with all ICH Q2 parameters met',
        impact: 'High',
        category: 'Method Development',
      },
      {
        id: 2,
        timestamp: '2025-08-15 11:15:45',
        user: 'Mark Chen',
        action: 'Batch Release Approved',
        entity: 'BT-2024-089',
        details: 'All QC tests passed, batch approved for commercial release',
        impact: 'Critical',
        category: 'Quality Control',
      },
      {
        id: 3,
        timestamp: '2025-08-15 09:22:18',
        user: 'Lisa Martinez',
        action: 'Stability Study Initiated',
        entity: 'ST-2025-003',
        details: 'Long-term stability study started for Product C 50mg tablets',
        impact: 'Medium',
        category: 'Stability Testing',
      },
    ]);
  };

  const loadDocuments = () => {
    // Simulate loading comprehensive document library
    setDocuments([
      {
        id: 1,
        title: 'Analytical Method Validation Protocol - AM-2024-015',
        type: 'Protocol',
        version: '2.1',
        status: 'Approved',
        approver: 'Dr. Robert Kim',
        category: 'Method Development',
        created: '2025-08-01',
        lastModified: '2025-08-15',
      },
      {
        id: 2,
        title: 'Process Validation Master Plan - 2025',
        type: 'Master Plan',
        version: '1.0',
        status: 'Draft',
        approver: 'Pending',
        category: 'Process Validation',
        created: '2025-08-10',
        lastModified: '2025-08-14',
      },
      {
        id: 3,
        title: 'GMP Compliance Assessment Report - Q2 2025',
        type: 'Report',
        version: '1.0',
        status: 'Final',
        approver: 'Quality Director',
        category: 'Compliance',
        created: '2025-07-30',
        lastModified: '2025-08-05',
      },
    ]);
  };

  // Comprehensive Audit Trail
  const renderAuditTrail = () => (
    <div className="space-y-6" data-testid="audit-trail">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Comprehensive Audit Trail</h2>
          <p className="text-gray-600 mt-1">
            Complete regulatory and operational activity tracking
          </p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" data-testid="button-export-audit">
            <Download className="w-4 h-4 mr-2" />
            Export Audit Log
          </Button>
          <Button variant="outline">
            <Filter className="w-4 h-4 mr-2" />
            Advanced Filter
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <History className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">2,847</p>
                <p className="text-sm text-gray-600">Audit Entries</p>
                <Badge variant="default">Last 30 days</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Shield className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">100%</p>
                <p className="text-sm text-gray-600">Data Integrity</p>
                <Badge variant="secondary">FDA 21 CFR Part 11</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Users className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">47</p>
                <p className="text-sm text-gray-600">Active Users</p>
                <Badge variant="outline">Tracked</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">3</p>
                <p className="text-sm text-gray-600">Critical Actions</p>
                <Badge variant="destructive">Requires Review</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Recent Audit Activities
          </CardTitle>
          <CardDescription>
            Complete chronological record of all CMC system activities with full traceability
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {auditData.map(entry => (
              <div
                key={entry.id}
                className="p-4 border rounded-lg hover:shadow-sm transition-shadow"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold">{entry.action}</h4>
                      <Badge
                        variant={
                          entry.impact === 'Critical'
                            ? 'destructive'
                            : entry.impact === 'High'
                              ? 'default'
                              : 'secondary'
                        }
                      >
                        {entry.impact} Impact
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{entry.details}</p>
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {entry.user}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {entry.timestamp}
                      </span>
                      <span className="flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        {entry.entity}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {entry.category}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button size="sm" variant="outline">
                      <Eye className="w-3 h-3 mr-1" />
                      Details
                    </Button>
                    <Button size="sm" variant="outline">
                      <Download className="w-3 h-3 mr-1" />
                      Export
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center mt-6">
            <Button variant="outline">Load More Entries</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Document Management System
  const renderDocumentManagement = () => (
    <div className="space-y-6" data-testid="document-management">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Document Management System</h2>
          <p className="text-gray-600 mt-1">
            Centralized regulatory document repository with version control
          </p>
        </div>
        <div className="flex space-x-2">
          <Button className="bg-blue-600 hover:bg-blue-700" data-testid="button-new-document">
            <Plus className="w-4 h-4 mr-2" />
            New Document
          </Button>
          <Button variant="outline">
            <Upload className="w-4 h-4 mr-2" />
            Bulk Upload
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <FileText className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">1,247</p>
                <p className="text-sm text-gray-600">Total Documents</p>
                <Badge variant="default">Active</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">892</p>
                <p className="text-sm text-gray-600">Approved Documents</p>
                <Badge variant="secondary">Current</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Clock className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">45</p>
                <p className="text-sm text-gray-600">Pending Review</p>
                <Badge variant="outline">Action Required</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Archive className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">310</p>
                <p className="text-sm text-gray-600">Archived Versions</p>
                <Badge variant="secondary">Historical</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />
              Document Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { category: 'Method Development', count: 156, color: 'bg-blue-100 text-blue-700' },
                { category: 'Process Validation', count: 89, color: 'bg-green-100 text-green-700' },
                {
                  category: 'Stability Studies',
                  count: 234,
                  color: 'bg-orange-100 text-orange-700',
                },
                { category: 'Quality Control', count: 187, color: 'bg-purple-100 text-purple-700' },
                { category: 'Regulatory Submissions', count: 67, color: 'bg-red-100 text-red-700' },
                { category: 'Manufacturing', count: 145, color: 'bg-yellow-100 text-yellow-700' },
                { category: 'Compliance', count: 92, color: 'bg-indigo-100 text-indigo-700' },
              ].map((cat, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center p-2 rounded hover:bg-gray-50 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${cat.color}`}></div>
                    <span className="text-sm font-medium">{cat.category}</span>
                  </div>
                  <Badge variant="outline">{cat.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Recent Documents
            </CardTitle>
            <CardDescription>
              Latest regulatory documents with approval status and version control
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {documents.map(doc => (
                <div
                  key={doc.id}
                  className="p-4 border rounded-lg hover:shadow-sm transition-shadow"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h4 className="font-semibold mb-1">{doc.title}</h4>
                      <div className="flex items-center space-x-3 text-sm text-gray-600 mb-2">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {doc.type}
                        </span>
                        <span className="flex items-center gap-1">
                          <GitBranch className="w-3 h-3" />v{doc.version}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {doc.approver}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {doc.category}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span>Created: {doc.created}</span>
                        <span>Modified: {doc.lastModified}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      <Badge
                        variant={
                          doc.status === 'Approved'
                            ? 'default'
                            : doc.status === 'Draft'
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {doc.status}
                      </Badge>
                      <div className="flex space-x-1">
                        <Button size="sm" variant="outline">
                          <Eye className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Download className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  // Comprehensive Reporting System
  const renderReporting = () => (
    <div className="space-y-6" data-testid="reporting-system">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Advanced Reporting System</h2>
          <p className="text-gray-600 mt-1">Comprehensive regulatory and operational analytics</p>
        </div>
        <div className="flex space-x-2">
          <Button className="bg-green-600 hover:bg-green-700" data-testid="button-generate-report">
            <BarChart3 className="w-4 h-4 mr-2" />
            Generate Report
          </Button>
          <Button variant="outline">
            <Settings className="w-4 h-4 mr-2" />
            Report Builder
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-blue-600">127</p>
                <p className="text-sm text-gray-600">Reports Generated</p>
              </div>
              <BarChart3 className="w-8 h-8 text-blue-600" />
            </div>
            <div className="text-xs text-gray-600 mt-2">This month</div>
          </CardContent>
        </Card>

        <Card className="border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-green-600">98.2%</p>
                <p className="text-sm text-gray-600">Data Accuracy</p>
              </div>
              <Shield className="w-8 h-8 text-green-600" />
            </div>
            <div className="text-xs text-gray-600 mt-2">Quality metrics</div>
          </CardContent>
        </Card>

        <Card className="border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-orange-600">15</p>
                <p className="text-sm text-gray-600">Scheduled Reports</p>
              </div>
              <Clock className="w-8 h-8 text-orange-600" />
            </div>
            <div className="text-xs text-gray-600 mt-2">Auto-generated</div>
          </CardContent>
        </Card>

        <Card className="border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-purple-600">4.2s</p>
                <p className="text-sm text-gray-600">Avg Response Time</p>
              </div>
              <Gauge className="w-8 h-8 text-purple-600" />
            </div>
            <div className="text-xs text-gray-600 mt-2">Real-time analytics</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ChartLine className="w-5 h-5" />
              Popular Report Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { type: 'GMP Compliance Dashboard', requests: 89, trend: '+12%' },
                { type: 'Batch Quality Summary', requests: 76, trend: '+8%' },
                { type: 'Regulatory Submission Status', requests: 64, trend: '+15%' },
                { type: 'Method Validation Report', requests: 58, trend: '+5%' },
                { type: 'Stability Trending Analysis', requests: 52, trend: '+18%' },
                { type: 'CAPA Effectiveness Report', requests: 41, trend: '+3%' },
              ].map((report, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center p-3 border rounded-lg"
                >
                  <div>
                    <h5 className="font-medium text-sm">{report.type}</h5>
                    <p className="text-xs text-gray-600">{report.requests} requests this month</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="default" className="text-xs">
                      {report.trend}
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
              <Calendar className="w-5 h-5" />
              Scheduled Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { name: 'Weekly QC Summary', schedule: 'Every Monday', next: '2025-08-19' },
                {
                  name: 'Monthly Compliance Report',
                  schedule: 'First of month',
                  next: '2025-09-01',
                },
                {
                  name: 'Quarterly Risk Assessment',
                  schedule: 'Every quarter',
                  next: '2025-10-01',
                },
                { name: 'Annual Product Review', schedule: 'Yearly', next: '2026-01-15' },
              ].map((scheduled, index) => (
                <div key={index} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h5 className="font-medium text-sm">{scheduled.name}</h5>
                      <p className="text-xs text-gray-600">{scheduled.schedule}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="text-gray-600">Next: {scheduled.next}</p>
                    </div>
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
          <h1 className="text-3xl font-bold text-gray-900">CMC Audit & Documentation</h1>
          <p className="text-gray-600 mt-2">
            Comprehensive regulatory audit trail and document management system
          </p>
        </div>

        {/* Audit Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3" data-testid="audit-tabs">
            <TabsTrigger value="audit-trail" data-testid="tab-audit-trail">
              Audit Trail
            </TabsTrigger>
            <TabsTrigger value="document-management" data-testid="tab-documents">
              Document Management
            </TabsTrigger>
            <TabsTrigger value="reporting" data-testid="tab-reporting">
              Advanced Reporting
            </TabsTrigger>
          </TabsList>

          <TabsContent value="audit-trail">{renderAuditTrail()}</TabsContent>
          <TabsContent value="document-management">{renderDocumentManagement()}</TabsContent>
          <TabsContent value="reporting">{renderReporting()}</TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CMCAuditAndDocumentation;
