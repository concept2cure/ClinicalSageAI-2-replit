/**
 * Document Sherpa - The AI Guide That Anticipates Your Needs
 * 
 * Phase 5: Intelligent Document System
 * 
 * "Trying to submit an FDA application without Concept2Cure is like trying 
 * to climb Everest without a Sherpa."
 * 
 * The Sherpa doesn't wait for you to ask. It TELLS you what to do next,
 * warns you about dangers ahead, and carries the heavy lifting.
 */

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle,
  ArrowRight,
  Clock,
  Shield,
  Link2,
  Users,
  Zap,
  Mountain,
  Flag,
  Compass,
  AlertOctagon,
} from 'lucide-react';
import type {
  SherpaGuidance,
  DocumentBlocker,
  IntelligentDocument,
  DataBridgeConnection,
  ComplianceGuard,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface DocumentSherpaProps {
  // Current document state
  document: IntelligentDocument | null;
  
  // Workflow context
  submissionType: 'IND' | '510K' | 'NDA' | 'BLA' | 'PMA' | 'CER' | 'MAA' | 'DE_NOVO';
  workflowStep: number;
  totalSteps: number;
  
  // Connected data status
  dataBridges: DataBridgeConnection[];
  
  // Compliance status
  complianceGuards: ComplianceGuard[];
  complianceScore: number;
  
  // Claim status
  totalClaims: number;
  supportedClaims: number;
  unsupportedClaims: number;
  
  // Team status (optional)
  pendingReviews?: number;
  pendingApprovals?: number;
  
  // Callbacks
  onGuidanceAction: (guidance: SherpaGuidance) => void;
  onBlockerAction: (blocker: DocumentBlocker) => void;
  
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Journey Progress Component
// ─────────────────────────────────────────────────────────────────────────────

const JourneyProgress: React.FC<{
  currentStep: number;
  totalSteps: number;
  submissionType: string;
  completionPercent: number;
}> = ({ currentStep, totalSteps, submissionType, completionPercent }) => {
  return (
    <div className="relative p-4 bg-stone-900 rounded-xl text-white shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mountain className="w-5 h-5" />
          <span className="font-semibold">{submissionType} Journey</span>
        </div>
        <div className="flex items-center gap-1 text-sm opacity-90">
          <Flag className="w-4 h-4" />
          Step {currentStep} of {totalSteps}
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="relative h-3 bg-white/20 rounded-full overflow-hidden mb-2">
        <div 
          className="absolute inset-y-0 left-0 bg-white rounded-full transition-all duration-200"
          style={{ width: `${completionPercent}%` }}
        />
        {/* Step markers */}
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border-2 border-white
              ${i < currentStep ? 'bg-white' : 'bg-transparent'}`}
            style={{ left: `${((i + 1) / totalSteps) * 100}%`, transform: 'translate(-50%, -50%)' }}
          />
        ))}
      </div>
      
      <div className="flex items-center justify-between text-sm">
        <span className="opacity-90">{completionPercent}% complete</span>
        <span className="flex items-center gap-1 opacity-90">
          <Clock className="w-3.5 h-3.5" />
          Est. 2 weeks to summit
        </span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Hazard Alert Component - Dangers ahead!
// ─────────────────────────────────────────────────────────────────────────────

const HazardAlert: React.FC<{
  blockers: DocumentBlocker[];
  onAction: (blocker: DocumentBlocker) => void;
}> = ({ blockers, onAction }) => {
  if (blockers.length === 0) return null;
  
  const criticalBlockers = blockers.filter(b => b.severity === 'critical');
  const majorBlockers = blockers.filter(b => b.severity === 'major');
  
  return (
    <div className="p-4 bg-red-50/60 rounded-xl border border-red-200">
      <div className="flex items-center gap-2 mb-3">
        <AlertOctagon className="w-5 h-5 text-red-500" />
        <span className="font-semibold text-red-700">
          Hazard Ahead: {blockers.length} Blocker{blockers.length > 1 ? 's' : ''}
        </span>
      </div>
      
      {criticalBlockers.length > 0 && (
        <div className="mb-3">
          <span className="text-xs font-medium text-red-600 uppercase tracking-wider">
            Critical - Must Fix Now
          </span>
          {criticalBlockers.map(blocker => (
            <div key={blocker.id} className="mt-2 p-3 bg-red-100 rounded-lg">
              <p className="font-medium text-red-800">{blocker.title}</p>
              <p className="text-sm text-red-600 mt-1">{blocker.description}</p>
              <button
                onClick={() => onAction(blocker)}
                data-testid={`button-blocker-action-${blocker.id}`}
              >
                <Zap className="w-3.5 h-3.5" />
                {blocker.resolution}
              </button>
            </div>
          ))}
        </div>
      )}
      
      {majorBlockers.length > 0 && (
        <div>
          <span className="text-xs font-medium text-amber-600 uppercase tracking-wider">
            Major - Address Soon
          </span>
          {majorBlockers.map(blocker => (
            <div key={blocker.id} className="mt-2 p-3 bg-amber-50 rounded-lg">
              <p className="font-medium text-amber-800">{blocker.title}</p>
              <p className="text-sm text-amber-600 mt-1">{blocker.description}</p>
              <button
                onClick={() => onAction(blocker)}
                className="mt-2 flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800"
                data-testid={`button-blocker-action-${blocker.id}`}
              >
                <ArrowRight className="w-3.5 h-3.5" />
                {blocker.resolution}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Next Best Action Card - The Sherpa's recommendation
// ─────────────────────────────────────────────────────────────────────────────

const NextBestActionCard: React.FC<{
  guidance: SherpaGuidance;
  onAction: () => void;
}> = ({ guidance, onAction }) => {
  return (
    <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 bg-stone-600 rounded-lg">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="text-xs font-medium text-blue-600 uppercase tracking-wider">
            AnA Guided Authoring Recommends
          </span>
          <h3 className="font-semibold text-stone-900">
            {guidance.title}
          </h3>
        </div>
      </div>
      
      <p className="text-sm text-stone-600 mb-3">
        {guidance.description}
      </p>
      
      <div className="flex items-center gap-4 mb-4 text-xs">
        <span className="flex items-center gap-1 text-stone-500">
          <Clock className="w-3.5 h-3.5" />
          {guidance.estimatedTime}
        </span>
        <span className="flex items-center gap-1 text-green-600">
          <CheckCircle className="w-3.5 h-3.5" />
          {guidance.expectedOutcome}
        </span>
      </div>
      
      <button
        onClick={onAction}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-stone-800 text-white rounded-lg font-medium hover:bg-stone-900 transition-colors duration-150"
        data-testid={`button-next-best-action-${guidance.id}`}
      >
        <ArrowRight className="w-4 h-4" />
        Do This Now
      </button>
      
      <p className="text-xs text-stone-500 mt-2 text-center italic">
        "{guidance.rationale}"
      </p>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Status Dashboard - Quick health check
// ─────────────────────────────────────────────────────────────────────────────

const StatusDashboard: React.FC<{
  complianceScore: number;
  totalClaims: number;
  supportedClaims: number;
  dataBridges: DataBridgeConnection[];
  pendingReviews?: number;
}> = ({ complianceScore, totalClaims, supportedClaims, dataBridges, pendingReviews }) => {
  const connectedModules = dataBridges.filter(b => b.status === 'connected').length;
  const claimPercent = totalClaims > 0 ? Math.round((supportedClaims / totalClaims) * 100) : 100;
  
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Compliance Score */}
      <div className={`p-3 rounded-xl border shadow-sm ${
        complianceScore >= 90 
          ? 'bg-green-50 border-green-200' 
          : complianceScore >= 70
          ? 'bg-amber-50 border-amber-200'
          : 'bg-red-50 border-red-200'
      }`}>
        <div className="flex items-center gap-2 mb-1">
          <Shield className={`w-4 h-4 ${
            complianceScore >= 90 ? 'text-green-500' : complianceScore >= 70 ? 'text-amber-500' : 'text-red-500'
          }`} />
          <span className="text-xs font-medium text-stone-600">Compliance</span>
        </div>
        <p className={`text-base font-semibold ${
          complianceScore >= 90 ? 'text-green-600' 
          : complianceScore >= 70 ? 'text-amber-600' 
          : 'text-red-600'
        }`}>
          {complianceScore}%
        </p>
      </div>
      
      {/* Claims Status */}
      <div className={`p-3 rounded-xl border shadow-sm ${
        claimPercent >= 90 
          ? 'bg-green-50 border-green-200' 
          : 'bg-amber-50 border-amber-200'
      }`}>
        <div className="flex items-center gap-2 mb-1">
          <Link2 className={`w-4 h-4 ${claimPercent >= 90 ? 'text-green-500' : 'text-amber-500'}`} />
          <span className="text-xs font-medium text-stone-600">Claims Sourced</span>
        </div>
        <p className={`text-base font-semibold ${
          claimPercent >= 90 ? 'text-green-600' : 'text-amber-600'
        }`}>
          {supportedClaims}/{totalClaims}
        </p>
      </div>
      
      {/* Data Connections */}
      <div className="p-3 rounded-xl border bg-blue-50 border-blue-200 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Compass className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-medium text-stone-600">Data Sources</span>
        </div>
        <p className="text-base font-semibold text-blue-600">
          {connectedModules}
        </p>
      </div>
      
      {/* Pending Reviews */}
      {pendingReviews !== undefined && (
        <div className={`p-3 rounded-xl border shadow-sm ${
          pendingReviews === 0 
            ? 'bg-green-50 border-green-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <Users className={`w-4 h-4 ${pendingReviews === 0 ? 'text-green-500' : 'text-amber-500'}`} />
            <span className="text-xs font-medium text-stone-600">Reviews</span>
          </div>
          <p className={`text-base font-semibold ${
            pendingReviews === 0 ? 'text-green-600' : 'text-amber-600'
          }`}>
            {pendingReviews}
          </p>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Upcoming Actions List
// ─────────────────────────────────────────────────────────────────────────────

const UpcomingActionsList: React.FC<{
  guidance: SherpaGuidance[];
  onAction: (g: SherpaGuidance) => void;
}> = ({ guidance, onAction }) => {
  const upcomingActions = guidance.slice(1); // Skip the first (next best action)
  
  if (upcomingActions.length === 0) return null;
  
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-stone-500 uppercase tracking-wider">
        Coming Up Next
      </h4>
      {upcomingActions.map((g, i) => (
        <button
          key={g.id}
          onClick={() => onAction(g)}
          className="w-full flex items-center gap-3 p-3 bg-white rounded-lg border border-stone-200 hover:border-blue-300 transition-colors text-left"
          data-testid={`button-upcoming-action-${g.id}`}
        >
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
            ${g.priority === 'high' 
              ? 'bg-blue-100 text-blue-600' 
              : 'bg-stone-100 text-stone-600'
            }`}
          >
            {i + 2}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-stone-700 truncate">
              {g.title}
            </p>
            <p className="text-xs text-stone-500">
              {g.estimatedTime}
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-stone-400" />
        </button>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Document Sherpa Component
// ─────────────────────────────────────────────────────────────────────────────

export const DocumentSherpa: React.FC<DocumentSherpaProps> = ({
  document,
  submissionType,
  workflowStep,
  totalSteps,
  dataBridges,
  complianceGuards: _complianceGuards,
  complianceScore,
  totalClaims,
  supportedClaims,
  unsupportedClaims,
  pendingReviews,
  pendingApprovals,
  onGuidanceAction,
  onBlockerAction,
  className = '',
}) => {
  // Generate intelligent guidance based on current state
  const [guidance, setGuidance] = useState<SherpaGuidance[]>([]);
  const [blockers, setBlockers] = useState<DocumentBlocker[]>([]);
  
  // Analyze state and generate guidance
  useEffect(() => {
    const newGuidance: SherpaGuidance[] = [];
    const newBlockers: DocumentBlocker[] = [];
    
    // Critical blockers
    if (complianceScore < 50) {
      newBlockers.push({
        id: 'blocker-compliance',
        title: 'Compliance Score Too Low',
        description: 'Your document has significant compliance issues that will prevent submission.',
        blocker: 'Multiple unsupported claims and missing required sections',
        resolution: 'Address compliance issues now',
        severity: 'critical',
      });
    }
    
    // Check for unsupported claims
    if (unsupportedClaims > 0) {
      newGuidance.push({
        id: 'guide-claims',
        priority: 'high',
        title: `Link sources to ${unsupportedClaims} claim${unsupportedClaims > 1 ? 's' : ''}`,
        description: 'Several claims need supporting evidence. The Sherpa has found potential sources from your connected modules.',
        expectedOutcome: 'All claims will be traceable',
        actionType: 'add-sources',
        estimatedTime: `${Math.ceil(unsupportedClaims * 1.5)} min`,
        rationale: 'FDA requires all efficacy and safety claims to be traceable to source data.',
      });
    }
    
    // Check for available data that isn't connected
    const availableBridges = dataBridges.filter(b => b.status === 'available');
    if (availableBridges.length > 0) {
      newGuidance.push({
        id: 'guide-data',
        priority: 'medium',
        title: 'Import available data',
        description: `You have ${availableBridges.length} data source(s) that could strengthen your document.`,
        expectedOutcome: 'More evidence for your claims',
        actionType: 'update-from-module',
        estimatedTime: '2 min',
        rationale: 'Cross-referencing data from multiple sources increases submission quality.',
      });
    }
    
    // Check for pending reviews
    if (pendingReviews && pendingReviews > 0) {
      newGuidance.push({
        id: 'guide-reviews',
        priority: 'medium',
        title: `Complete ${pendingReviews} pending review${pendingReviews > 1 ? 's' : ''}`,
        description: 'Team members have requested your review on document sections.',
        expectedOutcome: 'Document progress continues',
        actionType: 'review',
        estimatedTime: `${pendingReviews * 5} min`,
        rationale: 'Timely reviews keep the submission on track.',
      });
    }
    
    // If compliance is good and claims are sourced, suggest review request
    if (complianceScore >= 90 && unsupportedClaims === 0 && !pendingApprovals) {
      newGuidance.push({
        id: 'guide-submit',
        priority: 'high',
        title: 'Document ready for review',
        description: 'Your document meets compliance requirements. Request a formal review to proceed.',
        expectedOutcome: 'Document moves to approval stage',
        actionType: 'request-review',
        estimatedTime: '1 min',
        rationale: 'All compliance checks passed. You can now request formal review.',
      });
    }
    
    // If nothing else, suggest writing more content
    if (newGuidance.length === 0 && document) {
      newGuidance.push({
        id: 'guide-write',
        priority: 'low',
        title: 'Continue drafting',
        description: 'Keep building your document. The Sherpa will analyze and guide as you write.',
        expectedOutcome: 'More complete submission',
        actionType: 'write-section',
        estimatedTime: 'Ongoing',
        rationale: 'Consistent progress leads to timely submissions.',
      });
    }
    
    setGuidance(newGuidance);
    setBlockers(newBlockers);
  }, [
    complianceScore, 
    unsupportedClaims, 
    dataBridges, 
    pendingReviews, 
    pendingApprovals,
    document
  ]);
  
  const completionPercent = Math.round((workflowStep / totalSteps) * 100);
  const nextBestAction = guidance[0];
  
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Journey Progress */}
      <JourneyProgress
        currentStep={workflowStep}
        totalSteps={totalSteps}
        submissionType={submissionType}
        completionPercent={completionPercent}
      />
      
      {/* Hazard Alerts */}
      {blockers.length > 0 && (
        <HazardAlert blockers={blockers} onAction={onBlockerAction} />
      )}
      
      {/* Status Dashboard */}
      <div className="rounded-xl border border-stone-200/70 bg-white shadow-sm p-4">
        <StatusDashboard
          complianceScore={complianceScore}
          totalClaims={totalClaims}
          supportedClaims={supportedClaims}
          dataBridges={dataBridges}
          pendingReviews={pendingReviews}
        />
      </div>
      
      {/* Next Best Action */}
      {nextBestAction && (
        <div className="rounded-xl border border-stone-200/70 bg-white shadow-sm p-4">
          <NextBestActionCard
            guidance={nextBestAction}
            onAction={() => onGuidanceAction(nextBestAction)}
          />
        </div>
      )}
      
      {/* Upcoming Actions */}
      <div className="rounded-xl border border-stone-200/70 bg-white shadow-sm p-4">
        <UpcomingActionsList
          guidance={guidance}
          onAction={onGuidanceAction}
        />
      </div>
      
      {/* All Clear State */}
      {blockers.length === 0 && guidance.length === 0 && (
        <div className="text-center py-8">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
          <h3 className="font-semibold text-stone-900">All Clear!</h3>
          <p className="text-sm text-stone-600 mt-1">
            Your document is on track. Keep up the great work!
          </p>
        </div>
      )}
    </div>
  );
};

export default DocumentSherpa;
