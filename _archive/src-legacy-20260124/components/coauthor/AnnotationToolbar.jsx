import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  MessageSquare,
  Edit,
  Type,
  Highlighter,
  AlignLeft,
  Check,
  X,
  Plus,
  Move,
  Undo,
  Redo,
} from 'lucide-react';

export default function AnnotationToolbar({ submissionId }) {
  const [activeMode, setActiveMode] = useState('view');
  const [selectedTool, setSelectedTool] = useState(null);

  const handleToolClick = tool => {
    if (activeMode === 'annotate') {
      setSelectedTool(selectedTool === tool ? null : tool);
    }
  };

  return (
    <div className="border rounded-md shadow-sm p-1 flex items-center justify-between my-4">
      <div className="flex items-center space-x-2">
        <Tabs defaultValue="view" className="w-auto" onValueChange={setActiveMode}>
          <TabsList className="grid grid-cols-2 h-8">
            <TabsTrigger value="view" className="text-xs px-3">
              View
            </TabsTrigger>
            <TabsTrigger value="annotate" className="text-xs px-3">
              Annotate
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="h-6 border-r mx-1"></div>

        {/* Annotation Tools */}
        <Button
          variant={selectedTool === 'comment' && activeMode === 'annotate' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => handleToolClick('comment')}
          disabled={activeMode !== 'annotate'}
        >
          <MessageSquare className="h-4 w-4" />
        </Button>

        <Button
          variant={selectedTool === 'edit' && activeMode === 'annotate' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => handleToolClick('edit')}
          disabled={activeMode !== 'annotate'}
        >
          <Edit className="h-4 w-4" />
        </Button>

        <Button
          variant={
            selectedTool === 'highlight' && activeMode === 'annotate' ? 'secondary' : 'ghost'
          }
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => handleToolClick('highlight')}
          disabled={activeMode !== 'annotate'}
        >
          <Highlighter className="h-4 w-4" />
        </Button>

        <Button
          variant={selectedTool === 'text' && activeMode === 'annotate' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => handleToolClick('text')}
          disabled={activeMode !== 'annotate'}
        >
          <Type className="h-4 w-4" />
        </Button>

        <div className="h-6 border-r mx-1"></div>

        {/* View Options */}
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <AlignLeft className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <Move className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center space-x-1">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Undo">
          <Undo className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Redo">
          <Redo className="h-4 w-4" />
        </Button>

        <div className="h-6 border-r mx-1"></div>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={activeMode !== 'annotate'}
        >
          <Check className="h-3.5 w-3.5" />
          <span>Save</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={activeMode !== 'annotate'}
        >
          <X className="h-3.5 w-3.5" />
          <span>Cancel</span>
        </Button>

        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          <span>Add Section</span>
        </Button>
      </div>
    </div>
  );
}
