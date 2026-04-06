/**
 * Phase 6.6.F — Lineage Graph Panel
 *
 * Displays the predicate family tree as a visual graph, showing parent–child
 * relationships, family toxicity, and recall propagation across generations.
 *
 * Uses the useLineageGraph hook (GET /lineage/:kNumber/graph) to fetch edges
 * and renders them as an interactive tree table with depth indicators.
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, GitBranch, Layers, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useLineageGraph } from '@/hooks/use-predicate-intelligence';
import type { LineageEdge } from '../../../shared/types/predicate-intelligence';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface LineageGraphPanelProps {
 programId: string;
 kNumber: string;
 maxDepth?: number;
}

interface TreeNode {
 kNumber: string;
 deviceName?: string;
 productCode?: string;
 relationship: string;
 distance: number;
 confidence: number;
 children: TreeNode[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function buildTree(edges: LineageEdge[], rootK: string, maxDepth: number = 4): TreeNode[] {
 // Group edges by child → parents
 const byChild = new Map<string, LineageEdge[]>();
 for (const e of edges) {
 const list = byChild.get(e.child_k_number) || [];
 list.push(e);
 byChild.set(e.child_k_number, list);
 }

 // Root's direct parents
 const rootEdges = byChild.get(rootK) || [];
 if (rootEdges.length === 0 && edges.length > 0) {
 // Flat fallback: just show all edges sorted by distance
 return edges.map(e => ({
 kNumber: e.parent_k_number,
 deviceName: e.parent_device_name,
 productCode: e.parent_product_code,
 relationship: e.relationship_type,
 distance: e.distance,
 confidence: e.confidence,
 children: [],
 }));
 }

 function recurse(childK: string, depth: number, maxD: number, visited: Set<string>): TreeNode[] {
 const parents = byChild.get(childK) || [];
 return parents
 .filter(e => !visited.has(e.parent_k_number)) // cycle detection
 .map(e => {
 const nextVisited = new Set(visited);
 nextVisited.add(e.parent_k_number);
 return {
 kNumber: e.parent_k_number,
 deviceName: e.parent_device_name,
 productCode: e.parent_product_code,
 relationship: e.relationship_type,
 distance: e.distance,
 confidence: e.confidence,
 children: depth < maxD ? recurse(e.parent_k_number, depth + 1, maxD, nextVisited) : [],
 };
 });
 }

 return recurse(rootK, 1, maxDepth, new Set([rootK]));
}

function flattenTree(nodes: TreeNode[], depth = 0): Array<TreeNode & { depth: number }> {
 const result: Array<TreeNode & { depth: number }> = [];
 for (const n of nodes) {
 result.push({ ...n, depth });
 result.push(...flattenTree(n.children, depth + 1));
 }
 return result;
}

function FamilyToxicityIndicator({ score }: { score: number }) {
 if (score >= 0.6) {
 return (
 <Badge variant="destructive" className="text-xs" data-testid="family-toxicity-high">
 <AlertTriangle className="h-3 w-3 mr-1" />
 Family Toxicity: {(score * 100).toFixed(0)}%
 </Badge>
 );
 }
 if (score >= 0.3) {
 return (
 <Badge
 variant="outline"
 className="bg-stone-100 text-stone-700 border-stone-300 text-xs"
 data-testid="family-toxicity-moderate"
 >
 <ShieldAlert className="h-3 w-3 mr-1" />
 Family Toxicity: {(score * 100).toFixed(0)}%
 </Badge>
 );
 }
 return (
 <Badge
 variant="outline"
 className="bg-stone-100 text-stone-800 border-stone-300 text-xs"
 data-testid="family-toxicity-low"
 >
 <ShieldCheck className="h-3 w-3 mr-1" />
 Family Toxicity: {(score * 100).toFixed(0)}%
 </Badge>
 );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export function LineageGraphPanel({ programId, kNumber, maxDepth = 2 }: LineageGraphPanelProps) {
 const { data: graph, isLoading, isError, error } = useLineageGraph(programId, kNumber, maxDepth);

 const flatRows = useMemo(() => {
 if (!graph?.edges) return [];
 const tree = buildTree(graph.edges, graph.root_k_number, maxDepth);
 return flattenTree(tree);
 }, [graph, maxDepth]);

 // ─── Loading ──────────────────────────────────────────────────────────────
 if (isLoading) {
 return (
 <Card data-testid="lineage-graph-panel">
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <GitBranch className="h-5 w-5" />
 Predicate Lineage
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-3">
 {[1, 2, 3].map(i => (
 <Skeleton key={i} className="h-8 w-full" />
 ))}
 </CardContent>
 </Card>
 );
 }

 // ─── Error ────────────────────────────────────────────────────────────────
 if (isError) {
 return (
 <Card data-testid="lineage-graph-panel">
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <GitBranch className="h-5 w-5" />
 Predicate Lineage
 </CardTitle>
 </CardHeader>
 <CardContent>
 <p className="text-sm text-muted-foreground">
 Failed to load lineage graph{error instanceof Error ? `: ${error.message}` : '.'}
 </p>
 </CardContent>
 </Card>
 );
 }

 // ─── Empty ────────────────────────────────────────────────────────────────
 if (!graph || graph.edges.length === 0) {
 return (
 <Card data-testid="lineage-graph-panel">
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <GitBranch className="h-5 w-5" />
 Predicate Lineage
 </CardTitle>
 <CardDescription>Family tree for {kNumber}</CardDescription>
 </CardHeader>
 <CardContent>
 <div className="text-center py-8 text-muted-foreground">
 <Layers className="h-10 w-10 mx-auto mb-2 opacity-30" />
 <p className="text-sm">No lineage data available for this predicate.</p>
 </div>
 </CardContent>
 </Card>
 );
 }

 // ─── Render ───────────────────────────────────────────────────────────────
 return (
 <Card data-testid="lineage-graph-panel">
 <CardHeader>
 <div className="flex items-center justify-between">
 <div>
 <CardTitle className="flex items-center gap-2">
 <GitBranch className="h-5 w-5" />
 Predicate Lineage
 </CardTitle>
 <CardDescription className="mt-1">
 Family tree for <span className="font-mono">{graph.root_k_number}</span> —{' '}
 {graph.total_nodes} node{graph.total_nodes !== 1 ? 's' : ''}, depth {graph.max_depth}
 </CardDescription>
 </div>
 <FamilyToxicityIndicator score={graph.family_toxicity} />
 </div>
 </CardHeader>
 <CardContent>
 <Table aria-label={`Predicate lineage tree for ${graph.root_k_number}`}>
 <TableHeader>
 <TableRow>
 <TableHead>Predicate K-Number</TableHead>
 <TableHead>Device / Product Code</TableHead>
 <TableHead>Relationship</TableHead>
 <TableHead className="text-center">Generation</TableHead>
 <TableHead className="text-right">Confidence</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {flatRows.map((row, idx) => (
 <TableRow key={`${row.kNumber}-${idx}`}>
 <TableCell className="font-mono text-sm">
 <span
 style={{ paddingLeft: `${row.depth * 20}px` }}
 className="flex items-center gap-1"
 >
 {row.depth > 0 && (
 <span className="text-muted-foreground select-none">{'└─'}</span>
 )}
 {row.kNumber}
 </span>
 </TableCell>
 <TableCell className="text-sm">
 {row.deviceName || '—'}
 {row.productCode && (
 <span className="ml-1 text-xs text-muted-foreground">({row.productCode})</span>
 )}
 </TableCell>
 <TableCell>
 <Badge variant="outline" className="text-xs capitalize">
 {row.relationship.replace(/_/g, ' ')}
 </Badge>
 </TableCell>
 <TableCell className="text-center">
 <Badge variant="secondary" className="text-xs">
 Gen {row.distance}
 </Badge>
 </TableCell>
 <TableCell className="text-right text-sm">
 {(row.confidence * 100).toFixed(0)}%
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </CardContent>
 </Card>
 );
}
