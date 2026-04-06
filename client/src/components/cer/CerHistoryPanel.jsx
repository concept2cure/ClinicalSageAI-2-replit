import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from '@/components/ui/table';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogFooter,
} from '@/components/ui/dialog';
import {
 Search,
 FileText,
 History,
 Download,
 Eye,
 ArrowUpDown,
 CalendarDays,
 Users,
 GitCompare,
 Clock,
} from 'lucide-react';
import axios from 'axios';
import { toast } from '@/hooks/use-toast';

export default function CerHistoryPanel() {
 const [loading, setLoading] = useState(false);
 const [history, setHistory] = useState([]);
 const [searchTerm, setSearchTerm] = useState('');
 const [sortColumn, setSortColumn] = useState('created_at');
 const [sortDirection, setSortDirection] = useState('desc');
 const [selectedVersion, setSelectedVersion] = useState(null);
 const [compareVersions, setCompareVersions] = useState([]);
 const [showCompareDialog, setShowCompareDialog] = useState(false);
 const [compareResultLoading, setCompareResultLoading] = useState(false);
 const [compareResults, setCompareResults] = useState(null);

 useEffect(() => {
 loadHistory();
 }, []);

 const loadHistory = async () => {
 setLoading(true);
 try {
 // In a real app, we would fetch data from the server
 // const res = await axios.get('/api/cer/history');
 // setHistory(res.data.history);

 // Mock data for demo
 await new Promise(resolve => setTimeout(resolve, 800));
 setHistory([
 {
 id: 'v1.0.5',
 created_at: '2025-04-28T15:30:00Z',
 device_name: 'Enzymex Forte',
 author: 'Michael Chen',
 status: 'approved',
 changes: 'Updated clinical data section with new study results',
 template: 'EU MDR',
 size: '2.3 MB',
 },
 {
 id: 'v1.0.4',
 created_at: '2025-04-20T12:45:00Z',
 device_name: 'Enzymex Forte',
 author: 'Sarah Johnson',
 status: 'approved',
 changes: 'Revised risk analysis based on post-market data',
 template: 'EU MDR',
 size: '2.2 MB',
 },
 {
 id: 'v1.0.3',
 created_at: '2025-04-10T09:15:00Z',
 device_name: 'Enzymex Forte',
 author: 'Michael Chen',
 status: 'approved',
 changes: 'Updated literature review with recent publications',
 template: 'EU MDR',
 size: '2.1 MB',
 },
 {
 id: 'v1.0.2',
 created_at: '2025-03-25T14:20:00Z',
 device_name: 'Enzymex Forte',
 author: 'John Smith',
 status: 'rejected',
 changes: 'Minor formatting adjustments to comply with regulatory standards',
 template: 'EU MDR',
 size: '2.0 MB',
 },
 {
 id: 'v1.0.1',
 created_at: '2025-03-15T11:30:00Z',
 device_name: 'Enzymex Forte',
 author: 'Sarah Johnson',
 status: 'approved',
 changes: 'Initial approved version',
 template: 'EU MDR',
 size: '1.9 MB',
 },
 {
 id: 'v1.0.0',
 created_at: '2025-03-10T10:00:00Z',
 device_name: 'Enzymex Forte',
 author: 'Michael Chen',
 status: 'draft',
 changes: 'Initial draft',
 template: 'EU MDR',
 size: '1.8 MB',
 },
 ]);
 } catch (err) {
 console.error('Failed to load history', err);
 } finally {
 setLoading(false);
 }
 };

 const sortHistory = column => {
 if (sortColumn === column) {
 // Toggle direction if clicking the same column
 setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
 } else {
 // Default to descending for new column
 setSortColumn(column);
 setSortDirection('desc');
 }
 };

 const filteredAndSortedHistory = history
 .filter(item => {
 if (!searchTerm) return true;
 const searchTermLower = searchTerm.toLowerCase();
 return (
 item.id.toLowerCase().includes(searchTermLower) ||
 item.device_name.toLowerCase().includes(searchTermLower) ||
 item.author.toLowerCase().includes(searchTermLower) ||
 item.changes.toLowerCase().includes(searchTermLower)
 );
 })
 .sort((a, b) => {
 // Sort by the selected column
 let valueA = a[sortColumn];
 let valueB = b[sortColumn];

 // Convert dates to timestamps for comparison
 if (sortColumn === 'created_at') {
 valueA = new Date(valueA).getTime();
 valueB = new Date(valueB).getTime();
 }

 if (valueA < valueB) return sortDirection === 'asc' ? -1 : 1;
 if (valueA > valueB) return sortDirection === 'asc' ? 1 : -1;
 return 0;
 });

 const handleViewVersion = version => {
 setSelectedVersion(version);
 // In a real app, this would open the document in a viewer
 window.open(`/api/cer/history/${version.id}/view`, '_blank');
 };

 const handleDownloadVersion = version => {
 // In a real app, this would trigger a download
 window.open(`/api/cer/history/${version.id}/download`, '_blank');
 };

 const toggleVersionForComparison = version => {
 if (compareVersions.some(v => v.id === version.id)) {
 // Remove version if already selected
 setCompareVersions(compareVersions.filter(v => v.id !== version.id));
 } else {
 // Add version if not selected, limiting to 2 versions max
 if (compareVersions.length < 2) {
 setCompareVersions([...compareVersions, version]);
 } else {
 // Replace the oldest selected version
 setCompareVersions([compareVersions[1], version]);
 }
 }
 };

 const compareSelectedVersions = async () => {
 if (compareVersions.length !== 2) {
 toast({ title: 'Please select exactly 2 versions to compare' });
 return;
 }

 setShowCompareDialog(true);
 setCompareResultLoading(true);

 try {
 // In a real app, we would call the API to get a comparison
 // const res = await axios.post('/api/cer/history/compare', {
 // versionA: compareVersions[0].id,
 // versionB: compareVersions[1].id
 // });
 // setCompareResults(res.data);

 // Mock data for demo
 await new Promise(resolve => setTimeout(resolve, 1500));

 // Sort versions chronologically for comparison
 const sortedVersions = [...compareVersions].sort(
 (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
 );

 setCompareResults({
 versionA: sortedVersions[0],
 versionB: sortedVersions[1],
 differences: [
 {
 section: 'Clinical Data Analysis',
 changes: [
 {
 type: 'addition',
 content:
 'Added reference to clinical study XYZ-2025-003 with 120 patients showing 95% efficacy.',
 },
 {
 type: 'modification',
 content:
 'Updated safety data statistics from 92% to 94% based on long-term follow-up.',
 },
 ],
 },
 {
 section: 'Risk Analysis',
 changes: [
 {
 type: 'addition',
 content: 'Added mitigation strategy for newly identified minor risk factor.',
 },
 {
 type: 'removal',
 content: 'Removed outdated risk assessment methodology references.',
 },
 ],
 },
 {
 section: 'Literature Review',
 changes: [
 {
 type: 'addition',
 content: 'Added 4 new publications from Q1 2025.',
 },
 ],
 },
 ],
 summary: {
 addedSections: 0,
 removedSections: 0,
 modifiedSections: 3,
 totalChanges: 5,
 },
 });
 } catch (err) {
 console.error('Failed to compare versions', err);
 } finally {
 setCompareResultLoading(false);
 }
 };

 const getStatusBadge = status => {
 switch (status) {
 case 'approved':
 return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
 case 'rejected':
 return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
 case 'draft':
 return <Badge className="bg-gray-100 text-gray-800">Draft</Badge>;
 case 'pending':
 return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
 default:
 return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>;
 }
 };

 const formatDate = dateString => {
 return new Date(dateString).toLocaleString();
 };

 const getChangeBadge = type => {
 switch (type) {
 case 'addition':
 return <Badge className="bg-green-100 text-green-800">Added</Badge>;
 case 'removal':
 return <Badge className="bg-red-100 text-red-800">Removed</Badge>;
 case 'modification':
 return <Badge className="bg-stone-100 text-stone-800">Modified</Badge>;
 default:
 return <Badge className="bg-gray-100 text-gray-800">{type}</Badge>;
 }
 };

 if (loading)
 return (
 <div className="flex justify-center items-center p-12">
 <div className="w-full max-w-md">
 <p className="text-center mb-4">Loading version history...</p>
 <Progress value={65} className="w-full" />
 </div>
 </div>
 );

 return (
 <div className="space-y-6">
 <Card>
 <CardContent className="pt-6">
 <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 mb-4">
 <h3 className="text-lg font-semibold flex items-center">
 <History className="mr-2 h-5 w-5 text-gray-500" />
 CER Version History
 </h3>
 <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
 <div className="relative flex-1">
 <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
 <Input
 placeholder="Search versions..."
 className="pl-8"
 value={searchTerm}
 onChange={e => setSearchTerm(e.target.value)}
 />
 </div>
 {compareVersions.length > 0 && (
 <Button
 variant="outline"
 onClick={compareSelectedVersions}
 className="whitespace-nowrap"
 disabled={compareVersions.length !== 2}
 >
 <GitCompare className="mr-2 h-4 w-4" />
 Compare ({compareVersions.length}/2)
 </Button>
 )}
 </div>
 </div>

 <Tabs defaultValue="versions" className="space-y-4">
 <TabsList>
 <TabsTrigger value="versions" className="flex items-center">
 <FileText className="mr-2 h-4 w-4" />
 Versions
 </TabsTrigger>
 <TabsTrigger value="timeline" className="flex items-center">
 <Clock className="mr-2 h-4 w-4" />
 Timeline
 </TabsTrigger>
 </TabsList>

 <TabsContent value="versions">
 <div className="rounded-md border">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="w-12">
 <span className="sr-only">Compare</span>
 </TableHead>
 <TableHead
 className="cursor-pointer hover:text-primary w-24"
 onClick={() => sortHistory('id')}
 >
 <div className="flex items-center">
 Version
 {sortColumn === 'id' && (
 <ArrowUpDown className="ml-1 h-3 w-3" data-direction={sortDirection} />
 )}
 </div>
 </TableHead>
 <TableHead
 className="cursor-pointer hover:text-primary w-40"
 onClick={() => sortHistory('created_at')}
 >
 <div className="flex items-center">
 Date
 {sortColumn === 'created_at' && (
 <ArrowUpDown className="ml-1 h-3 w-3" data-direction={sortDirection} />
 )}
 </div>
 </TableHead>
 <TableHead
 className="cursor-pointer hover:text-primary"
 onClick={() => sortHistory('device_name')}
 >
 <div className="flex items-center">
 Device
 {sortColumn === 'device_name' && (
 <ArrowUpDown className="ml-1 h-3 w-3" data-direction={sortDirection} />
 )}
 </div>
 </TableHead>
 <TableHead
 className="cursor-pointer hover:text-primary"
 onClick={() => sortHistory('author')}
 >
 <div className="flex items-center">
 Author
 {sortColumn === 'author' && (
 <ArrowUpDown className="ml-1 h-3 w-3" data-direction={sortDirection} />
 )}
 </div>
 </TableHead>
 <TableHead
 className="cursor-pointer hover:text-primary"
 onClick={() => sortHistory('status')}
 >
 <div className="flex items-center">
 Status
 {sortColumn === 'status' && (
 <ArrowUpDown className="ml-1 h-3 w-3" data-direction={sortDirection} />
 )}
 </div>
 </TableHead>
 <TableHead>Changes</TableHead>
 <TableHead>Template</TableHead>
 <TableHead>Size</TableHead>
 <TableHead className="text-right">Actions</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {filteredAndSortedHistory.length === 0 ? (
 <TableRow>
 <TableCell colSpan={9} className="text-center py-8 text-gray-500">
 {searchTerm
 ? 'No versions match your search criteria'
 : 'No version history available'}
 </TableCell>
 </TableRow>
 ) : (
 filteredAndSortedHistory.map(version => (
 <TableRow key={version.id} className="group">
 <TableCell>
 <input
 type="checkbox"
 checked={compareVersions.some(v => v.id === version.id)}
 onChange={() => toggleVersionForComparison(version)}
 className="rounded border-gray-300 text-primary focus:ring-primary"
 />
 </TableCell>
 <TableCell className="font-mono text-xs">{version.id}</TableCell>
 <TableCell>{formatDate(version.created_at)}</TableCell>
 <TableCell>{version.device_name}</TableCell>
 <TableCell>{version.author}</TableCell>
 <TableCell>{getStatusBadge(version.status)}</TableCell>
 <TableCell className="max-w-[200px] truncate">
 <span title={version.changes}>{version.changes}</span>
 </TableCell>
 <TableCell>{version.template}</TableCell>
 <TableCell>{version.size}</TableCell>
 <TableCell className="text-right">
 <div className="flex justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
 <Button
 size="sm"
 variant="ghost"
 onClick={() => handleViewVersion(version)}
 >
 <Eye className="h-4 w-4" />
 </Button>
 <Button
 size="sm"
 variant="ghost"
 onClick={() => handleDownloadVersion(version)}
 >
 <Download className="h-4 w-4" />
 </Button>
 </div>
 </TableCell>
 </TableRow>
 ))
 )}
 </TableBody>
 </Table>
 </div>
 </TabsContent>

 <TabsContent value="timeline" className="space-y-6">
 <div className="space-y-8">
 {filteredAndSortedHistory.map((version, idx) => (
 <div key={version.id} className="relative">
 {/* Timeline connector line */}
 {idx !== filteredAndSortedHistory.length - 1 && (
 <div className="absolute left-2 top-10 bottom-0 w-0.5 bg-gray-200" />
 )}

 <div className="flex items-start space-x-4">
 {/* Timeline marker */}
 <div className="flex-shrink-0 mt-1">
 <div
 className={`h-5 w-5 rounded-full ${
 version.status === 'approved'
 ? 'bg-green-500'
 : version.status === 'rejected'
 ? 'bg-red-500'
 : 'bg-gray-400'
 }`}
 />
 </div>

 {/* Timeline content */}
 <Card className="flex-grow">
 <CardContent className="p-4">
 <div className="flex justify-between items-start mb-2">
 <div>
 <h4 className="font-medium flex items-center">
 Version {version.id}
 <span className="mx-2 text-gray-300">•</span>
 {getStatusBadge(version.status)}
 </h4>
 <div className="flex items-center text-sm text-gray-500 mt-1 space-x-4">
 <span className="flex items-center">
 <CalendarDays className="mr-1 h-3.5 w-3.5" />
 {formatDate(version.created_at)}
 </span>
 <span className="flex items-center">
 <Users className="mr-1 h-3.5 w-3.5" />
 {version.author}
 </span>
 </div>
 </div>
 <div className="flex space-x-2">
 <Button
 size="sm"
 variant="outline"
 onClick={() => handleViewVersion(version)}
 >
 <Eye className="mr-2 h-3.5 w-3.5" />
 View
 </Button>
 <Button
 size="sm"
 variant="outline"
 onClick={() => handleDownloadVersion(version)}
 >
 <Download className="mr-2 h-3.5 w-3.5" />
 Download
 </Button>
 </div>
 </div>

 <div className="mt-3">
 <h5 className="text-sm font-medium mb-1">Changes:</h5>
 <p className="text-sm text-gray-600">{version.changes}</p>
 </div>

 <div className="mt-4 flex justify-between text-xs text-gray-500">
 <span>Template: {version.template}</span>
 <span>Size: {version.size}</span>
 </div>
 </CardContent>
 </Card>
 </div>
 </div>
 ))}
 </div>
 </TabsContent>
 </Tabs>
 </CardContent>
 </Card>

 {/* Version Comparison Dialog */}
 <Dialog open={showCompareDialog} onOpenChange={setShowCompareDialog}>
 <DialogContent className="max-w-4xl">
 <DialogHeader>
 <DialogTitle>
 Version Comparison: {compareVersions[0]?.id} vs {compareVersions[1]?.id}
 </DialogTitle>
 </DialogHeader>

 {compareResultLoading ? (
 <div className="py-8 text-center">
 <Progress value={70} className="w-full mb-4" />
 <p className="text-gray-500">Analyzing differences between versions...</p>
 </div>
 ) : compareResults ? (
 <div className="space-y-6 max-h-[70vh] overflow-auto p-2">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Card>
 <CardContent className="pt-4">
 <h3 className="text-sm font-medium mb-2">
 Version {compareResults.versionA.id}
 </h3>
 <div className="text-xs text-gray-500 space-y-1">
 <div className="flex justify-between">
 <span>Date:</span>
 <span>{formatDate(compareResults.versionA.created_at)}</span>
 </div>
 <div className="flex justify-between">
 <span>Author:</span>
 <span>{compareResults.versionA.author}</span>
 </div>
 <div className="flex justify-between">
 <span>Status:</span>
 <span>{compareResults.versionA.status}</span>
 </div>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardContent className="pt-4">
 <h3 className="text-sm font-medium mb-2">
 Version {compareResults.versionB.id}
 </h3>
 <div className="text-xs text-gray-500 space-y-1">
 <div className="flex justify-between">
 <span>Date:</span>
 <span>{formatDate(compareResults.versionB.created_at)}</span>
 </div>
 <div className="flex justify-between">
 <span>Author:</span>
 <span>{compareResults.versionB.author}</span>
 </div>
 <div className="flex justify-between">
 <span>Status:</span>
 <span>{compareResults.versionB.status}</span>
 </div>
 </div>
 </CardContent>
 </Card>
 </div>

 <div className="space-y-2">
 <h3 className="text-lg font-medium">Change Summary</h3>
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
 <Card>
 <CardContent className="p-4 text-center">
 <div className="text-2xl font-bold text-stone-600">
 {compareResults.summary.modifiedSections}
 </div>
 <div className="text-sm text-gray-500">Modified Sections</div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4 text-center">
 <div className="text-2xl font-bold text-green-600">
 {compareResults.summary.addedSections}
 </div>
 <div className="text-sm text-gray-500">Added Sections</div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4 text-center">
 <div className="text-2xl font-bold text-red-600">
 {compareResults.summary.removedSections}
 </div>
 <div className="text-sm text-gray-500">Removed Sections</div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-4 text-center">
 <div className="text-2xl font-bold">
 {compareResults.summary.totalChanges}
 </div>
 <div className="text-sm text-gray-500">Total Changes</div>
 </CardContent>
 </Card>
 </div>
 </div>

 <div className="space-y-4">
 <h3 className="text-lg font-medium">Detailed Changes</h3>
 {compareResults.differences.map((section, idx) => (
 <Card key={idx}>
 <CardContent className="pt-4">
 <h4 className="font-medium mb-3">Section: {section.section}</h4>
 <div className="space-y-2">
 {section.changes.map((change, changeIdx) => (
 <div
 key={changeIdx}
 className="flex items-start space-x-3 py-2 border-t first:border-t-0"
 >
 <div>{getChangeBadge(change.type)}</div>
 <div className="text-sm">{change.content}</div>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 </div>
 ) : (
 <div className="py-8 text-center text-gray-500">No comparison data available</div>
 )}

 <DialogFooter>
 <Button variant="outline" onClick={() => setShowCompareDialog(false)}>
 Close
 </Button>
 {compareResults && (
 <Button>
 <Download className="mr-2 h-4 w-4" />
 Download Comparison Report
 </Button>
 )}
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}
