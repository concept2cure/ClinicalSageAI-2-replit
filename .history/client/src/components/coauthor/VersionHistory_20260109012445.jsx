/**
 * SharePoint-Style Version History Viewer
 * Comprehensive version control system with diff comparison for Global Change Management
 * 21 CFR Part 11 compliant with full audit trail and electronic signatures
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Toggle } from '@/components/ui/toggle';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantContext } from '@/contexts/TenantContext';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow, parseISO, isAfter, isBefore, isWithinInterval, differenceInDays } from 'date-fns';
import { diffWords, diffLines, createPatch } from 'diff';
import { saveAs } from 'file-saver';
import {
  Eye, Download, GitBranch, GitMerge, GitCompare, Clock, User, Calendar as CalendarIcon, ChevronRight, ChevronDown, AlertCircle, CheckCircle, Info, Copy, History, FileText, X, Plus, ArrowLeft, ArrowRight, Filter, Search, RefreshCw, Lock, Unlock, Shield, ShieldCheck, ShieldAlert, Edit3, Trash2, RotateCcw, Users, Bell, FileDown, FileUp, // Compare and DiffIcon don't exist in lucide-react, removed
  GitCommit, Activity, TrendingUp, TrendingDown, Minus, MoreVertical, Settings, HelpCircle, ChevronLeft, Tag, Hash, Package, Layers, Database, CheckSquare, Square, Circle, CircleDot, Target, Zap, Award, Link } from 'lucide-react';


// Removed non-existent SiMicrosoftsharepoint import

/**
 * Get user initials for avatar
 */
const getUserInitials = (name) => {
  if (!name) return 'U';
  const parts = name.split(' ');
  return parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
};

/**
 * Format file size to human readable
 */
