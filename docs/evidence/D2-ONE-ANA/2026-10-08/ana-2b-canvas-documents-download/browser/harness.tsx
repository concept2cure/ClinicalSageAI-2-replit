/* Real-browser check of the Download menu in the places it is mounted:
   the editor's toolbar (.ed-doc-actions) on the Authoring surface and in the
   conversation's canvas, and a row of the canvas's Documents list. The real
   components and the real stylesheets; the DOM chain is the one
   DocumentWorkbench / DocumentCanvas / ConversationThread render. fetch is
   stubbed so a working copy comes back as a file. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthoringCreateExport } from '@/concept2cure/v2/surfaces/AuthoringCreateExport';
import { CanvasDocumentList, type BuiltDocument } from '@/concept2cure/v2/editor/CanvasDocumentList';

declare global { interface Window { __toasts: Array<{ m: string; tone?: string }> } }
window.__toasts = [];
const fireToast = (m: string, tone?: 'ok' | 'error') => { window.__toasts.push({ m, tone }); };

window.fetch = async (input: string | URL | Request) => {
  const u = String(input);
  if (u.includes('/working-copy')) {
    return new Response(new Blob(['%PDF-1.4 working copy']), {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Clinical_Overview_working_copy.pdf"' },
    });
  }
  return new Response(JSON.stringify({ success: true, templates: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const body = Array.from({ length: 30 }, (_, i) => <p key={i}>Paragraph {i + 1} of the section body.</p>);

function Workbench() {
  return (
    <div className="ed">
      <aside className="ed-tree"><div className="ed-tree-h"><div className="ed-tree-t">Outline</div></div></aside>
      <section className="ed-doc">
        <header className="ed-doc-h">
          <div className="ed-crumbs">
            <span className="sep-first">M2</span><span className="sep" aria-hidden="true">›</span>
            <span className="doc-title">Clinical Overview</span><span className="sep" aria-hidden="true">›</span>
            <span className="here">2.5.1</span>
          </div>
          <div className="ed-doc-actions">
            <AuthoringCreateExport docId="D1" docTitle="Clinical Overview" docStatus="DRAFT" module="M2" fireToast={fireToast}
              onDocCreated={() => {}} onSectionCreated={() => {}} />
          </div>
        </header>
        <div className="ed-doc-scroll"><div className="ed-doc-inner">{body}</div></div>
      </section>
    </div>
  );
}

const rows: BuiltDocument[] = ['Clinical Overview', 'Nonclinical Overview', 'Quality Overall Summary', 'Clinical Summary', 'Nonclinical Summary', 'Introduction', 'Literature References', 'Tabulated Summaries']
  .map((title, i) => ({ id: `D${i + 1}`, title, module: 'M2', status: i % 3 === 0 ? 'DRAFT' : i % 3 === 1 ? 'IN_REVIEW' : 'FROZEN', sectionCount: 4, updatedAt: '2026-10-07T10:42:00Z', source: 'ana', conversationId: 'thread-1', programId: null }));

function Conversation({ children }: { children: React.ReactNode }) {
  return (
    <div className="ct-wrap">
      <div className="ct-thread-head"><div className="ct-head-mid"><div className="ct-head-t">Draft the 2.5 Clinical Overview</div></div></div>
      <div className="ct-main" data-canvas-open="true">
        <div className="ct-conv"><div className="ct-scroll"><div className="ct-col"><p>AnA drafted the Clinical Overview.</p></div></div></div>
        <div className="ct-canvas-pane" data-state="open">{children}</div>
      </div>
    </div>
  );
}

function App() {
  const mode = location.hash.slice(1) || 'authoring';
  if (mode === 'authoring') return <Workbench />;
  if (mode === 'canvas') {
    return (
      <Conversation>
        <div className="dcv-expanded" data-beside="true" data-testid="dc-expanded">
          <div className="dcv-bar"><button type="button" className="ed-back">Back to conversation</button><span className="dcv-bar-t">Clinical Overview</span></div>
          <div className="dcv-workbench"><Workbench /></div>
        </div>
      </Conversation>
    );
  }
  return (
    <Conversation>
      <CanvasDocumentList scope="conversation" onScope={() => {}} projectName="ONC-221" projectAvailable read={{ state: 'ready', rows }}
        onRetry={() => {}} onOpen={() => {}} onClose={() => {}} fireToast={fireToast} focus={null} onFocused={() => {}} />
    </Conversation>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
