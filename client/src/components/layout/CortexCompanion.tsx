import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Database, Loader } from 'lucide-react';

interface CompanionProps {
  width: 'FULL' | 'SIDE' | 'MINI';
  onToggle: (mode: 'FULL' | 'SIDE' | 'MINI') => void;
  contextData?: string;
  onDraftGenerated?: (draft: string, sources: string[]) => void;
  onDraftInject?: (data: any) => void;
}

interface EvidenceMatch {
  source: string;
  date: string;
  insight: string;
  match_score?: string;
}

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

export const CortexCompanion: React.FC<CompanionProps> = ({
  width,
  onToggle,
  contextData,
  onDraftGenerated,
  onDraftInject,
}) => {
  const [evidence, setEvidence] = useState<EvidenceMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [draftingSource, setDraftingSource] = useState<string | null>(null);
  const [sectionType, setSectionType] = useState('indications');
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!contextData || contextData.length < 5) {
      setEvidence([]);
      return undefined;
    }

    const controller = new AbortController();
    const requestId = ++requestIdRef.current;

    const timer = setTimeout(async () => {
      const terms = contextData.split(' ').filter(Boolean);
      const lastTerm = terms[terms.length - 1];

      if (!lastTerm || lastTerm.length <= 3) {
        return;
      }

      setLoading(true);
      try {
        const token = getAuthToken();
        const organizationId = getOrganizationId();
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };

        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
        if (organizationId) {
          headers['x-organization-id'] = organizationId;
        }

        const res = await fetch(`/api/evidence/search?query=${encodeURIComponent(lastTerm)}`, {
          headers,
          signal: controller.signal,
        });
        const data = await res.json();
        if (requestId === requestIdRef.current) {
          if (data.results && data.results.length > 0) {
            setEvidence(data.results);
          } else {
            setEvidence([]);
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error(error);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }, 1000);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [contextData]);

  const handleDrafting = async (item: EvidenceMatch) => {
    if (!contextData) return;
    setDraftingSource(item.source);

    try {
      const token = getAuthToken();
      const organizationId = getOrganizationId();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      if (organizationId) {
        headers['x-organization-id'] = organizationId;
      }

      const res = await fetch('/api/writer/draft', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sectionType,
          context: contextData,
        }),
      });

      const data = await res.json();
      const structuredData = data?.data;
      const draftBody = structuredData?.content_body;
      if (structuredData && onDraftInject) {
        onDraftInject(structuredData);
      } else if (draftBody) {
        if (onDraftGenerated) {
          onDraftGenerated(draftBody, data.sources || []);
        } else if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(draftBody);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setDraftingSource(null);
    }
  };

  if (width === 'MINI') {
    return (
      <div
        onClick={() => onToggle('SIDE')}
        className="w-14 h-full bg-slate-950 border-l border-slate-800 flex flex-col items-center pt-4 cursor-pointer hover:bg-slate-900 transition-colors"
      >
        <div className="text-xl animate-pulse">⚡</div>
      </div>
    );
  }

  return (
    <div
      className={`h-full bg-slate-950 border-l border-slate-800 flex flex-col transition-all duration-300 ${
        width === 'FULL' ? 'w-full' : 'w-[400px]'
      }`}
    >
      <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900">
        <div className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
          Lumen Cortex
        </div>
        <button onClick={() => onToggle('MINI')} className="text-slate-400">
          ─
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        <div className="p-3 bg-slate-900 rounded border border-slate-800 text-sm text-slate-400">
          Scanning <b>Deep Genome Vault</b> for predicate data related to your input...
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-blue-400 animate-pulse">
            <Loader size={12} className="animate-spin" /> Analyzing Clinical Protocols...
          </div>
        )}

        {evidence.map((item, i) => (
          <div
            key={`${item.source}-${i}`}
            className="bg-slate-800/50 border border-blue-500/30 rounded p-3 animate-in slide-in-from-right"
          >
            <div className="flex items-center gap-2 mb-2">
              <Database size={12} className="text-blue-400" />
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                Evidence Match
              </span>
            </div>
            <div className="text-sm font-bold text-white mb-1">{item.source}</div>
            <div className="text-[10px] text-slate-500 mb-2">{item.date}</div>
            {item.match_score && (
              <div className="text-[10px] text-slate-500 mb-2">
                Match score: {item.match_score}
              </div>
            )}
            <div className="text-xs text-slate-400 leading-relaxed mb-2">{item.insight}</div>
            <button className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 hover:text-emerald-300">
              CITE THIS SOURCE <ArrowRight size={10} />
            </button>
            <div className="mt-2">
              <label className="text-[10px] text-slate-400 font-bold uppercase">
                Target Section
              </label>
              <select
                value={sectionType}
                onChange={event => setSectionType(event.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded p-1 mt-1 focus:border-blue-500 outline-none"
              >
                <option value="indications">Indications for Use (FDA 3881)</option>
                <option value="510k_summary">510(k) Summary (807.92)</option>
                <option value="substantial_equivalence">Substantial Equivalence (807.100)</option>
                <option value="biocompatibility">Biocompatibility (ISO 10993)</option>
              </select>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-700">
              <button
                onClick={() => handleDrafting(item)}
                disabled={draftingSource === item.source || !contextData}
                className="w-full py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                {draftingSource === item.source ? 'Drafting...' : '✨ AUTO-DRAFT SECTION'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CortexCompanion;
