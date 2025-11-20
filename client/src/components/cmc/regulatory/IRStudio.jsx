import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  HelpCircle,
  Download,
  Send,
  Edit3,
  Clock,
  CheckCircle,
  AlertCircle,
  FileText,
  Plus,
  Loader2,
  MessageSquare,
  Calendar,
  Flag,
  User,
  History,
  ArrowRight,
} from 'lucide-react';

export default function IRStudio({ submissionId }) {
  const [rows, setRows] = React.useState([]);
  const [title, setTitle] = React.useState('');
  const [sec, setSec] = React.useState('');
  const [due, setDue] = React.useState('');
  const [txt, setTxt] = React.useState('');
  const [priority, setPriority] = React.useState('High');
  const [selected, setSelected] = React.useState(null);
  const [finalMd, setFinalMd] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [events, setEvents] = React.useState([]);
  const [showEvents, setShowEvents] = React.useState(false);

  async function load() {
    if (!submissionId) return;
    try {
      const r = await fetch(`/api/cmc/regulatory/submissions/${submissionId}/questions`);
      const data = await r.json();
      setRows(data);
    } catch (error) {
      console.error('Failed to load questions:', error);
    }
  }

  React.useEffect(() => {
    if (submissionId) load();
  }, [submissionId]);

  async function createQ() {
    if (!title.trim()) {
      alert('Please enter a question title');
      return;
    }

    try {
      const r = await fetch(`/api/cmc/regulatory/submissions/${submissionId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          sec_code: sec,
          question_text: txt,
          due_date: due || null,
          priority,
        }),
      });

      if (!r.ok) {
        const error = await r.json();
        throw new Error(error.error || 'Create failed');
      }

      setTitle('');
      setSec('');
      setDue('');
      setTxt('');
      setPriority('High');
      load();
    } catch (error) {
      alert(`Create failed: ${error.message}`);
    }
  }

  async function aiDraft(q) {
    setBusy(true);
    try {
      const r = await fetch(`/api/cmc/regulatory/questions/${q.q_id}/ai-draft`, {
        method: 'POST',
      });
      const data = await r.json();

      if (!data.ok) {
        throw new Error(data.error || 'AI draft failed');
      }

      setSelected(data.question);
      setFinalMd(data.ai_draft_md || '');
    } catch (error) {
      alert(`AI draft failed: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveFinal() {
    if (!selected) return;

    try {
      const r = await fetch(`/api/cmc/regulatory/questions/${selected.q_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          final_md: finalMd,
          status: 'IN_REVIEW',
        }),
      });

      if (!r.ok) {
        const error = await r.json();
        throw new Error(error.error || 'Save failed');
      }

      load();
      alert('Saved successfully');
    } catch (error) {
      alert(`Save failed: ${error.message}`);
    }
  }

  async function submit(q) {
    if (!confirm('Submit this IR response? This action cannot be undone.')) return;

    try {
      const r = await fetch(`/api/cmc/regulatory/questions/${q.q_id}/submit`, {
        method: 'POST',
      });

      if (!r.ok) {
        const error = await r.json();
        throw new Error(error.error || 'Submit failed');
      }

      load();
      alert('Successfully submitted');
    } catch (error) {
      alert(`Submit failed: ${error.message}`);
    }
  }

  async function pack() {
    try {
      const res = await fetch(`/api/cmc/regulatory/submissions/${submissionId}/questions/pack`, {
        method: 'POST',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Pack failed');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ir_responses_${submissionId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert(`Package failed: ${error.message}`);
    }
  }

  async function loadEvents(qId) {
    try {
      const r = await fetch(`/api/cmc/regulatory/questions/${qId}/events`);
      const data = await r.json();
      setEvents(data);
      setShowEvents(true);
    } catch (error) {
      console.error('Failed to load events:', error);
    }
  }

  const getStatusIcon = status => {
    switch (status) {
      case 'OPEN':
        return <HelpCircle className="w-4 h-4 text-blue-500" />;
      case 'DRAFTED':
        return <Edit3 className="w-4 h-4 text-orange-500" />;
      case 'IN_REVIEW':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'CLOSED':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = status => {
    switch (status) {
      case 'OPEN':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'DRAFTED':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'IN_REVIEW':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'CLOSED':
        return 'bg-green-50 text-green-700 border-green-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getPriorityColor = priority => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (!submissionId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p>Select a submission to manage Information Requests</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-6 h-6 text-blue-600" />
              <div>
                <CardTitle>Questions / IR Studio</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Manage regulatory information requests with AI-powered drafting
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={pack} variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export ZIP
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Create New Question */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Create New Question
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Question title"
              />
            </div>
            <div>
              <Label htmlFor="section">Section Code</Label>
              <Input
                id="section"
                value={sec}
                onChange={e => setSec(e.target.value)}
                placeholder="e.g. 3.2.P.5"
              />
            </div>
            <div>
              <Label htmlFor="due">Due Date</Label>
              <Input id="due" type="date" value={due} onChange={e => setDue(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mb-4">
            <Label htmlFor="question">Question Text</Label>
            <Textarea
              id="question"
              value={txt}
              onChange={e => setTxt(e.target.value)}
              placeholder="Enter the regulatory question or information request..."
              rows={3}
            />
          </div>
          <Button onClick={createQ} disabled={!title.trim()}>
            <Plus className="w-4 h-4 mr-2" />
            Create Question
          </Button>
        </CardContent>
      </Card>

      {/* Questions List */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Questions ({rows.length})</h3>

        {rows.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-muted-foreground">No questions created yet</p>
              <p className="text-sm text-muted-foreground mt-2">
                Create your first regulatory question above
              </p>
            </CardContent>
          </Card>
        ) : (
          rows.map(q => (
            <Card key={q.q_id} className={`border-2 ${getStatusColor(q.status)}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusIcon(q.status)}
                      <h4 className="font-semibold">{q.title || 'Untitled Question'}</h4>
                      <Badge variant="outline" className={getPriorityColor(q.priority)}>
                        {q.priority || 'Medium'}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground mb-3">
                      {q.sec_code && (
                        <div className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          Section: {q.sec_code}
                        </div>
                      )}
                      {q.due_date && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Due: {new Date(q.due_date).toLocaleDateString()}
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Created: {new Date(q.created_at).toLocaleDateString()}
                      </div>
                    </div>

                    {q.text && (
                      <p className="text-sm mb-3 text-gray-700 bg-gray-50 p-2 rounded">
                        {q.text.slice(0, 200)}
                        {q.text.length > 200 ? '...' : ''}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <Button size="sm" variant="outline" onClick={() => loadEvents(q.q_id)}>
                      <History className="w-3 h-3 mr-1" />
                      Events
                    </Button>

                    {q.status === 'OPEN' && (
                      <Button size="sm" onClick={() => aiDraft(q)} disabled={busy}>
                        {busy ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Edit3 className="w-3 h-3 mr-1" />
                        )}
                        AI Draft
                      </Button>
                    )}

                    {(q.status === 'DRAFTED' || q.status === 'IN_REVIEW') && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelected(q);
                            setFinalMd(q.final_md || q.ai_draft_md || '');
                          }}
                        >
                          <Edit3 className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button size="sm" onClick={() => submit(q)}>
                          <Send className="w-3 h-3 mr-1" />
                          Submit
                        </Button>
                      </>
                    )}

                    {q.status === 'CLOSED' && (
                      <Badge className="bg-green-600">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Submitted
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))
        )}
      </div>

      {/* Editor Modal */}
      {selected && (
        <Card className="border-2 border-blue-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Edit Response: {selected.title}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                ×
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Label htmlFor="response">Response Content (Markdown)</Label>
              <Textarea
                id="response"
                value={finalMd}
                onChange={e => setFinalMd(e.target.value)}
                rows={15}
                className="font-mono"
                placeholder="Enter your response in Markdown format..."
              />
              <div className="flex items-center gap-2">
                <Button onClick={saveFinal}>
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Save Response
                </Button>
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Events Modal */}
      {showEvents && (
        <Card className="border-2 border-purple-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Question Events</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowEvents(false)}>
                ×
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {events.length === 0 ? (
                <p className="text-muted-foreground">No events recorded</p>
              ) : (
                events.map(event => (
                  <div
                    key={event.event_id}
                    className="flex items-center gap-2 p-2 bg-gray-50 rounded"
                  >
                    <User className="w-3 h-3 text-gray-500" />
                    <span className="text-sm">{event.action}</span>
                    <span className="text-xs text-muted-foreground">by {event.by_user}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(event.created_at).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
