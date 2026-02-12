/**
 * CERV2ReviewWorkflow — Phase 9 P3
 *
 * Document review and approval workflow with electronic signatures.
 * States: Draft → In Review → Approved → Released
 * Captures: typed name + date as e-signature.
 * Maintains audit trail of all state transitions.
 */
import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ClipboardCheck,
  ArrowRight,
  RotateCcw,
  PenLine,
  Shield,
  CheckCircle2,
  Clock,
  FileCheck,
  Send,
} from 'lucide-react';

const STATES = {
  draft: {
    label: 'Draft',
    color: 'bg-slate-100 text-slate-700 border-slate-300',
    icon: PenLine,
    next: 'review',
    nextLabel: 'Submit for Review',
    requiresSignature: false,
  },
  review: {
    label: 'In Review',
    color: 'bg-amber-100 text-amber-700 border-amber-300',
    icon: Clock,
    next: 'approved',
    nextLabel: 'Approve',
    requiresSignature: true,
  },
  approved: {
    label: 'Approved',
    color: 'bg-green-100 text-green-700 border-green-300',
    icon: CheckCircle2,
    next: 'released',
    nextLabel: 'Release',
    requiresSignature: true,
  },
  released: {
    label: 'Released',
    color: 'bg-blue-100 text-blue-700 border-blue-300',
    icon: Shield,
    next: null,
    nextLabel: null,
    requiresSignature: false,
  },
};

