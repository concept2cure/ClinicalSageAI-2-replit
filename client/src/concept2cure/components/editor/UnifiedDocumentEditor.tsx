/**
 * Unified Document Editor
 *
 * Phase 5: Intelligent Document System
 * A Google Docs-style editor built on TipTap for regulatory document authoring.
 *
 * Features:
 * - Rich text editing with regulatory formatting
 * - Traceability linking (highlight → link to source)
 * - Real-time compliance scoring
 * - Version tracking and change propagation
 * - 21 CFR Part 11 compliant audit trail
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { FloatingMenu } from '@tiptap/extension-floating-menu';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Table as TableIcon,
  Link,
  Image,
  Undo,
  Redo,
  Save,
  FileCheck,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  History,
  Users,
  Lock,
  Unlock,
  BookOpen,
  FileText,
  Search,
  X,
  Shield,
  MessageSquare as MessageSquareIcon,
} from 'lucide-react';
import InlineApprovalPanel from './InlineApprovalPanel';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DocumentSource {
  id: string;
  title: string;
  hash: string;
  version: string;
  documentType: string;
  excerpt?: string;
  url?: string;
}

export interface TraceabilityLink {
  id: string;
  sourceId: string;
  sourceHash: string;
  targetRange: { from: number; to: number };
  linkedText: string;
  createdAt: string;
  createdBy: string;
}

export interface ComplianceIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  range?: { from: number; to: number };
  suggestion?: string;
}

export interface DocumentVersion {
  id: string;
  version: string;
  createdAt: string;
  createdBy: string;
  changeDescription: string;
  hash: string;
}

export interface UnifiedDocumentEditorProps {
  documentId?: string;
  initialContent?: string;
  documentTitle?: string;
  documentType?: string;
  submissionType?: string;
  isReadOnly?: boolean;
  showTraceability?: boolean;
  showCompliance?: boolean;
  onSave?: (content: string, metadata: Record<string, unknown>) => Promise<void>;
  onLinkSource?: (selectedText: string, range: { from: number; to: number }) => void;
  onVersionChange?: (version: DocumentVersion) => void;
  sources?: DocumentSource[];
  traceabilityLinks?: TraceabilityLink[];
  complianceIssues?: ComplianceIssue[];
  complianceScore?: number;
  versions?: DocumentVersion[];
  className?: string;
  /** Live content callback for outline sync */
  onLiveContentChange?: (html: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom TipTap Extension for Traceability
// ─────────────────────────────────────────────────────────────────────────────

import { Mark, mergeAttributes } from '@tiptap/core';
import Heading from '@tiptap/extension-heading';

const TraceabilityMark = Mark.create({
  name: 'traceability',

  addAttributes() {
    return {
      sourceId: {
        default: null,
      },
      sourceHash: {
        default: null,
      },
      linkId: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-traceability]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-traceability': 'true',
        class:
          'traceability-link bg-blue-100 border-b-2 border-blue-500 cursor-pointer hover:bg-blue-200',
      }),
      0,
    ];
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Heading extension with auto-generated IDs for outline navigation
// ─────────────────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'heading'
  );
}

