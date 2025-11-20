import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Users,
  BarChart3,
  Target,
  RefreshCw,
  Zap,
} from 'lucide-react';

// 5. Real-time Validation Monitoring Dashboard
const RealTimeMonitoringDashboard = () => {
  const [monitoringData, setMonitoringData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    fetchMonitoringData();

    // Auto-refresh every 30 seconds if enabled
    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchMonitoringData, 30000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const fetchMonitoringData = async () => {
    try {
      const currentOrgId = localStorage.getItem('currentOrganization') || '7';
      const response = await fetch('/api/analytical/real-time-monitoring', {
        headers: {
          'x-tenant-id': currentOrgId,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMonitoringData(data);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Error fetching monitoring data:', error);
      // Fallback to demo data
      setMonitoringData({
        summary: {
          totalMethods: 22,
          inValidation: 8,
          guardFailures: 2,
          pendingApprovals: 3,
          avgValidationTime: 12.5,
          complianceScore: 94.2,
        },
        activeValidations: [
          {
            id: 'e67aaf86-c33e-4dcb-9786-a37e681ea3ee',
            method: 'UPLC-MS/MS Impurity Profile',
            analyst: 'Dr. Sarah Chen',
            stage: 'Linearity Testing',
            progress: 75,
            status: 'ON_TRACK',
            estimatedCompletion: '2025-09-15',
            lastUpdate: '2 hours ago',
          },
          {
            id: 'f67aaf86-c33e-4dcb-9786-a37e681ea3ef',
            method: 'HPLC Related Substances',
            analyst: 'Michael Rodriguez',
            stage: 'Accuracy Studies',
            progress: 45,
            status: 'DELAYED',
            estimatedCompletion: '2025-09-20',
            lastUpdate: '30 minutes ago',
          },
        ],
        recentAlerts: [
          {
            id: 1,
            type: 'GUARD_FAILURE',
            severity: 'HIGH',
            message: 'R² below threshold (0.9985) for Method AM-681ea3ee',
            timestamp: '10 minutes ago',
            method: 'UPLC-MS/MS Impurity Profile',
            action: 'Task auto-created for Dr. Sarah Chen',
          },
          {
            id: 2,
            type: 'OOS_RESULT',
            severity: 'CRITICAL',
            message: 'Precision RSD 3.2% exceeds limit (2.0%) for Method AM-08d74f86',
            timestamp: '25 minutes ago',
            method: 'HPLC-UV API Assay',
            action: 'Investigation required',
          },
        ],
        guardStatus: {
          totalGuards: 156,
          passing: 147,
          failing: 9,
          recentFailures: [
            {
              parameter: 'R² Linearity',
              method: 'AM-681ea3ee',
              value: '0.9985',
              threshold: '≥0.9990',
            },
            {
              parameter: 'Precision RSD',
              method: 'AM-08d74f86',
              value: '3.2%',
              threshold: '≤2.0%',
            },
            {
              parameter: 'Accuracy Recovery',
              method: 'AM-5192cfaf',
              value: '97.8%',
              threshold: '98-102%',
            },
          ],
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = severity => {
    switch (severity) {
      case 'CRITICAL':
        return 'destructive';
      case 'HIGH':
        return 'secondary';
      case 'MEDIUM':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getStatusColor = status => {
    switch (status) {
      case 'ON_TRACK':
        return 'text-green-600 bg-green-100';
      case 'DELAYED':
        return 'text-orange-600 bg-orange-100';
      case 'CRITICAL':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="text-center">
          <Activity className="w-8 h-8 mx-auto mb-2 animate-spin" />
          <div className="text-sm text-gray-600">Loading real-time monitoring data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Real-Time Validation Monitoring</h2>
          <p className="text-gray-600">
            Live monitoring of analytical method validation across all projects
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-500">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </div>
          <Button variant="outline" size="sm" onClick={() => setAutoRefresh(!autoRefresh)}>
            <Zap className={`w-4 h-4 mr-2 ${autoRefresh ? 'text-green-600' : 'text-gray-400'}`} />
            Auto Refresh
          </Button>
          <Button onClick={fetchMonitoringData} size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{monitoringData.summary.totalMethods}</div>
                <div className="text-sm text-gray-600">Total Methods</div>
              </div>
              <BarChart3 className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-orange-600">
                  {monitoringData.summary.inValidation}
                </div>
                <div className="text-sm text-gray-600">In Validation</div>
              </div>
              <Activity className="w-8 h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {monitoringData.summary.guardFailures}
                </div>
                <div className="text-sm text-gray-600">Guard Failures</div>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {monitoringData.summary.pendingApprovals}
                </div>
                <div className="text-sm text-gray-600">Pending Approvals</div>
              </div>
              <Clock className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">
                  {monitoringData.summary.avgValidationTime}d
                </div>
                <div className="text-sm text-gray-600">Avg Validation</div>
              </div>
              <TrendingUp className="w-8 h-8 text-gray-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {monitoringData.summary.complianceScore}%
                </div>
                <div className="text-sm text-gray-600">Compliance</div>
              </div>
              <Target className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Validations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Active Validations ({monitoringData.activeValidations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {monitoringData.activeValidations.map(validation => (
                <div key={validation.id} className="p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="font-medium">{validation.method}</div>
                      <div className="text-sm text-gray-600">{validation.stage}</div>
                    </div>
                    <Badge className={getStatusColor(validation.status)}>
                      {validation.status.replace('_', ' ')}
                    </Badge>
                  </div>

                  <div className="mb-2">
                    <div className="flex justify-between text-sm mb-1">
                      <span>Progress</span>
                      <span>{validation.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          validation.status === 'ON_TRACK'
                            ? 'bg-green-600'
                            : validation.status === 'DELAYED'
                              ? 'bg-orange-500'
                              : 'bg-red-600'
                        }`}
                        style={{ width: `${validation.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {validation.analyst}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Est: {validation.estimatedCompletion}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Recent Alerts ({monitoringData.recentAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {monitoringData.recentAlerts.map(alert => (
                <div key={alert.id} className="p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      className={`w-4 h-4 mt-0.5 ${
                        alert.severity === 'CRITICAL'
                          ? 'text-red-600'
                          : alert.severity === 'HIGH'
                            ? 'text-orange-600'
                            : 'text-yellow-600'
                      }`}
                    />
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-1">
                        <div className="font-medium text-sm">{alert.message}</div>
                        <Badge variant={getSeverityColor(alert.severity)} className="text-xs">
                          {alert.severity}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-600 mb-1">{alert.method}</div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">{alert.timestamp}</span>
                        <span className="text-blue-600">{alert.action}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Guard Status Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Approval Guard Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-2xl font-bold">
                    {monitoringData.guardStatus.passing}/{monitoringData.guardStatus.totalGuards}
                  </div>
                  <div className="text-sm text-gray-600">Guards Passing</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-red-600">
                    {monitoringData.guardStatus.failing}
                  </div>
                  <div className="text-sm text-gray-600">Failing</div>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="h-3 bg-green-600 rounded-full"
                  style={{
                    width: `${(monitoringData.guardStatus.passing / monitoringData.guardStatus.totalGuards) * 100}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-3">Recent Guard Failures</div>
              <div className="space-y-2">
                {monitoringData.guardStatus.recentFailures.map((failure, idx) => (
                  <div key={idx} className="text-sm p-2 bg-red-50 border border-red-200 rounded">
                    <div className="font-medium">{failure.parameter}</div>
                    <div className="text-xs text-gray-600">
                      {failure.method}: {failure.value} (required: {failure.threshold})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RealTimeMonitoringDashboard;
