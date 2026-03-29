/**
 * RegulatoryApplicationPicker — Registry-driven application type picker.
 *
 * Progressive disclosure: Region → Agency → Product Class → Application Type
 * Replaces hardcoded submission type dropdowns with registry-driven selection.
 *
 * @module client/src/concept2cure/components/projects/RegulatoryApplicationPicker
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RegionOption {
  region: string;
  country: string;
  agency: string;
  count: number;
}

interface ApplicationTypeEntry {
  id: string;
  region: string;
  country: string;
  agency: string;
  applicationFamily: string;
  applicationType: string;
  displayName: string;
  synonyms: string[];
  stage: string;
  productClass: string[];
  dossierStandard: string;
  active: boolean;
}

interface RegulatoryApplicationPickerProps {
  /** Called when user selects an application type */
  onSelect: (entry: ApplicationTypeEntry) => void;
  /** Pre-selected registry ID */
  selectedId?: string;
  /** Whether to show compact mode */
  compact?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RegulatoryApplicationPicker({
  onSelect,
  selectedId,
  compact = false,
}: RegulatoryApplicationPickerProps) {
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'regions' | 'types'>('regions');

  // Fetch regions
  const { data: regions, isLoading: regionsLoading } = useQuery({
    queryKey: ['regulatory-catalog', 'regions'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/concept2cure/regulatory-catalog/regions');
      const json = await res.json();
      return (json.data ?? json) as RegionOption[];
    },
  });

  // Fetch application types (filtered by region if selected)
  const { data: applicationTypes, isLoading: typesLoading } = useQuery({
    queryKey: ['regulatory-catalog', 'application-types', selectedRegion, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedRegion) params.set('region', selectedRegion);
      if (searchQuery) params.set('query', searchQuery);
      const res = await apiRequest('GET', `/api/concept2cure/regulatory-catalog/application-types?${params}`);
      const json = await res.json();
      return (json.data ?? json) as ApplicationTypeEntry[];
    },
    enabled: view === 'types' || !!searchQuery,
  });

  // Group types by family
  const groupedTypes = useMemo(() => {
    if (!applicationTypes) return {};
    const groups: Record<string, ApplicationTypeEntry[]> = {};
    for (const entry of applicationTypes) {
      const family = entry.applicationFamily;
      if (!groups[family]) groups[family] = [];
      groups[family].push(entry);
    }
    return groups;
  }, [applicationTypes]);

  // Family display names
  const familyLabels: Record<string, string> = {
    clinical_trial: 'Clinical Trial',
    marketing_authorization: 'Marketing Authorization',
    supplement: 'Supplement',
    variation: 'Variation',
    renewal: 'Renewal',
    master_file: 'Master File',
    pediatric: 'Pediatric',
    orphan: 'Orphan',
    safety_report: 'Safety Report',
    pre_submission: 'Pre-Submission',
    device_clearance: 'Device Clearance',
    device_approval: 'Device Approval',
  };

  // ─── Handlers ─────────────────────────────────────────────────────────

  function handleRegionSelect(region: string) {
    setSelectedRegion(region);
    setView('types');
  }

  function handleBack() {
    setSelectedRegion(null);
    setView('regions');
    setSearchQuery('');
  }

  function handleSearch(q: string) {
    setSearchQuery(q);
    if (q.length > 0) {
      setView('types');
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Search */}
      <Input
        placeholder="Search application types (e.g., IND, MAA, 510k)..."
        value={searchQuery}
        onChange={(e) => handleSearch(e.target.value)}
        className="text-[13px]"
      />

      {/* Region Grid */}
      {view === 'regions' && !searchQuery && (
        <div>
          <p className="text-[11px] text-stone-500 mb-2 uppercase tracking-wide">Select Region</p>
          {regionsLoading ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className={compact ? 'grid grid-cols-4 gap-1.5' : 'grid grid-cols-3 gap-2'}>
              {(regions ?? []).map((r) => (
                <button
                  key={r.region}
                  onClick={() => handleRegionSelect(r.region)}
                  className={`
                    p-3 rounded-lg border text-left transition-colors
                    hover:border-stone-300 hover:bg-stone-50
                    ${selectedRegion === r.region ? 'border-stone-400 bg-stone-50' : 'border-stone-100'}
                  `}
                >
                  <div className="text-[13px] font-medium text-stone-800">{r.country}</div>
                  <div className="text-[11px] text-stone-500">{r.agency} · {r.count} types</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Application Types List */}
      {(view === 'types' || searchQuery) && (
        <div>
          {selectedRegion && !searchQuery && (
            <div className="flex items-center gap-2 mb-2">
              <Button variant="ghost" size="sm" onClick={handleBack} className="text-[12px] h-7 px-2">
                ← Back
              </Button>
              <Badge variant="outline" className="text-[11px]">
                {regions?.find(r => r.region === selectedRegion)?.country ?? selectedRegion}
              </Badge>
            </div>
          )}

          {typesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : Object.keys(groupedTypes).length === 0 ? (
            <p className="text-[13px] text-stone-400 py-4 text-center">No application types found</p>
          ) : (
            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              {Object.entries(groupedTypes).map(([family, entries]) => (
                <div key={family}>
                  <p className="text-[11px] text-stone-500 mb-1.5 uppercase tracking-wide">
                    {familyLabels[family] ?? family}
                  </p>
                  <div className="space-y-1">
                    {entries.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => onSelect(entry)}
                        className={`
                          w-full p-2.5 rounded-lg border text-left transition-colors flex items-center justify-between
                          hover:border-stone-300 hover:bg-stone-50
                          ${selectedId === entry.id ? 'border-stone-400 bg-stone-50 ring-1 ring-stone-200' : 'border-stone-100'}
                        `}
                      >
                        <div>
                          <div className="text-[13px] font-medium text-stone-800">{entry.displayName}</div>
                          <div className="text-[11px] text-stone-500">
                            {entry.applicationType} · {entry.dossierStandard}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {entry.region}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RegulatoryApplicationPicker;
