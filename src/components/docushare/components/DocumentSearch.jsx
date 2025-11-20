import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Filter, Calendar, FileText, User, Tag, X } from 'lucide-react';

const DocumentSearch = ({
  onSearch,
  searchResults = [],
  onDocumentSelect,
  moduleType,
  loading,
}) => {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({
    category: '',
    dateRange: '',
    confidentiality: '',
    author: '',
    tags: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  const handleSearch = () => {
    if (query.trim() || Object.values(filters).some(f => f)) {
      onSearch(query.trim(), filters);
    }
  };

  const handleKeyPress = e => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearFilters = () => {
    setFilters({
      category: '',
      dateRange: '',
      confidentiality: '',
      author: '',
      tags: '',
    });
  };

  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const formatDate = dateString => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const highlightText = (text, searchQuery) => {
    if (!searchQuery) return text;
    const regex = new RegExp(`(${searchQuery})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Search documents by title, content, or tags..."
            className="pl-10"
          />
        </div>
        <Button onClick={() => setShowFilters(!showFilters)} variant="outline">
          <Filter className="h-4 w-4 mr-2" />
          Filters
        </Button>
        <Button onClick={handleSearch} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </Button>
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Category</label>
                <Select
                  value={filters.category}
                  onValueChange={value => updateFilter('category', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any category</SelectItem>
                    <SelectItem value="Protocol">Protocol</SelectItem>
                    <SelectItem value="Report">Report</SelectItem>
                    <SelectItem value="Correspondence">Correspondence</SelectItem>
                    <SelectItem value="Technical Documentation">Technical Documentation</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Date Range</label>
                <Select
                  value={filters.dateRange}
                  onValueChange={value => updateFilter('dateRange', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This week</SelectItem>
                    <SelectItem value="month">This month</SelectItem>
                    <SelectItem value="quarter">This quarter</SelectItem>
                    <SelectItem value="year">This year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Confidentiality</label>
                <Select
                  value={filters.confidentiality}
                  onValueChange={value => updateFilter('confidentiality', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any level</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="confidential">Confidential</SelectItem>
                    <SelectItem value="restricted">Restricted</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Author</label>
                <Input
                  value={filters.author}
                  onChange={e => updateFilter('author', e.target.value)}
                  placeholder="Author name"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Tags</label>
                <Input
                  value={filters.tags}
                  onChange={e => updateFilter('tags', e.target.value)}
                  placeholder="Tag names"
                />
              </div>

              <div className="flex items-end">
                <Button onClick={clearFilters} variant="outline" className="w-full">
                  <X className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      <div className="space-y-3">
        {searchResults.length === 0 && query && !loading && (
          <div className="text-center py-8 text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No documents found matching your search criteria</p>
          </div>
        )}

        {searchResults.map(document => (
          <Card key={document.id} className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4" onClick={() => onDocumentSelect(document)}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-lg mb-1">
                    {highlightText(document.title || document.filename, query)}
                  </h4>

                  {document.description && (
                    <p className="text-sm text-gray-600 mb-2">
                      {highlightText(document.description, query)}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(document.uploadedAt || document.createdAt)}
                    </div>
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {document.uploadedBy || 'System'}
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {document.category || 'General'}
                    </div>
                  </div>

                  {document.tags && document.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {document.tags.slice(0, 3).map((tag, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {highlightText(tag, query)}
                        </Badge>
                      ))}
                      {document.tags.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{document.tags.length - 3} more
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                <Badge
                  className={`ml-4 ${
                    document.confidentiality === 'restricted'
                      ? 'bg-red-100 text-red-800'
                      : document.confidentiality === 'confidential'
                        ? 'bg-orange-100 text-orange-800'
                        : document.confidentiality === 'internal'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                  }`}
                >
                  {document.confidentiality || 'Internal'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default DocumentSearch;
