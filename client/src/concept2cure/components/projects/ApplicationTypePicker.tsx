/**
 * ApplicationTypePicker — Global regulatory application type selector.
 *
 * Registry-driven project creation flow:
 * 1. Select Region (US, EU, UK, Canada, Japan, etc.)
 * 2. Select Application Type (filtered by region)
 * 3. Select Product Class (if applicable)
 * 4. See summary of what the project will create
 *
 * Replaces hardcoded submission type dropdowns.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { ChevronRight, Check, Globe, Building2, Beaker } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RegionData {
  region: string;
  country: string;
  agency: string;
  agencyFullName: string;
  applicationTypeCount: number;
}

interface ApplicationTypeData {
  id: string;
  region: string;
  agency: string;
  applicationType: string;
  displayName: string;
  applicationFamily: string;
  productClass: string[];
  dossierStandard: string;
  stage: string;
}

interface ApplicationTypePickerProps {
  /** Called when user completes selection */
  onSelect: (selection: {
    registryId: string;
    displayName: string;
    region: string;
    agency: string;
    applicationType: string;
    dossierStandard: string;
    productClass?: string;
  }) => void;
  /** Called to close the picker */
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ApplicationTypePicker: React.FC<ApplicationTypePickerProps> = ({
  onSelect,
  onClose,
}) => {
  const [step, setStep] = useState<'region' | 'type' | 'summary'>('region');
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<ApplicationTypeData | null>(null);

  // Fetch regions
  const { data: regions } = useQuery<RegionData[]>({
    queryKey: ['regulatory', 'regions'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/regulatory/regions');
      if (!res.ok) return [];
      const json = await res.json();
      return json.data || [];
    },
    staleTime: 300_000,
  });

  // Fetch application types for selected region
  const { data: appTypes } = useQuery<ApplicationTypeData[]>({
    queryKey: ['regulatory', 'registry', selectedRegion],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/regulatory/registry?region=${selectedRegion}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data?.entries || [];
    },
    enabled: !!selectedRegion,
    staleTime: 300_000,
  });

  const handleSelectRegion = useCallback((region: string) => {
    setSelectedRegion(region);
    setStep('type');
  }, []);

  const handleSelectType = useCallback((type: ApplicationTypeData) => {
    setSelectedType(type);
    setStep('summary');
  }, []);

  const handleConfirm = useCallback(() => {
    if (!selectedType) return;
    onSelect({
      registryId: selectedType.id,
      displayName: selectedType.displayName,
      region: selectedType.region,
      agency: selectedType.agency,
      applicationType: selectedType.applicationType,
      dossierStandard: selectedType.dossierStandard,
    });
  }, [selectedType, onSelect]);

  // Group app types by family
  const groupedTypes = useMemo(() => {
    if (!appTypes) return {};
    const groups: Record<string, ApplicationTypeData[]> = {};
    for (const t of appTypes) {
      const family = t.applicationFamily.replace(/_/g, ' ');
      if (!groups[family]) groups[family] = [];
      groups[family].push(t);
    }
    return groups;
  }, [appTypes]);

  return (
    <div className="max-w-lg mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {['Region', 'Application Type', 'Summary'].map((label, i) => {
          const stepKey = ['region', 'type', 'summary'][i];
          const isActive = step === stepKey;
          const isPast = ['region', 'type', 'summary'].indexOf(step) > i;
          return (
            <React.Fragment key={label}>
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium',
                isActive ? 'bg-stone-900 text-white' : isPast ? 'bg-stone-200 text-stone-600' : 'bg-stone-100 text-stone-400'
              )}>
                {isPast ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              {i < 2 && <div className={cn('flex-1 h-0.5', isPast ? 'bg-stone-300' : 'bg-stone-100')} />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step 1: Region */}
      {step === 'region' && (
        <div>
          <h2 className="text-lg font-semibold text-stone-900 mb-1">Select Region</h2>
          <p className="text-sm text-stone-500 mb-4">Choose the regulatory region for your submission.</p>
          <div className="space-y-1">
            {(regions || []).map(region => (
              <button
                key={region.region}
                onClick={() => handleSelectRegion(region.region)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-stone-100 hover:border-stone-200 hover:bg-stone-50 transition-colors text-left focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
              >
                <Globe className="w-4 h-4 text-stone-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-stone-800 block">{region.country}</span>
                  <span className="text-xs text-stone-400">{region.agencyFullName}</span>
                </div>
                <span className="text-[10px] text-stone-400 tabular-nums">{region.applicationTypeCount} types</span>
                <ChevronRight className="w-4 h-4 text-stone-300" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Application Type */}
      {step === 'type' && (
        <div>
          <button onClick={() => setStep('region')} className="text-xs text-stone-400 hover:text-stone-600 mb-3">
            ← Back to regions
          </button>
          <h2 className="text-lg font-semibold text-stone-900 mb-1">Select Application Type</h2>
          <p className="text-sm text-stone-500 mb-4">Choose the type of regulatory submission.</p>
          <div className="space-y-4">
            {Object.entries(groupedTypes).map(([family, types]) => (
              <div key={family}>
                <h3 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2 px-1">
                  {family}
                </h3>
                <div className="space-y-1">
                  {types.map(type => (
                    <button
                      key={type.id}
                      onClick={() => handleSelectType(type)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border border-stone-100 hover:border-stone-200 hover:bg-stone-50 transition-colors text-left focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
                    >
                      <Building2 className="w-4 h-4 text-stone-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-stone-800 block">{type.displayName}</span>
                        <span className="text-xs text-stone-400">{type.dossierStandard} format</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-stone-300" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Summary */}
      {step === 'summary' && selectedType && (
        <div>
          <button onClick={() => setStep('type')} className="text-xs text-stone-400 hover:text-stone-600 mb-3">
            ← Back to types
          </button>
          <h2 className="text-lg font-semibold text-stone-900 mb-4">Confirm Selection</h2>

          <div className="rounded-lg border border-stone-200 p-4 space-y-3 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Region</span>
              <span className="text-stone-800 font-medium">{selectedType.region}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Agency</span>
              <span className="text-stone-800 font-medium">{selectedType.agency}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Application Type</span>
              <span className="text-stone-800 font-medium">{selectedType.displayName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Dossier Format</span>
              <span className="text-stone-800 font-medium">{selectedType.dossierStandard}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Stage</span>
              <span className="text-stone-800 font-medium">{selectedType.stage.replace(/_/g, ' ')}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-stone-900 rounded-lg hover:bg-stone-800"
            >
              Create Project
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApplicationTypePicker;
