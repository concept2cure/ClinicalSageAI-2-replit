import React, { useEffect, useState } from 'react';
import axios from 'axios';

type ComparatorProps = {
  ids: number[];
  onClose: () => void;
};

export const SynapseComparator: React.FC<ComparatorProps> = ({ ids, onClose }) => {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!ids.length) return;
    axios.post('/api/lumen/synapse/compare', { ids }).then(res => setData(res.data));
  }, [ids]);

  if (!data)
    return (
      <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center text-white animate-pulse">
        BUILDING STRATEGIC MATRIX...
      </div>
    );

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-md flex flex-col animate-in fade-in duration-300">
      <div className="h-20 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-900">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <div>
            <h2 className="text-xl font-bold text-white tracking-wide">
              SYNAPSE <span className="text-blue-500">COHORT VIEW</span>
            </h2>
            <div className="text-xs text-slate-500 font-mono">Comparing {data.cohort_size} Assets</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded border border-slate-700 transition-all"
        >
          EXIT COMPARISON
        </button>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto p-8">
        <div className="inline-flex gap-6">
          <div className="w-48 pt-24 space-y-12 text-right font-bold text-slate-500 text-xs uppercase tracking-widest sticky left-0">
            <div className="h-8">Study Phase</div>
            <div className="h-8">Design Type</div>
            <div className="h-8">Randomized N</div>
            <div className="h-8 text-orange-500">AE Rate (Any)</div>
            <div className="h-8 text-red-500">SAE Rate (Serious)</div>
            <div className="h-8">Discontinuation</div>
            <div className="h-8">Confidence</div>
          </div>

          {data.studies.map((study: any, i: number) => (
            <div
              key={i}
              className="w-80 flex-shrink-0 bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden hover:border-blue-500/50 transition-all"
            >
              <div className="h-24 p-6 bg-slate-800/50 border-b border-slate-700">
                <div className="text-xs text-blue-400 font-mono mb-1">{study.study_id}</div>
                <div className="font-bold text-white truncate text-lg" title={study.drug_name}>
                  {study.drug_name}
                </div>
              </div>

              <div className="p-6 space-y-12 text-center">
                <div className="h-8 font-mono text-white flex items-center justify-center bg-slate-800 rounded">
                  {study.design?.phase || '-'}
                </div>
                <div className="h-8 text-sm text-slate-300 flex items-center justify-center">
                  {study.design?.type || '-'}
                </div>
                <div className="h-8 font-black text-2xl text-white">{study.enrollment?.randomized_n || 0}</div>

                <div className="h-8 font-bold text-orange-400 text-xl">
                  {study.safety_summary?.any_ae_percent || 0}%
                </div>
                <div className="h-8 font-bold text-red-400 text-xl">
                  {study.safety_summary?.any_sae_percent || 0}%
                </div>
                <div className="h-8 font-bold text-slate-400 text-lg">
                  {study.safety_summary?.discontinuation_percent || 0}%
                </div>

                <div className="h-8 text-xs font-mono text-emerald-500 pt-2">
                  {study.extraction_confidence_score
                    ? `${(study.extraction_confidence_score * 100).toFixed(0)}% MATCH`
                    : '—'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
