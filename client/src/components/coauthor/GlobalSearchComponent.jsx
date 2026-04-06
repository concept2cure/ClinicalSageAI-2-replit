/**
 * Global Search Component
 * SharePoint-style search bar for Global Change Management System
 * Features expandable search box, recent searches, and intelligent suggestions
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Search, X, Clock, Star, TrendingUp, ChevronDown, Filter, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiRequest } from '@/lib/queryClient';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { SearchSuggestions } from './SearchSuggestions';
import { debounce } from 'lodash';

export function GlobalSearchComponent({ className, onSearchResults, embedded = false }) {
 const [isExpanded, setIsExpanded] = useState(false);
 const [searchQuery, setSearchQuery] = useState('');
 const [showSuggestions, setShowSuggestions] = useState(false);
 const [showRecentSearches, setShowRecentSearches] = useState(false);
 const [recentSearches, setRecentSearches] = useState([]);
 const [selectedIndex, setSelectedIndex] = useState(-1);
 const [isSearching, setIsSearching] = useState(false);
 const [, setLocation] = useLocation();
 const { toast } = useToast();
 const searchInputRef = useRef(null);
 const searchContainerRef = useRef(null);

 // Load recent searches from localStorage
 useEffect(() => {
 const stored = localStorage.getItem('gcm-recent-searches');
 if (stored) {
 try {
 setRecentSearches(JSON.parse(stored));
 } catch (e) {
 console.error('Failed to parse recent searches:', e);
 }
 }
 }, []);

 // Handle clicks outside search area
 useEffect(() => {
 function handleClickOutside(event) {
 if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
 setShowSuggestions(false);
 setShowRecentSearches(false);
 if (!searchQuery && !embedded) {
 setIsExpanded(false);
 }
 }
 }

 document.addEventListener('mousedown', handleClickOutside);
 return () => {
 document.removeEventListener('mousedown', handleClickOutside);
 };
 }, [searchQuery, embedded]);

 // Save search to recent searches
 const saveToRecentSearches = useCallback((query) => {
 if (!query.trim()) return;
 
 const updated = [
 query,
 ...recentSearches.filter(s => s.toLowerCase() !== query.toLowerCase())
 ].slice(0, 10); // Keep last 10 searches
 
 setRecentSearches(updated);
 localStorage.setItem('gcm-recent-searches', JSON.stringify(updated));
 }, [recentSearches]);

 // Clear recent searches
 const clearRecentSearches = () => {
 setRecentSearches([]);
 localStorage.removeItem('gcm-recent-searches');
 setShowRecentSearches(false);
 toast({
 title: "Search history cleared",
 description: "Your recent searches have been removed"
 });
 };

 // Debounced search for suggestions
 const debouncedSearch = useCallback(
 debounce((query) => {
 if (query.length >= 2) {
 setShowSuggestions(true);
 setShowRecentSearches(false);
 } else {
 setShowSuggestions(false);
 }
 }, 300),
 []
 );

 // Handle search input change
 const handleInputChange = (e) => {
 const value = e.target.value;
 setSearchQuery(value);
 setSelectedIndex(-1);
 
 if (value) {
 debouncedSearch(value);
 } else {
 setShowSuggestions(false);
 setShowRecentSearches(true);
 }
 };

 // Execute search
 const executeSearch = async (query = searchQuery) => {
 if (!query.trim()) return;
 
 setIsSearching(true);
 setShowSuggestions(false);
 setShowRecentSearches(false);
 saveToRecentSearches(query);

 try {
 // Navigate to search results page with query
 setLocation(`/search?q=${encodeURIComponent(query)}`);
 
 // If onSearchResults callback is provided, execute it
 if (onSearchResults) {
 const response = await apiRequest('POST', '/api/coauthor/search', {
 query,
 includeMetadata: true
 });
 const data = await response.json();
 onSearchResults(data);
 }
 } catch (error) {
 console.error('Search error:', error);
 toast({
 title: "Search failed",
 description: "Unable to perform search. Please try again.",
 variant: "destructive"
 });
 } finally {
 setIsSearching(false);
 }
 };

 // Handle keyboard navigation
 const handleKeyDown = (e) => {
 if (e.key === 'Enter') {
 e.preventDefault();
 if (selectedIndex >= 0 && showSuggestions) {
 // Select from suggestions
 const suggestion = document.querySelector(`.suggestion-item-${selectedIndex}`);
 if (suggestion) {
 suggestion.click();
 }
 } else {
 executeSearch();
 }
 } else if (e.key === 'ArrowDown') {
 e.preventDefault();
 setSelectedIndex(prev => prev + 1);
 } else if (e.key === 'ArrowUp') {
 e.preventDefault();
 setSelectedIndex(prev => Math.max(-1, prev - 1));
 } else if (e.key === 'Escape') {
 setShowSuggestions(false);
 setShowRecentSearches(false);
 searchInputRef.current?.blur();
 }
 };

 // Handle search box click/focus
 const handleSearchBoxFocus = () => {
 if (!embedded) {
 setIsExpanded(true);
 }
 if (!searchQuery) {
 setShowRecentSearches(recentSearches.length > 0);
 }
 };

 // Handle suggestion selection
 const handleSuggestionSelect = (suggestion) => {
 setSearchQuery(suggestion.text || suggestion);
 setShowSuggestions(false);
 executeSearch(suggestion.text || suggestion);
 };

 // SharePoint-style search box classes
 const searchBoxClasses = cn(
 "relative transition-all duration-300",
 {
 "w-[600px]": isExpanded && !embedded,
 "w-[260px]": !isExpanded && !embedded,
 "w-full": embedded
 },
 className
 );

 return (
 <div 
 ref={searchContainerRef}
 className={searchBoxClasses}
 data-testid="global-search-container"
 >
 {/* Main Search Box */}
 <div className={cn(
 "relative flex items-center bg-white dark:bg-slate-900",
 "border-2 border-stone-500 dark:border-stone-400",
 "rounded-lg shadow-sm hover:shadow-md transition-shadow",
 "focus-within:shadow-lg focus-within:border-stone-700"
 )}>
 {/* Search Icon */}
 <div className="flex items-center pl-3">
 <Search className="h-5 w-5 text-stone-500 dark:text-stone-400" />
 </div>

 {/* Search Input */}
 <Input
 ref={searchInputRef}
 type="text"
 value={searchQuery}
 onChange={handleInputChange}
 onFocus={handleSearchBoxFocus}
 onKeyDown={handleKeyDown}
 placeholder="Search in Global Change Management"
 className={cn(
 "flex-1 border-0 focus:ring-0 bg-transparent",
 "placeholder:text-slate-400 dark:placeholder:text-slate-500",
 "text-slate-900 dark:text-slate-100",
 "px-3 py-2.5"
 )}
 data-testid="global-search-input"
 />

 {/* Action Buttons */}
 <div className="flex items-center gap-1 pr-2">
 {/* Clear Button */}
 {searchQuery && (
 <Button
 size="sm"
 variant="ghost"
 className="h-7 w-7 p-0 hover:bg-slate-100 dark:hover:bg-slate-800"
 onClick={() => {
 setSearchQuery('');
 setShowSuggestions(false);
 searchInputRef.current?.focus();
 }}
 data-testid="button-clear-search"
 >
 <X className="h-4 w-4 text-slate-500" />
 </Button>
 )}

 {/* Advanced Search */}
 <Button
 size="sm"
 variant="ghost"
 className="h-7 px-2 hover:bg-slate-100 dark:hover:bg-slate-800"
 onClick={() => setLocation('/search/advanced')}
 data-testid="button-advanced-search"
 >
 <Filter className="h-4 w-4 text-slate-500" />
 <span className="ml-1 text-xs text-slate-600 dark:text-slate-400">
 Advanced
 </span>
 </Button>

 {/* Search Button */}
 <Button
 size="sm"
 className="h-7 px-3 bg-stone-800 hover:bg-stone-900 text-white"
 onClick={() => executeSearch()}
 disabled={!searchQuery.trim() || isSearching}
 data-testid="button-execute-search"
 >
 {isSearching ? (
 <span className="flex items-center gap-1">
 <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
 <span className="text-xs">Searching...</span>
 </span>
 ) : (
 <span className="text-xs">Search</span>
 )}
 </Button>
 </div>
 </div>

 {/* Recent Searches Dropdown */}
 {showRecentSearches && recentSearches.length > 0 && (
 <div className={cn(
 "absolute z-50 w-full mt-2",
 "bg-white dark:bg-slate-900 rounded-lg shadow-xl",
 "border border-slate-200 dark:border-slate-700",
 "max-h-[400px] overflow-hidden"
 )}>
 <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
 <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
 <Clock className="h-4 w-4" />
 Recent Searches
 </div>
 <Button
 size="sm"
 variant="ghost"
 className="h-6 px-2 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
 onClick={clearRecentSearches}
 data-testid="button-clear-recent"
 >
 Clear all
 </Button>
 </div>
 <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto">
 {recentSearches.map((search, index) => (
 <button
 key={index}
 className={cn(
 "w-full text-left px-3 py-2 rounded-md",
 "hover:bg-slate-100 dark:hover:bg-slate-800",
 "text-sm text-slate-700 dark:text-slate-300",
 "transition-colors duration-150",
 "flex items-center gap-2"
 )}
 onClick={() => {
 setSearchQuery(search);
 executeSearch(search);
 }}
 data-testid={`button-recent-search-${index}`}
 >
 <Clock className="h-3 w-3 text-slate-400" />
 {search}
 </button>
 ))}
 </div>
 </div>
 )}

 {/* Search Suggestions */}
 {showSuggestions && searchQuery.length >= 2 && (
 <SearchSuggestions
 query={searchQuery}
 selectedIndex={selectedIndex}
 onSelect={handleSuggestionSelect}
 onClose={() => setShowSuggestions(false)}
 />
 )}

 {/* Popular Searches (when focused but empty) */}
 {isExpanded && !searchQuery && !showRecentSearches && (
 <div className={cn(
 "absolute z-50 w-full mt-2",
 "bg-white dark:bg-slate-900 rounded-lg shadow-xl",
 "border border-slate-200 dark:border-slate-700",
 "p-4"
 )}>
 <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
 <TrendingUp className="h-4 w-4" />
 Popular Searches
 </div>
 <div className="flex flex-wrap gap-2">
 {['eCTD submission', 'Module 3', 'FDA compliance', 'Change control', 'UDI components'].map((term, index) => (
 <Badge
 key={index}
 variant="secondary"
 className="cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700"
 onClick={() => {
 setSearchQuery(term);
 executeSearch(term);
 }}
 data-testid={`badge-popular-${index}`}
 >
 {term}
 </Badge>
 ))}
 </div>
 </div>
 )}
 </div>
 );
}