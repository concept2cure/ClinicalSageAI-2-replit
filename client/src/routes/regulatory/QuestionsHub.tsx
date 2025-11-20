import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Mail, Upload, FileText, Brain, CheckCircle, AlertTriangle, Calendar } from 'lucide-react';

export default function QuestionsHub({ subId }: { subId: string }) {
  const [questions, setQuestions] = React.useState<any[]>([]);
  const [responses, setResponses] = React.useState<any[]>([]);
  const [showIngest, setShowIngest] = React.useState(false);
  const [emailData, setEmailData] = React.useState({
    subject: '',
    from: '',
    to: '',
    body: '',
  });

  async function loadQuestions() {
    const r = await fetch(`/api/reg/submissions/${subId}/questions`).then(r => r.json());
    setQuestions(r);
  }

  React.useEffect(() => {
    loadQuestions();
  }, [subId]);

  async function ingestEmail() {
    await fetch(`/api/reg/submissions/${subId}/questions/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailData),
    });
    setEmailData({ subject: '', from: '', to: '', body: '' });
    setShowIngest(false);
    loadQuestions();
  }

  async function draftResponse(questionId: string, tone: string = 'Neutral') {
    const r = await fetch(`/api/reg/questions/${questionId}/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tone }),
    });
    const result = await r.json();
    // Refresh questions to show linked responses
    loadQuestions();
    return result;
  }

  async function approveResponse(responseId: string) {
    await fetch(`/api/reg/responses/${responseId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'Regulatory Lead' }),
    });
    loadQuestions();
  }

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <Badge variant="destructive">Critical</Badge>;
      case 'MAJOR':
        return <Badge className="bg-orange-500">Major</Badge>;
      case 'MINOR':
        return <Badge variant="secondary">Minor</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getRegionBadge = (region: string) => {
    const colors: Record<string, string> = {
      FDA: 'bg-blue-600',
      EMA: 'bg-green-600',
      PMDA: 'bg-purple-600',
      HC: 'bg-red-600',
      MHRA: 'bg-gray-600',
    };
    return <Badge className={colors[region] || 'bg-gray-500'}>{region}</Badge>;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'No due date';
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="space-y-6" data-testid="questions-hub">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-semibold">Questions Hub</h3>
          <p className="text-gray-600">
            IR/Deficiency letter management with AI-assisted responses
          </p>
        </div>
        <Button onClick={() => setShowIngest(!showIngest)} data-testid="ingest-email-btn">
          <Mail className="w-4 h-4 mr-2" />
          Ingest Email
        </Button>
      </div>

      {/* Email Ingest Panel */}
      {showIngest && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Ingest IR/Deficiency Letter
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Subject</label>
                <Input
                  value={emailData.subject}
                  onChange={e => setEmailData({ ...emailData, subject: e.target.value })}
                  placeholder="IR Letter Subject"
                  data-testid="email-subject-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">From (Agency)</label>
                <Input
                  value={emailData.from}
                  onChange={e => setEmailData({ ...emailData, from: e.target.value })}
                  placeholder="FDA@fda.gov"
                  data-testid="email-from-input"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">To</label>
              <Input
                value={emailData.to}
                onChange={e => setEmailData({ ...emailData, to: e.target.value })}
                placeholder="regulatory@company.com"
                data-testid="email-to-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Email Body</label>
              <Textarea
                value={emailData.body}
                onChange={e => setEmailData({ ...emailData, body: e.target.value })}
                placeholder="Paste the full IR letter content here..."
                rows={8}
                data-testid="email-body-textarea"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={ingestEmail}
                disabled={!emailData.body}
                data-testid="submit-ingest-btn"
              >
                Ingest & Extract Questions
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowIngest(false)}
                data-testid="cancel-ingest-btn"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Questions List */}
      <div className="grid grid-cols-1 gap-4">
        {questions.map(question => (
          <Card key={question.q_id} data-testid={`question-${question.q_id}`}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4" />
                    <span className="text-sm text-gray-600">
                      {question.src_subject || 'Direct Question'}
                    </span>
                    {question.region && getRegionBadge(question.region)}
                    {getSeverityBadge(question.severity)}
                  </div>
                  <CardTitle className="text-base leading-relaxed">{question.text}</CardTitle>
                </div>
                <div className="flex flex-col gap-2 text-sm text-gray-600">
                  {question.due_date && (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Due: {formatDate(question.due_date)}
                    </div>
                  )}
                  <Badge variant="outline">{question.status}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {question.section_suggest && (
                  <div>
                    <span className="text-sm font-medium">Suggested Section: </span>
                    <Badge variant="secondary">{question.section_suggest}</Badge>
                  </div>
                )}

                {/* AI Response Draft Actions */}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    onClick={() => draftResponse(question.q_id, 'FDA')}
                    data-testid={`draft-fda-${question.q_id}`}
                  >
                    <Brain className="w-3 h-3 mr-1" />
                    Draft FDA Response
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => draftResponse(question.q_id, 'EMA')}
                    data-testid={`draft-ema-${question.q_id}`}
                  >
                    <Brain className="w-3 h-3 mr-1" />
                    Draft EMA Response
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => draftResponse(question.q_id, 'Neutral')}
                    data-testid={`draft-neutral-${question.q_id}`}
                  >
                    <Brain className="w-3 h-3 mr-1" />
                    Draft Response
                  </Button>
                </div>

                {question.priority === 'High' && (
                  <div className="flex items-center gap-2 text-orange-600 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    High priority - requires immediate attention
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {questions.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <Mail className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600">
              No questions ingested yet. Click "Ingest Email" to extract questions from IR letters.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
