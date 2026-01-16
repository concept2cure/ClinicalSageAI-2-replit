import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle, Shield, TrendingUp, BarChart3, Target, Eye, Plus, Edit, CheckCircle2, Clock, ArrowUp, ArrowDown, Activity, FileText, Users, Calendar, AlertCircle, Award, Settings, Filter, Download, Upload } from 'lucide-react'

const CMCRiskManagement = () => {
  const [activeTab, setActiveTab] = useState('matrix');
  const [selectedRisk, setSelectedRisk] = useState(null);
  const [showNewRiskDialog, setShowNewRiskDialog] = useState(false);
  const [riskFilter, setRiskFilter] = useState('all');

  // Sample risk assessment data
  const riskAssessments = [
    {
      id: 'RA-001',
      title: 'API Impurity Profile Changes',
      category: 'Quality',
      severity: 'High',
      probability: 'Medium',
      riskScore: 15,
      impact: 'Regulatory filing delay, potential safety concerns',
      status: 'Active',
      owner: 'Dr. Sarah Johnson',
      dueDate: '2025-09-15',
      mitigations: [
        'Enhanced analytical method validation',
        'Genotoxicity assessment for new impurities',
        'Regulatory consultation planned',
      ],
      lastReview: '2025-08-10',
      createdDate: '2025-07-20',
      financialImpact: '$2.5M',
    },
    {
      id: 'RA-002',
      title: 'Scale-Up Manufacturing Challenges',
      category: 'Manufacturing',
      severity: 'Medium',
      probability: 'High',
      riskScore: 12,
      impact: 'Production delays, yield variations',
      status: 'In Progress',
      owner: 'Mike Chen',
      dueDate: '2025-08-30',
      mitigations: [
        'Pilot batch studies initiated',
        'Equipment qualification in progress',
        'Process parameter optimization',
      ],
      lastReview: '2025-08-12',
      createdDate: '2025-07-15',
      financialImpact: '$1.8M',
    },
    {
      id: 'RA-003',
      title: 'Stability Data Gap - Photostability',
      category: 'Stability',
      severity: 'Medium',
      probability: 'Medium',
      riskScore: 9,
      impact: 'Potential labeling changes, storage recommendations',
      status: 'Mitigated',
      owner: 'Dr. Emily Davis',
      dueDate: '2025-08-25',
      mitigations: [
        'Photostability study completed',
        'Light-protective packaging implemented',
        'Stability protocol updated',
      ],
      lastReview: '2025-08-14',
      createdDate: '2025-06-30',
      financialImpact: '$450K',
    },
    {
      id: 'RA-004',
      title: 'Supplier Qualification Delays',
      category: 'Supply Chain',
      severity: 'Low',
      probability: 'Medium',
      riskScore: 6,
      impact: 'Alternative supplier needed, timeline impact',
      status: 'Active',
      owner: 'Robert Kim',
      dueDate: '2025-09-10',
      mitigations: [
        'Backup supplier identified',
        'Expedited audit schedule',
        'Supply agreement negotiations',
      ],
      lastReview: '2025-08-08',
      createdDate: '2025-07-25',
      financialImpact: '$320K',
    },
  ];

  const riskTrends = [
    { month: 'Jan', total: 12, high: 3, medium: 6, low: 3 },
    { month: 'Feb', total: 15, high: 4, medium: 7, low: 4 },
    { month: 'Mar', total: 18, high: 5, medium: 8, low: 5 },
    { month: 'Apr', total: 14, high: 3, medium: 7, low: 4 },
    { month: 'May', total: 16, high: 4, medium: 8, low: 4 },
    { month: 'Jun', total: 13, high: 2, medium: 7, low: 4 },
    { month: 'Jul', total: 17, high: 5, medium: 8, low: 4 },
    { month: 'Aug', total: 19, high: 6, medium: 9, low: 4 },
  ];

  const getSeverityColor = severity => {
    const colors = {
      High: 'bg-red-100 text-red-800 border-red-200',
      Medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      Low: 'bg-green-100 text-green-800 border-green-200',
    };
    return colors[severity] || 'bg-gray-100 text-gray-800';
  };

  const getStatusColor = status => {
    const colors = {
      Active: 'bg-red-100 text-red-800',
      'In Progress': 'bg-blue-100 text-blue-800',
      Mitigated: 'bg-green-100 text-green-800',
      Closed: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredRisks = riskAssessments.filter(risk => {
    if (riskFilter === 'all') return true;
    if (riskFilter === 'high') return risk.severity === 'High';
    if (riskFilter === 'active') return risk.status === 'Active';
    return true;
  });

  const totalFinancialExposure = riskAssessments.reduce(
    (total, risk) =>
      total +
      parseFloat(risk.financialImpact.replace(/[$MK,]/g, '')) *
        (risk.financialImpact.includes('M') ? 1000000 : 1000),
    0
  );

  return (
    <div className="space-y-6">
      {/* Risk Management Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">CMC Risk Management</h2>
          <p className="text-gray-600 mt-1">
            Comprehensive risk assessment and mitigation planning
          </p>
        </div>
        <div className="flex space-x-3">
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter risks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risks</SelectItem>
              <SelectItem value="high">High Severity</SelectItem>
              <SelectItem value="active">Active Only</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={showNewRiskDialog} onOpenChange={setShowNewRiskDialog}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4 mr-2" />
                New Risk Assessment
              </Button>
            </DialogTrigger>
          </Dialog>
        </div>
      </div>

      {/* Risk Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Risks</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{riskAssessments.length}</div>
            <p className="text-xs text-gray-600">+2 from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Severity</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {riskAssessments.filter(r => r.severity === 'High').length}
            </div>
            <p className="text-xs text-gray-600">Requires immediate attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Mitigations</CardTitle>
            <Shield className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {riskAssessments.filter(r => r.status === 'In Progress').length}
            </div>
            <p className="text-xs text-gray-600">Mitigation plans executing</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Financial Exposure</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${(totalFinancialExposure / 1000000).toFixed(1)}M
            </div>
            <p className="text-xs text-gray-600">Estimated total impact</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="matrix">Risk Matrix</TabsTrigger>
          <TabsTrigger value="assessments">Risk Assessments</TabsTrigger>
          <TabsTrigger value="analytics">Risk Analytics</TabsTrigger>
          <TabsTrigger value="planning">Mitigation Planning</TabsTrigger>
        </TabsList>

        <TabsContent value="matrix">
          <Card>
            <CardHeader>
              <CardTitle>Risk Assessment Matrix</CardTitle>
              <CardDescription>
                Visual representation of risks by severity and probability
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Risk Matrix Grid */}
                <div className="grid grid-cols-4 gap-4">
                  <div></div>
                  <div className="text-center font-medium text-sm">Low</div>
                  <div className="text-center font-medium text-sm">Medium</div>
                  <div className="text-center font-medium text-sm">High</div>

                  <div className="font-medium text-sm">High</div>
                  <div className="h-20 border-2 border-yellow-300 bg-yellow-50 p-2 rounded">
                    <div className="text-xs text-yellow-800">Medium Risk</div>
                  </div>
                  <div className="h-20 border-2 border-red-300 bg-red-50 p-2 rounded">
                    <div className="text-xs text-red-800">High Risk</div>
                    <div className="text-xs mt-1">RA-001</div>
                  </div>
                  <div className="h-20 border-2 border-red-400 bg-red-100 p-2 rounded">
                    <div className="text-xs text-red-800">Critical Risk</div>
                  </div>

                  <div className="font-medium text-sm">Medium</div>
                  <div className="h-20 border-2 border-green-300 bg-green-50 p-2 rounded">
                    <div className="text-xs text-green-800">Low Risk</div>
                    <div className="text-xs mt-1">RA-004</div>
                  </div>
                  <div className="h-20 border-2 border-yellow-300 bg-yellow-50 p-2 rounded">
                    <div className="text-xs text-yellow-800">Medium Risk</div>
                    <div className="text-xs mt-1">RA-003</div>
                  </div>
                  <div className="h-20 border-2 border-red-300 bg-red-50 p-2 rounded">
                    <div className="text-xs text-red-800">High Risk</div>
                    <div className="text-xs mt-1">RA-002</div>
                  </div>

                  <div className="font-medium text-sm">Low</div>
                  <div className="h-20 border-2 border-green-200 bg-green-25 p-2 rounded">
                    <div className="text-xs text-green-800">Very Low</div>
                  </div>
                  <div className="h-20 border-2 border-green-300 bg-green-50 p-2 rounded">
                    <div className="text-xs text-green-800">Low Risk</div>
                  </div>
                  <div className="h-20 border-2 border-yellow-300 bg-yellow-50 p-2 rounded">
                    <div className="text-xs text-yellow-800">Medium Risk</div>
                  </div>
                </div>

                <div className="flex justify-between items-center text-sm text-gray-600 mt-4">
                  <span>Probability →</span>
                  <span>← Severity</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assessments">
          <div className="space-y-4">
            {filteredRisks.map(risk => (
              <Card
                key={risk.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedRisk(risk)}
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{risk.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {risk.id} • Owner: {risk.owner} • Due: {risk.dueDate}
                      </CardDescription>
                    </div>
                    <div className="flex space-x-2">
                      <Badge className={getSeverityColor(risk.severity)}>{risk.severity}</Badge>
                      <Badge className={getStatusColor(risk.status)}>{risk.status}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Impact</div>
                      <div className="text-sm">{risk.impact}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-gray-600">Risk Score</div>
                        <div className="font-medium">{risk.riskScore}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Financial Impact</div>
                        <div className="font-medium">{risk.financialImpact}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Mitigations</div>
                        <div className="font-medium">{risk.mitigations.length} active</div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm">
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button variant="outline" size="sm">
                        <Eye className="h-3 w-3 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Risk Trends</CardTitle>
                <CardDescription>Monthly risk identification and resolution trends</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-end justify-between space-x-1">
                  {riskTrends.map((month, index) => (
                    <div key={month.month} className="flex flex-col items-center space-y-1">
                      <div className="flex flex-col space-y-1">
                        <div
                          className="w-8 bg-red-400 rounded-t"
                          style={{ height: `${month.high * 8}px` }}
                        ></div>
                        <div
                          className="w-8 bg-yellow-400"
                          style={{ height: `${month.medium * 8}px` }}
                        ></div>
                        <div
                          className="w-8 bg-green-400 rounded-b"
                          style={{ height: `${month.low * 8}px` }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-600">{month.month}</div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-center space-x-4 mt-4 text-xs">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-red-400 rounded mr-1"></div>
                    High
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-yellow-400 rounded mr-1"></div>
                    Medium
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-green-400 rounded mr-1"></div>
                    Low
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Risk Categories</CardTitle>
                <CardDescription>Distribution of risks by category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {['Quality', 'Manufacturing', 'Stability', 'Supply Chain', 'Regulatory'].map(
                    category => {
                      const categoryRisks = riskAssessments.filter(r => r.category === category);
                      const percentage = (categoryRisks.length / riskAssessments.length) * 100;
                      return (
                        <div key={category}>
                          <div className="flex justify-between text-sm mb-1">
                            <span>{category}</span>
                            <span>{categoryRisks.length} risks</span>
                          </div>
                          <Progress value={percentage} className="h-2" />
                        </div>
                      );
                    }
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="planning">
          <Card>
            <CardHeader>
              <CardTitle>Mitigation Planning & Tracking</CardTitle>
              <CardDescription>
                Track and manage risk mitigation strategies and their implementation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {riskAssessments.map(risk => (
                  <div key={risk.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-medium">{risk.title}</h4>
                        <p className="text-sm text-gray-600">{risk.id}</p>
                      </div>
                      <Badge className={getSeverityColor(risk.severity)}>{risk.severity}</Badge>
                    </div>
                    <div className="space-y-2">
                      {risk.mitigations.map((mitigation, index) => (
                        <div key={index} className="flex items-center space-x-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span>{mitigation}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center mt-3 pt-3 border-t">
                      <span className="text-sm text-gray-600">
                        Owner: {risk.owner} • Due: {risk.dueDate}
                      </span>
                      <div className="flex space-x-2">
                        <Button variant="outline" size="sm">
                          <Plus className="h-3 w-3 mr-1" />
                          Add Mitigation
                        </Button>
                        <Button variant="outline" size="sm">
                          Update Progress
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CMCRiskManagement;
