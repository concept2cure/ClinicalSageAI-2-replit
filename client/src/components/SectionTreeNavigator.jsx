import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Circle, CheckCircle2, Edit3, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

const STATUS_CONFIG = {
  todo: {
    icon: Circle,
    color: 'text-gray-400',
    bg: 'bg-gray-100',
    label: 'To Do',
    badge: 'secondary'
  },
  drafting: {
    icon: Edit3,
    color: 'text-blue-500',
    bg: 'bg-blue-50',
    label: 'Drafting',
    badge: 'default'
  },
  validated: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bg: 'bg-green-50',
    label: 'Validated',
    badge: 'success'
  }
};

function SectionTreeNode({ section, selectedId, onSelect, level = 0 }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = section.children && section.children.length > 0;
  const isSelected = section.id === selectedId;
  const statusConfig = STATUS_CONFIG[section.status] || STATUS_CONFIG.todo;
  const StatusIcon = statusConfig.icon;

  return (
    <div data-testid={`section-tree-node-${section.id}`}>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-accent rounded-md transition-colors",
          isSelected && "bg-accent border-l-2 border-primary",
          level > 0 && `ml-${level * 4}`
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => onSelect(section)}
        data-testid={`section-item-${section.id}`}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="hover:bg-accent p-0.5 rounded"
            data-testid={`section-expand-${section.id}`}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        )}
        {!hasChildren && <div className="w-5" />}
        
        <StatusIcon className={cn("h-4 w-4", statusConfig.color)} data-testid={`status-icon-${section.id}`} />
        
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
            {section.section_number}
          </span>
          <span className={cn(
            "text-sm truncate",
            isSelected && "font-medium"
          )}>
            {section.section_title}
          </span>
        </div>

        {section.assigned_to && (
          <Badge variant="outline" className="text-xs ml-auto flex-shrink-0">
            {section.assigned_to}
          </Badge>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div>
          {section.children.map(child => (
            <SectionTreeNode
              key={child.id}
              section={child}
              selectedId={selectedId}
              onSelect={onSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SectionTreeNavigator({ 
  sections = [], 
  selectedSection, 
  onSelectSection,
  loading = false 
}) {
  const [stats, setStats] = useState({
    total_sections: 0,
    todo_count: 0,
    drafting_count: 0,
    validated_count: 0,
    completion_percentage: 0
  });

  useEffect(() => {
    // Calculate stats from sections
    const calculateStats = (sectionList) => {
      let total = 0;
      let todo = 0;
      let drafting = 0;
      let validated = 0;

      const countSections = (items) => {
        items.forEach(item => {
          total++;
          if (item.status === 'todo') todo++;
          else if (item.status === 'drafting') drafting++;
          else if (item.status === 'validated') validated++;
          
          if (item.children) {
            countSections(item.children);
          }
        });
      };

      countSections(sectionList);

      const completion = total > 0 ? Math.round((validated / total) * 100) : 0;

      return {
        total_sections: total,
        todo_count: todo,
        drafting_count: drafting,
        validated_count: validated,
        completion_percentage: completion
      };
    };

    setStats(calculateStats(sections));
  }, [sections]);

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        <div className="h-8 bg-accent animate-pulse rounded" />
        <div className="h-6 bg-accent animate-pulse rounded" />
        <div className="h-6 bg-accent animate-pulse rounded" />
        <div className="h-6 bg-accent animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-r bg-background" data-testid="section-tree-navigator">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">510(k) Sections</h3>
        </div>
        
        {/* Progress Stats */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span className="font-medium">{stats.completion_percentage}%</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: `${stats.completion_percentage}%` }}
            />
          </div>
          
          {/* Status Counts */}
          <div className="flex gap-2 flex-wrap">
            <Badge variant="secondary" className="text-xs">
              <Circle className="h-3 w-3 mr-1 text-gray-400" />
              {stats.todo_count} To Do
            </Badge>
            <Badge variant="default" className="text-xs">
              <Edit3 className="h-3 w-3 mr-1" />
              {stats.drafting_count} Drafting
            </Badge>
            <Badge variant="success" className="text-xs bg-green-50 text-green-700 border-green-200">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {stats.validated_count} Done
            </Badge>
          </div>
        </div>
      </div>

      {/* Section Tree */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5" data-testid="section-tree-list">
          {sections.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No sections available
            </div>
          ) : (
            sections.map(section => (
              <SectionTreeNode
                key={section.id}
                section={section}
                selectedId={selectedSection?.id}
                onSelect={onSelectSection}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}