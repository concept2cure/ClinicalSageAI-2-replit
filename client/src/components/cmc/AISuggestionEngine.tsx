import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertCircle,
  CheckCircle,
  XCircle,
  Lightbulb,
  Sparkles,
  TrendingUp,
  Shield,
  FileCheck,
  AlertTriangle,
  Info,
  Check,
  X,
  ChevronRight,
  Brain,
  Target,
  BookOpen,
  ClipboardCheck,
  RefreshCw,
  Zap,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Eye,
  EyeOff,
  Filter,
  Download,
  ChevronDown,
  ChevronUp,
  PenTool,
  Type,
  Hash,
  FileText,
  Search,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Types and Interfaces
export interface Suggestion {
  id: string;
  type: 'grammar' | 'regulatory' | 'clarity' | 'consistency' | 'completeness' | 'terminology';
  severity: 'critical' | 'important' | 'enhancement' | 'style';
  original: string;
  suggested: string;
  explanation: string;
  position: { start: number; end: number; line?: number; column?: number };
  confidence: number;
  regulatoryRef?: string;
  category?: string;
  status?: 'pending' | 'accepted' | 'rejected' | 'ignored';
}

export interface ComplianceScore {
  regulatory: number;
  technical: number;
  clarity: number;
  consistency: number;
  completeness: number;
  overall: number;
}

export interface AIAnalysisResult {
  suggestions: Suggestion[];
  scores: ComplianceScore;
  missingElements: string[];
  complianceIssues: any[];
  timestamp: string;
}

interface SuggestionCardProps {
  suggestion: Suggestion;
  onAccept: () => void;
  onReject: () => void;
  onIgnore: () => void;
  onApplyAll?: () => void;
  position?: { x: number; y: number };
}

// Severity colors and icons
const SEVERITY_CONFIG = {
  critical: {
    color: 'text-red-600 border-red-600 bg-red-50',
    icon: AlertCircle,
    badge: 'bg-red-100 text-red-800',
    underline: 'decoration-red-500 decoration-wavy underline-offset-4',
  },
  important: {
    color: 'text-yellow-600 border-yellow-600 bg-yellow-50',
    icon: AlertTriangle,
    badge: 'bg-yellow-100 text-yellow-800',
    underline: 'decoration-yellow-500 decoration-wavy underline-offset-4',
  },
  enhancement: {
    color: 'text-blue-600 border-blue-600 bg-blue-50',
    icon: Lightbulb,
    badge: 'bg-blue-100 text-blue-800',
    underline: 'decoration-blue-500 decoration-dotted underline-offset-4',
  },
  style: {
    color: 'text-gray-600 border-gray-600 bg-gray-50',
    icon: PenTool,
    badge: 'bg-gray-100 text-gray-800',
    underline: 'decoration-gray-400 decoration-dotted underline-offset-2',
  },
};

// Type icons for suggestions
const TYPE_ICONS = {
  grammar: Type,
  regulatory: Shield,
  clarity: Eye,
  consistency: RefreshCw,
  completeness: ClipboardCheck,
  terminology: BookOpen,
};

// Floating Suggestion Card Component
const SuggestionCard: React.FC<SuggestionCardProps> = ({
  suggestion,
  onAccept,
  onReject,
  onIgnore,
  onApplyAll,
  position = { x: 0, y: 0 },
}) => {
  const config = SEVERITY_CONFIG[suggestion.severity];
  const Icon = config.icon;
  const TypeIcon = TYPE_ICONS[suggestion.type];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ duration: 0.2 }}
      className="absolute z-50"
      style={{ left: position.x, top: position.y }}
    >
      <Card className={cn('w-96 shadow-xl border-2', config.color)}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5" />
              <Badge className={config.badge}>{suggestion.severity}</Badge>
              <Badge variant="outline" className="gap-1">
                <TypeIcon className="h-3 w-3" />
                {suggestion.type}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="secondary">
                      {Math.round(suggestion.confidence * 100)}%
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Confidence Score</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-3">
          {/* Text Comparison */}
          <div className="space-y-2">
            <div className="p-2 bg-red-50 rounded-md border border-red-200">
              <p className="text-sm line-through text-red-700">{suggestion.original}</p>
            </div>
            <div className="p-2 bg-green-50 rounded-md border border-green-200">
              <p className="text-sm text-green-700 font-medium">{suggestion.suggested}</p>
            </div>
          </div>

          {/* Explanation */}
          <div className="space-y-1">
            <p className="text-sm text-gray-600">{suggestion.explanation}</p>
            {suggestion.regulatoryRef && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <BookOpen className="h-3 w-3" />
                <span>Reference: {suggestion.regulatoryRef}</span>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex justify-between gap-2 pt-3">
          <Button
            size="sm"
            variant="default"
            onClick={onAccept}
            className="gap-1"
          >
            <Check className="h-4 w-4" />
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onReject}
            className="gap-1"
          >
            <X className="h-4 w-4" />
            Reject
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onIgnore}
            className="gap-1"
          >
            <EyeOff className="h-4 w-4" />
            Ignore
          </Button>
          {onApplyAll && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onApplyAll}
              className="gap-1"
            >
              <RefreshCw className="h-4 w-4" />
              Apply All
            </Button>
          )}
        </CardFooter>
      </Card>
    </motion.div>
  );
};

