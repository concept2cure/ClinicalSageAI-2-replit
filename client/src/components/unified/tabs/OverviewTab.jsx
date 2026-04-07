import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Clock, FileText, Activity, Shield, Brain, TrendingUp, Package, Users, LineChart, Zap, PieChart } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import * as csrAPI from '@/api/csr';

export default function OverviewTab({ setActiveTab, dashboardMetrics, regulatoryData }) {
  return (
    <div className="space-y-6 mt-0">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Metric Cards */}
        <Card className="rounded-2xl border-0 shadow-lg bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-gray-900">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total CSRs
              </CardTitle>
              <FileText className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-total-csrs">
              {dashboardMetrics?.totalCsrs || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              <TrendingUp className="h-3 w-3 inline mr-1 text-green-500" />
              +12% from last month
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-0 shadow-lg bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/20 dark:to-gray-900">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Studies
              </CardTitle>
              <Activity className="h-4 w-4 text-purple-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-active-studies">
              {dashboardMetrics?.uniqueStudies || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Across 15 therapeutic areas
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-0 shadow-lg bg-gradient-to-br from-green-50 to-white dark:from-green-950/20 dark:to-gray-900">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Compliance Score
              </CardTitle>
              <Shield className="h-4 w-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-compliance-score">
              {regulatoryData?.readinessScore || 87}%
            </div>
            <Progress value={87} className="mt-3 h-1.5" />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-0 shadow-lg bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/20 dark:to-gray-900">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                AI Predictions
              </CardTitle>
              <Brain className="h-4 w-4 text-orange-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-ai-predictions">
              92%
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Success probability
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                {
                  icon: FileText,
                  title: 'Protocol Design Updated',
                  desc: 'Phase III Oncology Study',
                  time: '2 hours ago',
                  color: 'text-blue-500',
                },
                {
                  icon: Shield,
                  title: 'ICH Compliance Check',
                  desc: '98% compliance achieved',
                  time: '4 hours ago',
                  color: 'text-green-500',
                },
                {
                  icon: Brain,
                  title: 'AnA Predictions Analysis',
                  desc: 'Dose escalation complete',
                  time: '6 hours ago',
                  color: 'text-purple-500',
                },
                {
                  icon: FileText,
                  title: 'CSR Upload',
                  desc: '15 new reports ingested',
                  time: '8 hours ago',
                  color: 'text-orange-500',
                },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  data-testid={`activity-item-${idx}`}
                >
                  <div className={`p-2 rounded-lg bg-gray-100 dark:bg-gray-800`}>
                    <item.icon className={`h-4 w-4 ${item.color}`} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{item.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="rounded-xl h-auto flex-col py-4"
                onClick={() => setActiveTab('design')}
                data-testid="button-quick-protocol"
              >
                <Package className="h-5 w-5 mb-2" />
                <span className="text-xs">New Protocol</span>
              </Button>
              <Button
                variant="outline"
                className="rounded-xl h-auto flex-col py-4"
                onClick={() => setActiveTab('insights')}
                data-testid="button-quick-csr"
              >
                <FileText className="h-5 w-5 mb-2" />
                <span className="text-xs">Upload CSR</span>
              </Button>
              <Button
                variant="outline"
                className="rounded-xl h-auto flex-col py-4"
                onClick={() => setActiveTab('compliance')}
                data-testid="button-quick-compliance"
              >
                <Shield className="h-5 w-5 mb-2" />
                <span className="text-xs">Check Compliance</span>
              </Button>
              <Button
                variant="outline"
                className="rounded-xl h-auto flex-col py-4"
                onClick={() => setActiveTab('insights')}
                data-testid="button-quick-analytics"
              >
                <Brain className="h-5 w-5 mb-2" />
                <span className="text-xs">AI Analysis</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Phase Distribution Chart */}
      <Card className="rounded-2xl border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            Study Phase Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {(dashboardMetrics?.phaseDistribution || []).map((phase, idx) => (
              <div
                key={idx}
                className="text-center p-4 rounded-xl bg-gray-50 dark:bg-gray-800"
                data-testid={`phase-${idx}`}
              >
                <div className="text-2xl font-bold text-blue-600">{phase.count}</div>
                <div className="text-sm text-muted-foreground">{phase.phase}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
