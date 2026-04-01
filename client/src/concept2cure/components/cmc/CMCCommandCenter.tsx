import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface CommandCenterProps {
  projectId?: string;
}

interface SectionRow {
  sectionKey: string;
  sectionPath: string;
  stale: boolean;
  staleReason?: string | null;
  approvalState: string;
  updatedAt: string;
}

interface ReadinessSnapshot {
  openCriticalContradictions: number;
  staleSections: number;
  approvedSections: number;
  totalSections: number;
  exportReady: boolean;
}

interface ContradictionRow {
  id: string;
  severity: string;
  contradictionType: string;
  details: string;
  status: string;
}

export default function CMCCommandCenter({ projectId }: CommandCenterProps) {
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [readiness, setReadiness] = useState<ReadinessSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contradictions, setContradictions] = useState<ContradictionRow[]>([]);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [provenanceCount, setProvenanceCount] = useState<number>(0);
  const [finalGateMessage, setFinalGateMessage] = useState<string | null>(null);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const [sectionsRes, readinessRes, contradictionsRes] = await Promise.all([
        apiRequest('GET', `/api/cmc/module3-os/sections/${projectId}`),
        apiRequest('GET', `/api/cmc/module3-os/readiness/${projectId}`),
        apiRequest('GET', `/api/cmc/module3-os/contradictions/${projectId}`),
      ]);
      const sectionsJson = await sectionsRes.json();
      const readinessJson = await readinessRes.json();
      const contradictionsJson = await contradictionsRes.json();
      setSections(sectionsJson.data || []);
      setReadiness(readinessJson.data || null);
      setContradictions(contradictionsJson.data || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load Module 3 OS state');
    } finally {
      setLoading(false);
    }
  };

  const runCompile = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      await apiRequest('POST', `/api/cmc/module3-os/compile/${projectId}`);
      await apiRequest('POST', `/api/cmc/module3-os/contradictions/${projectId}`);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to compile Module 3 sections');
    } finally {
      setLoading(false);
    }
  };

  const checkFinalGate = async () => {
    if (!projectId) return;
    try {
      const res = await apiRequest('POST', `/api/cmc/module3-os/guard/final-export/${projectId}`);
      const json = await res.json();
      setFinalGateMessage(json.message || 'Final export gate passed');
    } catch (e: any) {
      setFinalGateMessage(e?.message || 'Final export gate blocked');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    const loadProvenance = async () => {
      if (!projectId || !selectedSection) return;
      const res = await apiRequest('GET', `/api/cmc/module3-os/provenance/${projectId}/${encodeURIComponent(selectedSection)}`);
      const json = await res.json();
      setProvenanceCount((json.data || []).length);
    };
    loadProvenance().catch(() => setProvenanceCount(0));
  }, [projectId, selectedSection]);

  const staleCount = useMemo(() => sections.filter((s) => s.stale).length, [sections]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-4">
        <div>
          <h3 className="font-semibold text-stone-800 text-sm">CMC Module 3 Command Center</h3>
          <p className="text-xs text-stone-500 mt-1">Deterministic compile + contradiction gating + governed section state.</p>
        </div>
        <button
          onClick={runCompile}
          disabled={!projectId || loading}
          className="px-3 py-2 text-xs font-medium rounded-lg border border-stone-300 bg-stone-50 hover:bg-stone-100 disabled:opacity-50"
        >
          {loading ? 'Working…' : 'Compile + Refresh'}
        </button>
        <button
          onClick={checkFinalGate}
          disabled={!projectId || loading}
          className="ml-2 px-3 py-2 text-xs font-medium rounded-lg border border-stone-300 bg-white hover:bg-stone-50 disabled:opacity-50"
        >
          Check Final Export Gate
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      {finalGateMessage && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">{finalGateMessage}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Metric label="Sections" value={readiness?.totalSections ?? sections.length} />
        <Metric label="Approved" value={readiness?.approvedSections ?? 0} />
        <Metric label="Stale" value={readiness?.staleSections ?? staleCount} />
        <Metric label="Critical" value={readiness?.openCriticalContradictions ?? 0} />
      </div>

      {readiness && (
        <div
          className={`rounded-lg border p-3 text-xs ${
            readiness.exportReady
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          QA / Release Center: {readiness.exportReady ? 'Export ready (all sections approved, no stale or critical blockers).' : 'Not export ready — resolve stale sections/critical contradictions and complete approvals.'}
        </div>
      )}

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <h4 className="text-xs font-semibold text-stone-700 mb-2">Contradictions / Review Center</h4>
        {contradictions.slice(0, 4).map((c) => (
          <div key={c.id} className="text-xs border-b border-stone-100 py-2">
            <div className="font-medium text-stone-700">{c.contradictionType} ({c.severity})</div>
            <div className="text-stone-500">{c.details}</div>
            {c.status !== 'resolved' && (
              <button
                type="button"
                onClick={async () => {
                  await apiRequest('PATCH', `/api/cmc/module3-os/contradictions/${c.id}/resolve`, {
                    resolutionNote: 'Resolved in command center',
                  });
                  await load();
                }}
                className="mt-1 text-[11px] px-2 py-1 rounded border border-stone-300 bg-stone-50 hover:bg-stone-100"
              >
                Mark resolved
              </button>
            )}
          </div>
        ))}
        {contradictions.length === 0 && <div className="text-xs text-stone-500">No active contradictions.</div>}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <h4 className="text-xs font-semibold text-stone-700 mb-2">Module 3 Section Map</h4>
        <div className="space-y-2 max-h-72 overflow-auto">
          {sections.map((s) => (
            <button
              key={s.sectionKey}
              type="button"
              onClick={() => setSelectedSection(s.sectionKey)}
              className="w-full text-left flex items-center justify-between text-xs border-b border-stone-100 pb-2"
            >
              <div>
                <div className="font-medium text-stone-700">{s.sectionKey}</div>
                <div className="text-stone-500">{s.stale ? `Stale: ${s.staleReason || 'source change'}` : 'Current'}</div>
              </div>
              <div className="text-right">
                <div className="text-stone-700">{s.approvalState}</div>
                <div className="text-stone-400">{new Date(s.updatedAt).toLocaleDateString()}</div>
              </div>
            </button>
          ))}
          {sections.length === 0 && <div className="text-xs text-stone-500">No compiled sections yet.</div>}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 text-xs text-stone-600">
        Provenance Panel: {selectedSection ? `${selectedSection} has ${provenanceCount} events` : 'Select a section to inspect provenance.'}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-xl border border-stone-200 bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-stone-500">{label}</div>
      <div className="text-lg font-semibold text-stone-800">{value}</div>
    </article>
  );
}