// AI Oversight Panel Component
export const AIAssistantPanel: React.FC<{
  scores: ComplianceScore;
  suggestions: Suggestion[];
  isAnalyzing: boolean;
  onAnalyze: () => void;
  onReviewAll: () => void;
  onBatchAccept: (ids: string[]) => void;
  onBatchReject: (ids: string[]) => void;
}> = ({
  scores,
  suggestions,
  isAnalyzing,
  onAnalyze,
  onReviewAll,
  onBatchAccept,
  onBatchReject,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());

  // Group suggestions by type
  const groupedSuggestions = useMemo(() => {
    const groups: Record<string, Suggestion[]> = {};
    suggestions.forEach(s => {
      if (!groups[s.type]) groups[s.type] = [];
      groups[s.type].push(s);
    });
    return groups;
  }, [suggestions]);

  // Count by severity
  const severityCounts = useMemo(() => {
    const counts = { critical: 0, important: 0, enhancement: 0, style: 0 };
    suggestions.forEach(s => {
      counts[s.severity]++;
    });
    return counts;
  }, [suggestions]);

  // Filter suggestions
  const filteredSuggestions = useMemo(() => {
    return suggestions.filter(s => {
      if (selectedCategory !== 'all' && s.type !== selectedCategory) return false;
      if (selectedSeverity !== 'all' && s.severity !== selectedSeverity) return false;
      return s.status !== 'ignored' && s.status !== 'rejected';
    });
  }, [suggestions, selectedCategory, selectedSeverity]);

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedSuggestions);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedSuggestions(newSet);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold">AI Regulatory Assistant</h3>
          </div>
          <Button
            size="sm"
            variant={isAnalyzing ? "outline" : "default"}
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className="gap-1"
          >
            {isAnalyzing ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <RefreshCw className="h-4 w-4" />
                </motion.div>
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Analyze Now
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Compliance Scores */}
      <div className="px-4 py-3 border-b bg-white">
        <h4 className="text-sm font-medium mb-3">Compliance Scores</h4>
        <div className="space-y-2">
          {Object.entries(scores).map(([key, value]) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="capitalize text-gray-600">{key}</span>
                <span className={cn(
                  "font-medium",
                  value >= 90 ? "text-green-600" :
                  value >= 75 ? "text-yellow-600" :
                  value >= 60 ? "text-orange-600" :
                  "text-red-600"
                )}>
                  {value}%
                </span>
              </div>
              <Progress 
                value={value} 
                className={cn(
                  "h-2",
                  value >= 90 ? "[&>div]:bg-green-600" :
                  value >= 75 ? "[&>div]:bg-yellow-600" :
                  value >= 60 ? "[&>div]:bg-orange-600" :
                  "[&>div]:bg-red-600"
                )}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Suggestion Stats */}
      <div className="px-4 py-3 border-b bg-gray-50">
        <h4 className="text-sm font-medium mb-2">Suggestions Overview</h4>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(severityCounts).map(([severity, count]) => {
            const config = SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG];
            const Icon = config.icon;
            return (
              <button
                key={severity}
                onClick={() => setSelectedSeverity(severity === selectedSeverity ? 'all' : severity)}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-md border transition-colors",
                  selectedSeverity === severity 
                    ? "border-blue-500 bg-blue-50" 
                    : "border-gray-200 hover:bg-gray-50"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-sm capitalize">{severity}</span>
                <Badge variant="secondary" className="ml-auto">{count}</Badge>
              </button>
            );
          })}
        </div>
      </div>

      {/* Category Filter */}
      <div className="px-4 py-2 border-b">
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full text-sm border rounded-md px-2 py-1"
        >
          <option value="all">All Categories</option>
          {Object.keys(groupedSuggestions).map(type => (
            <option key={type} value={type}>
              {type.charAt(0).toUpperCase() + type.slice(1)} ({groupedSuggestions[type].length})
            </option>
          ))}
        </select>
      </div>

      {/* Suggestions List */}
      <ScrollArea className="flex-1">
        <div className="px-4 py-2 space-y-2">
          {filteredSuggestions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
              <p className="text-sm">No suggestions in this category</p>
            </div>
          ) : (
            filteredSuggestions.map((suggestion) => {
              const config = SEVERITY_CONFIG[suggestion.severity];
              const Icon = config.icon;
              const TypeIcon = TYPE_ICONS[suggestion.type];
              const isSelected = selectedSuggestions.has(suggestion.id);

              return (
                <motion.div
                  key={suggestion.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "p-3 rounded-md border cursor-pointer transition-all",
                    isSelected 
                      ? "border-blue-500 bg-blue-50" 
                      : "border-gray-200 hover:bg-gray-50"
                  )}
                  onClick={() => toggleSelection(suggestion.id)}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="mt-1"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <Badge className={config.badge} variant="outline">
                          {suggestion.severity}
                        </Badge>
                        <Badge variant="secondary" className="gap-1">
                          <TypeIcon className="h-3 w-3" />
                          {suggestion.type}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-700 line-through">
                        {suggestion.original}
                      </p>
                      <p className="text-sm text-green-700 font-medium">
                        {suggestion.suggested}
                      </p>
                      <p className="text-xs text-gray-500">
                        {suggestion.explanation}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Actions Footer */}
      <div className="px-4 py-3 border-t bg-gray-50">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={() => onBatchAccept(Array.from(selectedSuggestions))}
            disabled={selectedSuggestions.size === 0}
            className="flex-1"
          >
            Accept Selected ({selectedSuggestions.size})
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onBatchReject(Array.from(selectedSuggestions))}
            disabled={selectedSuggestions.size === 0}
            className="flex-1"
          >
            Reject Selected
          </Button>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={onReviewAll}
          className="w-full mt-2"
        >
          <Eye className="h-4 w-4 mr-1" />
          Review All Suggestions
        </Button>
      </div>
    </div>
  );
};

