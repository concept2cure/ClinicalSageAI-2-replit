import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { getAuthHeaders } from '@/utils/authToken';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Database, Upload, MessageSquareText, Loader2, FileText, Paperclip } from 'lucide-react';

interface AskSource {
  docTitle?: string;
  excerpt?: string;
  relevanceScore?: number;
}

interface AskResponse {
  answer?: string;
  sources?: AskSource[];
}

interface IndEvidenceAskPanelProps {
  projectId?: string;
  sectionCode?: string;
  sectionTitle?: string;
}

interface ProjectIntelDocument {
  id?: string;
  fileName?: string;
  originalName?: string;
  title?: string;
  createdAt?: string;
}

export function IndEvidenceAskPanel({
  projectId,
  sectionCode,
  sectionTitle,
}: IndEvidenceAskPanelProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<AskSource[]>([]);
  const [asking, setAsking] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [addingEvidence, setAddingEvidence] = useState(false);
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceExcerpt, setEvidenceExcerpt] = useState('');
  const [projectDocs, setProjectDocs] = useState<ProjectIntelDocument[]>([]);

  const canAsk = useMemo(() => question.trim().length >= 3 && !!projectId, [question, projectId]);
  const suggestedQuestions = useMemo(
    () => [
      sectionCode
        ? `What key evidence gaps remain for IND section ${sectionCode} (${sectionTitle || 'current section'})?`
        : 'What are the highest-risk evidence gaps in this IND project?',
      sectionCode
        ? `Summarize strongest source-backed claims for ${sectionCode}.`
        : 'Which uploaded project documents best support this IND package?',
      'What should I draft next to improve IND readiness?',
    ],
    [sectionCode, sectionTitle]
  );

  const loadProjectDocs = async () => {
    if (!projectId) return;
    try {
      const res = await apiRequest(
        'GET',
        `/api/client-intelligence/project/${projectId}/documents`
      );
      const json = await res.json();
      setProjectDocs(json.documents || []);
    } catch {
      setProjectDocs([]);
    }
  };

  useEffect(() => {
    loadProjectDocs();
  }, [projectId]);

  const askEvidence = async () => {
    if (!canAsk) return;
    setAsking(true);
    try {
      const res = await apiRequest('POST', '/api/evidence/ask', {
        question: question.trim(),
        projectId,
        context:
          projectDocs.length > 0
            ? `Prefer these project documents when answering: ${projectDocs
                .slice(0, 8)
                .map(d => d.fileName || d.originalName || d.title)
                .filter(Boolean)
                .join(', ')}`
            : undefined,
      });
      const json = await res.json();
      const payload: AskResponse = json.data || json;
      setAnswer(payload.answer || 'No answer returned.');
      setSources(payload.sources || []);
    } catch {
      setAnswer('Evidence Q&A is temporarily unavailable.');
      setSources([]);
    } finally {
      setAsking(false);
    }
  };

  const uploadDocument = async (file?: File | null) => {
    if (!projectId || !file) return;
    setUploadingDocument(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const uploadHeaders = getAuthHeaders();
      delete uploadHeaders['Content-Type']; // let browser set multipart boundary
      await fetch(`/api/client-intelligence/project/${projectId}/documents/upload`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
        headers: uploadHeaders,
      });
      await loadProjectDocs();
    } finally {
      setUploadingDocument(false);
    }
  };

  const addEvidence = async () => {
    if (!projectId || !evidenceTitle.trim() || !evidenceExcerpt.trim()) return;
    setAddingEvidence(true);
    try {
      await apiRequest('POST', '/api/evidence', {
        title: evidenceTitle.trim(),
        description: `Project ${projectId} evidence note`,
        evidenceType: 'clinical_data',
        evidenceCategory: 'clinical',
        sourceType: 'internal',
        sourceReference: `project:${projectId}`,
        sourceCitation: `Project ${projectId}`,
        excerpt: evidenceExcerpt.trim(),
        tags: ['ind', 'workspace', 'evidence-note'],
      });
      setEvidenceTitle('');
      setEvidenceExcerpt('');
    } finally {
      setAddingEvidence(false);
    }
  };

  return (
    <div
      className="rounded-lg border border-stone-200 bg-stone-100/40 p-3 space-y-3"
      data-testid="ind-evidence-ask-panel"
    >
      <div className="flex items-center gap-2">
        <Database className="w-4 h-4 text-stone-700" />
        <h3 className="text-sm font-semibold text-stone-900">Evidence & Ask</h3>
        <Badge variant="outline" className="ml-auto text-[10px] border-stone-200 text-stone-700">
          Grounded answers
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-xs font-medium text-stone-900">Add evidence note</label>
          <Input
            value={evidenceTitle}
            onChange={e => setEvidenceTitle(e.target.value)}
            placeholder="Evidence title"
            className="bg-white"
          />
          <Input
            value={evidenceExcerpt}
            onChange={e => setEvidenceExcerpt(e.target.value)}
            placeholder="Key excerpt from source document"
            className="bg-white"
          />
          <Button
            size="sm"
            variant="outline"
            className="border-stone-300 text-stone-700"
            onClick={addEvidence}
            disabled={addingEvidence || !evidenceTitle.trim() || !evidenceExcerpt.trim()}
          >
            {addingEvidence ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Upload className="w-3 h-3 mr-1" />
            )}
            Save evidence
          </Button>
          <label className="inline-flex items-center text-xs text-stone-700 gap-1 cursor-pointer">
            <Paperclip className="w-3 h-3" />
            <span>{uploadingDocument ? 'Uploading...' : 'Upload document'}</span>
            <input
              type="file"
              className="hidden"
              onChange={e => uploadDocument(e.target.files?.[0])}
              disabled={uploadingDocument}
            />
          </label>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-stone-900">Ask over project evidence</label>
          <div className="flex flex-wrap gap-1">
            {suggestedQuestions.map(sq => (
              <button
                key={sq}
                type="button"
                onClick={() => setQuestion(sq)}
                className="rounded border border-stone-200 bg-white px-2 py-1 text-[10px] text-stone-700 hover:bg-stone-100"
              >
                {sq}
              </button>
            ))}
          </div>
          <Input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="What supports dosing rationale in this IND?"
            className="bg-white"
          />
          <Button size="sm" onClick={askEvidence} disabled={!canAsk || asking}>
            {asking ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <MessageSquareText className="w-3 h-3 mr-1" />
            )}
            Ask evidence
          </Button>
          {answer && (
            <div className="rounded border border-stone-100 bg-white p-2">
              <p className="text-xs text-zinc-800 whitespace-pre-wrap">{answer}</p>
            </div>
          )}
        </div>
      </div>

      {sources.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-stone-900">Sources</div>
          {sources.slice(0, 3).map((source, idx) => (
            <div
              key={`${source.docTitle || 'source'}-${idx}`}
              className="rounded border border-stone-100 bg-white p-2"
            >
              <div className="flex items-center gap-1 text-xs font-medium text-zinc-800">
                <FileText className="w-3 h-3" />
                {source.docTitle || `Source ${idx + 1}`}
              </div>
              {source.excerpt && (
                <p className="text-[11px] text-zinc-600 mt-1 line-clamp-2">{source.excerpt}</p>
              )}
            </div>
          ))}
        </div>
      )}
      {projectDocs.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-stone-900">Project documents</div>
          <div className="flex flex-wrap gap-1">
            {projectDocs.slice(0, 6).map((doc, idx) => (
              <Badge
                key={`${doc.id || doc.fileName || idx}`}
                variant="outline"
                className="text-[10px]"
              >
                {doc.fileName || doc.originalName || doc.title || `Document ${idx + 1}`}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default IndEvidenceAskPanel;
