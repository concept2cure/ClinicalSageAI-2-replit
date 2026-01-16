import React, { useEffect, useState } from 'react';
import axios from 'axios';
import type { DeepCSRData } from '@shared/types/deep-csr';

type ViewerProps = {
  csrId: number;
  onClose: () => void;
};

type GenomeResponse = {
  csr_id: number;
  drug_name: string | null;
  study_id: string | null;
  regulatory_agency: string;
  deep_data: DeepCSRData;
  extraction_confidence_score: number | null;
  created_at: string;
};

export const CSRGenomeViewer: React.FC<ViewerProps> = ({ csrId, onClose }) => {
  const [data, setData] = useState<GenomeResponse | null>(null);
  const [tab, setTab] = useState<'PROTOCOL' | 'POPULATION' | 'SAFETY' | 'RAW'>('PROTOCOL');

  useEffect(() => {
    axios.get(`/api/lumen/genome/${csrId}`).then(res => setData(res.data));
  }, [csrId]);

  if (!data) return <div className="p-8 text-white">Loading Genome...</div>;

  const genome = data.deep_data;
  const confidence = data.extraction_confidence_score
    ? `${Math.round(data.extraction_confidence_score * 100)}%`
    : '—';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-8 backdrop-blur-sm">
      <div className="bg-white w-full max-w-6xl h-full max-h-[90vh] rounded-xl overflow-hidden shadow-2xl flex flex-col">
        <div className="bg-slate-900 text-white p-6 flex justify-between items-center border-b border-slate-700">
          <div>
            <div className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-1">
              {genome.regulatory?.regulatory_agency} • {genome.regulatory?.submission_id}
            </div>
            <h2 className="text-2xl font-bold">{data.drug_name || 'Unknown Drug'}</h2>
            <div className="text-sm text-slate-400 font-mono mt-1">ID: {genome.regulatory?.study_id}</div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black text-emerald-400">{confidence}</div>
            <div className="text-[10px] uppercase text-slate-500 font-bold">Confidence</div>
            <button onClick={onClose} className="mt-4 text-xs text-slate-400 hover:text-white underline">
              CLOSE VIEWER
            </button>
          </div>
        </div>

        <div className="flex border-b border-slate-200 bg-slate-50">
          {['PROTOCOL', 'POPULATION', 'SAFETY', 'RAW'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t as any)}
              className={`px-8 py-4 text-sm font-bold tracking-wide border-r border-slate-200 transition-colors ${
                tab === t ? 'bg-white text-blue-600 border-b-2 border-b-blue-600' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
          {tab === 'PROTOCOL' && (
            <div className="space-y-8">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-400 uppercase mb-4">Study Design</h3>
                <div className="grid grid-cols-3 gap-6">
                  <Metric label="Phase" value={genome.protocol?.design?.phase} />
                  <Metric label="Type" value={genome.protocol?.design?.type} />
                  <Metric label="Adaptive?" value={genome.protocol?.design?.is_adaptive ? 'YES' : 'NO'} />
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-400 uppercase mb-4">Primary Endpoint</h3>
                <div className="grid grid-cols-2 gap-6">
                  <Metric label="Description" value={genome.protocol?.endpoints?.primary?.description} />
                  <Metric label="Timepoint" value={genome.protocol?.endpoints?.primary?.timepoint} />
                </div>
              </div>
            </div>
          )}

          {tab === 'POPULATION' && (
            <div className="space-y-8">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-400 uppercase mb-4">Enrollment</h3>
                <div className="grid grid-cols-3 gap-6">
                  <Metric label="Randomized" value={genome.population?.enrollment?.randomized_n} />
                  <Metric label="Completed" value={genome.population?.enrollment?.completed_n} />
                  <Metric label="Discontinued" value={genome.population?.enrollment?.discontinued_n} />
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-400 uppercase mb-4">Demographics</h3>
                <div className="grid grid-cols-2 gap-6">
                  <Metric label="Mean Age" value={genome.population?.demographics?.age?.mean} />
                  <Metric label="Median Age" value={genome.population?.demographics?.age?.median} />
                </div>
                <div className="grid grid-cols-2 gap-6 mt-4">
                  <Metric label="Male %" value={genome.population?.demographics?.sex?.male_percent} />
                  <Metric label="Female %" value={genome.population?.demographics?.sex?.female_percent} />
                </div>
              </div>
            </div>
          )}

          {tab === 'SAFETY' && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <SafetyCard
                  label="Any Adverse Event"
                  value={genome.safety?.adverse_events?.overall_incidence?.any_ae_percent}
                  color="bg-orange-50 text-orange-700"
                />
                <SafetyCard
                  label="Serious AEs (SAE)"
                  value={genome.safety?.adverse_events?.overall_incidence?.any_sae_percent}
                  color="bg-red-50 text-red-700"
                />
                <SafetyCard
                  label="Discontinuations"
                  value={genome.safety?.adverse_events?.overall_incidence?.discontinuation_percent}
                  color="bg-slate-100 text-slate-700"
                />
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="p-4 text-left">System Organ Class (SOC)</th>
                      <th className="p-4 text-left">Preferred Term (PT)</th>
                      <th className="p-4 text-right">Count</th>
                      <th className="p-4 text-right">Freq (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {genome.safety?.adverse_events?.by_system_organ_class?.map((soc, i) => (
                      <React.Fragment key={i}>
                        <tr className="bg-slate-50 font-bold text-slate-700">
                          <td colSpan={4} className="p-3">
                            {soc.soc}
                          </td>
                        </tr>
                        {soc.preferred_terms.map((pt, j) => (
                          <tr key={`${i}-${j}`} className="hover:bg-blue-50">
                            <td className="p-3"></td>
                            <td className="p-3">{pt.pt}</td>
                            <td className="p-3 text-right font-mono">{pt.count}</td>
                            <td className="p-3 text-right font-mono font-bold text-blue-600">
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

          {tab === 'RAW' && (
            <pre className="bg-slate-900 text-green-400 p-6 rounded-lg text-xs font-mono overflow-auto h-full">
              {JSON.stringify(genome, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};

const Metric = ({ label, value }: any) => (
  <div>
    <div className="text-xs text-slate-400 uppercase font-bold">{label}</div>
    <div className="text-xl font-bold text-slate-800">{value ?? '—'}</div>
  </div>
);

const SafetyCard = ({ label, value, color }: any) => (
  <div className={`p-6 rounded-lg border ${color} flex flex-col items-center justify-center`}>
    <div className="text-4xl font-black mb-2">{value ?? '—'}%</div>
    <div className="text-xs uppercase font-bold tracking-widest">{label}</div>
  </div>
);