// Text with Underlines Component
export const TextWithSuggestions: React.FC<{
  text: string;
  suggestions: Suggestion[];
  onSuggestionClick: (suggestion: Suggestion, position: { x: number; y: number }) => void;
}> = ({ text, suggestions, onSuggestionClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTextClick = (e: React.MouseEvent, suggestion: Suggestion) => {
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      onSuggestionClick(suggestion, {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top + 30,
      });
    }
  };

  // Create text segments with suggestions
  const segments = useMemo(() => {
    const segs: Array<{ text: string; suggestion?: Suggestion }> = [];
    let lastEnd = 0;

    const sortedSuggestions = [...suggestions]
      .filter(s => s.status !== 'accepted' && s.status !== 'ignored')
      .sort((a, b) => a.position.start - b.position.start);

    sortedSuggestions.forEach(suggestion => {
      if (suggestion.position.start > lastEnd) {
        segs.push({ text: text.substring(lastEnd, suggestion.position.start) });
      }
      segs.push({
        text: text.substring(suggestion.position.start, suggestion.position.end),
        suggestion,
      });
      lastEnd = suggestion.position.end;
    });

    if (lastEnd < text.length) {
      segs.push({ text: text.substring(lastEnd) });
    }

    return segs;
  }, [text, suggestions]);

  return (
    <div ref={containerRef} className="relative">
      {segments.map((segment, index) => {
        if (segment.suggestion) {
          const config = SEVERITY_CONFIG[segment.suggestion.severity];
          return (
            <TooltipProvider key={index}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "cursor-pointer underline transition-all",
                      config.underline,
                      "hover:bg-yellow-100"
                    )}
                    onClick={(e) => handleTextClick(e, segment.suggestion!)}
                  >
                    {segment.text}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="max-w-xs">
                    <p className="font-medium">{segment.suggestion.type}</p>
                    <p className="text-xs">{segment.suggestion.explanation}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }
        return <span key={index}>{segment.text}</span>;
      })}
    </div>
  );
};

