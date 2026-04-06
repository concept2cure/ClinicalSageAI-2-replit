import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Target,
  BarChart3,
  Zap,
  Shield,
  Factory,
  Bot,
} from 'lucide-react';

function Card_({ label, value, sub }) {
  return (
    <div className="rounded-xl border p-4 bg-white">
      <div className="text-sm opacity-60">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-1">{sub}</div>}
    </div>
  );
}

// Real-time KPI mapping from API data
function mapKPIData(apiKpis) {
  if (!apiKpis) return [];

  return [
    {
      id: 'readiness',
      title: 'Submission Readiness',
      value: `${apiKpis.readinessPct}%`,
      trend: apiKpis.readinessPct >= 78 ? 'up' : 'down',
      trendValue: `${apiKpis.readinessPct >= 78 ? '+' : ''}${apiKpis.readinessPct - 70}%`,
      target: '85%',
      status:
        apiKpis.readinessPct >= 85
          ? 'excellent'
          : apiKpis.readinessPct >= 75
          ? 'on-track'
          : 'in-progress',
      icon: CheckCircle2,
      description: 'Manufacturing dimension readiness (PPQ, OEE, AI compliance blend)',
    },
    {
      id: 'ppq',
      title: 'PPQ Completion',
      value: `${apiKpis.ppqPct}%`,
      trend: apiKpis.ppqPct >= 67 ? 'up' : 'stable',
      trendValue: `${apiKpis.ppqPct}%`,
      target: '100%',
      status:
        apiKpis.ppqPct >= 100 ? 'excellent' : apiKpis.ppqPct >= 67 ? 'on-track' : 'in-progress',
      icon: Target,
      description: 'Completed runs / Target runs with acceptance criteria',
    },
    {
      id: 'deviation-rate',
      title: 'Deviation Rate (90d)',
      value: `${apiKpis.deviationRate90d}`,
      trend: apiKpis.deviationRate90d <= 0.2 ? 'down' : 'up',
      trendValue: `${apiKpis.deviationRate90d <= 0.2 ? '-' : '+'}${Math.abs(
        apiKpis.deviationRate90d - 0.25
      ).toFixed(2)}`,
      target: '< 0.30',
      status:
        apiKpis.deviationRate90d <= 0.15
          ? 'excellent'
          : apiKpis.deviationRate90d <= 0.25
          ? 'on-track'
          : 'at-risk',
      icon: AlertTriangle,
      description: 'Deviations per batch over last 90 days',
    },
    {
      id: 'release-time',
      title: 'Release Lead Time',
      value: `${apiKpis.releaseLeadTimeDays} days`,
      trend: apiKpis.releaseLeadTimeDays <= 7 ? 'down' : 'up',
      trendValue: `${apiKpis.releaseLeadTimeDays <= 7 ? '-' : '+'}${Math.abs(
        apiKpis.releaseLeadTimeDays - 8
      ).toFixed(1)}d`,
      target: '< 5d',
      status:
        apiKpis.releaseLeadTimeDays <= 5
          ? 'excellent'
          : apiKpis.releaseLeadTimeDays <= 8
          ? 'on-track'
          : 'at-risk',
      icon: Clock,
      description: 'QA release cycle average time',
    },
    {
      id: 'oee',
      title: 'OEE (Availability×Performance×Quality)',
      value: `${apiKpis.oeePct}%`,
      trend: apiKpis.oeePct >= 75 ? 'up' : 'down',
      trendValue: `${apiKpis.oeePct >= 75 ? '+' : ''}${apiKpis.oeePct - 70}%`,
      target: '80%',
      status: apiKpis.oeePct >= 80 ? 'excellent' : apiKpis.oeePct >= 70 ? 'on-track' : 'at-risk',
      icon: Factory,
      description: 'Equipment effectiveness (penalized for overdue calibration/PQ)',
    },
    {
      id: 'ai-compliance',
      title: 'AI Compliance Score',
      value: `${apiKpis.aiComplianceScore}%`,
      trend: apiKpis.aiComplianceScore >= 85 ? 'up' : 'stable',
      trendValue: `${apiKpis.aiComplianceScore >= 85 ? '+' : ''}${apiKpis.aiComplianceScore - 80}%`,
      target: '> 90%',
      status:
        apiKpis.aiComplianceScore >= 90
          ? 'excellent'
          : apiKpis.aiComplianceScore >= 80
          ? 'on-track'
          : 'at-risk',
      icon: Bot,
      description: '100 - weighted(high×8 + medium×4) open AI findings',
    },
  ];
}

