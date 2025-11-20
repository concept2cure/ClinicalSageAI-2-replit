import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Mail,
  Calendar,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Settings,
  ExternalLink,
  Info,
  Clock,
  Database,
  Zap,
  Download,
  Upload,
  Globe,
  Shield,
  Activity,
  Users,
} from 'lucide-react';

interface IntegrationsPanelProps {
  subId?: string;
}

export default function IntegrationsPanel({ subId }: IntegrationsPanelProps) {
  const [gmailRows, setGmailRows] = React.useState<any[]>([]);
  const [busyGmail, setBusyGmail] = React.useState(false);
  const [busyCalendar, setBusyCalendar] = React.useState(false);
  const [lastSync, setLastSync] = React.useState<string | null>(null);
  const [integrationStatus, setIntegrationStatus] = React.useState({
    gmail: 'connected',
    calendar: 'connected',
  });

  // Load recent Gmail ingests
  async function loadGmailData() {
    try {
      const response = await fetch(`/api/reg/integrations/gmail/ingest/recent`);
      const data = await response.json();
      setGmailRows(data);
    } catch (error) {
      console.error('Failed to load Gmail data:', error);
    }
  }

  React.useEffect(() => {
    loadGmailData();
    setLastSync(new Date().toLocaleString());
  }, []);

  // Run Gmail ingest
  async function runGmailIngest() {
    setBusyGmail(true);
    try {
      const response = await fetch(`/api/reg/integrations/gmail/ingest`, {
        method: 'POST',
      });
      const result = await response.json();

      if (result.error) {
        alert(`Gmail ingest error: ${result.error}`);
        setIntegrationStatus(prev => ({ ...prev, gmail: 'error' }));
      } else {
        alert(
          `Gmail ingest completed: ${result.saved} emails processed, ${result.createdQuestions} questions created, ${result.createdObls} obligations created`
        );
        setIntegrationStatus(prev => ({ ...prev, gmail: 'connected' }));
        loadGmailData();
      }
    } catch (error) {
      alert('Gmail ingest failed: Network error');
      setIntegrationStatus(prev => ({ ...prev, gmail: 'error' }));
    } finally {
      setBusyGmail(false);
    }
  }

  // Push to Google Calendar
  async function pushToCalendar() {
    if (!subId) {
      alert('No submission selected');
      return;
    }

    setBusyCalendar(true);
    try {
      const response = await fetch(`/api/reg/integrations/gcal/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subId }),
      });
      const result = await response.json();

      if (result.error) {
        alert(`Calendar push failed: ${result.error}`);
        setIntegrationStatus(prev => ({ ...prev, calendar: 'error' }));
      } else {
        alert(`Successfully pushed ${result.pushed} events to calendar: ${result.calendarId}`);
        setIntegrationStatus(prev => ({ ...prev, calendar: 'connected' }));
      }
    } catch (error) {
      alert('Calendar push failed: Network error');
      setIntegrationStatus(prev => ({ ...prev, calendar: 'error' }));
    } finally {
      setBusyCalendar(false);
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      case 'warning':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      default:
        return <Settings className="w-4 h-4 text-gray-600" />;
    }
  };

  return (
    <div className="space-y-6" data-tour="reg.integrations">
      {/* Integration Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-600" />
            Integration Status Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="font-medium">Gmail Ingestion</p>
                  <p className="text-xs text-muted-foreground">Auto-extract IR emails</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(integrationStatus.gmail)}
                <span className={`text-sm font-medium ${getStatusColor(integrationStatus.gmail)}`}>
                  {integrationStatus.gmail}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium">Google Calendar</p>
                  <p className="text-xs text-muted-foreground">Deadline sync</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(integrationStatus.calendar)}
                <span
                  className={`text-sm font-medium ${getStatusColor(integrationStatus.calendar)}`}
                >
                  {integrationStatus.calendar}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg bg-blue-50">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-indigo-600" />
                <div>
                  <p className="font-medium">Last Sync</p>
                  <p className="text-xs text-muted-foreground">{lastSync || 'Never'}</p>
                </div>
              </div>
              <Badge variant="outline" className="text-indigo-600">
                Active
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gmail Ingestion Panel */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-600" />
              <CardTitle>Gmail Email Ingestion</CardTitle>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Info className="w-3 h-3" />
                <span>
                  Automatically extracts IR/deficiency emails into Questions & Obligations
                </span>
              </div>
            </div>
            <Button
              onClick={runGmailIngest}
              disabled={busyGmail}
              className="flex items-center gap-2"
            >
              {busyGmail ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {busyGmail ? 'Processing...' : 'Run Ingest Now'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Configuration Info */}
            <div className="p-3 bg-blue-50 rounded-lg border-l-4 border-blue-500">
              <div className="flex items-start gap-2">
                <Settings className="w-4 h-4 text-blue-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-blue-800">Configuration Required:</p>
                  <p className="text-blue-700 mt-1">
                    Set <code className="bg-blue-100 px-1 rounded">GMAIL_OAUTH_JSON</code>,
                    <code className="bg-blue-100 px-1 rounded ml-1">GMAIL_USER_EMAIL</code>, and
                    <code className="bg-blue-100 px-1 rounded ml-1">GMAIL_QUERY</code> in Replit
                    Secrets.
                  </p>
                </div>
              </div>
            </div>

            {/* Recent Ingests Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">Recent Email Ingests</h4>
                <Button variant="ghost" size="sm" onClick={loadGmailData}>
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Refresh
                </Button>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-3 text-left font-medium">Date</th>
                      <th className="p-3 text-left font-medium">From</th>
                      <th className="p-3 text-left font-medium">Subject</th>
                      <th className="p-3 text-left font-medium">Extracted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gmailRows.length > 0 ? (
                      gmailRows.map((row: any) => (
                        <tr key={row.msg_id} className="border-t hover:bg-gray-50">
                          <td className="p-3">{new Date(row.created_at).toLocaleDateString()}</td>
                          <td className="p-3 text-xs">{row.from_addr}</td>
                          <td className="p-3">
                            <div className="max-w-xs truncate" title={row.subject}>
                              {row.subject}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex gap-1">
                              {row.extracted?.questions?.length > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  {row.extracted.questions.length} Q
                                </Badge>
                              )}
                              {row.extracted?.obligations?.length > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  {row.extracted.obligations.length} O
                                </Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-muted-foreground">
                          No email ingests found. Click "Run Ingest Now" to start processing emails.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Google Calendar Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-green-600" />
              <CardTitle>Google Calendar Integration</CardTitle>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Info className="w-3 h-3" />
                <span>Sync IR deadlines, tasks, and obligations to Google Calendar</span>
              </div>
            </div>
            <Button
              onClick={pushToCalendar}
              disabled={busyCalendar || !subId}
              variant="outline"
              className="flex items-center gap-2"
            >
              {busyCalendar ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {busyCalendar ? 'Syncing...' : 'Push to Calendar'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Configuration Info */}
            <div className="p-3 bg-green-50 rounded-lg border-l-4 border-green-500">
              <div className="flex items-start gap-2">
                <Settings className="w-4 h-4 text-green-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-green-800">Configuration Required:</p>
                  <p className="text-green-700 mt-1">
                    Set <code className="bg-green-100 px-1 rounded">GCAL_JSON</code> (service
                    account) and
                    <code className="bg-green-100 px-1 rounded ml-1">GOOGLE_CALENDAR_ID</code> in
                    Replit Secrets.
                  </p>
                </div>
              </div>
            </div>

            {/* Calendar Features */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 border rounded-lg text-center">
                <Clock className="w-6 h-6 mx-auto mb-2 text-blue-600" />
                <p className="font-medium text-sm">IR Deadlines</p>
                <p className="text-xs text-muted-foreground">30-day response tracking</p>
              </div>
              <div className="p-3 border rounded-lg text-center">
                <Database className="w-6 h-6 mx-auto mb-2 text-purple-600" />
                <p className="font-medium text-sm">Tasks & Obligations</p>
                <p className="text-xs text-muted-foreground">Project milestone sync</p>
              </div>
              <div className="p-3 border rounded-lg text-center">
                <Zap className="w-6 h-6 mx-auto mb-2 text-orange-600" />
                <p className="font-medium text-sm">Real-time Updates</p>
                <p className="text-xs text-muted-foreground">Automatic event management</p>
              </div>
            </div>

            {/* Fallback Option */}
            <div className="p-3 bg-yellow-50 rounded-lg border-l-4 border-yellow-500">
              <div className="flex items-start gap-2">
                <ExternalLink className="w-4 h-4 text-yellow-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-800">Alternative Option:</p>
                  <p className="text-yellow-700 mt-1">
                    If Google Calendar credentials aren't configured, use the{' '}
                    <strong>RPI Dashboard</strong> to download an ICS file for manual import.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            Integration Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button
              variant="outline"
              size="sm"
              className="h-auto p-3 flex flex-col items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              <span className="text-xs">Configure</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-auto p-3 flex flex-col items-center gap-2"
            >
              <Users className="w-4 h-4" />
              <span className="text-xs">Permissions</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-auto p-3 flex flex-col items-center gap-2"
            >
              <Activity className="w-4 h-4" />
              <span className="text-xs">Logs</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-auto p-3 flex flex-col items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="text-xs">Help</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
