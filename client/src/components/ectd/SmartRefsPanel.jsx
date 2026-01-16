/**
 * Smart References Panel - Advanced
 * Intelligent cross-reference system with search, filters, favorites
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link, X, Search, Star, Plus, Loader2, FileText, Filter } from 'lucide-react';

export default function SmartRefsPanel({ 
  documentId, 
  organizationId, 
  onInsert, 
  onClose 
}) {
  const [smartRefs, setSmartRefs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, high, medium, recent, favorites
  const [favorites, setFavorites] = useState([]);
  const [recentRefs, setRecentRefs] = useState([]);

  // Load smart references
  useEffect(() => {
    loadSmartRefs();
  }, [documentId, organizationId]);

  const loadSmartRefs = async () => {
    if (!documentId || !organizationId) return;
    
    setIsLoading(true);
    try {
      const res = await fetch(`/api/smart-refs/${documentId}?organizationId=${organizationId}`);
      const data = await res.json();
      
      if (data.success) {
        setSmartRefs(data.references);
      }
    } catch (error) {
      console.error('Failed to load smart refs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFavorite = (refId) => {
    setFavorites(prev => 
      prev.includes(refId) 
        ? prev.filter(id => id !== refId)
        : [...prev, refId]
    );
  };

  const handleInsert = async (ref) => {
    const refText = `See ${ref.module || 'Section'}: ${ref.title}`;
    onInsert(refText);
    
    // Track usage
    setRecentRefs(prev => [ref.id, ...prev.filter(id => id !== ref.id)].slice(0, 10));
    
    // Track on backend
    try {
      await fetch('/api/smart-refs/recent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': organizationId
        },
        body: JSON.stringify({
          documentId,
          referencedDocId: ref.id
        })
      });
    } catch (error) {
      console.error('Failed to track reference:', error);
    }
  };

  // Filter references
  const filteredRefs = smartRefs.filter(ref => {
    // Search filter
    const matchesSearch = !searchQuery || 
      ref.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ref.module && ref.module.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (!matchesSearch) return false;

    // Type filter
    if (filterType === 'high' && ref.relevance <= 5) return false;
    if (filterType === 'medium' && (ref.relevance <= 2 || ref.relevance > 5)) return false;
    if (filterType === 'recent' && !recentRefs.includes(ref.id)) return false;
    if (filterType === 'favorites' && !favorites.includes(ref.id)) return false;

    return true;
  });

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-900 flex items-center">
          <Link className="h-4 w-4 mr-2 text-blue-500" />
          Smart References
        </h3>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search references..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {[
          { id: 'all', label: `All (${smartRefs.length})`, icon: null },
          { id: 'high', label: 'High Relevance', icon: null },
          { id: 'medium', label: 'Medium', icon: null },
          { id: 'recent', label: 'Recent', icon: null },
          { id: 'favorites', label: 'Favorites', icon: <Star className="h-3 w-3 mr-1" /> }
        ].map(filter => (
          <button
            key={filter.id}
            onClick={() => setFilterType(filter.id)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center ${
              filterType === filter.id
                ? 'bg-blue-100 text-blue-700 border-blue-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {filter.icon}
            {filter.label}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500 mr-2" />
          <span className="text-sm text-slate-600">Finding relevant documents...</span>
        </div>
      ) : filteredRefs.length === 0 ? (
        <div className="text-center py-8 bg-slate-50 rounded-lg border border-slate-200">
          <FileText className="h-12 w-12 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-600">
            {smartRefs.length === 0 ? 'No documents in your vault yet' : 'No matching references'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {smartRefs.length === 0 ? 'Upload documents to see smart cross-references' : 'Try adjusting your filters'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {filteredRefs.map(ref => {
            const isFavorite = favorites.includes(ref.id);
            const isRecent = recentRefs.includes(ref.id);
            
            return (
              <div 
                key={ref.id} 
                className="p-3 rounded-lg border border-slate-200 bg-white hover:border-blue-300 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold text-blue-600 px-2 py-0.5 bg-blue-50 rounded">
                        {ref.module || 'General'}
                      </span>
                      
                      {/* Relevance Badge */}
                      {ref.relevance > 5 && (
                        <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200 px-1.5 py-0">
                          High
                        </Badge>
                      )}
                      {ref.relevance > 2 && ref.relevance <= 5 && (
                        <Badge className="text-[10px] bg-yellow-100 text-yellow-700 border-yellow-200 px-1.5 py-0">
                          Med
                        </Badge>
                      )}
                      
                      {/* Recent Badge */}
                      {isRecent && (
                        <Badge className="text-[10px] bg-purple-100 text-purple-700 border-purple-200 px-1.5 py-0">
                          Recent
                        </Badge>
                      )}
                      
                      {/* Favorite Button */}
                      <button 
                        className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => toggleFavorite(ref.id)}
                      >
                        <Star 
                          className={`h-3.5 w-3.5 transition-colors ${
                            isFavorite ? 'text-yellow-500 fill-yellow-500' : 'text-slate-400 hover:text-yellow-500'
                          }`}
                        />
                      </button>
                    </div>
                    
                    <p className="text-sm font-medium text-slate-800 group-hover:text-blue-700 transition-colors line-clamp-2">
                      {ref.title}
                    </p>
                    
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                      <span>Score: {ref.relevance}</span>
                      <span>•</span>
                      <span>{new Date(ref.updatedAt).toLocaleDateString()}</span>
                      {ref.documentType && (
                        <>
                          <span>•</span>
                          <span>{ref.documentType}</span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <Button 
                    size="sm" 
                    className="ml-3 h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white border-0 whitespace-nowrap"
                    onClick={() => handleInsert(ref)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Insert
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stats Footer */}
      {!isLoading && smartRefs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <span>Showing {filteredRefs.length} of {smartRefs.length} references</span>
          <button 
            onClick={loadSmartRefs}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}
