import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function NotificationLogViewer() {
  const [logs, setLogs] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [protocolFilter, setProtocolFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');

  const exportToCSV = () => {
    const headers = ['timestamp', 'protocol_id', 'email_sent_to', 'report_link', 'slack_sent'];
    const rows = filtered.map(log => [
      new Date(log.timestamp).toISOString(),
      log.protocol_id || '',
      log.email_sent_to || '',
      log.report_link || '',
      log.slack_sent ? 'Yes' : 'No',
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(val => `"${val}"`).join(','))].join(
      '\n'
    );
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notification_logs_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/notifications/logs');
        const data = await res.json();
        setLogs(data.reverse());
        setFiltered(data.reverse());
      } catch (error) {
        console.error('Error fetching notification logs:', error);
      }
    };
    fetchLogs();
  }, []);

  useEffect(() => {
    const result = logs.filter(log => {
      return (
        (protocolFilter === '' ||
          (log.protocol_id &&
            log.protocol_id.toLowerCase().includes(protocolFilter.toLowerCase()))) &&
        (emailFilter === '' ||
          (log.email_sent_to &&
            log.email_sent_to.toLowerCase().includes(emailFilter.toLowerCase())))
      );
    });
    setFiltered(result);
  }, [protocolFilter, emailFilter, logs]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <h2 className="text-xl font-bold text-blue-800">📬 Notification Log</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4">
        <Input
          placeholder="Filter by Protocol ID"
          value={protocolFilter}
          onChange={e => setProtocolFilter(e.target.value)}
        />
        <Input
          placeholder="Filter by Email"
          value={emailFilter}
          onChange={e => setEmailFilter(e.target.value)}
        />
      </div>

      <div className="flex justify-end mb-4">
        <Button
          onClick={exportToCSV}
          className="bg-blue-800 text-white hover:bg-blue-700"
          disabled={filtered.length === 0}
        >
          📥 Export Filtered Logs to CSV
        </Button>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-gray-500 italic">No matching notifications found.</p>
      )}

      {filtered.map((log, idx) => (
        <Card key={idx} className="mb-4">
          <CardContent className="space-y-1 text-sm p-4">
            <p>
              <strong>📄 Protocol:</strong> {log.protocol_id}
            </p>
            <p>
              <strong>🕒 Sent:</strong> {new Date(log.timestamp).toLocaleString()}
            </p>
            <p>
              <strong>📧 Email:</strong> {log.email_sent_to}
            </p>
            <p>
              <strong>🔗 Report:</strong>{' '}
              <a
                href={log.report_link}
                className="text-blue-600"
                target="_blank"
                rel="noopener noreferrer"
              >
                Download
              </a>
            </p>
            <p>
              <strong>💬 Slack:</strong> {log.slack_sent ? '✅ Sent' : '❌ Not Sent'}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
