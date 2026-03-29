/**
 * RegulatoryApplicationSummaryCard — Displays resolved registry entry info.
 *
 * Shows the selected application type with its region, agency,
 * dossier standard, and key metadata in a compact card.
 *
 * @module client/src/concept2cure/components/projects/RegulatoryApplicationSummaryCard
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RegistryEntry {
  id: string;
  region: string;
  country: string;
  agency: string;
  applicationFamily: string;
  applicationType: string;
  displayName: string;
  productClass: string[];
  dossierStandard: string;
  stage: string;
  requiredArtifacts: string[];
  lifecycleActions: string[];
}

interface RegulatoryApplicationSummaryCardProps {
  entry: RegistryEntry;
  /** Whether to show the full detail or compact view */
  expanded?: boolean;
  /** Called when user wants to change selection */
  onChangeSelection?: () => void;
}

// ─── Display Helpers ──────────────────────────────────────────────────────────

const stageLabels: Record<string, string> = {
  pre_submission: 'Pre-Submission',
  initial: 'Initial Filing',
  amendment: 'Amendment',
  supplement: 'Supplement',
  annual_report: 'Annual Report',
  renewal: 'Renewal',
  withdrawal: 'Withdrawal',
  post_approval: 'Post-Approval',
};

const dossierLabels: Record<string, string> = {
  eCTD: 'eCTD (Electronic Common Technical Document)',
  CTD: 'CTD (Common Technical Document)',
  ACTD: 'ACTD (ASEAN Common Technical Document)',
  NeeS: 'NeeS (Non-eCTD electronic Submissions)',
  eSTAR: 'eSTAR (Electronic Submission Template and Resource)',
  regional: 'Regional Format',
  none: 'No Standard Format',
};

const productClassLabels: Record<string, string> = {
  small_molecule: 'Small Molecule',
  biologic: 'Biologic',
  biosimilar: 'Biosimilar',
  generic: 'Generic',
  otc: 'OTC',
  medical_device: 'Medical Device',
  ivd: 'IVD',
  combination_product: 'Combination Product',
  atmp: 'ATMP',
  vaccine: 'Vaccine',
  any: 'Any Product Class',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function RegulatoryApplicationSummaryCard({
  entry,
  expanded = false,
  onChangeSelection,
}: RegulatoryApplicationSummaryCardProps) {
  return (
    <Card className="p-3 border-stone-100">
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-medium text-stone-800">{entry.displayName}</span>
            <Badge variant="outline" className="text-[10px]">{entry.region}</Badge>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-stone-500">
            <span>{entry.agency}</span>
            <span>·</span>
            <span>{entry.country}</span>
            <span>·</span>
            <span>{dossierLabels[entry.dossierStandard] ?? entry.dossierStandard}</span>
          </div>
        </div>
        {onChangeSelection && (
          <button
            onClick={onChangeSelection}
            className="text-[11px] text-stone-400 hover:text-stone-600 transition-colors"
          >
            Change
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-stone-50 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
            <div>
              <span className="text-stone-400">Stage:</span>{' '}
              <span className="text-stone-700">{stageLabels[entry.stage] ?? entry.stage}</span>
            </div>
            <div>
              <span className="text-stone-400">Product Class:</span>{' '}
              <span className="text-stone-700">
                {entry.productClass.map(pc => productClassLabels[pc] ?? pc).join(', ')}
              </span>
            </div>
            <div>
              <span className="text-stone-400">Registry ID:</span>{' '}
              <span className="text-stone-600 font-mono">{entry.id}</span>
            </div>
            <div>
              <span className="text-stone-400">Family:</span>{' '}
              <span className="text-stone-700">{entry.applicationFamily.replace(/_/g, ' ')}</span>
            </div>
          </div>

          {entry.requiredArtifacts.length > 0 && (
            <div>
              <span className="text-[11px] text-stone-400">Required Artifacts:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {entry.requiredArtifacts.slice(0, 6).map((a) => (
                  <Badge key={a} variant="secondary" className="text-[10px]">
                    {a.replace(/_/g, ' ')}
                  </Badge>
                ))}
                {entry.requiredArtifacts.length > 6 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{entry.requiredArtifacts.length - 6} more
                  </Badge>
                )}
              </div>
            </div>
          )}

          {entry.lifecycleActions.length > 0 && (
            <div>
              <span className="text-[11px] text-stone-400">Available Actions:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {entry.lifecycleActions.map((a) => (
                  <Badge key={a} variant="outline" className="text-[10px]">
                    {a}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default RegulatoryApplicationSummaryCard;
