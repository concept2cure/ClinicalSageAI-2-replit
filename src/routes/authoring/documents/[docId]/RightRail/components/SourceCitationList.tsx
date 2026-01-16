import React from 'react';
import { FileText, Database, ExternalLink } from 'lucide-react';
import { triggerDatasetFocus } from '@/utils/events/RightRailEvents';
import type { SourceReference } from '@/services/LumenAIService';

interface SourceCitationListProps {
  sources: SourceReference[];
}

const iconForType = (type: SourceReference['type']) => {
  switch (type) {
    case 'document':
      return FileText;
    case 'dataset':
    default:
      return Database;
  }
};

export const SourceCitationList: React.FC<SourceCitationListProps> = ({ sources }) => {
  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-border bg-background/60 p-3 text-sm">
      <p className="font-semibold text-foreground mb-2">Verified Sources</p>
      <ul className="space-y-2">
        {sources.map(source => {
          const Icon = iconForType(source.type);
          return (
            <li key={source.id}>
              <button
                type="button"
                onClick={() => triggerDatasetFocus(source.id)}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-2 py-1 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span>{source.name}</span>
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ExternalLink className="h-3 w-3" />
                  {`${Math.round(source.confidenceScore * 100)}%`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default SourceCitationList;
