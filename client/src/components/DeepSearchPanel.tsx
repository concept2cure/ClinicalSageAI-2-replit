/**
 * Deep Search Panel
 * 
 * Demonstrates the Knowledge Graph "Deep Search" capability.
 * Unlike vector search (finds similar text), graph search finds RELATED FACTS.
 * 
 * Example queries:
 * - "Show me all documents derived from Protocol v1"
 * - "Find all claims supported by Study NCT123456789"
 * - "What evidence supports this efficacy claim?"
 */

import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  GitBranch,
  FileText,
  ArrowRight,
  Network,
  Loader2,
} from 'lucide-react';
import { knowledgeGraph } from '@/services/KnowledgeGraphClient';

type SearchType = 'derived' | 'evidence' | 'path' | 'entity';

interface SearchResult {
  type: SearchType;
  data: any;
  message: string;
}

export default function DeepSearchPanel() {
  const [searchType, setSearchType] = useState<SearchType>('derived');
  const [sourceAtomId, setSourceAtomId] = useState('');
  const [targetAtomId, setTargetAtomId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entityValue, setEntityValue] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);

  // Search mutations
  const derivedSearch = useMutation({
    mutationFn: (atomId: string) => knowledgeGraph.findDerivedDocuments(atomId),
    onSuccess: (data) => setResult({ 
      type: 'derived', 
      data, 
      message: `Found ${data.count} documents derived from this source` 
    })
  });

  const evidenceSearch = useMutation({
    mutationFn: (atomId: string) => knowledgeGraph.findEvidence(atomId),
    onSuccess: (data) => setResult({ 
      type: 'evidence', 
      data, 
      message: `Found ${data.count} pieces of supporting evidence` 
    })
  });

  const pathSearch = useMutation({
    mutationFn: ({ source, target }: { source: string; target: string }) => 
      knowledgeGraph.findPath(source, target),
    onSuccess: (data) => setResult({ 
      type: 'path', 
      data, 
      message: data.found ? `Path found with length ${data.path?.length}` : 'No path found' 
    })
  });

  const entitySearch = useMutation({
    mutationFn: ({ type, value }: { type: string; value: string }) => 
      knowledgeGraph.searchEntities(type, value),
    onSuccess: (data) => setResult({ 
      type: 'entity', 
      data, 
      message: `Found ${data.count} atoms containing this entity` 
    })
  });

  const handleSearch = () => {
    switch (searchType) {
      case 'derived':
        derivedSearch.mutate(sourceAtomId);
        break;
      case 'evidence':
        evidenceSearch.mutate(sourceAtomId);
        break;
      case 'path':
        pathSearch.mutate({ source: sourceAtomId, target: targetAtomId });
        break;
      case 'entity':
        entitySearch.mutate({ type: entityType, value: entityValue });
        break;
    }
  };

  const isLoading = derivedSearch.isPending || evidenceSearch.isPending || 
                    pathSearch.isPending || entitySearch.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="w-5 h-5 text-purple-600" />
          Deep Regulatory Search
        </CardTitle>
        <CardDescription>
          Graph-based search finds RELATED FACTS, not just similar text.
          This is deterministic, not probabilistic.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Type Selection */}
        <div className="flex gap-4">
          <Select value={searchType} onValueChange={(v) => setSearchType(v as SearchType)}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select search type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="derived">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4" />
                  Find Derived Documents
                </div>
              </SelectItem>
              <SelectItem value="evidence">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Find Supporting Evidence
                </div>
              </SelectItem>
              <SelectItem value="path">
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4" />
                  Find Path Between
                </div>
              </SelectItem>
              <SelectItem value="entity">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Search by Entity
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Search Inputs */}
        <div className="flex gap-4">
          {(searchType === 'derived' || searchType === 'evidence' || searchType === 'path') && (
            <Input
              placeholder="Source Atom ID (e.g., protocol UUID)"
              value={sourceAtomId}
              onChange={(e) => setSourceAtomId(e.target.value)}
              className="flex-1"
            />
          )}
          
          {searchType === 'path' && (
            <Input
              placeholder="Target Atom ID"
              value={targetAtomId}
              onChange={(e) => setTargetAtomId(e.target.value)}
              className="flex-1"
            />
          )}

          {searchType === 'entity' && (
            <>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Entity type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NCT_ID">NCT ID</SelectItem>
                  <SelectItem value="DRUG_SUBSTANCE">Drug Substance</SelectItem>
                  <SelectItem value="INDICATION">Indication</SelectItem>
                  <SelectItem value="PRIMARY_ENDPOINT">Primary Endpoint</SelectItem>
                  <SelectItem value="SAMPLE_SIZE">Sample Size</SelectItem>
                  <SelectItem value="P_VALUE">P-Value</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Entity value"
                value={entityValue}
                onChange={(e) => setEntityValue(e.target.value)}
                className="flex-1"
              />
            </>
          )}

          <Button onClick={handleSearch} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Help Text */}
        <div className="text-xs text-slate-500 p-2 bg-slate-50 rounded">
          {searchType === 'derived' && (
            <span>💡 <strong>Use case:</strong> "Show me all documents derived from Protocol v1" - Returns a deterministic list, not a fuzzy guess.</span>
          )}
          {searchType === 'evidence' && (
            <span>💡 <strong>Use case:</strong> Find all evidence atoms that SUPPORT a specific claim through graph edges.</span>
          )}
          {searchType === 'path' && (
            <span>💡 <strong>Use case:</strong> Discover how two documents are related through the knowledge graph.</span>
          )}
          {searchType === 'entity' && (
            <span>💡 <strong>Use case:</strong> Find all documents mentioning a specific NCT ID, drug, or endpoint.</span>
          )}
        </div>

        {/* Results */}
        {result && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg">
            <div className="font-medium text-slate-700 mb-2">{result.message}</div>
            
            {result.type === 'derived' && result.data.derivedDocuments && (
              <div className="space-y-2">
                {result.data.derivedDocuments.map((doc: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <GitBranch className="w-4 h-4 text-slate-400" />
                    <span className="font-mono text-xs">{doc.atomId.substring(0, 8)}...</span>
                    <span>{doc.title}</span>
                    <Badge variant="outline" className="text-xs">
                      Depth: {doc.derivationPath?.length || 1}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {result.type === 'evidence' && result.data.evidence && (
              <div className="space-y-2">
                {result.data.evidence.map((ev: any, idx: number) => (
                  <div key={idx} className="p-2 bg-white rounded border text-sm">
                    <div className="flex items-center gap-2">
                      <Badge>{ev.relationshipType}</Badge>
                      <span className="text-xs text-slate-500">
                        Confidence: {(ev.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    {ev.evidenceText && (
                      <div className="mt-1 text-xs text-slate-600">{ev.evidenceText}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {result.type === 'path' && result.data.path && (
              <div className="flex items-center gap-2 flex-wrap">
                {result.data.path.path?.map((atomId: string, idx: number) => (
                  <React.Fragment key={idx}>
                    <Badge variant="outline" className="font-mono text-xs">
                      {atomId.substring(0, 8)}...
                    </Badge>
                    {idx < (result.data.path.path.length - 1) && (
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}

            {result.type === 'entity' && result.data.results && (
              <div className="space-y-2">
                {result.data.results.slice(0, 10).map((item: any, idx: number) => (
                  <div key={idx} className="text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span className="font-mono text-xs">{item.atomId.substring(0, 8)}...</span>
                    <Badge variant="outline">{item.entities?.length || 0} entities</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
