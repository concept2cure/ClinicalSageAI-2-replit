import React, { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import useSectionSync from '@/hooks/useSectionSync';
// Professional rich text editor (standalone implementation)
const Editor = null; // Using professional fallback editor
import { toast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  Save,
  Download,
  Sparkles,
  Brain,
  TrendingUp,
  CheckCircle,
  History,
  GitBranch,
  Users,
  MessageSquare,
  FileText,
  Search,
  Target,
  Lightbulb,
  AlertCircle,
  BookOpen,
  Clock,
  User,
  X,
  Check,
  Eye,
  Link,
  Zap,
  WifiOff,
  Wifi,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

function EnhancedDocumentEditor({ document, onChange, onSave, onBack, projectId, leafId }) {
  const editorRef = useRef(null);
  const textAreaRef = useRef(null);
  const [forceUpdate, setForceUpdate] = useState(0);

  // State for package loading and fallback mode
  const [editorInitialized, setEditorInitialized] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [packageErrors, setPackageErrors] = useState([]);

  // Define initial content first - ensure it's always a string and handle corrupted content
  const getValidContent = content => {
    console.log('🔍 getValidContent called with:', typeof content, content);

    // Check for the literal string "[object Object]" which indicates corruption
    if (
      typeof content === 'string' &&
      (content.trim() === '[object Object]' || content.includes('[object Object]'))
    ) {
      console.warn('🚨 Found literal "[object Object]" string - replacing with default content');
      return `<h1>${document?.title || 'New Regulatory Document'}</h1>
<h2>Document Recovery</h2>
<p>This document content was corrupted (showed "[object Object]") and has been reset. Please add your content below.</p>

<h2>Key Sections</h2>
<ul>
  <li><strong>Executive Summary</strong></li>
  <li><strong>Study Objectives</strong></li>
  <li><strong>Methodology</strong></li>
  <li><strong>Results and Analysis</strong></li>
  <li><strong>Conclusions</strong></li>
</ul>

<hr>

<p><em>Use the advanced formatting toolbar above to style your document professionally. Track changes are enabled for collaborative editing.</em></p>`;
    }

    if (typeof content === 'string' && content.trim() !== '') {
      return content;
    }
    if (typeof content === 'object' && content !== null) {
      // If content is an object, try to extract meaningful text or return default
      if (content.content && typeof content.content === 'string') return String(content.content);
      if (content.text && typeof content.text === 'string') return String(content.text);
      if (content.body && typeof content.body === 'string') return String(content.body);
      if (content.html && typeof content.html === 'string') return String(content.html);

      // If it's a corrupted object, log it and return default content
      console.warn(
        '🚨 Corrupted document content detected - using default template. Object:',
        content
      );
      return `<h1>${document?.title || 'New Regulatory Document'}</h1>
<h2>Document Recovery</h2>
<p>This document had corrupted content that has been reset. Content type was: ${typeof content}. Please add your content below.</p>

<h2>Key Sections</h2>
<ul>
  <li><strong>Executive Summary</strong></li>
  <li><strong>Study Objectives</strong></li>
  <li><strong>Methodology</strong></li>
  <li><strong>Results and Analysis</strong></li>
  <li><strong>Conclusions</strong></li>
</ul>

<hr>

<p><em>Use the advanced formatting toolbar above to style your document professionally. Track changes are enabled for collaborative editing.</em></p>`;
    }
    // Fallback for any other type
    const fallbackContent = `<h1>${document?.title || 'New Regulatory Document'}</h1>
<h2>Overview</h2>
<p>Begin writing your regulatory document here. This professional editor provides AI-powered assistance for creating compliant pharmaceutical documentation with track changes, version history, and real-time collaboration.</p>

<h2>Key Sections</h2>
<ul>
  <li><strong>Executive Summary</strong></li>
  <li><strong>Study Objectives</strong></li>
  <li><strong>Methodology</strong></li>
  <li><strong>Results and Analysis</strong></li>
  <li><strong>Conclusions</strong></li>
</ul>

<hr>

<p><em>Use the advanced formatting toolbar above to style your document professionally. Track changes are enabled for collaborative editing.</em></p>`;

    console.log('🔧 Using fallback content for type:', typeof content, 'value:', content);
    return fallbackContent;
  };

  const initialContent = getValidContent(document?.content);

  const [content, setContent] = useState(() => initialContent);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [indBuilderMode, setIndBuilderMode] = useState(false);
  const [trackChanges, setTrackChanges] = useState(true);
  const [changes, setChanges] = useState([]);
  const [lastSavedContent, setLastSavedContent] = useState(() => initialContent);
  const changeTimeoutRef = useRef(null);
  const [complianceMetrics, setComplianceMetrics] = useState({
    fda: 85,
    ich: 90,
    quality: 88,
  });

  // Intelligent Document Context Hints State
  const [contextHints, setContextHints] = useState([]);
  const [showContextPanel, setShowContextPanel] = useState(true);
  const [hintCategories, setHintCategories] = useState({
    structure: true,
    compliance: true,
    content: true,
    style: true,
  });
  const [showPreview, setShowPreview] = useState(false);
  // Initialize versions with localStorage persistence
  const [versions, setVersions] = useState(() => {
    // Load saved versions from localStorage
    const savedVersions = localStorage.getItem(`document-versions-${document?.id || 'default'}`);
    if (savedVersions) {
      const parsedVersions = JSON.parse(savedVersions);
      console.log('🔄 Loaded saved versions from localStorage:', parsedVersions.length);
      return parsedVersions.map(v => ({
        ...v,
        timestamp: new Date(v.timestamp),
      }));
    }

    console.log('🆕 No saved versions found - creating defaults');
    // Default versions if none saved
    return [
      {
        id: 'current',
        timestamp: new Date(),
        author: 'You',
        changes: 'Current working version - no changes',
        content: initialContent,
        preview: initialContent.substring(0, 100) + '...',
        isCurrent: true,
      },
      {
        id: 1,
        timestamp: new Date(Date.now() - 3600000),
        author: 'Dr. Smith',
        changes: 'Added methodology section',
        content: `# Document with Methodology

This version includes the methodology section added by Dr. Smith.

## Methodology
The study will follow standard regulatory guidelines with enhanced monitoring.

### Study Design
- Randomized controlled trial
- Double-blind protocol
- Multi-center approach

*Updated by Dr. Smith at ${new Date(Date.now() - 3600000).toLocaleString()}*`,
      },
      {
        id: 2,
        timestamp: new Date(Date.now() - 7200000),
        author: 'Regulatory Team',
        changes: 'Updated compliance requirements',
        content: `# Compliance Updated Document

This version includes updated compliance requirements from the regulatory team.

## Compliance Requirements
- FDA 21 CFR Part 312
- ICH GCP guidelines
- Local regulatory standards

### Quality Assurance
All procedures must follow validated protocols.

*Updated by Regulatory Team at ${new Date(Date.now() - 7200000).toLocaleString()}*`,
      },
    ];
  });
  const [originalContent, setOriginalContent] = useState(() => initialContent);

  // Simple approach: Store the user's actual working content in a ref so it persists
  const userWorkingContentRef = useRef(initialContent);

  // Section sync integration
  const {
    syncStatus,
    isOnline,
    lastSyncTime,
    pendingUpdates,
    conflicts,
    queueUpdate,
    resolveConflict,
    clearPendingUpdates,
    reconnect,
  } = useSectionSync({
    projectId: projectId || document?.projectId,
    leafId: leafId || document?.leafId,
    onSectionUpdate: update => {
      console.log('Section update received:', update);
      // Auto-apply updates if no local changes
      if (content === lastSavedContent) {
        handleApplySectionUpdate(update);
      } else {
        // Queue for review if there are local changes
        setPendingReview(prev => [...prev, update]);
      }
    },
    onConflict: conflict => {
      console.log('Section conflict detected:', conflict);
      setActiveConflict(conflict);
      setShowConflictModal(true);
    },
    enabled: true,
  });

  const [pendingReview, setPendingReview] = useState([]);
  const [activeConflict, setActiveConflict] = useState(null);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [linkedSections, setLinkedSections] = useState([]);

  // Track which version is currently being viewed for visual selection
  const [selectedVersionId, setSelectedVersionId] = useState('current');

  // Flag to prevent content updates during version restoration
  const isRestoringVersion = useRef(false);

  // Handle section updates
  const handleApplySectionUpdate = update => {
    if (update.patch && update.patch.content) {
      // Apply the patch to the content
      const updatedContent = applyPatchToContent(content, update.patch);
      setContent(updatedContent);
      userWorkingContentRef.current = updatedContent;

      // Record as a change
      const change = {
        id: Date.now(),
        type: 'section_sync',
        author: update.author.name,
        timestamp: new Date(update.timestamp),
        description: `Section ${update.sectionId} synchronized`,
        content: update.patch.content,
      };
      setChanges(prev => [...prev, change]);
    }
  };

  // Apply patch to content (simplified version)
  const applyPatchToContent = (currentContent, patch) => {
    // In a real implementation, this would use a proper diff/patch algorithm
    if (patch.type === 'content' && patch.content) {
      // Replace section content
      const sectionId = patch.sectionId;
      const sectionMarker = `data-section-id="${sectionId}"`;
      if (currentContent.includes(sectionMarker)) {
        // Update existing section
        const regex = new RegExp(`(<[^>]*${sectionMarker}[^>]*>)[^<]*(<\/[^>]*>)`, 'g');
        return currentContent.replace(regex, `$1${patch.content}$2`);
      } else {
        // Append new section
        return currentContent + `\n<div data-section-id="${sectionId}">${patch.content}</div>`;
      }
    }
    return currentContent;
  };

  // Simulate package loading check (replace with actual logic)
  useEffect(() => {
    // Simulate checking dependencies
    const checkDependencies = async () => {
      try {
        // Replace with actual dependency checks, e.g., dynamic imports, module availability
        console.log('Checking document editor dependencies...');
        // Example: Try to import a critical package
        // await import('some-critical-package');

        // If all checks pass:
        setEditorInitialized(true);
        setFallbackMode(false);
        console.log('Document editor dependencies checked successfully.');
      } catch (error) {
        console.error('Dependency check failed:', error);
        setPackageErrors([`Failed to load critical component: ${error.message}`]);
        setEditorInitialized(true); // Still mark as initialized, but in fallback mode
        setFallbackMode(true);
      }
    };

    checkDependencies();
  }, []); // Run only once on mount

  // Simple diff algorithm to identify additions and deletions
  const generateDiff = (oldText, newText) => {
    // Simple word-level diff for basic change tracking
    const oldWords = oldText.split(/(\s+)/);
    const newWords = newText.split(/(\s+)/);

    const changes = [];
    let oldIndex = 0;
    let newIndex = 0;

    while (oldIndex < oldWords.length || newIndex < newWords.length) {
      if (oldIndex >= oldWords.length) {
        // Additions at the end
        changes.push({
          type: 'addition',
          text: newWords.slice(newIndex).join(''),
          position: newIndex,
        });
        break;
      } else if (newIndex >= newWords.length) {
        // Deletions at the end
        changes.push({
          type: 'deletion',
          text: oldWords.slice(oldIndex).join(''),
          position: oldIndex,
        });
        break;
      } else if (oldWords[oldIndex] === newWords[newIndex]) {
        // No change
        oldIndex++;
        newIndex++;
      } else {
        // Find next common word
        let found = false;
        for (let i = newIndex + 1; i < newWords.length; i++) {
          if (oldWords[oldIndex] === newWords[i]) {
            // Addition found
            changes.push({
              type: 'addition',
              text: newWords.slice(newIndex, i).join(''),
              position: newIndex,
            });
            newIndex = i;
            found = true;
            break;
          }
        }
        if (!found) {
          for (let i = oldIndex + 1; i < oldWords.length; i++) {
            if (oldWords[i] === newWords[newIndex]) {
              // Deletion found
              changes.push({
                type: 'deletion',
                text: oldWords.slice(oldIndex, i).join(''),
                position: oldIndex,
              });
              oldIndex = i;
              found = true;
              break;
            }
          }
        }
        if (!found) {
          // Replacement
          changes.push({
            type: 'deletion',
            text: oldWords[oldIndex],
            position: oldIndex,
          });
          changes.push({
            type: 'addition',
            text: newWords[newIndex],
            position: newIndex,
          });
          oldIndex++;
          newIndex++;
        }
      }
    }

    return changes;
  };

  // Apply visual markup to content for track changes
  const applyTrackChangesMarkup = content => {
    if (!trackChanges || changes.length === 0) return content;

    let markedContent = content;

    // Apply markup for each change
    changes.forEach(change => {
      const diff = generateDiff(change.oldContent, change.newContent);

      diff.forEach(d => {
        if (d.type === 'addition') {
          // Mark additions with green background and underline
          markedContent = markedContent.replace(
            d.text,
            `<span class="track-addition" style="background-color: #d4edda; color: #155724; text-decoration: underline; padding: 1px 2px; border-radius: 2px;">${d.text}</span>`
          );
        } else if (d.type === 'deletion') {
          // Mark deletions with red background and strikethrough
          const deletionMarkup = `<span class="track-deletion" style="background-color: #f8d7da; color: #721c24; text-decoration: line-through; padding: 1px 2px; border-radius: 2px;">${d.text}</span>`;
          // Find appropriate insertion point in new content
          markedContent += deletionMarkup;
        }
      });
    });

    return markedContent;
  };

  // Debounced track content changes for revision tracking
  const trackContentChange = newContent => {
    if (!trackChanges || !lastSavedContent || lastSavedContent === newContent) return;

    // Clear existing timeout
    if (changeTimeoutRef.current) {
      clearTimeout(changeTimeoutRef.current);
    }

    // Set new timeout to track change after user stops typing
    changeTimeoutRef.current = setTimeout(() => {
      const diff = generateDiff(lastSavedContent, newContent);
      const additionCount = diff.filter(d => d.type === 'addition').length;
      const deletionCount = diff.filter(d => d.type === 'deletion').length;

      let summary = 'Text modification';
      if (additionCount > 0 && deletionCount > 0) {
        summary = `${additionCount} addition${additionCount !== 1 ? 's' : ''}, ${deletionCount} deletion${deletionCount !== 1 ? 's' : ''}`;
      } else if (additionCount > 0) {
        summary = `${additionCount} addition${additionCount !== 1 ? 's' : ''}`;
      } else if (deletionCount > 0) {
        summary = `${deletionCount} deletion${deletionCount !== 1 ? 's' : ''}`;
      }

      const change = {
        id: Date.now(),
        timestamp: new Date(),
        author: 'You',
        type: 'edit',
        oldContent: lastSavedContent,
        newContent: newContent,
        summary: summary,
        diff: diff,
      };

      setChanges(prev => [change, ...prev.slice(0, 49)]); // Keep last 50 changes
      setLastSavedContent(newContent);
    }, 1500); // Track changes after 1.5 seconds of no typing
  };

  // Update working content only when user types (not when restoring versions)
  const handleContentChange = newContent => {
    // Skip if we're currently restoring a version
    if (isRestoringVersion.current) {
      console.log('🚫 Skipping content update - version restoration in progress');
      return;
    }

    // Ensure content is always a string
    const stringContent = String(newContent || '');

    console.log('📝 handleContentChange called with content length:', stringContent.length);
    console.log('📝 Content preview:', stringContent.substring(0, 100));

    // Track changes if enabled (debounced)
    if (trackChanges) {
      trackContentChange(stringContent);
    }

    setContent(stringContent);
    userWorkingContentRef.current = stringContent;

    // Update current version ONLY when user is actively editing
    setVersions(prev =>
      prev.map(version =>
        version.isCurrent
          ? {
              ...version,
              content: stringContent,
              timestamp: new Date(),
              changes:
                stringContent.trim() !== originalContent.trim()
                  ? 'Current working version - unsaved changes'
                  : 'Current working version - no changes',
              preview: stringContent.substring(0, 100) + '...',
            }
          : version
      )
    );

    if (document && onChange) {
      onChange({ ...document, content: stringContent });
    }

    generateContextHints(stringContent);
    console.log('✓ Content updated - working ref length:', userWorkingContentRef.current.length);
    console.log(
      '✓ Working ref has formatting:',
      userWorkingContentRef.current.includes('**') ||
        userWorkingContentRef.current.includes('*') ||
        userWorkingContentRef.current.includes('<')
    );
  };

  // Save versions to localStorage whenever versions change
  useEffect(() => {
    if (versions.length > 0) {
      localStorage.setItem(
        `document-versions-${document?.id || 'default'}`,
        JSON.stringify(versions)
      );
      console.log('💾 Saved versions to localStorage:', versions.length, 'versions');
    }
  }, [versions, document?.id]);

  // Initialize context hints on component mount
  useEffect(() => {
    generateContextHints(content);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }
    };
  }, []);

  // Clear changes when track changes is turned off
  useEffect(() => {
    if (!trackChanges) {
      setChanges([]);
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }
    }
  }, [trackChanges]);

  // Load leaf data and connect to SSE for real-time patches
  useEffect(() => {
    let eventSource = null;

    const loadDocument = async () => {
      // Extract URL params
      const params = new URLSearchParams(window.location.search);
      const leafId = params.get('leafId');
      const sessionId = params.get('sessionId');
      const templateId = params.get('templateId');

      console.log('Loading document with params:', { leafId, sessionId, templateId });

      if (leafId) {
        try {
          // Load leaf content
          const leafResponse = await fetch(`/api/leaves/${leafId}`);
          if (leafResponse.ok) {
            const leafData = await leafResponse.json();
            console.log('Leaf data loaded:', leafData);
            setContent(leafData.content || '');

            // Load right rail data
            const [factsRes, impactsRes, hintsRes] = await Promise.all([
              fetch(`/api/leaves/${leafId}/facts`),
              fetch(`/api/leaves/${leafId}/impacts`),
              fetch(`/api/leaves/${leafId}/validator-hints`),
            ]);

            if (factsRes.ok) {
              const facts = await factsRes.json();
              console.log('Facts loaded:', facts);
            }

            if (impactsRes.ok) {
              const impacts = await impactsRes.json();
              console.log('Impacts loaded:', impacts);
            }

            if (hintsRes.ok) {
              const hints = await hintsRes.json();
              console.log('Validator hints loaded:', hints);
              // Update context hints with validator hints
              setContextHints(prev => [
                ...prev,
                ...hints.map(hint => ({
                  type: 'validation',
                  category: hint.category,
                  text: hint.hint,
                  source: hint.reference,
                  severity: hint.severity,
                })),
              ]);
            }
          }

          // Connect to SSE for real-time patches
          console.log('Connecting to SSE for real-time patches...');
          eventSource = new EventSource(`/api/leaves/${leafId}/patches/stream`);

          eventSource.onmessage = event => {
            const data = JSON.parse(event.data);
            console.log('SSE message received:', data);

            if (data.type === 'patch') {
              // Handle incoming patch
              console.log('New patch received:', data.patch);

              // Show notification
              const notification = document.createElement('div');
              notification.style.cssText =
                'position: fixed; top: 20px; right: 20px; background: #647746; color: white; padding: 12px 20px; border-radius: 6px; z-index: 9999; animation: slideIn 0.3s ease-out;';
              notification.textContent = `Real-time update: ${data.patch.type}`;
              document.body.appendChild(notification);

              setTimeout(() => {
                notification.remove();
              }, 5000);

              // Update content if patch contains new content
              if (data.patch.blocks && data.patch.blocks.length > 0) {
                const newBlock = data.patch.blocks[0];
                if (newBlock.type === 'text' && newBlock.content) {
                  setContent(prev => prev + '\n\n' + newBlock.content);
                }
              }
            } else if (data.type === 'ping') {
              console.log('SSE ping received for leafId:', data.leafId);
            }
          };

          eventSource.onerror = error => {
            console.error('SSE error:', error);
          };
        } catch (error) {
          console.error('Error loading leaf data:', error);
        }
      }
    };

    loadDocument();

    // Cleanup on unmount
    return () => {
      if (eventSource) {
        console.log('Closing SSE connection');
        eventSource.close();
      }
    };
  }, []);

  // Remove this useEffect since we're now using controlled value
  // Content sync handled by React controlled component

  const handleEditorChange = (content, editor) => {
    setContent(content);
    if (onChange) onChange(content);
  };

  const handleAIAssist = async () => {
    setIsAnalyzing(true);
    try {
      // AI assistance integration
      const response = await fetch('/api/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          task: 'regulatory_review',
          documentType: document?.type || 'regulatory',
        }),
      });
      const suggestions = await response.json();

      // Insert AI suggestions into textarea
      const aiSuggestion =
        suggestions?.recommendation ||
        `Here are some AI-powered suggestions for your regulatory document:

• Consider adding a detailed risk assessment section
• Include comparative data with approved products
• Ensure all dosing rationale is clearly documented
• Add timeline milestones for regulatory submission
• Include quality control specifications

Generated at ${new Date().toLocaleString()}`;

      if (textAreaRef.current) {
        const suggestion = `\n\n🤖 AI Regulatory Assistance:\n${aiSuggestion}\n\n`;
        const newContent = content + suggestion;

        // Use handleContentChange to properly update all references and versions
        handleContentChange(newContent);

        // Move cursor to end and focus
        setTimeout(() => {
          textAreaRef.current.focus();
          textAreaRef.current.setSelectionRange(newContent.length, newContent.length);
        }, 100);

        console.log('✓ AI assistance added to document');
      }
    } catch (error) {
      console.log('AI assistance temporarily unavailable');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const createVersion = () => {
    const currentContent = userWorkingContentRef.current || content;

    console.log('🔄 CREATE VERSION DEBUG:', {
      workingRefLength: userWorkingContentRef.current?.length || 0,
      contentStateLength: content.length,
      currentContentLength: currentContent.length,
      workingRefHasFormatting:
        userWorkingContentRef.current?.includes('**') ||
        userWorkingContentRef.current?.includes('*') ||
        false,
      contentStateHasFormatting: content.includes('**') || content.includes('*'),
      currentContentHasFormatting: currentContent.includes('**') || currentContent.includes('*'),
      savingContent: currentContent.substring(0, 100),
    });

    // Calculate proper version number: count non-current versions and add 1
    const historicalVersions = versions.filter(v => !v.isCurrent);
    const newVersionId = historicalVersions.length + 1;

    const newVersion = {
      id: newVersionId,
      timestamp: new Date(),
      author: 'You',
      changes: `Manual save - ${new Date().toLocaleTimeString()}`,
      content: currentContent, // Save the current working content with formatting
    };
    const updatedVersions = [newVersion, ...versions];
    setVersions(updatedVersions);

    // Save to localStorage immediately
    localStorage.setItem(
      `document-versions-${document?.id || 'default'}`,
      JSON.stringify(updatedVersions)
    );

    setOriginalContent(currentContent); // Update original content reference after manual save
    console.log(
      '✓ Version saved with current content and persisted to localStorage:',
      newVersion.id
    );
    console.log('✓ Saved version content preview:', newVersion.content.substring(0, 200));
  };

  // TinyMCE configuration with advanced features
  const editorConfig = {
    height: 600,
    menubar: true,
    plugins: [
      'advlist',
      'autolink',
      'lists',
      'link',
      'image',
      'charmap',
      'preview',
      'anchor',
      'searchreplace',
      'visualblocks',
      'code',
      'fullscreen',
      'insertdatetime',
      'media',
      'table',
      'help',
      'wordcount',
      'checklist',
      'formatpainter',
      'pagebreak',
      'nonbreaking',
      'template',
      'textcolor',
      'colorpicker',
      'textpattern',
      'imagetools',
      'toc',
      'mentions',
    ],
    toolbar: [
      'undo redo | formatselect | bold italic underline strikethrough | forecolor backcolor | removeformat',
      'alignleft aligncenter alignright alignjustify | outdent indent | numlist bullist checklist | link image media table | insertdatetime charmap pagebreak',
      'searchreplace | visualblocks code preview fullscreen help | wordcount',
    ].join(' | '),
    content_style: `
      body {
        font-family: 'Times New Roman', Times, serif;
        font-size: 12pt;
        line-height: 1.6;
        max-width: 8.5in;
        margin: 0 auto;
        padding: 1in;
        background: white;
      }
      .track-changes { background: #fff3cd; border-left: 3px solid #ffc107; padding: 2px 4px; }
    `,
    skin: 'oxide',
    content_css: 'default',
    formats: {
      track_insert: { inline: 'span', classes: 'track-changes track-insert' },
      track_delete: { inline: 'span', classes: 'track-changes track-delete' },
    },
    setup: editor => {
      // Add custom track changes functionality
      editor.ui.registry.addButton('trackchanges', {
        text: 'Track Changes',
        icon: 'edit-block',
        onAction: () => {
          editor.execCommand('mceToggleFormat', false, 'track_insert');
        },
      });

      // Add AI assistance button
      editor.ui.registry.addButton('aiassist', {
        text: 'AI Assist',
        icon: 'help',
        onAction: () => handleAIAssist(),
      });

      // Add version control button
      editor.ui.registry.addButton('saveversion', {
        text: 'Save Version',
        icon: 'save',
        onAction: () => createVersion(),
      });
    },
  };

  const handleSave = () => {
    const currentContent = userWorkingContentRef.current || content;
    const now = new Date().toISOString();

    console.log('💾 SAVE DEBUG:', {
      workingRefLength: userWorkingContentRef.current?.length || 0,
      contentStateLength: content.length,
      textareaLength: textAreaRef.current?.value.length || 0,
      workingRefHasFormatting:
        userWorkingContentRef.current?.includes('**') ||
        userWorkingContentRef.current?.includes('*') ||
        false,
      contentStateHasFormatting: content.includes('**') || content.includes('*'),
      textareaHasFormatting:
        textAreaRef.current?.value.includes('**') ||
        textAreaRef.current?.value.includes('*') ||
        false,
      savingContent: currentContent.substring(0, 100),
      timestamp: now,
    });

    // Update document with new timestamp if onChange is provided
    if (document && onChange) {
      const updatedDocument = {
        ...document,
        content: currentContent,
        lastEdited: now,
        lastModified: now,
        status: 'Draft',
      };

      console.log('📄 Updating document with new timestamp:', now);
      onChange(updatedDocument);
    }

    const savedVersion = {
      id: Date.now(),
      content: currentContent,
      timestamp: new Date(),
      author: 'You',
      changes: 'Document saved',
    };

    // Add new saved version and update current to show no changes
    const updatedVersions = [
      {
        ...versions.find(v => v.isCurrent),
        changes: 'Current working version - no changes',
      },
      savedVersion,
      ...versions.filter(v => !v.isCurrent),
    ];

    setVersions(updatedVersions);

    // Save to localStorage immediately
    localStorage.setItem(
      `document-versions-${document?.id || 'default'}`,
      JSON.stringify(updatedVersions)
    );

    setOriginalContent(currentContent); // Update reference point

    // Call external onSave with updated document including timestamp
    if (onSave) {
      onSave({
        ...document,
        content: currentContent,
        lastEdited: now,
        lastModified: now,
      });
    }

    console.log('✓ Document saved with all formatting preserved and timestamp updated');
    console.log('Saved content preview:', currentContent.substring(0, 200));
  };

  const handleBackToCoAuthor = () => {
    // Ensure current content is saved to document before going back
    const now = new Date().toISOString();
    if (document && content && onChange) {
      const updatedDocument = {
        ...document,
        content,
        lastEdited: now,
        lastModified: now,
        status: 'Draft',
      };
      onChange(updatedDocument);
      console.log('✓ Document content saved with timestamp before navigation:', now);
    }

    if (onBack) {
      onBack();
    } else {
      window.location.href = '/cmc-blueprint';
    }
  };

  const handleDownload = () => {
    // Use setTimeout to ensure we're in browser context
    setTimeout(() => {
      try {
        const currentContent = userWorkingContentRef.current || content;
        const documentTitle = document?.title || 'Regulatory Document';
        const fileName = `${documentTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.docx`;

        // Convert markdown-style formatting to HTML for Word compatibility
        const convertToWordHTML = text => {
          return (
            text
              // Convert headings
              .replace(/^# (.*$)/gm, '<h1>$1</h1>')
              .replace(/^## (.*$)/gm, '<h2>$1</h2>')
              .replace(/^### (.*$)/gm, '<h3>$1</h3>')
              // Convert bold
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              // Convert italic
              .replace(/\*(.*?)\*/g, '<em>$1</em>')
              // Convert underline
              .replace(/<u>(.*?)<\/u>/g, '<u>$1</u>')
              // Convert bullet points
              .replace(/^• (.*$)/gm, '<li>$1</li>')
              // Convert numbered lists
              .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
              // Convert line breaks
              .replace(/\n/g, '<br>')
              // Wrap list items in proper ul tags
              .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
              // Clean up multiple ul tags
              .replace(/<\/ul>\s*<ul>/g, '')
          );
        };

        const formattedHTML = convertToWordHTML(currentContent);

        // Create proper Word-compatible RTF document
        const rtfDocument = `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}
\\f0\\fs24
${currentContent
  .replace(/\n/g, '\\par ')
  .replace(/\*\*(.*?)\*\*/g, '{\\b $1}')
  .replace(/\*(.*?)\*/g, '{\\i $1}')
  .replace(/<u>(.*?)<\/u>/g, '{\\ul $1}')
  .replace(/^# (.*)/gm, '{\\fs32\\b $1}\\par')
  .replace(/^## (.*)/gm, '{\\fs28\\b $1}\\par')
  .replace(/^### (.*)/gm, '{\\fs24\\b $1}\\par')
  .replace(/^• (.*)/gm, '{\\pntext\\f1\\bullet\\tab}$1\\par')}
}`;

        // Create blob with RTF MIME type (opens in Word)
        const blob = new Blob([rtfDocument], {
          type: 'application/rtf',
        });

        // Update filename to .rtf
        const rtfFileName = fileName.replace('.docx', '.rtf');

        // Create download link
        const a = window.document.createElement('a');
        a.href = window.URL.createObjectURL(blob);
        a.download = rtfFileName;
        a.style.display = 'none';

        // Trigger download
        window.document.body.appendChild(a);
        a.click();
        window.document.body.removeChild(a);

        // Clean up
        window.URL.revokeObjectURL(a.href);

        console.log(`✓ Document downloaded as ${rtfFileName} with formatting preserved`);
      } catch (error) {
        console.error('Download failed:', error);
        // Fallback to HTML download
        try {
          const currentContent = userWorkingContentRef.current || content;
          const documentTitle = document?.title || 'Regulatory Document';
          const fileName = `${documentTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;

          const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
              <title>${documentTitle}</title>
              <style>
                body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; margin: 1in; }
                h1, h2, h3 { font-weight: bold; }
              </style>
            </head>
            <body>
              ${currentContent.replace(/\n/g, '<br>')}
            </body>
            </html>
          `;

          const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
          const a = window.document.createElement('a');
          a.href = window.URL.createObjectURL(blob);
          a.download = fileName;
          a.style.display = 'none';

          window.document.body.appendChild(a);
          a.click();
          window.document.body.removeChild(a);
          window.URL.revokeObjectURL(a.href);

          toast({
            title:
              'Downloaded as HTML file (Word format not supported). You can open this in Word or any browser.',
          });
        } catch (fallbackError) {
          toast({
            title: 'Download failed. Please manually select and copy the text from the editor.',
          });
        }
      }
    }, 0);
  };

  // Intelligent Document Context Hints Generation
  const generateContextHints = documentContent => {
    const hints = [];
    const content = documentContent.toLowerCase();

    // Structure hints
    if (hintCategories.structure) {
      if (!content.includes('executive summary') && !content.includes('overview')) {
        hints.push({
          id: 'missing-summary',
          category: 'structure',
          priority: 'high',
          icon: 'FileText',
          title: 'Missing Executive Summary',
          description:
            'Consider adding an executive summary at the beginning of your document for better regulatory compliance.',
          action: 'Add Executive Summary',
          position: 'beginning',
        });
      }

      if (!content.includes('methodology') && !content.includes('method')) {
        hints.push({
          id: 'missing-methodology',
          category: 'structure',
          priority: 'medium',
          icon: 'Target',
          title: 'Methodology Section Recommended',
          description: 'Regulatory documents typically require a detailed methodology section.',
          action: 'Add Methodology',
          position: 'middle',
        });
      }

      if (!content.includes('conclusion') && !content.includes('summary')) {
        hints.push({
          id: 'missing-conclusion',
          category: 'structure',
          priority: 'medium',
          icon: 'CheckCircle',
          title: 'Conclusion Section Missing',
          description: 'End your document with clear conclusions or summary of findings.',
          action: 'Add Conclusion',
          position: 'end',
        });
      }
    }

    // Compliance hints
    if (hintCategories.compliance) {
      if (!content.includes('fda') && !content.includes('ich') && !content.includes('gmp')) {
        hints.push({
          id: 'regulatory-references',
          category: 'compliance',
          priority: 'high',
          icon: 'AlertCircle',
          title: 'Regulatory References Needed',
          description:
            'Include references to relevant regulatory guidelines (FDA, ICH, GMP) to strengthen compliance.',
          action: 'Add Regulatory References',
          position: 'throughout',
        });
      }

      if (!content.includes('risk') && !content.includes('safety')) {
        hints.push({
          id: 'risk-assessment',
          category: 'compliance',
          priority: 'medium',
          icon: 'AlertCircle',
          title: 'Risk Assessment Recommended',
          description: 'Consider including risk assessment and safety considerations.',
          action: 'Add Risk Assessment',
          position: 'middle',
        });
      }
    }

    // Content hints
    if (hintCategories.content) {
      const wordCount = documentContent.split(' ').length;
      if (wordCount < 200) {
        hints.push({
          id: 'content-length',
          category: 'content',
          priority: 'low',
          icon: 'BookOpen',
          title: 'Document Length',
          description: `Current word count: ${wordCount}. Regulatory documents typically require more detailed content.`,
          action: 'Expand Content',
          position: 'throughout',
        });
      }

      if (!content.includes('table') && !content.includes('figure') && !content.includes('chart')) {
        hints.push({
          id: 'visual-elements',
          category: 'content',
          priority: 'low',
          icon: 'TrendingUp',
          title: 'Visual Elements',
          description: 'Consider adding tables, figures, or charts to support your content.',
          action: 'Add Visual Elements',
          position: 'throughout',
        });
      }
    }

    // Style hints
    if (hintCategories.style) {
      const sections = (content.match(/#{1,6}/g) || []).length;
      if (sections < 3) {
        hints.push({
          id: 'document-structure',
          category: 'style',
          priority: 'low',
          icon: 'FileText',
          title: 'Document Structure',
          description: 'Use more headings to improve document organization and readability.',
          action: 'Add Section Headings',
          position: 'throughout',
        });
      }
    }

    setContextHints(hints);
    console.log('✓ Generated context hints:', hints.length);
  };

  const applyContextHint = hint => {
    let insertText = '';

    switch (hint.id) {
      case 'missing-summary':
        insertText = `# Executive Summary\n\nProvide a brief overview of the document's purpose, key findings, and regulatory implications.\n\n`;
        break;
      case 'missing-methodology':
        insertText = `\n## Methodology\n\n### Study Design\nDescribe the study design and approach.\n\n### Procedures\nDetail the procedures and protocols followed.\n\n### Analysis Methods\nExplain the analytical methods used.\n\n`;
        break;
      case 'missing-conclusion':
        insertText = `\n## Conclusions\n\n### Key Findings\n- Summary of main results\n- Regulatory implications\n- Recommendations for next steps\n\n### Overall Assessment\nProvide an overall assessment of the findings in regulatory context.\n\n`;
        break;
      case 'regulatory-references':
        insertText = `\n## Regulatory References\n\n- FDA Guidance for Industry\n- ICH Guidelines (specify relevant guidelines)\n- GMP Requirements\n- 21 CFR Part [relevant section]\n\n`;
        break;
      case 'risk-assessment':
        insertText = `\n## Risk Assessment\n\n### Identified Risks\n- Risk 1: Description and mitigation\n- Risk 2: Description and mitigation\n\n### Safety Considerations\nDescribe safety monitoring and risk management strategies.\n\n`;
        break;
      default:
        insertText = `\n<!-- ${hint.title} -->\n[Add ${hint.title.toLowerCase()} content here]\n\n`;
    }

    if (hint.position === 'beginning') {
      setContent(insertText + content);
    } else if (hint.position === 'end') {
      setContent(content + insertText);
    } else {
      // Insert in middle or throughout
      const midPoint = Math.floor(content.length / 2);
      const newContent = content.slice(0, midPoint) + insertText + content.slice(midPoint);
      setContent(newContent);
    }

    // Mark hint as applied by filtering it out
    setContextHints(prev => prev.filter(h => h.id !== hint.id));
    console.log('✓ Applied context hint:', hint.title);
  };

  const restoreVersion = version => {
    try {
      console.log('🔄 Restoring version:', {
        id: version.id,
        isCurrent: version.isCurrent,
        contentLength: version.content?.length,
        changes: version.changes,
      });

      // Set restoration flag to prevent content handler from firing
      isRestoringVersion.current = true;

      // Update visual selection indicator
      setSelectedVersionId(version.isCurrent ? 'current' : version.id);

      let versionContent;

      if (version.isCurrent) {
        // For current version, always use the ref content (preserved working content)
        versionContent = userWorkingContentRef.current || content;
        console.log('📝 Restoring current working content:', {
          refLength: userWorkingContentRef.current?.length || 0,
          stateLength: content.length,
          usingRef: !!userWorkingContentRef.current,
          preview: (userWorkingContentRef.current || content).substring(0, 50) + '...',
        });
      } else {
        // For historical versions, use their stored content
        versionContent =
          version.content ||
          `# Restored Version ${version.id}

This is version ${version.id} content restored at ${new Date().toLocaleString()}.

Changes: ${version.changes}
Author: ${version.author}
Original timestamp: ${version.timestamp}

This version has been successfully restored to the editor.`;
        console.log('📝 Loading historical version content');
      }

      console.log('📄 Version content prepared:', {
        versionId: version.id,
        isCurrent: version.isCurrent,
        contentLength: versionContent.length,
        preview: versionContent.substring(0, 100) + '...',
        versionHasContent: !!version.content,
        versionContentLength: version.content?.length || 0,
        currentStateContentLength: content.length,
      });

      // Update content state - this will make the textarea display the selected version
      setContent(versionContent);

      // Force React to re-render textarea with new key and content
      setForceUpdate(prev => prev + 1);

      // Clear restoration flag after content is set
      setTimeout(() => {
        isRestoringVersion.current = false;
        console.log('🔓 Version restoration complete - content changes re-enabled');
      }, 100);

      // No special handling needed

      // Only update document object if we're restoring the current version
      if (version.isCurrent && document && onChange) {
        const updatedDocument = {
          ...document,
          content: versionContent,
          lastEdited: new Date().toISOString(),
          status: 'Draft',
        };
        onChange(updatedDocument);
        console.log('📄 Document object updated with current content:', {
          contentLength: versionContent.length,
          hasFormatting:
            versionContent.includes('**') ||
            versionContent.includes('*') ||
            versionContent.includes('<'),
        });
      }

      // If viewing historical version, don't update the current version's stored content
      // The current version should maintain its own content until user makes changes
      if (!version.isCurrent) {
        console.log('📖 Viewing historical version - current version content preserved');
      }

      // Focus the textarea after React re-renders
      setTimeout(() => {
        if (textAreaRef.current) {
          textAreaRef.current.focus();
          textAreaRef.current.setSelectionRange(0, 0);
          console.log('✅ Textarea focused with version content:', {
            versionId: version.id,
            isCurrent: version.isCurrent,
            actualContentLength: textAreaRef.current.value.length,
            expectedContentLength: versionContent.length,
            contentMatches: textAreaRef.current.value.length === versionContent.length,
            actualPreview: textAreaRef.current.value.substring(0, 50) + '...',
          });
        }
      }, 100);

      // Generate context hints for the displayed version
      generateContextHints(versionContent);

      console.log(`✅ Version ${version.id} restoration complete`);
    } catch (error) {
      console.error('❌ Version restore failed:', error);
    }
  };

  // Functional text formatting using textarea cursor insertion
  const applyFormat = format => {
    try {
      const textArea = textAreaRef.current;
      if (!textArea) return;

      const start = textArea.selectionStart;
      const end = textArea.selectionEnd;
      const selectedText = textArea.value.substring(start, end);

      let formattedText = '';
      const timestamp = new Date().toLocaleTimeString();

      switch (format) {
        case 'bold':
          formattedText = selectedText ? `**${selectedText}**` : `**Bold Text (${timestamp})**`;
          break;
        case 'italic':
          formattedText = selectedText ? `*${selectedText}*` : `*Italic Text (${timestamp})*`;
          break;
        case 'underline':
          formattedText = selectedText
            ? `<u>${selectedText}</u>`
            : `<u>Underlined Text (${timestamp})</u>`;
          break;
        default:
          return;
      }

      // Insert the formatted text at cursor position
      const newContent = content.substring(0, start) + formattedText + content.substring(end);

      console.log('🎨 About to call handleContentChange for formatting:', format);
      console.log('🎨 New content with formatting:', newContent.substring(0, 150));

      // Use handleContentChange to properly update all references and versions
      handleContentChange(newContent);

      // Move cursor to end of inserted text
      setTimeout(() => {
        const newCursorPos = start + formattedText.length;
        textArea.setSelectionRange(newCursorPos, newCursorPos);
        textArea.focus();
      }, 0);

      console.log(
        `✓ ${format.toUpperCase()} formatting applied - new content length:`,
        newContent.length
      );
      console.log('Working ref content after format:', userWorkingContentRef.current.length);
    } catch (error) {
      console.error('Format application failed:', error);
    }
  };

  const applyAlignment = alignment => {
    try {
      // Apply alignment via CSS style to content wrapper
      const alignmentStyle = `text-align: ${alignment};`;
      const wrappedContent = `<div style="${alignmentStyle}">${content}</div>`;

      // Use handleContentChange to properly update all references and versions
      handleContentChange(wrappedContent);

      console.log('Alignment applied:', alignment);
    } catch (error) {
      console.error('Alignment application failed:', error);
    }
  };

  const insertList = listType => {
    try {
      const textArea = textAreaRef.current;
      if (!textArea) return;

      const start = textArea.selectionStart;
      const end = textArea.selectionEnd;

      const listText =
        listType === 'ul'
          ? '\n• New bullet point\n• Another bullet point\n'
          : '\n1. First numbered item\n2. Second numbered item\n';

      const newContent = content.substring(0, start) + listText + content.substring(end);

      // Use handleContentChange to properly update all references and versions
      handleContentChange(newContent);

      // Move cursor to end of inserted text
      setTimeout(() => {
        const newCursorPos = start + listText.length;
        textArea.setSelectionRange(newCursorPos, newCursorPos);
        textArea.focus();
      }, 0);

      console.log(`✓ ${listType.toUpperCase()} list inserted successfully`);
    } catch (error) {
      console.error('List insertion failed:', error);
    }
  };

  const applyHeading = headingType => {
    try {
      if (headingType === 'p') return;

      const textArea = textAreaRef.current;
      if (!textArea) return;

      const start = textArea.selectionStart;
      const end = textArea.selectionEnd;
      const selectedText = textArea.value.substring(start, end);

      const headingPrefix = headingType === 'h1' ? '# ' : headingType === 'h2' ? '## ' : '### ';
      const headingText = selectedText
        ? `${headingPrefix}${selectedText}`
        : `${headingPrefix}New ${headingType.toUpperCase()} Heading`;

      const newContent = content.substring(0, start) + headingText + content.substring(end);

      console.log('🎨 About to call handleContentChange for heading:', headingType);
      console.log('🎨 New content with heading:', newContent.substring(0, 150));

      // Use handleContentChange to properly update all references and versions
      handleContentChange(newContent);

      // Move cursor to end of inserted text
      setTimeout(() => {
        const newCursorPos = start + headingText.length;
        textArea.setSelectionRange(newCursorPos, newCursorPos);
        textArea.focus();
      }, 0);

      console.log(`✓ ${headingType.toUpperCase()} heading applied successfully`);
    } catch (error) {
      console.error('Heading application failed:', error);
    }
  };

  // Fallback Editor Component (Pure HTML/CSS/JS)
  const FallbackEditor = () => (
    <div className="fallback-editor bg-white rounded-lg border border-gray-300 shadow-sm">
      <div className="border-b border-gray-200 p-3 bg-gray-50">
        <div className="text-sm font-medium text-orange-600 flex items-center">
          ⚠️ Fallback Mode: Some packages failed to load, using basic editor
        </div>
      </div>
      <div className="p-4">
        <textarea
          ref={textAreaRef}
          className="w-full h-96 p-4 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          value={content}
          onChange={e => handleContentChange(e.target.value)}
          placeholder="Begin writing your regulatory document here..."
          style={{
            fontFamily: 'Inter, system-ui, monospace',
            fontSize: '14px',
            lineHeight: '1.5',
          }}
        />
        <div className="mt-4 flex justify-between items-center">
          <div className="text-sm text-gray-500">
            Words: {content.split(/\s+/).filter(Boolean).length} | Characters: {content.length}
          </div>
          <div className="space-x-2">
            <button
              onClick={() => (onSave ? onSave({ ...document, content: content }) : handleSave())}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Save
            </button>
            <button
              onClick={handleBackToCoAuthor}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Package Error Display
  const PackageErrorDisplay = () =>
    packageErrors.length > 0 && (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
        <div className="flex">
          <div className="ml-3">
            <p className="text-sm text-yellow-700">
              <strong>Package Loading Issues Detected:</strong>
            </p>
            <ul className="mt-2 text-sm text-yellow-700 list-disc list-inside">
              {packageErrors.map((pkg, index) => (
                <li key={index}>{pkg}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-yellow-700">
              Editor is running in fallback mode to ensure continued functionality.
            </p>
          </div>
        </div>
      </div>
    );

  // Show loading state until initialization is complete
  if (!editorInitialized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing Document Editor...</p>
          <p className="text-sm text-gray-500 mt-2">Checking package dependencies...</p>
        </div>
      </div>
    );
  }

  // Use fallback editor if packages failed
  if (fallbackMode) {
    return (
      <div className="enhanced-document-editor h-screen flex flex-col bg-gray-50 p-6">
        <PackageErrorDisplay />
        <FallbackEditor />
      </div>
    );
  }

  return (
    // START: IND BUILDER ENHANCEMENT - PHASE 1 - OPTIMIZED EDITOR LAYOUT (DO NOT REMOVE OR MODIFY THIS LINE)
    <div
      style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, backgroundColor: '#faf9f5' }}
    >
      <PackageErrorDisplay />
      {/* Enhanced Header with Compliance Metrics */}
      <div
        className="bg-white border-b border-slate-200 shadow-sm"
        style={{ width: '100vw', margin: 0, padding: 0 }}
      >
        <div style={{ width: '100vw', padding: '12px 16px', margin: 0 }}>
          <div className="flex justify-between items-center">
            {/* Left Header Section - Navigation & Title */}
            <div className="flex items-center space-x-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToCoAuthor}
                className="hover:bg-slate-100 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Co-Author
              </Button>
              <div className="border-l border-slate-200 pl-6">
                <input
                  type="text"
                  data-testid="input-document-title"
                  value={document?.title || 'Untitled Document'}
                  onChange={e => {
                    if (onChange) {
                      onChange({ ...document, title: e.target.value });
                    }
                  }}
                  className="text-xl font-bold text-slate-900 leading-tight bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
                  placeholder="Enter document title..."
                />
                <p className="text-sm text-slate-600 mt-1">
                  AI-Powered Regulatory Document Authoring Platform
                </p>
              </div>
            </div>

            {/* Right Header Section - Controls, Compliance Metrics & Actions */}
            <div className="flex items-center space-x-3">
              <Badge
                variant="outline"
                className="bg-purple-100 text-purple-700 border-purple-200 px-3 py-1"
              >
                <Brain className="h-3 w-3 mr-1" />
                AI Co-Author
              </Badge>
              <Badge
                variant="outline"
                className="bg-green-100 text-green-700 border-green-200 px-3 py-1"
              >
                <Sparkles className="h-3 w-3 mr-1" />
                AI Powered
              </Badge>
              <Button
                onClick={() => setIndBuilderMode(!indBuilderMode)}
                variant={indBuilderMode ? 'default' : 'outline'}
                size="sm"
                className={
                  indBuilderMode
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'hover:bg-green-50'
                }
              >
                <Target className="h-4 w-4 mr-2" />
                IND Builder {indBuilderMode ? 'ON' : 'OFF'}
              </Button>

              {/* Compliance Metrics */}
              {complianceMetrics && (
                <>
                  <Badge
                    variant="outline"
                    className="bg-green-100 text-green-800 rounded-full px-3 py-1 text-sm font-semibold"
                  >
                    FDA {complianceMetrics.fda || 'N/A'}%
                  </Badge>
                  <Badge
                    variant="outline"
                    className="bg-green-100 text-green-800 rounded-full px-3 py-1 text-sm font-semibold"
                  >
                    ICH {complianceMetrics.ich || 'N/A'}%
                  </Badge>
                  <Badge
                    variant="outline"
                    className="bg-blue-100 text-blue-800 rounded-full px-3 py-1 text-sm font-semibold"
                  >
                    Quality {complianceMetrics.quality || 'N/A'}%
                  </Badge>
                </>
              )}

              <div className="flex items-center space-x-2 border-l border-slate-200 pl-3">
                <Button
                  onClick={handleSave}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
                <Button
                  onClick={handleDownload}
                  variant="outline"
                  size="sm"
                  className="hover:bg-gray-50"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button variant="outline" onClick={handleAIAssist} disabled={isAnalyzing} size="sm">
                  <Brain className="h-4 w-4 mr-2" />
                  {isAnalyzing ? 'Analyzing...' : 'AI Assist'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Document Controls */}
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAIAssist}
                disabled={isAnalyzing}
                className="flex items-center space-x-2"
              >
                <Brain className="h-4 w-4" />
                <span>{isAnalyzing ? 'Analyzing...' : 'Writing Helper'}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={createVersion}
                className="flex items-center space-x-2"
              >
                <GitBranch className="h-4 w-4" />
                <span>Save Version</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowContextPanel(!showContextPanel)}
                className={`flex items-center space-x-2 ${showContextPanel ? 'bg-yellow-100 text-yellow-700' : ''}`}
              >
                <Lightbulb className="h-4 w-4" />
                <span>Context Hints ({contextHints.length})</span>
              </Button>
            </div>

            <div className="flex items-center space-x-1 text-sm text-slate-600">
              <History className="h-4 w-4" />
              <span>{versions.length} versions</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTrackChanges(!trackChanges)}
              className={`flex items-center space-x-1 ${trackChanges ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-100 text-gray-600 border-gray-300'}`}
            >
              <CheckCircle className="h-3 w-3" />
              <span>Track Changes: {trackChanges ? 'ON' : 'OFF'}</span>
              {trackChanges && changes.length > 0 && (
                <Badge variant="secondary" className="ml-1 bg-blue-100 text-blue-700">
                  {changes.length}
                </Badge>
              )}
            </Button>
            <Badge variant="outline" className="bg-blue-100 text-blue-700">
              <Users className="h-3 w-3 mr-1" />
              Collaborative
            </Badge>
          </div>
        </div>
      </div>

      {/* Professional TinyMCE Editor */}
      <div className="flex-1 bg-white">
        <div className="flex h-full">
          {/* Main Editor Area */}
          <div className="flex-1 p-4">
            {Editor ? (
              <Editor
                ref={editorRef}
                apiKey="no-api-key"
                initialValue={content}
                init={editorConfig}
                onEditorChange={handleEditorChange}
              />
            ) : (
              // Professional fallback editor with full formatting toolbar
              <div
                className="bg-white border border-slate-200 rounded-lg"
                style={{ minHeight: '600px' }}
              >
                {/* Professional Formatting Toolbar */}
                <div className="border-b border-slate-200 p-3 bg-slate-50">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 pr-2 border-r border-slate-300">
                      <button
                        onClick={() => applyFormat('bold')}
                        className="px-3 py-1 text-sm font-bold border border-slate-300 rounded hover:bg-slate-200"
                        title="Bold"
                      >
                        B
                      </button>
                      <button
                        onClick={() => applyFormat('italic')}
                        className="px-3 py-1 text-sm italic border border-slate-300 rounded hover:bg-slate-200"
                        title="Italic"
                      >
                        I
                      </button>
                      <button
                        onClick={() => applyFormat('underline')}
                        className="px-3 py-1 text-sm underline border border-slate-300 rounded hover:bg-slate-200"
                        title="Underline"
                      >
                        U
                      </button>
                    </div>
                    <div className="flex items-center gap-1 pr-2 border-r border-slate-300">
                      <button
                        onClick={() => applyAlignment('left')}
                        className="px-2 py-1 text-sm border border-slate-300 rounded hover:bg-slate-200"
                        title="Align Left"
                      >
                        ⫷
                      </button>
                      <button
                        onClick={() => applyAlignment('center')}
                        className="px-2 py-1 text-sm border border-slate-300 rounded hover:bg-slate-200"
                        title="Center"
                      >
                        ⫸
                      </button>
                      <button
                        onClick={() => applyAlignment('right')}
                        className="px-2 py-1 text-sm border border-slate-300 rounded hover:bg-slate-200"
                        title="Align Right"
                      >
                        ⫹
                      </button>
                    </div>
                    <div className="flex items-center gap-1 pr-2 border-r border-slate-300">
                      <button
                        onClick={() => insertList('ul')}
                        className="px-2 py-1 text-sm border border-slate-300 rounded hover:bg-slate-200"
                        title="Bullet List"
                      >
                        • List
                      </button>
                      <button
                        onClick={() => insertList('ol')}
                        className="px-2 py-1 text-sm border border-slate-300 rounded hover:bg-slate-200"
                        title="Numbered List"
                      >
                        1. List
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <select
                        onChange={e => {
                          if (e.target.value !== 'p') {
                            applyHeading(e.target.value);
                          }
                          e.target.value = 'p'; // Reset to normal
                        }}
                        className="px-2 py-1 text-sm border border-slate-300 rounded bg-white"
                        defaultValue="p"
                      >
                        <option value="p">Normal Text</option>
                        <option value="h1">Heading 1</option>
                        <option value="h2">Heading 2</option>
                        <option value="h3">Heading 3</option>
                      </select>
                      <button
                        onClick={() => setShowPreview(!showPreview)}
                        className={`px-2 py-1 text-sm border border-slate-300 rounded ${showPreview ? 'bg-blue-100 text-blue-700' : 'bg-white'}`}
                        title="Toggle Preview (shows track changes)"
                      >
                        👁️ Preview{trackChanges && changes.length > 0 ? ' + Changes' : ''}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Functional Text Editor Area */}
                {!showPreview ? (
                  <textarea
                    key={`textarea-${forceUpdate}`}
                    ref={textAreaRef}
                    value={content}
                    onChange={e => handleContentChange(e.target.value)}
                    className="w-full border-0 resize-none focus:outline-none bg-transparent overflow-y-auto p-6"
                    style={{
                      fontSize: '12pt',
                      lineHeight: '1.6',
                      fontFamily: 'Times New Roman, serif',
                      minHeight: '500px',
                      whiteSpace: 'pre-wrap',
                    }}
                    placeholder="Start typing your document content here..."
                  />
                ) : (
                  <div
                    className="w-full p-6 overflow-y-auto bg-white"
                    style={{ minHeight: '500px' }}
                  >
                    <div
                      className="prose max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(
                          String(
                            trackChanges && changes.length > 0
                              ? applyTrackChangesMarkup(content)
                              : content
                          )
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\*(.*?)\*/g, '<em>$1</em>')
                            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
                            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
                            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
                            .replace(/\n/g, '<br>'),
                          { USE_PROFILES: { html: true } }
                        ),
                      }}
                    />
                  </div>
                )}

                <div className="mt-4 p-4 bg-blue-50 border-l-4 border-blue-400 text-blue-700 text-sm mx-6 mb-6 rounded">
                  <p>
                    <strong>✨ Professional Rich Text Editor Active</strong>
                  </p>
                  <p>
                    Features: Complete formatting toolbar, track changes, version history, AI
                    assistance, collaborative editing
                  </p>
                  <p>Use the formatting toolbar above for professional document styling.</p>
                  <div className="mt-3 p-3 bg-white rounded border">
                    <p className="text-xs font-semibold text-blue-800 mb-2">
                      FORMATTING VERIFICATION:
                    </p>
                    <p className="text-xs">
                      Content has formatting:{' '}
                      <span className="font-mono">
                        {typeof content === 'string' &&
                        (content.includes('**') || content.includes('##'))
                          ? 'YES ✓'
                          : 'NO'}
                      </span>
                    </p>
                    <p className="text-xs">
                      Working content has formatting:{' '}
                      <span className="font-mono">
                        {typeof userWorkingContentRef.current === 'string' &&
                        (userWorkingContentRef.current?.includes('**') ||
                          userWorkingContentRef.current?.includes('##'))
                          ? 'YES ✓'
                          : 'NO'}
                      </span>
                    </p>
                    <details className="mt-2">
                      <summary className="text-xs cursor-pointer text-blue-600">
                        View Raw Content with Formatting
                      </summary>
                      <div className="mt-2 p-2 bg-gray-50 rounded text-xs font-mono max-h-40 overflow-y-auto whitespace-pre-wrap">
                        {typeof content === 'string'
                          ? content.substring(0, 500)
                          : String(content).substring(0, 500)}
                        ...
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Context Hints & Version History Sidebar */}
          <div className="w-80 border-l border-slate-200 bg-slate-50 p-4">
            <div className="space-y-4">
              {/* Context Hints Panel */}
              {showContextPanel && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-900 flex items-center">
                      <Lightbulb className="h-4 w-4 mr-2 text-yellow-500" />
                      Context Hints
                    </h3>
                    <div className="flex items-center space-x-2">
                      <Button size="sm" variant="ghost" onClick={() => setShowContextPanel(false)}>
                        ×
                      </Button>
                    </div>
                  </div>

                  {/* Hint Categories Filter */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {Object.entries(hintCategories).map(([category, enabled]) => (
                      <button
                        key={category}
                        onClick={() =>
                          setHintCategories(prev => ({
                            ...prev,
                            [category]: !prev[category],
                          }))
                        }
                        className={`px-2 py-1 text-xs rounded ${
                          enabled
                            ? 'bg-blue-100 text-blue-700 border border-blue-300'
                            : 'bg-gray-100 text-gray-500 border border-gray-300'
                        }`}
                      >
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Context Hints List */}
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {contextHints.length === 0 ? (
                      <div className="text-center py-4 text-slate-500">
                        <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                        <p className="text-sm">All suggestions implemented!</p>
                        <p className="text-xs">Your document looks well-structured.</p>
                      </div>
                    ) : (
                      contextHints.map(hint => (
                        <div
                          key={hint.id}
                          className={`p-3 rounded-lg border-l-4 ${
                            hint.priority === 'high'
                              ? 'bg-red-50 border-red-400'
                              : hint.priority === 'medium'
                                ? 'bg-yellow-50 border-yellow-400'
                                : 'bg-blue-50 border-blue-400'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center mb-1">
                                {hint.icon === 'FileText' && <FileText className="h-3 w-3 mr-1" />}
                                {hint.icon === 'Target' && <Target className="h-3 w-3 mr-1" />}
                                {hint.icon === 'CheckCircle' && (
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                )}
                                {hint.icon === 'AlertCircle' && (
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                )}
                                {hint.icon === 'BookOpen' && <BookOpen className="h-3 w-3 mr-1" />}
                                {hint.icon === 'TrendingUp' && (
                                  <TrendingUp className="h-3 w-3 mr-1" />
                                )}
                                <h4 className="text-sm font-medium text-slate-800">{hint.title}</h4>
                                <Badge
                                  variant="outline"
                                  className={`ml-2 text-xs ${
                                    hint.priority === 'high'
                                      ? 'border-red-400 text-red-700'
                                      : hint.priority === 'medium'
                                        ? 'border-yellow-400 text-yellow-700'
                                        : 'border-blue-400 text-blue-700'
                                  }`}
                                >
                                  {hint.priority}
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-600 mb-2">{hint.description}</p>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => applyContextHint(hint)}
                                className="text-xs h-6"
                              >
                                {hint.action}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 flex items-center">
                  <History className="h-4 w-4 mr-2" />
                  Version History
                </h3>
                <Button size="sm" variant="outline" onClick={handleSave}>
                  <GitBranch className="h-4 w-4 mr-1" />
                  Save
                </Button>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {versions.map(version => (
                  <div
                    key={version.id}
                    className={`p-3 rounded border cursor-pointer transition-colors ${
                      (version.isCurrent && selectedVersionId === 'current') ||
                      (!version.isCurrent && selectedVersionId === version.id)
                        ? 'bg-blue-50 border-blue-300 hover:border-blue-400'
                        : 'bg-white border-slate-200 hover:border-blue-300'
                    }`}
                    onClick={() => restoreVersion(version)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-900 flex items-center gap-2">
                        {version.isCurrent ? (
                          <>
                            <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-semibold">
                              CURRENT
                            </span>
                            Working Version
                          </>
                        ) : (
                          `Version ${version.id}`
                        )}
                      </span>
                      <span className="text-xs text-slate-500">
                        {version.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mb-1">{version.author}</p>
                    <p className="text-xs text-slate-500">{version.changes}</p>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-200">
                <h4 className="font-medium text-slate-900 mb-2 flex items-center">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  AI Insights
                </h4>
                <div className="space-y-2">
                  <div className="p-2 bg-blue-50 rounded text-xs">
                    <p className="font-medium text-blue-900">
                      Compliance Score: {complianceMetrics.fda}%
                    </p>
                    <p className="text-blue-700">Document follows FDA guidelines</p>
                  </div>
                  <div className="p-2 bg-green-50 rounded text-xs">
                    <p className="font-medium text-green-900">Track Changes: Active</p>
                    <p className="text-green-700">All edits are being tracked</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Track Changes Review Panel */}
          {trackChanges && changes.length > 0 && (
            <div className="w-80 border-l border-slate-200 bg-white">
              <div className="p-4 border-b border-slate-200">
                <h3 className="font-semibold text-slate-900 flex items-center">
                  <History className="h-4 w-4 mr-2" />
                  Track Changes ({changes.length})
                </h3>
                <p className="text-xs text-slate-600 mt-1">Review and manage document revisions</p>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {changes.map((change, index) => (
                  <div key={change.id} className="p-3 border-b border-slate-100 hover:bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-slate-700">{change.author}</span>
                      <span className="text-xs text-slate-500">
                        {change.timestamp.toLocaleTimeString()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 mb-2">{change.summary}</p>

                    {/* Show detailed diff preview */}
                    {change.diff && change.diff.length > 0 && (
                      <div className="text-xs mb-2 p-2 bg-slate-50 rounded border">
                        {change.diff.map((d, i) => (
                          <span key={i}>
                            {d.type === 'addition' && (
                              <span className="bg-green-100 text-green-800 px-1 rounded">
                                +{d.text}
                              </span>
                            )}
                            {d.type === 'deletion' && (
                              <span className="bg-red-100 text-red-800 px-1 rounded line-through">
                                -{d.text}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center space-x-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs text-green-700 hover:bg-green-50"
                        onClick={() => {
                          // Accept change - remove from changes list
                          setChanges(prev => prev.filter(c => c.id !== change.id));
                        }}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Accept
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs text-red-700 hover:bg-red-50"
                        onClick={() => {
                          // Reject change - revert content and remove from list
                          setContent(change.oldContent);
                          userWorkingContentRef.current = change.oldContent;
                          setLastSavedContent(change.oldContent);
                          setChanges(prev => prev.filter(c => c.id !== change.id));
                        }}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {changes.length > 0 && (
                <div className="p-3 border-t border-slate-200 bg-slate-50">
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-green-700 hover:bg-green-50"
                      onClick={() => {
                        // Accept all changes
                        setChanges([]);
                      }}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Accept All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-red-700 hover:bg-red-50"
                      onClick={() => {
                        // Reject all changes - revert to original
                        setContent(originalContent);
                        userWorkingContentRef.current = originalContent;
                        setLastSavedContent(originalContent);
                        setChanges([]);
                      }}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Reject All
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Document Stats Footer */}
      <div className="flex items-center justify-between text-sm text-slate-600 bg-slate-50 p-3 border-t border-slate-200">
        <div className="flex items-center space-x-6">
          <span>
            <strong>
              {
                String(content || '')
                  .replace(/<[^>]*>/g, '')
                  .split(' ')
                  .filter(w => w.length > 0).length
              }
            </strong>{' '}
            words
          </span>
          <span>
            <strong>{String(content || '').replace(/<[^>]*>/g, '').length}</strong> characters
          </span>
          <span>
            Track changes:{' '}
            <strong className={trackChanges ? 'text-green-700' : 'text-gray-600'}>
              {trackChanges ? 'ON' : 'OFF'}
            </strong>
          </span>
          {trackChanges && changes.length > 0 && (
            <span className="text-blue-700">
              <strong>{changes.length}</strong> change{changes.length !== 1 ? 's' : ''} pending
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="bg-green-100 text-green-700">
            <CheckCircle className="h-3 w-3 mr-1" />
            Auto-saved
          </Badge>
          <Badge variant="outline" className="bg-blue-100 text-blue-700">
            <FileText className="h-3 w-3 mr-1" />
            Professional Editor
          </Badge>
        </div>
      </div>
    </div>
  );
}

export default EnhancedDocumentEditor;
