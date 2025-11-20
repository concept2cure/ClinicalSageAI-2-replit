import React, { useEffect, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { Highlight } from '@tiptap/extension-highlight';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import CharacterCount from '@tiptap/extension-character-count';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Table as TableIcon,
  Highlighter,
  Undo,
  Redo,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Code,
  Quote,
  Minus,
  CheckSquare,
  Eye,
  Edit3
} from 'lucide-react';

/**
 * Rich Text Editor for FDA 510(k) and Medical Device Regulatory Documents
 * 
 * Features Microsoft Word-like editing capabilities:
 * - Text formatting (bold, italic, underline, headings)
 * - Lists (bulleted, numbered, task lists)
 * - Tables for specifications and test data
 * - Highlighting for important regulatory statements
 * - Character and word count
 */
const RegulatoryRichTextEditor = ({
  value = '',
  onChange,
  placeholder = 'Enter content...',
  className = '',
  minHeight = '200px',
  maxHeight = '600px',
  showToolbar = true,
  showWordCount = true,
  readOnly = false,
  label = '',
  fieldId = ''
}) => {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse border border-gray-300 w-full my-4',
        },
      }),
      TableRow.configure({
        HTMLAttributes: {
          class: 'border border-gray-300',
        },
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class: 'border border-gray-300 bg-gray-100 p-2 font-semibold text-left',
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: 'border border-gray-300 p-2',
        },
      }),
      Highlight.configure({
        multicolor: true,
        HTMLAttributes: {
          class: 'bg-yellow-200 px-1',
        },
      }),
      TaskList.configure({
        HTMLAttributes: {
          class: 'list-none pl-0',
        },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: 'flex items-start gap-2',
        },
      }),
      CharacterCount,
      TextStyle,
      Color,
    ],
    content: value || '',
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (onChange) {
        onChange(html);
      }
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none p-4',
          'bg-white text-gray-900',
          'border border-gray-300 rounded-md',
          readOnly ? 'cursor-default bg-gray-50' : '',
        ),
        style: `min-height: ${minHeight}; max-height: ${maxHeight}; overflow-y: auto;`,
        'data-testid': `editor-${fieldId}`,
      },
    },
  });

  // Update editor content when value prop changes
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '');
    }
  }, [value, editor]);

  if (!editor) {
    return <div>Loading editor...</div>;
  }

  const ToolbarButton = ({ onClick, active, disabled, children, title }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled || readOnly}
      className={cn(
        'h-8 w-8 p-0 text-gray-700 hover:bg-gray-100',
        active ? 'bg-gray-200' : ''
      )}
      title={title}
      data-testid={`toolbar-${title?.toLowerCase().replace(/\s/g, '-')}`}
    >
      {children}
    </Button>
  );

  return (
    <div className={cn('w-full', className)} data-testid={`rich-text-editor-${fieldId}`}>
      {label && (
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">
            {label}
          </label>
          {/* Preview/Edit Toggle */}
          <Button
            type="button"
            variant={isPreviewMode ? "default" : "outline"}
            size="sm"
            onClick={() => setIsPreviewMode(!isPreviewMode)}
            className="flex items-center gap-2"
            data-testid={`toggle-preview-${fieldId}`}
          >
            {isPreviewMode ? (
              <>
                <Edit3 className="h-4 w-4" />
                Edit Mode
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                Preview
              </>
            )}
          </Button>
        </div>
      )}

      {showToolbar && !readOnly && !isPreviewMode && (
        <div className="border border-gray-300 rounded-t-md bg-gray-50 p-2 flex flex-wrap gap-1 items-center">
          {/* Text Formatting */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            title="Bold"
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            title="Italic"
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive('strike')}
            title="Strikethrough"
          >
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            active={editor.isActive('highlight')}
            title="Highlight"
          >
            <Highlighter className="h-4 w-4" />
          </ToolbarButton>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Headings */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })}
            title="Heading 1"
          >
            <Heading1 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            title="Heading 2"
          >
            <Heading2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })}
            title="Heading 3"
          >
            <Heading3 className="h-4 w-4" />
          </ToolbarButton>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Lists */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            title="Bullet List"
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            title="Numbered List"
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            active={editor.isActive('taskList')}
            title="Task List"
          >
            <CheckSquare className="h-4 w-4" />
          </ToolbarButton>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Table */}
          <ToolbarButton
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
            title="Insert Table"
          >
            <TableIcon className="h-4 w-4" />
          </ToolbarButton>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Block Elements */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive('blockquote')}
            title="Quote"
          >
            <Quote className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            active={editor.isActive('codeBlock')}
            title="Code Block"
          >
            <Code className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Horizontal Rule"
          >
            <Minus className="h-4 w-4" />
          </ToolbarButton>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Undo/Redo */}
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo"
          >
            <Undo className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo"
          >
            <Redo className="h-4 w-4" />
          </ToolbarButton>
        </div>
      )}

      {/* Bubble Menu for text selection */}
      {editor && !readOnly && (
        <BubbleMenu
          editor={editor}
          options={{ offset: 6, placement: 'top' }}
          className="flex gap-1 p-1 bg-white border border-gray-300 rounded-md shadow-lg"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn(
              'h-6 w-6 p-0 text-gray-700 hover:bg-gray-100',
              editor.isActive('bold') ? 'bg-gray-200' : ''
            )}
          >
            <Bold className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn(
              'h-6 w-6 p-0 text-gray-700 hover:bg-gray-100',
              editor.isActive('italic') ? 'bg-gray-200' : ''
            )}
          >
            <Italic className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            className={cn(
              'h-6 w-6 p-0 text-gray-700 hover:bg-gray-100',
              editor.isActive('highlight') ? 'bg-gray-200' : ''
            )}
          >
            <Highlighter className="h-3 w-3" />
          </Button>
        </BubbleMenu>
      )}

      {/* Editor or Preview Mode */}
      {isPreviewMode ? (
        <div 
          className={cn(
            'prose prose-sm max-w-none p-6',
            'bg-white text-gray-900',
            'border border-gray-300 rounded-md shadow-sm',
            'regulatory-document-preview'
          )}
          style={{ minHeight, maxHeight, overflowY: 'auto' }}
          data-testid={`preview-${fieldId}`}
          dangerouslySetInnerHTML={{ __html: value || '<p class="text-gray-400 italic">No content to preview</p>' }}
        />
      ) : (
        <EditorContent editor={editor} className={showToolbar && !readOnly ? 'rounded-t-none' : 'rounded-md'} />
      )}

      {showWordCount && !isPreviewMode && (
        <div className="mt-2 text-xs text-gray-500 flex justify-between">
          <span>{editor.storage.characterCount.words()} words</span>
          <span>{editor.storage.characterCount.characters()} characters</span>
        </div>
      )}
    </div>
  );
};

export default RegulatoryRichTextEditor;
