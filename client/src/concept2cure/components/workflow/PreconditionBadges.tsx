/**
 * PreconditionBadges Component
 * 
 * 🔴 P0 Priority UI Component
 * 
 * Visual badges showing precondition status for workflow steps.
 * Displays passed/failed state with clear visual indicators.
 */

import React from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Circle,
  FileText,
  CheckSquare,
  PenTool,
  Users,
  Clock,
  Package,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Types
export interface Precondition {
  id: string;
  type: 'STEP_COMPLETE' | 'DATA_PRESENT' | 'APPROVAL_RECEIVED' | 'SIGNATURE_OBTAINED' | 
        'ARTIFACT_COMPLETE' | 'ROLE_ASSIGNED' | 'DEADLINE_NOT_PASSED';
  target: string;
  operator?: string;
  value?: unknown;
  passed?: boolean;
  actualValue?: unknown;
  expectedValue?: unknown;
  errorMessage?: string;
}

export interface PreconditionBadgesProps {
  preconditions: Precondition[];
  compact?: boolean;
  showAll?: boolean;
  className?: string;
  onPreconditionClick?: (precondition: Precondition) => void;
}

// Icon mapping for precondition types
const PreconditionIcon: React.FC<{ type: Precondition['type']; size?: number }> = ({ 
  type, 
  size = 14 
}) => {
  switch (type) {
    case 'STEP_COMPLETE':
      return <CheckSquare size={size} />;
    case 'DATA_PRESENT':
      return <FileText size={size} />;
    case 'APPROVAL_RECEIVED':
      return <CheckCircle2 size={size} />;
    case 'SIGNATURE_OBTAINED':
      return <PenTool size={size} />;
    case 'ARTIFACT_COMPLETE':
      return <Package size={size} />;
    case 'ROLE_ASSIGNED':
      return <Users size={size} />;
    case 'DEADLINE_NOT_PASSED':
      return <Clock size={size} />;
    default:
      return <Circle size={size} />;
  }
};

// Human-readable label for precondition type
const getPreconditionLabel = (precondition: Precondition): string => {
  switch (precondition.type) {
    case 'STEP_COMPLETE':
      return `"${precondition.target}" complete`;
    case 'DATA_PRESENT':
      return `${precondition.target} ${precondition.operator?.toLowerCase().replace('_', ' ') || 'exists'}`;
    case 'APPROVAL_RECEIVED':
      return `Approval: ${precondition.target}`;
    case 'SIGNATURE_OBTAINED':
      return `Signature: ${precondition.target}`;
    case 'ARTIFACT_COMPLETE':
      return `Artifact: ${precondition.target}`;
    case 'ROLE_ASSIGNED':
      return `Role assigned: ${precondition.target}`;
    case 'DEADLINE_NOT_PASSED':
      return `Before: ${new Date(precondition.target).toLocaleDateString()}`;
    default:
      return precondition.target;
  }
};

// Single badge component
const PreconditionBadge: React.FC<{
  precondition: Precondition;
  compact?: boolean;
  onClick?: () => void;
}> = ({ precondition, compact = false, onClick }) => {
  const isPassed = precondition.passed === true;
  const isFailed = precondition.passed === false;
  const isPending = precondition.passed === undefined;
  
  if (compact) {
    // Compact mode: small dots
    return (
      <div
        className={cn(
          "w-2 h-2 rounded-full cursor-pointer transition-transform hover:scale-150",
          isPassed && "bg-green-500",
          isFailed && "bg-red-500",
          isPending && "bg-zinc-300"
        )}
        onClick={onClick}
        title={getPreconditionLabel(precondition)}
      />
    );
  }
  
  // Full badge mode
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer",
        isPassed && "bg-green-50 text-green-700 hover:bg-green-100",
        isFailed && "bg-red-50 text-red-700 hover:bg-red-100",
        isPending && "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
      )}
      onClick={onClick}
    >
      {/* Status icon */}
      {isPassed && <CheckCircle2 size={14} className="text-green-500" />}
      {isFailed && <XCircle size={14} className="text-red-500" />}
      {isPending && <Circle size={14} className="text-zinc-400" />}
      
      {/* Type icon */}
      <PreconditionIcon type={precondition.type} />
      
      {/* Label */}
      <span className="truncate max-w-[200px]">
        {getPreconditionLabel(precondition)}
      </span>
    </div>
  );
};

