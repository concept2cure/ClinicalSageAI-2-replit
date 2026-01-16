import React, { useState } from 'react';
import axios from 'axios';

export const IngestionStation: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'IDLE' | 'UPLOADING' | 'DONE'>('IDLE');
  const [insight, setInsight] = useState('');
  const [mode, setMode] = useState<'MANUAL' | 'AUTO'>('MANUAL');
  const [query, setQuery] = useState('');
  const [harvestStatus, setHarvestStatus] = useState('');

  const handleUpload = async () => {
    if (!file) return;
    setStatus('UPLOADING');
    const formData = new FormData();
    formData.append('report', file);

    try {
      const res = await axios.post('/api/ingest/canada/csr', formData);
      setInsight(res.data.insight || '');
      setStatus('DONE');
    } catch (e) {
      setStatus('IDLE');
      alert('Upload Failed');
    }
  };

  const triggerHarvest = async () => {
    if (!query) return;
    setHarvestStatus('CONNECTING TO OPEN DATA PORTAL...');
    try {
      const res = await axios.post('/api/ingest/canada/sync', { therapeuticArea: query });
      setHarvestStatus(`SUCCESS: ${res.data.imported} NEW DOCUMENTS INDEXED.`);
    } catch (e) {
      setHarvestStatus('CONNECTION FAILED. CHECK SERVER LOGS.');
    }
  };

  return (
    <div className="p-6 bg-slate-900 border border-slate-700 rounded-xl mt-8">
      <h3 className="text-white font-bold mb-4 flex items-center gap-2">
        <span>🇨🇦</span> Health Canada Pipeline
      </h3>

      <div className="flex gap-4 mb-4 border-b border-slate-700 pb-2">
        <button
          onClick={() => setMode('MANUAL')}
          className={mode === 'MANUAL' ? 'text-white font-bold' : 'text-slate-500'}
        >
          MANUAL UPLOAD
        </button>
        <button
          onClick={() => setMode('AUTO')}
          className={mode === 'AUTO' ? 'text-blue-400 font-bold' : 'text-slate-500'}
        >
          AUTO-HARVESTER
        </button>
      </div>

      {mode === 'AUTO' && (
        <div className="mb-6 p-4 bg-slate-950/60 border border-slate-800 rounded-lg animate-in fade-in">
          <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
            Therapeutic Area / Keyword
          </label>
          <div className="flex flex-col md:flex-row gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. Oncology, Diabetes, Pembrolizumab..."
              className="flex-1 bg-slate-900 border border-slate-700 text-white text-sm rounded-lg p-3"
            />
            <button
              onClick={triggerHarvest}
              className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded"
            >
              LAUNCH BOT
            </button>
          </div>
          <div className="mt-2 text-[10px] text-slate-500 max-w-sm">
            * Connects to Open.Canada.ca API. Downloads PDF, extracts text, and runs AI analysis automatically.
          </div>
          {harvestStatus && <div className="mt-2 text-[11px] text-emerald-400 font-mono">{harvestStatus}</div>}
        </div>
      )}

      {mode === 'MANUAL' && status === 'IDLE' && (
        <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:bg-slate-800 transition-colors">
          <label className="cursor-pointer block">
            <span className="text-2xl">📄</span>
            <div className="text-slate-400 font-bold mt-2">Upload CSR PDF</div>
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] || null)}
            />
          </label>
          {file && <div className="mt-2 text-blue-400 font-mono">{file.name}</div>}
        </div>
      )}

      {mode === 'MANUAL' && status === 'UPLOADING' && (
        <div className="p-8 text-center text-blue-400 font-mono animate-pulse">
          DIGESTING CLINICAL DATA...
        </div>
      )}

      {mode === 'MANUAL' && status === 'DONE' && (
        <div className="p-4 bg-emerald-900/30 border border-emerald-500/50 rounded">
          <div className="text-emerald-400 font-bold text-xs mb-1">ANALYSIS COMPLETE</div>
          <div className="text-white text-sm">{insight}</div>
          <button
            onClick={() => {
              setStatus('IDLE');
              setFile(null);
              setInsight('');
            }}
            className="mt-2 text-xs text-slate-500 underline"
          >
            Process Next Report
          </button>
        </div>
      )}

      {mode === 'MANUAL' && status === 'IDLE' && file && (
        <button onClick={handleUpload} className="w-full mt-4 py-2 bg-blue-600 text-white font-bold rounded">
          INGEST
        </button>
      )}
    </div>
  );
};
