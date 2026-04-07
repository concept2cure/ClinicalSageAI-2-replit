/**
 * Search Suggestions Component
 * Displays categorized search suggestions with intelligent grouping
 * Features icons, badges, and keyboard navigation
 */

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  FileText, 
  User, 
  Package, 
  GitBranch, 
  Hash,
  Book,
  ArrowRight,
  Search,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Eye,
  Loader2,
  FileIcon,
  Users,
  Building,
  Shield,
  Table,
  Presentation
} from 'lucide-react';

// Helper function to get file icon based on type
function getFileIcon(type, fileName) {
  const name = fileName?.toLowerCase() || '';
  const typeStr = type?.toLowerCase() || '';
  
  if (typeStr.includes('word') || name.endsWith('.docx') || name.endsWith('.doc')) {
    return <FileText className="h-4 w-4 text-blue-600" />;
  }
  if (typeStr.includes('excel') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return <Table className="h-4 w-4 text-green-600" />;
  }
  if (typeStr.includes('powerpoint') || name.endsWith('.pptx') || name.endsWith('.ppt')) {
    return <Presentation className="h-4 w-4 text-orange-600" />;
  }
  if (typeStr.includes('pdf') || name.endsWith('.pdf')) {
    return <FileText className="h-4 w-4 text-red-600" />;
  }
  return <FileIcon className="h-4 w-4 text-slate-500" />;
}

// Helper function to get status icon and color
function getStatusConfig(status) {
  const statusLower = status?.toLowerCase() || '';
  
  if (statusLower.includes('approved') || statusLower.includes('complete')) {
    return {
      icon: <CheckCircle className="h-3 w-3" />,
      color: 'text-green-600 bg-green-50 border-green-200'
    };
  }
  if (statusLower.includes('pending') || statusLower.includes('review')) {
    return {
      icon: <Clock className="h-3 w-3" />,
      color: 'text-yellow-600 bg-yellow-50 border-yellow-200'
    };
  }
  if (statusLower.includes('rejected') || statusLower.includes('failed')) {
    return {
      icon: <XCircle className="h-3 w-3" />,
      color: 'text-red-600 bg-red-50 border-red-200'
    };
  }
  if (statusLower.includes('draft')) {
    return {
      icon: <Eye className="h-3 w-3" />,
      color: 'text-blue-600 bg-blue-50 border-blue-200'
    };
  }
  return {
    icon: <AlertCircle className="h-3 w-3" />,
    color: 'text-slate-600 bg-slate-50 border-slate-200'
  };
}

