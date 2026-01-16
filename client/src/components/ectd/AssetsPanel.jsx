/**
 * Assets Panel - Advanced
 * TFL Library with search, filters, preview, favorites
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Database, X, Search, Star, Plus, Loader2, Table, BarChart3, FileText, Download } from 'lucide-react';

export default function AssetsPanel({ 
  organizationId, 
  onInsert, 
  onClose 
}) {
  const [assets, setAssets] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // all, table, figure, listing
  const [favorites, setFavorites] = useState([]);
  const [recentAssets, setRecentAssets] = useState([]);
  const [selectedPreview, setSelectedPreview] = useState(null);

  // Load assets
  useEffect(() => {
    loadAssets();
  }, [organizationId, typeFilter]);

  const loadAssets = async () => {
    if (!organizationId) return;
    
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        organizationId,
        limit: 100
      });
      
      if (typeFilter !== 'all') {
        params.append('type', typeFilter);
      }
      
      const res = await fetch(`/api/assets?${params}`);
      const data = await res.json();
      
      if (data.success) {
        setAssets(data.assets);
      } else {
        // Fallback to default assets
        setAssets(getDefaultAssets());
      }
    } catch (error) {
      console.error('Failed to load assets:', error);
      setAssets(getDefaultAssets());
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFavorite = (assetId) => {
    setFavorites(prev => 
      prev.includes(assetId) 
        ? prev.filter(id => id !== assetId)
        : [...prev, assetId]
    );
  };

  const handleInsert = (asset) => {
    const assetText = `\n\n[${asset.assetType}: ${asset.title}]\n\n${asset.content}\n\nSource: ${asset.sourceDocumentTitle || 'Document Vault'}\n\n`;
    onInsert(assetText);
    
    // Track usage
    setRecentAssets(prev => [asset.id, ...prev.filter(id => id !== asset.id)].slice(0, 10));
  };

  const getAssetIcon = (type) => {
    const lowerType = type?.toLowerCase();
    if (lowerType === 'table') return <Table className="h-4 w-4 text-blue-500" />;
    if (lowerType === 'figure') return <BarChart3 className="h-4 w-4 text-green-500" />;
    if (lowerType === 'listing') return <FileText className="h-4 w-4 text-orange-500" />;
    return <FileText className="h-4 w-4 text-slate-500" />;
  };

  const getAssetColor = (type) => {
    const lowerType = type?.toLowerCase();
    if (lowerType === 'table') return 'blue';
    if (lowerType === 'figure') return 'green';
    if (lowerType === 'listing') return 'orange';
    return 'slate';
  };

  // Filter assets
  const filteredAssets = assets.filter(asset => {
    const matchesSearch = !searchQuery || 
      asset.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (asset.content && asset.content.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (asset.assetNumber && asset.assetNumber.includes(searchQuery));
    
    return matchesSearch;
  });

  // Get asset counts by type
  const counts = {
    all: assets.length,
    table: assets.filter(a => a.assetType?.toLowerCase() === 'table').length,
    figure: assets.filter(a => a.assetType?.toLowerCase() === 'figure').length,
    listing: assets.filter(a => a.assetType?.toLowerCase() === 'listing').length
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-900 flex items-center">
          <Database className="h-4 w-4 mr-2 text-purple-500" />
          Asset Library
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
          placeholder="Search tables, figures, listings..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
        />
      </div>

      {/* Type Filters */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {[
          { id: 'all', label: `All (${counts.all})`, icon: null },
          { id: 'table', label: `Tables (${counts.table})`, icon: <Table className="h-3 w-3 mr-1" /> },
          { id: 'figure', label: `Figures (${counts.figure})`, icon: <BarChart3 className="h-3 w-3 mr-1" /> },
          { id: 'listing', label: `Listings (${counts.listing})`, icon: <FileText className="h-3 w-3 mr-1" /> }
        ].map(filter => (
          <button
            key={filter.id}
            onClick={() => setTypeFilter(filter.id)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center ${
              typeFilter === filter.id
                ? 'bg-purple-100 text-purple-700 border-purple-200'
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
          <Loader2 className="h-6 w-6 animate-spin text-purple-500 mr-2" />
          <span className="text-sm text-slate-600">Loading TFLs from vault...</span>
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="text-center py-8 bg-slate-50 rounded-lg border border-slate-200">
          <Table className="h-12 w-12 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-600">
            {assets.length === 0 ? 'No assets extracted yet' : 'No matching assets'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {assets.length === 0 ? 'Upload CSRs to auto-extract Tables, Figures, Listings' : 'Try adjusting your filters'}
          </p>
        </div>
      ) : (
        <div className="grid gap-2 max-h-[500px] overflow-y-auto pr-1">
          {filteredAssets.map(asset => {
            const isFavorite = favorites.includes(asset.id);
            const isRecent = recentAssets.includes(asset.id);
            const color = getAssetColor(asset.assetType);
            
            return (
              <div 
                key={asset.id} 
                className="p-3 rounded-lg border border-slate-200 bg-white hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group relative"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', asset.title);
                }}
                onClick={() => setSelectedPreview(asset)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getAssetIcon(asset.assetType)}
                    <Badge variant="outline" className={`text-xs bg-${color}-50 text-${color}-700 border-${color}-200`}>
                      {asset.assetType}
                    </Badge>
                    
                    {asset.assetNumber && (
                      <span className="text-xs text-slate-500 font-mono">#{asset.assetNumber}</span>
                    )}
                    
                    {isRecent && (
                      <Badge className="text-[10px] bg-purple-100 text-purple-700 border-purple-200 px-1.5 py-0">
                        Recent
                      </Badge>
                    )}
                    
                    <button 
                      className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(asset.id);
                      }}
                    >
                      <Star 
                        className={`h-3.5 w-3.5 transition-colors ${
                          isFavorite ? 'text-yellow-500 fill-yellow-500' : 'text-slate-400 hover:text-yellow-500'
                        }`}
                      />
                    </button>
                  </div>
                  
                  <Button 
                    size="sm" 
                    className="h-7 bg-purple-600 text-white hover:bg-purple-700 border-0 text-xs whitespace-nowrap ml-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleInsert(asset);
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Insert
                  </Button>
                </div>
                
                <p className="text-sm font-semibold text-slate-800 group-hover:text-purple-700 mb-1 line-clamp-2">
                  {asset.title}
                </p>
                
                <p className="text-xs text-slate-500 line-clamp-2 mb-2">
                  {asset.content?.substring(0, 120)}...
                </p>
                
                {asset.sourceDocumentTitle && (
                  <p className="text-[11px] text-slate-400 flex items-center">
                    <FileText className="h-3 w-3 mr-1" />
                    Source: {asset.sourceDocumentTitle}
                    {asset.pageNumber && ` (Page ${asset.pageNumber})`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Asset Preview Modal */}
      {selectedPreview && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
          onClick={() => setSelectedPreview(null)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] overflow-auto m-4" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                {getAssetIcon(selectedPreview.assetType)}
                <h4 className="font-semibold text-lg">{selectedPreview.title}</h4>
                {selectedPreview.assetNumber && (
                  <Badge className="text-xs"># {selectedPreview.assetNumber}</Badge>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelectedPreview(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="p-6">
              <div className="bg-slate-50 p-4 rounded-lg mb-4 max-h-96 overflow-auto">
                <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono">
                  {selectedPreview.content}
                </pre>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                {selectedPreview.sourceDocumentTitle && (
                  <div>
                    <span className="font-semibold text-slate-700">Source:</span>
                    <p className="text-slate-600">{selectedPreview.sourceDocumentTitle}</p>
                  </div>
                )}
                {selectedPreview.pageNumber && (
                  <div>
                    <span className="font-semibold text-slate-700">Page:</span>
                    <p className="text-slate-600">{selectedPreview.pageNumber}</p>
                  </div>
                )}
                {selectedPreview.createdAt && (
                  <div>
                    <span className="font-semibold text-slate-700">Extracted:</span>
                    <p className="text-slate-600">{new Date(selectedPreview.createdAt).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button 
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => {
                    handleInsert(selectedPreview);
                    setSelectedPreview(null);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Insert into Document
                </Button>
                <Button variant="outline" onClick={() => setSelectedPreview(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Footer */}
      {!isLoading && assets.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <span>Showing {filteredAssets.length} of {assets.length} assets</span>
          <button 
            onClick={loadAssets}
            className="text-purple-600 hover:text-purple-700 font-medium"
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}

// Default assets for demonstration
function getDefaultAssets() {
  return [
    {
      id: 'demo-1',
      assetType: 'Table',
      title: 'Table 14.1.1 - Subject Disposition',
      content: 'Randomized: 250\nCompleted: 235\nDiscontinued: 15\nSafety Population: 248',
      sourceDocumentTitle: 'Clinical Study Report XYZ-123',
      assetNumber: '14.1.1',
      createdAt: new Date()
    },
    {
      id: 'demo-2',
      assetType: 'Figure',
      title: 'Figure 11.2.1 - Efficacy Over Time',
      content: '[Kaplan-Meier survival curve showing treatment effect]',
      sourceDocumentTitle: 'Efficacy Analysis Report',
      assetNumber: '11.2.1',
      createdAt: new Date()
    },
    {
      id: 'demo-3',
      assetType: 'Listing',
      title: 'Listing 16.2.7 - Individual Adverse Events',
      content: 'Subject ID | Event | Severity | Relationship\n001 | Headache | Mild | Possible\n002 | Nausea | Moderate | Probable',
      sourceDocumentTitle: 'Safety Listings',
      assetNumber: '16.2.7',
      createdAt: new Date()
    }
  ];
}
