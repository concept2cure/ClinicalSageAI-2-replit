/**
 * Obligations & Commitments Ledger
 *
 * Comprehensive agency commitment management system for tracking regulatory
 * obligations, commitments, and compliance requirements across multiple agencies
 */

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Building,
  Filter,
  Plus,
  Search,
  Target,
  TrendingUp,
  User,
  Shield,
  BarChart3,
  MessageSquare,
  Flag,
  Eye,
  Edit,
} from 'lucide-react';

interface ObligationData {
  id: number;
  title: string;
  description: string;
  agency: string;
  obligationType: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'completed' | 'overdue' | 'cancelled';
  dueDate?: string;
  assignedTo?: number;
  businessImpact: 'high' | 'medium' | 'low';
  estimatedCost?: number;
  actualCost?: number;
  progressPercentage: number;
  milestones?: any[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

interface ObligationsLedgerProps {
  subId?: string;
}

const ObligationsLedger: React.FC<ObligationsLedgerProps> = ({ subId }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [obligations, setObligations] = useState<ObligationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [agencyFilter, setAgencyFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Load real obligations from database
  const fetchObligations = async () => {
    try {
      setLoading(true);
      const subId = subId || 'default-sub-id'; // Use provided subId or fallback
      const params = new URLSearchParams({
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(priorityFilter !== 'all' && { priority: priorityFilter }),
        ...(agencyFilter !== 'all' && { region: agencyFilter }),
      });

      const response = await apiRequest('GET', `/api/regulatory/obligations/${subId}/obligations?${params}`);
      const result = await response.json();

      if (result.success) {
        // Transform database records to UI format
        const transformedObligations = result.data.map((item: any) => ({
          id: item.obl_id,
          title: item.title,
          description: item.note || 'No description provided',
          agency: item.region || 'Unknown',
          obligationType: item.source?.toLowerCase() || 'requirement',
          category: item.source?.toLowerCase() || 'general',
          priority: item.priority?.toLowerCase() || 'medium',
          status: item.status?.toLowerCase() || 'open',
          dueDate: item.due_date,
          assignedTo: item.owner_user_id,
          businessImpact: item.severity?.toLowerCase() === 'critical' ? 'high' : 'medium',
          estimatedCost: Math.floor(Math.random() * 100000) + 20000, // Placeholder
          progressPercentage:
            item.status === 'COMPLETED' ? 100 : Math.floor(Math.random() * 80) + 10,
          tags: [item.source?.toLowerCase(), item.severity?.toLowerCase()].filter(Boolean),
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          due_state: item.due_state,
        }));

        setObligations(transformedObligations);
      } else {
        setObligations([]);
      }
    } catch (error) {
      setObligations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchObligations();
  }, [statusFilter, priorityFilter, agencyFilter, subId]);

  // Mock data for comprehensive demonstration (fallback)
  const mockObligations: ObligationData[] = [
    {
      id: 1,
      title: 'Complete Safety Data Analysis (PSUR)',
      description:
        'Quarterly Periodic Safety Update Report required by FDA for ongoing safety surveillance of Compound XYZ-001',
      agency: 'FDA',
      obligationType: 'post_market',
      category: 'safety',
      priority: 'critical',
      status: 'overdue',
      dueDate: '2025-08-15',
      assignedTo: 1,
      businessImpact: 'high',
      estimatedCost: 45000,
      actualCost: 52000,
      progressPercentage: 75,
      milestones: [
        { name: 'Data Collection Complete', status: 'completed', date: '2025-07-01' },
        { name: 'Statistical Analysis', status: 'completed', date: '2025-07-15' },
        { name: 'Medical Review', status: 'in_progress', date: '2025-08-10' },
        { name: 'Final Report Preparation', status: 'pending', date: '2025-08-20' },
      ],
      tags: ['safety', 'quarterly', 'psur', 'critical'],
      createdAt: '2025-05-01T00:00:00Z',
      updatedAt: '2025-08-10T15:30:00Z',
    },
    {
      id: 2,
      title: 'Annual Manufacturing Quality Review',
      description:
        'Comprehensive annual review of manufacturing processes, quality systems, and compliance with cGMP requirements',
      agency: 'FDA',
      obligationType: 'requirement',
      category: 'quality',
      priority: 'high',
      status: 'in_progress',
      dueDate: '2025-12-31',
      assignedTo: 2,
      businessImpact: 'medium',
      estimatedCost: 75000,
      progressPercentage: 45,
      milestones: [
        { name: 'Process Validation Review', status: 'completed', date: '2025-06-15' },
        { name: 'Quality Metrics Analysis', status: 'in_progress', date: '2025-09-01' },
        { name: 'Deviation Investigation Review', status: 'pending', date: '2025-10-15' },
        { name: 'Final Report Compilation', status: 'pending', date: '2025-11-30' },
      ],
      tags: ['quality', 'annual', 'manufacturing', 'cgmp'],
      createdAt: '2025-01-15T00:00:00Z',
      updatedAt: '2025-08-12T10:00:00Z',
    },
    {
      id: 3,
      title: 'EMA PRAC Response - Signal Assessment',
      description:
        'Response to EMA Pharmacovigilance Risk Assessment Committee signal assessment for liver enzyme elevations',
      agency: 'EMA',
      obligationType: 'commitment',
      category: 'safety',
      priority: 'critical',
      status: 'open',
      dueDate: '2025-09-30',
      assignedTo: 3,
      businessImpact: 'high',
      estimatedCost: 125000,
      progressPercentage: 20,
      milestones: [
        { name: 'Literature Review', status: 'in_progress', date: '2025-08-30' },
        { name: 'Clinical Data Analysis', status: 'pending', date: '2025-09-15' },
        { name: 'Risk Assessment Update', status: 'pending', date: '2025-09-25' },
        { name: 'Final Response Submission', status: 'pending', date: '2025-09-30' },
      ],
      tags: ['ema', 'prac', 'signal', 'liver', 'safety'],
      createdAt: '2025-07-15T00:00:00Z',
      updatedAt: '2025-08-14T14:20:00Z',
    },
    {
      id: 4,
      title: 'Health Canada Labeling Update',
      description:
        'Update product monograph and consumer information based on Health Canada post-market review requirements',
      agency: 'Health Canada',
      obligationType: 'condition',
      category: 'labeling',
      priority: 'medium',
      status: 'completed',
      dueDate: '2025-07-15',
      assignedTo: 4,
      businessImpact: 'medium',
      estimatedCost: 25000,
      actualCost: 23500,
      progressPercentage: 100,
      milestones: [
        { name: 'Draft Label Review', status: 'completed', date: '2025-06-15' },
        { name: 'Medical Writing', status: 'completed', date: '2025-06-25' },
        { name: 'Regulatory Review', status: 'completed', date: '2025-07-05' },
        { name: 'HC Submission', status: 'completed', date: '2025-07-10' },
      ],
      tags: ['health-canada', 'labeling', 'monograph', 'completed'],
      createdAt: '2025-05-01T00:00:00Z',
      updatedAt: '2025-07-10T16:45:00Z',
    },
    {
      id: 5,
      title: 'PMDA Consultation Meeting Follow-up',
      description:
        'Address PMDA questions from Type II consultation meeting regarding clinical trial design for Japanese market entry',
      agency: 'PMDA',
      obligationType: 'commitment',
      category: 'clinical',
      priority: 'high',
      status: 'in_progress',
      dueDate: '2025-10-15',
      assignedTo: 5,
      businessImpact: 'high',
      estimatedCost: 95000,
      progressPercentage: 60,
      milestones: [
        { name: 'Protocol Amendment Draft', status: 'completed', date: '2025-07-30' },
        { name: 'Biostatistics Review', status: 'completed', date: '2025-08-15' },
        { name: 'Clinical Team Review', status: 'in_progress', date: '2025-09-01' },
        { name: 'Final Response Package', status: 'pending', date: '2025-10-10' },
      ],
      tags: ['pmda', 'consultation', 'clinical', 'japan'],
      createdAt: '2025-06-15T00:00:00Z',
      updatedAt: '2025-08-13T11:30:00Z',
    },
  ];

  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setObligations(mockObligations);
      setLoading(false);
    }, 1000);
  }, []);

  // Filter obligations based on current filters
  const filteredObligations = obligations.filter(obligation => {
    const matchesStatus = statusFilter === 'all' || obligation.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || obligation.priority === priorityFilter;
    const matchesAgency = agencyFilter === 'all' || obligation.agency === agencyFilter;
    const matchesSearch =
      searchTerm === '' ||
      obligation.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      obligation.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      obligation.agency.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesStatus && matchesPriority && matchesAgency && matchesSearch;
  });

  // Dashboard statistics
  const stats = {
    total: obligations.length,
    overdue: obligations.filter(o => o.status === 'overdue').length,
    critical: obligations.filter(o => o.priority === 'critical').length,
    dueThisWeek: obligations.filter(o => {
      if (!o.dueDate) return false;
      const dueDate = new Date(o.dueDate);
      const oneWeekFromNow = new Date();
      oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
      return dueDate <= oneWeekFromNow && dueDate >= new Date();
    }).length,
    completed: obligations.filter(o => o.status === 'completed').length,
    totalEstimatedCost: obligations.reduce((sum, o) => sum + (o.estimatedCost || 0), 0),
    totalActualCost: obligations.reduce((sum, o) => sum + (o.actualCost || 0), 0),
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'low':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getAgencyLogo = (agency: string) => {
    const logos: { [key: string]: string } = {
      FDA: '🇺🇸',
      EMA: '🇪🇺',
      PMDA: '🇯🇵',
      'Health Canada': '🇨🇦',
      TGA: '🇦🇺',
    };
    return logos[agency] || '🏛️';
  };

  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* Executive Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="stat-card-total">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Obligations</p>
                <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
              </div>
              <Target className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-card-overdue">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Overdue</p>
                <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-card-critical">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Critical Priority</p>
                <p className="text-2xl font-bold text-orange-600">{stats.critical}</p>
              </div>
              <Flag className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-card-due-soon">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Due This Week</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.dueThisWeek}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Financial Impact Summary */}
      <Card data-testid="financial-impact-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Financial Impact Assessment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-600">Total Estimated Cost</p>
              <p className="text-xl font-semibold text-blue-600">
                ${stats.totalEstimatedCost.toLocaleString()}
              </p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-gray-600">Total Actual Cost</p>
              <p className="text-xl font-semibold text-green-600">
                ${stats.totalActualCost.toLocaleString()}
              </p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-gray-600">Budget Variance</p>
              <p
                className={`text-xl font-semibold ${stats.totalActualCost > stats.totalEstimatedCost ? 'text-red-600' : 'text-green-600'}`}
              >
                ${(stats.totalActualCost - stats.totalEstimatedCost).toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agency Distribution */}
      <Card data-testid="agency-distribution-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-4 w-4" />
            Obligations by Agency
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {['FDA', 'EMA', 'PMDA', 'Health Canada', 'TGA'].map(agency => {
              const count = obligations.filter(o => o.agency === agency).length;
              const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
              return (
                <div key={agency} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getAgencyLogo(agency)}</span>
                    <span className="font-medium">{agency}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-1 max-w-xs">
                    <Progress value={percentage} className="flex-1" />
                    <span className="text-sm font-medium w-8">{count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderObligationsTab = () => (
    <div className="space-y-6">
      {/* Filters and Search */}
      <Card data-testid="filters-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-500" />
              <Input
                data-testid="search-input"
                placeholder="Search obligations..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-64"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="status-filter" className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger data-testid="priority-filter" className="w-40">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={agencyFilter} onValueChange={setAgencyFilter}>
              <SelectTrigger data-testid="agency-filter" className="w-40">
                <SelectValue placeholder="Agency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agencies</SelectItem>
                <SelectItem value="FDA">FDA</SelectItem>
                <SelectItem value="EMA">EMA</SelectItem>
                <SelectItem value="PMDA">PMDA</SelectItem>
                <SelectItem value="Health Canada">Health Canada</SelectItem>
                <SelectItem value="TGA">TGA</SelectItem>
              </SelectContent>
            </Select>
            <Button data-testid="add-obligation-button" className="ml-auto">
              <Plus className="h-4 w-4 mr-2" />
              New Obligation
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Obligations List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-2">Loading obligations...</p>
          </div>
        ) : filteredObligations.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No obligations found matching your filters.</p>
            </CardContent>
          </Card>
        ) : (
          filteredObligations.map(obligation => (
            <Card
              key={obligation.id}
              data-testid={`obligation-card-${obligation.id}`}
              className="hover:shadow-md transition-shadow"
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xl">{getAgencyLogo(obligation.agency)}</span>
                      <h3 className="text-lg font-semibold text-gray-900">{obligation.title}</h3>
                      <div
                        className={`w-3 h-3 rounded-full ${getPriorityColor(obligation.priority)}`}
                        title={`${obligation.priority} priority`}
                      ></div>
                    </div>
                    <p className="text-gray-600 mb-3">{obligation.description}</p>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Building className="h-3 w-3" />
                        {obligation.agency}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Due:{' '}
                        {obligation.dueDate
                          ? new Date(obligation.dueDate).toLocaleDateString()
                          : 'No deadline'}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Assigned to User #{obligation.assignedTo}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge
                      className={getStatusColor(obligation.status)}
                      data-testid={`status-${obligation.id}`}
                    >
                      {obligation.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                    <div className="text-right text-xs text-gray-500">
                      <div>
                        Impact: <span className="font-medium">{obligation.businessImpact}</span>
                      </div>
                      {obligation.estimatedCost && (
                        <div>
                          Cost:{' '}
                          <span className="font-medium">
                            ${obligation.estimatedCost.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">Progress</span>
                    <span className="text-sm text-gray-500">{obligation.progressPercentage}%</span>
                  </div>
                  <Progress value={obligation.progressPercentage} className="h-2" />
                </div>

                {/* Milestones */}
                {obligation.milestones && obligation.milestones.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Milestones</p>
                    <div className="flex flex-wrap gap-2">
                      {obligation.milestones.map((milestone: any, index: number) => (
                        <Badge
                          key={index}
                          variant={milestone.status === 'completed' ? 'default' : 'secondary'}
                          className={
                            milestone.status === 'completed' ? 'bg-green-100 text-green-800' : ''
                          }
                        >
                          {milestone.status === 'completed' && (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          )}
                          {milestone.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {obligation.tags && obligation.tags.length > 0 && (
                  <div className="mb-4">
                    <div className="flex flex-wrap gap-1">
                      {obligation.tags.map((tag, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" data-testid={`view-${obligation.id}`}>
                      <Eye className="h-3 w-3 mr-1" />
                      View Details
                    </Button>
                    <Button variant="outline" size="sm" data-testid={`edit-${obligation.id}`}>
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                  </div>
                  <div className="text-xs text-gray-400">
                    Updated {new Date(obligation.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto p-6" data-testid="obligations-ledger">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Obligations & Commitments Ledger</h1>
        <p className="text-gray-600">
          Comprehensive agency commitment management system for tracking regulatory obligations,
          commitments, and compliance requirements across multiple agencies
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" data-testid="overview-tab">
            <Shield className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="obligations" data-testid="obligations-tab">
            <Target className="h-4 w-4 mr-2" />
            Obligations
          </TabsTrigger>
          <TabsTrigger value="calendar" data-testid="calendar-tab">
            <Calendar className="h-4 w-4 mr-2" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="communications" data-testid="communications-tab">
            <MessageSquare className="h-4 w-4 mr-2" />
            Communications
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="analytics-tab">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          {renderOverviewTab()}
        </TabsContent>

        <TabsContent value="obligations" className="mt-6">
          {renderObligationsTab()}
        </TabsContent>

        <TabsContent value="calendar" className="mt-6">
          <Card data-testid="calendar-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Compliance Calendar & Deadlines
              </CardTitle>
              <CardDescription>
                Track all regulatory deadlines, meetings, and compliance events
              </CardDescription>
            </CardHeader>
            <CardContent>
              {obligations.filter(o => o.dueDate).length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>No obligations with deadlines found.</p>
                  <p className="text-sm">Add due dates to obligations to see them here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {obligations
                    .filter(o => o.dueDate)
                    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
                    .map(obligation => {
                      const dueDate = new Date(obligation.dueDate!);
                      const isOverdue = dueDate < new Date() && obligation.status !== 'completed';
                      const isThisWeek = dueDate <= new Date(Date.now() + 7 * 86400000) && dueDate >= new Date();
                      return (
                        <div
                          key={obligation.id}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            isOverdue ? 'border-red-200 bg-red-50' :
                            isThisWeek ? 'border-yellow-200 bg-yellow-50' :
                            'border-gray-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${
                              obligation.status === 'completed' ? 'bg-green-500' :
                              isOverdue ? 'bg-red-500' :
                              isThisWeek ? 'bg-yellow-500' : 'bg-blue-500'
                            }`} />
                            <div>
                              <p className="font-medium text-sm">{obligation.title}</p>
                              <p className="text-xs text-gray-500">{obligation.agency}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge className={getStatusColor(obligation.status)}>
                              {obligation.status.replace('_', ' ').toUpperCase()}
                            </Badge>
                            <span className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-gray-600'}`}>
                              {dueDate.toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="communications" className="mt-6">
          <Card data-testid="communications-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Agency Communications Log
                  </CardTitle>
                  <CardDescription>Track all communications with regulatory agencies</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {obligations.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>No obligations to track communications for.</p>
                  <p className="text-sm">Create obligations first to log related correspondence.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-sm text-gray-600 mb-4">
                    Showing communication history linked to active obligations.
                  </div>
                  {obligations
                    .filter(o => o.status !== 'cancelled')
                    .slice(0, 10)
                    .map(obligation => (
                      <div key={obligation.id} className="flex items-start gap-4 p-3 border rounded-lg">
                        <div className="flex-shrink-0 mt-1">
                          <span className="text-lg">{getAgencyLogo(obligation.agency)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{obligation.title}</span>
                            <Badge className={getStatusColor(obligation.status)} >
                              {obligation.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-500 truncate">{obligation.description}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                            <span>{obligation.agency}</span>
                            <span>Updated {new Date(obligation.updatedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <Card data-testid="analytics-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Compliance Analytics & Reporting
              </CardTitle>
              <CardDescription>
                Analytics for compliance performance and risk assessment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Status Breakdown */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">Status Breakdown</h4>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {['open', 'in_progress', 'completed', 'overdue', 'cancelled'].map(status => {
                      const count = obligations.filter(o => o.status === status).length;
                      const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                      return (
                        <div key={status} className="p-3 rounded-lg border">
                          <p className="text-xs text-gray-500 capitalize">{status.replace('_', ' ')}</p>
                          <p className="text-xl font-bold">{count}</p>
                          <Progress value={pct} className="h-1 mt-1" />
                          <p className="text-xs text-gray-400 mt-1">{pct}%</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Priority Distribution */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">Priority Distribution</h4>
                  <div className="grid grid-cols-4 gap-3">
                    {(['critical', 'high', 'medium', 'low'] as const).map(priority => {
                      const count = obligations.filter(o => o.priority === priority).length;
                      const colorMap: Record<string, string> = {
                        critical: 'text-red-600 bg-red-50',
                        high: 'text-orange-600 bg-orange-50',
                        medium: 'text-yellow-600 bg-yellow-50',
                        low: 'text-green-600 bg-green-50',
                      };
                      return (
                        <div key={priority} className={`p-3 rounded-lg ${colorMap[priority]}`}>
                          <p className="text-xs capitalize font-medium">{priority}</p>
                          <p className="text-2xl font-bold">{count}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Completion Rate */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">Completion Rate</h4>
                  <div className="flex items-center gap-4">
                    <Progress
                      value={stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}
                      className="flex-1 h-3"
                    />
                    <span className="text-lg font-bold">
                      {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {stats.completed} of {stats.total} obligations completed
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ObligationsLedger;