const HeadingWithId = Heading.extend({
  renderHTML({ node, HTMLAttributes }) {
    const level = node.attrs.level;
    const text = node.textContent || '';
    const id = `outline-${slugify(text)}`;
    return [`h${level}`, mergeAttributes(HTMLAttributes, { id, 'data-outline-id': id }), 0];
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Toolbar Component
// ─────────────────────────────────────────────────────────────────────────────

interface ToolbarProps {
  editor: ReturnType<typeof useEditor>;
  onSave: () => void;
  isSaving: boolean;
  isLocked: boolean;
  onToggleLock: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ editor, onSave, isSaving, isLocked, onToggleLock }) => {
  if (!editor) return null;

  const ToolButton: React.FC<{
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    title: string;
    children: React.ReactNode;
  }> = ({ onClick, isActive, disabled, title, children }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2 rounded hover:bg-zinc-200 transition-colors
        ${isActive ? 'bg-zinc-200 text-blue-600' : 'text-zinc-600'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex items-center gap-1 p-2 border-b border-zinc-200 bg-zinc-50 flex-wrap">
      {/* History */}
      <ToolButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo"
      >
        <Undo className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo"
      >
        <Redo className="w-4 h-4" />
      </ToolButton>

      <div className="w-px h-6 bg-zinc-300 mx-1" />

      {/* Headings */}
      <ToolButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      >
        <Heading1 className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        <Heading2 className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive('heading', { level: 3 })}
        title="Heading 3"
      >
        <Heading3 className="w-4 h-4" />
      </ToolButton>

      <div className="w-px h-6 bg-zinc-300 mx-1" />

      {/* Text Formatting */}
      <ToolButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="Bold"
      >
        <Bold className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="Italic"
      >
        <Italic className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        title="Strikethrough"
      >
        <Strikethrough className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        isActive={editor.isActive('highlight')}
        title="Highlight"
      >
        <span className="w-4 h-4 bg-yellow-300 rounded text-xs flex items-center justify-center font-bold">
          H
        </span>
      </ToolButton>

      <div className="w-px h-6 bg-zinc-300 mx-1" />

      {/* Lists */}
      <ToolButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="Bullet List"
      >
        <List className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="Numbered List"
      >
        <ListOrdered className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        isActive={editor.isActive('taskList')}
        title="Task List"
      >
        <FileCheck className="w-4 h-4" />
      </ToolButton>

      <div className="w-px h-6 bg-zinc-300 mx-1" />

      {/* Block Elements */}
      <ToolButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title="Quote"
      >
        <Quote className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive('codeBlock')}
        title="Code Block"
      >
        <Code className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
        title="Insert Table"
      >
        <TableIcon className="w-4 h-4" />
      </ToolButton>

      <div className="flex-1" />

      {/* Lock / Save */}
      <ToolButton onClick={onToggleLock} title={isLocked ? 'Unlock Document' : 'Lock Document'}>
        {isLocked ? (
          <Lock className="w-4 h-4 text-red-500" />
        ) : (
          <Unlock className="w-4 h-4 text-green-500" />
        )}
      </ToolButton>
      <button
        onClick={onSave}
        disabled={isSaving}
        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        {isSaving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Compliance Panel Component
// ─────────────────────────────────────────────────────────────────────────────

interface CompliancePanelProps {
  score: number;
  issues: ComplianceIssue[];
  onIssueClick?: (issue: ComplianceIssue) => void;
}

const CompliancePanel: React.FC<CompliancePanelProps> = ({ score, issues, onIssueClick }) => {
  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-500';
    if (score >= 70) return 'text-yellow-500';
    return 'text-red-500';
  };

  const errorCount = issues.filter(i => i.type === 'error').length;
  const warningCount = issues.filter(i => i.type === 'warning').length;
  const infoCount = issues.filter(i => i.type === 'info').length;

  return (
    <div className="border-l border-zinc-200 w-72 flex flex-col bg-zinc-50">
      {/* Score Header */}
      <div className="p-4 border-b border-zinc-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-zinc-600">
            Compliance Score
          </span>
          <span className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}%</span>
        </div>
        <div className="w-full bg-zinc-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              score >= 90 ? 'bg-green-500' : score >= 70 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${score}%` }}
          />
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs">
          <span className="flex items-center gap-1 text-red-500">
            <AlertTriangle className="w-3 h-3" /> {errorCount} errors
          </span>
          <span className="flex items-center gap-1 text-yellow-500">
            <AlertTriangle className="w-3 h-3" /> {warningCount} warnings
          </span>
          <span className="flex items-center gap-1 text-blue-500">
            <FileText className="w-3 h-3" /> {infoCount} info
          </span>
        </div>
      </div>

      {/* Issues List */}
      <div className="flex-1 overflow-y-auto">
        {issues.length === 0 ? (
          <div className="p-4 text-center text-zinc-500">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
            <p className="text-sm">No compliance issues found!</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {issues.map(issue => (
              <button
                key={issue.id}
                onClick={() => onIssueClick?.(issue)}
                className={`w-full p-3 rounded-lg text-left transition-colors ${
                  issue.type === 'error'
                    ? 'bg-red-50 border border-red-200 hover:bg-red-100'
                    : issue.type === 'warning'
                      ? 'bg-yellow-50 border border-yellow-200 hover:bg-yellow-100'
                      : 'bg-blue-50 border border-blue-200 hover:bg-blue-100'
                }`}
              >
                <div className="flex items-start gap-2">
                  {issue.type === 'error' ? (
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  ) : issue.type === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <FileText className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-500">
                      {issue.rule}
                    </p>
                    <p className="text-sm text-zinc-700">{issue.message}</p>
                    {issue.suggestion && (
                      <p className="text-xs text-zinc-500 mt-1 italic">
                        Suggestion: {issue.suggestion}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Traceability Panel Component
// ─────────────────────────────────────────────────────────────────────────────

interface TraceabilityPanelProps {
  links: TraceabilityLink[];
  sources: DocumentSource[];
  onLinkClick?: (link: TraceabilityLink) => void;
  onRemoveLink?: (linkId: string) => void;
}

const TraceabilityPanel: React.FC<TraceabilityPanelProps> = ({
  links,
  sources,
  onLinkClick,
  onRemoveLink,
}) => {
  const getSourceById = (sourceId: string) => sources.find(s => s.id === sourceId);

  return (
    <div className="border-l border-zinc-200 w-72 flex flex-col bg-zinc-50">
      {/* Header */}
      <div className="p-4 border-b border-zinc-200">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-500" />
          <span className="font-medium text-zinc-700">Traceability Links</span>
        </div>
        <p className="text-xs text-zinc-500 mt-1">{links.length} source links in document</p>
      </div>

      {/* Links List */}
      <div className="flex-1 overflow-y-auto">
        {links.length === 0 ? (
          <div className="p-4 text-center text-zinc-500">
            <Link className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No traceability links yet</p>
            <p className="text-xs mt-1">Select text and link to a source</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {links.map(link => {
              const source = getSourceById(link.sourceId);
              return (
                <div
                  key={link.id}
                  className="p-3 bg-white rounded-lg border border-zinc-200"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      onClick={() => onLinkClick?.(link)}
                      className="flex-1 text-left hover:text-blue-600 transition-colors"
                    >
                      <p className="text-sm font-medium text-zinc-700 line-clamp-2">
                        "{link.linkedText}"
                      </p>
                    </button>
                    <button
                      onClick={() => onRemoveLink?.(link.id)}
                      className="p-1 hover:bg-red-100 rounded text-zinc-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  {source && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                      <FileText className="w-3 h-3" />
                      <span className="truncate">{source.title}</span>
                      <span className="text-zinc-400">v{source.version}</span>
                    </div>
                  )}
                  <div className="mt-1 text-xs text-zinc-400">
                    Hash: {link.sourceHash.slice(0, 12)}...
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Link Source Modal
// ─────────────────────────────────────────────────────────────────────────────

interface LinkSourceModalProps {
  isOpen: boolean;
  selectedText: string;
  sources: DocumentSource[];
  onClose: () => void;
  onLink: (source: DocumentSource) => void;
}

const LinkSourceModal: React.FC<LinkSourceModalProps> = ({
  isOpen,
  selectedText,
  sources,
  onClose,
  onLink,
}) => {
  const [search, setSearch] = useState('');

  const filteredSources = useMemo(() => {
    if (!search.trim()) return sources;
    const query = search.toLowerCase();
    return sources.filter(
      s => s.title.toLowerCase().includes(query) || s.documentType.toLowerCase().includes(query)
    );
  }, [sources, search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-zinc-200">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-zinc-800">Link to Source</h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-zinc-100 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Link "{selectedText.slice(0, 50)}
            {selectedText.length > 50 ? '...' : ''}" to a source document
          </p>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-zinc-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search sources..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-100 border-0 rounded-lg text-zinc-800 placeholder:text-zinc-400"
            />
          </div>
        </div>

        {/* Sources List */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredSources.length === 0 ? (
            <div className="p-4 text-center text-zinc-500">No sources found</div>
          ) : (
            <div className="space-y-2">
              {filteredSources.map(source => (
                <button
                  key={source.id}
                  onClick={() => onLink(source)}
                  className="w-full p-3 text-left bg-zinc-50 hover:bg-blue-50 rounded-lg border border-zinc-200 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-zinc-800">
                        {source.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                        <span className="px-2 py-0.5 bg-zinc-200 rounded">
                          {source.documentType}
                        </span>
                        <span>v{source.version}</span>
                        <span className="text-zinc-400">Hash: {source.hash.slice(0, 8)}...</span>
                      </div>
                      {source.excerpt && (
                        <p className="text-xs text-zinc-500 mt-2 line-clamp-2">{source.excerpt}</p>
                      )}
                    </div>
                    <ExternalLink className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Editor Component
// ─────────────────────────────────────────────────────────────────────────────

export const UnifiedDocumentEditor: React.FC<UnifiedDocumentEditorProps> = ({
  documentId,
  initialContent = '',
  documentTitle = 'Untitled Document',
  documentType = 'General',
  submissionType,
  isReadOnly = false,
  showTraceability = true,
  showCompliance = true,
  onSave,
  onLinkSource,
  onVersionChange,
  sources = [],
  traceabilityLinks = [],
  complianceIssues = [],
  complianceScore = 100,
  versions = [],
  className = '',
  onLiveContentChange,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(isReadOnly);
  const [activePanel, setActivePanel] = useState<'compliance' | 'traceability' | null>(
    showCompliance ? 'compliance' : showTraceability ? 'traceability' : null
  );
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [selectedTextForLink, setSelectedTextForLink] = useState('');
  const [selectedRange, setSelectedRange] = useState<{ from: number; to: number } | null>(null);
  const [approvalPanelOpen, setApprovalPanelOpen] = useState(false);
  const [approvalSelectedText, setApprovalSelectedText] = useState('');
  const [approvalSelectionRange, setApprovalSelectionRange] = useState<{ from: number; to: number } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      HeadingWithId,
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      Placeholder.configure({
        placeholder: 'Start writing your regulatory document...',
      }),
      CharacterCount,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      TraceabilityMark,
    ],
    content: initialContent,
    editable: !isLocked,
    onUpdate: ({ editor }) => {
      onLiveContentChange?.(editor.getHTML());
    },
  });

  // Update editor editable state when lock changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isLocked);
    }
  }, [editor, isLocked]);

  const handleSave = useCallback(async () => {
    if (!editor || !onSave) return;

    setIsSaving(true);
    try {
      const content = editor.getHTML();
      const wordCount = editor.storage.characterCount.words();
      const charCount = editor.storage.characterCount.characters();

      await onSave(content, {
        documentId,
        documentTitle,
        documentType,
        submissionType,
        wordCount,
        charCount,
        savedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to save document:', error);
    } finally {
      setIsSaving(false);
    }
  }, [editor, onSave, documentId, documentTitle, documentType, submissionType]);

  const handleRequestApproval = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    if (selectedText.trim()) {
      setApprovalSelectedText(selectedText);
      setApprovalSelectionRange({ from, to });
      setApprovalPanelOpen(true);
    }
  }, [editor]);

  const handleLinkToSource = useCallback(() => {
    if (!editor) return;

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');

    if (selectedText.trim()) {
      setSelectedTextForLink(selectedText);
      setSelectedRange({ from, to });
      setLinkModalOpen(true);
    }
  }, [editor]);

  const handleSourceSelected = useCallback(
    (source: DocumentSource) => {
      if (!editor || !selectedRange) return;

      // Apply traceability mark to selected text
      editor
        .chain()
        .focus()
        .setTextSelection(selectedRange)
        .setMark('traceability', {
          sourceId: source.id,
          sourceHash: source.hash,
          linkId: `link-${Date.now()}`,
        })
        .run();

      // Notify parent
      onLinkSource?.(selectedTextForLink, selectedRange);

      // Close modal
      setLinkModalOpen(false);
      setSelectedTextForLink('');
      setSelectedRange(null);
    },
    [editor, selectedRange, selectedTextForLink, onLinkSource]
  );

  const handleIssueClick = useCallback(
    (issue: ComplianceIssue) => {
      if (!editor || !issue.range) return;
      editor.chain().focus().setTextSelection(issue.range).run();
    },
    [editor]
  );

  if (!editor) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-white ${className}`}>
      {/* Document Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 bg-zinc-50">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-blue-500" />
          <div>
            <h1 className="font-semibold text-zinc-800">{documentTitle}</h1>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="px-2 py-0.5 bg-zinc-200 rounded">
                {documentType}
              </span>
              {submissionType && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded">
                  {submissionType}
                </span>
              )}
              <span>{editor.storage.characterCount.words()} words</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Panel Toggles */}
          {showTraceability && (
            <button
              onClick={() => setActivePanel(activePanel === 'traceability' ? null : 'traceability')}
              className={`p-2 rounded transition-colors ${
                activePanel === 'traceability'
                  ? 'bg-blue-100 text-blue-600'
                  : 'hover:bg-zinc-100 text-zinc-600'
              }`}
              title="Traceability Links"
            >
              <BookOpen className="w-5 h-5" />
            </button>
          )}
          {showCompliance && (
            <button
              onClick={() => setActivePanel(activePanel === 'compliance' ? null : 'compliance')}
              className={`p-2 rounded transition-colors ${
                activePanel === 'compliance'
                  ? 'bg-blue-100 text-blue-600'
                  : 'hover:bg-zinc-100 text-zinc-600'
              }`}
              title="Compliance Score"
            >
              <FileCheck className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <Toolbar
        editor={editor}
        onSave={handleSave}
        isSaving={isSaving}
        isLocked={isLocked}
        onToggleLock={() => setIsLocked(!isLocked)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className="flex-1 overflow-y-auto">
          {/* Bubble Menu for Selection Actions */}
          {editor && (
            <BubbleMenu
              editor={editor}
              tippyOptions={{ duration: 100 }}
              className="bg-zinc-800 rounded-lg shadow-lg px-2 py-1 flex items-center gap-1"
            >
              <button
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={`p-1.5 rounded hover:bg-zinc-700 ${editor.isActive('bold') ? 'text-blue-400' : 'text-white'}`}
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={`p-1.5 rounded hover:bg-zinc-700 ${editor.isActive('italic') ? 'text-blue-400' : 'text-white'}`}
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleHighlight().run()}
                className={`p-1.5 rounded hover:bg-zinc-700 ${editor.isActive('highlight') ? 'text-blue-400' : 'text-white'}`}
              >
                <span className="w-4 h-4 bg-yellow-400 rounded text-xs flex items-center justify-center font-bold text-black">
                  H
                </span>
              </button>
              <div className="w-px h-4 bg-zinc-600 mx-1" />
              <button
                onClick={handleLinkToSource}
                className="p-1.5 rounded hover:bg-zinc-700 text-white flex items-center gap-1"
                title="Link to Source"
              >
                <Link className="w-4 h-4" />
                <span className="text-xs">Link</span>
              </button>
              <div className="w-px h-4 bg-zinc-600 mx-1" />
              <button
                onClick={handleRequestApproval}
                className="p-1.5 rounded hover:bg-zinc-700 text-white flex items-center gap-1"
                title="Request Approval / Annotate"
              >
                <Shield className="w-4 h-4" />
                <span className="text-xs">Approve</span>
              </button>
              <button
                onClick={handleRequestApproval}
                className="p-1.5 rounded hover:bg-zinc-700 text-white flex items-center gap-1"
                title="Comment on Selection"
              >
                <MessageSquareIcon className="w-4 h-4" />
              </button>
            </BubbleMenu>
          )}

          {/* Editor Content */}
          <div className="p-8 max-w-4xl mx-auto">
            <EditorContent
              editor={editor}
              className="prose prose-slate max-w-none min-h-[500px] focus:outline-none"
            />
          </div>
        </div>

        {/* Side Panels */}
        {activePanel === 'compliance' && (
          <CompliancePanel
            score={complianceScore}
            issues={complianceIssues}
            onIssueClick={handleIssueClick}
          />
        )}
        {activePanel === 'traceability' && (
          <TraceabilityPanel
            links={traceabilityLinks}
            sources={sources}
            onLinkClick={link => {
              if (editor && link.targetRange) {
                editor.chain().focus().setTextSelection(link.targetRange).run();
              }
            }}
            onRemoveLink={linkId => {
              // Handle link removal
              console.log('Remove link:', linkId);
            }}
          />
        )}
      </div>

      {/* Link Source Modal */}
      <LinkSourceModal
        isOpen={linkModalOpen}
        selectedText={selectedTextForLink}
        sources={sources}
        onClose={() => setLinkModalOpen(false)}
        onLink={handleSourceSelected}
      />

      {/* Inline Approval Panel — sentence/selection-level annotations */}
      {approvalPanelOpen && approvalSelectionRange && (
        <div className="fixed z-50 top-1/3 right-8 shadow-2xl">
          <InlineApprovalPanel
            documentId={documentId ? Number(documentId) : 1}
            selectedText={approvalSelectedText}
            selectionRange={approvalSelectionRange}
            onClose={() => {
              setApprovalPanelOpen(false);
              setApprovalSelectedText('');
              setApprovalSelectionRange(null);
            }}
            onAnnotationCreated={(annotation) => {
              // Optionally highlight the annotated text
              if (editor && approvalSelectionRange) {
                editor
                  .chain()
                  .focus()
                  .setTextSelection(approvalSelectionRange)
                  .setHighlight({ color: '#dbeafe' })
                  .run();
              }
            }}
          />
        </div>
      )}
    </div>
  );
};

export default UnifiedDocumentEditor;
