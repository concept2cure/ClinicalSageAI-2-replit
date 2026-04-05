/**
 * Biologics Dashboard — Regulatory intelligence for biologics & biosimilar programs
 *
 * Sections: Modality Overview, Regulatory Pathway, Expedited Programs,
 * Biosimilar Comparability, CMC Considerations, Multi-Agency Strategy
 */

import React, { useState, useEffect } from 'react';
import {
  FlaskConical, Globe, Zap, GitCompare, Layers,
  Shield, ChevronDown, CheckCircle, AlertTriangle, Info,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// ============================================================================
// TYPES
// ============================================================================

type Tab = 'pathway' | 'expedited' | 'comparability' | 'cmc' | 'multi-agency';

interface PathwayInfo {
  agency: string;
  pathway: string;
  center: string;
  submissionType: string;
  specialConsiderations: string[];
  estimatedTimeline: string;
}

interface ExpeditedPathway {
  name: string;
  agency: string;
  eligible: boolean;
  criteria: string[];
  benefits: string[];
}

const MODALITY_TYPES = [
  { value: 'monoclonal_antibody', label: 'Monoclonal Antibody' },
  { value: 'recombinant_protein', label: 'Recombinant Protein' },
  { value: 'cell_therapy', label: 'Cell Therapy' },
  { value: 'gene_therapy', label: 'Gene Therapy' },
  { value: 'vaccine', label: 'Vaccine' },
  { value: 'adc', label: 'Antibody-Drug Conjugate' },
  { value: 'bispecific', label: 'Bispecific Antibody' },
  { value: 'fusion_protein', label: 'Fusion Protein' },
  { value: 'blood_product', label: 'Blood Product' },
];

const AGENCIES = ['FDA', 'EMA', 'PMDA', 'NMPA', 'HealthCanada'];

// ============================================================================
// COMPONENT
// ============================================================================

export default function BiologicsDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('pathway');
  const [productType, setProductType] = useState<'biologic' | 'biosimilar'>('biologic');
  const [modalityType, setModalityType] = useState('monoclonal_antibody');
  const [indication, setIndication] = useState('');
  const [selectedAgencies, setSelectedAgencies] = useState(['FDA', 'EMA']);
  const [pathways, setPathways] = useState<PathwayInfo[]>([]);
  const [expedited, setExpedited] = useState<ExpeditedPathway[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function fetchPathway() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        productType,
        modalityType,
        indication: indication || 'general',
        targetAgencies: selectedAgencies.join(','),
      });
      const res = await apiRequest('GET', `/api/biologics/pathway?${params}`);
      const data = await res.json();
      setPathways(data.agencies || []);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to fetch pathway data', variant: 'destructive' });
    }
    setLoading(false);
  }

  async function fetchExpedited() {
    setLoading(true);
    try {
      for (const agency of selectedAgencies) {
        const params = new URLSearchParams({
          indication: indication || 'general',
          unmetNeed: 'true',
          seriousCondition: 'true',
          targetAgency: agency,
        });
        const res = await apiRequest('GET', `/api/biologics/expedited-pathways?${params}`);
        const data = await res.json();
        setExpedited((prev) => [...prev.filter((p) => p.agency !== agency), ...(data.pathways || [])]);
      }
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to fetch expedited pathways', variant: 'destructive' });
    }
    setLoading(false);
  }

  useEffect(() => {
    if (indication) {
      fetchPathway();
      fetchExpedited();
    }
  }, [productType, modalityType, selectedAgencies, indication]);

  function toggleAgency(agency: string) {
    setSelectedAgencies((prev) =>
      prev.includes(agency) ? prev.filter((a) => a !== agency) : [...prev, agency]
    );
  }

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'pathway', label: 'Regulatory Pathway', icon: <Globe size={14} /> },
    { id: 'expedited', label: 'Expedited Programs', icon: <Zap size={14} /> },
    { id: 'comparability', label: 'Comparability', icon: <GitCompare size={14} /> },
    { id: 'cmc', label: 'CMC Considerations', icon: <Layers size={14} /> },
    { id: 'multi-agency', label: 'Multi-Agency', icon: <Shield size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-stone-50 p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-stone-600 rounded-lg flex items-center justify-center">
          <FlaskConical size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-base font-medium text-stone-900">Biologics Intelligence</h1>
          <p className="text-sm text-stone-500">Regulatory pathway analysis for biologic & biosimilar products</p>
        </div>
      </div>

      {/* Configuration Bar */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-stone-500 mb-1 block">Product Type</label>
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value as 'biologic' | 'biosimilar')}
              className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="biologic">New Biologic</option>
              <option value="biosimilar">Biosimilar</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-stone-500 mb-1 block">Modality</label>
            <select
              value={modalityType}
              onChange={(e) => setModalityType(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-sm"
            >
              {MODALITY_TYPES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-stone-500 mb-1 block">Indication</label>
            <input
              type="text"
              value={indication}
              onChange={(e) => setIndication(e.target.value)}
              placeholder="e.g., Rheumatoid arthritis"
              className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-stone-500 mb-1 block">Target Agencies</label>
            <div className="flex gap-1 flex-wrap">
              {AGENCIES.map((a) => (
                <button
                  key={a}
                  onClick={() => toggleAgency(a)}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${
                    selectedAgencies.includes(a)
                      ? 'bg-stone-200 text-stone-700 border border-stone-300'
                      : 'bg-stone-100 text-stone-500 border border-stone-200'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => { fetchPathway(); fetchExpedited(); }}
            className="bg-stone-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-stone-700 transition-colors"
          >
            Analyze
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              activeTab === tab.id
                ? 'bg-white border border-stone-200 text-stone-900 font-medium shadow-sm'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Pathway Tab */}
      {activeTab === 'pathway' && (
        <div className="grid grid-cols-2 gap-4">
          {pathways.length > 0 ? (
            pathways.map((p) => (
              <div key={p.agency} className="bg-white border border-stone-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-stone-900">{p.agency}</span>
                  <span className="text-xs bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full">
                    {p.center}
                  </span>
                </div>
                <div className="text-sm font-medium text-stone-700 mb-1">{p.pathway}</div>
                <div className="text-xs text-stone-500 mb-3">{p.submissionType}</div>
                <div className="text-xs text-stone-500 mb-2">Timeline: {p.estimatedTimeline}</div>
                {p.specialConsiderations.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-stone-700 mb-1">Key Considerations:</div>
                    <ul className="space-y-1">
                      {p.specialConsiderations.slice(0, 3).map((c, i) => (
                        <li key={i} className="text-xs text-stone-500 flex items-start gap-1">
                          <Info size={10} className="mt-0.5 flex-shrink-0 text-stone-400" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="col-span-2 text-center text-stone-400 py-12">
              <Globe size={32} className="mx-auto mb-2" />
              <p className="text-sm">Enter an indication and click Analyze to see pathway recommendations.</p>
            </div>
          )}
        </div>
      )}

      {/* Expedited Programs Tab */}
      {activeTab === 'expedited' && (
        <div className="space-y-3">
          {expedited.length > 0 ? (
            expedited.map((p, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-stone-900">{p.name}</span>
                    <span className="text-xs text-stone-400">({p.agency})</span>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      p.eligible
                        ? 'bg-stone-100 text-stone-800'
                        : 'bg-stone-100 text-stone-500'
                    }`}
                  >
                    {p.eligible ? 'Potentially Eligible' : 'May Not Qualify'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <div className="text-xs font-medium text-stone-600 mb-1">Criteria</div>
                    <ul className="space-y-0.5">
                      {p.criteria.map((c, j) => (
                        <li key={j} className="text-xs text-stone-500">- {c}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-stone-600 mb-1">Benefits</div>
                    <ul className="space-y-0.5">
                      {p.benefits.map((b, j) => (
                        <li key={j} className="text-xs text-stone-700">+ {b}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-stone-400 py-12">
              <Zap size={32} className="mx-auto mb-2" />
              <p className="text-sm">Run analysis to see expedited pathway eligibility.</p>
            </div>
          )}
        </div>
      )}

      {/* Comparability Tab */}
      {activeTab === 'comparability' && (
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-stone-900 mb-4">
            {productType === 'biosimilar' ? 'Biosimilar Comparability Requirements' : 'Biologic Comparability Protocol'}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { title: 'Analytical Similarity', items: ['Primary structure (peptide mapping)', 'Higher-order structure (CD, DSC)', 'Glycosylation profiling', 'Charge/size variants', 'Purity assessment'] },
              { title: 'Functional Assays', items: ['Target binding affinity (SPR)', 'Cell-based potency', 'Fc effector function (ADCC, CDC)', 'FcRn binding'] },
              { title: 'PK/PD Studies', items: ['Randomized crossover or parallel PK study', 'AUC and Cmax equivalence', 'PD markers if available'] },
              { title: 'Immunogenicity', items: ['Comparative ADA incidence', 'Neutralizing antibody assessment', 'Impact on PK/efficacy/safety', 'Pre-existing antibody analysis'] },
            ].map((section) => (
              <div key={section.title} className="border border-stone-100 rounded-lg p-3">
                <div className="text-sm font-medium text-stone-900 mb-2">{section.title}</div>
                <ul className="space-y-1">
                  {section.items.map((item, i) => (
                    <li key={i} className="text-xs text-stone-500 flex items-center gap-1">
                      <CheckCircle size={10} className="text-stone-1000" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CMC Tab */}
      {activeTab === 'cmc' && (
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-stone-900 mb-4">Biologic CMC Considerations</h3>
          <div className="space-y-3">
            {[
              { area: 'Cell Line Characterization', items: ['Master/working cell bank establishment', 'Genetic stability assessment', 'Adventitious agent testing', 'Cell line identity confirmation'] },
              { area: 'Process Development', items: ['Upstream: bioreactor optimization, media, feeds', 'Downstream: chromatography, filtration, viral clearance', 'Process validation (3 consecutive lots minimum)', 'Process analytical technology (PAT) implementation'] },
              { area: 'Analytical Methods', items: ['Method development and qualification', 'Potency assay (cell-based preferred)', 'Specifications setting with clinical lot data', 'Reference standard establishment'] },
              { area: 'Stability Program', items: ['ICH Q5C: Stability of Biotechnological Products', 'Real-time and accelerated conditions', 'Photostability per ICH Q1B', 'Container closure integrity'] },
            ].map((section) => (
              <div key={section.area} className="border border-stone-100 rounded-lg p-3">
                <div className="text-sm font-medium text-stone-900 mb-2">{section.area}</div>
                <div className="grid grid-cols-2 gap-1">
                  {section.items.map((item, i) => (
                    <div key={i} className="text-xs text-stone-500 flex items-center gap-1">
                      <Layers size={10} className="text-stone-400" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Multi-Agency Tab */}
      {activeTab === 'multi-agency' && (
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-stone-900 mb-4">Multi-Agency Strategy Comparison</h3>
          {pathways.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className="text-left px-3 py-2 text-xs font-medium text-stone-500">Aspect</th>
                    {pathways.map((p) => (
                      <th key={p.agency} className="text-left px-3 py-2 text-xs font-medium text-stone-500">
                        {p.agency}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Pathway', key: 'pathway' },
                    { label: 'Review Center', key: 'center' },
                    { label: 'Submission Type', key: 'submissionType' },
                    { label: 'Timeline', key: 'estimatedTimeline' },
                  ].map((row) => (
                    <tr key={row.label} className="border-b border-stone-100">
                      <td className="px-3 py-2 text-xs font-medium text-stone-700">{row.label}</td>
                      {pathways.map((p) => (
                        <td key={p.agency} className="px-3 py-2 text-xs text-stone-600">
                          {(p as any)[row.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center text-stone-400 py-8">
              <Shield size={32} className="mx-auto mb-2" />
              <p className="text-sm">Run analysis to compare multi-agency strategies.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
