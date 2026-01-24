// client/src/components/search/SemanticSearchResults.jsx
import React from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  FileText,
  FileSearch,
  Calendar,
  Globe,
  Tag,
  Check,
  Clock,
  Download,
  ExternalLink,
  Eye,
  Share2,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Component to display semantic search results with AI-generated summaries
 */
export default function SemanticSearchResults({
  results = null,
  isLoading = false,
  onSelectDocument = () => {},
  className = '',
}) {
  const { toast } = useToast();

  // Handle actions on documents
  const handleAction = (action, document) => {
    console.log(`Action ${action} on document:`, document);
    toast({
      title: `Document ${action}`,
      description: `${action} for "${document.title}"`,
    });
  };

  // Format document dates
  const formatDate = dateString => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Get document type info (icon and color)
  const getDocTypeInfo = type => {
    switch (type) {
      case 'report':
        return { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' };
      case 'protocol':
        return { icon: FileSearch, color: 'text-emerald-500', bg: 'bg-emerald-50' };
      case 'submission':
        return { icon: Check, color: 'text-purple-500', bg: 'bg-purple-50' };
      case 'correspondence':
        return { icon: MessageSquare, color: 'text-amber-500', bg: 'bg-amber-50' };
      case 'sop':
        return { icon: FileText, color: 'text-gray-500', bg: 'bg-gray-50' };
      default:
        return { icon: FileText, color: 'text-gray-500', bg: 'bg-gray-50' };
    }
  };

  // Get module info (color and label)
  const getModuleInfo = module => {
    switch (module) {
      case 'ind':
        return { color: 'text-indigo-600 bg-indigo-50 border-indigo-200', label: 'IND' };
      case 'csr':
        return { color: 'text-emerald-600 bg-emerald-50 border-emerald-200', label: 'CSR' };
      case 'regulatory':
        return { color: 'text-blue-600 bg-blue-50 border-blue-200', label: 'Regulatory' };
      case 'quality':
        return { color: 'text-amber-600 bg-amber-50 border-amber-200', label: 'Quality' };
      default:
        return { color: 'text-gray-600 bg-gray-50 border-gray-200', label: module.toUpperCase() };
    }
  };

  // Get region info (icon and label)
  const getRegionInfo = region => {
    switch (region) {
      case 'us':
        return { label: 'US', icon: Globe };
      case 'eu':
        return { label: 'EU', icon: Globe };
      case 'jp':
        return { label: 'Japan', icon: Globe };
      case 'global':
        return { label: 'Global', icon: Globe };
      default:
        return { label: region.toUpperCase(), icon: Globe };
    }
  };

  // Get relevance class for styling
  const getRelevanceClass = relevance => {
    if (relevance > 0.9) return 'text-green-600';
    if (relevance > 0.8) return 'text-emerald-600';
    if (relevance > 0.7) return 'text-blue-600';
    if (relevance > 0.5) return 'text-amber-600';
    return 'text-gray-600';
  };

  // Render document status
  const renderStatus = status => {
    switch (status) {
      case 'final':
        return (
          <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-200">
            Final
          </Badge>
        );
      case 'draft':
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-800 hover:bg-amber-100">
            Draft
          </Badge>
        );
      case 'in-progress':
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-800 hover:bg-blue-100">
            In Progress
          </Badge>
        );
      case 'approved':
        return (
          <Badge variant="default" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200">
            Approved
          </Badge>
        );
      case 'submitted':
        return (
          <Badge variant="default" className="bg-purple-100 text-purple-800 hover:bg-purple-200">
            Submitted
          </Badge>
        );
      case 'effective':
        return (
          <Badge variant="default" className="bg-indigo-100 text-indigo-800 hover:bg-indigo-200">
            Effective
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // If no search has been performed yet
  if (!results && !isLoading) {
    return (
      <div className={`p-8 text-center ${className}`}>
        <FileSearch className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-1">Search Across All Content</h3>
        <p className="text-gray-500 mb-4 max-w-lg mx-auto">
          Use the search bar above to find documents, data, communications, and more across all
          modules. Search using natural language like "critical deviations in EU in Q1" for best
          results.
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={`p-8 text-center ${className}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">Searching All Content</h3>
        <p className="text-gray-500">Analyzing your query using AI-powered semantic search...</p>
      </div>
    );
  }

  // No results found
  if (results?.results?.length === 0) {
    return (
      <div className={`p-8 text-center ${className}`}>
        <FileSearch className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-1">No Documents Found</h3>
        <p className="text-gray-500 mb-4">
          We couldn't find any documents matching your search. Try broadening your search terms or
          removing some filters.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* AI-generated summary */}
      {results?.summary && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <FileSearch className="h-4 w-4 mr-2 text-primary" />
              AI Search Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{results.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Results count */}
      <div className="text-sm text-gray-500">
        Found {results?.totalResults} results using{' '}
        {results?.searchMode === 'semantic' ? 'AI-powered semantic search' : 'keyword search'}
      </div>

      {/* Results list */}
      <div className="space-y-4">
        {results?.results?.map(document => {
          const docType = getDocTypeInfo(document.type);
          const DocTypeIcon = docType.icon;
          const moduleInfo = getModuleInfo(document.module);
          const regionInfo = getRegionInfo(document.region);
          const RegionIcon = regionInfo.icon;

          return (
            <Card key={document.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardHeader className="pb-2 relative">
                {/* Relevance indicator bar */}
                <div
                  className="absolute top-0 left-0 h-1 bg-primary"
                  style={{ width: `${document.relevance * 100}%` }}
                ></div>

                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {/* Document type icon */}
                    <div className={`p-2 rounded-full ${docType.bg}`}>
                      <DocTypeIcon className={`h-5 w-5 ${docType.color}`} />
                    </div>

                    {/* Title and metadata */}
                    <div>
                      <CardTitle
                        className="text-base font-medium hover:text-primary cursor-pointer"
                        onClick={() => onSelectDocument(document)}
                      >
                        {document.title}
                      </CardTitle>

                      <div className="flex flex-wrap gap-2 mt-2">
                        {/* Module badge */}
                        <Badge variant="outline" className={moduleInfo.color}>
                          {moduleInfo.label}
                        </Badge>

                        {/* Document type */}
                        <Badge variant="outline" className="bg-gray-50">
                          {document.type.charAt(0).toUpperCase() + document.type.slice(1)}
                        </Badge>

                        {/* Status */}
                        {renderStatus(document.status)}

                        {/* Region */}
                        <Badge variant="outline" className="bg-blue-50 text-blue-800">
                          <RegionIcon className="h-3 w-3 mr-1" />
                          {regionInfo.label}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Relevance score */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`text-xs font-mono rounded-full px-2 py-1 ${getRelevanceClass(document.relevance)} bg-opacity-10 flex items-center`}
                        >
                          {Math.round(document.relevance * 100)}%
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Relevance score based on your search query</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </CardHeader>

              <CardContent>
                {/* Document preview/content */}
                <p className="text-sm text-gray-600 line-clamp-2">{document.content}</p>

                <div className="flex items-center mt-3 text-xs text-gray-500">
                  {/* Date */}
                  <div className="flex items-center mr-4">
                    <Calendar className="h-3 w-3 mr-1" />
                    {formatDate(document.date)}
                  </div>

                  {/* Tags */}
                  <div className="flex items-center">
                    <Tag className="h-3 w-3 mr-1" />
                    <div className="flex gap-1 flex-wrap">
                      {document.tags.map((tag, index) => (
                        <span key={index} className="rounded-full bg-gray-100 px-2 py-0.5 mr-1">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex justify-between pt-0">
                <div className="text-xs text-gray-500 flex items-center">
                  <Clock className="h-3 w-3 mr-1" />
                  Last modified: {formatDate(document.date)}
                </div>

                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handleAction('preview', document)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handleAction('download', document)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handleAction('share', document)}
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handleAction('open', document)}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
