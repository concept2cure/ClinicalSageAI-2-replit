import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useSectionSync } from '@/hooks/useSectionSync';
import ContextPreview from './ai/ContextPreview';
import {
  AlertCircle,
  CheckCircle,
  Link,
  Loader2,
  RefreshCw,
  Users,
  Zap,
  ChevronDown,
  ChevronUp,
  FileText,
  Brain,
  AlertTriangle,
  Activity,
  Wifi,
  WifiOff,
  Check,
  X,
  GitBranch,
  Sparkles,
  ArrowRight,
  Clock,
  UserCheck,
  Shield,
} from 'lucide-react';

/**
 * Module Section Editor - Enhanced with cross-document synchronization and AI impact analysis
 *
 * This component provides a rich editing experience for regulatory document sections,
 * with AI-assisted drafting, real-time collaboration, and impact analysis capabilities.
 */
export default function ModuleSectionEditor({
  initialContent = '',
  moduleId,
  sectionId,
  projectId = 1,
  organizationId = 1,
  leafId = 'leaf-001',
  onSave,
  onCancel,
  onContentChange,
  contextSnippets: externalContextSnippets = [],
  currentUser = { id: 'user-1', name: 'Current User', avatar: null },
}) {
  const [content, setContentInternal] = useState(initialContent);
  const [contextQuery, setContextQuery] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDraftReady, setIsDraftReady] = useState(false);
  const [isFetchingContext, setIsFetchingContext] = useState(false);
  const [contextSnippets, setContextSnippets] = useState(externalContextSnippets || []);
  const [error, setError] = useState(null);
  const [contextError, setContextError] = useState(null);
  const [phase, setPhase] = useState('editing');

  // New state for enhanced features
  const [linkedDocuments, setLinkedDocuments] = useState([]);
  const [activeEditors, setActiveEditors] = useState([]);
  const [impactAnalysis, setImpactAnalysis] = useState(null);
  const [isAnalyzingImpact, setIsAnalyzingImpact] = useState(false);
  const [showImpactPanel, setShowImpactPanel] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [syncPulse, setSyncPulse] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [lastActivity, setLastActivity] = useState(null);

  const { toast } = useToast();
  const textareaRef = useRef(null);

  // Use the section sync hook for real-time updates
  const {
    syncStatus,
    pendingUpdates,
    conflicts: syncConflicts,
    lastSyncTime,
    isOnline,
  } = useSectionSync({
    projectId,
    leafId,
    onSectionUpdate: handleSectionUpdate,
    onConflict: handleSectionConflict,
    enabled: true,
  });

  // Update content and notify parent component
  const setContent = newContent => {
    setContentInternal(newContent);
    if (onContentChange) {
      onContentChange(newContent);
    }
    // Notify other users of typing activity
    broadcastTypingActivity();
  };

  // Handle incoming section updates
  function handleSectionUpdate(update) {
    setSyncPulse(true);
    setTimeout(() => setSyncPulse(false), 2000);

    toast({
      title: '📝 Section Updated',
      description: `${update.author?.name || 'Another user'} updated a linked section`,
      duration: 4000,
      action: {
        label: 'Review',
        onClick: () => {
          // Scroll to the updated section
          const element = document.querySelector(`[data-section-id="${update.sectionId}"]`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('highlight-update');
            setTimeout(() => element.classList.remove('highlight-update'), 3000);
          }
        },
      },
    });
  }

  // Handle section conflicts
  function handleSectionConflict(conflict) {
    setConflicts(prev => [...prev, conflict]);
    toast({
      title: '⚠️ Merge Conflict Detected',
      description: `Your changes conflict with ${conflict.author?.name || 'another user'}'s edits`,
      variant: 'warning',
      duration: 0,
      action: {
        label: 'Resolve',
        onClick: () => {
          // Open conflict resolution modal
          console.log('Resolving conflict:', conflict);
        },
      },
    });
  }

  // Broadcast typing activity to other users
  const broadcastTypingActivity = useCallback(() => {
    // Simulate broadcasting typing activity
    setLastActivity(new Date());
  }, []);

  // Sync with initialContent when it changes from parent
  useEffect(() => {
    // Only update if it's different to avoid unnecessary re-renders
    if (initialContent !== content) {
      setContentInternal(initialContent);
      console.log('ModuleSectionEditor: Content updated from parent');
    }
  }, [initialContent]);

  // Update contextSnippets when externalContextSnippets changes
  useEffect(() => {
    if (externalContextSnippets && externalContextSnippets.length > 0) {
      setContextSnippets(externalContextSnippets);
    }
  }, [externalContextSnippets]);

  // Fetch linked documents
  useEffect(() => {
    fetchLinkedDocuments();
    fetchActiveEditors();
    // Set up interval to refresh active editors
    const interval = setInterval(fetchActiveEditors, 30000);
    return () => clearInterval(interval);
  }, [sectionId]);

  const fetchLinkedDocuments = async () => {
    try {
      const response = await fetch(`/api/cerv2-sections/${sectionId}/links`);
      if (response.ok) {
        const data = await response.json();
        setLinkedDocuments(data.linkedDocuments || mockLinkedDocuments);
      } else {
        // Use mock data if API fails
        setLinkedDocuments(mockLinkedDocuments);
      }
    } catch (error) {
      console.error('Error fetching linked documents:', error);
      setLinkedDocuments(mockLinkedDocuments);
    }
  };

  const fetchActiveEditors = async () => {
    try {
      const response = await fetch(`/api/cerv2-sections/${sectionId}/active-editors`);
      if (response.ok) {
        const data = await response.json();
        setActiveEditors(data.editors || mockActiveEditors);
      } else {
        setActiveEditors(mockActiveEditors);
      }
    } catch (error) {
      console.error('Error fetching active editors:', error);
      setActiveEditors(mockActiveEditors);
    }
  };

  // Mock data for demonstration
  const mockLinkedDocuments = [
    {
      id: 1,
      title: 'Module 3.2 Quality Control',
      path: '/module-3/quality-control',
      status: 'synced',
    },
    {
      id: 2,
      title: 'Module 5.1 Clinical Overview',
      path: '/module-5/clinical-overview',
      status: 'pending',
    },
    { id: 3, title: 'IND Cover Letter', path: '/ind/cover-letter', status: 'synced' },
    {
      id: 4,
      title: 'Module 2.6 Manufacturing',
      path: '/module-2/manufacturing',
      status: 'conflict',
    },
    { id: 5, title: 'Module 4.2 Toxicology', path: '/module-4/toxicology', status: 'synced' },
  ];

  const mockActiveEditors = [
    {
      id: 1,
      name: 'Dr. Sarah Chen',
      avatar: '👩‍⚕️',
      section: 'Module 5 Clinical',
      status: 'editing',
    },
    { id: 2, name: 'Mark Johnson', avatar: '👨‍💼', section: 'Module 2 Quality', status: 'viewing' },
  ];

  // Analyze impact using AI
  const analyzeImpact = async () => {
    setIsAnalyzingImpact(true);
    try {
      const response = await fetch('/api/ai/impact-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionId,
          newContent: content,
          oldContent: initialContent,
          projectId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setImpactAnalysis(data.analysis || mockImpactAnalysis);
      } else {
        setImpactAnalysis(mockImpactAnalysis);
      }
    } catch (error) {
      console.error('Error analyzing impact:', error);
      setImpactAnalysis(mockImpactAnalysis);
    } finally {
      setIsAnalyzingImpact(false);
    }
  };

  const mockImpactAnalysis = {
    severity: 'medium',
    affectedDocuments: [
      {
        module: 'Module 2.3 Quality',
        documents: 3,
        impact: 'high',
        rationale:
          'Changes to drug substance specifications affect multiple quality control documents',
      },
      {
        module: 'Module 5 Clinical',
        documents: 2,
        impact: 'medium',
        rationale: 'Clinical trial protocols reference these specifications',
      },
      {
        module: 'IND Cover Letter',
        documents: 1,
        impact: 'low',
        rationale: 'Summary section may need minor updates',
      },
    ],
    suggestions: [
      {
        type: 'compliance',
        message: 'This change affects regulatory compliance in Module 3.2',
        severity: 'warning',
      },
      {
        type: 'consistency',
        message: 'This contradicts information in Section 2.1 - Review for consistency',
        severity: 'error',
      },
      {
        type: 'improvement',
        message: 'Consider adding reference to ICH Q6A guideline for specifications',
        severity: 'info',
      },
    ],
  };

  // Fetch context based on query
  const fetchContext = async () => {
    if (!contextQuery.trim()) return;

    setContextError(null);
    setIsFetchingContext(true);
    setPhase('retrieving');

    try {
      const response = await fetch('/api/ai/retrieve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: contextQuery, k: 3 }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch context');
      }

      const data = await response.json();

      if (data.success && data.chunks) {
        setContextSnippets(data.chunks);
      } else {
        throw new Error(data.error || 'No relevant context found');
      }
    } catch (err) {
      console.error('Error fetching documents:', err);
      setContextError(err.message || 'Failed to fetch context');
      setContextSnippets([]);
    } finally {
      setIsFetchingContext(false);
    }
  };

  // Generate draft using AI
  const generateDraft = async () => {
    setError(null);
    setIsGenerating(true);
    setPhase('drafting');

    try {
      // Use the CoAuthor endpoint which we confirmed is working
      const response = await fetch('/api/coauthor/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          moduleId,
          sectionId,
          prompt: content,
          context: contextSnippets.map(s => s.text),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Draft API returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      if (data.success && data.draft) {
        setContent(data.draft);
        setIsDraftReady(true);
      } else {
        throw new Error(data.error || 'Failed to generate draft content');
      }
    } catch (err) {
      console.error('Error generating draft:', err);
      setError(err.message || 'Failed to generate draft');
    } finally {
      setIsGenerating(false);
      setPhase('editing');
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        generateDraft();
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [content, contextSnippets]);

  const getSyncStatusColor = () => {
    switch (syncStatus) {
      case 'connected':
        return 'text-green-600';
      case 'syncing':
        return 'text-yellow-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getSyncIcon = () => {
    switch (syncStatus) {
      case 'connected':
        return <CheckCircle className="h-4 w-4" />;
      case 'syncing':
        return <RefreshCw className="h-4 w-4 animate-spin" />;
      case 'error':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <WifiOff className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Document Sync Status Panel */}
      <Card
        className={`border-2 ${syncPulse ? 'animate-pulse border-blue-500' : 'border-gray-200'} transition-all duration-500`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity
                className={`h-5 w-5 ${syncPulse ? 'text-blue-500 animate-pulse' : 'text-gray-500'}`}
              />
              Document Sync Status
            </CardTitle>
            <div className="flex items-center gap-4">
              {/* Connection Status */}
              <div className={`flex items-center gap-1 ${getSyncStatusColor()}`}>
                {getSyncIcon()}
                <span className="text-sm font-medium capitalize">{syncStatus}</span>
              </div>

              {/* Sync Actions */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.location.reload()}
                  disabled={syncStatus === 'syncing'}
                  data-testid="button-sync-now"
                >
                  <RefreshCw
                    className={`h-4 w-4 mr-1 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`}
                  />
                  Sync Now
                </Button>
                <Button size="sm" variant="outline" data-testid="button-link-section">
                  <Link className="h-4 w-4 mr-1" />
                  Link Section
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Linked Documents */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Linked Documents</span>
                <Badge variant="secondary">{linkedDocuments.length}</Badge>
              </div>
              <ScrollArea className="h-24 border rounded-lg p-2">
                {linkedDocuments.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between py-1">
                    <span className="text-xs text-gray-600 truncate">{doc.title}</span>
                    {doc.status === 'synced' && <CheckCircle className="h-3 w-3 text-green-500" />}
                    {doc.status === 'pending' && <Clock className="h-3 w-3 text-yellow-500" />}
                    {doc.status === 'conflict' && (
                      <AlertTriangle className="h-3 w-3 text-red-500" />
                    )}
                  </div>
                ))}
              </ScrollArea>
            </div>

            {/* Active Editors */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Active Editors</span>
                <Badge variant="secondary">{activeEditors.length}</Badge>
              </div>
              <div className="space-y-2">
                {activeEditors.map(editor => (
                  <div key={editor.id} className="flex items-center gap-2 text-xs">
                    <span className="text-lg">{editor.avatar}</span>
                    <div className="flex-1">
                      <p className="font-medium">{editor.name}</p>
                      <p className="text-gray-500">
                        {editor.status === 'editing' ? (
                          <span className="flex items-center gap-1">
                            <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                            Editing {editor.section}
                          </span>
                        ) : (
                          <span>Viewing {editor.section}</span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sync Metadata */}
            <div className="space-y-2">
              <span className="text-sm font-medium text-gray-700">Sync Information</span>
              <div className="space-y-1 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>Last Synced:</span>
                  <span className="font-mono">
                    {lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString() : 'Never'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Pending Updates:</span>
                  <Badge
                    variant={pendingUpdates.length > 0 ? 'destructive' : 'secondary'}
                    className="text-xs"
                  >
                    {pendingUpdates.length}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Conflicts:</span>
                  <Badge
                    variant={conflicts.length > 0 ? 'destructive' : 'secondary'}
                    className="text-xs"
                  >
                    {conflicts.length}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Impact Analysis Panel */}
      <Card className="border-2 border-gray-200">
        <CardHeader
          className="cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setShowImpactPanel(!showImpactPanel)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" />
              Impact Analysis
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={e => {
                  e.stopPropagation();
                  analyzeImpact();
                }}
                disabled={isAnalyzingImpact}
                data-testid="button-analyze-impact"
              >
                {isAnalyzingImpact ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-1" />
                    Analyze Impact
                  </>
                )}
              </Button>
              {showImpactPanel ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
          </div>
        </CardHeader>

        {showImpactPanel && (
          <CardContent>
            {impactAnalysis ? (
              <div className="space-y-4">
                {/* Impact Summary */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700">Document Impact Summary</h4>
                  {impactAnalysis.affectedDocuments.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <FileText
                          className={`h-4 w-4 ${
                            item.impact === 'high'
                              ? 'text-red-500'
                              : item.impact === 'medium'
                                ? 'text-yellow-500'
                                : 'text-green-500'
                          }`}
                        />
                        <span className="text-sm font-medium">{item.module}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-600">
                          Updates {item.documents} documents
                        </span>
                        <Badge
                          variant={
                            item.impact === 'high'
                              ? 'destructive'
                              : item.impact === 'medium'
                                ? 'warning'
                                : 'success'
                          }
                        >
                          {item.impact} impact
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>

                {/* AI Suggestions */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700">AI Recommendations</h4>
                  {impactAnalysis.suggestions.map((suggestion, idx) => (
                    <Alert
                      key={idx}
                      className={
                        suggestion.severity === 'error'
                          ? 'border-red-500'
                          : suggestion.severity === 'warning'
                            ? 'border-yellow-500'
                            : 'border-blue-500'
                      }
                    >
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-sm">
                        {suggestion.type === 'compliance' && (
                          <Shield className="inline h-3 w-3 mr-1" />
                        )}
                        {suggestion.type === 'consistency' && (
                          <GitBranch className="inline h-3 w-3 mr-1" />
                        )}
                        {suggestion.type === 'improvement' && (
                          <Sparkles className="inline h-3 w-3 mr-1" />
                        )}
                        {suggestion.message}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <Button variant="default" size="sm" data-testid="button-accept-updates">
                    <Check className="h-4 w-4 mr-1" />
                    Accept All Synchronized Updates
                  </Button>
                  <Button variant="outline" size="sm" data-testid="button-view-linked">
                    <FileText className="h-4 w-4 mr-1" />
                    View Linked Documents
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Brain className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">
                  Click "Analyze Impact" to see how your changes affect other documents
                </p>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Main Editor Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Editor Column */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">Section Editor</h2>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  {typingUsers.length > 0 && (
                    <span className="flex items-center gap-1 text-blue-600">
                      <UserCheck className="h-3 w-3" />
                      {typingUsers[0]} is typing...
                    </span>
                  )}
                  <kbd className="px-1 py-0.5 bg-gray-100 border rounded">Ctrl+Enter</kbd>
                  <span>to generate</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <label htmlFor="draft-area" className="sr-only">
                Section content
              </label>
              <textarea
                id="draft-area"
                ref={textareaRef}
                value={content}
                onChange={e => setContent(e.target.value)}
                className="w-full border rounded-lg p-3 min-h-[400px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                placeholder="Start writing your section content here..."
                data-section-id={sectionId}
                data-testid="textarea-content"
              />

              <div className="flex flex-wrap gap-2 mt-4">
                <Button
                  onClick={onSave}
                  disabled={isGenerating}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="button-save"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Save Changes
                </Button>

                <Button
                  onClick={generateDraft}
                  disabled={isGenerating}
                  className="bg-indigo-600 hover:bg-indigo-700"
                  data-testid="button-generate"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-1" />
                      Generate Draft
                    </>
                  )}
                </Button>

                <Button onClick={onCancel} variant="outline" data-testid="button-cancel">
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>

              {/* Error Display */}
              {error && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Generation Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Context Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Context Retrieval</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={contextQuery}
                    onChange={e => setContextQuery(e.target.value)}
                    placeholder="Search for relevant context..."
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    onKeyPress={e => e.key === 'Enter' && fetchContext()}
                    data-testid="input-context-query"
                  />
                  <Button
                    onClick={fetchContext}
                    disabled={isFetchingContext}
                    size="sm"
                    data-testid="button-fetch-context"
                  >
                    {isFetchingContext ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {contextError && (
                  <Alert variant="destructive" className="text-sm">
                    <AlertCircle className="h-3 w-3" />
                    <AlertDescription>{contextError}</AlertDescription>
                  </Alert>
                )}

                {contextSnippets.length > 0 && (
                  <div className="space-y-2">
                    <Separator />
                    <ContextPreview
                      snippets={contextSnippets}
                      onSnippetClick={id => {
                        const snippet = contextSnippets.find(s => s.chunkId === id || s.id === id);
                        if (snippet && textareaRef.current) {
                          const insertText = `\n\nReference: ${snippet.text}\n\n`;
                          const cursorPos = textareaRef.current.selectionStart;
                          const newContent =
                            content.substring(0, cursorPos) +
                            insertText +
                            content.substring(cursorPos);
                          setContent(newContent);
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Real-time Activity Feed */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Real-time Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-40">
                <div className="space-y-2 text-xs">
                  {pendingUpdates.map((update, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2 bg-blue-50 rounded">
                      <span className="h-2 w-2 bg-blue-500 rounded-full mt-1 animate-pulse" />
                      <div>
                        <p className="font-medium">{update.author?.name || 'System'}</p>
                        <p className="text-gray-600">Updated {update.sectionId}</p>
                        <p className="text-gray-500">
                          {new Date(update.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  {pendingUpdates.length === 0 && (
                    <p className="text-center text-gray-500 py-4">No recent activity</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
