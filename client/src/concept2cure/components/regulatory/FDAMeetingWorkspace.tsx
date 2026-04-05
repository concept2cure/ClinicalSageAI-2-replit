/**
 * @fileoverview FDA Regulatory Meeting Prep Workspace
 * @module concept2cure/components/regulatory/FDAMeetingWorkspace
 * @version 1.0.0
 *
 * @description
 * Workspace designed around the CRITICAL workflow of FDA meeting preparation.
 * 
 * FDA MEETING REALITY:
 * - Pre-IND, EOP2, Pre-NDA meetings are pivotal milestones
 * - Briefing documents have specific format/content requirements
 * - Questions must be strategic and carefully crafted
 * - FDA meeting requests have specific procedural requirements
 * - Type A/B/C meetings have different timelines
 * - Official minutes are binding - need to track commitments
 *
 * KEY USE CASES:
 * 1. "Prepare a Type B Pre-IND meeting package"
 * 2. "Draft questions for the EOP2 meeting"
 * 3. "Track action items from FDA meeting minutes"
 * 4. "What did FDA say about our CMC strategy?"
 * 5. "Generate meeting request letter"
 *
 * MEETING TYPES:
 * - Type A: Time-critical (30 days) - disputes, safety
 * - Type B: Pre-IND, EOP2, Pre-NDA (60 days)
 * - Type C: All others (75 days)
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  FileText,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  MessageSquare,
  ListTodo,
  Users,
  Building2,
  ChevronRight,
  ChevronDown,
  Edit3,
  Send,
  Download,
  Star,
  Flag,
  Target,
  History,
  Search,
  Plus,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - FDA Meeting Specific
// ═══════════════════════════════════════════════════════════════════════════════

export type MeetingType = 'type_a' | 'type_b' | 'type_c';
export type MeetingPurpose = 
  | 'pre_ind'
  | 'eop1'          // End of Phase 1
  | 'eop2'          // End of Phase 2 (critical!)
  | 'pre_nda'       // Pre-NDA/BLA
  | 'pre_bla'
  | 'type_a_safety'
  | 'type_c_other'
  | 'advisory_committee';

export type MeetingStatus = 
  | 'planning'
  | 'request_drafting'
  | 'request_submitted'
  | 'date_pending'
  | 'scheduled'
  | 'briefing_document_drafting'
  | 'briefing_document_submitted'
  | 'fda_response_pending'
  | 'meeting_completed'
  | 'minutes_pending'
  | 'minutes_received'
  | 'closed';

export type QuestionTopic = 
  | 'clinical'
  | 'nonclinical'
  | 'cmc'
  | 'regulatory_strategy'
  | 'safety'
  | 'efficacy'
  | 'labeling'
  | 'pediatric'
  | 'risk_management';

export interface MeetingQuestion {
  id: string;
  number: number;
  topic: QuestionTopic;
  questionText: string;
  backgroundContext: string;
  sponsorPosition?: string;
  fdaResponse?: string;
  fdaResponseDate?: string;
  status: 'draft' | 'finalized' | 'submitted' | 'answered';
  priority: 'critical' | 'high' | 'medium';
  assignedTo?: string;
}

export interface ActionItem {
  id: string;
  meetingId: string;
  description: string;
  owner: 'sponsor' | 'fda';
  assignedTo?: string;
  dueDate?: string;
  status: 'open' | 'in_progress' | 'completed';
  source: 'minutes' | 'discussion' | 'written_response';
  fdaCommitment?: boolean;
  notes?: string;
}

export interface FDAMeeting {
  id: string;
  productId: string;
  productName: string;
  meetingType: MeetingType;
  purpose: MeetingPurpose;
  title: string;
  status: MeetingStatus;
  
  // Key Dates
  requestSubmittedDate?: string;
  fdaAcknowledgementDate?: string;
  scheduledDate?: string;
  briefingDocumentDueDate?: string;
  briefingDocumentSubmittedDate?: string;
  meetingDate?: string;
  minutesReceivedDate?: string;
  
  // FDA Info
  division?: string;
  reviewTeam?: string[];
  fdaMeetingNumber?: string;
  
  // Content
  questions: MeetingQuestion[];
  actionItems: ActionItem[];
  
  // Documents
  requestLetterDraftUrl?: string;
  briefingDocumentUrl?: string;
  fdaResponseUrl?: string;
  minutesUrl?: string;
  
  // Team
  sponsorLead: string;
  attendees: string[];
  
  notes?: string;
}

interface FDAMeetingWorkspaceProps {
  meetings: FDAMeeting[];
  activeMeetingId?: string;
  onMeetingSelect?: (meeting: FDAMeeting) => void;
  onQuestionEdit?: (question: MeetingQuestion, meeting: FDAMeeting) => void;
  onActionItemUpdate?: (actionItem: ActionItem) => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const MEETING_TYPE_CONFIG: Record<MeetingType, {
  label: string;
  responseTime: string;
  color: string;
}> = {
  type_a: { label: 'Type A', responseTime: '30 days', color: 'text-stone-700' },
  type_b: { label: 'Type B', responseTime: '60 days', color: 'text-stone-600' },
  type_c: { label: 'Type C', responseTime: '75 days', color: 'text-stone-600' },
};

const PURPOSE_CONFIG: Record<MeetingPurpose, { label: string; icon: string }> = {
  pre_ind: { label: 'Pre-IND', icon: '📋' },
  eop1: { label: 'End of Phase 1', icon: '1️⃣' },
  eop2: { label: 'End of Phase 2', icon: '2️⃣' },
  pre_nda: { label: 'Pre-NDA', icon: '📑' },
  pre_bla: { label: 'Pre-BLA', icon: '🧬' },
  type_a_safety: { label: 'Safety Issue', icon: '⚠️' },
  type_c_other: { label: 'General', icon: '💬' },
  advisory_committee: { label: 'Advisory Committee', icon: '👥' },
};

const STATUS_CONFIG: Record<MeetingStatus, {
  label: string;
  color: string;
  bgColor: string;
  step: number;
}> = {
  planning: { label: 'Planning', color: 'text-stone-600', bgColor: 'bg-stone-100', step: 1 },
  request_drafting: { label: 'Drafting Request', color: 'text-stone-600', bgColor: 'bg-stone-100', step: 2 },
  request_submitted: { label: 'Request Submitted', color: 'text-stone-600', bgColor: 'bg-stone-200', step: 3 },
  date_pending: { label: 'Awaiting Date', color: 'text-stone-600', bgColor: 'bg-stone-100', step: 4 },
  scheduled: { label: 'Scheduled', color: 'text-stone-700', bgColor: 'bg-stone-100', step: 5 },
  briefing_document_drafting: { label: 'Drafting Briefing Doc', color: 'text-stone-600', bgColor: 'bg-stone-100', step: 6 },
  briefing_document_submitted: { label: 'Briefing Doc Submitted', color: 'text-stone-600', bgColor: 'bg-stone-200', step: 7 },
  fda_response_pending: { label: 'Awaiting FDA Response', color: 'text-stone-600', bgColor: 'bg-stone-100', step: 8 },
  meeting_completed: { label: 'Meeting Completed', color: 'text-stone-700', bgColor: 'bg-stone-100', step: 9 },
  minutes_pending: { label: 'Awaiting Minutes', color: 'text-stone-600', bgColor: 'bg-stone-100', step: 10 },
  minutes_received: { label: 'Minutes Received', color: 'text-stone-700', bgColor: 'bg-stone-100', step: 11 },
  closed: { label: 'Closed', color: 'text-stone-500', bgColor: 'bg-stone-100', step: 12 },
};

const TOPIC_CONFIG: Record<QuestionTopic, { label: string; color: string }> = {
  clinical: { label: 'Clinical', color: 'bg-stone-100 text-stone-700' },
  nonclinical: { label: 'Nonclinical', color: 'bg-stone-100 text-stone-800' },
  cmc: { label: 'CMC', color: 'bg-stone-100 text-stone-700' },
  regulatory_strategy: { label: 'Reg Strategy', color: 'bg-stone-100 text-stone-700' },
  safety: { label: 'Safety', color: 'bg-stone-100 text-stone-800' },
  efficacy: { label: 'Efficacy', color: 'bg-stone-100 text-stone-700' },
  labeling: { label: 'Labeling', color: 'bg-stone-200 text-stone-700' },
  pediatric: { label: 'Pediatric', color: 'bg-stone-100 text-stone-700' },
  risk_management: { label: 'Risk Mgmt', color: 'bg-stone-100 text-stone-800' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const getDaysUntil = (date: string): number => {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

// ═══════════════════════════════════════════════════════════════════════════════
// MEETING TIMELINE
// ═══════════════════════════════════════════════════════════════════════════════

const MeetingTimeline: React.FC<{
  meeting: FDAMeeting;
}> = ({ meeting }) => {
  const currentStep = STATUS_CONFIG[meeting.status].step;
  
  const milestones = [
    { step: 3, label: 'Request Submitted', date: meeting.requestSubmittedDate },
    { step: 5, label: 'Meeting Scheduled', date: meeting.scheduledDate },
    { step: 7, label: 'Briefing Doc Submitted', date: meeting.briefingDocumentSubmittedDate },
    { step: 9, label: 'Meeting', date: meeting.meetingDate },
    { step: 11, label: 'Minutes Received', date: meeting.minutesReceivedDate },
  ];
  
  return (
    <div className="bg-stone-50 rounded-lg p-4">
      <h4 className="text-xs font-medium text-stone-500 mb-3">MEETING TIMELINE</h4>
      <div className="relative">
        {/* Progress Line */}
        <div className="absolute top-3 left-0 right-0 h-1 bg-stone-200 rounded-full">
          <div
            className="h-full bg-stone-800 rounded-full transition-all duration-150"
            style={{ width: `${(currentStep / 12) * 100}%` }}
          />
        </div>
        
        {/* Milestones */}
        <div className="relative flex justify-between">
          {milestones.map((milestone, idx) => {
            const isComplete = currentStep >= milestone.step;
            const isCurrent = currentStep === milestone.step || (currentStep > milestone.step && currentStep < (milestones[idx + 1]?.step || 13));
            
            return (
              <div key={milestone.step} className="flex flex-col items-center">
                <div className={cn(
                  'w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-semibold z-10',
                  isComplete && 'bg-stone-800 border-stone-800 text-white',
                  isCurrent && !isComplete && 'bg-white border-stone-800 text-stone-600',
                  !isComplete && !isCurrent && 'bg-white border-stone-300 text-stone-400'
                )}>
                  {isComplete ? '✓' : idx + 1}
                </div>
                <p className={cn(
                  'text-xs mt-2 text-center max-w-[80px]',
                  isComplete ? 'text-stone-700 font-medium' : 'text-stone-400'
                )}>
                  {milestone.label}
                </p>
                {milestone.date && (
                  <p className="text-xs text-stone-400">{formatDate(milestone.date)}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// QUESTIONS PANEL
// ═══════════════════════════════════════════════════════════════════════════════

const QuestionsPanel: React.FC<{
  meeting: FDAMeeting;
  onQuestionEdit?: (question: MeetingQuestion, meeting: FDAMeeting) => void;
}> = ({ meeting, onQuestionEdit }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  const byTopic = useMemo(() => {
    const groups: Record<string, MeetingQuestion[]> = {};
    meeting.questions.forEach(q => {
      if (!groups[q.topic]) groups[q.topic] = [];
      groups[q.topic].push(q);
    });
    return groups;
  }, [meeting.questions]);
  
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="p-4 border-b border-stone-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-stone-600" />
          Meeting Questions ({meeting.questions.length})
        </h3>
        <button className="inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none text-stone-600 hover:text-stone-900 hover:bg-stone-100 px-3 py-1.5 text-xs gap-1.5">
          <Plus className="w-4 h-4" />
          Add Question
        </button>
      </div>
      
      <div className="max-h-[500px] overflow-y-auto">
        {Object.entries(byTopic).map(([topic, questions]) => (
          <div key={topic} className="border-b border-stone-200 last:border-0">
            <div className="px-4 py-2 bg-stone-50">
              <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', TOPIC_CONFIG[topic as QuestionTopic].color)}>
                {TOPIC_CONFIG[topic as QuestionTopic].label}
              </span>
            </div>
            
            {questions.map(question => {
              const isExpanded = expandedId === question.id;
              
              return (
                <div key={question.id} className="border-t border-stone-200">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : question.id)}
                    className="w-full p-4 text-left hover:bg-stone-50 transition-colors duration-150"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-stone-200 flex items-center justify-center text-xs font-semibold text-stone-600">
                          {question.number}
                        </span>
                        <div>
                          <p className="text-sm text-stone-900">{question.questionText}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className={cn(
                              'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                              question.priority === 'critical' && 'bg-stone-100 text-stone-800',
                              question.priority === 'high' && 'bg-stone-100 text-stone-700',
                              question.priority === 'medium' && 'bg-stone-100 text-stone-600'
                            )}>
                              {question.priority}
                            </span>
                            <span className={cn(
                              'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                              question.status === 'answered' && 'bg-stone-100 text-stone-800',
                              question.status === 'submitted' && 'bg-stone-100 text-stone-700',
                              question.status === 'finalized' && 'bg-stone-100 text-stone-700',
                              question.status === 'draft' && 'bg-stone-100 text-stone-600'
                            )}>
                              {question.status}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-stone-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-stone-400" />
                      )}
                    </div>
                  </button>
                  
                  {isExpanded && (
                    <div className="px-4 pb-4 pl-14 space-y-3">
                      {/* Background */}
                      <div>
                        <p className="text-xs font-medium text-stone-500 mb-1">Background</p>
                        <p className="text-sm text-stone-700">{question.backgroundContext}</p>
                      </div>
                      
                      {/* Sponsor Position */}
                      {question.sponsorPosition && (
                        <div>
                          <p className="text-xs font-medium text-stone-500 mb-1">Sponsor Position</p>
                          <p className="text-sm text-stone-700">{question.sponsorPosition}</p>
                        </div>
                      )}
                      
                      {/* FDA Response */}
                      {question.fdaResponse && (
                        <div className="p-3 bg-stone-100 rounded-lg border border-stone-200">
                          <p className="text-xs font-medium text-stone-800 mb-1 flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            FDA Response {question.fdaResponseDate && `(${formatDate(question.fdaResponseDate)})`}
                          </p>
                          <p className="text-sm text-stone-800">{question.fdaResponse}</p>
                        </div>
                      )}
                      
                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2">
                        <button
                          onClick={() => onQuestionEdit?.(question, meeting)}
                          className="inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none text-stone-600 hover:text-stone-900 hover:bg-stone-100 px-3 py-1.5 text-xs gap-1.5"
                        >
                          <Edit3 className="w-3 h-3" />
                          Edit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION ITEMS PANEL
// ═══════════════════════════════════════════════════════════════════════════════

const ActionItemsPanel: React.FC<{
  meeting: FDAMeeting;
  onActionItemUpdate?: (actionItem: ActionItem) => void;
}> = ({ meeting, onActionItemUpdate }) => {
  const sponsorItems = meeting.actionItems.filter(a => a.owner === 'sponsor');
  const fdaItems = meeting.actionItems.filter(a => a.owner === 'fda');
  
  const renderItem = (item: ActionItem) => {
    const daysUntil = item.dueDate ? getDaysUntil(item.dueDate) : null;
    const isOverdue = daysUntil !== null && daysUntil < 0;
    
    return (
      <div
        key={item.id}
        className={cn(
          'p-3 rounded-lg border',
          item.status === 'completed' && 'border-stone-200 bg-stone-100',
          item.status !== 'completed' && isOverdue && 'border-stone-200 bg-stone-100',
          item.status !== 'completed' && !isOverdue && 'border-stone-200'
        )}
      >
        <div className="flex items-start gap-3">
          <button
            onClick={() => onActionItemUpdate?.({ ...item, status: item.status === 'completed' ? 'open' : 'completed' })}
            className={cn(
              'flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors duration-150',
              item.status === 'completed'
                ? 'bg-stone-700 border-stone-700 text-white'
                : 'border-stone-300 hover:border-stone-600'
            )}
          >
            {item.status === 'completed' && <CheckCircle className="w-3 h-3" />}
          </button>
          
          <div className="flex-1 min-w-0">
            <p className={cn(
              'text-sm',
              item.status === 'completed' ? 'text-stone-500 line-through' : 'text-stone-900'
            )}>
              {item.description}
            </p>
            
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              {item.fdaCommitment && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-700">
                  FDA Commitment
                </span>
              )}
              {item.assignedTo && (
                <span className="text-xs text-stone-500">Assigned: {item.assignedTo}</span>
              )}
              {item.dueDate && (
                <span className={cn(
                  'text-xs',
                  isOverdue && item.status !== 'completed' && 'text-stone-700 font-medium',
                  !isOverdue && 'text-stone-500'
                )}>
                  Due: {formatDate(item.dueDate)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="p-4 border-b border-stone-200">
        <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-stone-600" />
          Action Items ({meeting.actionItems.length})
        </h3>
      </div>
      
      <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
        {/* Sponsor Items */}
        <div>
          <p className="text-xs font-medium text-stone-500 mb-2">SPONSOR ACTIONS ({sponsorItems.length})</p>
          <div className="space-y-2">
            {sponsorItems.map(renderItem)}
            {sponsorItems.length === 0 && (
              <p className="text-xs text-stone-400 italic">No sponsor action items</p>
            )}
          </div>
        </div>
        
        {/* FDA Items */}
        <div>
          <p className="text-xs font-medium text-stone-500 mb-2">FDA COMMITMENTS ({fdaItems.length})</p>
          <div className="space-y-2">
            {fdaItems.map(renderItem)}
            {fdaItems.length === 0 && (
              <p className="text-xs text-stone-400 italic">No FDA action items</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MEETING LIST
// ═══════════════════════════════════════════════════════════════════════════════

const MeetingList: React.FC<{
  meetings: FDAMeeting[];
  activeMeetingId?: string;
  onMeetingSelect?: (meeting: FDAMeeting) => void;
}> = ({ meetings, activeMeetingId, onMeetingSelect }) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('active');
  
  const filtered = useMemo(() => {
    return meetings.filter(m => {
      if (filter === 'active') return m.status !== 'closed';
      if (filter === 'completed') return m.status === 'closed' || m.status === 'minutes_received';
      return true;
    }).sort((a, b) => {
      const dateA = a.meetingDate || a.scheduledDate || '9999';
      const dateB = b.meetingDate || b.scheduledDate || '9999';
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });
  }, [meetings, filter]);
  
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="p-4 border-b border-stone-200">
        <h3 className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-stone-600" />
          FDA Meetings
        </h3>
        
        {/* Filter tabs */}
        <div className="flex gap-1">
          {(['active', 'completed', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors duration-150 capitalize focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none',
                filter === f ? 'bg-stone-100 text-stone-700' : 'text-stone-500 hover:bg-stone-100'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      
      <div className="max-h-[500px] overflow-y-auto">
        {filtered.map(meeting => {
          const typeConfig = MEETING_TYPE_CONFIG[meeting.meetingType];
          const purposeConfig = PURPOSE_CONFIG[meeting.purpose];
          const statusConfig = STATUS_CONFIG[meeting.status];
          const isActive = meeting.id === activeMeetingId;
          
          return (
            <button
              key={meeting.id}
              onClick={() => onMeetingSelect?.(meeting)}
              className={cn(
                'w-full p-4 text-left border-b border-stone-200 transition-colors duration-150',
                isActive ? 'bg-stone-100' : 'hover:bg-stone-50'
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{purposeConfig.icon}</span>
                  <span className={cn('text-xs font-semibold', typeConfig.color)}>{typeConfig.label}</span>
                </div>
                <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', statusConfig.bgColor, statusConfig.color)}>
                  {statusConfig.label}
                </span>
              </div>
              
              <p className="text-sm font-medium text-stone-900">{meeting.title}</p>
              <p className="text-xs text-stone-500">{meeting.productName}</p>
              
              {meeting.meetingDate && (
                <p className="mt-2 text-xs text-stone-600 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(meeting.meetingDate)}
                </p>
              )}
              
              {/* Question summary */}
              <div className="mt-2 flex items-center gap-2 text-xs text-stone-500">
                <span>{meeting.questions.length} questions</span>
                <span>•</span>
                <span>{meeting.actionItems.filter(a => a.status !== 'completed').length} open items</span>
              </div>
            </button>
          );
        })}
        
        {filtered.length === 0 && (
          <p className="p-4 text-sm text-stone-500 text-center italic">No meetings found</p>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MEETING DETAIL
// ═══════════════════════════════════════════════════════════════════════════════

const MeetingDetail: React.FC<{
  meeting: FDAMeeting;
  onQuestionEdit?: (question: MeetingQuestion, meeting: FDAMeeting) => void;
  onActionItemUpdate?: (actionItem: ActionItem) => void;
}> = ({ meeting, onQuestionEdit, onActionItemUpdate }) => {
  const typeConfig = MEETING_TYPE_CONFIG[meeting.meetingType];
  const purposeConfig = PURPOSE_CONFIG[meeting.purpose];
  const statusConfig = STATUS_CONFIG[meeting.status];
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base font-medium">{purposeConfig.icon}</span>
              <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', typeConfig.color === 'text-stone-700' ? 'bg-stone-100' : typeConfig.color === 'text-stone-600' ? 'bg-stone-100' : 'bg-stone-100', typeConfig.color)}>
                {typeConfig.label}
              </span>
              <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', statusConfig.bgColor, statusConfig.color)}>
                {statusConfig.label}
              </span>
            </div>
            <h2 className="text-base font-medium text-stone-900">{meeting.title}</h2>
            <p className="text-sm text-stone-500">{meeting.productName}</p>
          </div>
          
          <div className="flex gap-2">
            <button className="inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 hover:border-stone-300 px-4 py-2 text-sm gap-2">
              <Download className="w-4 h-4" />
              Export
            </button>
            <button className="inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none bg-stone-800 text-white hover:bg-stone-900 shadow-sm px-4 py-2 text-sm gap-2">
              <Send className="w-4 h-4" />
              Send to FDA
            </button>
          </div>
        </div>
        
        {/* Key Dates */}
        <div className="grid grid-cols-4 gap-4 pt-4 border-t border-stone-200">
          <div>
            <p className="text-xs text-stone-500">Meeting Date</p>
            <p className="text-sm font-medium text-stone-900">
              {meeting.meetingDate ? formatDate(meeting.meetingDate) : 'TBD'}
            </p>
          </div>
          <div>
            <p className="text-xs text-stone-500">Division</p>
            <p className="text-sm font-medium text-stone-900">{meeting.division || 'TBD'}</p>
          </div>
          <div>
            <p className="text-xs text-stone-500">Briefing Doc Due</p>
            <p className="text-sm font-medium text-stone-900">
              {meeting.briefingDocumentDueDate ? formatDate(meeting.briefingDocumentDueDate) : 'TBD'}
            </p>
          </div>
          <div>
            <p className="text-xs text-stone-500">Sponsor Lead</p>
            <p className="text-sm font-medium text-stone-900">{meeting.sponsorLead}</p>
          </div>
        </div>
        
        {/* Timeline */}
        <div className="mt-6">
          <MeetingTimeline meeting={meeting} />
        </div>
      </div>
      
      {/* Questions & Action Items */}
      <div className="grid grid-cols-2 gap-6">
        <QuestionsPanel
          meeting={meeting}
          onQuestionEdit={onQuestionEdit}
        />
        <ActionItemsPanel
          meeting={meeting}
          onActionItemUpdate={onActionItemUpdate}
        />
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const FDAMeetingWorkspace: React.FC<FDAMeetingWorkspaceProps> = ({
  meetings,
  activeMeetingId,
  onMeetingSelect,
  onQuestionEdit,
  onActionItemUpdate,
  className,
}) => {
  const activeMeeting = meetings.find(m => m.id === activeMeetingId);
  
  // Metrics
  const metrics = useMemo(() => {
    const scheduled = meetings.filter(m => m.status === 'scheduled' || m.status === 'briefing_document_drafting');
    const awaitingResponse = meetings.filter(m => m.status === 'fda_response_pending' || m.status === 'minutes_pending');
    const openActionItems = meetings.flatMap(m => m.actionItems).filter(a => a.status !== 'completed');
    const fdaCommitments = openActionItems.filter(a => a.fdaCommitment);
    
    return {
      scheduled: scheduled.length,
      awaitingResponse: awaitingResponse.length,
      openActionItems: openActionItems.length,
      fdaCommitments: fdaCommitments.length,
    };
  }, [meetings]);
  
  return (
    <div className={cn('flex flex-col h-full bg-stone-50', className)}>
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-stone-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-base font-medium text-stone-900">FDA Meeting Workspace</h1>
            <p className="text-sm text-stone-500">Manage regulatory interactions</p>
          </div>
          
          <button className="inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 outline-none bg-stone-800 text-white hover:bg-stone-900 shadow-sm px-4 py-2 text-sm gap-2">
            <Plus className="w-4 h-4" />
            New Meeting Request
          </button>
        </div>
        
        {/* Metrics */}
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
            <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">Scheduled</span>
            <span className="text-base font-semibold mt-1 block text-stone-700">{metrics.scheduled}</span>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
            <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">Awaiting FDA</span>
            <span className="text-base font-semibold mt-1 block text-stone-700">{metrics.awaitingResponse}</span>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
            <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">Open Items</span>
            <span className="text-base font-semibold mt-1 block text-stone-900">{metrics.openActionItems}</span>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
            <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">FDA Commitments</span>
            <span className="text-base font-semibold mt-1 block text-stone-700">{metrics.fdaCommitments}</span>
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-4 gap-6 h-full">
          {/* Meeting List */}
          <div className="col-span-1">
            <MeetingList
              meetings={meetings}
              activeMeetingId={activeMeetingId}
              onMeetingSelect={onMeetingSelect}
            />
          </div>
          
          {/* Meeting Detail */}
          <div className="col-span-3">
            {activeMeeting ? (
              <MeetingDetail
                meeting={activeMeeting}
                onQuestionEdit={onQuestionEdit}
                onActionItemUpdate={onActionItemUpdate}
              />
            ) : (
              <div className="h-full flex items-center justify-center bg-white rounded-xl border border-stone-200">
                <div className="text-center">
                  <Calendar className="w-12 h-12 text-stone-400 mx-auto mb-3" />
                  <p className="text-sm text-stone-500">Select a meeting to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FDAMeetingWorkspace;
