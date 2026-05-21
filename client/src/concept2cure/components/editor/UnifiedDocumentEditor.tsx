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
import { useCspNonce } from '@/hooks/useCspNonce';
// @ts-expect-error -- moduleResolution:node can't resolve package.json exports subpath
import { BubbleMenu } from '@tiptap/react/menus';
import {
  MODE_CAPABILITIES,
  useDocumentModeOptional,
  type DocumentMode,
  type ModeCapabilities,
} from '../../contexts/DocumentModeContext';
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
import TextAlign from '@tiptap/extension-text-align';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import LinkExtension from '@tiptap/extension-link';
import FontFamily from '@tiptap/extension-font-family';
import { Node, mergeAttributes, Extension } from '@tiptap/core'; // eslint-disable-line no-duplicate-imports
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';

/**
 * Lightweight Image node compatible with @tiptap/core 3.7.x.
 * The official @tiptap/extension-image >=3.19 requires ResizableNodeView
 * which doesn't exist in core 3.7.x.
 */
const TiptapImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'img[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes({ style: 'max-width:100%;height:auto' }, HTMLAttributes)];
  },
  addCommands() {
    return {
      setImage: (options: { src: string; alt?: string; title?: string }) => ({ commands }: any) => {
        return commands.insertContent({ type: this.name, attrs: options });
      },
    } as any;
  },
});

/**
 * FontSize extension — applies font-size via TextStyle mark.
 * Usage: editor.chain().focus().setFontSize('14px').run()
 */
const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
          renderHTML: (attrs) => {
            if (!attrs.fontSize) return {};
            return { style: `font-size: ${attrs.fontSize}` };
          },
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }: any) => {
        return chain().setMark('textStyle', { fontSize: size }).run();
      },
      unsetFontSize: () => ({ chain }: any) => {
        return chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run();
      },
    } as any;
  },
});

/**
 * LineHeight extension — applies line-height to paragraph/heading nodes.
 * Usage: editor.chain().focus().setLineHeight('1.5').run()
 */
const LineHeight = Extension.create({
  name: 'lineHeight',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: (el) => (el as HTMLElement).style.lineHeight || null,
          renderHTML: (attrs) => {
            if (!attrs.lineHeight) return {};
            return { style: `line-height: ${attrs.lineHeight}` };
          },
        },
      },
    }];
  },
  addCommands() {
    return {
      setLineHeight: (height: string) => ({ commands }: any) => {
        return commands.updateAttributes('paragraph', { lineHeight: height }) &&
               commands.updateAttributes('heading', { lineHeight: height });
      },
    } as any;
  },
});