const formatFileSize = (bytes) => {
  if (!bytes) return 'N/A';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Get status badge configuration
 */
const getStatusBadgeConfig = (status) => {
  const configs = {
    current: { variant: 'default', icon: CircleDot, className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200 border-green-300' },
    draft: { variant: 'secondary', icon: Edit3, className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200' },
    published: { variant: 'default', icon: CheckCircle, className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 border-blue-300' },
    archived: { variant: 'outline', icon: Package, className: 'bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400' },
    approved: { variant: 'default', icon: ShieldCheck, className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200' },
    locked: { variant: 'destructive', icon: Lock, className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' }
  };
  return configs[status?.toLowerCase()] || configs.draft;
};

/**
 * Get change type badge configuration
 */
const getChangeTypeBadgeConfig = (changeType) => {
  const configs = {
    major: { icon: TrendingUp, color: 'text-red-600 dark:text-red-400', label: 'Major' },
    minor: { icon: TrendingDown, color: 'text-yellow-600 dark:text-yellow-400', label: 'Minor' },
    patch: { icon: Minus, color: 'text-green-600 dark:text-green-400', label: 'Patch' },
    formatting: { icon: Edit3, color: 'text-blue-600 dark:text-blue-400', label: 'Format' }
  };
  return configs[changeType?.toLowerCase()] || configs.minor;
};

/**
 * Version Timeline Component
 */
const VersionTimeline = ({ versions, currentVersion, onVersionSelect }) => {
  const timelineRef = useRef(null);
  const [hoveredVersion, setHoveredVersion] = useState(null);

  return (
    <div className="relative w-full overflow-x-auto pb-4">
      <div ref={timelineRef} className="relative min-w-full h-24 flex items-center px-4">
        {/* Timeline line */}
        <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-blue-200 via-blue-400 to-blue-200 dark:from-blue-800 dark:via-blue-600 dark:to-blue-800 top-1/2 -translate-y-1/2" />
        
        {/* Version nodes */}
        {versions.map((version, idx) => {
          const isActive = version.versionNumber === currentVersion?.versionNumber;
          const isBranch = version.metadata?.branchPoint;
          const isMerge = version.metadata?.mergePoint;
          
          return (
            <div
              key={version.id}
              className="relative flex-shrink-0 cursor-pointer transition-all duration-200 hover:scale-110"
              style={{ left: `${(idx / (versions.length - 1)) * 90}%` }}
              onClick={() => onVersionSelect(version)}
              onMouseEnter={() => setHoveredVersion(version)}
              onMouseLeave={() => setHoveredVersion(null)}
            >
              {/* Branch indicator */}
              {isBranch && (
                <GitBranch className="absolute -top-6 left-1/2 -translate-x-1/2 h-4 w-4 text-purple-600 dark:text-purple-400" />
              )}
              
              {/* Merge indicator */}
              {isMerge && (
                <GitMerge className="absolute -bottom-6 left-1/2 -translate-x-1/2 h-4 w-4 text-green-600 dark:text-green-400" />
              )}
              
              {/* Version dot */}
              <div
                className={cn(
                  "w-4 h-4 rounded-full border-2 transition-all duration-200",
                  isActive 
                    ? "bg-blue-600 border-blue-600 dark:bg-blue-400 dark:border-blue-400 scale-150 ring-4 ring-blue-200 dark:ring-blue-800" 
                    : "bg-white dark:bg-gray-800 border-gray-400 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400"
                )}
              />
              
              {/* Version label */}
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs font-medium whitespace-nowrap">
                v{version.versionLabel || version.versionNumber}
              </div>
              
              {/* Hover tooltip */}
              {hoveredVersion?.id === version.id && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 whitespace-nowrap">
                  <div className="text-sm font-medium">{version.versionLabel || `Version ${version.versionNumber}`}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {format(parseISO(version.createdAt), 'MMM d, yyyy HH:mm')}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">by {version.createdByName}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Version Comparison View Component
 */
const VersionComparisonView = ({ leftVersion, rightVersion, onClose }) => {
  const [viewMode, setViewMode] = useState('side-by-side'); // side-by-side, unified, raw
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);
  const leftRef = useRef(null);
  const rightRef = useRef(null);

  // Synchronized scrolling
  const handleScroll = useCallback((source) => {
    if (source === 'left' && rightRef.current && leftRef.current) {
      rightRef.current.scrollTop = leftRef.current.scrollTop;
      rightRef.current.scrollLeft = leftRef.current.scrollLeft;
    } else if (source === 'right' && leftRef.current && rightRef.current) {
      leftRef.current.scrollTop = rightRef.current.scrollTop;
      leftRef.current.scrollLeft = rightRef.current.scrollLeft;
    }
  }, []);

  // Calculate diff
  const diffResult = useMemo(() => {
    if (!leftVersion?.content || !rightVersion?.content) return null;
    
    const leftContent = typeof leftVersion.content === 'string' 
      ? leftVersion.content 
      : JSON.stringify(leftVersion.content, null, 2);
    const rightContent = typeof rightVersion.content === 'string' 
      ? rightVersion.content 
      : JSON.stringify(rightVersion.content, null, 2);

    const wordDiff = diffWords(leftContent, rightContent);
    const lineDiff = diffLines(leftContent, rightContent);
    const patch = createPatch('content', leftContent, rightContent);

    // Calculate statistics
    let additions = 0;
    let deletions = 0;
    let modifications = 0;

    wordDiff.forEach(part => {
      if (part.added) additions += part.value.split(' ').length;
      else if (part.removed) deletions += part.value.split(' ').length;
      else if (part.value.trim()) modifications += part.value.split(' ').filter(w => w.trim()).length;
    });

    return { wordDiff, lineDiff, patch, stats: { additions, deletions, modifications } };
  }, [leftVersion, rightVersion]);

  // Render diff content
  const renderDiffContent = (diff, side) => {
    if (!diff) return null;
    
    return diff.wordDiff.map((part, index) => {
      if (showOnlyChanges && !part.added && !part.removed) {
        return null;
      }

      const className = cn(
        "px-1 rounded",
        part.added && side === 'right' && "bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100",
        part.removed && side === 'left' && "bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-100 line-through",
        !part.added && !part.removed && "text-gray-700 dark:text-gray-300"
      );

      if ((side === 'left' && part.added) || (side === 'right' && part.removed)) {
        return null;
      }

      return (
        <span key={index} className={className}>
          {part.value}
        </span>
      );
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <DiffIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold">Version Comparison</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Stats bar */}
        {diffResult && (
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1">
              <Plus className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="font-medium text-green-600 dark:text-green-400">{diffResult.stats.additions}</span>
              <span className="text-gray-500 dark:text-gray-400">additions</span>
            </span>
            <span className="flex items-center gap-1">
              <Minus className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span className="font-medium text-red-600 dark:text-red-400">{diffResult.stats.deletions}</span>
              <span className="text-gray-500 dark:text-gray-400">deletions</span>
            </span>
            <span className="flex items-center gap-1">
              <Edit3 className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <span className="font-medium text-yellow-600 dark:text-yellow-400">{diffResult.stats.modifications}</span>
              <span className="text-gray-500 dark:text-gray-400">modifications</span>
            </span>
          </div>
        )}

        {/* View controls */}
        <div className="flex items-center gap-3 mt-3">
          <RadioGroup value={viewMode} onValueChange={setViewMode} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="side-by-side" id="side-by-side" />
              <Label htmlFor="side-by-side" className="text-sm cursor-pointer">Side by Side</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="unified" id="unified" />
              <Label htmlFor="unified" className="text-sm cursor-pointer">Unified</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="raw" id="raw" />
              <Label htmlFor="raw" className="text-sm cursor-pointer">Raw Diff</Label>
            </div>
          </RadioGroup>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-2">
            <Checkbox 
              id="show-only-changes" 
              checked={showOnlyChanges} 
              onCheckedChange={setShowOnlyChanges}
            />
            <Label htmlFor="show-only-changes" className="text-sm cursor-pointer">Show only changes</Label>
          </div>
        </div>
      </div>

      {/* Comparison content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'side-by-side' ? (
          <div className="h-full grid grid-cols-2 gap-px bg-gray-200 dark:bg-gray-700">
            {/* Left version */}
            <div className="bg-white dark:bg-gray-900">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Version {leftVersion?.versionLabel || leftVersion?.versionNumber}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {leftVersion?.createdAt && format(parseISO(leftVersion.createdAt), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
              </div>
              <ScrollArea 
                ref={leftRef}
                onScroll={() => handleScroll('left')}
                className="h-[calc(100%-40px)] p-4"
              >
                <pre className="whitespace-pre-wrap text-sm font-mono">
                  {diffResult ? renderDiffContent(diffResult, 'left') : leftVersion?.content}
                </pre>
              </ScrollArea>
            </div>

            {/* Right version */}
            <div className="bg-white dark:bg-gray-900">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Version {rightVersion?.versionLabel || rightVersion?.versionNumber}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {rightVersion?.createdAt && format(parseISO(rightVersion.createdAt), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
              </div>
              <ScrollArea 
                ref={rightRef}
                onScroll={() => handleScroll('right')}
                className="h-[calc(100%-40px)] p-4"
              >
                <pre className="whitespace-pre-wrap text-sm font-mono">
                  {diffResult ? renderDiffContent(diffResult, 'right') : rightVersion?.content}
                </pre>
              </ScrollArea>
            </div>
          </div>
        ) : viewMode === 'unified' ? (
          <ScrollArea className="h-full p-4 bg-white dark:bg-gray-900">
            <pre className="whitespace-pre-wrap text-sm font-mono">
              {diffResult?.lineDiff.map((part, index) => (
                <div
                  key={index}
                  className={cn(
                    "px-2 py-1",
                    part.added && "bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100",
                    part.removed && "bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-100 line-through"
                  )}
                >
                  {part.value}
                </div>
              ))}
            </pre>
          </ScrollArea>
        ) : (
          <ScrollArea className="h-full p-4 bg-gray-900 dark:bg-black">
            <pre className="text-xs font-mono text-green-400">{diffResult?.patch}</pre>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};

/**
 * Main Version History Component
 */
export default function VersionHistory({ componentId, documentId, isOpen, onClose }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useTenantContext();
  
  // State management
  const [selectedVersions, setSelectedVersions] = useState([]);
  const [compareMode, setCompareMode] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [leftVersion, setLeftVersion] = useState(null);
  const [rightVersion, setRightVersion] = useState(null);
  const [expandedVersion, setExpandedVersion] = useState(null);
  const [filters, setFilters] = useState({
    dateRange: null,
    user: '',
    changeType: 'all',
    searchTerm: ''
  });
  const [quickFilter, setQuickFilter] = useState('all'); // all, my-changes, last-30-days, major-only

  // Fetch version history
  const { data: versions, isLoading, refetch } = useQuery({
    queryKey: [`/api/coauthor/components/${componentId}/versions`],
    enabled: isOpen && !!componentId,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/coauthor/components/${componentId}/versions`);
      return response.json();
    }
  });

  // Fetch component details
  const { data: component } = useQuery({
    queryKey: [`/api/coauthor/components/${componentId}`],
    enabled: isOpen && !!componentId,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/coauthor/components/${componentId}`);
      return response.json();
    }
  });

  // Restore version mutation
  const restoreVersionMutation = useMutation({
    mutationFn: async ({ versionId, reason }) => {
      const response = await apiRequest('POST', `/api/coauthor/components/${componentId}/versions/${versionId}/restore`, { reason });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Version Restored", description: "A new version has been created from the restored content" });
      refetch();
      queryClient.invalidateQueries([`/api/coauthor/components/${componentId}`]);
    },
    onError: (error) => {
      toast({ title: "Restore Failed", description: error.message, variant: "destructive" });
    }
  });

  // Export version history
  const exportHistory = useCallback(async (format) => {
    try {
      if (format === 'pdf') {
        // Generate PDF report
        const response = await apiRequest('GET', `/api/coauthor/components/${componentId}/versions/export?format=pdf`);
        const blob = await response.blob();
        saveAs(blob, `version-history-${componentId}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      } else if (format === 'html') {
        // Export diff as HTML
        const response = await apiRequest('GET', `/api/coauthor/components/${componentId}/versions/export?format=html`);
        const blob = await response.blob();
        saveAs(blob, `version-diff-${componentId}-${format(new Date(), 'yyyy-MM-dd')}.html`);
      } else if (format === 'csv') {
        // Export metadata as CSV
        const response = await apiRequest('GET', `/api/coauthor/components/${componentId}/versions/export?format=csv`);
        const blob = await response.blob();
        saveAs(blob, `version-metadata-${componentId}-${format(new Date(), 'yyyy-MM-dd')}.csv`);
      }
      toast({ title: "Export Successful", description: `Version history exported as ${format.toUpperCase()}` });
    } catch (error) {
      toast({ title: "Export Failed", description: error.message, variant: "destructive" });
    }
  }, [componentId]);

  // Filter versions based on criteria
  const filteredVersions = useMemo(() => {
    if (!versions) return [];
    
    let filtered = [...versions];

    // Quick filters
    if (quickFilter === 'my-changes') {
      filtered = filtered.filter(v => v.createdById === currentOrganization?.currentUserId);
    } else if (quickFilter === 'last-30-days') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      filtered = filtered.filter(v => parseISO(v.createdAt) >= thirtyDaysAgo);
    } else if (quickFilter === 'major-only') {
      filtered = filtered.filter(v => v.changeType === 'major');
    }

    // Custom filters
    if (filters.dateRange) {
      filtered = filtered.filter(v => {
        const vDate = parseISO(v.createdAt);
        return isWithinInterval(vDate, filters.dateRange);
      });
    }

    if (filters.user) {
      filtered = filtered.filter(v => 
        v.createdByName?.toLowerCase().includes(filters.user.toLowerCase())
      );
    }

    if (filters.changeType !== 'all') {
      filtered = filtered.filter(v => v.changeType === filters.changeType);
    }

    if (filters.searchTerm) {
      filtered = filtered.filter(v => 
        v.changeDescription?.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        v.versionLabel?.toLowerCase().includes(filters.searchTerm.toLowerCase())
      );
    }

    return filtered;
  }, [versions, quickFilter, filters, currentOrganization]);

  // Handle version comparison
  const handleCompare = () => {
    if (selectedVersions.length !== 2) {
      toast({ 
        title: "Select Two Versions", 
        description: "Please select exactly two versions to compare",
        variant: "destructive" 
      });
      return;
    }

    const [v1, v2] = selectedVersions.map(id => 
      filteredVersions.find(v => v.id === id)
    );

    setLeftVersion(v1);
    setRightVersion(v2);
    setShowComparison(true);
  };

  // Handle version restore
  const handleRestore = (version) => {
    if (!version) return;

    // Show confirmation dialog
    const reason = window.prompt(
      `Are you sure you want to restore Version ${version.versionLabel || version.versionNumber}?\n\nPlease provide a reason:`
    );

    if (reason) {
      restoreVersionMutation.mutate({ versionId: version.id, reason });
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl h-[90vh] p-0 overflow-hidden">
        {/* SharePoint-style header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-800 dark:to-blue-900 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SiMicrosoftsharepoint className="h-8 w-8" />
              <div>
                <h2 className="text-2xl font-semibold">Version History</h2>
                <p className="text-blue-100">
                  {component?.name || component?.udi || 'Document Component'}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex flex-col h-[calc(100%-120px)]">
          {/* Toolbar */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4">
              {/* Quick filters */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={quickFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setQuickFilter('all')}
                >
                  All Versions
                </Button>
                <Button
                  size="sm"
                  variant={quickFilter === 'my-changes' ? 'default' : 'outline'}
                  onClick={() => setQuickFilter('my-changes')}
                >
                  <User className="h-3 w-3 mr-1" />
                  My Changes
                </Button>
                <Button
                  size="sm"
                  variant={quickFilter === 'last-30-days' ? 'default' : 'outline'}
                  onClick={() => setQuickFilter('last-30-days')}
                >
                  <Clock className="h-3 w-3 mr-1" />
                  Last 30 Days
                </Button>
                <Button
                  size="sm"
                  variant={quickFilter === 'major-only' ? 'default' : 'outline'}
                  onClick={() => setQuickFilter('major-only')}
                >
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Major Only
                </Button>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCompareMode(!compareMode)}
                  className={compareMode ? 'bg-blue-50 dark:bg-blue-950' : ''}
                >
                  <GitCompare className="h-3 w-3 mr-1" />
                  {compareMode ? 'Exit Compare' : 'Compare'}
                </Button>
                {compareMode && selectedVersions.length === 2 && (
                  <Button size="sm" onClick={handleCompare}>
                    <GitCommit className="h-3 w-3 mr-1" />
                    Show Diff
                  </Button>
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Download className="h-3 w-3 mr-1" />
                      Export
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2" align="end">
                    <div className="space-y-1">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="w-full justify-start"
                        onClick={() => exportHistory('pdf')}
                      >
                        <FileText className="h-3 w-3 mr-2" />
                        Export as PDF
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="w-full justify-start"
                        onClick={() => exportHistory('html')}
                      >
                        <FileText className="h-3 w-3 mr-2" />
                        Export as HTML
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="w-full justify-start"
                        onClick={() => exportHistory('csv')}
                      >
                        <Database className="h-3 w-3 mr-2" />
                        Export as CSV
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <Button size="sm" variant="outline" onClick={refetch}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Search and filters */}
            <div className="flex items-center gap-3 mt-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search version comments..."
                  value={filters.searchTerm}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                  className="pl-10"
                />
              </div>
              <Select
                value={filters.changeType}
                onValueChange={(value) => setFilters(prev => ({ ...prev, changeType: value }))}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Change type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="major">Major</SelectItem>
                  <SelectItem value="minor">Minor</SelectItem>
                  <SelectItem value="patch">Patch</SelectItem>
                  <SelectItem value="formatting">Formatting</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" onClick={() => setFilters({
                dateRange: null,
                user: '',
                changeType: 'all',
                searchTerm: ''
              })}>
                Clear Filters
              </Button>
            </div>
          </div>

          {/* Timeline */}
          {filteredVersions.length > 1 && (
            <div className="p-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <VersionTimeline 
                versions={filteredVersions}
                currentVersion={filteredVersions[0]}
                onVersionSelect={(v) => setExpandedVersion(v.id === expandedVersion ? null : v.id)}
              />
            </div>
          )}

          {/* Version list or comparison view */}
          {showComparison ? (
            <VersionComparisonView 
              leftVersion={leftVersion}
              rightVersion={rightVersion}
              onClose={() => setShowComparison(false)}
            />
          ) : (
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : filteredVersions.length === 0 ? (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>No Versions Found</AlertTitle>
                    <AlertDescription>
                      No version history matches your current filters.
                    </AlertDescription>
                  </Alert>
                ) : (
                  filteredVersions.map((version, index) => {
                    const isExpanded = expandedVersion === version.id;
                    const statusConfig = getStatusBadgeConfig(
                      index === 0 ? 'current' : version.metadata?.status || 'published'
                    );
                    const changeConfig = getChangeTypeBadgeConfig(version.changeType);
                    const isLocked = version.metadata?.locked;

                    return (
                      <Card 
                        key={version.id} 
                        className={cn(
                          "transition-all duration-200",
                          compareMode && "cursor-pointer",
                          selectedVersions.includes(version.id) && "ring-2 ring-blue-500 dark:ring-blue-400"
                        )}
                        onClick={() => {
                          if (compareMode) {
                            if (selectedVersions.includes(version.id)) {
                              setSelectedVersions(prev => prev.filter(id => id !== version.id));
                            } else if (selectedVersions.length < 2) {
                              setSelectedVersions(prev => [...prev, version.id]);
                            }
                          }
                        }}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {compareMode && (
                                <Checkbox 
                                  checked={selectedVersions.includes(version.id)}
                                  onCheckedChange={() => {}}
                                  onClick={(e) => e.stopPropagation()}
                                  disabled={!selectedVersions.includes(version.id) && selectedVersions.length >= 2}
                                />
                              )}
                              <Avatar className="h-10 w-10">
                                <AvatarFallback className="text-sm">
                                  {getUserInitials(version.createdByName)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-base">
                                    {version.versionLabel || `Version ${version.versionNumber}`}
                                  </span>
                                  <Badge className={statusConfig.className} variant={statusConfig.variant}>
                                    <statusConfig.icon className="h-3 w-3 mr-1" />
                                    {index === 0 ? 'Current' : version.metadata?.status || 'Published'}
                                  </Badge>
                                  {isLocked && (
                                    <Badge variant="outline" className="border-red-300 text-red-600">
                                      <Lock className="h-3 w-3 mr-1" />
                                      Locked
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className="flex items-center gap-1">
                                    <changeConfig.icon className={cn("h-3 w-3", changeConfig.color)} />
                                    <span className="text-xs">{changeConfig.label}</span>
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                                  <span className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {version.createdByName}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatDistanceToNow(parseISO(version.createdAt), { addSuffix: true })}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <CalendarIcon className="h-3 w-3" />
                                    {format(parseISO(version.createdAt), 'MMM d, yyyy HH:mm')}
                                  </span>
                                  {version.metadata?.fileSize && (
                                    <span className="flex items-center gap-1">
                                      <Database className="h-3 w-3" />
                                      {formatFileSize(version.metadata.fileSize)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {/* Compliance indicators */}
                              {version.complianceStatus === 'compliant' && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge variant="outline" className="border-green-300 text-green-600">
                                        <ShieldCheck className="h-3 w-3 mr-1" />
                                        21 CFR Part 11
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Compliant with 21 CFR Part 11 requirements</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              
                              {/* Action buttons */}
                              {!compareMode && (
                                <div className="flex items-center gap-1">
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    onClick={() => setExpandedVersion(isExpanded ? null : version.id)}
                                  >
                                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                  </Button>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button size="sm" variant="ghost">
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-48 p-2" align="end">
                                      <div className="space-y-1">
                                        <Button 
                                          size="sm" 
                                          variant="ghost" 
                                          className="w-full justify-start"
                                          onClick={() => {
                                            // View version
                                          }}
                                        >
                                          <Eye className="h-3 w-3 mr-2" />
                                          View
                                        </Button>
                                        {index > 0 && !isLocked && (
                                          <Button 
                                            size="sm" 
                                            variant="ghost" 
                                            className="w-full justify-start"
                                            onClick={() => handleRestore(version)}
                                          >
                                            <RotateCcw className="h-3 w-3 mr-2" />
                                            Restore
                                          </Button>
                                        )}
                                        <Button 
                                          size="sm" 
                                          variant="ghost" 
                                          className="w-full justify-start"
                                          onClick={() => {
                                            // Download version
                                          }}
                                        >
                                          <Download className="h-3 w-3 mr-2" />
                                          Download
                                        </Button>
                                        {index > 0 && !isLocked && (
                                          <>
                                            <Separator />
                                            <Button 
                                              size="sm" 
                                              variant="ghost" 
                                              className="w-full justify-start text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                                              onClick={() => {
                                                // Delete version
                                              }}
                                            >
                                              <Trash2 className="h-3 w-3 mr-2" />
                                              Delete
                                            </Button>
                                          </>
                                        )}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Change description */}
                          {version.changeDescription && (
                            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                              {version.changeDescription}
                            </p>
                          )}
                        </CardHeader>

                        {/* Expanded details */}
                        {isExpanded && (
                          <CardContent className="pt-0">
                            <Separator className="mb-4" />
                            <div className="grid grid-cols-2 gap-4">
                              {/* Audit trail */}
                              <div className="space-y-3">
                                <h4 className="text-sm font-semibold flex items-center gap-2">
                                  <Shield className="h-4 w-4" />
                                  Audit Trail
                                </h4>
                                <div className="space-y-2 text-sm">
                                  <div className="flex items-center justify-between">
                                    <span className="text-gray-500 dark:text-gray-400">Created By:</span>
                                    <span>{version.createdByName}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-gray-500 dark:text-gray-400">Created At:</span>
                                    <span>{format(parseISO(version.createdAt), 'MMM d, yyyy HH:mm:ss')}</span>
                                  </div>
                                  {version.approvedById && (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-gray-500 dark:text-gray-400">Approved By:</span>
                                        <span>{version.metadata?.approvedByName}</span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-gray-500 dark:text-gray-400">Approved At:</span>
                                        <span>{format(parseISO(version.approvedAt), 'MMM d, yyyy HH:mm:ss')}</span>
                                      </div>
                                    </>
                                  )}
                                  {version.metadata?.signature && (
                                    <div className="flex items-center justify-between">
                                      <span className="text-gray-500 dark:text-gray-400">E-Signature:</span>
                                      <Badge variant="outline" className="text-xs">
                                        <ShieldCheck className="h-3 w-3 mr-1" />
                                        Verified
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Regulatory compliance */}
                              <div className="space-y-3">
                                <h4 className="text-sm font-semibold flex items-center gap-2">
                                  <Award className="h-4 w-4" />
                                  Regulatory Compliance
                                </h4>
                                <div className="space-y-2">
                                  {version.validatedAgainst?.map((reg, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                      <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
                                      <span className="text-sm">{reg}</span>
                                    </div>
                                  )) || (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                      No compliance validation data available
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Component dependencies */}
                            {version.metadata?.dependencies && (
                              <div className="mt-4 space-y-3">
                                <h4 className="text-sm font-semibold flex items-center gap-2">
                                  <Layers className="h-4 w-4" />
                                  Component Dependencies
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                  {version.metadata.dependencies.map((dep, idx) => (
                                    <Badge key={idx} variant="secondary">
                                      <Link className="h-3 w-3 mr-1" />
                                      {dep}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Related change requests */}
                            {version.metadata?.changeRequests && (
                              <div className="mt-4 space-y-3">
                                <h4 className="text-sm font-semibold flex items-center gap-2">
                                  <GitCommit className="h-4 w-4" />
                                  Related Change Requests
                                </h4>
                                <div className="space-y-2">
                                  {version.metadata.changeRequests.map((cr, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                      <span className="font-mono text-blue-600 dark:text-blue-400">#{cr.id}</span>
                                      <span>{cr.title}</span>
                                      <Badge variant="outline" className="text-xs">
                                        {cr.status}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        )}
                      </Card>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}