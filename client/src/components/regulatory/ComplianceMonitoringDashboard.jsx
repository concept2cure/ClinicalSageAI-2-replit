import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  Globe,
  Target,
  TrendingDown,
  TrendingUp,
  Calendar,
  Users,
  FileCheck,
} from 'lucide-react';

export default function ComplianceMonitoringDashboard() {
  const [timeRange, setTimeRange] = useState('30d');

  // Real-time compliance monitoring data
  const { data: complianceData, isLoading } = useQuery({
    queryKey: ['/api/compliance-monitoring/dashboard', timeRange],
    queryFn: async () => {
      const response = await fetch('/api/compliance-monitoring/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          time_range: timeRange,
          include_risk_assessment: true,
          include_regulatory_changes: true,
          include_audit_readiness: true,
        }),
      });

      if (!response.ok) throw new Error('Failed to load compliance data');
      return response.json();
    },
    retry: 2,
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  const complianceScores = {
    overall: 89,
    ich_gcp: 94,
    fda_regulations: 87,
    ema_guidelines: 91,
    data_integrity: 85,
    quality_management: 92,
  };

  const riskIndicators = [
    {
      category: 'ICH E6(R3) Compliance',
      risk_level: 'Low',
      score: 94,
      trend: 'up',
      last_assessment: '2025-01-09',
      issues: 2,
    },
    {
      category: 'Data Integrity (ALCOA+)',
      risk_level: 'Medium',
      score: 78,
      trend: 'stable',
      last_assessment: '2025-01-08',
      issues: 8,
    },
    {
      category: 'Risk-Based Monitoring',
      risk_level: 'Low',
      score: 91,
      trend: 'up',
      last_assessment: '2025-01-10',
      issues: 1,
    },
    {
      category: 'Patient Safety Reporting',
      risk_level: 'High',
      score: 68,
      trend: 'down',
      last_assessment: '2025-01-07',
      issues: 12,
    },
  ];

  const upcomingDeadlines = [
    {
      task: 'Q4 2024 PSUR Submission',
      deadline: '2025-01-31',
      days_remaining: 21,
      priority: 'Critical',
      assigned_to: 'Regulatory Affairs Team',
      completion: 65,
    },
    {
      task: 'ICH E6(R3) Gap Analysis',
      deadline: '2025-02-15',
      days_remaining: 36,
      priority: 'High',
      assigned_to: 'Quality Assurance',
      completion: 30,
    },
    {
      task: 'FDA AI Guidance Implementation',
      deadline: '2025-03-01',
      days_remaining: 50,
      priority: 'High',
      assigned_to: 'Medical Device Team',
      completion: 15,
    },
  ];

  const auditReadiness = {
    documentation_completeness: 87,
    training_compliance: 92,
    system_validation: 78,
    process_adherence: 94,
    corrective_actions: 83,
  };

  const globalComplianceStatus = [
    { region: 'FDA (US)', status: 'Compliant', score: 89, last_inspection: '2024-08-15' },
    { region: 'EMA (EU)', status: 'Compliant', score: 91, last_inspection: '2024-09-22' },
    { region: 'Health Canada', status: 'Minor Issues', score: 82, last_inspection: '2024-07-10' },
    { region: 'PMDA (Japan)', status: 'Compliant', score: 88, last_inspection: '2024-10-05' },
    { region: 'TGA (Australia)', status: 'Compliant', score: 90, last_inspection: '2024-06-18' },
  ];

  const getRiskColor = level => {
    switch (level.toLowerCase()) {
      case 'low':
        return 'text-green-600 bg-green-100';
      case 'medium':
        return 'text-yellow-600 bg-yellow-100';
      case 'high':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getTrendIcon = trend => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <div className="h-4 w-4 bg-gray-400 rounded-full"></div>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
        <span className="ml-2">Loading compliance dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Compliance Score */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Overall Compliance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold">{complianceScores.overall}%</span>
                </div>
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <circle
                    className="text-gray-200"
                    strokeWidth="10"
                    stroke="currentColor"
                    fill="transparent"
                    r="40"
                    cx="50"
                    cy="50"
                  />
                  <circle
                    className="text-blue-600"
                    strokeWidth="10"
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 * (1 - complianceScores.overall / 100)}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r="40"
                    cx="50"
                    cy="50"
                  />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">ICH E6(R3) GCP</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{complianceScores.ich_gcp}%</div>
              <Badge className="mt-2 bg-green-100 text-green-800">Excellent</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Data Integrity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-600">
                {complianceScores.data_integrity}%
              </div>
              <Badge className="mt-2 bg-yellow-100 text-yellow-800">Needs Attention</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Quality Management</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {complianceScores.quality_management}%
              </div>
              <Badge className="mt-2 bg-green-100 text-green-800">Strong</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Indicators */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Shield className="mr-2 h-5 w-5" />
              Risk Assessment Matrix
            </CardTitle>
            <CardDescription>Real-time compliance risk monitoring</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {riskIndicators.map((indicator, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-medium text-sm">{indicator.category}</h4>
                      {getTrendIcon(indicator.trend)}
                    </div>
                    <div className="flex items-center justify-between">
                      <Progress value={indicator.score} className="h-2 flex-1 mr-4" />
                      <span className="text-sm font-medium">{indicator.score}%</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <Badge className={`text-xs ${getRiskColor(indicator.risk_level)}`}>
                        {indicator.risk_level} Risk
                      </Badge>
                      <span className="text-xs text-gray-500">{indicator.issues} issues</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Deadlines */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="mr-2 h-5 w-5" />
              Critical Deadlines
            </CardTitle>
            <CardDescription>Upcoming regulatory commitments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingDeadlines.map((deadline, index) => (
                <div key={index} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm">{deadline.task}</h4>
                    <Badge
                      variant={
                        deadline.priority === 'Critical'
                          ? 'destructive'
                          : deadline.priority === 'High'
                            ? 'default'
                            : 'secondary'
                      }
                    >
                      {deadline.priority}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-600">{deadline.assigned_to}</span>
                    <span className="text-xs font-medium">
                      {deadline.days_remaining} days remaining
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <Progress value={deadline.completion} className="h-2 flex-1 mr-4" />
                    <span className="text-xs">{deadline.completion}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Global Compliance Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Globe className="mr-2 h-5 w-5" />
            Global Regulatory Status
          </CardTitle>
          <CardDescription>Compliance status across major regulatory authorities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {globalComplianceStatus.map((region, index) => (
              <div key={index} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{region.region}</h4>
                  <Badge
                    variant={
                      region.status === 'Compliant'
                        ? 'default'
                        : region.status === 'Minor Issues'
                          ? 'secondary'
                          : 'destructive'
                    }
                  >
                    {region.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Compliance Score</span>
                  <span className="font-medium">{region.score}%</span>
                </div>
                <div className="text-xs text-gray-500">
                  Last Inspection: {region.last_inspection}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Audit Readiness */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileCheck className="mr-2 h-5 w-5" />
            Audit Readiness Assessment
          </CardTitle>
          <CardDescription>Current preparedness for regulatory inspections</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {Object.entries(auditReadiness).map(([category, score]) => (
              <div key={category} className="text-center">
                <div className="mb-2">
                  <div className="text-2xl font-bold">{score}%</div>
                  <div className="text-xs text-gray-600 capitalize">
                    {category.replace('_', ' ')}
                  </div>
                </div>
                <Progress value={score} className="h-2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
