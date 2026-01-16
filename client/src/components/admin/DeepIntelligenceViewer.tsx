import React, { useEffect, useState } from 'react';
import axios from 'axios';
import type { DeepCSRData } from '@shared/types/deep-csr';

type ViewerProps = {
  assetId: string | number;
  onClose: () => void;
};

type IntelligenceResponse = {
  csr_id: number;
  drug_name: string | null;
  study_id: string | null;
  regulatory_agency: string;
  deep_data: DeepCSRData;
  extraction_confidence_score: number | null;
  created_at: string;
};

export const DeepIntelligenceViewer: React.FC<ViewerProps> = ({ assetId, onClose }) => {
  const [data, setData] = useState<IntelligenceResponse | null>(null);
  const [tab, setTab] = useState<'PROTOCOL' | 'SAFETY' | 'POPULATION' | 'RAW'>('PROTOCOL');

  useEffect(() => {
    axios.get(`/api/vault/intelligence/${assetId}`).then(res => {
      const payload = res.data?.data ?? res.data;
      setData(payload);
    });
  }, [assetId]);

  if (!data)
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center text-white font-mono animate-pulse">
        ACCESSING DEEP INTELLIGENCE...
      </div>
    );

  const intel = data.deep_data;
  const confidence = data.extraction_confidence_score
    ? `${Math.round(data.extraction_confidence_score * 100)}%`
    : '—';

  return (
    <div className="fixed inset-0 z-[100] bg-[#0f172a]/95 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-7xl h-full max-h-[92vh] rounded-xl overflow-hidden shadow-2xl flex flex-col border border-slate-700">
        <div className="bg-[#1e293b] text-white p-6 flex justify-between items-start border-b border-slate-700">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6]"></span>
              <div className="text-xs font-bold text-blue-400 uppercase tracking-[0.2em]">
                Lumen Deep Intelligence™
              </div>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-white">{data.drug_name || 'Unknown Drug'}</h2>
            <div className="text-sm text-slate-400 font-mono mt-1 flex gap-4">
              <span>ID: {intel.regulatory?.study_id}</span>
              <span className="text-slate-600">|</span>
              <span>Agency: {intel.regulatory?.regulatory_agency}</span>
            </div>
          </div>

          <div className="text-right">
            <div className="flex items-center gap-3 justify-end">
              <div className="text-right">
                <div className="text-3xl font-black text-emerald-400 tracking-tighter leading-none">
                  {confidence}
                </div>
                <div className="text-[9px] uppercase text-slate-500 font-bold tracking-widest">Confidence</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="mt-4 text-xs font-bold text-slate-400 hover:text-white border border-slate-600 hover:border-white px-4 py-2 rounded transition-all"
            >
              EXIT VIEWER
            </button>
          </div>
        </div>

        <div className="flex border-b border-slate-200 bg-slate-50">
          {['PROTOCOL', 'SAFETY', 'POPULATION', 'RAW DATA'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t.split(' ')[0] as any)}
              className={`px-8 py-4 text-xs font-black tracking-widest border-r border-slate-200 transition-colors ${
                tab === t.split(' ')[0]
                  ? 'bg-white text-blue-700 border-b-2 border-b-blue-600'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
          {tab === 'PROTOCOL' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <div className="grid grid-cols-4 gap-4">
                <MetricCard label="Study Phase" value={intel.protocol?.design?.phase} icon="📊" />
                <MetricCard label="Design Type" value={intel.protocol?.design?.type} icon="📐" />
                <MetricCard label="Allocation" value={intel.protocol?.design?.allocation} icon="🎲" />
                <MetricCard
                  label="Adaptive?"
                  value={intel.protocol?.design?.is_adaptive ? 'YES' : 'NO'}
                  highlight={intel.protocol?.design?.is_adaptive}
                  icon="🔄"
                />
              </div>

              <div className="bg-blue-50/50 border border-blue-100 p-6 rounded-lg">
                <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">Primary Endpoint</h4>
                <div className="text-lg text-slate-800 font-medium leading-relaxed">
                  "{intel.protocol?.endpoints?.primary?.description || 'Not explicitly defined'}"
                </div>
                <div className="mt-2 text-xs text-slate-500 font-mono">
                  Timepoint: {intel.protocol?.endpoints?.primary?.timepoint}
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 font-bold text-slate-700 text-xs uppercase tracking-wider">
                  Intervention Arms
                </div>
                <table className="w-full text-sm text-left">
                  <thead className="text-slate-500 border-b">
                    <tr>
                      <th className="p-4 pl-6 font-medium">Arm Name</th>
                      <th className="p-4 font-medium">Intervention</th>
                      <th className="p-4 font-medium">Dose</th>
                      <th className="p-4 text-right pr-6 font-medium">Target N</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {intel.protocol?.randomization?.treatment_arms?.map((arm, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-4 pl-6 font-bold text-slate-900">{arm.arm_name}</td>
                        <td className="p-4 text-slate-600">{arm.intervention?.drug_name}</td>
                        <td className="p-4 text-slate-600">{arm.intervention?.dose_level}</td>
                        <td className="p-4 text-right pr-6 font-mono font-bold text-blue-600">
                          {arm.sample_size_target}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'SAFETY' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <div className="grid grid-cols-3 gap-6">
                <SafetyMetric
                  label="Adverse Events (Any)"
                  value={intel.safety?.adverse_events?.overall_incidence?.any_ae_percent}
                  color="orange"
                />
                <SafetyMetric
                  label="Serious AEs (SAE)"
                  value={intel.safety?.adverse_events?.overall_incidence?.any_sae_percent}
                  color="red"
                />
                <SafetyMetric
                  label="Discontinuations"
                  value={intel.safety?.adverse_events?.overall_incidence?.discontinuation_percent}
                  color="slate"
                />
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 font-bold text-slate-700 text-xs uppercase tracking-wider">
                  System Organ Class (SOC) Breakdown
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-white text-slate-500 border-b">
                    <tr>
                      <th className="p-4 text-left font-medium">Term</th>
                      <th className="p-4 text-right font-medium">Count</th>
                      <th className="p-4 text-right font-medium">Frequency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {intel.safety?.adverse_events?.by_system_organ_class?.map((soc, i) => (
                      <React.Fragment key={i}>
                        <tr className="bg-slate-50/50">
                          <td colSpan={3} className="p-3 pl-4 font-bold text-slate-800 text-xs uppercase tracking-wide">
                            {soc.soc}
                          </td>
                        </tr>
                        {soc.preferred_terms?.map((pt, j) => (
                          <tr key={`${i}-${j}`} className="hover:bg-blue-50 transition-colors group">
                            <td className="p-3 pl-8 font-medium text-slate-600 group-hover:text-blue-700">
                              {pt.pt}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-400">{pt.count}</td>
                            <td className="p-3 text-right font-mono font-bold text-blue-600 bg-blue-50/30">
                              {pt.percent}%
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'POPULATION' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <div className="grid grid-cols-3 gap-4">
                <MetricCard label="Randomized N" value={intel.population?.enrollment?.randomized_n} icon="👥" />
                <MetricCard label="Completed N" value={intel.population?.enrollment?.completed_n} icon="✅" />
                <MetricCard label="Discontinued N" value={intel.population?.enrollment?.discontinued_n} icon="⚠️" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <MetricCard label="Mean Age" value={intel.population?.demographics?.age?.mean} icon="🎂" />
                <MetricCard label="Median Age" value={intel.population?.demographics?.age?.median} icon="📈" />
              </div>
            </div>
          )}

          {tab === 'RAW' && (
            <div className="bg-[#1e293b] rounded-lg p-6 overflow-auto h-full border border-slate-700 shadow-inner">
              <pre className="text-xs font-mono text-emerald-400 leading-relaxed">
                {JSON.stringify(intel, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MetricCard = ({ label, value, highlight, icon }: any) => (
  <div
    className={`p-5 bg-white rounded-lg shadow-sm border ${
      highlight ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200'
    } transition-all hover:shadow-md`}
  >
    <div className="flex justify-between items-start mb-2">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</div>
      <div className="text-lg grayscale opacity-20">{icon}</div>
    </div>
    <div className="text-xl font-bold text-slate-900">{value || 'N/A'}</div>
  </div>
);

const SafetyMetric = ({ label, value, color }: any) => {
  const colors: any = {
    orange: 'bg-orange-50 text-orange-700 border-orange-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  };
  return (
    <div className={`p-6 rounded-lg border flex flex-col items-center justify-center ${colors[color]}`}>
      <div className="text-4xl font-black mb-2 tracking-tighter">{value || 0}%</div>
      <div className="text-[10px] uppercase font-bold tracking-widest opacity-80">{label}</div>
    </div>
  );
};
