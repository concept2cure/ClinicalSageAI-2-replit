import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Save,
  FileSearch,
  History,
  Download,
  Share,
  ChevronLeft,
  MoreHorizontal,
  CheckSquare,
  Eye,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function SectionHeader({
  sectionId,
  sectionTitle,
  sectionStatus = 'draft',
  wordCount = 0,
  lastSaved = null,
  onBack,
  activeTab = 'edit',
  onTabChange,
  onSave,
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          {onBack && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onBack}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex items-center">
            <FileText className="h-5 w-5 mr-2 text-muted-foreground" />
            <h1 className="text-xl font-semibold flex items-center">
              {sectionId && <span className="text-muted-foreground mr-2">{sectionId}</span>}
              {sectionTitle}
            </h1>
          </div>
          <StatusBadge status={sectionStatus} />
        </div>
        <div className="flex items-center space-x-2">
          <div className="text-sm text-muted-foreground mr-2">
            {wordCount > 0 && <span>{wordCount.toLocaleString()} words</span>}
            {lastSaved && wordCount > 0 && <span className="mx-1">·</span>}
            {lastSaved && <span>Last saved {formatLastSaved(lastSaved)}</span>}
          </div>
          <Button variant="default" size="sm" onClick={onSave} className="gap-1">
            <Save className="h-4 w-4" />
            Save
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Document Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <History className="h-4 w-4 mr-2" />
                View History
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Download className="h-4 w-4 mr-2" />
                Export as Word
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Share className="h-4 w-4 mr-2" />
                Share for Review
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CheckSquare className="h-4 w-4 mr-2" />
                Mark as Complete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs
        defaultValue={activeTab}
        value={activeTab}
        onValueChange={onTabChange}
        className="w-full"
      >
        <TabsList className="grid grid-cols-4 w-full max-w-md">
          <TabsTrigger value="edit">
            <FileText className="h-4 w-4 mr-2" />
            Edit
          </TabsTrigger>
          <TabsTrigger value="template">
            <FileSearch className="h-4 w-4 mr-2" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="guidance">
            <FileSearch className="h-4 w-4 mr-2" />
            Guidance
          </TabsTrigger>
          <TabsTrigger value="review">
            <FileSearch className="h-4 w-4 mr-2" />
            Review
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

function StatusBadge({ status }) {
  const statusMap = {
    draft: { label: 'Draft', variant: 'outline' },
    review: { label: 'In Review', variant: 'default' },
    approved: { label: 'Approved', variant: 'success' },
    rejected: { label: 'Rejected', variant: 'destructive' },
    published: { label: 'Published', variant: 'default' },
  };

  const config = statusMap[status] || statusMap.draft;

  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function formatLastSaved(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) {
    return 'just now';
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  } else {
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }
}
