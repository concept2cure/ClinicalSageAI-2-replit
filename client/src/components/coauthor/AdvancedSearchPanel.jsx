/**
 * Advanced Search Panel Component
 * SharePoint-style advanced search with comprehensive filtering options
 * Features multi-faceted search, date ranges, and intelligent filtering
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { 
  Search, Filter, Calendar as CalendarIcon, User, FileText, Package, Shield, Building, Tag, Clock, ChevronRight, ChevronDown, X, RotateCcw, Save, Bell, Star, Download, Upload, SlidersHorizontal, Table, Presentation } from 'lucide-react'

export function AdvancedSearchPanel({ onSearch, onClose, initialQuery = '' }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  // Search state
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searchIn, setSearchIn] = useState('all'); // all, title, content, metadata, comments
  const [sortBy, setSortBy] = useState('relevance'); // relevance, date, name, size
  
  // Filter states
  const [fileTypes, setFileTypes] = useState({
    word: false,
    excel: false,
    powerpoint: false,
    pdf: false,
    other: false
  });
  
  const [dateRange, setDateRange] = useState({
    type: 'any', // any, today, week, month, custom
    from: null,
    to: null
  });
  
  const [modules, setModules] = useState({
    m1: false,
    m2: false,
    m3: false,
    m4: false,
    m5: false
  });
  
  const [statuses, setStatuses] = useState({
    draft: false,
    approved: false,
    inReview: false,
    rejected: false,
    pending: false
  });
  
  const [priorities, setPriorities] = useState({
    high: false,
    medium: false,
    low: false,
    critical: false
  });
  
  const [agencies, setAgencies] = useState({
    fda: false,
    ema: false,
    pmda: false,
    other: false
  });
  
  const [userFilters, setUserFilters] = useState({
    createdBy: '',
    modifiedBy: ''
  });
  
  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState({
    fileType: true,
    dateRange: false,
    module: false,
    status: false,
    priority: false,
    agency: false,
    users: false,
    searchOptions: true
  });
  
  // Saved searches
  const [savedSearches, setSavedSearches] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [searchName, setSearchName] = useState('');
  
  // Load saved searches from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('gcm-saved-searches');
    if (stored) {
      try {
        setSavedSearches(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to load saved searches:', e);
      }
    }
  }, []);
  
  // Toggle section expansion
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  
  // Get active filter count
  const getActiveFilterCount = () => {
    let count = 0;
    
    // Count file types
    count += Object.values(fileTypes).filter(Boolean).length;
    
    // Count modules
    count += Object.values(modules).filter(Boolean).length;
    
    // Count statuses
    count += Object.values(statuses).filter(Boolean).length;
    
    // Count priorities
    count += Object.values(priorities).filter(Boolean).length;
    
    // Count agencies
    count += Object.values(agencies).filter(Boolean).length;
    
    // Count date range
    if (dateRange.type !== 'any') count++;
    
    // Count user filters
    if (userFilters.createdBy) count++;
    if (userFilters.modifiedBy) count++;
    
    return count;
  };
  
  // Reset all filters
  const resetFilters = () => {
    setSearchQuery('');
    setSearchIn('all');
    setSortBy('relevance');
    setFileTypes({
      word: false,
      excel: false,
      powerpoint: false,
      pdf: false,
      other: false
    });
    setDateRange({
      type: 'any',
      from: null,
      to: null
    });
    setModules({
      m1: false,
      m2: false,
      m3: false,
      m4: false,
      m5: false
    });
    setStatuses({
      draft: false,
      approved: false,
      inReview: false,
      rejected: false,
      pending: false
    });
    setPriorities({
      high: false,
      medium: false,
      low: false,
      critical: false
    });
    setAgencies({
      fda: false,
      ema: false,
      pmda: false,
      other: false
    });
    setUserFilters({
      createdBy: '',
      modifiedBy: ''
    });
    
    toast({
      title: "Filters cleared",
      description: "All search filters have been reset"
    });
  };
  
  // Build search parameters
  const buildSearchParams = () => {
    const params = {
      query: searchQuery,
      searchIn,
      sortBy,
      filters: {}
    };
    
    // Add file types
    const selectedFileTypes = Object.keys(fileTypes).filter(key => fileTypes[key]);
    if (selectedFileTypes.length > 0) {
      params.filters.fileTypes = selectedFileTypes;
    }
    
    // Add modules
    const selectedModules = Object.keys(modules).filter(key => modules[key]);
    if (selectedModules.length > 0) {
      params.filters.modules = selectedModules.map(m => m.toUpperCase());
    }
    
    // Add statuses
    const selectedStatuses = Object.keys(statuses).filter(key => statuses[key]);
    if (selectedStatuses.length > 0) {
      params.filters.statuses = selectedStatuses;
    }
    
    // Add priorities
    const selectedPriorities = Object.keys(priorities).filter(key => priorities[key]);
    if (selectedPriorities.length > 0) {
      params.filters.priorities = selectedPriorities;
    }
    
    // Add agencies
    const selectedAgencies = Object.keys(agencies).filter(key => agencies[key]);
    if (selectedAgencies.length > 0) {
      params.filters.agencies = selectedAgencies.map(a => a.toUpperCase());
    }
    
    // Add date range
    if (dateRange.type !== 'any') {
      params.filters.dateRange = dateRange;
    }
    
    // Add user filters
    if (userFilters.createdBy) {
      params.filters.createdBy = userFilters.createdBy;
    }
    if (userFilters.modifiedBy) {
      params.filters.modifiedBy = userFilters.modifiedBy;
    }
    
    return params;
  };
  
  // Execute search
  const executeSearch = () => {
    const searchParams = buildSearchParams();
    
    // Navigate to search results with encoded parameters
    const queryString = encodeURIComponent(JSON.stringify(searchParams));
    setLocation(`/search?advanced=${queryString}`);
    
    // Call onSearch callback if provided
    if (onSearch) {
      onSearch(searchParams);
    }
    
    // Close the panel if onClose is provided
    if (onClose) {
      onClose();
    }
  };
  
  // Save current search
  const saveSearch = () => {
    if (!searchName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a name for this saved search",
        variant: "destructive"
      });
      return;
    }
    
    const searchParams = buildSearchParams();
    const savedSearch = {
      id: Date.now().toString(),
      name: searchName,
      params: searchParams,
      createdAt: new Date().toISOString(),
      filterCount: getActiveFilterCount()
    };
    
    const updated = [...savedSearches, savedSearch];
    setSavedSearches(updated);
    localStorage.setItem('gcm-saved-searches', JSON.stringify(updated));
    
    setShowSaveDialog(false);
    setSearchName('');
    
    toast({
      title: "Search saved",
      description: `"${savedSearch.name}" has been saved to your searches`
    });
  };
  
  // Load saved search
  const loadSavedSearch = (search) => {
    const { params } = search;
    
    setSearchQuery(params.query || '');
    setSearchIn(params.searchIn || 'all');
    setSortBy(params.sortBy || 'relevance');
    
    // Load filters
    if (params.filters) {
      const { filters } = params;
      
      // Load file types
      if (filters.fileTypes) {
        const newFileTypes = { word: false, excel: false, powerpoint: false, pdf: false, other: false };
        filters.fileTypes.forEach(type => {
          newFileTypes[type] = true;
        });
        setFileTypes(newFileTypes);
      }
      
      // Load modules
      if (filters.modules) {
        const newModules = { m1: false, m2: false, m3: false, m4: false, m5: false };
        filters.modules.forEach(module => {
          newModules[module.toLowerCase()] = true;
        });
        setModules(newModules);
      }
      
      // Load statuses
      if (filters.statuses) {
        const newStatuses = { draft: false, approved: false, inReview: false, rejected: false, pending: false };
        filters.statuses.forEach(status => {
          newStatuses[status] = true;
        });
        setStatuses(newStatuses);
      }
      
      // Load priorities
      if (filters.priorities) {
        const newPriorities = { high: false, medium: false, low: false, critical: false };
        filters.priorities.forEach(priority => {
          newPriorities[priority] = true;
        });
        setPriorities(newPriorities);
      }
      
      // Load agencies
      if (filters.agencies) {
        const newAgencies = { fda: false, ema: false, pmda: false, other: false };
        filters.agencies.forEach(agency => {
          newAgencies[agency.toLowerCase()] = true;
        });
        setAgencies(newAgencies);
      }
      
      // Load date range
      if (filters.dateRange) {
        setDateRange(filters.dateRange);
      }
      
      // Load user filters
      if (filters.createdBy || filters.modifiedBy) {
        setUserFilters({
          createdBy: filters.createdBy || '',
          modifiedBy: filters.modifiedBy || ''
        });
      }
    }
    
    toast({
      title: "Search loaded",
      description: `Loaded "${search.name}"`
    });
  };
  
  // Delete saved search
  const deleteSavedSearch = (searchId) => {
    const updated = savedSearches.filter(s => s.id !== searchId);
    setSavedSearches(updated);
    localStorage.setItem('gcm-saved-searches', JSON.stringify(updated));
    
    toast({
      title: "Search deleted",
      description: "Saved search has been removed"
    });
  };
  
  const activeFilterCount = getActiveFilterCount();
  
  return (
    <div className="w-full max-w-7xl mx-auto p-4">
      <Card className="shadow-lg border-slate-200 dark:border-slate-700">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SlidersHorizontal className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              <CardTitle>Advanced Search</CardTitle>
              {activeFilterCount > 0 && (
                <Badge className="bg-blue-600 text-white">
                  {activeFilterCount} active
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={resetFilters}
                data-testid="button-reset-filters"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset All
              </Button>
              {onClose && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onClose}
                  data-testid="button-close-advanced"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Panel - Filters */}
            <div className="lg:col-span-1">
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-4">
                  {/* File Type Filter */}
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg">
                    <button
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      onClick={() => toggleSection('fileType')}
                      data-testid="button-toggle-filetype"
                    >
                      <span className="text-sm font-medium">File Type</span>
                      {expandedSections.fileType ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    {expandedSections.fileType && (
                      <div className="px-4 pb-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={fileTypes.word}
                            onCheckedChange={(checked) => setFileTypes(prev => ({ ...prev, word: checked }))}
                            data-testid="checkbox-word"
                          />
                          <Label className="flex items-center gap-2 cursor-pointer">
                            <FileText className="h-4 w-4 text-blue-600" />
                            Word
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={fileTypes.excel}
                            onCheckedChange={(checked) => setFileTypes(prev => ({ ...prev, excel: checked }))}
                            data-testid="checkbox-excel"
                          />
                          <Label className="flex items-center gap-2 cursor-pointer">
                            <Table className="h-4 w-4 text-green-600" />
                            Excel
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={fileTypes.powerpoint}
                            onCheckedChange={(checked) => setFileTypes(prev => ({ ...prev, powerpoint: checked }))}
                            data-testid="checkbox-powerpoint"
                          />
                          <Label className="flex items-center gap-2 cursor-pointer">
                            <Presentation className="h-4 w-4 text-orange-600" />
                            PowerPoint
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={fileTypes.pdf}
                            onCheckedChange={(checked) => setFileTypes(prev => ({ ...prev, pdf: checked }))}
                            data-testid="checkbox-pdf"
                          />
                          <Label className="flex items-center gap-2 cursor-pointer">
                            <FileText className="h-4 w-4 text-red-600" />
                            PDF
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={fileTypes.other}
                            onCheckedChange={(checked) => setFileTypes(prev => ({ ...prev, other: checked }))}
                            data-testid="checkbox-other"
                          />
                          <Label className="flex items-center gap-2 cursor-pointer">
                            <FileText className="h-4 w-4 text-slate-600" />
                            Other
                          </Label>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Module Filter */}
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg">
                    <button
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      onClick={() => toggleSection('module')}
                      data-testid="button-toggle-module"
                    >
                      <span className="text-sm font-medium">Module</span>
                      {expandedSections.module ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    {expandedSections.module && (
                      <div className="px-4 pb-3 space-y-2">
                        {Object.keys(modules).map(module => (
                          <div key={module} className="flex items-center gap-2">
                            <Checkbox
                              checked={modules[module]}
                              onCheckedChange={(checked) => setModules(prev => ({ ...prev, [module]: checked }))}
                              data-testid={`checkbox-${module}`}
                            />
                            <Label className="cursor-pointer">
                              {module.toUpperCase()} - {
                                module === 'm1' ? 'Administrative' :
                                module === 'm2' ? 'Common Technical' :
                                module === 'm3' ? 'Quality' :
                                module === 'm4' ? 'Nonclinical' : 'Clinical'
                              }
                            </Label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Status Filter */}
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg">
                    <button
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      onClick={() => toggleSection('status')}
                      data-testid="button-toggle-status"
                    >
                      <span className="text-sm font-medium">Status</span>
                      {expandedSections.status ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    {expandedSections.status && (
                      <div className="px-4 pb-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={statuses.draft}
                            onCheckedChange={(checked) => setStatuses(prev => ({ ...prev, draft: checked }))}
                            data-testid="checkbox-draft"
                          />
                          <Label className="cursor-pointer">Draft</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={statuses.approved}
                            onCheckedChange={(checked) => setStatuses(prev => ({ ...prev, approved: checked }))}
                            data-testid="checkbox-approved"
                          />
                          <Label className="cursor-pointer">Approved</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={statuses.inReview}
                            onCheckedChange={(checked) => setStatuses(prev => ({ ...prev, inReview: checked }))}
                            data-testid="checkbox-in-review"
                          />
                          <Label className="cursor-pointer">In Review</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={statuses.rejected}
                            onCheckedChange={(checked) => setStatuses(prev => ({ ...prev, rejected: checked }))}
                            data-testid="checkbox-rejected"
                          />
                          <Label className="cursor-pointer">Rejected</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={statuses.pending}
                            onCheckedChange={(checked) => setStatuses(prev => ({ ...prev, pending: checked }))}
                            data-testid="checkbox-pending"
                          />
                          <Label className="cursor-pointer">Pending</Label>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* More filters can be added similarly */}
                </div>
              </ScrollArea>
            </div>
            
            {/* Right Panel - Search Options and Saved Searches */}
            <div className="lg:col-span-3 space-y-6">
              {/* Search Query Input */}
              <div className="space-y-2">
                <Label>Search Query</Label>
                <div className="flex gap-2">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Enter your search terms..."
                    className="flex-1"
                    data-testid="input-search-query"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        executeSearch();
                      }
                    }}
                  />
                  <Button
                    onClick={executeSearch}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    data-testid="button-search"
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </Button>
                </div>
              </div>
              
              {/* Search Options */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Search Within</Label>
                    <RadioGroup value={searchIn} onValueChange={setSearchIn}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="all" id="all" />
                        <Label htmlFor="all" className="cursor-pointer">All Fields</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="title" id="title" />
                        <Label htmlFor="title" className="cursor-pointer">Title Only</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="content" id="content" />
                        <Label htmlFor="content" className="cursor-pointer">Content</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="metadata" id="metadata" />
                        <Label htmlFor="metadata" className="cursor-pointer">Metadata</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="comments" id="comments" />
                        <Label htmlFor="comments" className="cursor-pointer">Comments</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Sort By</Label>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="relevance">Relevance</SelectItem>
                        <SelectItem value="date">Date (Newest)</SelectItem>
                        <SelectItem value="date-oldest">Date (Oldest)</SelectItem>
                        <SelectItem value="name">Name (A-Z)</SelectItem>
                        <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                        <SelectItem value="size">Size (Largest)</SelectItem>
                        <SelectItem value="size-smallest">Size (Smallest)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              
              {/* Saved Searches */}
              {savedSearches.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Saved Searches</Label>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowSaveDialog(true)}
                      data-testid="button-save-search"
                    >
                      <Save className="h-4 w-4 mr-1" />
                      Save Current
                    </Button>
                  </div>
                  <ScrollArea className="h-[200px] border border-slate-200 dark:border-slate-700 rounded-lg p-2">
                    <div className="space-y-2">
                      {savedSearches.map(search => (
                        <div
                          key={search.id}
                          className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md"
                        >
                          <button
                            className="flex-1 text-left flex items-center gap-2"
                            onClick={() => loadSavedSearch(search)}
                            data-testid={`button-load-search-${search.id}`}
                          >
                            <Star className="h-4 w-4 text-yellow-500" />
                            <div>
                              <div className="text-sm font-medium">{search.name}</div>
                              <div className="text-xs text-slate-500">
                                {search.filterCount} filters • {new Date(search.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                          </button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteSavedSearch(search.id)}
                            data-testid={`button-delete-search-${search.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
              
              {/* Active Filters Display */}
              {activeFilterCount > 0 && (
                <div className="space-y-2">
                  <Label>Active Filters</Label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(fileTypes).filter(([, v]) => v).map(([key]) => (
                      <Badge key={`ft-${key}`} variant="secondary" className="flex items-center gap-1">
                        File: {key}
                        <button
                          onClick={() => setFileTypes(prev => ({ ...prev, [key]: false }))}
                          className="ml-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    {Object.entries(modules).filter(([, v]) => v).map(([key]) => (
                      <Badge key={`mod-${key}`} variant="secondary" className="flex items-center gap-1">
                        Module: {key.toUpperCase()}
                        <button
                          onClick={() => setModules(prev => ({ ...prev, [key]: false }))}
                          className="ml-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    {Object.entries(statuses).filter(([, v]) => v).map(([key]) => (
                      <Badge key={`st-${key}`} variant="secondary" className="flex items-center gap-1">
                        Status: {key}
                        <button
                          onClick={() => setStatuses(prev => ({ ...prev, [key]: false }))}
                          className="ml-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Save Search Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <Card className="w-[400px]">
            <CardHeader>
              <CardTitle>Save Search</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Search Name</Label>
                <Input
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="Enter a name for this search..."
                  data-testid="input-search-name"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowSaveDialog(false);
                    setSearchName('');
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={saveSearch}>
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}