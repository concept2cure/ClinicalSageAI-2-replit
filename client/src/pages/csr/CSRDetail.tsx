import { useState, useEffect } from 'react';
import { useParams, Link } from 'wouter';
import {
 Loader2,
 ArrowLeft,
 FileText,
 Pill,
 Users,
 Calendar,
 FlaskConical,
 Award,
} from 'lucide-react';
import axios from 'axios';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

export default function CSRDetail() {
 const { csrId } = useParams();
 const [csr, setCsr] = useState<any>(null);
 const [loading, setLoading] = useState(true);
 const { toast } = useToast();

 useEffect(() => {
 const fetchCSRDetails = async () => {
 try {
 setLoading(true);
 const response = await axios.get(`/api/csrs/${csrId}`);
 setCsr(response.data);
 } catch (error) {
 console.error('Error fetching CSR details:', error);
 toast({
 title: "Error",
 description: "Failed to load CSR details",
 variant: "destructive",
 });
 } finally {
 setLoading(false);
 }
 };

 fetchCSRDetails();
 }, [csrId, toast]);

 if (loading) {
 return (
 <div className="flex flex-col items-center justify-center min-h-[60vh]">
 <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
 <p className="text-lg text-muted-foreground">Loading CSR details...</p>
 </div>
 );
 }

 if (!csr) {
 return (
 <div className="space-y-4">
 <div className="flex items-center">
 <Button variant="outline" size="sm" asChild className="mr-4">
 <Link to="/csr-search">
 <ArrowLeft className="mr-2 h-4 w-4" />
 Back to Search
 </Link>
 </Button>
 </div>
 <div className="flex flex-col items-center justify-center min-h-[60vh]">
 <FileText className="h-16 w-16 text-muted-foreground mb-4" />
 <h2 className="text-2xl font-bold mb-2">CSR Not Found</h2>
 <p className="text-muted-foreground">
 The requested clinical study report could not be found.
 </p>
 </div>
 </div>
 );
 }

 return (
 <div className="space-y-6">
 <div className="flex items-center">
 <Button variant="outline" size="sm" asChild className="mr-4">
 <Link to="/csr-search">
 <ArrowLeft className="mr-2 h-4 w-4" />
 Back to Search
 </Link>
 </Button>
 </div>

 <div className="flex flex-col space-y-2">
 <h1 className="text-3xl font-bold tracking-tight">{csr.title}</h1>
 <div className="flex flex-wrap gap-2 mb-4">
 <Badge variant="secondary">{csr.phase}</Badge>
 <Badge variant="secondary">{csr.indication}</Badge>
 {csr.sample_size && <Badge variant="secondary">N={csr.sample_size}</Badge>}
 {csr.outcome && (
 <Badge
 variant={csr.outcome.toLowerCase().includes('positive') ? 'default' : 'destructive'}
 >
 {csr.outcome}
 </Badge>
 )}
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-medium flex items-center">
 <FileText className="mr-2 h-4 w-4" />
 Study Information
 </CardTitle>
 </CardHeader>
 <CardContent>
 <dl className="space-y-2 text-sm">
 <div>
 <dt className="font-medium text-muted-foreground">Trial ID</dt>
 <dd>{csr.csr_id || csr.id || 'N/A'}</dd>
 </div>
 <div>
 <dt className="font-medium text-muted-foreground">Sponsor</dt>
 <dd>{csr.sponsor || 'N/A'}</dd>
 </div>
 <div>
 <dt className="font-medium text-muted-foreground">Date</dt>
 <dd>{csr.date ? new Date(csr.date).toLocaleDateString() : 'N/A'}</dd>
 </div>
 <div>
 <dt className="font-medium text-muted-foreground">Status</dt>
 <dd>{csr.status || 'N/A'}</dd>
 </div>
 </dl>
 </CardContent>
 </Card>

 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-medium flex items-center">
 <FlaskConical className="mr-2 h-4 w-4" />
 Study Design
 </CardTitle>
 </CardHeader>
 <CardContent>
 <dl className="space-y-2 text-sm">
 <div>
 <dt className="font-medium text-muted-foreground">Phase</dt>
 <dd>{csr.phase || 'N/A'}</dd>
 </div>
 <div>
 <dt className="font-medium text-muted-foreground">Indication</dt>
 <dd>{csr.indication || 'N/A'}</dd>
 </div>
 <div>
 <dt className="font-medium text-muted-foreground">Study Type</dt>
 <dd>{csr.study_type || 'N/A'}</dd>
 </div>
 <div>
 <dt className="font-medium text-muted-foreground">Arms</dt>
 <dd>{csr.arms && csr.arms.length > 0 ? csr.arms.join(', ') : 'Not specified'}</dd>
 </div>
 </dl>
 </CardContent>
 </Card>

 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm font-medium flex items-center">
 <Users className="mr-2 h-4 w-4" />
 Population
 </CardTitle>
 </CardHeader>
 <CardContent>
 <dl className="space-y-2 text-sm">
 <div>
 <dt className="font-medium text-muted-foreground">Sample Size</dt>
 <dd>{csr.sample_size || 'Not specified'}</dd>
 </div>
 <div>
 <dt className="font-medium text-muted-foreground">Age Range</dt>
 <dd>{csr.age_range || 'Not specified'}</dd>
 </div>
 <div>
 <dt className="font-medium text-muted-foreground">Completion Rate</dt>
 <dd>{csr.completion_rate || 'Not specified'}</dd>
 </div>
 </dl>
 </CardContent>
 </Card>
 </div>

 <Tabs defaultValue="objectives">
 <TabsList className="grid w-full grid-cols-4">
 <TabsTrigger value="objectives">Objectives</TabsTrigger>
 <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
 <TabsTrigger value="results">Results</TabsTrigger>
 <TabsTrigger value="safety">Safety</TabsTrigger>
 </TabsList>

 <TabsContent value="objectives" className="p-4 border rounded-md mt-2">
 <div className="space-y-4">
 <div>
 <h3 className="text-lg font-medium">Primary Objective</h3>
 <p className="mt-1">{csr.primary_objective || 'Not specified'}</p>
 </div>

 {csr.secondary_objectives && (
 <div>
 <h3 className="text-lg font-medium">Secondary Objectives</h3>
 <p className="mt-1">{csr.secondary_objectives}</p>
 </div>
 )}

 {csr.inclusion_criteria && (
 <div>
 <h3 className="text-lg font-medium">Inclusion Criteria</h3>
 <p className="mt-1 whitespace-pre-line">{csr.inclusion_criteria}</p>
 </div>
 )}

 {csr.exclusion_criteria && (
 <div>
 <h3 className="text-lg font-medium">Exclusion Criteria</h3>
 <p className="mt-1 whitespace-pre-line">{csr.exclusion_criteria}</p>
 </div>
 )}
 </div>
 </TabsContent>

 <TabsContent value="endpoints" className="p-4 border rounded-md mt-2">
 <div className="space-y-4">
 <div>
 <h3 className="text-lg font-medium">Primary Endpoints</h3>
 {csr.primary_endpoints && csr.primary_endpoints.length > 0 ? (
 <ul className="list-disc pl-6 mt-1">
 {csr.primary_endpoints.map((endpoint: string, index: number) => (
 <li key={index}>{endpoint}</li>
 ))}
 </ul>
 ) : (
 <p className="mt-1">Not specified</p>
 )}
 </div>

 <div>
 <h3 className="text-lg font-medium">Secondary Endpoints</h3>
 {csr.secondary_endpoints && csr.secondary_endpoints.length > 0 ? (
 <ul className="list-disc pl-6 mt-1">
 {csr.secondary_endpoints.map((endpoint: string, index: number) => (
 <li key={index}>{endpoint}</li>
 ))}
 </ul>
 ) : (
 <p className="mt-1">Not specified</p>
 )}
 </div>
 </div>
 </TabsContent>

 <TabsContent value="results" className="p-4 border rounded-md mt-2">
 <div className="space-y-4">
 <div>
 <h3 className="text-lg font-medium">Primary Results</h3>
 <p className="mt-1">{csr.primary_results || 'Not specified'}</p>
 </div>

 <div>
 <h3 className="text-lg font-medium">Secondary Results</h3>
 <p className="mt-1">{csr.secondary_results || 'Not specified'}</p>
 </div>

 <div>
 <h3 className="text-lg font-medium">Statistical Analysis</h3>
 <p className="mt-1">{csr.statistical_analysis || 'Not specified'}</p>
 </div>
 </div>
 </TabsContent>

 <TabsContent value="safety" className="p-4 border rounded-md mt-2">
 <div className="space-y-4">
 <div>
 <h3 className="text-lg font-medium">Common Adverse Events</h3>
 <p className="mt-1 whitespace-pre-line">
 {csr.common_adverse_events || 'Not specified'}
 </p>
 </div>

 <div>
 <h3 className="text-lg font-medium">Serious Adverse Events</h3>
 <p className="mt-1 whitespace-pre-line">
 {csr.serious_adverse_events || 'Not specified'}
 </p>
 </div>

 <div>
 <h3 className="text-lg font-medium">Discontinuations Due to AEs</h3>
 <p className="mt-1">{csr.discontinuations || 'Not specified'}</p>
 </div>
 </div>
 </TabsContent>
 </Tabs>

 <div className="flex justify-between items-center mt-8 pt-4 border-t">
 <Button variant="outline" asChild>
 <Link to="/csr-search">
 <ArrowLeft className="mr-2 h-4 w-4" />
 Back to Search
 </Link>
 </Button>

 <div className="flex gap-3">
 <Button variant="secondary">
 <Award className="mr-2 h-4 w-4" />
 Compare with Protocol
 </Button>
 <Button>
 <Pill className="mr-2 h-4 w-4" />
 Generate Dossier
 </Button>
 </div>
 </div>
 </div>
 );
}
