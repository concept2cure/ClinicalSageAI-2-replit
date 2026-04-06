import React from 'react';
import { Button } from '@/components/ui/button';
import {
 Card,
 CardContent,
 CardDescription,
 CardFooter,
 CardHeader,
 CardTitle,
} from '@/components/ui/card';
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, RefreshCw, Check, X, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import {
 Accordion,
 AccordionContent,
 AccordionItem,
 AccordionTrigger,
} from '@/components/ui/accordion';

/**
 * EquivalenceTable Component
 *
 * This component displays a substantial equivalence comparison between
 * the subject device and a predicate device.
 *
 * @param {Object} props - Component props
 * @param {Object} props.subjectDevice - The subject device information
 * @param {Object} props.predicateDevice - The predicate device information
 * @param {Object} props.equivalenceData - The equivalence analysis data
 * @param {boolean} props.isLoading - Whether the analysis is loading
 * @param {Function} props.onRefresh - Callback to refresh the analysis
 */
export const EquivalenceTable = ({
 subjectDevice,
 predicateDevice,
 equivalenceData,
 isLoading = false,
 onRefresh,
}) => {
 // Format the comparison outcome with appropriate badge
 const renderComparisonOutcome = comparison => {
 switch (comparison.outcome) {
 case 'Substantially Equivalent':
 return (
 <Badge variant="success" className="bg-green-600">
 <Check className="h-3 w-3 mr-1" /> Equivalent
 </Badge>
 );
 case 'Potentially Equivalent':
 return (
 <Badge variant="warning" className="bg-yellow-500">
 <AlertCircle className="h-3 w-3 mr-1" /> Potential
 </Badge>
 );
 case 'Not Equivalent':
 return (
 <Badge variant="destructive">
 <X className="h-3 w-3 mr-1" /> Not Equivalent
 </Badge>
 );
 case 'Additional Testing Required':
 return (
 <Badge variant="outline" className="bg-stone-100 text-stone-700 border-stone-300">
 <RefreshCw className="h-3 w-3 mr-1" /> Testing Required
 </Badge>
 );
 default:
 return <Badge variant="outline">{comparison.outcome}</Badge>;
 }
 };

 // Calculate overall equivalence status
 const getOverallStatus = data => {
 if (!data || !data.comparisons || data.comparisons.length === 0) {
 return null;
 }

 const notEquivalentCount = data.comparisons.filter(c => c.outcome === 'Not Equivalent').length;
 const testingRequiredCount = data.comparisons.filter(
 c => c.outcome === 'Additional Testing Required'
 ).length;
 const potentialCount = data.comparisons.filter(
 c => c.outcome === 'Potentially Equivalent'
 ).length;
 const equivalentCount = data.comparisons.filter(
 c => c.outcome === 'Substantially Equivalent'
 ).length;

 if (notEquivalentCount > 0) {
 return {
 status: 'Not Equivalent',
 color: 'destructive',
 icon: <X className="h-4 w-4 mr-2" />,
 description: 'One or more characteristics are not substantially equivalent',
 };
 } else if (testingRequiredCount > 0) {
 return {
 status: 'Testing Required',
 color: 'blue',
 icon: <RefreshCw className="h-4 w-4 mr-2" />,
 description: 'Additional testing required to determine equivalence',
 };
 } else if (potentialCount > 0) {
 return {
 status: 'Potentially Equivalent',
 color: 'yellow',
 icon: <AlertCircle className="h-4 w-4 mr-2" />,
 description: 'Potentially equivalent with some considerations',
 };
 } else {
 return {
 status: 'Substantially Equivalent',
 color: 'green',
 icon: <Check className="h-4 w-4 mr-2" />,
 description: 'All characteristics are substantially equivalent',
 };
 }
 };

 const overallStatus = getOverallStatus(equivalenceData);

 // Loading state or missing information
 if (isLoading) {
 return (
 <Card className="flex items-center justify-center p-8">
 <div className="flex flex-col items-center gap-2">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 <p className="text-muted-foreground">Generating equivalence analysis...</p>
 </div>
 </Card>
 );
 }

 if (!predicateDevice) {
 return (
 <Card>
 <CardHeader>
 <CardTitle>No Predicate Device Selected</CardTitle>
 <CardDescription>
 Return to the search tab to select a predicate device for comparison.
 </CardDescription>
 </CardHeader>
 </Card>
 );
 }

 if (!equivalenceData || !equivalenceData.comparisons) {
 return (
 <Card>
 <CardHeader>
 <CardTitle>Equivalence Analysis</CardTitle>
 <CardDescription>
 No analysis data available. Generate an analysis to compare the devices.
 </CardDescription>
 </CardHeader>
 <CardFooter>
 <Button onClick={onRefresh} disabled={isLoading}>
 <RefreshCw className="h-4 w-4 mr-2" />
 Generate Analysis
 </Button>
 </CardFooter>
 </Card>
 );
 }

 return (
 <div className="space-y-6">
 {/* Device Overview Cards */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Card>
 <CardHeader className="bg-primary bg-opacity-10">
 <CardTitle className="text-lg">Subject Device</CardTitle>
 <CardDescription>Your device under review</CardDescription>
 </CardHeader>
 <CardContent className="pt-4">
 <div className="space-y-2">
 <div>
 <span className="font-medium">Device Name:</span> {subjectDevice.deviceName}
 </div>
 <div>
 <span className="font-medium">Device Type:</span> {subjectDevice.deviceType}
 </div>
 <div>
 <span className="font-medium">Class:</span> {subjectDevice.deviceClass}
 </div>
 {subjectDevice.productCode && (
 <div>
 <span className="font-medium">Product Code:</span>
 <Badge variant="outline" className="ml-2">
 {subjectDevice.productCode}
 </Badge>
 </div>
 )}
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardHeader className="bg-secondary bg-opacity-10">
 <CardTitle className="text-lg">Predicate Device</CardTitle>
 <CardDescription>Selected comparison device</CardDescription>
 </CardHeader>
 <CardContent className="pt-4">
 <div className="space-y-2">
 <div>
 <span className="font-medium">Device Name:</span> {predicateDevice.deviceName}
 </div>
 <div>
 <span className="font-medium">Manufacturer:</span> {predicateDevice.manufacturer}
 </div>
 <div>
 <span className="font-medium">K Number:</span>
 <Badge variant="outline" className="ml-2">
 {predicateDevice.kNumber}
 </Badge>
 </div>
 {predicateDevice.productCode && (
 <div>
 <span className="font-medium">Product Code:</span>
 <Badge variant="outline" className="ml-2">
 {predicateDevice.productCode}
 </Badge>
 </div>
 )}
 {predicateDevice.decisionDate && (
 <div>
 <span className="font-medium">Decision Date:</span> {predicateDevice.decisionDate}
 </div>
 )}
 </div>
 </CardContent>
 </Card>
 </div>

 {/* Overall Equivalence Status */}
 {overallStatus && (
 <Card className={`border-${overallStatus.color}-600 bg-${overallStatus.color}-50`}>
 <CardHeader>
 <div className="flex items-center">
 {overallStatus.icon}
 <CardTitle>Overall Status: {overallStatus.status}</CardTitle>
 </div>
 <CardDescription>{overallStatus.description}</CardDescription>
 </CardHeader>
 <CardContent>
 <div className="flex flex-wrap gap-2">
 <div className="text-sm">
 <span className="font-medium">Equivalence Confidence:</span>{' '}
 {equivalenceData.confidenceScore}%
 </div>
 <Separator orientation="vertical" className="h-5" />
 <div className="text-sm">
 <span className="font-medium">Analysis Date:</span>{' '}
 {new Date().toLocaleDateString()}
 </div>
 {equivalenceData.regulatoryPath && (
 <>
 <Separator orientation="vertical" className="h-5" />
 <div className="text-sm">
 <span className="font-medium">Suggested Path:</span>{' '}
 {equivalenceData.regulatoryPath}
 </div>
 </>
 )}
 </div>
 </CardContent>
 </Card>
 )}

 {/* Equivalence Comparisons Table */}
 <Card>
 <CardHeader>
 <CardTitle>Substantial Equivalence Analysis</CardTitle>
 <CardDescription>
 Comparison of key characteristics between subject and predicate devices
 </CardDescription>
 </CardHeader>
 <CardContent>
 <ScrollArea className="h-[500px] rounded-md border">
 <div className="p-4">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="w-[200px]">Characteristic</TableHead>
 <TableHead>Subject Device</TableHead>
 <TableHead>Predicate Device</TableHead>
 <TableHead className="w-[120px] text-center">Equivalence</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {equivalenceData.comparisons.map((comparison, index) => (
 <TableRow key={index}>
 <TableCell className="font-medium">{comparison.characteristic}</TableCell>
 <TableCell>{comparison.subjectValue}</TableCell>
 <TableCell>{comparison.predicateValue}</TableCell>
 <TableCell className="text-center">
 {renderComparisonOutcome(comparison)}
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 </ScrollArea>
 </CardContent>
 <CardFooter className="flex justify-between">
 <div className="text-sm text-muted-foreground">
 {equivalenceData.comparisons.length} characteristics compared
 </div>
 <Button onClick={onRefresh} disabled={isLoading}>
 <RefreshCw className="h-4 w-4 mr-2" />
 Refresh Analysis
 </Button>
 </CardFooter>
 </Card>

 {/* Detailed Analysis and Rationale */}
 {equivalenceData.detailedRationale && (
 <Card>
 <CardHeader>
 <CardTitle>Detailed Analysis</CardTitle>
 <CardDescription>
 Rationale and considerations for the equivalence determination
 </CardDescription>
 </CardHeader>
 <CardContent>
 <Accordion type="single" collapsible className="w-full">
 {equivalenceData.detailedRationale.map((detail, index) => (
 <AccordionItem key={index} value={`item-${index}`}>
 <AccordionTrigger>
 <div className="flex items-center">
 <span className="mr-2">{detail.category}</span>
 {detail.status === 'Substantially Equivalent' && (
 <Badge variant="success" className="bg-green-600">
 Equivalent
 </Badge>
 )}
 {detail.status === 'Not Equivalent' && (
 <Badge variant="destructive">Not Equivalent</Badge>
 )}
 {detail.status === 'Potentially Equivalent' && (
 <Badge variant="warning" className="bg-yellow-500">
 Potential
 </Badge>
 )}
 {detail.status === 'Additional Testing Required' && (
 <Badge
 variant="outline"
 className="bg-stone-100 text-stone-700 border-stone-300"
 >
 Testing Required
 </Badge>
 )}
 </div>
 </AccordionTrigger>
 <AccordionContent>
 <div className="space-y-4 pl-4">
 <p>{detail.rationale}</p>
 {detail.considerations && (
 <>
 <div className="font-medium mt-2">Key Considerations:</div>
 <ul className="list-disc pl-5 space-y-1">
 {detail.considerations.map((consideration, i) => (
 <li key={i}>{consideration}</li>
 ))}
 </ul>
 </>
 )}
 </div>
 </AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </CardContent>
 </Card>
 )}
 </div>
 );
};

export default EquivalenceTable;