export function SearchSuggestions({ query, selectedIndex, onSelect, onClose }) {
  const [localSelectedIndex, setLocalSelectedIndex] = useState(selectedIndex);
  
  // Fetch suggestions from API
  const { data: suggestions, isLoading, error } = useQuery({
    queryKey: ['/api/coauthor/search/suggestions', query],
    queryFn: async () => {
      if (!query || query.length < 2) return null;
      
      const response = await apiRequest('POST', '/api/coauthor/search/suggestions', {
        query,
        limit: 5,
        includeCategories: ['components', 'changes', 'users', 'documents', 'regulatory']
      });
      return response.json();
    },
    enabled: !!query && query.length >= 2,
    staleTime: 30000, // Cache for 30 seconds
    retry: 1
  });

  // Update local selected index when prop changes
  useEffect(() => {
    setLocalSelectedIndex(selectedIndex);
  }, [selectedIndex]);

  // Calculate total items for keyboard navigation
  const getTotalItems = () => {
    if (!suggestions) return 0;
    let count = 0;
    Object.values(suggestions).forEach(category => {
      if (Array.isArray(category)) {
        count += category.length;
      }
    });
    return count;
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      const totalItems = getTotalItems();
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setLocalSelectedIndex(prev => 
          prev >= totalItems - 1 ? 0 : prev + 1
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setLocalSelectedIndex(prev => 
          prev <= 0 ? totalItems - 1 : prev - 1
        );
      } else if (e.key === 'Enter' && localSelectedIndex >= 0) {
        e.preventDefault();
        // Find and select the item at the current index
        let currentIndex = 0;
        Object.entries(suggestions || {}).forEach(([category, items]) => {
          if (Array.isArray(items)) {
            items.forEach(item => {
              if (currentIndex === localSelectedIndex) {
                handleItemClick(item, category);
              }
              currentIndex++;
            });
          }
        });
      } else if (e.key === 'Escape') {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [localSelectedIndex, suggestions]);

  // Handle item click
  const handleItemClick = (item, category) => {
    let searchText = item.text || item.title || item.name || item.udi || '';
    
    // Create a structured suggestion object
    const suggestion = {
      text: searchText,
      category,
      data: item
    };
    
    onSelect?.(suggestion);
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-8">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-sm text-slate-600 dark:text-slate-400">Searching...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">Failed to load suggestions</p>
        </div>
      </div>
    );
  }

  // Don't render if no suggestions
  if (!suggestions || Object.keys(suggestions).length === 0) {
    return null;
  }

  // Check if there are any results
  const hasResults = Object.values(suggestions).some(
    category => Array.isArray(category) && category.length > 0
  );

  if (!hasResults) {
    return (
      <div className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex flex-col items-center gap-2 text-slate-500">
          <Search className="h-8 w-8" />
          <p className="text-sm">No results found for "{query}"</p>
          <p className="text-xs">Try different keywords or check spelling</p>
        </div>
      </div>
    );
  }

  let currentIndex = 0;

  return (
    <div className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 max-h-[500px] overflow-hidden">
      <ScrollArea className="max-h-[450px]">
        <div className="p-2">
          {/* Components Category */}
          {suggestions.components?.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <Package className="h-3 w-3" />
                Components
              </div>
              <div className="space-y-1">
                {suggestions.components.map((component, idx) => {
                  const isSelected = currentIndex === localSelectedIndex;
                  currentIndex++;
                  return (
                    <button
                      key={`component-${idx}`}
                      className={cn(
                        "suggestion-item-" + (currentIndex - 1),
                        "w-full text-left px-3 py-2 rounded-md transition-colors",
                        isSelected ? 
                          "bg-blue-100 dark:bg-blue-900/30" : 
                          "hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                      onClick={() => handleItemClick(component, 'components')}
                      data-testid={`suggestion-component-${idx}`}
                    >
                      <div className="flex items-start gap-3">
                        {getFileIcon(component.type, component.metadata?.fileName)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {component.title || component.name}
                            </span>
                            <code className="text-xs font-mono text-blue-600 dark:text-blue-400">
                              {component.udi}
                            </code>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {component.module} • {component.type}
                            {component.version && ` • v${component.version}`}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Changes Category */}
          {suggestions.changes?.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <GitBranch className="h-3 w-3" />
                Changes
              </div>
              <div className="space-y-1">
                {suggestions.changes.map((change, idx) => {
                  const isSelected = currentIndex === localSelectedIndex;
                  currentIndex++;
                  const statusConfig = getStatusConfig(change.status);
                  
                  return (
                    <button
                      key={`change-${idx}`}
                      className={cn(
                        "suggestion-item-" + (currentIndex - 1),
                        "w-full text-left px-3 py-2 rounded-md transition-colors",
                        isSelected ? 
                          "bg-blue-100 dark:bg-blue-900/30" : 
                          "hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                      onClick={() => handleItemClick(change, 'changes')}
                      data-testid={`suggestion-change-${idx}`}
                    >
                      <div className="flex items-start gap-3">
                        <GitBranch className="h-4 w-4 text-slate-500 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {change.description || change.title}
                            </span>
                            <Badge 
                              variant="outline" 
                              className={cn("text-xs", statusConfig.color)}
                            >
                              {statusConfig.icon}
                              <span className="ml-1">{change.status}</span>
                            </Badge>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {change.changeId} • {change.priority} priority
                            {change.date && ` • ${new Date(change.date).toLocaleDateString()}`}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Users Category */}
          {suggestions.users?.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <Users className="h-3 w-3" />
                Users
              </div>
              <div className="space-y-1">
                {suggestions.users.map((user, idx) => {
                  const isSelected = currentIndex === localSelectedIndex;
                  currentIndex++;
                  
                  return (
                    <button
                      key={`user-${idx}`}
                      className={cn(
                        "suggestion-item-" + (currentIndex - 1),
                        "w-full text-left px-3 py-2 rounded-md transition-colors",
                        isSelected ? 
                          "bg-blue-100 dark:bg-blue-900/30" : 
                          "hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                      onClick={() => handleItemClick(user, 'users')}
                      data-testid={`suggestion-user-${idx}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold text-xs">
                          {user.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {user.name}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {user.email} • {user.role}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Documents Category */}
          {suggestions.documents?.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <FileText className="h-3 w-3" />
                Documents
              </div>
              <div className="space-y-1">
                {suggestions.documents.map((doc, idx) => {
                  const isSelected = currentIndex === localSelectedIndex;
                  currentIndex++;
                  
                  return (
                    <button
                      key={`doc-${idx}`}
                      className={cn(
                        "suggestion-item-" + (currentIndex - 1),
                        "w-full text-left px-3 py-2 rounded-md transition-colors",
                        isSelected ? 
                          "bg-blue-100 dark:bg-blue-900/30" : 
                          "hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                      onClick={() => handleItemClick(doc, 'documents')}
                      data-testid={`suggestion-document-${idx}`}
                    >
                      <div className="flex items-start gap-3">
                        {getFileIcon(doc.type, doc.fileName)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {doc.title}
                            </span>
                            {doc.module && (
                              <Badge variant="secondary" className="text-xs">
                                {doc.module}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {doc.path}
                            {doc.modifiedDate && ` • Modified ${new Date(doc.modifiedDate).toLocaleDateString()}`}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Regulatory References Category */}
          {suggestions.regulatory?.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <Shield className="h-3 w-3" />
                Regulatory References
              </div>
              <div className="space-y-1">
                {suggestions.regulatory.map((ref, idx) => {
                  const isSelected = currentIndex === localSelectedIndex;
                  currentIndex++;
                  
                  return (
                    <button
                      key={`reg-${idx}`}
                      className={cn(
                        "suggestion-item-" + (currentIndex - 1),
                        "w-full text-left px-3 py-2 rounded-md transition-colors",
                        isSelected ? 
                          "bg-blue-100 dark:bg-blue-900/30" : 
                          "hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                      onClick={() => handleItemClick(ref, 'regulatory')}
                      data-testid={`suggestion-regulatory-${idx}`}
                    >
                      <div className="flex items-start gap-3">
                        <Book className="h-4 w-4 text-slate-500 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {ref.citation}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {ref.agency || 'FDA'}
                            </Badge>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {ref.title}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* See All Results Footer */}
      <div className="border-t border-slate-200 dark:border-slate-700 p-2">
        <button
          className="w-full px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors flex items-center justify-center gap-2"
          onClick={() => {
            onSelect?.({ text: query, seeAll: true });
          }}
          data-testid="button-see-all-results"
        >
          See all results for "{query}"
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}