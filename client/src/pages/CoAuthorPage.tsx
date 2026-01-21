import React, { useEffect, useState } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { CheckCircle, Loader, CloudOff } from 'lucide-react';
import { Sidebar } from '../components/layout/Sidebar';
import { CortexCompanion } from '../components/layout/CortexCompanion';
import { ECTDNavigator } from '../components/coauthor/ECTDNavigator';

interface StructuredDraft {
  title: string;
  regulatory_code: string;
  content_body: string;
  key_claims: string[];
  risk_assessment: string;
}

interface DraftResponse {
  found: boolean;
  content: string;
  metadata?: {
    lastUpdated?: string | null;
    author?: string | null;
  };
}

export const CoAuthorPage = () => {
  const [activeDoc, setActiveDoc] = useState<string>('2.1');
  const [editorContent, setEditorContent] = useState<string>('');
  const [sidebarMode, setSidebarMode] = useState<'FULL' | 'SIDE' | 'MINI'>('SIDE');
  const [saveStatus, setSaveStatus] = useState<'SAVED' | 'SAVING' | 'ERROR'>('SAVED');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const handleAIInjection = (draftData: StructuredDraft | null) => {
    if (!draftData) return;
    const htmlInjection = `
      <h2>${draftData.title}</h2>
      <p><strong>Regulatory Code:</strong> <span style="color:blue">${draftData.regulatory_code}</span></p>
      <hr/>
      <p>${draftData.content_body}</p>
      <h3>Key Claims</h3>
      <ul>
        ${draftData.key_claims?.map((c: string) => `<li>${c}</li>`).join('') || ''}
      </ul>
      <div style="background-color: #f0fdf4; padding: 10px; border: 1px solid #16a34a; border-radius: 5px; margin-top: 10px;">
        <strong>Risk Assessment:</strong> ${draftData.risk_assessment}
      </div>
    `;

    setEditorContent(prev => prev + htmlInjection);
  };

  const getAuthToken = () => {
    return localStorage.getItem('accessToken') || localStorage.getItem('token');
  };

  const getOrganizationId = () => {
    return (
      localStorage.getItem('organizationId') ||
      localStorage.getItem('selectedOrganizationId') ||
      ''
    );
  };

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const loadDraft = async () => {
      setSaveStatus('SAVING');
      try {
        const token = getAuthToken();
        const organizationId = getOrganizationId();
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        if (organizationId) headers['x-organization-id'] = organizationId;

        const res = await fetch(`/api/drafts/${activeDoc}`, {
          headers,
          signal: controller.signal,
        });
        const data: DraftResponse = await res.json();
        if (isMounted) {
          setEditorContent(data.content || '');
          setSaveStatus('SAVED');
          if (data.metadata?.lastUpdated) setLastSaved(new Date(data.metadata.lastUpdated));
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError' && isMounted) {
          console.error(error);
          setSaveStatus('ERROR');
        }
      }
    };

    loadDraft();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [activeDoc]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setSaveStatus('SAVING');
      try {
        const token = getAuthToken();
        const organizationId = getOrganizationId();
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        if (organizationId) headers['x-organization-id'] = organizationId;

        await fetch(`/api/drafts/${activeDoc}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ content: editorContent }),
        });
        setSaveStatus('SAVED');
        setLastSaved(new Date());
      } catch (error) {
        console.error(error);
        setSaveStatus('ERROR');
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [editorContent, activeDoc]);

  return (
    <div className="flex h-screen w-screen bg-slate-100 overflow-hidden">
      <Sidebar />

      <ECTDNavigator activeDoc={activeDoc} onSelect={setActiveDoc} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-6">
          <div className="text-sm font-bold text-slate-800">
            Editing: <span className="text-blue-600">Module {activeDoc}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-mono">
              {saveStatus === 'SAVING' && (
                <span className="flex items-center gap-1 text-blue-500">
                  <Loader size={12} className="animate-spin" /> SAVING...
                </span>
              )}
              {saveStatus === 'SAVED' && (
                <span className="flex items-center gap-1 text-emerald-500">
                  <CheckCircle size={12} /> SAVED{' '}
                  {lastSaved ? lastSaved.toLocaleTimeString() : ''}
                </span>
              )}
              {saveStatus === 'ERROR' && (
                <span className="flex items-center gap-1 text-red-500">
                  <CloudOff size={12} /> SAVE FAILED
                </span>
              )}
            </span>
          </div>
        </header>
        <div className="flex-1 overflow-hidden p-8 bg-slate-100">
          <div className="bg-white h-full shadow-sm border border-slate-200 rounded-lg flex flex-col">
            <ReactQuill
              theme="snow"
              value={editorContent}
              onChange={setEditorContent}
              className="flex-1 flex flex-col"
              modules={{
                toolbar: [
                  ['bold', 'italic', 'underline'],
                  [{ header: 1 }, { header: 2 }],
                  ['list', 'bullet'],
                ],
              }}
            />
          </div>
        </div>
      </div>

      <CortexCompanion
        width={sidebarMode}
        onToggle={setSidebarMode}
        contextData={`Active Section: ${activeDoc}. Current content length: ${editorContent.length} chars.`}
        onDraftInject={handleAIInjection}
      />
    </div>
  );
};

export default CoAuthorPage;
