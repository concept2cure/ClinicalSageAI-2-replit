import { useState, useEffect } from 'react';
import { useParams, Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FileText,
  Copy,
  FileDown,
  History,
  Clock,
  ExternalLink,
  CornerUpLeft,
  Edit,
  Eye,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';

export default function DossierViewer() {
  const { dossier_id } = useParams();
  const { toast } = useToast();
  
  const [dossier, setDossier] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [selectedVersion, setSelectedVersion] = useState<any>(null);
  const [loadingVersion, setLoadingVersion] = useState<boolean>(false);
  
  // Fetch dossier data when component mounts
  useEffect(() => {
    const fetchDossier = async () => {
      if (!dossier_id) return;
      
      try {
        const data = await apiRequest('GET', `/api/dossier/${dossier_id}`);
        setDossier(data);
      } catch (error) {
        console.error('Error fetching dossier:', error);
        // toast call replaced
  // Original: toast({
          title: 'Error',
          description: 'Failed to load dossier data',
          variant: 'destructive'
        })
  console.log('Toast would show:', {
          title: 'Error',
          description: 'Failed to load dossier data',
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchDossier();
  }, [dossier_id, toast]);

  // Format datetime string
  const formatDateTime = (dateTimeStr: string) => {
    try {
      return format(new Date(dateTimeStr), 'MMM d, yyyy h:mm a');
    } catch (error) {
      return dateTimeStr;
    }
  };

  // Copy version content to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // toast call replaced
  // Original: toast({
      title: 'Copied',
      description: 'Content copied to clipboard'
    })
  console.log('Toast would show:', {
      title: 'Copied',
      description: 'Content copied to clipboard'
    });
  };

  // View a specific version
  const viewVersion = (version: any) => {
    setLoadingVersion(true);
    setSelectedVersion(version);
    setActiveTab('version-details');
    setLoadingVersion(false);
  };

  // Navigate back to version list
  const backToVersions = () => {
    setSelectedVersion(null);
    setActiveTab('versions');
  };

  // Navigate to protocol optimizer with this dossier
  const goToOptimizer = () => {
    window.location.href = `/protocol-optimizer?dossier_id=${dossier_id}`;
  };

  // Shareable link for the dossier
  const getDossierShareableLink = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/dossier/${dossier_id}`;
  };

  // Copy shareable link to clipboard  
  const copyShareableLink = () => {
    const link = getDossierShareableLink();
    navigator.clipboard.writeText(link);
    // toast call replaced
  // Original: toast({
      title: 'Link Copied',
      description: 'Shareable link copied to clipboard'
    })
  console.log('Toast would show:', {
      title: 'Link Copied',
      description: 'Shareable link copied to clipboard'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
          <p className="text-xl font-medium">Loading dossier...</p>
        </div>
      </div>
    );
  }

  if (!dossier) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <h2 className="text-red-600 text-lg font-medium">Dossier Not Found</h2>
          <p className="text-red-600 mt-1">
            The requested dossier could not be found. It may have been deleted or you may not have permission to view it.
          </p>
          <Link href="/dashboard">
            <Button className="mt-3" variant="outline">
              Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-blue-700">{dossier.name}</h1>
          <p className="text-gray-600">{dossier.description || 'No description'}</p>
          <div className="flex items-center mt-2 text-sm text-gray-500">
            <Clock className="h-4 w-4 mr-1" />
            <span>Created: {formatDateTime(dossier.created_at)}</span>
            <span className="mx-2">•</span>
            <Clock className="h-4 w-4 mr-1" />
            <span>Updated: {formatDateTime(dossier.updated_at)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyShareableLink}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Share
          </Button>
          <Button onClick={goToOptimizer}>
            <Edit className="h-4 w-4 mr-2" />
            New Optimization
          </Button>
        </div>
      </div>
      
      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="csrs">
            Selected CSRs ({dossier.csrs?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="versions">
            Protocol Versions ({dossier.optimizer_versions?.length || 0})
          </TabsTrigger>
          {selectedVersion && (
            <TabsTrigger value="version-details">Version Details</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Dossier Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-md">
                  <p className="text-blue-700 font-medium">CSRs Selected</p>
                  <p className="text-2xl font-bold">{dossier.csrs?.length || 0}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-md">
                  <p className="text-green-700 font-medium">Protocol Versions</p>
                  <p className="text-2xl font-bold">{dossier.optimizer_versions?.length || 0}</p>
                </div>
                <div className="bg-amber-50 p-4 rounded-md">
                  <p className="text-amber-700 font-medium">Notes Added</p>
                  <p className="text-2xl font-bold">{Object.keys(dossier.notes || {}).length}</p>
                </div>
              </div>
              
              <div className="mt-6">
                <h3 className="text-lg font-medium mb-2">Actions</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button variant="outline" className="justify-start" onClick={() => setActiveTab('csrs')}>
                    <FileText className="h-4 w-4 mr-2" />
                    View Selected CSRs
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={() => setActiveTab('versions')}>
                    <History className="h-4 w-4 mr-2" />
                    View Protocol Versions
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={goToOptimizer}>
                    <Edit className="h-4 w-4 mr-2" />
                    Create New Optimization
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={copyShareableLink}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Share Dossier
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {dossier.optimizer_versions?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Latest Protocol Optimization</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-50 p-4 rounded-md border">
                  <div className="flex justify-between items-start mb-3">
                    <div className="text-sm text-gray-500">
                      {formatDateTime(dossier.optimizer_versions[dossier.optimizer_versions.length - 1].timestamp)}
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => viewVersion(dossier.optimizer_versions[dossier.optimizer_versions.length - 1])}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Full Version
                    </Button>
                  </div>
                  <div className="whitespace-pre-wrap max-h-40 overflow-y-auto text-sm">
                    {dossier.optimizer_versions[dossier.optimizer_versions.length - 1].recommendation.substring(0, 300)}...
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="csrs">
          <Card>
            <CardHeader>
              <CardTitle>Selected CSRs</CardTitle>
            </CardHeader>
            <CardContent>
              {dossier.csrs?.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Indication</TableHead>
                      <TableHead>Phase</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dossier.csrs.map((csr: any, index: number) => (
                      <TableRow key={index}>
                        <TableCell>{csr.id}</TableCell>
                        <TableCell>{csr.title}</TableCell>
                        <TableCell>{csr.indication}</TableCell>
                        <TableCell>{csr.phase}</TableCell>
                        <TableCell>
                          {dossier.notes && dossier.notes[csr.id] 
                            ? <span className="text-green-600">Yes</span> 
                            : <span className="text-gray-400">No</span>}
                        </TableCell>
                        <TableCell>
                          {dossier.locked_csrs?.includes(csr.id) ? (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                              Locked
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                              Open
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p>No CSRs have been added to this dossier yet.</p>
                  <p className="mt-2">Use the CSR Search page to find and add reports.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="versions">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Protocol Optimization Versions</CardTitle>
              <Button onClick={goToOptimizer}>
                <Edit className="h-4 w-4 mr-2" />
                New Optimization
              </Button>
            </CardHeader>
            <CardContent>
              {dossier.optimizer_versions?.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Protocol Summary</TableHead>
                      <TableHead>CSR References</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dossier.optimizer_versions.map((version: any, index: number) => (
                      <TableRow key={index}>
                        <TableCell>V{dossier.optimizer_versions.length - index}</TableCell>
                        <TableCell>{formatDateTime(version.timestamp)}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          {version.protocol_summary 
                            ? version.protocol_summary.substring(0, 80) + '...' 
                            : 'No summary provided'}
                        </TableCell>
                        <TableCell>{version.csr_ids?.length || 0} CSRs</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => viewVersion(version)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => copyToClipboard(version.recommendation)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-10 text-gray-500">
                  <History className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p>No protocol optimization versions found.</p>
                  <Button 
                    className="mt-4" 
                    variant="outline"
                    onClick={goToOptimizer}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Create First Optimization
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="version-details">
          {loadingVersion ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : selectedVersion ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="mb-2"
                    onClick={backToVersions}
                  >
                    <CornerUpLeft className="h-4 w-4 mr-2" />
                    Back to Versions
                  </Button>
                  <CardTitle>Protocol Optimization - Version {dossier.optimizer_versions.length - dossier.optimizer_versions.indexOf(selectedVersion)}</CardTitle>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(selectedVersion.recommendation)}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                  <Button 
                    variant="outline"
                    size="sm"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center text-sm text-gray-500 mb-4">
                  <Clock className="h-4 w-4 mr-2" />
                  Created on {formatDateTime(selectedVersion.timestamp)}
                </div>
                
                {selectedVersion.protocol_summary && (
                  <div>
                    <h3 className="text-lg font-medium mb-2">Original Protocol Summary</h3>
                    <div className="p-4 bg-gray-50 rounded-md border whitespace-pre-wrap">
                      {selectedVersion.protocol_summary}
                    </div>
                  </div>
                )}
                
                <div>
                  <h3 className="text-lg font-medium mb-2">Optimization Recommendations</h3>
                  <div className="p-4 bg-white rounded-md border whitespace-pre-wrap">
                    {selectedVersion.recommendation}
                  </div>
                </div>
                
                {selectedVersion.csr_ids?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium mb-2">Referenced CSRs</h3>
                    <div className="p-4 bg-gray-50 rounded-md border">
                      <ul className="list-disc pl-5 space-y-1">
                        {selectedVersion.csr_ids.map((id: string, index: number) => (
                          <li key={index}>CSR ID: {id}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-10 text-gray-500">
              <p>No version selected</p>
              <Button 
                className="mt-4" 
                variant="outline"
                onClick={() => setActiveTab('versions')}
              >
                Return to Version List
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <style jsx global>
        {`
          .whitespace-pre-wrap {
            white-space: pre-wrap;
          }
        `}
      </style>
    </div>
  );
}