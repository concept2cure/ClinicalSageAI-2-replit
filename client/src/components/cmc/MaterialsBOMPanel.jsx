import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
 Boxes,
 Search,
 Plus,
 RefreshCw,
 AlertTriangle,
 CheckCircle2,
 ArrowRight,
 FileText,
 FlaskConical,
 Beaker,
 ListTree,
 Download,
 Filter,
 ShieldCheck,
 Clock,
 XCircle,
 Package,
 Scale,
 Warehouse,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const materialTypeColors = {
 'active-ingredient': 'bg-stone-100 text-stone-700',
 excipient: 'bg-green-100 text-green-700',
 'packaging-material': 'bg-purple-100 text-purple-700',
 solvent: 'bg-cyan-100 text-cyan-700',
 reagent: 'bg-orange-100 text-orange-700',
 intermediate: 'bg-indigo-100 text-indigo-700',
};

const specStatusColors = {
 approved: 'bg-green-100 text-green-700',
 pending: 'bg-yellow-100 text-yellow-700',
 'under-review': 'bg-stone-100 text-stone-700',
 rejected: 'bg-red-100 text-red-700',
 expired: 'bg-gray-100 text-gray-700',
};

export default function MaterialsBOMPanel() {
 const [activeTab, setActiveTab] = useState('materials');
 const [searchTerm, setSearchTerm] = useState('');
 const [typeFilter, setTypeFilter] = useState('all');

 const { data, isLoading, error, refetch } = useQuery({
 queryKey: ['cmc-materials', typeFilter],
 queryFn: async () => {
 const params = new URLSearchParams();
 if (typeFilter !== 'all') params.append('type', typeFilter);
 const response = await fetch(`/api/cmc/materials-bom?${params}`);
 if (!response.ok) throw new Error('Failed to fetch materials data');
 return response.json();
 },
 refetchInterval: 60000,
 });

 const materials = data?.materials || [];
 const boms = data?.boms || [];
 const specifications = data?.specifications || [];
 const summary = data?.summary || { totalMaterials: 0, approvedSpecs: 0, pendingSpecs: 0, activeBOMs: 0 };

 const filteredMaterials = materials.filter((m) =>
 !searchTerm ||
 m.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
 m.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
 m.supplier?.toLowerCase().includes(searchTerm.toLowerCase())
 );

 const filteredBOMs = boms.filter((b) =>
 !searchTerm ||
 b.product?.toLowerCase().includes(searchTerm.toLowerCase()) ||
 b.bomNumber?.toLowerCase().includes(searchTerm.toLowerCase())
 );

 return (
 <div className="space-y-4">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div>
 <h2 className="text-lg font-semibold flex items-center gap-2">
 <Boxes className="h-5 w-5 text-orange-600" />
 Materials, Specifications &amp; Bill of Materials
 </h2>
 <p className="text-sm text-muted-foreground mt-1">
 Manage raw materials, specifications, and product BOMs
 </p>
 </div>
 <div className="flex gap-2">
 <Button variant="outline" size="sm" onClick={() => refetch()}>
 <RefreshCw className="h-4 w-4 mr-1" /> Refresh
 </Button>
 <Button variant="outline" size="sm">
 <Download className="h-4 w-4 mr-1" /> Export
 </Button>
 <Button size="sm">
 <Plus className="h-4 w-4 mr-1" /> Add Material
 </Button>
 </div>
 </div>

 {/* Summary Cards */}
 <div className="grid grid-cols-4 gap-3">
 <Card>
 <CardContent className="p-3 flex items-center gap-3">
 <div className="h-10 w-10 rounded-lg bg-orange-50 flex items-center justify-center">
 <Boxes className="h-5 w-5 text-orange-600" />
 </div>
 <div>
 <div className="text-2xl font-bold">{summary.totalMaterials}</div>
 <div className="text-xs text-muted-foreground">Total Materials</div>
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-3 flex items-center gap-3">
 <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
 <ShieldCheck className="h-5 w-5 text-green-600" />
 </div>
 <div>
 <div className="text-2xl font-bold text-green-600">{summary.approvedSpecs}</div>
 <div className="text-xs text-muted-foreground">Approved Specs</div>
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-3 flex items-center gap-3">
 <div className="h-10 w-10 rounded-lg bg-yellow-50 flex items-center justify-center">
 <Clock className="h-5 w-5 text-yellow-600" />
 </div>
 <div>
 <div className="text-2xl font-bold text-yellow-600">{summary.pendingSpecs}</div>
 <div className="text-xs text-muted-foreground">Pending Review</div>
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-3 flex items-center gap-3">
 <div className="h-10 w-10 rounded-lg bg-stone-50 flex items-center justify-center">
 <ListTree className="h-5 w-5 text-stone-600" />
 </div>
 <div>
 <div className="text-2xl font-bold text-stone-600">{summary.activeBOMs}</div>
 <div className="text-xs text-muted-foreground">Active BOMs</div>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* Tabs */}
 <Tabs value={activeTab} onValueChange={setActiveTab}>
 <div className="flex items-center justify-between">
 <TabsList>
 <TabsTrigger value="materials">Materials</TabsTrigger>
 <TabsTrigger value="specifications">Specifications</TabsTrigger>
 <TabsTrigger value="bom">Bill of Materials</TabsTrigger>
 </TabsList>
 <div className="flex gap-2">
 <div className="relative">
 <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder="Search..."
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 className="pl-8 h-9 w-56"
 />
 </div>
 {activeTab === 'materials' && (
 <select
 value={typeFilter}
 onChange={(e) => setTypeFilter(e.target.value)}
 className="h-9 rounded-md border border-input bg-background px-3 text-sm"
 >
 <option value="all">All Types</option>
 <option value="active-ingredient">Active Ingredient</option>
 <option value="excipient">Excipient</option>
 <option value="packaging-material">Packaging Material</option>
 <option value="solvent">Solvent</option>
 <option value="reagent">Reagent</option>
 </select>
 )}
 </div>
 </div>

 <div className="mt-4">
 {isLoading ? (
 <Card>
 <CardContent className="p-8 text-center text-muted-foreground">
 <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
 Loading data...
 </CardContent>
 </Card>
 ) : error ? (
 <Card>
 <CardContent className="p-8 text-center text-muted-foreground">
 <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-yellow-500" />
 Unable to load data. Please try again.
 </CardContent>
 </Card>
 ) : activeTab === 'bom' ? (
 filteredBOMs.length === 0 ? (
 <Card>
 <CardContent className="p-8 text-center text-muted-foreground">
 <ListTree className="h-8 w-8 mx-auto mb-3 text-gray-300" />
 <p className="font-medium">No BOMs found</p>
 <p className="text-sm mt-1">Create a bill of materials for your products</p>
 </CardContent>
 </Card>
 ) : (
 <div className="space-y-3">
 {filteredBOMs.map((bom, idx) => (
 <Card key={bom.id || idx} className="hover:shadow-sm transition-shadow">
 <CardContent className="p-4">
 <div className="flex items-center justify-between mb-2">
 <div>
 <div className="font-medium">{bom.product || 'Untitled Product'}</div>
 <div className="text-xs text-muted-foreground font-mono">{bom.bomNumber || `BOM-${idx + 1}`}</div>
 </div>
 <div className="flex items-center gap-2">
 <Badge variant="outline" className="text-xs">v{bom.version || '1.0'}</Badge>
 <Badge className={`text-xs ${specStatusColors[bom.status] || 'bg-gray-100'}`}>
 {bom.status || 'N/A'}
 </Badge>
 </div>
 </div>
 <div className="grid grid-cols-3 gap-4 text-xs mt-3">
 <div>
 <span className="text-muted-foreground">Components:</span>{' '}
 <span className="font-medium">{bom.componentCount || 0}</span>
 </div>
 <div>
 <span className="text-muted-foreground">Batch Size:</span>{' '}
 <span className="font-medium">{bom.batchSize || '—'}</span>
 </div>
 <div>
 <span className="text-muted-foreground">Last Updated:</span>{' '}
 <span>{bom.lastUpdated || '—'}</span>
 </div>
 </div>
 {bom.components && bom.components.length > 0 && (
 <div className="mt-3 pt-3 border-t">
 <div className="text-xs font-medium mb-1">Components</div>
 <div className="space-y-1">
 {bom.components.slice(0, 5).map((comp, cIdx) => (
 <div key={cIdx} className="flex items-center justify-between text-xs">
 <span>{comp.name}</span>
 <span className="text-muted-foreground">{comp.quantity} {comp.unit}</span>
 </div>
 ))}
 {bom.components.length > 5 && (
 <div className="text-xs text-muted-foreground">+{bom.components.length - 5} more</div>
 )}
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 ))}
 </div>
 )
 ) : activeTab === 'specifications' ? (
 specifications.length === 0 ? (
 <Card>
 <CardContent className="p-8 text-center text-muted-foreground">
 <FileText className="h-8 w-8 mx-auto mb-3 text-gray-300" />
 <p className="font-medium">No specifications found</p>
 </CardContent>
 </Card>
 ) : (
 <div className="border rounded-lg overflow-hidden">
 <table className="w-full text-sm">
 <thead>
 <tr className="bg-muted/50 border-b">
 <th className="text-left font-medium p-3">Spec ID</th>
 <th className="text-left font-medium p-3">Material</th>
 <th className="text-left font-medium p-3">Test</th>
 <th className="text-left font-medium p-3">Acceptance Criteria</th>
 <th className="text-left font-medium p-3">Status</th>
 <th className="text-left font-medium p-3">Actions</th>
 </tr>
 </thead>
 <tbody>
 {specifications.map((spec, idx) => (
 <tr key={spec.id || idx} className="border-t hover:bg-muted/30 transition-colors">
 <td className="p-3 font-mono text-xs">{spec.specId || `SPEC-${idx + 1}`}</td>
 <td className="p-3 font-medium">{spec.material || 'N/A'}</td>
 <td className="p-3">{spec.test || '—'}</td>
 <td className="p-3 text-muted-foreground text-xs">{spec.criteria || '—'}</td>
 <td className="p-3">
 <Badge className={`text-xs ${specStatusColors[spec.status] || 'bg-gray-100'}`}>
 {spec.status || 'N/A'}
 </Badge>
 </td>
 <td className="p-3">
 <Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4" /></Button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )
 ) : filteredMaterials.length === 0 ? (
 <Card>
 <CardContent className="p-8 text-center text-muted-foreground">
 <Boxes className="h-8 w-8 mx-auto mb-3 text-gray-300" />
 <p className="font-medium">No materials found</p>
 <p className="text-sm mt-1">
 {searchTerm ? 'Adjust your search or filters' : 'Add materials to your inventory'}
 </p>
 </CardContent>
 </Card>
 ) : (
 <div className="border rounded-lg overflow-hidden">
 <table className="w-full text-sm">
 <thead>
 <tr className="bg-muted/50 border-b">
 <th className="text-left font-medium p-3">Code</th>
 <th className="text-left font-medium p-3">Material Name</th>
 <th className="text-left font-medium p-3">Type</th>
 <th className="text-left font-medium p-3">Supplier</th>
 <th className="text-left font-medium p-3">Grade</th>
 <th className="text-left font-medium p-3">Status</th>
 <th className="text-left font-medium p-3">Actions</th>
 </tr>
 </thead>
 <tbody>
 {filteredMaterials.map((mat, idx) => (
 <tr key={mat.id || idx} className="border-t hover:bg-muted/30 transition-colors">
 <td className="p-3 font-mono text-xs">{mat.code || `MAT-${idx + 1}`}</td>
 <td className="p-3 font-medium">{mat.name || 'Unnamed'}</td>
 <td className="p-3">
 <Badge variant="outline" className={`text-xs ${materialTypeColors[mat.type] || ''}`}>
 {mat.type?.replace('-', ' ') || 'N/A'}
 </Badge>
 </td>
 <td className="p-3 text-muted-foreground">{mat.supplier || '—'}</td>
 <td className="p-3 text-xs">{mat.grade || '—'}</td>
 <td className="p-3">
 <Badge className={`text-xs ${specStatusColors[mat.status] || 'bg-gray-100'}`}>
 {mat.status || 'N/A'}
 </Badge>
 </td>
 <td className="p-3">
 <Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4" /></Button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 </Tabs>
 </div>
 );
}
