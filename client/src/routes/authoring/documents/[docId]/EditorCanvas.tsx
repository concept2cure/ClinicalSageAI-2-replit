import React, { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { Highlight } from '@tiptap/extension-highlight';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Mention } from '@tiptap/extension-mention';
import CharacterCount from '@tiptap/extension-character-count';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import {
  Bold,
  Italic,
  List,
  Table2,
  Plus,
  AlertCircle,
  CheckCircle,
  Info,
  Quote,
  Code,
  Link,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { ValidationPlugin } from '../plugins/validationPlugin';
import { CitationsPlugin } from '../plugins/citationsPlugin';
import { PlaceholdersPlugin } from '../plugins/placeholdersPlugin';
import { RedlinePlugin } from '../plugins/redlinePlugin';
import { RegionTerminologyPlugin } from '../plugins/regionTerminologyPlugin';

interface EditorCanvasProps {
  content: string;
  onChange: (content: string) => void;
  region: 'FDA' | 'EMA' | 'PMDA' | 'WHO';
  documentId: string;
  productName: string;
}

interface ValidationIssue {
  id: string;
  level: 'error' | 'warning' | 'info';
  message: string;
  section: string;
  line?: number;
  suggestions?: string[];
}

export default function EditorCanvas({
  content,
  onChange,
  region,
  documentId,
  productName,
}: EditorCanvasProps) {
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const { toast } = useToast();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Highlight.configure({
        multicolor: true,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        suggestion: {
          items: ({ query }) => {
            return [
              'FDA',
              'EMA',
              'PMDA',
              'WHO',
              'ICH',
              'GMP',
              'GLP',
              'GCP',
              'API',
              'CMC',
              productName,
            ]
              .filter(item => item.toLowerCase().startsWith(query.toLowerCase()))
              .slice(0, 5);
          },
        },
      }),
      CharacterCount,
      // Custom plugins for CMC features
      ValidationPlugin.configure({
        region,
        onValidationUpdate: setValidationIssues,
        onValidationStart: () => setIsValidating(true),
        onValidationComplete: () => setIsValidating(false),
      }),
      CitationsPlugin,
      PlaceholdersPlugin.configure({
        productName,
        region,
      }),
      RedlinePlugin,
      RegionTerminologyPlugin.configure({
        region,
      }),
    ],
    content: content || getInitialTemplate(region),
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm sm:prose-base lg:prose-lg xl:prose-xl mx-auto focus:outline-none min-h-[400px] p-6',
        'data-testid': 'tiptap-editor',
      },
    },
  });

  // Listen for section navigation events
  useEffect(() => {
    const handleNavigateToSection = (event: CustomEvent) => {
      const { sectionId } = event.detail;
      // Scroll to section or create it if it doesn't exist
      const element = document.querySelector(`[data-section="${sectionId}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    };

    window.addEventListener('navigateToSection', handleNavigateToSection as EventListener);
    return () => {
      window.removeEventListener('navigateToSection', handleNavigateToSection as EventListener);
    };
  }, []);

  // Auto-validation on content change
  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      const timeout = setTimeout(() => {
        validateContent();
      }, 1000); // Debounce validation

      return () => clearTimeout(timeout);
    }
  }, [content, region]);

  const validateContent = async () => {
    if (!editor) return;

    try {
      setIsValidating(true);

      const response = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId: documentId,
          content: editor.getHTML(),
          region,
          section: 'current',
        }),
      });

      if (response.ok) {
        const issues = await response.json();
        setValidationIssues(issues);
      }
    } catch (error) {
    } finally {
      setIsValidating(false);
    }
  };

  const insertStructuredBlock = (blockType: string) => {
    if (!editor) return;

    let content = '';
    switch (blockType) {
      case 'spec-table':
        content = `<div class="structured-block spec-table" data-block-type="spec-table">
          <h4>Specification Table</h4>
          <table>
            <thead>
              <tr><th>Test</th><th>Acceptance Criteria</th><th>Method</th></tr>
            </thead>
            <tbody>
              <tr><td>Assay</td><td>95.0% - 105.0%</td><td>HPLC</td></tr>
            </tbody>
          </table>
        </div>`;
        break;
      case 'stability-summary':
        content = `<div class="structured-block stability-summary" data-block-type="stability-summary">
          <h4>Stability Summary</h4>
          <p><strong>Storage Condition:</strong> 25°C/60% RH</p>
          <p><strong>Duration:</strong> 24 months</p>
          <p><strong>Conclusion:</strong> Product remains stable under proposed storage conditions.</p>
        </div>`;
        break;
      default:
        return;
    }

    editor.chain().focus().insertContent(content).run();
  };

  const getValidationBadgeIcon = (level: ValidationIssue['level']) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="h-3 w-3" />;
      case 'warning':
        return <AlertCircle className="h-3 w-3" />;
      case 'info':
        return <Info className="h-3 w-3" />;
      default:
        return <CheckCircle className="h-3 w-3" />;
    }
  };

  if (!editor) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative" data-testid="editor-canvas">
      {/* Validation Status Bar */}
      {(validationIssues.length > 0 || isValidating) && (
        <div className="border-b bg-muted/50 px-4 py-2 flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2">
            {isValidating ? (
              <>
                <div className="animate-spin rounded-full h-3 w-3 border-b border-primary" />
                <span>Validating...</span>
              </>
            ) : (
              <>
                <span className="flex items-center space-x-1">
                  {getValidationBadgeIcon(validationIssues[0]?.level || 'info')}
                  <span>
                    {validationIssues.length} validation issue
                    {validationIssues.length !== 1 ? 's' : ''}
                  </span>
                </span>
              </>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={validateContent}
            data-testid="button-validate"
          >
            Re-validate
          </Button>
        </div>
      )}

      {/* Bubble Menu */}
      <BubbleMenu
        editor={editor}
        tippyOptions={{ duration: 100 }}
        className="bg-background border rounded-lg shadow-lg p-1"
      >
        <div className="flex items-center space-x-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn(editor.isActive('bold') && 'bg-accent')}
            data-testid="format-bold"
          >
            <Bold className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn(editor.isActive('italic') && 'bg-accent')}
            data-testid="format-italic"
          >
            <Italic className="h-4 w-4" />
          </Button>

          <Separator orientation="vertical" className="h-6" />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            className={cn(editor.isActive('highlight') && 'bg-accent')}
            data-testid="format-highlight"
          >
            <span className="bg-yellow-200 px-1 rounded text-xs">H</span>
          </Button>
        </div>
      </BubbleMenu>

      {/* Floating Menu */}
      <FloatingMenu
        editor={editor}
        tippyOptions={{ duration: 100 }}
        className="bg-background border rounded-lg shadow-lg p-1"
      >
        <div className="flex items-center space-x-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => insertStructuredBlock('spec-table')}
            data-testid="insert-spec-table"
          >
            <Table2 className="h-4 w-4 mr-1" />
            Spec Table
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => insertStructuredBlock('stability-summary')}
            data-testid="insert-stability"
          >
            <Plus className="h-4 w-4 mr-1" />
            Stability
          </Button>
        </div>
      </FloatingMenu>

      {/* Editor Content */}
      <div className="flex-1 overflow-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>

      {/* Footer with Stats */}
      <div className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground flex items-center justify-between">
        <div>
          Region: <span className="font-medium">{region}</span> • Product:{' '}
          <span className="font-medium">{productName}</span>
        </div>

        <div>
          {editor.storage.characterCount.characters()} characters •
          {editor.storage.characterCount.words()} words
        </div>
      </div>
    </div>
  );
}

function getInitialTemplate(region: string): string {
  return `
    <div data-section="3.2.P.1">
      <h2>3.2.P.1 Description and Composition</h2>
      <p>{{DRUG_PRODUCT_NAME}} is a {{DOSAGE_FORM}} containing {{API_NAME}} as the active pharmaceutical ingredient.</p>

      <h3>Composition</h3>
      <p>Each {{DOSAGE_UNIT}} contains:</p>
      <ul>
        <li>{{API_NAME}}: {{API_STRENGTH}}</li>
        <li>Excipients as listed in the specification</li>
      </ul>
    </div>

    <div data-section="3.2.P.2">
      <h2>3.2.P.2 Pharmaceutical Development</h2>
      <p>The pharmaceutical development of {{DRUG_PRODUCT_NAME}} followed systematic approaches in accordance with ${region === 'FDA' ? 'FDA' : 'ICH'} guidelines.</p>

      <h3>Formulation Development</h3>
      <p>The formulation was developed to ensure:</p>
      <ul>
        <li>Product quality and stability</li>
        <li>Bioavailability and bioequivalence</li>
        <li>Manufacturing feasibility</li>
      </ul>
    </div>
  `;
}
