import React, { useState } from 'react';
import { HunterCommandCenter } from '../components/admin/HunterCommandCenter';
import { IngestionStation } from '../components/admin/IngestionStation';
import { SystemStatusPanel } from '../components/admin/SystemStatusPanel';

export const LumenCortexPage = () => {
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'INGESTION' | 'ADMIN'>('DASHBOARD');

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-blue-500/30">
      <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]"></div>
          <h1 className="font-black tracking-widest text-lg uppercase">
            Lumen Cortex <span className="text-slate-600">v2.1</span>
          </h1>
        </div>

        <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
          <TabButton
            label="COMMAND CENTER"
            active={activeTab === 'DASHBOARD'}
            onClick={() => setActiveTab('DASHBOARD')}
            icon="⚡"
          />
          <TabButton
            label="INGESTION PIPELINE"
            active={activeTab === 'INGESTION'}
            onClick={() => setActiveTab('INGESTION')}
            icon="📥"
          />
          <TabButton
            label="SYSTEM ADMIN"
            active={activeTab === 'ADMIN'}
            onClick={() => setActiveTab('ADMIN')}
            icon="⚙️"
          />
        </div>

        <div className="text-xs text-slate-500 font-mono">SECURE CONNECTION</div>
      </header>

      <main className="p-6">
        {activeTab === 'DASHBOARD' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <HunterCommandCenter />
          </div>
        )}

        {activeTab === 'INGESTION' && (
          <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-bold mb-2">Knowledge Acquisition</h2>
              <p className="text-slate-400">Automated Harvester & Document Ingestion</p>
            </div>
            <IngestionStation />
          </div>
        )}

        {activeTab === 'ADMIN' && (
          <div className="p-8 border border-slate-800 rounded-xl bg-slate-900/50">
            <h3 className="text-xl font-bold mb-4 text-slate-400">System Internals</h3>
            <p className="text-sm text-slate-500 mb-8">
              Manage vector embeddings, user permissions, and raw audit logs.
            </p>
            <div className="opacity-50 pointer-events-none filter grayscale">
              <div className="p-4 border border-red-900/30 bg-red-900/10 rounded text-red-400 text-xs">
                EMBEDDING ENGINE OFFLINE (Mock)
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 w-full z-40">
        <SystemStatusPanel />
      </footer>
    </div>
  );
};

const TabButton = ({ label, active, onClick, icon }: any) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
      active
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
        : 'text-slate-400 hover:text-white hover:bg-slate-800'
    }`}
  >
    <span>{icon}</span>
    {label}
  </button>
);

export default LumenCortexPage;
