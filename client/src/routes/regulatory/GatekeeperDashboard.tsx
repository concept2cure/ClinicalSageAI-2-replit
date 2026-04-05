import * as React from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Play,
  Wrench,
  Clock,
  TrendingUp,
  Calendar,
  MessageSquare,
  Download,
  Activity,
} from 'lucide-react';

export default function GatekeeperDashboard({ subId }: { subId: string }) {
  const [gatekeeperData, setGatekeeperData] = React.useState<any>(null);
  const [rpiData, setRpiData] = React.useState<any>(null);
  const [timelineData, setTimelineData] = React.useState<any>(null);
  const [history, setHistory] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);

  const loadData = React.useCallback(async () => {
    if (!subId) return;
    setLoading(true);
    try {
      const [rpi, timeline, hist] = await Promise.all([
        apiRequest('GET', `/api/reg/submissions/${subId}/rpi`).then(r => r.json()),
        apiRequest('GET', `/api/reg/submissions/${subId}/timeline-risk`).then(r => r.json()),
        apiRequest('GET', `/api/reg/submissions/${subId}/gatekeeper/history`).then(r => r.json()),
      ]);
      setRpiData(rpi);
      setTimelineData(timeline);
      setHistory(hist);
    } catch (error) {
      console.error('[Gatekeeper] Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [subId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const runGatekeeper = async () => {
    setLoading(true);
    try {
      const response = await apiRequest('POST', `/api/reg/submissions/${subId}/gatekeeper/run`);
      const result = await response.json();
      setGatekeeperData(result);
      loadData(); // Refresh all data
    } catch (error) {
      console.error('[Gatekeeper] Failed to run gatekeeper:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyAutoFix = async () => {
    if (!gatekeeperData?.blockers) return;
    setLoading(true);
    try {
      await apiRequest('POST', `/api/reg/submissions/${subId}/gatekeeper/autofix`, { blockers: gatekeeperData.blockers });
      loadData(); // Refresh data after fixes
    } catch (error) {
      console.error('[Gatekeeper] Failed to apply auto-fix:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateSlackDigest = async () => {
    try {
      const response = await apiRequest('POST', `/api/reg/submissions/${subId}/digest/slack`);
      const digest = await response.json();

      // Copy to clipboard
      navigator.clipboard.writeText(digest.message);
      toast({ title: 'Copied', description: 'Slack digest copied to clipboard' });
    } catch (error) {
      console.error('[Gatekeeper] Failed to generate Slack digest:', error);
    }
  };

  const downloadCalendar = async () => {
    try {
      const response = await apiRequest('GET', `/api/reg/submissions/${subId}/calendar`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `regulatory-review-${subId}.ics`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[Gatekeeper] Failed to download calendar:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASS':
        return <CheckCircle className="w-5 h-5 text-stone-700" />;
      case 'HOLD':
        return <AlertTriangle className="w-5 h-5 text-stone-600" />;
      case 'REJECT':
        return <XCircle className="w-5 h-5 text-stone-700" />;
      default:
        return <Shield className="w-5 h-5 text-stone-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      PASS: { variant: 'default', className: 'bg-stone-700' },
      HOLD: { variant: 'default', className: 'bg-stone-600' },
      REJECT: { variant: 'destructive' },
    };
    return <Badge {...(variants[status] || { variant: 'outline' })}>{status}</Badge>;
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <Badge variant="destructive">Critical</Badge>;
      case 'WARN':
        return <Badge className="bg-stone-1000">Warning</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getRPIColor = (score: number) => {
    if (score >= 80) return 'text-stone-700';
    if (score >= 60) return 'text-stone-600';
    return 'text-stone-700';
  };

  return (
    <div className="space-y-6" data-testid="gatekeeper-dashboard">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-semibold">Regulatory Gatekeeper v2</h3>
          <p className="text-stone-600">AI-powered submission readiness with RPI dashboard</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={runGatekeeper}
            disabled={loading || !subId}
            data-testid="run-gatekeeper-btn"
          >
            <Play className="w-4 h-4 mr-2" />
            {loading ? 'Running...' : 'Run Gatekeeper'}
          </Button>
        </div>
      </div>

      {/* Current Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Gatekeeper Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Gatekeeper Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {gatekeeperData ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {getStatusIcon(gatekeeperData.status)}
                  {getStatusBadge(gatekeeperData.status)}
                </div>
                <div className="text-sm text-stone-600">
                  {gatekeeperData.blockers?.length || 0} blockers found
                </div>
                {gatekeeperData.blockers?.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={applyAutoFix}
                    disabled={loading}
                    data-testid="autofix-btn"
                  >
                    <Wrench className="w-3 h-3 mr-1" />
                    Auto-Fix
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-sm text-stone-500">Run Gatekeeper to see status</div>
            )}
          </CardContent>
        </Card>

        {/* RPI Score */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              RPI Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rpiData ? (
              <div className="space-y-3">
                <div className={`text-2xl font-bold ${getRPIColor(rpiData.rpi)}`}>
                  {rpiData.rpi}/100
                </div>
                <Progress value={rpiData.rpi} className="h-2" />
                <div className="text-sm text-stone-600">Regulatory Posture Index</div>
              </div>
            ) : (
              <div className="text-sm text-stone-500">Loading RPI data...</div>
            )}
          </CardContent>
        </Card>

        {/* Timeline Risk */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Timeline Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            {timelineData ? (
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="font-medium">On-time probability:</span>
                  <span
                    className={`ml-2 ${timelineData.onTimeProb > 0.7 ? 'text-stone-700' : 'text-stone-700'}`}
                  >
                    {Math.round(timelineData.onTimeProb * 100)}%
                  </span>
                </div>
                <div className="text-sm">
                  <span className="font-medium">P50:</span> {timelineData.p50Days} days
                </div>
                <div className="text-sm">
                  <span className="font-medium">P90:</span> {timelineData.p90Days} days
                </div>
              </div>
            ) : (
              <div className="text-sm text-stone-500">Loading timeline data...</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Blockers Details */}
      {gatekeeperData?.blockers?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Current Blockers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {gatekeeperData.blockers.map((blocker: any, idx: number) => (
                <Alert
                  key={idx}
                  className={
                    blocker.severity === 'CRITICAL' ? 'border-stone-1000' : 'border-stone-1000'
                  }
                >
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        {getSeverityBadge(blocker.severity)}
                        <span className="font-medium">{blocker.id}</span>
                      </div>
                      <div className="text-sm">{blocker.msg}</div>
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* RPI Component Breakdown */}
      {rpiData?.components && (
        <Card>
          <CardHeader>
            <CardTitle>RPI Component Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(rpiData.components).map(([key, value]: [string, any]) => (
                <div key={key} className="space-y-2">
                  <div className="text-sm font-medium capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <div className={`text-lg font-bold ${getRPIColor(value)}`}>{value}%</div>
                  <Progress value={value} className="h-1" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions Panel */}
      <Card>
        <CardHeader>
          <CardTitle>Actions & Digests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={generateSlackDigest} data-testid="slack-digest-btn">
              <MessageSquare className="w-4 h-4 mr-2" />
              Copy Slack Digest
            </Button>
            <Button
              variant="outline"
              onClick={downloadCalendar}
              data-testid="download-calendar-btn"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Calendar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent History */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Gatekeeper Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {history.slice(0, 5).map((run: any) => (
                <div
                  key={run.run_id}
                  className="flex justify-between items-center p-3 border rounded"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(run.status)}
                    <div>
                      <div className="font-medium">{run.status}</div>
                      <div className="text-sm text-stone-600">
                        {new Date(run.created_at).toLocaleDateString()} by {run.created_by}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-stone-600">{run.blockers?.length || 0} blockers</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