// Main AI Suggestion Engine Hook
export const useAISuggestionEngine = (
  documentId: string,
  content: string,
  enabled: boolean = true
) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [scores, setScores] = useState<ComplianceScore>({
    regulatory: 0,
    technical: 0,
    clarity: 0,
    consistency: 0,
    completeness: 0,
    overall: 0,
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState<Suggestion | null>(null);
  const [suggestionPosition, setSuggestionPosition] = useState({ x: 0, y: 0 });
  const debounceTimer = useRef<NodeJS.Timeout>();

  // Analyze content
  const analyzeContent = useCallback(async () => {
    if (!enabled || !content || content.length < 10) return;

    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/authoring/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: documentId,
          content,
          analysis_type: 'full',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
        setScores(data.scores || scores);
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [documentId, content, enabled]);

  // Real-time suggestions (debounced)
  const getRealTimeSuggestions = useCallback(async (text: string) => {
    if (!enabled || text.length < 20) return;

    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      try {
        const response = await fetch('/api/authoring/ai/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });

        if (response.ok) {
          const data = await response.json();
          setSuggestions(prev => {
            // Merge new suggestions with existing ones
            const merged = [...prev];
            data.suggestions.forEach((newSugg: Suggestion) => {
              if (!merged.find(s => s.id === newSugg.id)) {
                merged.push(newSugg);
              }
            });
            return merged;
          });
        }
      } catch (error) {
        console.error('Real-time suggestions failed:', error);
      }
    }, 500);
  }, [enabled]);

  // Accept suggestion
  const acceptSuggestion = useCallback(async (suggestionId: string) => {
    const suggestion = suggestions.find(s => s.id === suggestionId);
    if (!suggestion) return;

    // Update local state
    setSuggestions(prev =>
      prev.map(s => s.id === suggestionId ? { ...s, status: 'accepted' } : s)
    );

    // Send feedback to backend
    await fetch('/api/authoring/ai/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suggestion_id: suggestionId,
        action: 'accepted',
      }),
    });

    setActiveSuggestion(null);
    return suggestion;
  }, [suggestions]);

  // Reject suggestion
  const rejectSuggestion = useCallback(async (suggestionId: string) => {
    setSuggestions(prev =>
      prev.map(s => s.id === suggestionId ? { ...s, status: 'rejected' } : s)
    );

    await fetch('/api/authoring/ai/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suggestion_id: suggestionId,
        action: 'rejected',
      }),
    });

    setActiveSuggestion(null);
  }, []);

  // Ignore suggestion
  const ignoreSuggestion = useCallback((suggestionId: string) => {
    setSuggestions(prev =>
      prev.map(s => s.id === suggestionId ? { ...s, status: 'ignored' } : s)
    );
    setActiveSuggestion(null);
  }, []);

  // Batch operations
  const batchAccept = useCallback(async (suggestionIds: string[]) => {
    const acceptedSuggestions: Suggestion[] = [];
    
    setSuggestions(prev =>
      prev.map(s => {
        if (suggestionIds.includes(s.id)) {
          acceptedSuggestions.push(s);
          return { ...s, status: 'accepted' };
        }
        return s;
      })
    );

    // Send batch feedback
    for (const id of suggestionIds) {
      await fetch('/api/authoring/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestion_id: id,
          action: 'accepted',
        }),
      });
    }

    return acceptedSuggestions;
  }, []);

  const batchReject = useCallback(async (suggestionIds: string[]) => {
    setSuggestions(prev =>
      prev.map(s =>
        suggestionIds.includes(s.id) ? { ...s, status: 'rejected' } : s
      )
    );

    for (const id of suggestionIds) {
      await fetch('/api/authoring/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestion_id: id,
          action: 'rejected',
        }),
      });
    }
  }, []);

  // Auto-analyze on mount and significant content changes
  useEffect(() => {
    if (enabled && content && content.length > 100) {
      analyzeContent();
    }
  }, [enabled]);

  return {
    suggestions: suggestions.filter(s => s.status === 'pending' || !s.status),
    allSuggestions: suggestions,
    scores,
    isAnalyzing,
    activeSuggestion,
    suggestionPosition,
    analyzeContent,
    getRealTimeSuggestions,
    acceptSuggestion,
    rejectSuggestion,
    ignoreSuggestion,
    batchAccept,
    batchReject,
    setActiveSuggestion,
    setSuggestionPosition,
  };
};