// Summary indicator for compact header view
const PreconditionSummary: React.FC<{
  preconditions: Precondition[];
  onClick?: () => void;
}> = ({ preconditions, onClick }) => {
  const passed = preconditions.filter(p => p.passed === true).length;
  const failed = preconditions.filter(p => p.passed === false).length;
  const total = preconditions.length;
  
  const allPassed = passed === total;
  const hasFailed = failed > 0;
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors duration-150",
        allPassed && "bg-green-100 text-green-700 hover:bg-green-200",
        hasFailed && "bg-red-100 text-red-700 hover:bg-red-200",
        !allPassed && !hasFailed && "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
      )}
    >
      {allPassed ? (
        <CheckCircle2 size={12} />
      ) : hasFailed ? (
        <AlertCircle size={12} />
      ) : (
        <Clock size={12} />
      )}
      <span>{passed}/{total}</span>
    </button>
  );
};

// Main component
export const PreconditionBadges: React.FC<PreconditionBadgesProps> = ({
  preconditions,
  compact = false,
  showAll = true,
  className,
  onPreconditionClick,
}) => {
  if (!preconditions || preconditions.length === 0) {
    return (
      <div className={cn("text-sm text-zinc-400 italic", className)}>
        No preconditions
      </div>
    );
  }
  
  const passed = preconditions.filter(p => p.passed === true);
  const failed = preconditions.filter(p => p.passed === false);
  const pending = preconditions.filter(p => p.passed === undefined);
  
  // Compact dots view
  if (compact) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <PreconditionSummary 
          preconditions={preconditions}
          onClick={() => {
            // Could expand to show full list
          }}
        />
        <div className="flex items-center gap-0.5 ml-1">
          {preconditions.slice(0, 5).map((precondition) => (
            <PreconditionBadge
              key={precondition.id}
              precondition={precondition}
              compact
              onClick={() => onPreconditionClick?.(precondition)}
            />
          ))}
          {preconditions.length > 5 && (
            <span className="text-xs text-zinc-400 ml-1">
              +{preconditions.length - 5}
            </span>
          )}
        </div>
      </div>
    );
  }
  
  // Full badges view
  return (
    <div className={cn("space-y-3", className)}>
      {/* Failed preconditions first */}
      {failed.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-red-600 uppercase tracking-wide flex items-center gap-1">
            <XCircle size={12} />
            Blockers ({failed.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {failed.map((precondition) => (
              <PreconditionBadge
                key={precondition.id}
                precondition={precondition}
                onClick={() => onPreconditionClick?.(precondition)}
              />
            ))}
          </div>
          
          {/* Error messages */}
          {failed.some(p => p.errorMessage) && (
            <div className="mt-2 p-2 bg-red-50 rounded-lg border border-red-100">
              {failed.filter(p => p.errorMessage).map((precondition) => (
                <p key={precondition.id} className="text-xs text-red-600">
                  • {precondition.errorMessage}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Pending preconditions */}
      {pending.length > 0 && showAll && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide flex items-center gap-1">
            <Clock size={12} />
            Pending ({pending.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {pending.map((precondition) => (
              <PreconditionBadge
                key={precondition.id}
                precondition={precondition}
                onClick={() => onPreconditionClick?.(precondition)}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Passed preconditions */}
      {passed.length > 0 && showAll && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-green-600 uppercase tracking-wide flex items-center gap-1">
            <CheckCircle2 size={12} />
            Met ({passed.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {passed.map((precondition) => (
              <PreconditionBadge
                key={precondition.id}
                precondition={precondition}
                onClick={() => onPreconditionClick?.(precondition)}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Summary when not showing all */}
      {!showAll && passed.length > 0 && (
        <div className="text-xs text-zinc-500">
          + {passed.length} met precondition{passed.length > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

// Inline summary component for use in headers/compact areas
export const PreconditionInlineSummary: React.FC<{
  preconditions: Precondition[];
  className?: string;
}> = ({ preconditions, className }) => {
  if (!preconditions || preconditions.length === 0) return null;
  
  const passed = preconditions.filter(p => p.passed === true).length;
  const total = preconditions.length;
  const allPassed = passed === total;
  
  return (
    <div className={cn(
      "flex items-center gap-1 text-xs",
      allPassed ? "text-green-600" : "text-amber-600",
      className
    )}>
      {allPassed ? (
        <CheckCircle2 size={12} />
      ) : (
        <AlertCircle size={12} />
      )}
      <span>
        {passed}/{total} prerequisites
      </span>
    </div>
  );
};

export default PreconditionBadges;