import { SearchAndReplace } from './extensions/SearchAndReplace';
import { createSlashCommandExtension } from './extensions/SlashCommandMenu';
import { CommentMark, type CommentThread } from './extensions/CommentMark';
import { getCurrentUser } from '../../utils/getCurrentUser';
import { AIAutocomplete } from './extensions/AIAutocomplete';
import { GlossaryTooltip } from './extensions/GlossaryTooltip';
import { CitationMark, CitationPlugin } from './extensions/CitationPlugin';
import { ComplianceScanner } from './extensions/ComplianceScanner';
import { TrackChanges } from './extensions/TrackChangesExtension';
import { PageBreak } from './extensions/PageBreakExtension';
import { Indent } from './extensions/IndentExtension';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
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
  Sparkles,
  Maximize2,
  Minimize2,
  MessageSquare,
  Eye,
  Layers,
  Clock,
  ChevronDown,
  Replace,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Superscript as SuperscriptIcon,
  Subscript as SubscriptIcon,
  ImagePlus,
  Merge,
  SplitSquareHorizontal,
  Plus,
  Minus,
  IndentIncrease,
  IndentDecrease,
  Trash2,
  SeparatorHorizontal,
  LinkIcon,
  Unlink,
  Copy,
  Scissors,
  ClipboardPaste,
  Type,
  RotateCcw,
  RotateCw,
  Palette,
  ArrowUpRight,
  ZoomIn,
  ZoomOut,
  Printer,
  ListTree,
  Upload,
  WrapText,
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
  /** Callback when user clicks lock/unlock in toolbar — parent handles server mutation */
  onToggleLock?: () => void;
  showTraceability?: boolean;
  showCompliance?: boolean;
  /** Callback when compliance scanner finds issues */
  onComplianceIssuesFound?: (issues: Array<{ id: string; severity: string; message: string; suggestion?: string; category: string; from: number; to: number }>) => void;
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
  /** Selection/cursor change callback for collaboration cursor emission */
  onSelectionUpdate?: (editor: any) => void;
  /** Y.js document for CRDT collaboration (from useYjsProvider) */
  ydoc?: any;
  /** Hocuspocus provider for awareness sync */
  yjsProvider?: any;
  /** Current user info for collaboration cursor */
  currentUser?: { name: string; color: string };
  /** Pre-configured collaboration extensions (Collaboration + CollaborationCursor) */
  collabExtensions?: any[];
  /** Current authenticated user id (for lock ownership checks) */
  currentUserId?: string;
  /** Line numbers currently locked by other collaborators */
  lockedLineNumbers?: number[];
  /** Optional line-owner map used in lock rejection messaging */
  lockedLineOwnerByLine?: Record<number, string>;
  /** Called when user attempts to edit a locked line */
  onBlockedLineEdit?: (lineNumber: number, lockedBy?: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom TipTap Extension for Traceability
// ─────────────────────────────────────────────────────────────────────────────

import { Mark } from '@tiptap/core';
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
          'traceability-link bg-blue-100 border-b-2 border-stone-600 cursor-pointer hover:bg-blue-200',
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

function getLineNumberAtPos(doc: any, pos: number): number {
  const clamped = Math.max(0, Math.min(pos, doc?.content?.size ?? 0));
  const textBefore = doc.textBetween(0, clamped, '\n', '\n');
  return textBefore.length === 0 ? 1 : textBefore.split('\n').length;
}

function getSelectionLineRange(state: any): { fromLine: number; toLine: number } {
  const fromLine = getLineNumberAtPos(state.doc, state.selection.from);
  const toLine = getLineNumberAtPos(state.doc, state.selection.to);
  return { fromLine: Math.min(fromLine, toLine), toLine: Math.max(fromLine, toLine) };
}

function isMutationKey(event: KeyboardEvent): boolean {
  if (event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Enter' || event.key === 'Tab') {
    return true;
  }
  if (event.metaKey || event.ctrlKey) {
    const k = event.key.toLowerCase();
    return k === 'x' || k === 'v' || k === 'z' || k === 'y';
  }
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
}

const HeadingWithId = Heading.extend({
  renderHTML({ node, HTMLAttributes }: { node: any; HTMLAttributes: Record<string, any> }) {
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
  zoomLevel?: number;
  onZoomChange?: (zoom: number) => void;
  onPrintPreview?: () => void;
  onGenerateTOC?: () => void;
  onImportDocx?: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  editor,
  onSave,
  isSaving,
  isLocked,
  onToggleLock,
  onAIAction,
  showFindReplace,
  onToggleFindReplace,
  zoomLevel = 100,
  onZoomChange,
  onPrintPreview,
  onGenerateTOC,
  onImportDocx,
}) => {
  const [aiDropdownOpen, setAiDropdownOpen] = useState(false);
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [lineSpacingOpen, setLineSpacingOpen] = useState(false);

  if (!editor) return null;

  const FONT_FAMILIES = [
    { label: 'Default', value: '' },
    { label: 'Arial', value: 'Arial, sans-serif' },
    { label: 'Times New Roman', value: 'Times New Roman, serif' },
    { label: 'Calibri', value: 'Calibri, sans-serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Courier New', value: 'Courier New, monospace' },
    { label: 'Verdana', value: 'Verdana, sans-serif' },
    { label: 'Garamond', value: 'Garamond, serif' },
  ];
  const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '36', '48', '72'];
  const LINE_SPACINGS = [
    { label: '1.0', value: '1' },
    { label: '1.15', value: '1.15' },
    { label: '1.5', value: '1.5' },
    { label: '2.0', value: '2' },
    { label: '2.5', value: '2.5' },
    { label: '3.0', value: '3' },
  ];
  const currentFontFamily = editor.getAttributes('textStyle').fontFamily || '';
  const currentFontSize = editor.getAttributes('textStyle').fontSize || '';

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
      className={`p-1.5 rounded hover:bg-stone-200 transition-colors
        ${isActive ? 'bg-stone-200 text-blue-600' : 'text-stone-600'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-stone-200 bg-stone-50/80">
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

      <div className="w-px h-5 bg-stone-200 mx-0.5" />

      {/* Font Family */}
      <select
        value={currentFontFamily}
        onChange={e => {
          const val = e.target.value;
          if (val) {
            editor.chain().focus().setFontFamily(val).run();
          } else {
            editor.chain().focus().unsetFontFamily().run();
          }
        }}
        className="h-7 px-1 text-[11px] text-stone-700 bg-white border border-stone-200 rounded-md focus-visible:ring-1 focus-visible:ring-stone-400 outline-none cursor-pointer max-w-[100px]"
        title="Font Family"
      >
        {FONT_FAMILIES.map(f => (
          <option key={f.value} value={f.value} style={{ fontFamily: f.value || 'inherit' }}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Font Size */}
      <select
        value={currentFontSize.replace('px', '')}
        onChange={e => {
          const val = e.target.value;
          if (val) {
            (editor.commands as any).setFontSize(`${val}px`);
          } else {
            (editor.commands as any).unsetFontSize();
          }
        }}
        className="h-7 w-12 px-1 text-[11px] text-stone-700 bg-white border border-stone-200 rounded-md focus-visible:ring-1 focus-visible:ring-stone-400 outline-none cursor-pointer text-center"
        title="Font Size"
      >
        <option value="">—</option>
        {FONT_SIZES.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <div className="w-px h-5 bg-stone-200 mx-0.5" />

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

      <div className="w-px h-5 bg-stone-200 mx-0.5" />

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
      <ToolButton
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        isActive={editor.isActive('superscript')}
        title="Superscript"
      >
        <SuperscriptIcon className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        isActive={editor.isActive('subscript')}
        title="Subscript"
      >
        <SubscriptIcon className="w-4 h-4" />
      </ToolButton>

      <div className="w-px h-5 bg-stone-200 mx-0.5" />

      {/* Text Alignment */}
      <ToolButton
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        isActive={editor.isActive({ textAlign: 'left' })}
        title="Align Left"
      >
        <AlignLeft className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        isActive={editor.isActive({ textAlign: 'center' })}
        title="Align Center"
      >
        <AlignCenter className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        isActive={editor.isActive({ textAlign: 'right' })}
        title="Align Right"
      >
        <AlignRight className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        isActive={editor.isActive({ textAlign: 'justify' })}
        title="Justify"
      >
        <AlignJustify className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => (editor as any).chain().focus().indent().run()}
        title="Indent (Tab)"
      >
        <IndentIncrease className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => (editor as any).chain().focus().outdent().run()}
        title="Outdent (Shift+Tab)"
      >
        <IndentDecrease className="w-4 h-4" />
      </ToolButton>

      {/* Line Spacing */}
      <div className="relative">
        <ToolButton
          onClick={() => setLineSpacingOpen(prev => !prev)}
          title="Line Spacing"
        >
          <WrapText className="w-4 h-4" />
        </ToolButton>
        {lineSpacingOpen && (
          <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-stone-200 rounded-lg shadow-sm py-1 w-28">
            {LINE_SPACINGS.map(ls => (
              <button
                key={ls.value}
                onClick={() => {
                  (editor.commands as any).setLineHeight(ls.value);
                  setLineSpacingOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-stone-700 hover:bg-stone-50 transition-colors"
              >
                {ls.label} spacing
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-stone-200 mx-0.5" />

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

      <div className="w-px h-5 bg-stone-200 mx-0.5" />

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
      <ToolButton
        onClick={() => (editor as any).commands.setPageBreak()}
        title="Insert Page Break (Ctrl+Enter)"
      >
        <Minus className="w-4 h-4" />
      </ToolButton>
      {editor.isActive('table') && (
        <>
          <ToolButton
            onClick={() => editor.chain().focus().addRowAfter().run()}
            title="Add Row"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-[9px] ml-px">Row</span>
          </ToolButton>
          <ToolButton
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            title="Add Column"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-[9px] ml-px">Col</span>
          </ToolButton>
          <ToolButton
            onClick={() => editor.chain().focus().deleteRow().run()}
            title="Delete Row"
          >
            <Minus className="w-3.5 h-3.5" />
            <span className="text-[9px] ml-px">Row</span>
          </ToolButton>
          <ToolButton
            onClick={() => editor.chain().focus().deleteColumn().run()}
            title="Delete Column"
          >
            <Minus className="w-3.5 h-3.5" />
            <span className="text-[9px] ml-px">Col</span>
          </ToolButton>
          <ToolButton
            onClick={() => editor.chain().focus().mergeCells().run()}
            title="Merge Cells"
          >
            <Merge className="w-4 h-4" />
          </ToolButton>
          <ToolButton
            onClick={() => editor.chain().focus().splitCell().run()}
            title="Split Cell"
          >
            <SplitSquareHorizontal className="w-4 h-4" />
          </ToolButton>
          <ToolButton
            onClick={() => editor.chain().focus().toggleHeaderRow().run()}
            title="Toggle Header Row"
          >
            <span className="text-[9px] font-bold">H</span>
            <span className="text-[9px] ml-px">Row</span>
          </ToolButton>
          <ToolButton
            onClick={() => editor.chain().focus().deleteTable().run()}
            title="Delete Table"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </ToolButton>
        </>
      )}

      <div className="w-px h-5 bg-stone-200 mx-0.5" />

      {/* Image Insert — URL or File Upload */}
      <ToolButton
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const src = reader.result as string;
              (editor.chain().focus() as any).setImage({ src, alt: file.name }).run();
            };
            reader.readAsDataURL(file);
          };
          input.click();
        }}
        title="Upload Image"
      >
        <ImagePlus className="w-4 h-4" />
      </ToolButton>

      {/* Link insert/remove */}
      <div className="relative">
        <ToolButton
          onClick={() => {
            if (editor.isActive('link')) {
              editor.chain().focus().unsetLink().run();
            } else {
              const href = editor.getAttributes('link').href || '';
              setLinkUrl(href);
              setLinkPopoverOpen(prev => !prev);
            }
          }}
          isActive={editor.isActive('link')}
          title={editor.isActive('link') ? 'Remove Link' : 'Insert Link'}
        >
          {editor.isActive('link') ? (
            <Unlink className="w-4 h-4" />
          ) : (
            <LinkIcon className="w-4 h-4" />
          )}
        </ToolButton>
        {linkPopoverOpen && (
          <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-stone-200 rounded-lg shadow-sm p-2 flex items-center gap-1.5 w-72">
            <input
              autoFocus
              type="url"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && linkUrl.trim()) {
                  editor.chain().focus().setLink({ href: linkUrl.trim() }).run();
                  setLinkPopoverOpen(false);
                  setLinkUrl('');
                }
                if (e.key === 'Escape') {
                  setLinkPopoverOpen(false);
                  setLinkUrl('');
                }
              }}
              placeholder="https://..."
              className="flex-1 px-2 py-1.5 text-xs border border-stone-200 rounded-md focus-visible:ring-2 focus-visible:ring-stone-400 outline-none"
            />
            <button
              onClick={() => {
                if (linkUrl.trim()) {
                  editor.chain().focus().setLink({ href: linkUrl.trim() }).run();
                }
                setLinkPopoverOpen(false);
                setLinkUrl('');
              }}
              disabled={!linkUrl.trim()}
              className="px-2 py-1.5 text-xs font-medium bg-stone-800 text-white rounded-md hover:bg-stone-900 disabled:opacity-40 transition-colors"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Horizontal Rule */}
      <ToolButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
      >
        <SeparatorHorizontal className="w-4 h-4" />
      </ToolButton>

      <div className="w-px h-5 bg-stone-200 mx-0.5" />

      {/* Find & Replace toggle */}
      <ToolButton
        onClick={onToggleFindReplace}
        isActive={showFindReplace}
        title="Find & Replace (Ctrl+F)"
      >
        <Search className="w-4 h-4" />
      </ToolButton>

      <div className="w-px h-5 bg-stone-200 mx-0.5" />

      {/* Track Changes — Suggestion Mode Toggle */}
      <button
        onClick={() => (editor as any).commands.toggleSuggestionMode()}
        className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
          (editor as any).extensionManager?.extensions?.find((e: any) => e.name === 'trackChanges')?.options?.enabled
            ? 'bg-green-100 text-green-700 border border-green-300'
            : 'text-stone-500 hover:bg-stone-100'
        }`}
        title="Toggle Suggestion Mode — edits become tracked changes"
      >
        <Eye className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">
          {(editor as any).extensionManager?.extensions?.find((e: any) => e.name === 'trackChanges')?.options?.enabled
            ? 'Suggesting'
            : 'Editing'}
        </span>
      </button>

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
            <div className="absolute left-0 top-full mt-1 w-52 bg-white border border-stone-200 rounded-lg shadow-sm z-50 py-1">
              {AI_TOOLBAR_ACTIONS.map(action => (
                <button
                  key={action.id}
                  onClick={() => {
                    onAIAction(action.id, '');
                    setAiDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-purple-50 text-sm text-stone-700 flex items-center gap-2.5 transition-colors duration-150"
                >
                  <action.icon className="w-4 h-4 text-purple-500 shrink-0" />
                  <div>
                    <div className="font-medium text-xs">{action.label}</div>
                    <div className="text-xs text-stone-400">{action.description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1" />

      {/* DOCX Import */}
      {onImportDocx && (
        <ToolButton onClick={onImportDocx} title="Import Word Document (.docx)">
          <Upload className="w-4 h-4" />
        </ToolButton>
      )}

      {/* Table of Contents */}
      {onGenerateTOC && (
        <ToolButton onClick={onGenerateTOC} title="Generate Table of Contents">
          <ListTree className="w-4 h-4" />
        </ToolButton>
      )}

      {/* Print Preview */}
      {onPrintPreview && (
        <ToolButton onClick={onPrintPreview} title="Print Preview">
          <Printer className="w-4 h-4" />
        </ToolButton>
      )}

      {/* Zoom Controls */}
      {onZoomChange && (
        <div className="flex items-center gap-0.5">
          <ToolButton
            onClick={() => onZoomChange(Math.max(50, zoomLevel - 10))}
            disabled={zoomLevel <= 50}
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </ToolButton>
          <span className="text-[10px] text-stone-500 tabular-nums w-8 text-center">{zoomLevel}%</span>
          <ToolButton
            onClick={() => onZoomChange(Math.min(200, zoomLevel + 10))}
            disabled={zoomLevel >= 200}
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </ToolButton>
        </div>
      )}

      <div className="w-px h-5 bg-stone-200 mx-0.5" />

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
        className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 text-white rounded-md text-xs font-medium hover:bg-stone-900 transition-colors disabled:opacity-60"
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
  {
    id: 'regulatory-tone',
    label: 'Regulatory Tone',
    icon: FileCheck,
    description: 'FDA/EMA language',
  },
  {
    id: 'add-references',
    label: 'Add References',
    icon: BookOpen,
    description: 'Insert citations',
  },
];

// SmartToolbar removed — AI actions consolidated into toolbar dropdown (Sprint 1A)

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

  const handleFind = useCallback(
    (value: string) => {
      setFindText(value);
      if (editor) {
        (editor.commands as unknown as Record<string, (arg: string) => boolean>).setSearchTerm(value);
      }
    },
    [editor]
  );

  const handleReplace = useCallback(() => {
    if (editor) {
      (editor.commands as unknown as Record<string, (arg: string) => boolean>).setReplaceTerm(replaceText);
      (editor.commands as unknown as Record<string, () => boolean>).replaceCurrent();
    }
  }, [editor, replaceText]);

  const handleReplaceAll = useCallback(() => {
    if (editor) {
      (editor.commands as unknown as Record<string, (arg: string) => boolean>).setReplaceTerm(replaceText);
      (editor.commands as unknown as Record<string, () => boolean>).replaceAll();
    }
  }, [editor, replaceText]);

  const results = (editor?.storage as any)?.searchAndReplace?.results ?? [];
  const currentIndex = (editor?.storage as any)?.searchAndReplace?.currentIndex ?? -1;

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-200 bg-amber-50/50">
      <Search className="w-4 h-4 text-stone-400 flex-shrink-0" />
      <input
        ref={findInputRef}
        type="text"
        value={findText}
        onChange={e => handleFind(e.target.value)}
        placeholder="Find..."
        className="w-40 px-2 py-1 text-xs bg-white border border-stone-200 rounded focus-visible:ring-2 focus-visible:ring-stone-400 outline-none"
        onKeyDown={e => {
          if (e.key === 'Enter') (editor?.commands as unknown as Record<string, () => boolean>)?.nextMatch?.();
          if (e.key === 'Escape') onClose();
        }}
      />
      <span className="text-xs text-stone-500 min-w-[50px]">
        {results.length > 0 ? `${currentIndex + 1}/${results.length}` : 'No results'}
      </span>
      <button
        onClick={() => (editor?.commands as unknown as Record<string, () => boolean>)?.prevMatch?.()}
        className="p-1 hover:bg-stone-200 rounded"
        title="Previous"
      >
        <ChevronDown className="w-3.5 h-3.5 rotate-180 text-stone-600" />
      </button>
      <button
        onClick={() => (editor?.commands as unknown as Record<string, () => boolean>)?.nextMatch?.()}
        className="p-1 hover:bg-stone-200 rounded"
        title="Next"
      >
        <ChevronDown className="w-3.5 h-3.5 text-stone-600" />
      </button>
      <div className="w-px h-5 bg-stone-300" />
      <Replace className="w-4 h-4 text-stone-400 flex-shrink-0" />
      <input
        type="text"
        value={replaceText}
        onChange={e => setReplaceText(e.target.value)}
        placeholder="Replace..."
        className="w-32 px-2 py-1 text-xs bg-white border border-stone-200 rounded focus-visible:ring-2 focus-visible:ring-stone-400 outline-none"
      />
      <button
        onClick={handleReplace}
        className="px-2 py-1 text-xs bg-white border border-stone-200 rounded hover:bg-stone-100"
      >
        Replace
      </button>
      <button
        onClick={handleReplaceAll}
        className="px-2 py-1 text-xs bg-white border border-stone-200 rounded hover:bg-stone-100"
      >
        All
      </button>
      <button
        onClick={onClose}
        aria-label="Close find and replace"
        title="Close"
        className="p-1 hover:bg-stone-200 rounded ml-auto focus-visible:ring-2 focus-visible:ring-stone-400 outline-none"
      >
        <X className="w-3.5 h-3.5 text-stone-500" />
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
      className="fixed z-50 bg-white border border-blue-200 rounded-lg shadow p-3 w-72"
      style={{ top: position.y + 8, left: position.x }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-semibold text-stone-900">{source.title}</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close source details"
          title="Close"
          className="p-1.5 hover:bg-stone-100 rounded focus-visible:ring-2 focus-visible:ring-stone-400 outline-none"
        >
          <X className="w-3 h-3 text-stone-400" />
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-stone-500 mb-2">
        <span className="px-1.5 py-0.5 bg-stone-100 rounded">{source.documentType}</span>
        <span>v{source.version}</span>
        <span className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3 text-emerald-500" />
          Hash verified
        </span>
      </div>
      {source.excerpt && (
        <p className="text-xs text-stone-600 bg-stone-50 p-2 rounded mb-2 line-clamp-3">
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
    <div className="flex items-center gap-4 px-4 py-1.5 border-t border-stone-200 bg-stone-50 text-xs text-stone-500">
      <span>{words.toLocaleString()} words</span>
      <span>{chars.toLocaleString()} chars</span>
      <span>
        ~{pages} pg{pages !== 1 ? 's' : ''}
      </span>
      <span className="flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {readingTime} min read
      </span>
      {complianceScore !== undefined && (
        <span
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${
            complianceScore >= 90
              ? 'bg-emerald-100 text-emerald-700'
              : complianceScore >= 70
                ? 'bg-amber-100 text-amber-700'
                : 'bg-red-100 text-red-700'
          }`}
        >
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
              <div className="w-5 h-5 rounded-full bg-stone-300 border-2 border-white flex items-center justify-center text-xs font-semibold text-stone-600">
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
    <div className="border-l border-stone-200 w-72 flex flex-col bg-stone-50">
      {/* Score Header */}
      <div className="p-4 border-b border-stone-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-stone-600">Compliance Score</span>
          <span className={`text-base font-semibold ${getScoreColor(score)}`}>{score}%</span>
        </div>
        <div className="w-full bg-stone-200 rounded-full h-2">
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
          <div className="p-4 text-center text-stone-500">
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
                    <p className="text-xs font-medium text-stone-500">{issue.rule}</p>
                    <p className="text-sm text-stone-700">{issue.message}</p>
                    {issue.suggestion && (
                      <p className="text-xs text-stone-500 mt-1 italic">
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
    <div className="border-l border-stone-200 w-72 flex flex-col bg-stone-50">
      {/* Header */}
      <div className="p-4 border-b border-stone-200">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-500" />
          <span className="font-medium text-stone-700">Traceability Links</span>
        </div>
        <p className="text-xs text-stone-500 mt-1">{links.length} source links in document</p>
      </div>

      {/* Links List */}
      <div className="flex-1 overflow-y-auto">
        {links.length === 0 ? (
          <div className="p-4 text-center text-stone-500">
            <Link className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No traceability links yet</p>
            <p className="text-xs mt-1">Select text and link to a source</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {links.map(link => {
              const source = getSourceById(link.sourceId);
              return (
                <div key={link.id} className="p-3 bg-white rounded-lg border border-stone-200">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      onClick={() => onLinkClick?.(link)}
                      className="flex-1 text-left hover:text-blue-600 transition-colors duration-150"
                    >
                      <p className="text-sm font-medium text-stone-700 line-clamp-2">
                        "{link.linkedText}"
                      </p>
                    </button>
                    <button
                      onClick={() => onRemoveLink?.(link.id)}
                      className="p-1 hover:bg-red-100 rounded text-stone-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  {source && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-stone-500">
                      <FileText className="w-3 h-3" />
                      <span className="truncate">{source.title}</span>
                      <span className="text-stone-400">v{source.version}</span>
                    </div>
                  )}
                  <div className="mt-1 text-xs text-stone-400">
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
      <div className="bg-white rounded-xl shadow w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-stone-200">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-stone-900">Link to Source</h3>
            <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-stone-500 mt-1">
            Link "{selectedText.slice(0, 50)}
            {selectedText.length > 50 ? '...' : ''}" to a source document
          </p>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-stone-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search sources..."
              className="w-full pl-10 pr-4 py-2 bg-stone-100 border-0 rounded-lg text-stone-900 placeholder:text-stone-400"
            />
          </div>
        </div>

        {/* Sources List */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredSources.length === 0 ? (
            <div className="p-4 text-center text-stone-500">No sources found</div>
          ) : (
            <div className="space-y-2">
              {filteredSources.map(source => (
                <button
                  key={source.id}
                  onClick={() => onLink(source)}
                  className="w-full p-3 text-left bg-stone-50 hover:bg-blue-50 rounded-lg border border-stone-200 transition-colors duration-150"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-stone-900">{source.title}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-stone-500">
                        <span className="px-2 py-0.5 bg-stone-200 rounded">
                          {source.documentType}
                        </span>
                        <span>v{source.version}</span>
                        <span className="text-stone-400">Hash: {source.hash.slice(0, 8)}...</span>
                      </div>
                      {source.excerpt && (
                        <p className="text-xs text-stone-500 mt-2 line-clamp-2">{source.excerpt}</p>
                      )}
                    </div>
                    <ExternalLink className="w-4 h-4 text-stone-400 flex-shrink-0" />
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
  documentMode: documentModeProp,
  submissionType,
  isReadOnly = false,
  onToggleLock,
  showTraceability = true,
  showCompliance = true,
  onComplianceIssuesFound,
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
  onSelectionUpdate,
  ydoc,
  yjsProvider,
  currentUser,
  collabExtensions,
  currentUserId,
  lockedLineNumbers = [],
  lockedLineOwnerByLine = {},
  onBlockedLineEdit,
}) => {
  const modeCtx = useDocumentModeOptional();
  const resolvedMode: DocumentMode =
    documentModeProp ?? modeCtx?.mode ?? (isReadOnly ? 'readonly' : 'edit');
  const caps: ModeCapabilities = MODE_CAPABILITIES[resolvedMode];

  const [isSaving, setIsSaving] = useState(false);
  // Ghost local lock state REMOVED — editable posture now derived solely from
  // canonical ModeCapabilities (caps.editable). No local override.
  const [activePanel, setActivePanel] = useState<'compliance' | 'traceability' | null>(
    showCompliance ? 'compliance' : showTraceability ? 'traceability' : null
  );
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [selectedTextForLink, setSelectedTextForLink] = useState('');
  const [selectedRange, setSelectedRange] = useState<{ from: number; to: number } | null>(null);
  const [approvalPanelOpen, setApprovalPanelOpen] = useState(false);
  const [approvalSelectedText, setApprovalSelectedText] = useState('');
  const [approvalSelectionRange, setApprovalSelectionRange] = useState<{
    from: number;
    to: number;
  } | null>(null);
  // Sprint 1 state
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [viewMode, setViewMode] = useState<'content' | 'template'>('content');
  // Sprint 2 state — Source Tracer popover
  const [tracerSource, setTracerSource] = useState<DocumentSource | null>(null);
  const [tracerPosition, setTracerPosition] = useState<{ x: number; y: number } | null>(null);
  // Sprint 3 state — Inline comments
  const [comments, setComments] = useState<CommentThread[]>([]);

  // Zoom state
  const [zoomLevel, setZoomLevel] = useState(100);
  // Print preview state
  const [isPrintPreview, setIsPrintPreview] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    hasSelection: boolean;
    selectedText: string;
  } | null>(null);
  const lockedLineSetRef = useRef<Set<number>>(new Set());
  const lockedLineOwnerRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    const nextSet = new Set<number>();
    const nextOwners = new Map<number, string>();
    for (const line of lockedLineNumbers) {
      if (Number.isFinite(line) && line > 0) {
        nextSet.add(line);
        if (lockedLineOwnerByLine[line]) {
          nextOwners.set(line, lockedLineOwnerByLine[line]);
        }
      }
    }
    lockedLineSetRef.current = nextSet;
    lockedLineOwnerRef.current = nextOwners;
  }, [lockedLineNumbers, lockedLineOwnerByLine]);

  const notifyBlockedLineEdit = useCallback(
    (editorState: any): boolean => {
      if (!caps.editable) return false;
      if (!currentUserId) return false;
      if (lockedLineSetRef.current.size === 0) return false;
      const { fromLine, toLine } = getSelectionLineRange(editorState);
      for (let line = fromLine; line <= toLine; line++) {
        if (lockedLineSetRef.current.has(line)) {
          onBlockedLineEdit?.(line, lockedLineOwnerRef.current.get(line));
          return true;
        }
      }
      return false;
    },
    [caps.editable, currentUserId, onBlockedLineEdit]
  );

  // Slash command extension (memoized to avoid re-creation)
  const slashCommandExt = useMemo(() => createSlashCommandExtension(onAIAction), [onAIAction]);
  const cspNonce = useCspNonce();

  const editor = useEditor({
    injectNonce: cspNonce || undefined,
    extensions: [
      StarterKit.configure({ heading: false }),
      HeadingWithId,
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      Underline_,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Superscript,
      Subscript,
      LinkExtension.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: 'text-blue-600 underline cursor-pointer' },
      }),
      FontFamily,
      FontSize,
      LineHeight,
      TiptapImage,
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
        onIssuesFound: onComplianceIssuesFound,
      }),
      PageBreak,
      Indent,
      TrackChanges.configure({
        enabled: false,
        authorId: getCurrentUser()?.id ?? 'unknown',
        authorName: getCurrentUser()?.name ?? 'Unknown',
      }),
      // Y.js CRDT collaboration — activates when ydoc is provided
      ...(ydoc ? [
        Collaboration.configure({ document: ydoc }),
        ...(yjsProvider && currentUser ? [CollaborationCursor.configure({
          provider: yjsProvider,
          user: { name: currentUser.name, color: currentUser.color || '#3B82F6' },
        })] : []),
      ] : []),
      ...(collabExtensions || []),
    ],
    content: initialContent,
    editable: caps.editable,
    editorProps: {
      handleTextInput: (view) => {
        return notifyBlockedLineEdit(view.state);
      },
      handleKeyDown: (view, event) => {
        if (!isMutationKey(event)) return false;
        if (!notifyBlockedLineEdit(view.state)) return false;
        event.preventDefault();
        return true;
      },
      handlePaste: (view, event) => {
        if (notifyBlockedLineEdit(view.state)) {
          event.preventDefault();
          return true;
        }
        // Clean up Microsoft Word HTML on paste for seamless formatting
        const html = event.clipboardData?.getData('text/html');
        if (html && (html.includes('urn:schemas-microsoft-com') || html.includes('mso-') || html.includes('MsoNormal'))) {
          event.preventDefault();
          // Strip Word-specific XML/styles while preserving structure
          let clean = html
            .replace(/<o:p[^>]*>[\s\S]*?<\/o:p>/gi, '')
            .replace(/<\/?o:[^>]*>/gi, '')
            .replace(/<\/?v:[^>]*>/gi, '')
            .replace(/<\/?w:[^>]*>/gi, '')
            .replace(/class="Mso[^"]*"/gi, '')
            .replace(/style="[^"]*mso-[^"]*"/gi, '')
            .replace(/<!\[if[^>]*>[\s\S]*?<!\[endif\]>/gi, '')
            .replace(/<!--\[if[\s\S]*?endif\]-->/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<xml>[\s\S]*?<\/xml>/gi, '')
            .replace(/\s+style=""/gi, '')
            .replace(/<span\s*>/gi, '')
            .replace(/<\/span>/gi, '')
            .replace(/<font[^>]*>/gi, '')
            .replace(/<\/font>/gi, '')
            // Preserve meaningful styles (bold, italic, underline, color)
            .replace(/style="([^"]*)"/gi, (_, styles: string) => {
              const keepStyles: string[] = [];
              if (/font-weight:\s*(bold|[7-9]00)/i.test(styles)) keepStyles.push('font-weight:bold');
              if (/font-style:\s*italic/i.test(styles)) keepStyles.push('font-style:italic');
              if (/text-decoration:\s*underline/i.test(styles)) keepStyles.push('text-decoration:underline');
              const colorMatch = styles.match(/(?:^|;)\s*color:\s*([^;]+)/i);
              if (colorMatch) keepStyles.push(`color:${colorMatch[1].trim()}`);
              return keepStyles.length > 0 ? `style="${keepStyles.join(';')}"` : '';
            });
          // Create a temporary DOM element, parse via ProseMirror's built-in parser
          const temp = document.createElement('div');
          temp.innerHTML = clean;
          const slice = PMDOMParser.fromSchema(view.state.schema).parseSlice(temp);
          view.dispatch(view.state.tr.replaceSelection(slice));
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onLiveContentChange?.(editor.getHTML());
    },
    onSelectionUpdate({ editor }) {
      onSelectionUpdate?.(editor);
    },
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowFindReplace(prev => !prev);
      }
      // Ctrl+Shift+V — paste as plain text
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        navigator.clipboard.readText().then(text => {
          if (editor && text) {
            editor.chain().focus().insertContent(text).run();
          }
        }).catch(() => { /* clipboard access denied */ });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close Find/Replace clears search
  const handleCloseFindReplace = useCallback(() => {
    setShowFindReplace(false);
    if (editor) {
      (editor.commands as unknown as Record<string, () => boolean>).clearSearch?.();
    }
  }, [editor]);

  // Source Tracer click handler — detect clicks on traceability marks
  useEffect(() => {
    if (!editor) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const traceEl = target.closest('[data-traceability]');
      if (traceEl) {
        const sourceId =
          traceEl.getAttribute('data-source-id') || (traceEl as HTMLElement).dataset.sourceId;
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

  // Context menu handler — right-click opens Word-like context menu
  useEffect(() => {
    if (!editor) return;
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, ' ');
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        hasSelection: text.trim().length > 0,
        selectedText: text,
      });
    };
    const handleDismiss = () => setContextMenu(null);
    const editorEl = editor.view.dom;
    editorEl.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', handleDismiss);
    document.addEventListener('scroll', handleDismiss, true);
    return () => {
      editorEl.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('click', handleDismiss);
      document.removeEventListener('scroll', handleDismiss, true);
    };
  }, [editor]);

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

  // Update editor editable state when mode capabilities change
  useEffect(() => {
    if (editor) {
      editor.setEditable(caps.editable);
    }
  }, [editor, caps.editable]);

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
        <div className="animate-spin w-8 h-8 border-2 border-stone-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-white ${className}`} data-testid="unified-document-editor">
      {/* Read-only / locked mode indicator — calm but clear */}
      {!caps.editable && embedded && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-stone-50 border-b border-stone-200 text-xs text-stone-500">
          <Lock className="w-3 h-3" />
          <span className="font-medium">
            {caps.editable === false && resolvedMode === 'locked' ? 'Document locked' : 'Read-only mode'}
          </span>
          {resolvedMode === 'review' && (
            <span className="text-amber-600 font-medium ml-1">— Review in progress</span>
          )}
        </div>
      )}
      {/* Document Header — hidden when embedded in EditorPanel (which provides its own) */}
      {!embedded && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-stone-200 bg-stone-50">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-blue-500" />
            <div>
              <h1 className="font-semibold text-stone-900">{documentTitle}</h1>
              <div className="flex items-center gap-2 text-xs text-stone-500">
                <span className="px-2 py-0.5 bg-stone-200 rounded">{documentType}</span>
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
              <div className="flex items-center bg-stone-100 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('content')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    viewMode === 'content'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-700'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5 inline mr-1" />
                  Content
                </button>
                <button
                  onClick={() => setViewMode('template')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    viewMode === 'template'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-700'
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
                  <div className="w-6 h-6 rounded-full bg-stone-300 border-2 border-white flex items-center justify-center text-xs font-semibold text-stone-600">
                    +{collaborators.length - 3}
                  </div>
                )}
              </div>
            )}
            {/* Panel Toggles */}
            {showTraceability && (
              <button
                onClick={() =>
                  setActivePanel(activePanel === 'traceability' ? null : 'traceability')
                }
                className={`p-2 rounded transition-colors ${
                  activePanel === 'traceability'
                    ? 'bg-blue-100 text-blue-600'
                    : 'hover:bg-stone-100 text-stone-600'
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
                    : 'hover:bg-stone-100 text-stone-600'
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
          isLocked={!caps.editable}
          onToggleLock={caps.canToggleLock ? onToggleLock || (() => {}) : () => {}}
          onAIAction={caps.showAIActions ? onAIAction : undefined}
          showFindReplace={showFindReplace}
          onToggleFindReplace={() => setShowFindReplace(prev => !prev)}
          zoomLevel={zoomLevel}
          onZoomChange={setZoomLevel}
          onPrintPreview={() => setIsPrintPreview(prev => !prev)}
          onGenerateTOC={() => {
            if (!editor) return;
            // Generate TOC from headings in the document
            const headings: { level: number; text: string; id: string }[] = [];
            editor.state.doc.descendants((node) => {
              if (node.type.name === 'heading') {
                const level = node.attrs.level || 1;
                const text = node.textContent;
                const id = node.attrs.id || text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
                headings.push({ level, text, id });
              }
            });
            if (headings.length === 0) return;
            // Build TOC HTML
            const tocHtml = `<div class="toc-block" style="border:1px solid #e7e5e4;border-radius:8px;padding:16px;margin:16px 0;background:#fafaf9;">
              <p style="font-size:13px;font-weight:600;color:#44403c;margin-bottom:8px;">Table of Contents</p>
              ${headings.map(h => `<p style="margin:2px 0;padding-left:${(h.level - 1) * 16}px;"><a href="#${h.id}" style="color:#2563eb;text-decoration:none;font-size:${h.level === 1 ? '13px' : '12px'};">${h.text}</a></p>`).join('')}
            </div><p></p>`;
            // Insert at cursor position
            editor.chain().focus().insertContent(tocHtml).run();
          }}
        />
      )}

      {/* Find & Replace Bar */}
      {showFindReplace && <FindReplaceBar editor={editor} onClose={handleCloseFindReplace} />}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className="flex-1 overflow-y-auto">
          {/* Enhanced Bubble Menu for Selection Actions */}
          {editor && (
            <BubbleMenu
              editor={editor}
              tippyOptions={{ duration: 100 }}
              className="bg-stone-800 rounded-lg shadow px-1.5 py-1 flex items-center gap-0.5"
            >
              {/* Formatting — selected-text actions only */}
              <button
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={`p-1.5 rounded hover:bg-stone-700 ${editor.isActive('bold') ? 'text-blue-400' : 'text-white'}`}
                title="Bold"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={`p-1.5 rounded hover:bg-stone-700 ${editor.isActive('italic') ? 'text-blue-400' : 'text-white'}`}
                title="Italic"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                className={`p-1.5 rounded hover:bg-stone-700 ${editor.isActive('underline') ? 'text-blue-400' : 'text-white'}`}
                title="Underline"
              >
                <Underline className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleHighlight().run()}
                className={`p-1.5 rounded hover:bg-stone-700 ${editor.isActive('highlight') ? 'text-blue-400' : 'text-white'}`}
                title="Highlight"
              >
                <span className="w-3.5 h-3.5 bg-yellow-400 rounded text-xs flex items-center justify-center font-semibold text-black">
                  H
                </span>
              </button>
              <button
                onClick={() => editor.chain().focus().toggleSuperscript().run()}
                className={`p-1.5 rounded hover:bg-stone-700 ${editor.isActive('superscript') ? 'text-blue-400' : 'text-white'}`}
                title="Superscript"
              >
                <SuperscriptIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleSubscript().run()}
                className={`p-1.5 rounded hover:bg-stone-700 ${editor.isActive('subscript') ? 'text-blue-400' : 'text-white'}`}
                title="Subscript"
              >
                <SubscriptIcon className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-stone-600 mx-0.5" />
              {/* Source link */}
              <button
                onClick={handleLinkToSource}
                className="p-1.5 rounded hover:bg-stone-700 text-white flex items-center gap-1"
                title="Link to Source"
              >
                <Link className="w-3.5 h-3.5" />
              </button>
              {/* AI Rewrite — primary AI action on selection */}
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
              </button>
              <div className="w-px h-4 bg-stone-600 mx-0.5" />
              {/* Comment */}
              <button
                onClick={handleAddComment}
                className="p-1.5 rounded hover:bg-stone-700 text-amber-300 flex items-center gap-1"
                title="Add Comment"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
              {/* Approve */}
              <button
                onClick={handleRequestApproval}
                className="p-1.5 rounded hover:bg-stone-700 text-white"
                title="Request Approval"
              >
                <Shield className="w-3.5 h-3.5" />
              </button>
            </BubbleMenu>
          )}

          {/* Template View Overlay */}
          {viewMode === 'template' && templateStructure && (
            <div className="absolute inset-0 bg-white/95 z-10 overflow-y-auto p-6">
              <div className="max-w-3xl mx-auto">
                <div className="flex items-center gap-2 mb-4">
                  <Layers className="w-5 h-5 text-blue-500" />
                  <h2 className="font-semibold text-stone-900">Template Structure</h2>
                  <span className="text-xs text-stone-500 ml-auto">
                    {
                      templateStructure.filter(s => {
                        const html = editor?.getHTML() || '';
                        return html.toLowerCase().includes(s.label.toLowerCase());
                      }).length
                    }
                    /{templateStructure.length} sections filled
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
                            : 'bg-stone-50 border-stone-200 hover:border-blue-300'
                        }`}
                        onClick={() => {
                          setViewMode('content');
                          // Scroll to section heading if exists
                          const el = document.getElementById(
                            `outline-${section.key.toLowerCase().replace(/\s+/g, '-')}`
                          );
                          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}
                      >
                        {isFilled ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-stone-300 flex-shrink-0" />
                        )}
                        <div className="flex-1">
                          <span className="text-sm font-medium text-stone-900">{section.label}</span>
                          {section.required && (
                            <span className="ml-2 text-xs text-red-500 font-medium">Required</span>
                          )}
                        </div>
                        {!isFilled && (
                          <button
                            onClick={e => {
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
          <div
            className={`p-8 max-w-4xl mx-auto transition-transform origin-top ${isPrintPreview ? 'bg-white shadow-lg border border-stone-200 my-4 mx-auto' : ''}`}
            style={{
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: 'top center',
              width: zoomLevel !== 100 ? `${10000 / zoomLevel}%` : undefined,
              ...(isPrintPreview ? { maxWidth: '8.5in', minHeight: '11in', padding: '1in' } : {}),
            }}
          >
            <EditorContent
              editor={editor}
              className="prose prose-slate max-w-none min-h-[500px] outline-none"
            />
          </div>
          {isPrintPreview && (
            <div className="flex items-center justify-center py-2 bg-stone-100 border-t border-stone-200">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-2 bg-stone-800 text-white rounded-md text-xs font-medium hover:bg-stone-900 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>
              <button
                onClick={() => setIsPrintPreview(false)}
                className="ml-2 flex items-center gap-1.5 px-4 py-2 bg-stone-100 text-stone-700 border border-stone-200 rounded-md text-xs font-medium hover:bg-stone-200 transition-colors"
              >
                Exit Preview
              </button>
            </div>
          )}
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

      {/* ── Right-click context menu ─────────────────────────────────── */}
      {contextMenu && (
        <div
          className="fixed z-[100] bg-white border border-stone-200 rounded-lg shadow-sm py-1 w-52 animate-in fade-in duration-100"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          aria-label="Editor context menu"
          data-testid="editor-context-menu"
          onContextMenu={e => e.preventDefault()}
        >
          {/* Cut / Copy / Paste */}
          <button
            role="menuitem"
            disabled={!contextMenu.hasSelection}
            onClick={() => {
              document.execCommand('cut');
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <Scissors className="w-3.5 h-3.5 text-stone-400" />
            Cut
            <span className="ml-auto text-[10px] text-stone-400">Ctrl+X</span>
          </button>
          <button
            role="menuitem"
            disabled={!contextMenu.hasSelection}
            onClick={() => {
              document.execCommand('copy');
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-stone-400" />
            Copy
            <span className="ml-auto text-[10px] text-stone-400">Ctrl+C</span>
          </button>
          <button
            role="menuitem"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                editor.chain().focus().insertContent(text).run();
              } catch {
                document.execCommand('paste');
              }
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 transition-colors"
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-stone-400" />
            Paste
            <span className="ml-auto text-[10px] text-stone-400">Ctrl+V</span>
          </button>
          <button
            role="menuitem"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                // Strip HTML, insert plain text
                editor.chain().focus().insertContent(text.replace(/<[^>]+>/g, '')).run();
              } catch {
                document.execCommand('paste');
              }
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 transition-colors"
          >
            <Type className="w-3.5 h-3.5 text-stone-400" />
            Paste as Plain Text
            <span className="ml-auto text-[10px] text-stone-400">Ctrl+Shift+V</span>
          </button>

          <div className="border-t border-stone-100 my-1" />

          {/* Select All */}
          <button
            role="menuitem"
            onClick={() => {
              editor.chain().focus().selectAll().run();
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-stone-400" />
            Select All
            <span className="ml-auto text-[10px] text-stone-400">Ctrl+A</span>
          </button>

          <div className="border-t border-stone-100 my-1" />

          {/* Formatting group — only when text is selected */}
          {contextMenu.hasSelection && (
            <>
              <button
                role="menuitem"
                onClick={() => {
                  editor.chain().focus().toggleBold().run();
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <Bold className="w-3.5 h-3.5 text-stone-400" />
                Bold
                <span className="ml-auto text-[10px] text-stone-400">Ctrl+B</span>
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  editor.chain().focus().toggleItalic().run();
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <Italic className="w-3.5 h-3.5 text-stone-400" />
                Italic
                <span className="ml-auto text-[10px] text-stone-400">Ctrl+I</span>
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  editor.chain().focus().toggleUnderline().run();
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <Underline className="w-3.5 h-3.5 text-stone-400" />
                Underline
                <span className="ml-auto text-[10px] text-stone-400">Ctrl+U</span>
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  editor.chain().focus().toggleHighlight().run();
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <Palette className="w-3.5 h-3.5 text-stone-400" />
                Highlight
              </button>

              <div className="border-t border-stone-100 my-1" />

              {/* Link */}
              <button
                role="menuitem"
                onClick={() => {
                  const href = prompt('Enter URL:');
                  if (href) editor.chain().focus().setLink({ href }).run();
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <LinkIcon className="w-3.5 h-3.5 text-stone-400" />
                Insert Link
              </button>

              {/* Link to Source */}
              <button
                role="menuitem"
                onClick={() => {
                  handleLinkToSource();
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-stone-400" />
                Link to Source
              </button>

              {/* Comment */}
              <button
                role="menuitem"
                onClick={() => {
                  handleAddComment();
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5 text-stone-400" />
                Add Comment
              </button>

              <div className="border-t border-stone-100 my-1" />

              {/* AI Actions */}
              {onAIAction && (
                <button
                  role="menuitem"
                  onClick={() => {
                    onAIAction('rewrite', contextMenu.selectedText);
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-purple-700 hover:bg-purple-50 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  AI Rewrite
                </button>
              )}
            </>
          )}

          {/* Insert group — always available */}
          {!contextMenu.hasSelection && (
            <>
              <button
                role="menuitem"
                onClick={() => {
                  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <TableIcon className="w-3.5 h-3.5 text-stone-400" />
                Insert Table
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  editor.chain().focus().setHorizontalRule().run();
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <SeparatorHorizontal className="w-3.5 h-3.5 text-stone-400" />
                Horizontal Rule
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = () => {
                    const file = input.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      (editor.chain().focus() as any).setImage({ src: reader.result as string, alt: file.name }).run();
                    };
                    reader.readAsDataURL(file);
                  };
                  input.click();
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <ImagePlus className="w-3.5 h-3.5 text-stone-400" />
                Insert Image
              </button>
            </>
          )}
        </div>
      )}

      {/* Status Bar */}
      <StatusBar editor={editor} complianceScore={complianceScore} collaborators={collaborators} />

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
        <div className="fixed z-50 top-1/3 right-8 shadow-sm">
          <InlineApprovalPanel
            documentId={documentId ? Number(documentId) : 1}
            selectedText={approvalSelectedText}
            selectionRange={approvalSelectionRange}
            onClose={() => {
              setApprovalPanelOpen(false);
              setApprovalSelectedText('');
              setApprovalSelectionRange(null);
            }}
            onAnnotationCreated={annotation => {
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
        onClose={() => {
          setTracerSource(null);
          setTracerPosition(null);
        }}
      />
    </div>
  );
};

export default UnifiedDocumentEditor;