function formatTimestamp(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Props:
 *   reviewState — { status, auditTrail: [{ from, to, signedBy, date, comment }] }
 *   onReviewStateChange — update review state
 *   readinessScore — overall export readiness (0-100)
 *   visible / onToggle
 */
export default function CERV2ReviewWorkflow({
  reviewState,
  onReviewStateChange,
  readinessScore,
  visible,
  onToggle,
}) {
  const [sigName, setSigName] = useState('');
  const [comment, setComment] = useState('');
  const [showRevert, setShowRevert] = useState(false);

  const currentStatus = reviewState?.status || 'draft';
  const auditTrail = reviewState?.auditTrail || [];
  const stateCfg = STATES[currentStatus];
  const StateIcon = stateCfg.icon;

  const canAdvance = (() => {
    if (!stateCfg.next) return false;
    if (stateCfg.requiresSignature && !sigName.trim()) return false;
    // Require minimum readiness for review submission
    if (currentStatus === 'draft' && readinessScore < 30) return false;
    return true;
  })();

  const handleAdvance = useCallback(() => {
    const next = stateCfg.next;
    if (!next) return;

    const entry = {
      from: currentStatus,
      to: next,
      signedBy: sigName.trim() || null,
      date: new Date().toISOString(),
      comment: comment.trim() || null,
    };

    onReviewStateChange({
      status: next,
      auditTrail: [...auditTrail, entry],
    });

    setSigName('');
    setComment('');
  }, [currentStatus, stateCfg, sigName, comment, auditTrail, onReviewStateChange]);

  const handleRevert = useCallback(() => {
    const entry = {
      from: currentStatus,
      to: 'draft',
      signedBy: sigName.trim() || 'System',
      date: new Date().toISOString(),
      comment: comment.trim() || 'Reverted to draft',
    };

    onReviewStateChange({
      status: 'draft',
      auditTrail: [...auditTrail, entry],
    });

    setSigName('');
    setComment('');
    setShowRevert(false);
  }, [currentStatus, sigName, comment, auditTrail, onReviewStateChange]);

  // Collapsed
  if (!visible) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-md hover:bg-slate-50 transition-colors"
      >
        <ClipboardCheck className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-slate-700">Review</span>
        <Badge className={`text-[10px] px-1.5 py-0 ${stateCfg.color}`}>{stateCfg.label}</Badge>
      </button>
    );
  }

  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-slate-600" />
          <span className="font-semibold text-sm text-slate-800">Review Workflow</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onToggle} className="h-7 px-2 text-xs">
          Close
        </Button>
      </div>

      {/* Current state */}
      <div className="p-4 border-b">
        {/* Progress bar */}
        <div className="flex items-center gap-1 mb-3">
          {Object.entries(STATES).map(([key, cfg], idx) => {
            const Icon = cfg.icon;
            const isActive = key === currentStatus;
            const isPast =
              Object.keys(STATES).indexOf(key) < Object.keys(STATES).indexOf(currentStatus);
            return (
              <React.Fragment key={key}>
                {idx > 0 && (
                  <div className={`flex-1 h-0.5 ${isPast ? 'bg-green-400' : 'bg-slate-200'}`} />
                )}
                <div
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${
                    isActive
                      ? cfg.color + ' ring-2 ring-offset-1 ring-blue-300'
                      : isPast
                        ? 'bg-green-50 text-green-600'
                        : 'bg-slate-50 text-slate-400'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {cfg.label}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Action area */}
        {stateCfg.next && (
          <div className="space-y-2">
            {stateCfg.requiresSignature && (
              <div>
                <Label className="text-[10px] text-slate-500">
                  Electronic Signature (type your full name)
                </Label>
                <Input
                  value={sigName}
                  onChange={e => setSigName(e.target.value)}
                  placeholder="e.g. Dr. Jane Smith"
                  className="h-8 text-xs mt-0.5"
                />
              </div>
            )}

            <div>
              <Label className="text-[10px] text-slate-500">Comment (optional)</Label>
              <Input
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Add a note..."
                className="h-8 text-xs mt-0.5"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleAdvance}
                disabled={!canAdvance}
                size="sm"
                className="h-8 text-xs gap-1"
              >
                {stateCfg.next === 'review' && <Send className="w-3 h-3" />}
                {stateCfg.next === 'approved' && <CheckCircle2 className="w-3 h-3" />}
                {stateCfg.next === 'released' && <Shield className="w-3 h-3" />}
                {stateCfg.nextLabel}
              </Button>

              {currentStatus !== 'draft' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs gap-1 text-slate-500"
                  onClick={() => setShowRevert(true)}
                >
                  <RotateCcw className="w-3 h-3" /> Revert to Draft
                </Button>
              )}
            </div>

            {currentStatus === 'draft' && readinessScore < 30 && (
              <p className="text-[10px] text-amber-600">
                Readiness score must be at least 30% to submit for review (currently{' '}
                {readinessScore}%).
              </p>
            )}
          </div>
        )}

        {!stateCfg.next && (
          <div className="text-center py-2">
            <Shield className="w-8 h-8 text-blue-500 mx-auto mb-1" />
            <p className="text-xs font-semibold text-blue-700">Document Released</p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              This document has been released and is now read-only.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-7 text-xs gap-1"
              onClick={() => setShowRevert(true)}
            >
              <RotateCcw className="w-3 h-3" /> Revert to Draft
            </Button>
          </div>
        )}

        {/* Revert confirmation */}
        {showRevert && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
            <p className="text-xs text-red-700 font-medium">Revert to Draft?</p>
            <p className="text-[10px] text-red-600 mb-2">
              This will reset the workflow state. An audit trail entry will be recorded.
            </p>
            <div className="flex gap-1.5">
              <Button
                variant="destructive"
                size="sm"
                className="h-6 text-xs"
                onClick={handleRevert}
              >
                Confirm Revert
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setShowRevert(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Audit trail */}
      <div className="px-4 py-2 border-b bg-slate-50">
        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
          Audit Trail
        </p>
      </div>
      <ScrollArea className="max-h-36">
        <div className="p-2">
          {auditTrail.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">No transitions recorded yet.</p>
          )}

          {[...auditTrail].reverse().map((entry, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 px-2 py-1.5 text-xs border-b last:border-0"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-slate-700">
                  <span className="font-medium">{STATES[entry.from]?.label}</span>
                  {' → '}
                  <span className="font-medium">{STATES[entry.to]?.label}</span>
                </p>
                <p className="text-[10px] text-slate-500">
                  {entry.signedBy && <span>by {entry.signedBy} · </span>}
                  {formatTimestamp(entry.date)}
                </p>
                {entry.comment && (
                  <p className="text-[10px] text-slate-400 italic mt-0.5">{entry.comment}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