// Export main component
export default function AISuggestionEngine({
  documentId,
  content,
  onContentUpdate,
  enabled = true,
}: {
  documentId: string;
  content: string;
  onContentUpdate: (newContent: string) => void;
  enabled?: boolean;
}) {
  const {
    suggestions,
    scores,
    isAnalyzing,
    activeSuggestion,
    suggestionPosition,
    analyzeContent,
    getRealTimeSuggestions,
    acceptSuggestion,
    rejectSuggestion,
    ignoreSuggestion,
    batchAccept,
    batchReject,
    setActiveSuggestion,
    setSuggestionPosition,
  } = useAISuggestionEngine(documentId, content, enabled);

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: Suggestion, position: { x: number; y: number }) => {
    setActiveSuggestion(suggestion);
    setSuggestionPosition(position);
  };

  // Handle accept suggestion
  const handleAccept = async () => {
    if (!activeSuggestion) return;
    
    const accepted = await acceptSuggestion(activeSuggestion.id);
    if (accepted) {
      // Update content with suggestion
      const newContent = 
        content.substring(0, accepted.position.start) +
        accepted.suggested +
        content.substring(accepted.position.end);
      onContentUpdate(newContent);
    }
  };

  // Apply all similar suggestions
  const handleApplyAll = async () => {
    if (!activeSuggestion) return;

    const similar = suggestions.filter(s => 
      s.type === activeSuggestion.type &&
      s.original === activeSuggestion.original
    );

    const accepted = await batchAccept(similar.map(s => s.id));
    
    // Apply all changes to content
    let newContent = content;
    accepted.sort((a, b) => b.position.start - a.position.start); // Apply in reverse order
    accepted.forEach(sugg => {
      newContent = 
        newContent.substring(0, sugg.position.start) +
        sugg.suggested +
        newContent.substring(sugg.position.end);
    });
    
    onContentUpdate(newContent);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!activeSuggestion) return;

      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        handleAccept();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        ignoreSuggestion(activeSuggestion.id);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [activeSuggestion]);

  // Real-time analysis
  useEffect(() => {
    getRealTimeSuggestions(content);
  }, [content, getRealTimeSuggestions]);

  return (
    <div className="relative">
      {/* Text with underlined suggestions */}
      <TextWithSuggestions
        text={content}
        suggestions={suggestions}
        onSuggestionClick={handleSuggestionClick}
      />

      {/* Floating suggestion card */}
      <AnimatePresence>
        {activeSuggestion && (
          <SuggestionCard
            suggestion={activeSuggestion}
            onAccept={handleAccept}
            onReject={() => rejectSuggestion(activeSuggestion.id)}
            onIgnore={() => ignoreSuggestion(activeSuggestion.id)}
            onApplyAll={handleApplyAll}
            position={suggestionPosition}
          />
        )}
      </AnimatePresence>

      {/* Mini compliance indicator */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg p-3 border"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Shield className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium">Compliance</span>
          </div>
          <div className={cn(
            "text-lg font-bold",
            scores.overall >= 90 ? "text-green-600" :
            scores.overall >= 75 ? "text-yellow-600" :
            scores.overall >= 60 ? "text-orange-600" :
            "text-red-600"
          )}>
            {Math.round(scores.overall)}%
          </div>
          <Button size="sm" variant="ghost" onClick={analyzeContent}>
            <RefreshCw className={cn("h-4 w-4", isAnalyzing && "animate-spin")} />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}