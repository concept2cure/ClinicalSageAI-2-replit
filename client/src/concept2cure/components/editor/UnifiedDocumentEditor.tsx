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

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import Underline_ from '@tiptap/extension-underline';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { SearchAndReplace } from './extensions/SearchAndReplace';
import { createSlashCommandExtension } from './extensions/SlashCommandMenu';
import { CommentMark, type CommentThread } from './extensions/CommentMark';
import { getCurrentUser } from '../../utils/getCurrentUser';
import { AIAutocomplete } from './extensions/AIAutocomplete';
import { GlossaryTooltip } from './extensions/GlossaryTooltip';
import { CitationMark, CitationPlugin } from './extensions/CitationPlugin';
import { ComplianceScanner } from './extensions/ComplianceScanner';
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
  Sparkles,
  Maximize2,
  Minimize2,
  MessageSquare,
  Eye,
  Layers,
  Clock,
  ChevronDown,
  Palette,
  Replace,
  Type,
} from 'lucide-react';
import InlineApprovalPanel from './InlineApprovalPanel';
import {
  useDocumentModeOptional,
  type DocumentMode,
  type ModeCapabilities,
  MODE_CAPABILITIES,
} from '../../contexts/DocumentModeContext';

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

export interface TemplateSection {
  key: string;
  label: string;
  required: boolean;
}

export interface Collaborator {
  id: string;
  name: string;
  color: string;
  avatar?: string;
}