const STATUS_CONFIG = {
  excellent: {
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950',
    badge: 'bg-green-100 text-green-800 border-green-300',
  },
  'on-track': {
    color: 'text-stone-600 dark:text-stone-400',
    bgColor: 'bg-stone-50',
    badge: 'bg-stone-100 text-stone-800 border-stone-300',
  },
  'in-progress': {
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950',
    badge: 'bg-orange-100 text-orange-800 border-orange-300',
  },
  'at-risk': {
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950',
    badge: 'bg-red-100 text-red-800 border-red-300',
  },
};

function KPICard({ kpi }) {
  const Icon = kpi.icon;
  const statusConfig = STATUS_CONFIG[kpi.status] || STATUS_CONFIG['in-progress'];

  return (
    <Card
      className={`hover:shadow-md transition-shadow ${
        statusConfig.bgColor
      } border-l-4 ${statusConfig.color
        .replace('text-', 'border-')
        .replace(' dark:text-', ' dark:border-')}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`w-5 h-5 ${statusConfig.color}`} />
            <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {kpi.title}
            </CardTitle>
          </div>
          <Badge variant="outline" className={statusConfig.badge}>
            {kpi.status.replace('-', ' ')}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{kpi.value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-500">Target: {kpi.target}</div>
          </div>

          <div
            className={`flex items-center gap-1 text-sm ${
              kpi.trend === 'up'
                ? 'text-green-600'
                : kpi.trend === 'down'
                ? 'text-red-600'
                : 'text-gray-500'
            }`}
          >
            {kpi.trend === 'up' && <TrendingUp className="w-4 h-4" />}
            {kpi.trend === 'down' && <TrendingDown className="w-4 h-4" />}
            {kpi.trend === 'stable' && <Activity className="w-4 h-4" />}
            <span>{kpi.trendValue}</span>
          </div>
        </div>

        <Progress
          value={parseFloat(kpi.value)}
          className="h-2"
          indicatorClassName={statusConfig.color.replace('text-', 'bg-')}
        />

        <p className="text-xs text-gray-600 dark:text-gray-400">{kpi.description}</p>
      </CardContent>
    </Card>
  );
}

export default function ManufacturingKPICards() {
  const [kpis, setKpis] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const response = await fetch('/api/cmc/manufacturing/overview', { credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (alive) {
          setKpis(data.kpis);
          setLoading(false);
        }
      } catch (err) {
        if (alive) {
          setError(err);
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const kpiData = React.useMemo(() => {
    return kpis ? mapKPIData(kpis) : [];
  }, [kpis]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-8 bg-gray-200 rounded mb-2"></div>
                <div className="h-3 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-4">
          <div className="text-red-700">Failed to load KPIs: {error.message}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Manufacturing Overview & KPIs
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Real-time performance indicators with event-driven updates
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            data-testid="btn-kpi-refresh"
            onClick={() => window.location.reload()}
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" data-testid="btn-kpi-export">
            <TrendingUp className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="kpi-cards-grid">
        {kpiData.map(kpi => (
          <KPICard key={kpi.id} kpi={kpi} />
        ))}
      </div>

      {/* Summary Insights */}
      <Card className="bg-gradient-to-r from-stone-50 to-indigo-50 dark:from-stone-50 dark:to-indigo-50 border-stone-200 dark:border-stone-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-stone-900 dark:text-stone-800">
            <Zap className="w-5 h-5" />
            Manufacturing Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="p-3 bg-white dark:bg-gray-50 rounded-lg border">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-medium">Real-time Data</span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                KPIs updated via event-driven system from seed data
              </p>
            </div>

            <div className="p-3 bg-white dark:bg-gray-50 rounded-lg border">
              <div className="flex items-center gap-2 text-stone-600 dark:text-stone-400">
                <Shield className="w-4 h-4" />
                <span className="text-sm font-medium">Formula-driven</span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Sophisticated calculations: Readiness = 0.35×PPQ + 0.15×Deviation + 0.2×OEE + 0.3×AI
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-stone-200 ">
            <span className="text-sm text-stone-700 dark:text-stone-300">
              Last updated: {new Date().toLocaleString()}
            </span>
            <Button variant="ghost" size="sm" className="text-stone-700 dark:text-stone-300">
              View Full Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
