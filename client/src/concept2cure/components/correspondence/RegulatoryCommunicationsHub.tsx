import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Inbox, Link2, Shield, UploadCloud } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';

type HubCorrespondence = {
  id: string;
  submissionId: string;
  subject: string;
  communicationType: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  dueDate?: string;
  summary?: string;
};

type HubIssue = {
  id: string;
  category: string;
  severity: string;
  blocker: boolean;
  confidence: number;
  humanReviewStatus: string;
  mappedCtdSections: string[];
  resolutionStatus: string;
};

interface Props {
  projectId?: string;
}

export default function RegulatoryCommunicationsHub({ projectId }: Props) {
  const [rows, setRows] = useState<HubCorrespondence[]>([]);
  const [selected, setSelected] = useState<HubCorrespondence | null>(null);
  const [issues, setIssues] = useState<HubIssue[]>([]);
  const [uploadText, setUploadText] = useState('');
  const [timeline, setTimeline] = useState<Array<{ id: string; event_type?: string; summary?: string }>>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [mailboxConnections, setMailboxConnections] = useState<Array<{ id: string; provider: string; mailbox_identifier?: string; sync_status?: string }>>([]);
  const [analytics, setAnalytics] = useState<Array<{ category: string; count: number }>>([]);

  const load = async () => {
    if (!projectId) return;
    const res = await apiRequest('GET', `/api/regulatory-correspondence/correspondence?projectId=${projectId}`);
    if (res.ok) {
      const json = await res.json();
      setRows(json.data || []);
      if (!selected && json.data?.length) setSelected(json.data[0]);
    }
  };

  useEffect(() => {
    load();
  }, [projectId]);

  useEffect(() => {
    const loadOpsMeta = async () => {
      if (!projectId) return;
      const [mailboxRes, analyticsRes] = await Promise.all([
        apiRequest('GET', '/api/regulatory-correspondence/mailbox-connections'),
        apiRequest('GET', `/api/regulatory-correspondence/analytics/deficiency-patterns?projectId=${projectId}`),
      ]);
      if (mailboxRes.ok) {
        const json = await mailboxRes.json();
        setMailboxConnections(json.data || []);
      }
      if (analyticsRes.ok) {
        const json = await analyticsRes.json();
        setAnalytics(json.data || []);
      }
    };
    loadOpsMeta();
  }, [projectId]);

  useEffect(() => {
    const loadDetail = async () => {
      if (!selected) return;
      const res = await apiRequest('GET', `/api/regulatory-correspondence/correspondence/${selected.id}`);
      if (!res.ok) return;
      const json = await res.json();
      setIssues(json.issues || []);
      const timelineRes = await apiRequest(
        'GET',
        `/api/regulatory-correspondence/timeline?submissionId=${selected.submissionId}`
      );
      if (timelineRes.ok) {
        const timelineJson = await timelineRes.json();
        setTimeline(timelineJson.data || []);
      }
    };
    loadDetail();
  }, [selected?.id]);

  const overdueCount = useMemo(
    () => rows.filter(r => r.dueDate && new Date(r.dueDate).getTime() < Date.now() && r.status !== 'closed').length,
    [rows]
  );

  const handleIntake = async () => {
    if (!projectId || !uploadText.trim()) return;
    await apiRequest('POST', '/api/regulatory-correspondence/correspondence/intake', {
      projectId: Number(projectId),
      submissionId: 'manual-submission',
      sourceChannel: 'manual_upload',
      communicationType: 'deficiency_letter',
      subject: `Manual intake ${new Date().toLocaleDateString()}`,
      parsedText: uploadText,
      summary: uploadText.slice(0, 220),
      responseRequired: true,
      urgency: 'high',
      attachments: [{ filename: 'uploaded-letter.txt', size: uploadText.length }],
    });
    setUploadText('');
    load();
  };

  const filteredRows = useMemo(
    () => rows.filter(r => (statusFilter === 'all' ? true : r.status === statusFilter)),
    [rows, statusFilter]
  );

  return (
    <div className="h-full min-h-0 grid grid-cols-12 gap-3 p-3 bg-stone-50/60">
      <section className="col-span-3 bg-white rounded-xl border border-stone-200 overflow-hidden flex flex-col">
        <div className="px-3 py-2.5 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700"><Inbox className="w-3.5 h-3.5" /> Correspondence Inbox</div>
          <span className="text-[10px] text-stone-400">{filteredRows.length} records</span>
        </div>
        <div className="px-3 py-2 border-b border-stone-100">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full text-[11px] rounded-md border border-stone-200 px-2 py-1"
          >
            <option value="all">All status</option>
            <option value="new">New</option>
            <option value="triaged">Triaged</option>
            <option value="in_progress">In Progress</option>
            <option value="responded">Responded</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div className="px-3 py-2 text-[11px] text-amber-700 bg-amber-50 border-b border-amber-100 flex items-center gap-1.5">
          <Clock3 className="w-3 h-3" /> {overdueCount} overdue responses
        </div>
        <div className="overflow-auto">
          {filteredRows.map(row => (
            <button key={row.id} onClick={() => setSelected(row)} className={`w-full text-left px-3 py-2 border-b border-stone-50 hover:bg-stone-50 ${selected?.id === row.id ? 'bg-blue-50' : ''}`}>
              <p className="text-xs font-medium text-stone-800 truncate">{row.subject}</p>
              <p className="text-[10px] text-stone-400">{row.communicationType} · {row.urgency}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="col-span-6 bg-white rounded-xl border border-stone-200 overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-stone-100">
          <p className="text-sm font-semibold text-stone-800">Correspondence Detail</p>
          <p className="text-xs text-stone-500">Immutable source, extracted issues, and response linkage in one view.</p>
        </div>
        <div className="p-4 space-y-3 overflow-auto">
          <div>
            <p className="text-xs uppercase text-stone-400">Subject</p>
            <p className="text-sm text-stone-800">{selected?.subject || 'Select correspondence'}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-stone-400 mb-1">Deficiency / Rejection Analysis</p>
            <div className="space-y-2">
              {issues.map(issue => (
                <div key={issue.id} className="border border-stone-200 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-stone-700">{issue.category}</p>
                    <span className="text-[10px] text-stone-500">{Math.round(issue.confidence * 100)}% confidence</span>
                  </div>
                  <p className="text-[11px] text-stone-500">{issue.severity} · {issue.humanReviewStatus} · {issue.resolutionStatus}</p>
                </div>
              ))}
              {!issues.length && <p className="text-xs text-stone-400">No extracted issues yet.</p>}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase text-stone-400 mb-1">Communication Timeline</p>
            <div className="space-y-1.5">
              {timeline.slice(0, 6).map(item => (
                <div key={item.id} className="text-[11px] border border-stone-200 rounded px-2 py-1.5">
                  <span className="font-medium text-stone-700">{item.event_type || 'event'}</span>
                  <p className="text-stone-500">{item.summary || 'No summary'}</p>
                </div>
              ))}
              {!timeline.length && <p className="text-xs text-stone-400">No timeline events yet.</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="col-span-3 bg-white rounded-xl border border-stone-200 overflow-hidden flex flex-col">
        <div className="px-3 py-2.5 border-b border-stone-100 text-xs font-semibold text-stone-700 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Response Workbench</div>
        <div className="p-3 space-y-2 text-xs">
          <p className="text-stone-500">Manual intake supports secure fallback when mailbox integrations are not connected.</p>
          <textarea
            value={uploadText}
            onChange={e => setUploadText(e.target.value)}
            className="w-full min-h-28 border border-stone-200 rounded-md p-2 text-xs"
            placeholder="Paste agency letter text to intake and extract structured issues..."
          />
          <Button size="sm" onClick={handleIntake} className="w-full">
            <UploadCloud className="w-3.5 h-3.5 mr-1" /> Intake Correspondence
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!selected}
            onClick={async () => {
              if (!selected) return;
              await apiRequest('POST', '/api/regulatory-correspondence/response-packages', {
                sourceCorrespondenceId: selected.id,
                projectId: Number(projectId || 0),
                title: `Response Package — ${selected.subject.slice(0, 40)}`,
                status: 'draft',
                revisedArtifactIds: [],
              });
              await load();
            }}
            className="w-full"
          >
            Create Response Package
          </Button>
          <div className="rounded-md bg-stone-50 border border-stone-200 p-2">
            <p className="text-[11px] font-medium text-stone-700 flex items-center gap-1"><Link2 className="w-3 h-3" /> Security & audit controls</p>
            <ul className="mt-1 space-y-1 text-[10px] text-stone-500">
              <li className="flex gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> parser version + extraction version tracked</li>
              <li className="flex gap-1"><AlertTriangle className="w-3 h-3 text-amber-500" /> human confirmation required for issue closure</li>
              <li className="flex gap-1"><Shield className="w-3 h-3 text-blue-500" /> attachment checksum and malware status scaffolded</li>
            </ul>
          </div>
          <div className="rounded-md bg-white border border-stone-200 p-2">
            <p className="text-[11px] font-medium text-stone-700">Mailbox / Connection Admin</p>
            <div className="mt-1 space-y-1">
              {mailboxConnections.slice(0, 3).map(conn => (
                <div key={conn.id} className="text-[10px] text-stone-500 border border-stone-100 rounded px-1.5 py-1">
                  {conn.provider} · {conn.mailbox_identifier || 'mailbox'} · {conn.sync_status || 'idle'}
                </div>
              ))}
              {!mailboxConnections.length && (
                <p className="text-[10px] text-stone-400">No mailbox connections configured.</p>
              )}
            </div>
          </div>
          <div className="rounded-md bg-white border border-stone-200 p-2">
            <p className="text-[11px] font-medium text-stone-700">Cross-project deficiency signals</p>
            <div className="mt-1 space-y-1">
              {analytics.slice(0, 4).map(item => (
                <div key={item.category} className="text-[10px] text-stone-500 flex items-center justify-between">
                  <span>{item.category}</span>
                  <span className="font-semibold text-stone-700">{item.count}</span>
                </div>
              ))}
              {!analytics.length && (
                <p className="text-[10px] text-stone-400">No extracted deficiency signals yet.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
