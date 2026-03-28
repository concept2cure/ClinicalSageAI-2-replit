/**
 * @fileoverview Medical Device Regulatory Pathfinder Dashboard
 * @module concept2cure/components/medtech/MedicalDeviceDashboard
 * @version 1.0.0
 *
 * @description
 * Dashboard designed for how MEDICAL DEVICE companies actually operate:
 *
 * MEDTECH REALITY:
 * - 510(k) is the most common pathway (Substantial Equivalence)
 * - Predicate device selection is CRITICAL (wrong choice = death)
 * - CER (Clinical Evaluation Reports) for EU MDR compliance
 * - PMA for Class III high-risk devices
 * - eSTAR is now required for 510(k) submissions
 * - MAUDE database monitoring for competitor recalls
 * - Design History File (DHF) is audit gold
 *
 * THE SHERPA METAPHOR:
 * "CERV2 is the Scout who finds the footprints of those who climbed before."
 * - Scouting the Trail: Scan MAUDE for safe predicates
 * - Marking Hazards: Flag Class I Recalls in competitors
 * - The Benefit: Climb the proven path, avoid traps
 *
 * KEY USE CASES:
 * 1. "Find a predicate device for my cardiac monitor"
 * 2. "What recalls have occurred in this device category?"
 * 3. "Track my 510(k) submission timeline"
 * 4. "Generate CER for EU MDR compliance"
 * 5. "What's the status of my eSTAR submission?"
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  Search,
  Shield,
  Target,
  TrendingUp,
  ChevronRight,
  ChevronDown,
  Filter,
  AlertOctagon,
  Zap,
  Mountain,
  Map,
  Flag,
  Compass,
  Eye,
  FileCheck,
  Database,
  Globe,
  Calendar,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - Medical Device Regulatory Pathways
// ═══════════════════════════════════════════════════════════════════════════════

export type RegulatoryPathway = '510k' | 'pma' | 'de_novo' | 'hde' | 'exempt';

export type DeviceClass = 'I' | 'II' | 'III';

export type SubmissionStatus =
  | 'planning'
  | 'predicate_search'
  | 'testing'
  | 'drafting'
  | 'internal_review'
  | 'estar_prep'
  | 'submitted'
  | 'fda_review'
  | 'additional_info'
  | 'cleared'
  | 'approved'
  | 'rejected';

export type RecallClass = 'I' | 'II' | 'III';

export interface PredicateDevice {
  id: string;
  kNumber: string; // K123456
  deviceName: string;
  manufacturer: string;
  decisionDate: string;
  productCode: string;
  regulationNumber: string;

  // Risk Assessment
  hasRecalls: boolean;
  recallCount: number;
  recallClasses: RecallClass[];
  lastRecallDate?: string;

  // Similarity Score
  similarityScore: number; // 0-100
  matchingIndications: string[];
  technologicalDifferences: string[];

  // Recommendation
  recommendation: 'strong' | 'acceptable' | 'caution' | 'avoid';
  reasonCodes: string[];
}

export interface MAUDEAlert {
  id: string;
  reportNumber: string;
  eventDate: string;
  eventType: 'malfunction' | 'injury' | 'death';
  deviceName: string;
  manufacturer: string;
  productCode: string;
  brandName: string;
  narrative: string;
  relevanceScore: number;
  isCompetitor: boolean;
}

export interface DeviceSubmission {
  id: string;
  projectName: string;
  deviceName: string;
  productCode: string;
  deviceClass: DeviceClass;
  pathway: RegulatoryPathway;
  status: SubmissionStatus;

  // Predicate Info (for 510k)
  predicateDevice?: PredicateDevice;
  predicateCandidates?: PredicateDevice[];

  // Key Dates
  projectStartDate: string;
  targetSubmissionDate?: string;
  submittedDate?: string;
  clearanceDate?: string;

  // eSTAR
  estarProgress: number; // 0-100
  estarSections: ESTARSection[];

  // Testing
  testingStatus: 'not_started' | 'in_progress' | 'complete';
  requiredTests: string[];
  completedTests: string[];

  // Documents
  cerRequired: boolean;
  cerStatus?: 'not_started' | 'drafting' | 'review' | 'complete';

  // Team
  projectLead: string;
  raSpecialist: string;
}

export interface ESTARSection {
  id: string;
  sectionNumber: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'complete' | 'na';
  completionPct: number;
  requiredAttachments: number;
  uploadedAttachments: number;
}

export interface CERDocument {
  id: string;
  deviceId: string;
  deviceName: string;
  version: string;
  status:
    | 'drafting'
    | 'literature_review'
    | 'clinical_data'
    | 'risk_benefit'
    | 'final_review'
    | 'approved';
  lastUpdated: string;

  // EU MDR Compliance
  mdrCompliant: boolean;
  gspr: number; // General Safety & Performance Requirements covered
  totalGspr: number;

  // Literature
  articlesReviewed: number;
  clinicalStudies: number;
  pmsData: boolean; // Post-Market Surveillance
}

interface MedicalDeviceDashboardProps {
  submissions: DeviceSubmission[];
  maudeAlerts: MAUDEAlert[];
  cerDocuments: CERDocument[];
  onSubmissionClick?: (submission: DeviceSubmission) => void;
  onPredicateSearch?: (submission: DeviceSubmission) => void;
  onAlertClick?: (alert: MAUDEAlert) => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const PATHWAY_CONFIG: Record<
  RegulatoryPathway,
  {
    label: string;
    description: string;
    color: string;
    bgColor: string;
  }
> = {
  '510k': {
    label: '510(k)',
    description: 'Substantial Equivalence',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  pma: {
    label: 'PMA',
    description: 'Premarket Approval',
    color: 'text-violet-600',
    bgColor: 'bg-violet-100',
  },
  de_novo: {
    label: 'De Novo',
    description: 'Novel Low-Moderate Risk',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
  },
  hde: {
    label: 'HDE',
    description: 'Humanitarian Device Exemption',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  exempt: {
    label: 'Exempt',
    description: 'Class I Exempt',
    color: 'text-stone-600',
    bgColor: 'bg-stone-100',
  },
};

const STATUS_CONFIG: Record<
  SubmissionStatus,
  {
    label: string;
    color: string;
    bgColor: string;
    step: number;
  }
> = {
  planning: { label: 'Planning', color: 'text-stone-600', bgColor: 'bg-stone-100', step: 1 },
  predicate_search: {
    label: 'Predicate Search',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    step: 2,
  },
  testing: { label: 'Testing', color: 'text-amber-600', bgColor: 'bg-amber-100', step: 3 },
  drafting: { label: 'Drafting', color: 'text-violet-600', bgColor: 'bg-violet-100', step: 4 },
  internal_review: {
    label: 'Internal Review',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    step: 5,
  },
  estar_prep: { label: 'eSTAR Prep', color: 'text-cyan-600', bgColor: 'bg-cyan-100', step: 6 },
  submitted: { label: 'Submitted', color: 'text-blue-600', bgColor: 'bg-blue-100', step: 7 },
  fda_review: { label: 'FDA Review', color: 'text-orange-600', bgColor: 'bg-orange-100', step: 8 },
  additional_info: {
    label: 'Additional Info Requested',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    step: 8,
  },
  cleared: { label: 'Cleared', color: 'text-green-600', bgColor: 'bg-green-100', step: 9 },
  approved: { label: 'Approved', color: 'text-green-600', bgColor: 'bg-green-100', step: 9 },
  rejected: { label: 'Rejected', color: 'text-red-600', bgColor: 'bg-red-100', step: 9 },
};

const RECOMMENDATION_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  strong: {
    label: 'Strong Match',
    color: 'text-green-600 bg-green-50 border-green-200',
    icon: <CheckCircle className="w-4 h-4" />,
  },
  acceptable: {
    label: 'Acceptable',
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    icon: <Target className="w-4 h-4" />,
  },
  caution: {
    label: 'Use Caution',
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  avoid: {
    label: 'Avoid',
    color: 'text-red-600 bg-red-50 border-red-200',
    icon: <AlertOctagon className="w-4 h-4" />,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const getDaysUntil = (date: string): number => {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// PREDICATE PATHFINDER - "THE SCOUT"
// ═══════════════════════════════════════════════════════════════════════════════

const PredicatePathfinder: React.FC<{
  submission: DeviceSubmission;
  onPredicateSearch?: () => void;
}> = ({ submission, onPredicateSearch }) => {
  const candidates = submission.predicateCandidates || [];
  const selected = submission.predicateDevice;

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="p-4 border-b border-stone-200 bg-blue-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Compass className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Predicate Pathfinder</h3>
              <p className="text-xs text-stone-500">
                The Scout finds safe paths others have climbed
              </p>
            </div>
          </div>
          <button
            onClick={onPredicateSearch}
            className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            Search Predicates
          </button>
        </div>
      </div>

      {/* Selected Predicate */}
      {selected && (
        <div className="p-4 border-b border-stone-200 bg-green-50">
          <p className="text-xs font-medium text-green-600 mb-2 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            SELECTED PREDICATE
          </p>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-stone-900">{selected.kNumber}</p>
              <p className="text-sm text-stone-700">{selected.deviceName}</p>
              <p className="text-xs text-stone-500">{selected.manufacturer}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1">
                <span className="text-2xl font-semibold text-green-600">
                  {selected.similarityScore}
                </span>
                <span className="text-xs text-green-600">% Match</span>
              </div>
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border',
                  RECOMMENDATION_CONFIG[selected.recommendation].color
                )}
              >
                {RECOMMENDATION_CONFIG[selected.recommendation].icon}
                {RECOMMENDATION_CONFIG[selected.recommendation].label}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Candidate List */}
      <div className="max-h-[300px] overflow-y-auto">
        {candidates.length > 0 ? (
          candidates.map(candidate => {
            const recConfig = RECOMMENDATION_CONFIG[candidate.recommendation];
            const isSelected = selected?.id === candidate.id;

            return (
              <div
                key={candidate.id}
                className={cn(
                  'p-3 border-b border-stone-200 hover:bg-stone-50 transition-colors cursor-pointer',
                  isSelected && 'bg-blue-50'
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-blue-600">
                        {candidate.kNumber}
                      </span>
                      {candidate.hasRecalls && (
                        <span className="px-1.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700 rounded flex items-center gap-0.5">
                          <AlertTriangle className="w-3 h-3" />
                          {candidate.recallCount} RECALL{candidate.recallCount > 1 ? 'S' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-stone-700">{candidate.deviceName}</p>
                    <p className="text-xs text-stone-500">
                      {candidate.manufacturer} • {formatDate(candidate.decisionDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-stone-900">
                      {candidate.similarityScore}%
                    </div>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border',
                        recConfig.color
                      )}
                    >
                      {recConfig.icon}
                      {recConfig.label}
                    </span>
                  </div>
                </div>

                {/* Matching Indications */}
                {candidate.matchingIndications.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {candidate.matchingIndications.slice(0, 3).map(ind => (
                      <span
                        key={ind}
                        className="px-2 py-0.5 text-xs bg-stone-100 text-stone-600 rounded"
                      >
                        {ind}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center">
            <Compass className="w-12 h-12 text-stone-400 mx-auto mb-3" />
            <p className="text-sm text-stone-500">No predicate candidates yet</p>
            <p className="text-xs text-stone-400">Click "Search Predicates" to find your path</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAUDE HAZARD MONITOR - "MARKING THE CREVASSES"
// ═══════════════════════════════════════════════════════════════════════════════

const MAUDEHazardMonitor: React.FC<{
  alerts: MAUDEAlert[];
  onAlertClick?: (alert: MAUDEAlert) => void;
}> = ({ alerts, onAlertClick }) => {
  const deaths = alerts.filter(a => a.eventType === 'death');
  const injuries = alerts.filter(a => a.eventType === 'injury');
  const malfunctions = alerts.filter(a => a.eventType === 'malfunction');

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="p-4 border-b border-stone-200 bg-red-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg">
            <AlertOctagon className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-stone-900">MAUDE Hazard Monitor</h3>
            <p className="text-xs text-stone-500">Marking crevasses in competitor trails</p>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2 p-3 bg-stone-50 border-b border-stone-200">
        <div
          className={cn(
            'p-2 rounded-lg text-center',
            deaths.length > 0 ? 'bg-red-100' : 'bg-stone-100'
          )}
        >
          <p
            className={cn(
              'text-lg font-semibold',
              deaths.length > 0 ? 'text-red-700' : 'text-stone-400'
            )}
          >
            {deaths.length}
          </p>
          <p className="text-xs text-stone-500">Deaths</p>
        </div>
        <div
          className={cn(
            'p-2 rounded-lg text-center',
            injuries.length > 0 ? 'bg-amber-100' : 'bg-stone-100'
          )}
        >
          <p
            className={cn(
              'text-lg font-semibold',
              injuries.length > 0 ? 'text-amber-700' : 'text-stone-400'
            )}
          >
            {injuries.length}
          </p>
          <p className="text-xs text-stone-500">Injuries</p>
        </div>
        <div className="p-2 rounded-lg text-center bg-stone-100">
          <p className="text-lg font-semibold text-stone-600">{malfunctions.length}</p>
          <p className="text-xs text-stone-500">Malfunctions</p>
        </div>
      </div>

      {/* Alert List */}
      <div className="max-h-[300px] overflow-y-auto">
        {alerts.slice(0, 10).map(alert => (
          <button
            key={alert.id}
            onClick={() => onAlertClick?.(alert)}
            className={cn(
              'w-full p-3 text-left border-b border-stone-200 hover:bg-stone-50 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none',
              alert.eventType === 'death' && 'border-l-4 border-l-red-500',
              alert.eventType === 'injury' && 'border-l-4 border-l-amber-500',
              alert.eventType === 'malfunction' && 'border-l-4 border-l-blue-500'
            )}
          >
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'px-2 py-0.5 text-xs font-semibold rounded uppercase',
                    alert.eventType === 'death' && 'bg-red-100 text-red-700',
                    alert.eventType === 'injury' && 'bg-amber-100 text-amber-700',
                    alert.eventType === 'malfunction' && 'bg-blue-100 text-blue-700'
                  )}
                >
                  {alert.eventType}
                </span>
                {alert.isCompetitor && (
                  <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                    COMPETITOR
                  </span>
                )}
              </div>
              <span className="text-xs text-stone-400 font-mono">
                {formatDate(alert.eventDate)}
              </span>
            </div>
            <p className="text-sm font-medium text-stone-900">{alert.deviceName}</p>
            <p className="text-xs text-stone-500">
              {alert.manufacturer} • {alert.brandName}
            </p>
            <p className="text-xs text-stone-600 mt-1 line-clamp-2">{alert.narrative}</p>
          </button>
        ))}

        {alerts.length === 0 && (
          <div className="p-8 text-center">
            <Shield className="w-12 h-12 text-green-300 mx-auto mb-3" />
            <p className="text-sm text-stone-500">No hazards detected</p>
            <p className="text-xs text-stone-400">The path looks clear</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// eSTAR PROGRESS TRACKER
// ═══════════════════════════════════════════════════════════════════════════════

const ESTARProgressTracker: React.FC<{
  submission: DeviceSubmission;
}> = ({ submission }) => {
  const sections = submission.estarSections || [];
  const completed = sections.filter(s => s.status === 'complete').length;
  const total = sections.filter(s => s.status !== 'na').length;

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="p-4 border-b border-stone-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-cyan-600" />
            <h3 className="text-sm font-semibold text-stone-900">eSTAR Submission</h3>
          </div>
          <span className="text-sm font-semibold text-cyan-600">{submission.estarProgress}%</span>
        </div>

        {/* Progress Bar */}
        <div className="h-3 bg-stone-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-150"
            style={{ width: `${submission.estarProgress}%` }}
          />
        </div>
        <p className="text-xs text-stone-500 mt-2">
          {completed} of {total} sections complete
        </p>
      </div>

      {/* Section List */}
      <div className="max-h-[250px] overflow-y-auto">
        {sections.map(section => (
          <div
            key={section.id}
            className={cn(
              'px-4 py-2 border-b border-stone-200 flex items-center justify-between',
              section.status === 'complete' && 'bg-green-50',
              section.status === 'in_progress' && 'bg-blue-50'
            )}
          >
            <div className="flex items-center gap-2">
              {section.status === 'complete' && <CheckCircle className="w-4 h-4 text-green-500" />}
              {section.status === 'in_progress' && <Clock className="w-4 h-4 text-blue-500" />}
              {section.status === 'not_started' && (
                <div className="w-4 h-4 rounded-full border-2 border-stone-300" />
              )}
              {section.status === 'na' && (
                <span className="w-4 h-4 text-center text-xs text-stone-400">—</span>
              )}
              <div>
                <span className="text-xs font-mono text-stone-500">{section.sectionNumber}</span>
                <p className="text-sm text-stone-700">{section.title}</p>
              </div>
            </div>
            {section.status !== 'na' && (
              <div className="text-right">
                <span
                  className={cn(
                    'text-xs font-medium',
                    section.completionPct === 100 ? 'text-green-600' : 'text-stone-500'
                  )}
                >
                  {section.completionPct}%
                </span>
                {section.requiredAttachments > 0 && (
                  <p className="text-xs text-stone-400">
                    {section.uploadedAttachments}/{section.requiredAttachments} files
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMISSION CARD
// ═══════════════════════════════════════════════════════════════════════════════

const SubmissionCard: React.FC<{
  submission: DeviceSubmission;
  onClick?: () => void;
}> = ({ submission, onClick }) => {
  const pathwayConfig = PATHWAY_CONFIG[submission.pathway];
  const statusConfig = STATUS_CONFIG[submission.status];
  const daysToTarget = submission.targetSubmissionDate
    ? getDaysUntil(submission.targetSubmissionDate)
    : null;

  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-xl border border-stone-200 p-4 text-left hover:shadow-md hover:border-blue-300 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'px-2 py-1 text-xs font-semibold rounded',
              pathwayConfig.bgColor,
              pathwayConfig.color
            )}
          >
            {pathwayConfig.label}
          </span>
          <span className="px-2 py-0.5 text-xs font-medium text-stone-500 bg-stone-100 rounded">
            Class {submission.deviceClass}
          </span>
        </div>
        <span
          className={cn(
            'px-2 py-1 text-xs font-medium rounded',
            statusConfig.bgColor,
            statusConfig.color
          )}
        >
          {statusConfig.label}
        </span>
      </div>

      {/* Device Info */}
      <h3 className="font-semibold text-stone-900 mb-1">{submission.projectName}</h3>
      <p className="text-sm text-stone-600 mb-3">{submission.deviceName}</p>

      {/* Predicate (if 510k) */}
      {submission.pathway === '510k' && submission.predicateDevice && (
        <div className="p-2 bg-blue-50 rounded-lg mb-3">
          <p className="text-xs font-medium text-blue-600 mb-1">PREDICATE</p>
          <p className="text-xs font-medium text-stone-900">{submission.predicateDevice.kNumber}</p>
          <p className="text-xs text-stone-500">{submission.predicateDevice.deviceName}</p>
        </div>
      )}

      {/* Progress */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-stone-400">eSTAR</p>
            <p className="font-semibold text-stone-900">{submission.estarProgress}%</p>
          </div>
          <div>
            <p className="text-stone-400">Tests</p>
            <p className="font-semibold text-stone-900">
              {submission.completedTests.length}/{submission.requiredTests.length}
            </p>
          </div>
        </div>

        {daysToTarget !== null && (
          <div
            className={cn(
              'px-3 py-1.5 rounded-lg text-right',
              daysToTarget <= 14 && 'bg-red-50',
              daysToTarget > 14 && daysToTarget <= 30 && 'bg-amber-50',
              daysToTarget > 30 && 'bg-stone-50'
            )}
          >
            <p
              className={cn(
                'text-lg font-semibold',
                daysToTarget <= 14 && 'text-red-600',
                daysToTarget > 14 && daysToTarget <= 30 && 'text-amber-600',
                daysToTarget > 30 && 'text-stone-600'
              )}
            >
              {daysToTarget}d
            </p>
            <p className="text-xs text-stone-500">to submit</p>
          </div>
        )}
      </div>
    </button>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// CER TRACKER (EU MDR)
// ═══════════════════════════════════════════════════════════════════════════════

const CERTracker: React.FC<{
  documents: CERDocument[];
}> = ({ documents }) => {
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="p-4 border-b border-stone-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-100 rounded-lg">
            <Globe className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-stone-900">Clinical Evaluation Reports</h3>
            <p className="text-xs text-stone-500">EU MDR Compliance</p>
          </div>
        </div>
      </div>

      <div className="max-h-[250px] overflow-y-auto">
        {documents.map(doc => (
          <div key={doc.id} className="p-3 border-b border-stone-200 hover:bg-stone-50">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-stone-900">{doc.deviceName}</p>
                <p className="text-xs text-stone-500">
                  v{doc.version} • {formatDate(doc.lastUpdated)}
                </p>
              </div>
              {doc.mdrCompliant ? (
                <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  MDR
                </span>
              ) : (
                <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded">
                  In Progress
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs text-stone-500">
              <span>
                GSPR: {doc.gspr}/{doc.totalGspr}
              </span>
              <span>•</span>
              <span>{doc.articlesReviewed} articles</span>
              <span>•</span>
              <span>{doc.clinicalStudies} studies</span>
            </div>
          </div>
        ))}

        {documents.length === 0 && (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 text-stone-400 mx-auto mb-3" />
            <p className="text-sm text-stone-500">No CER documents</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const MedicalDeviceDashboard: React.FC<MedicalDeviceDashboardProps> = ({
  submissions,
  maudeAlerts,
  cerDocuments,
  onSubmissionClick,
  onPredicateSearch,
  onAlertClick,
  className,
}) => {
  const [selectedSubmission, setSelectedSubmission] = useState<DeviceSubmission | null>(
    submissions[0] || null
  );

  // Metrics
  const metrics = useMemo(() => {
    const in510k = submissions.filter(s => s.pathway === '510k');
    const inPMA = submissions.filter(s => s.pathway === 'pma');
    const submitted = submissions.filter(
      s => s.status === 'submitted' || s.status === 'fda_review'
    );
    const needsAction = submissions.filter(s => s.status === 'additional_info');
    const criticalAlerts = maudeAlerts.filter(
      a => a.eventType === 'death' || a.eventType === 'injury'
    );

    return {
      total510k: in510k.length,
      totalPMA: inPMA.length,
      submitted: submitted.length,
      needsAction: needsAction.length,
      criticalAlerts: criticalAlerts.length,
    };
  }, [submissions, maudeAlerts]);

  return (
    <div className={cn('flex flex-col h-full bg-stone-50', className)}>
      {/* Header - THE SHERPA BANNER */}
      <div className="flex-shrink-0 bg-stone-900 text-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-xl backdrop-blur">
              <Mountain className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Medical Device Regulatory Pathfinder</h1>
              <p className="text-blue-200 text-sm">Your Sherpa to FDA Clearance</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="px-4 py-2 text-sm font-medium bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none flex items-center gap-2">
              <Database className="w-4 h-4" />
              MAUDE Search
            </button>
            <button className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none flex items-center gap-2">
              <Flag className="w-4 h-4" />
              New Submission
            </button>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-5 gap-4">
          <div className="p-3 bg-white/10 rounded-xl backdrop-blur">
            <p className="text-xs text-blue-200">510(k) Active</p>
            <p className="text-2xl font-semibold">{metrics.total510k}</p>
          </div>
          <div className="p-3 bg-white/10 rounded-xl backdrop-blur">
            <p className="text-xs text-blue-200">PMA Active</p>
            <p className="text-2xl font-semibold">{metrics.totalPMA}</p>
          </div>
          <div className="p-3 bg-white/10 rounded-xl backdrop-blur">
            <p className="text-xs text-blue-200">Submitted</p>
            <p className="text-2xl font-semibold">{metrics.submitted}</p>
          </div>
          <div
            className={cn(
              'p-3 rounded-xl',
              metrics.needsAction > 0 ? 'bg-amber-500/30' : 'bg-white/10'
            )}
          >
            <p className="text-xs text-amber-200">Needs Action</p>
            <p className="text-2xl font-semibold">{metrics.needsAction}</p>
          </div>
          <div
            className={cn(
              'p-3 rounded-xl',
              metrics.criticalAlerts > 0 ? 'bg-red-500/30' : 'bg-white/10'
            )}
          >
            <p className="text-xs text-red-200">MAUDE Alerts</p>
            <p className="text-2xl font-semibold">{metrics.criticalAlerts}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-3 gap-6">
          {/* Left: Submissions */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-stone-700 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Active Submissions
            </h2>
            {submissions.map(sub => (
              <SubmissionCard
                key={sub.id}
                submission={sub}
                onClick={() => {
                  setSelectedSubmission(sub);
                  onSubmissionClick?.(sub);
                }}
              />
            ))}
          </div>

          {/* Center: Selected Submission Detail */}
          <div className="space-y-6">
            {selectedSubmission ? (
              <>
                {selectedSubmission.pathway === '510k' && (
                  <PredicatePathfinder
                    submission={selectedSubmission}
                    onPredicateSearch={() => onPredicateSearch?.(selectedSubmission)}
                  />
                )}
                <ESTARProgressTracker submission={selectedSubmission} />
              </>
            ) : (
              <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
                <Compass className="w-12 h-12 text-stone-400 mx-auto mb-3" />
                <p className="text-stone-500">Select a submission to view details</p>
              </div>
            )}
          </div>

          {/* Right: Monitoring */}
          <div className="space-y-6">
            <MAUDEHazardMonitor alerts={maudeAlerts} onAlertClick={onAlertClick} />
            <CERTracker documents={cerDocuments} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MedicalDeviceDashboard;

// ─── Standalone (self-contained demo entry point for ZenApp) ──────────────────

const DEMO_DEVICE_SUBMISSIONS: DeviceSubmission[] = [
  {
    id: 'sub-001',
    projectName: 'CardioSense Pro 510(k)',
    deviceName: 'CardioSense Pro Cardiac Monitor',
    productCode: 'DPS',
    deviceClass: 'II',
    pathway: '510k',
    status: 'drafting',
    projectStartDate: '2025-09-01',
    targetSubmissionDate: '2026-06-30',
    estarProgress: 42,
    estarSections: [
      {
        id: 'e1',
        sectionNumber: '1',
        title: 'Device Identification',
        status: 'complete',
        completionPct: 100,
        requiredAttachments: 2,
        uploadedAttachments: 2,
      },
      {
        id: 'e2',
        sectionNumber: '2',
        title: 'Indications for Use',
        status: 'complete',
        completionPct: 100,
        requiredAttachments: 1,
        uploadedAttachments: 1,
      },
      {
        id: 'e3',
        sectionNumber: '3',
        title: 'Substantial Equivalence',
        status: 'in_progress',
        completionPct: 60,
        requiredAttachments: 4,
        uploadedAttachments: 2,
      },
      {
        id: 'e4',
        sectionNumber: '4',
        title: 'Performance Testing',
        status: 'not_started',
        completionPct: 0,
        requiredAttachments: 6,
        uploadedAttachments: 0,
      },
    ],
    testingStatus: 'in_progress',
    requiredTests: [
      'Electrical Safety (IEC 60601)',
      'EMC Testing (IEC 60601-1-2)',
      'Biocompatibility (ISO 10993)',
      'Software Validation (IEC 62304)',
      'Cybersecurity (FDA 2023 Guidance)',
    ],
    completedTests: ['Electrical Safety (IEC 60601)', 'Biocompatibility (ISO 10993)'],
    cerRequired: true,
    cerStatus: 'drafting',
    projectLead: 'Dr. Sarah Chen',
    raSpecialist: 'James Mitchell, RAC',
  },
  {
    id: 'sub-002',
    projectName: 'OncoDx PMA Application',
    deviceName: 'OncoDx Companion Diagnostic',
    productCode: 'PYP',
    deviceClass: 'III',
    pathway: 'pma',
    status: 'internal_review',
    projectStartDate: '2024-03-15',
    targetSubmissionDate: '2026-12-01',
    estarProgress: 78,
    estarSections: [
      {
        id: 'e5',
        sectionNumber: '1',
        title: 'Administrative',
        status: 'complete',
        completionPct: 100,
        requiredAttachments: 5,
        uploadedAttachments: 5,
      },
      {
        id: 'e6',
        sectionNumber: '2',
        title: 'Nonclinical Studies',
        status: 'complete',
        completionPct: 100,
        requiredAttachments: 8,
        uploadedAttachments: 8,
      },
      {
        id: 'e7',
        sectionNumber: '3',
        title: 'Clinical Studies',
        status: 'in_progress',
        completionPct: 75,
        requiredAttachments: 10,
        uploadedAttachments: 7,
      },
    ],
    testingStatus: 'complete',
    requiredTests: [
      'Analytical Validation',
      'Clinical Validation',
      'Biocompatibility',
      'Software Validation',
    ],
    completedTests: [
      'Analytical Validation',
      'Clinical Validation',
      'Biocompatibility',
      'Software Validation',
    ],
    cerRequired: false,
    projectLead: 'Dr. Marcus Rivera',
    raSpecialist: 'Linda Park, RAC-D',
  },
];

const DEMO_MAUDE_ALERTS: MAUDEAlert[] = [
  {
    id: 'm1',
    reportNumber: 'MW2026-0814',
    eventDate: '2026-01-15',
    eventType: 'malfunction',
    deviceName: 'CardioTrack ECG Monitor',
    manufacturer: 'MedVision Corp',
    productCode: 'DPS',
    brandName: 'CardioTrack 3000',
    narrative:
      'Device displayed incorrect arrhythmia alert at rest. Patient was not harmed. Firmware version 2.4.1 identified as root cause.',
    relevanceScore: 87,
    isCompetitor: true,
  },
  {
    id: 'm2',
    reportNumber: 'MW2026-0921',
    eventDate: '2026-02-03',
    eventType: 'injury',
    deviceName: 'PulseGuard Wearable Monitor',
    manufacturer: 'HealthStream Inc',
    productCode: 'DTB',
    brandName: 'PulseGuard X2',
    narrative:
      'Mild skin irritation reported after 72-hour continuous wear. Resolved without treatment.',
    relevanceScore: 52,
    isCompetitor: false,
  },
];

const DEMO_CER_DOCUMENTS: CERDocument[] = [
  {
    id: 'c1',
    deviceId: 'sub-001',
    deviceName: 'CardioSense Pro Cardiac Monitor',
    version: '1.0 DRAFT',
    status: 'literature_review',
    lastUpdated: '2026-02-28',
    mdrCompliant: false,
    gspr: 14,
    totalGspr: 23,
    articlesReviewed: 47,
    clinicalStudies: 8,
    pmsData: false,
  },
];

export const MedicalDeviceDashboardStandalone: React.FC = () => (
  <MedicalDeviceDashboard
    submissions={DEMO_DEVICE_SUBMISSIONS}
    maudeAlerts={DEMO_MAUDE_ALERTS}
    cerDocuments={DEMO_CER_DOCUMENTS}
  />
);
