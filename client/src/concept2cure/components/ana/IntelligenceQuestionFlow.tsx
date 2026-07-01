/**
 * IntelligenceQuestionFlow — section-level progress sidebar for an
 * active intelligence questioning flow. Shows which sections are
 * complete, in progress, or pending.
 */
import type { IntelligenceQuestionEvent } from '../../../../../shared/types/intelligence-questions.js';

export interface IntelligenceQuestionFlowProps {
  progress: IntelligenceQuestionEvent['progress'];
  flowName: string;
}

export function IntelligenceQuestionFlow({
  progress,
  flowName,
}: IntelligenceQuestionFlowProps) {
  const pct = progress.totalNodes > 0
    ? Math.round((progress.completedNodes / progress.totalNodes) * 100)
    : 0;

  return (
    <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-4">
      <h4 className="text-sm font-semibold text-gray-200 mb-3">{flowName}</h4>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-gray-400 tabular-nums">{pct}%</span>
      </div>
      <ul className="space-y-1.5">
        {progress.sections.map(section => {
          const done = section.completed === section.total;
          const active = section.label === progress.currentSection;
          return (
            <li key={section.id} className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  done
                    ? 'bg-green-500'
                    : active
                    ? 'bg-blue-500 animate-pulse'
                    : 'bg-gray-600'
                }`}
              />
              <span
                className={`text-xs ${
                  done
                    ? 'text-green-400'
                    : active
                    ? 'text-blue-300 font-medium'
                    : 'text-gray-500'
                }`}
              >
                {section.label}
              </span>
              <span className="text-[10px] text-gray-600 ml-auto tabular-nums">
                {section.completed}/{section.total}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
