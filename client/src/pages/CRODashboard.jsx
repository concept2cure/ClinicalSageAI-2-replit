/**
 * CRO Dashboard - Contract Research Organization Management
 *
 * Comprehensive dashboard for managing CRO operations including:
 * - Client portfolio management
 * - Study oversight and monitoring
 * - Regulatory submissions tracking
 * - Team assignments and resource allocation
 * - Project milestones and deliverables
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Building2,
  Users,
  FileText,
  Calendar,
  Target,
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  TrendingUp,
  Settings,
  Plus,
  Search,
  Filter,
  Download,
  Eye,
  Edit,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const CRODashboard = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Fetch CRO dashboard data
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['/api/cro/dashboard'],
    retry: false,
  });

  // Fetch clients
  const { data: clients } = useQuery({
    queryKey: ['/api/cro/clients'],
    retry: false,
  });

  // Fetch studies
  const { data: studies } = useQuery({
    queryKey: ['/api/cro/studies'],
    retry: false,
  });

  // Fetch submissions
  const { data: submissions } = useQuery({
    queryKey: ['/api/cro/submissions'],
    retry: false,
  });

  // Fetch milestones
  const { data: milestones } = useQuery({
    queryKey: ['/api/cro/milestones'],
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">Loading CRO Dashboard...</p>
        </div>
      </div>
    );
  }

  const getStatusColor = status => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      planning: 'bg-blue-100 text-blue-800',
      recruiting: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-gray-100 text-gray-800',
      delayed: 'bg-red-100 text-red-800',
      submitted: 'bg-purple-100 text-purple-800',
      approved: 'bg-green-100 text-green-800',
      under_review: 'bg-orange-100 text-orange-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityColor = priority => {
    const colors = {
      critical: 'bg-red-100 text-red-800',
      high: 'bg-orange-100 text-orange-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-green-100 text-green-800',
    };
    return colors[priority] || 'bg-gray-100 text-gray-800';
  };

  const mockDashboardData = {
    totalClients: 24,
    activeStudies: 47,
    pendingSubmissions: 12,
    completedMilestones: 156,
    totalRevenue: 14250000,
    averageStudyDuration: 18,
    complianceScore: 94,
    teamUtilization: 87,
  };

  const mockClients = [
    {
      id: 1,
      name: 'BioPharma Innovations Inc.',
      companyType: 'biotech',
      industrySegment: 'oncology',
      headquarters: 'San Francisco, CA',
      contactEmail: 'regulatory@biopharma.com',
      contractStatus: 'active',
      contractValue: 2500000,
      riskLevel: 'medium',
      activeStudies: 5,
      totalSubmissions: 12,
    },
    {
      id: 2,
      name: 'MedDevice Solutions LLC',
      companyType: 'medical_device',
      industrySegment: 'cardiology',
      headquarters: 'Boston, MA',
      contactEmail: 'ra@meddevice.com',
      contractStatus: 'active',
      contractValue: 1800000,
      riskLevel: 'low',
      activeStudies: 3,
      totalSubmissions: 8,
    },
    {
      id: 3,
      name: 'Neuro Therapeutics Corp',
      companyType: 'pharma',
      industrySegment: 'neurology',
      headquarters: 'New York, NY',
      contactEmail: 'submissions@neurotherapeutics.com',
      contractStatus: 'active',
      contractValue: 3200000,
      riskLevel: 'high',
      activeStudies: 7,
      totalSubmissions: 15,
    },
  ];

  const mockStudies = [
    {
      id: 1,
      clientId: 1,
      studyNumber: 'BPI-001',
      studyTitle: 'Phase II Study of Novel Oncology Compound',
      studyType: 'phase_2',
      therapeuticArea: 'oncology',
      indication: 'Non-small cell lung cancer',
      studyStatus: 'recruiting',
      regulatoryStatus: 'ind_approved',
      targetEnrollment: 120,
      currentEnrollment: 47,
      firstPatientIn: '2024-03-15',
      studyCompletionDate: '2025-09-30',
      complianceStatus: 'compliant',
      riskLevel: 'medium',
    },
    {
      id: 2,
      clientId: 2,
      studyNumber: 'MDS-501K',
      studyTitle: 'Clinical Evaluation of Cardiac Monitoring Device',
      studyType: 'device_study',
      therapeuticArea: 'cardiology',
      indication: 'Cardiac arrhythmia monitoring',
      studyStatus: 'active',
      regulatoryStatus: 'ide_approved',
      targetEnrollment: 80,
      currentEnrollment: 65,
      firstPatientIn: '2024-01-20',
      studyCompletionDate: '2024-12-15',
      complianceStatus: 'compliant',
      riskLevel: 'low',
    },
  ];

  const mockSubmissions = [
    {
      id: 1,
      clientId: 1,
      studyId: 1,
      submissionType: 'ind',
      submissionNumber: 'IND-123456',
      regulatoryRegion: 'fda',
      submissionStatus: 'approved',
      submissionDate: '2024-01-15',
      actualApprovalDate: '2024-02-28',
      complianceScore: 96,
      riskLevel: 'low',
    },
    {
      id: 2,
      clientId: 2,
      studyId: 2,
      submissionType: '510k',
      submissionNumber: 'K243567',
      regulatoryRegion: 'fda',
      submissionStatus: 'under_review',
      submissionDate: '2024-05-20',
      expectedApprovalDate: '2024-08-15',
      complianceScore: 92,
      riskLevel: 'medium',
    },
  ];

  const mockMilestones = [
    {
      id: 1,
      clientId: 1,
      studyId: 1,
      title: 'First Patient First Visit',
      category: 'clinical',
      priority: 'high',
      status: 'completed',
      plannedEndDate: '2024-03-15',
      actualEndDate: '2024-03-15',
      completionPercentage: 100,
    },
    {
      id: 2,
      clientId: 1,
      studyId: 1,
      title: 'Interim Safety Analysis',
      category: 'regulatory',
      priority: 'critical',
      status: 'in_progress',
      plannedEndDate: '2024-08-30',
      actualEndDate: null,
      completionPercentage: 65,
    },
    {
      id: 3,
      clientId: 2,
      studyId: 2,
      title: '510(k) Submission Preparation',
      category: 'regulatory',
      priority: 'high',
      status: 'completed',
      plannedEndDate: '2024-05-15',
      actualEndDate: '2024-05-20',
      completionPercentage: 100,
    },
  ];

  const currentData = dashboardData || mockDashboardData;
  const currentClients = clients || mockClients;
  const currentStudies = studies || mockStudies;
  const currentSubmissions = submissions || mockSubmissions;
  const currentMilestones = milestones || mockMilestones;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">CRO Operations Dashboard</h1>
        <p className="text-lg text-gray-600">Contract Research Organization Management Platform</p>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentData.totalClients}</div>
            <p className="text-xs text-muted-foreground">Active partnerships</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Studies</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentData.activeStudies}</div>
            <p className="text-xs text-muted-foreground">Ongoing clinical trials</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Submissions</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentData.pendingSubmissions}</div>
            <p className="text-xs text-muted-foreground">Awaiting regulatory review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliance Score</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentData.complianceScore}%</div>
            <p className="text-xs text-muted-foreground">Overall compliance rating</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="studies">Studies</TabsTrigger>
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">BPI-001 First Patient Enrolled</p>
                      <p className="text-xs text-gray-500">2 hours ago</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">510(k) Submission K243567 Submitted</p>
                      <p className="text-xs text-gray-500">1 day ago</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">IND-123456 Approved by FDA</p>
                      <p className="text-xs text-gray-500">3 days ago</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Upcoming Deadlines
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Interim Safety Analysis</p>
                      <p className="text-xs text-gray-500">BPI-001 Study</p>
                    </div>
                    <Badge variant="outline" className="text-orange-600">
                      Due Aug 30
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Study Report Submission</p>
                      <p className="text-xs text-gray-500">MDS-501K</p>
                    </div>
                    <Badge variant="outline" className="text-red-600">
                      Due Sep 15
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Annual Report Filing</p>
                      <p className="text-xs text-gray-500">Multiple studies</p>
                    </div>
                    <Badge variant="outline" className="text-blue-600">
                      Due Oct 1
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Clients Tab */}
        <TabsContent value="clients">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Client Portfolio
              </CardTitle>
              <div className="flex items-center gap-4 mt-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search clients..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Client
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {currentClients.map(client => (
                  <div key={client.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold">{client.name}</h3>
                          <Badge className={getStatusColor(client.contractStatus)}>
                            {client.contractStatus}
                          </Badge>
                          <Badge variant="outline" className={getPriorityColor(client.riskLevel)}>
                            {client.riskLevel} risk
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {client.industrySegment} • {client.headquarters}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                          <span>{client.activeStudies} active studies</span>
                          <span>{client.totalSubmissions} submissions</span>
                          <span>${client.contractValue.toLocaleString()} contract value</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Studies Tab */}
        <TabsContent value="studies">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Clinical Studies
              </CardTitle>
              <div className="flex items-center gap-4 mt-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search studies..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="recruiting">Recruiting</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Study
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {currentStudies.map(study => (
                  <div key={study.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold">{study.studyNumber}</h3>
                          <Badge className={getStatusColor(study.studyStatus)}>
                            {study.studyStatus}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={getStatusColor(study.regulatoryStatus)}
                          >
                            {study.regulatoryStatus}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{study.studyTitle}</p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                          <span>{study.therapeuticArea}</span>
                          <span>{study.indication}</span>
                          <span>
                            {study.currentEnrollment}/{study.targetEnrollment} enrolled
                          </span>
                        </div>
                        <div className="mt-2">
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <span>Enrollment Progress:</span>
                            <div className="w-32 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full"
                                style={{
                                  width: `${(study.currentEnrollment / study.targetEnrollment) * 100}%`,
                                }}
                              ></div>
                            </div>
                            <span>
                              {Math.round((study.currentEnrollment / study.targetEnrollment) * 100)}
                              %
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Submissions Tab */}
        <TabsContent value="submissions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Regulatory Submissions
              </CardTitle>
              <div className="flex items-center gap-4 mt-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search submissions..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="under_review">Under Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                  </SelectContent>
                </Select>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Submission
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {currentSubmissions.map(submission => (
                  <div key={submission.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold">{submission.submissionNumber}</h3>
                          <Badge className={getStatusColor(submission.submissionStatus)}>
                            {submission.submissionStatus}
                          </Badge>
                          <Badge variant="outline">{submission.submissionType.toUpperCase()}</Badge>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {submission.regulatoryRegion.toUpperCase()} • {submission.submissionType}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                          <span>
                            Submitted: {new Date(submission.submissionDate).toLocaleDateString()}
                          </span>
                          <span>Compliance: {submission.complianceScore}%</span>
                          <span
                            className={`px-2 py-1 rounded-full text-xs ${getPriorityColor(submission.riskLevel)}`}
                          >
                            {submission.riskLevel} risk
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Milestones Tab */}
        <TabsContent value="milestones">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Project Milestones
              </CardTitle>
              <div className="flex items-center gap-4 mt-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search milestones..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="delayed">Delayed</SelectItem>
                  </SelectContent>
                </Select>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Milestone
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {currentMilestones.map(milestone => (
                  <div key={milestone.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold">{milestone.title}</h3>
                          <Badge className={getStatusColor(milestone.status)}>
                            {milestone.status.replace('_', ' ')}
                          </Badge>
                          <Badge variant="outline" className={getPriorityColor(milestone.priority)}>
                            {milestone.priority}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{milestone.category}</p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                          <span>
                            Due: {new Date(milestone.plannedEndDate).toLocaleDateString()}
                          </span>
                          <span>Progress: {milestone.completionPercentage}%</span>
                        </div>
                        <div className="mt-2">
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <span>Completion:</span>
                            <div className="w-32 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-green-600 h-2 rounded-full"
                                style={{ width: `${milestone.completionPercentage}%` }}
                              ></div>
                            </div>
                            <span>{milestone.completionPercentage}%</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Financial Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Total Contract Value</span>
                    <span className="font-semibold">
                      ${currentData.totalRevenue?.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Average Study Duration</span>
                    <span className="font-semibold">{currentData.averageStudyDuration} months</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Team Utilization</span>
                    <span className="font-semibold">{currentData.teamUtilization}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">On-Time Delivery Rate</span>
                    <span className="font-semibold text-green-600">94%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Client Satisfaction</span>
                    <span className="font-semibold text-green-600">4.8/5.0</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Regulatory Approval Rate</span>
                    <span className="font-semibold text-green-600">87%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CRODashboard;