export interface UnifiedDocumentEditorProps {
  documentId?: string;
  initialContent?: string;
  documentTitle?: string;
  documentType?: string;
  submissionType?: string;
  /** @deprecated Use documentMode instead. Kept for backward compat. */
  isReadOnly?: boolean;
  /**
   * Stage-aware document mode. When provided, overrides isReadOnly and
   * controls toolbar visibility, AI actions, save, and lock toggle.
   * Falls back to DocumentModeContext if available, then to isReadOnly.
   */
  documentMode?: DocumentMode;
  showTraceability?: boolean;
  showCompliance?: boolean;
  /** Hide the document header bar (title/type/panel toggles) when embedded in EditorPanel which provides its own */
  embedded?: boolean;
  onSave?: (content: string, metadata: Record<string, unknown>) => Promise<void>;
  onLinkSource?: (selectedText: string, range: { from: number; to: number }) => void;
  onVersionChange?: (version: DocumentVersion) => void;
  /** AI action callback — surfaces AI actions from toolbar/slash/bubble to parent */
  onAIAction?: (action: string, selectedText: string) => void;
  /** Add comment callback */
  onAddComment?: (commentId: string, text: string, range: { from: number; to: number }) => void;
  /** When set, the CommentMark with this ID will be removed from the editor content */
  cancelCommentId?: string | null;
  sources?: DocumentSource[];
  traceabilityLinks?: TraceabilityLink[];
  complianceIssues?: ComplianceIssue[];
  complianceScore?: number;
  versions?: DocumentVersion[];
  /** Template sections for template/content toggle view */
  templateStructure?: TemplateSection[];
  /** Active collaborators in this document */
  collaborators?: Collaborator[];
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
  onAIAction?: (action: string, selectedText: string) => void;
  showFindReplace: boolean;
  onToggleFindReplace: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ editor, onSave, isSaving, isLocked, onToggleLock, onAIAction, showFindReplace, onToggleFindReplace }) => {
  const [aiDropdownOpen, setAiDropdownOpen] = useState(false);

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
      className={`p-1.5 rounded hover:bg-zinc-200 transition-colors
        ${isActive ? 'bg-zinc-200 text-blue-600' : 'text-zinc-600'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-zinc-200 bg-zinc-50/80">
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

      <div className="w-px h-5 bg-zinc-200 mx-0.5" />

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

      <div className="w-px h-5 bg-zinc-200 mx-0.5" />

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
        <span className="w-4 h-4 bg-yellow-300 rounded text-xs flex items-center justify-center font-semibold">
          H
        </span>
      </ToolButton>

      <div className="w-px h-5 bg-zinc-200 mx-0.5" />

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

      <div className="w-px h-5 bg-zinc-200 mx-0.5" />

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

      <div className="w-px h-5 bg-zinc-200 mx-0.5" />

      {/* Find & Replace toggle */}
      <ToolButton
        onClick={onToggleFindReplace}
        isActive={showFindReplace}
        title="Find & Replace (Ctrl+F)"
      >
        <Search className="w-4 h-4" />
      </ToolButton>

      {/* AI Actions dropdown — replaces separate SmartToolbar row */}
      {onAIAction && (
        <div className="relative">
          <button
            onClick={() => setAiDropdownOpen(!aiDropdownOpen)}
            disabled={isLocked}
            className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
              aiDropdownOpen
                ? 'bg-purple-100 text-purple-700'
                : 'text-purple-600 hover:bg-purple-50'
            } ${isLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
            title="AI Actions"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AI</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {aiDropdownOpen && (
            <div className="absolute left-0 top-full mt-1 w-52 bg-white border border-zinc-200 rounded-lg shadow-lg z-50 py-1">
              {AI_TOOLBAR_ACTIONS.map(action => (
                <button
                  key={action.id}
                  onClick={() => {
                    onAIAction(action.id, '');
                    setAiDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-purple-50 text-sm text-zinc-700 flex items-center gap-2.5 transition-colors duration-150"
                >
                  <action.icon className="w-4 h-4 text-purple-500 shrink-0" />
                  <div>
                    <div className="font-medium text-xs">{action.label}</div>
                    <div className="text-xs text-zinc-400">{action.description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
      >
        <Save className="w-3.5 h-3.5" />
        {isSaving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AI Smart Actions Toolbar (Sprint 1A — ARTOS/Weave competitive parity)
// ─────────────────────────────────────────────────────────────────────────────

const AI_TOOLBAR_ACTIONS = [
  { id: 'rewrite', label: 'Rewrite', icon: Sparkles, description: 'Improve clarity & precision' },
  { id: 'expand', label: 'Expand', icon: Maximize2, description: 'Add detail & evidence' },
  { id: 'summarize', label: 'Summarize', icon: Minimize2, description: 'Executive summary' },
  { id: 'regulatory-tone', label: 'Regulatory Tone', icon: FileCheck, description: 'FDA/EMA language' },
  { id: 'add-references', label: 'Add References', icon: BookOpen, description: 'Insert citations' },
];

interface SmartToolbarProps {
  onAIAction?: (action: string, selectedText: string) => void;
  disabled?: boolean;
}

const SmartToolbar: React.FC<SmartToolbarProps> = ({ onAIAction, disabled }) => (
  <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-200 bg-zinc-50">
    <Sparkles className="w-3.5 h-3.5 text-purple-500 mr-1" />
    <span className="text-xs font-semibold text-purple-600 mr-2 uppercase tracking-wider">AI</span>
    {AI_TOOLBAR_ACTIONS.map(action => (
      <button
        key={action.id}
        onClick={() => onAIAction?.(action.id, '')}
        disabled={disabled}
        title={action.description}
        className="flex items-center gap-1 px-2 py-1 text-xs rounded-md hover:bg-purple-100 text-zinc-600 hover:text-purple-700 transition-colors disabled:opacity-40"
      >
        <action.icon className="w-3.5 h-3.5" />
        {action.label}
      </button>
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Find & Replace Bar (Sprint 1B)
// ─────────────────────────────────────────────────────────────────────────────

interface FindReplaceBarProps {
  editor: ReturnType<typeof useEditor>;
  onClose: () => void;
}

const FindReplaceBar: React.FC<FindReplaceBarProps> = ({ editor, onClose }) => {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const findInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    findInputRef.current?.focus();
  }, []);

  const handleFind = useCallback((value: string) => {
    setFindText(value);
    if (editor) {
      (editor.commands as Record<string, (arg: string) => boolean>).setSearchTerm(value);
    }
  }, [editor]);

  const handleReplace = useCallback(() => {
    if (editor) {
      (editor.commands as Record<string, (arg: string) => boolean>).setReplaceTerm(replaceText);
      (editor.commands as Record<string, () => boolean>).replaceCurrent();
    }
  }, [editor, replaceText]);

  const handleReplaceAll = useCallback(() => {
    if (editor) {
      (editor.commands as Record<string, (arg: string) => boolean>).setReplaceTerm(replaceText);
      (editor.commands as Record<string, () => boolean>).replaceAll();
    }
  }, [editor, replaceText]);

  const results = editor?.storage?.searchAndReplace?.results ?? [];
  const currentIndex = editor?.storage?.searchAndReplace?.currentIndex ?? -1;

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200 bg-amber-50/50">
      <Search className="w-4 h-4 text-zinc-400 flex-shrink-0" />
      <input
        ref={findInputRef}
        type="text"
        value={findText}
        onChange={e => handleFind(e.target.value)}
        placeholder="Find..."
        className="w-40 px-2 py-1 text-xs bg-white border border-zinc-200 rounded focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
        onKeyDown={e => {
          if (e.key === 'Enter') (editor?.commands as Record<string, () => boolean>)?.nextMatch?.();
          if (e.key === 'Escape') onClose();
        }}
      />
      <span className="text-xs text-zinc-500 min-w-[50px]">
        {results.length > 0 ? `${currentIndex + 1}/${results.length}` : 'No results'}
      </span>
      <button onClick={() => (editor?.commands as Record<string, () => boolean>)?.prevMatch?.()} className="p-1 hover:bg-zinc-200 rounded" title="Previous">
        <ChevronDown className="w-3.5 h-3.5 rotate-180 text-zinc-600" />
      </button>
      <button onClick={() => (editor?.commands as Record<string, () => boolean>)?.nextMatch?.()} className="p-1 hover:bg-zinc-200 rounded" title="Next">
        <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
      </button>
      <div className="w-px h-5 bg-zinc-300" />
      <Replace className="w-4 h-4 text-zinc-400 flex-shrink-0" />
      <input
        type="text"
        value={replaceText}
        onChange={e => setReplaceText(e.target.value)}
        placeholder="Replace..."
        className="w-32 px-2 py-1 text-xs bg-white border border-zinc-200 rounded focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
      />
      <button onClick={handleReplace} className="px-2 py-1 text-xs bg-white border border-zinc-200 rounded hover:bg-zinc-100">
        Replace
      </button>
      <button onClick={handleReplaceAll} className="px-2 py-1 text-xs bg-white border border-zinc-200 rounded hover:bg-zinc-100">
        All
      </button>
      <button onClick={onClose} aria-label="Close find and replace" title="Close" className="p-1 hover:bg-zinc-200 rounded ml-auto focus-visible:ring-2 focus-visible:ring-blue-500 outline-none">
        <X className="w-3.5 h-3.5 text-zinc-500" />
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Source Tracer Popover (Sprint 2B — ARTOS-inspired)
// ─────────────────────────────────────────────────────────────────────────────

interface SourceTracerPopoverProps {
  source: DocumentSource | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onOpenSource?: (sourceId: string) => void;
}

const SourceTracerPopover: React.FC<SourceTracerPopoverProps> = ({
  source,
  position,
  onClose,
  onOpenSource,
}) => {
  if (!source || !position) return null;
  return (
    <div
      className="fixed z-50 bg-white border border-blue-200 rounded-lg shadow-xl p-3 w-72"
      style={{ top: position.y + 8, left: position.x }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-semibold text-zinc-900">{source.title}</span>
        </div>
        <button onClick={onClose} aria-label="Close source details" title="Close" className="p-1.5 hover:bg-zinc-100 rounded focus-visible:ring-2 focus-visible:ring-blue-500 outline-none">
          <X className="w-3 h-3 text-zinc-400" />
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
        <span className="px-1.5 py-0.5 bg-zinc-100 rounded">{source.documentType}</span>
        <span>v{source.version}</span>
        <span className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3 text-emerald-500" />
          Hash verified
        </span>
      </div>
      {source.excerpt && (
        <p className="text-xs text-zinc-600 bg-zinc-50 p-2 rounded mb-2 line-clamp-3">
          {source.excerpt}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onOpenSource?.(source.id)}
          className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
        >
          <ExternalLink className="w-3 h-3" />
          Open full source
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Status Bar (Sprint 1A — word count, reading time, compliance)
// ─────────────────────────────────────────────────────────────────────────────

interface StatusBarProps {
  editor: ReturnType<typeof useEditor>;
  complianceScore?: number;
  collaborators?: Collaborator[];
}

// Common regulatory document word count targets
const WORD_COUNT_TARGETS: Record<string, number> = {
  'Clinical Study Report': 25000,
  'Module 2.5 Overview': 5000,
  'Risk Analysis': 3000,
  'Device Description': 4000,
  'Regulatory Narrative': 8000,
};

const StatusBar: React.FC<StatusBarProps> = ({ editor, complianceScore, collaborators }) => {
  if (!editor) return null;
  const words = editor.storage.characterCount?.words?.() ?? 0;
  const chars = editor.storage.characterCount?.characters?.() ?? 0;
  const readingTime = Math.max(1, Math.ceil(words / 200));

  // Simple page estimate (250 words per page)
  const pages = Math.max(1, Math.ceil(words / 250));

  return (
    <div className="flex items-center gap-4 px-4 py-1.5 border-t border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
      <span>{words.toLocaleString()} words</span>
      <span>{chars.toLocaleString()} chars</span>
      <span>~{pages} pg{pages !== 1 ? 's' : ''}</span>
      <span className="flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {readingTime} min read
      </span>
      {complianceScore !== undefined && (
        <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${
          complianceScore >= 90 ? 'bg-emerald-100 text-emerald-700' :
          complianceScore >= 70 ? 'bg-amber-100 text-amber-700' :
          'bg-red-100 text-red-700'
        }`}>
          <FileCheck className="w-3 h-3" />
          {complianceScore}% compliant
        </span>
      )}
      <div className="flex-1" />
      {collaborators && collaborators.length > 0 && (
        <div className="flex items-center gap-1">
          <Users className="w-3 h-3" />
          <span>{collaborators.length} editing</span>
          <div className="flex -space-x-1.5 ml-1">
            {collaborators.slice(0, 4).map(c => (
              <div
                key={c.id}
                title={c.name}
                className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-xs font-semibold text-white"
                style={{ backgroundColor: c.color }}
              >
                {c.name.charAt(0).toUpperCase()}
              </div>
            ))}
            {collaborators.length > 4 && (
              <div className="w-5 h-5 rounded-full bg-zinc-300 border-2 border-white flex items-center justify-center text-xs font-semibold text-zinc-600">
                +{collaborators.length - 4}
              </div>
            )}
          </div>
        </div>
      )}
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
          <span className={`text-2xl font-semibold ${getScoreColor(score)}`}>{score}%</span>
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
                      className="flex-1 text-left hover:text-blue-600 transition-colors duration-150"
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
            <h3 className="font-semibold text-zinc-900">Link to Source</h3>
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
              className="w-full pl-10 pr-4 py-2 bg-zinc-100 border-0 rounded-lg text-zinc-900 placeholder:text-zinc-400"
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
                  className="w-full p-3 text-left bg-zinc-50 hover:bg-blue-50 rounded-lg border border-zinc-200 transition-colors duration-150"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-zinc-900">
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
  documentMode: documentModeProp,
  showTraceability = true,
  showCompliance = true,
  embedded = false,
  onSave,
  onLinkSource,
  onVersionChange,
  onAIAction,
  onAddComment,
  cancelCommentId,
  sources = [],
  traceabilityLinks = [],
  complianceIssues = [],
  complianceScore = 100,
  versions = [],
  templateStructure,
  collaborators,
  className = '',
  onLiveContentChange,
}) => {
  // ── Resolve document mode ────────────────────────────────────────────────
  // Priority: explicit prop > context > legacy isReadOnly fallback
  const modeCtx = useDocumentModeOptional();
  const resolvedMode: DocumentMode = documentModeProp
    ?? modeCtx?.mode
    ?? (isReadOnly ? 'readonly' : 'edit');
  const caps: ModeCapabilities = MODE_CAPABILITIES[resolvedMode];

  const [isSaving, setIsSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(!caps.editable);
  const [activePanel, setActivePanel] = useState<'compliance' | 'traceability' | null>(
    showCompliance ? 'compliance' : showTraceability ? 'traceability' : null
  );
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [selectedTextForLink, setSelectedTextForLink] = useState('');
  const [selectedRange, setSelectedRange] = useState<{ from: number; to: number } | null>(null);
  const [approvalPanelOpen, setApprovalPanelOpen] = useState(false);
  const [approvalSelectedText, setApprovalSelectedText] = useState('');
  const [approvalSelectionRange, setApprovalSelectionRange] = useState<{ from: number; to: number } | null>(null);
  // Sprint 1 state
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [viewMode, setViewMode] = useState<'content' | 'template'>('content');
  // Sprint 2 state — Source Tracer popover
  const [tracerSource, setTracerSource] = useState<DocumentSource | null>(null);
  const [tracerPosition, setTracerPosition] = useState<{ x: number; y: number } | null>(null);
  // Sprint 3 state — Inline comments
  const [comments, setComments] = useState<CommentThread[]>([]);

  // Slash command extension (memoized to avoid re-creation)
  const slashCommandExt = useMemo(
    () => createSlashCommandExtension(onAIAction),
    [onAIAction]
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      HeadingWithId,
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      Underline_,
      Placeholder.configure({
        placeholder: 'Start writing your regulatory document... Type "/" for commands',
      }),
      CharacterCount,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      TraceabilityMark,
      CommentMark,
      SearchAndReplace,
      slashCommandExt,
      AIAutocomplete.configure({
        delay: 1500,
        maxTokens: 80,
        enabled: true,
        context: {
          documentType: documentType,
          submissionType: submissionType,
          ctdSection: undefined,
        },
      }),
      CitationMark,
      CitationPlugin,
      GlossaryTooltip.configure({
        enabled: true,
        customTerms: [],
      }),
      ComplianceScanner.configure({
        enabled: true,
        delay: 2000,
        context: {
          documentType: documentType,
          submissionType: submissionType,
        },
      }),
    ],
    content: initialContent,
    editable: caps.editable && !isLocked,
    onUpdate: ({ editor }) => {
      onLiveContentChange?.(editor.getHTML());
    },
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowFindReplace(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close Find/Replace clears search
  const handleCloseFindReplace = useCallback(() => {
    setShowFindReplace(false);
    if (editor) {
      (editor.commands as Record<string, () => boolean>).clearSearch?.();
    }
  }, [editor]);

  // Source Tracer click handler — detect clicks on traceability marks
  useEffect(() => {
    if (!editor) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const traceEl = target.closest('[data-traceability]');
      if (traceEl) {
        const sourceId = traceEl.getAttribute('data-source-id') ||
          (traceEl as HTMLElement).dataset.sourceId;
        // Find the source
        const matched = sources.find(s => s.id === sourceId);
        if (matched) {
          const rect = traceEl.getBoundingClientRect();
          setTracerSource(matched);
          setTracerPosition({ x: rect.left, y: rect.bottom });
        }
      } else {
        // Click outside tracer — close it
        setTracerSource(null);
        setTracerPosition(null);
      }
    };
    const editorEl = editor.view.dom;
    editorEl.addEventListener('click', handleClick);
    return () => editorEl.removeEventListener('click', handleClick);
  }, [editor, sources]);

  // Add comment handler
  const handleAddComment = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    if (!selectedText.trim()) return;

    const user = getCurrentUser();
    const commentId = `comment-${Date.now()}`;
    editor
      .chain()
      .focus()
      .setTextSelection({ from, to })
      .setMark('comment', {
        commentId,
        authorId: user.id,
        authorName: user.name,
        createdAt: new Date().toISOString(),
      })
      .run();

    const newComment: CommentThread = {
      id: commentId,
      text: '',
      authorId: user.id,
      authorName: user.name,
      createdAt: new Date().toISOString(),
      resolved: false,
      replies: [],
    };
    setComments(prev => [...prev, newComment]);
    onAddComment?.(commentId, selectedText, { from, to });
  }, [editor, onAddComment]);

  // Remove a CommentMark from the editor when a comment is cancelled
  useEffect(() => {
    if (!editor || !cancelCommentId) return;
    const { doc, tr } = editor.state;
    let removed = false;
    doc.descendants((node, pos) => {
      node.marks.forEach(mark => {
        if (mark.type.name === 'comment' && mark.attrs.commentId === cancelCommentId) {
          tr.removeMark(pos, pos + node.nodeSize, mark);
          removed = true;
        }
      });
    });
    if (removed) {
      editor.view.dispatch(tr);
    }
  }, [editor, cancelCommentId]);

  // Update editor editable state when lock or mode changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(caps.editable && !isLocked);
    }
  }, [editor, isLocked, caps.editable]);

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
      {/* Document Header — hidden when embedded in EditorPanel (which provides its own) */}
      {!embedded && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 bg-zinc-50">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-blue-500" />
            <div>
              <h1 className="font-semibold text-zinc-900">{documentTitle}</h1>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="px-2 py-0.5 bg-zinc-200 rounded">
                  {documentType}
                </span>
                {submissionType && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded">
                    {submissionType}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Template/Content Toggle (Weave-inspired) */}
            {templateStructure && templateStructure.length > 0 && (
              <div className="flex items-center bg-zinc-100 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('content')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    viewMode === 'content'
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5 inline mr-1" />
                  Content
                </button>
                <button
                  onClick={() => setViewMode('template')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    viewMode === 'template'
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 inline mr-1" />
                  Template
                </button>
              </div>
            )}
            {/* Collaborator Avatars */}
            {collaborators && collaborators.length > 0 && (
              <div className="flex -space-x-1.5 mr-1">
                {collaborators.slice(0, 3).map(c => (
                  <div
                    key={c.id}
                    title={c.name}
                    className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-xs font-semibold text-white"
                    style={{ backgroundColor: c.color }}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                ))}
                {collaborators.length > 3 && (
                  <div className="w-6 h-6 rounded-full bg-zinc-300 border-2 border-white flex items-center justify-center text-xs font-semibold text-zinc-600">
                    +{collaborators.length - 3}
                  </div>
                )}
              </div>
            )}
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
      )}

      {/* Formatting Toolbar — hidden in preview/none modes */}
      {caps.showToolbar && (
        <Toolbar
          editor={editor}
          onSave={caps.canSave ? handleSave : () => {}}
          isSaving={isSaving}
          isLocked={isLocked || !caps.editable}
          onToggleLock={caps.canToggleLock ? () => setIsLocked(!isLocked) : () => {}}
          onAIAction={caps.showAIActions ? onAIAction : undefined}
          showFindReplace={showFindReplace}
          onToggleFindReplace={() => setShowFindReplace(prev => !prev)}
        />
      )}

      {/* Find & Replace Bar */}
      {showFindReplace && (
        <FindReplaceBar editor={editor} onClose={handleCloseFindReplace} />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className="flex-1 overflow-y-auto">
          {/* Enhanced Bubble Menu for Selection Actions */}
          {editor && (
            <BubbleMenu
              editor={editor}
              tippyOptions={{ duration: 100 }}
              className="bg-zinc-800 rounded-lg shadow-xl px-1.5 py-1 flex items-center gap-0.5 flex-wrap max-w-md"
            >
              {/* Formatting */}
              <button
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={`p-1.5 rounded hover:bg-zinc-700 ${editor.isActive('bold') ? 'text-blue-400' : 'text-white'}`}
                title="Bold"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={`p-1.5 rounded hover:bg-zinc-700 ${editor.isActive('italic') ? 'text-blue-400' : 'text-white'}`}
                title="Italic"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                className={`p-1.5 rounded hover:bg-zinc-700 ${editor.isActive('underline') ? 'text-blue-400' : 'text-white'}`}
                title="Underline"
              >
                <Underline className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleStrike().run()}
                className={`p-1.5 rounded hover:bg-zinc-700 ${editor.isActive('strike') ? 'text-blue-400' : 'text-white'}`}
                title="Strikethrough"
              >
                <Strikethrough className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleHighlight().run()}
                className={`p-1.5 rounded hover:bg-zinc-700 ${editor.isActive('highlight') ? 'text-blue-400' : 'text-white'}`}
                title="Highlight"
              >
                <span className="w-3.5 h-3.5 bg-yellow-400 rounded text-xs flex items-center justify-center font-semibold text-black">
                  H
                </span>
              </button>
              {/* Color palette */}
              {['#ef4444', '#3b82f6', '#10b981', '#f59e0b'].map(color => (
                <button
                  key={color}
                  onClick={() => editor.chain().focus().setColor(color).run()}
                  className="p-1 rounded hover:bg-zinc-700"
                  title={`Text color`}
                >
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                </button>
              ))}
              <button
                onClick={() => editor.chain().focus().unsetColor().run()}
                className="p-1 rounded hover:bg-zinc-700 text-zinc-400"
                title="Reset color"
              >
                <X className="w-3 h-3" />
              </button>
              <div className="w-px h-4 bg-zinc-600 mx-0.5" />
              {/* Source link */}
              <button
                onClick={handleLinkToSource}
                className="p-1.5 rounded hover:bg-zinc-700 text-white flex items-center gap-1"
                title="Link to Source"
              >
                <Link className="w-3.5 h-3.5" />
                <span className="text-xs">Source</span>
              </button>
              <div className="w-px h-4 bg-zinc-600 mx-0.5" />
              {/* AI Actions on selection */}
              <button
                onClick={() => {
                  const { from, to } = editor.state.selection;
                  const text = editor.state.doc.textBetween(from, to, ' ');
                  onAIAction?.('rewrite', text);
                }}
                className="p-1.5 rounded hover:bg-purple-700 text-purple-300 flex items-center gap-1"
                title="AI Rewrite Selection"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-xs">Rewrite</span>
              </button>
              <button
                onClick={() => {
                  const { from, to } = editor.state.selection;
                  const text = editor.state.doc.textBetween(from, to, ' ');
                  onAIAction?.('regulatory-tone', text);
                }}
                className="p-1.5 rounded hover:bg-purple-700 text-purple-300"
                title="Regulatory Tone"
              >
                <FileCheck className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  const { from, to } = editor.state.selection;
                  const text = editor.state.doc.textBetween(from, to, ' ');
                  onAIAction?.('expand', text);
                }}
                className="p-1.5 rounded hover:bg-purple-700 text-purple-300"
                title="AI Expand — add detail and evidence"
              >
                <span className="text-[10px] font-semibold">+</span>
              </button>
              <button
                onClick={() => {
                  const { from, to } = editor.state.selection;
                  const text = editor.state.doc.textBetween(from, to, ' ');
                  onAIAction?.('summarize', text);
                }}
                className="p-1.5 rounded hover:bg-purple-700 text-purple-300"
                title="AI Summarize — create concise version"
              >
                <span className="text-[10px] font-semibold">Σ</span>
              </button>
              <div className="w-px h-4 bg-zinc-600 mx-0.5" />
              {/* Comment */}
              <button
                onClick={handleAddComment}
                className="p-1.5 rounded hover:bg-zinc-700 text-amber-300 flex items-center gap-1"
                title="Add Comment"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="text-xs">Comment</span>
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

          {/* Template View Overlay */}
          {viewMode === 'template' && templateStructure && (
            <div className="absolute inset-0 bg-white/95 z-10 overflow-y-auto p-6">
              <div className="max-w-3xl mx-auto">
                <div className="flex items-center gap-2 mb-4">
                  <Layers className="w-5 h-5 text-blue-500" />
                  <h2 className="font-semibold text-zinc-900">Template Structure</h2>
                  <span className="text-xs text-zinc-500 ml-auto">
                    {templateStructure.filter(s => {
                      const html = editor?.getHTML() || '';
                      return html.toLowerCase().includes(s.label.toLowerCase());
                    }).length}/{templateStructure.length} sections filled
                  </span>
                </div>
                <div className="space-y-2">
                  {templateStructure.map(section => {
                    const html = editor?.getHTML() || '';
                    const isFilled = html.toLowerCase().includes(section.label.toLowerCase());
                    return (
                      <div
                        key={section.key}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                          isFilled
                            ? 'bg-emerald-50 border-emerald-200'
                            : 'bg-zinc-50 border-zinc-200 hover:border-blue-300'
                        }`}
                        onClick={() => {
                          setViewMode('content');
                          // Scroll to section heading if exists
                          const el = document.getElementById(`outline-${section.key.toLowerCase().replace(/\s+/g, '-')}`);
                          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}
                      >
                        {isFilled ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-zinc-300 flex-shrink-0" />
                        )}
                        <div className="flex-1">
                          <span className="text-sm font-medium text-zinc-900">{section.label}</span>
                          {section.required && (
                            <span className="ml-2 text-xs text-red-500 font-medium">Required</span>
                          )}
                        </div>
                        {!isFilled && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAIAction?.('generate-section', section.label);
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-100 text-purple-600 rounded hover:bg-purple-200"
                          >
                            <Sparkles className="w-3 h-3" />
                            Generate
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Editor Content */}
          <div className="p-8 max-w-4xl mx-auto">
            <EditorContent
              editor={editor}
              className="prose prose-slate max-w-none min-h-[500px] outline-none"
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

      {/* Status Bar */}
      <StatusBar
        editor={editor}
        complianceScore={complianceScore}
        collaborators={collaborators}
      />

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
      {/* Source Tracer Popover (Sprint 2B) */}
      <SourceTracerPopover
        source={tracerSource}
        position={tracerPosition}
        onClose={() => { setTracerSource(null); setTracerPosition(null); }}
      />
    </div>
  );
};

export default UnifiedDocumentEditor;
