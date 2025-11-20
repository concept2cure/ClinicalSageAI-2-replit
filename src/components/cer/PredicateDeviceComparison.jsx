import React, { useState, useEffect } from 'react';
import FDA510kService from '../../services/FDA510kService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, X, Check, Search, FileText, Download, Copy, Plus } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

/**
 * Predicate Device Comparison Component
 *
 * This component allows users to search for predicate devices, select them for comparison,
 * and generate a structured comparison table suitable for 510(k) submissions or CER documents.
 */
const PredicateDeviceComparison = ({
  deviceProfile,
  predicateDevices = [],
  onComparisonGenerated,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [predicateResults, setPredicateResults] = useState([]);
  const [selectedPredicates, setSelectedPredicates] = useState(predicateDevices || []);
  const [comparisonTable, setComparisonTable] = useState(null);
  const [isGeneratingComparison, setIsGeneratingComparison] = useState(false);
  const [sortField, setSortField] = useState('relevance');
  const [sortDirection, setSortDirection] = useState('desc');
  const { toast } = useToast();

  // Initialize selectedPredicates when predicateDevices prop changes
  useEffect(() => {
    if (predicateDevices && predicateDevices.length > 0) {
      setSelectedPredicates(predicateDevices);
    }
  }, [predicateDevices]);

  // Filter predicate results based on selected sort options
  const filteredAndSortedPredicates = React.useMemo(() => {
    if (!predicateResults.length) return [];

    // Make a copy to avoid mutating the original
    let sorted = [...predicateResults];

    // Apply sorting
    switch (sortField) {
      case 'relevance':
        // Already sorted by relevance by default
        break;
      case 'year':
        sorted.sort((a, b) => {
          const yearA = a.year ? parseInt(a.year) : 0;
          const yearB = b.year ? parseInt(b.year) : 0;
          return sortDirection === 'asc' ? yearA - yearB : yearB - yearA;
        });
        break;
      case 'deviceName':
        sorted.sort((a, b) => {
          const nameA = a.deviceName || '';
          const nameB = b.deviceName || '';
          return sortDirection === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
        });
        break;
      case 'manufacturer':
        sorted.sort((a, b) => {
          const mfrA = a.manufacturer || '';
          const mfrB = b.manufacturer || '';
          return sortDirection === 'asc' ? mfrA.localeCompare(mfrB) : mfrB.localeCompare(mfrA);
        });
        break;
    }

    return sorted;
  }, [predicateResults, sortField, sortDirection]);

  // Generate search description from device profile
  const generateSearchDescription = () => {
    if (!deviceProfile) return '';

    const parts = [];
    if (deviceProfile.deviceName) parts.push(deviceProfile.deviceName);
    if (deviceProfile.deviceClass) parts.push(`Class ${deviceProfile.deviceClass}`);
    if (deviceProfile.intendedUse) parts.push(deviceProfile.intendedUse);

    return parts.join(' ');
  };

  // Auto-fill search box with device profile details if available
  useEffect(() => {
    const description = generateSearchDescription();
    if (description && !searchQuery) {
      setSearchQuery(description);
    }
  }, [deviceProfile]);

  // Handle search for predicate devices
  const handlePredicateSearch = async () => {
    if (!searchQuery.trim()) {
      toast({
        variant: 'destructive',
        title: 'Search query required',
        description: 'Please enter a description of your device to find predicates.',
      });
      return;
    }

    setIsSearching(true);

    try {
      // Use FDA510kService to find predicates
      const searchCriteria = {
        deviceName: searchQuery,
        limit: 10,
      };

      const result = await FDA510kService.findPredicateDevices(searchCriteria);

      if (result.success && result.predicates) {
        setPredicateResults(result.predicates);

        if (result.predicates.length === 0) {
          toast({
            variant: 'default',
            title: 'No predicates found',
            description: 'Try adjusting your search query for better results.',
          });
        }
      } else {
        throw new Error(result.error || 'Failed to find predicate devices');
      }
    } catch (error) {
      console.error('Error searching for predicates:', error);
      toast({
        variant: 'destructive',
        title: 'Search failed',
        description: error.message || 'Failed to find predicate devices. Please try again.',
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Handle selecting a predicate device
  const togglePredicateSelection = predicate => {
    setSelectedPredicates(prevSelected => {
      // Check if this predicate is already selected
      const isSelected = prevSelected.some(p => p.id === predicate.id);

      if (isSelected) {
        // Remove it if already selected
        return prevSelected.filter(p => p.id !== predicate.id);
      } else {
        // Add it if not selected, but limit to 5 predicates
        if (prevSelected.length >= 5) {
          toast({
            variant: 'warning',
            title: 'Selection limit reached',
            description: 'You can select a maximum of 5 predicate devices.',
          });
          return prevSelected;
        }
        return [...prevSelected, predicate];
      }
    });
  };

  // Generate a formatted comparison table with enhanced device profile integration
  const generateComparisonTable = async () => {
    if (!selectedPredicates.length) {
      toast({
        variant: 'warning',
        title: 'No predicates selected',
        description: 'Please select at least one predicate device to generate a comparison.',
      });
      return;
    }

    if (!deviceProfile) {
      toast({
        variant: 'warning',
        title: 'Subject device missing',
        description: 'Please make sure your device profile is complete.',
      });
      return;
    }

    setIsGeneratingComparison(true);

    try {
      // Import error handling utilities
      const errorHandling = await import('../../utils/errorHandling');

      // Prepare device description from the profile
      const deviceDescription = {
        deviceName: deviceProfile.deviceName || '',
        manufacturer: deviceProfile.manufacturer || '',
        modelNumber: deviceProfile.modelNumber || '',
        deviceClass: deviceProfile.deviceClass || '',
        intendedUse: deviceProfile.intendedUse || '',
        operatingPrinciples: deviceProfile.operatingPrinciples || '',
        ...deviceProfile, // Include all other properties
      };

      // Call the server-side API for predicate comparison using the FDA510kService
      const response = await errorHandling.withTimeout(
        FDA510kService.comparePredicateDevices(deviceDescription, selectedPredicates),
        120000, // 2 minute timeout
        'Predicate device comparison generation timed out'
      );

      if (!response || !response.success) {
        throw new Error(response?.error?.message || 'Failed to generate predicate comparison');
      }

      // Set the comparison result from the API
      setComparisonTable(response.data.comparison);

      // Notify parent component if a callback was provided
      if (onComparisonGenerated) {
        onComparisonGenerated(response.data);
      }

      toast({
        title: 'Comparison generated',
        description: 'Successfully generated predicate device comparison.',
      });

      // For backward compatibility, we'll keep the legacy field definitions that would
      // be used in client-side processing, but we're not using them anymore

      // 510(k) specific fields - expanded list for regulatory compliance
      const regulatory510kFields = [
        'deviceName',
        'modelNumber',
        'manufacturer',
        'deviceClass',
        'productCode',
        'regulationNumber',
        'submissionType',
        'reviewPanel',
        'indicationsForUse',
        'intendedUse',
        'materialComposition',
        'sterility',
        'singleUse',
        'implantDuration',
        'contactDuration',
        'tissueContact',
        'activeDevice',
        'deliveryMethod',
        'operatingPrinciples',
        'powerSource',
        'riskClassification',
      ];

      // Clinical and performance related fields
      const clinicalFields = [
        'clinicalTrials',
        'patientPopulation',
        'contraindications',
        'warnings',
        'adverseEvents',
        'clinicalOutcomes',
        'effectivenessData',
        'safetyData',
        'performanceData',
        'usabilityData',
      ];

      // Technical and engineering fields
      const technicalFields = [
        'technicalSpecifications',
        'dimensions',
        'weight',
        'operatingParameters',
        'shelfLife',
        'storageConditions',
        'compatibleAccessories',
        'standards',
        'testingMethods',
        'softwareVersion',
        'firmware',
      ];

      // Collect all potential comparison fields from all devices
      const allFields = new Set();

      // Add all keys from the subject device
      Object.keys(deviceProfile).forEach(key => {
        if (typeof deviceProfile[key] === 'string' || typeof deviceProfile[key] === 'number') {
          allFields.add(key);
        }
      });

      // Add all keys from the predicate devices
      selectedPredicates.forEach(predicate => {
        Object.keys(predicate).forEach(key => {
          if (typeof predicate[key] === 'string' || typeof predicate[key] === 'number') {
            allFields.add(key);
          }
        });
      });

      // Remove technical fields
      [
        'id',
        'createdAt',
        'updatedAt',
        'embedding',
        'vectors',
        'similarity',
        'user_id',
        'organization_id',
        'relevance',
        'score',
      ].forEach(field => {
        allFields.delete(field);
      });

      // Combine all priority field categories
      const priorityFields = [...regulatory510kFields, ...clinicalFields, ...technicalFields];

      // Filter out duplicates
      const uniquePriorityFields = [...new Set(priorityFields)];

      // Sort fields by priority and category
      const sortedFields = [...allFields].sort((a, b) => {
        // Check if field is in 510k regulatory fields
        const aIs510k = regulatory510kFields.indexOf(a) >= 0;
        const bIs510k = regulatory510kFields.indexOf(b) >= 0;

        // Check if field is in clinical fields
        const aIsClinical = clinicalFields.indexOf(a) >= 0;
        const bIsClinical = clinicalFields.indexOf(b) >= 0;

        // Check if field is in technical fields
        const aIsTechnical = technicalFields.indexOf(a) >= 0;
        const bIsTechnical = technicalFields.indexOf(b) >= 0;

        // Overall priority
        const aPriority = uniquePriorityFields.indexOf(a);
        const bPriority = uniquePriorityFields.indexOf(b);

        // Regulatory fields come first
        if (aIs510k && !bIs510k) return -1;
        if (!aIs510k && bIs510k) return 1;

        // Then clinical fields
        if (aIsClinical && !bIsClinical) return -1;
        if (!aIsClinical && bIsClinical) return 1;

        // Then technical fields
        if (aIsTechnical && !bIsTechnical) return -1;
        if (!aIsTechnical && bIsTechnical) return 1;

        // Then by priority within their category
        if (aPriority >= 0 && bPriority >= 0) {
          return aPriority - bPriority;
        }

        // Otherwise sort alphabetically
        return a.localeCompare(b);
      });

      // Format field values for display - handle different data types appropriately
      const formatFieldValue = value => {
        if (value === null || value === undefined) return '-';
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
      };

      // Identify substantial equivalence factors
      const getEquivalenceFactor = (field, subjectValue, predicateValue) => {
        if (!subjectValue || !predicateValue) return '';

        // Convert to strings for comparison
        const subject = String(subjectValue).toLowerCase().trim();
        const predicate = String(predicateValue).toLowerCase().trim();

        // Exact match
        if (subject === predicate) {
          return `<span class="text-green-600 font-bold">Equivalent</span>`;
        }

        // Check if predicate value is contained in subject or vice versa
        if (subject.includes(predicate) || predicate.includes(subject)) {
          return `<span class="text-orange-500">Potentially Equivalent</span>`;
        }

        // For critical fields, mark more clearly when different
        const criticalFields = [
          'deviceClass',
          'indicationsForUse',
          'intendedUse',
          'operatingPrinciples',
        ];
        if (criticalFields.includes(field)) {
          return `<span class="text-red-600 font-bold">Different</span>`;
        }

        return `<span class="text-red-500">Different</span>`;
      };

      // Add comparison status header row
      const getComparisonStatusRow = () => {
        const subjectName = deviceProfile.deviceName || 'Your Device';
        let headerRow = `
          <tr class="bg-blue-50">
            <td class="font-bold">Comparison Status</td>
            <td>Subject Device</td>
        `;

        selectedPredicates.forEach((predicate, index) => {
          const predicateName = predicate.deviceName || `Predicate ${index + 1}`;

          // Check essential characteristics for substantial equivalence
          const essentialFields = ['deviceClass', 'intendedUse', 'operatingPrinciples'];
          let matchCount = 0;
          let totalFields = 0;

          essentialFields.forEach(field => {
            if (deviceProfile[field] && predicate[field]) {
              totalFields++;
              const subject = String(deviceProfile[field]).toLowerCase().trim();
              const pred = String(predicate[field]).toLowerCase().trim();

              if (subject === pred || subject.includes(pred) || pred.includes(subject)) {
                matchCount++;
              }
            }
          });

          // Calculate equivalence score
          const equivalenceScore =
            totalFields > 0 ? Math.round((matchCount / totalFields) * 100) : 0;
          let statusDisplay;

          if (equivalenceScore >= 80) {
            statusDisplay = `<span class="text-green-600 font-bold">Likely Equivalent (${equivalenceScore}%)</span>`;
          } else if (equivalenceScore >= 50) {
            statusDisplay = `<span class="text-orange-500 font-bold">Potentially Equivalent (${equivalenceScore}%)</span>`;
          } else {
            statusDisplay = `<span class="text-red-600 font-bold">Not Likely Equivalent (${equivalenceScore}%)</span>`;
          }

          headerRow += `<td>${statusDisplay}</td>`;
        });

        headerRow += `</tr>`;
        return headerRow;
      };

      // Function to categorize fields
      const getCategoryHeader = field => {
        if (regulatory510kFields.includes(field)) {
          return '510(k) Regulatory Data';
        } else if (clinicalFields.includes(field)) {
          return 'Clinical & Safety Data';
        } else if (technicalFields.includes(field)) {
          return 'Technical & Engineering Data';
        }
        return 'Additional Information';
      };

      // Group fields by category
      const fieldsByCategory = {};
      sortedFields.forEach(field => {
        const category = getCategoryHeader(field);
        if (!fieldsByCategory[category]) {
          fieldsByCategory[category] = [];
        }
        fieldsByCategory[category].push(field);
      });

      // Generate the comparison table HTML with sections and equivalence indicators
      let tableHtml = `
        <div class="predicate-comparison-table">
          <h2 class="mb-4 text-gray-800 text-xl font-semibold">Substantial Equivalence Comparison</h2>
          <p class="mb-4 text-gray-600">
            This comparison table analyzes your device against selected predicates to support a 510(k) submission.
            Fields are color-coded to indicate potential substantial equivalence factors.
          </p>
          <table border="1" cellpadding="5" cellspacing="0" class="border-collapse w-full mb-8 border border-gray-300">
            <thead>
              <tr class="bg-gray-100">
                <th class="w-1/5 p-2 border border-gray-300">Characteristic</th>
                <th class="p-2 border border-gray-300">Subject Device: ${deviceProfile.deviceName || 'Your Device'}</th>
                ${selectedPredicates
                  .map(
                    (p, i) =>
                      `<th class="p-2 border border-gray-300">Predicate ${i + 1}: ${p.deviceName || 'Unknown'}</th>`
                  )
                  .join('')}
                <th class="p-2 border border-gray-300">Equivalence</th>
              </tr>
              ${getComparisonStatusRow()}
            </thead>
            <tbody>
      `;

      // Add fields by category
      Object.entries(fieldsByCategory).forEach(([category, fields]) => {
        // Add category header
        tableHtml += `
          <tr>
            <td colspan="${selectedPredicates.length + 3}" class="bg-gray-200 font-bold text-left p-2 border border-gray-300">
              ${category}
            </td>
          </tr>
        `;

        // Add fields in this category
        fields.forEach(field => {
          const fieldLabel = field
            .replace(/([A-Z])/g, ' $1') // Add space before capital letters
            .replace(/^./, str => str.toUpperCase()); // Capitalize first letter

          const subjectValue = formatFieldValue(deviceProfile[field]);

          tableHtml += `
            <tr>
              <td class="font-bold p-2 border border-gray-300">${fieldLabel}</td>
              <td>${subjectValue}</td>
          `;

          // Add each predicate value
          selectedPredicates.forEach(predicate => {
            const predicateValue = formatFieldValue(predicate[field]);
            tableHtml += `<td>${predicateValue}</td>`;
          });

          // Add equivalence column - check first predicate for simplicity
          // In a full implementation, would show more nuanced equivalence across predicates
          if (selectedPredicates.length > 0) {
            const firstPredicateValue = formatFieldValue(selectedPredicates[0][field]);
            tableHtml += `<td>${getEquivalenceFactor(field, subjectValue, firstPredicateValue)}</td>`;
          } else {
            tableHtml += `<td>-</td>`;
          }

          tableHtml += `</tr>`;
        });
      });

      tableHtml += `
            </tbody>
          </table>
          <div class="mt-4 text-sm text-gray-600">
            <p><strong>Note:</strong> This comparison is preliminary and should be reviewed by qualified regulatory personnel.</p>
            <p>Generated on ${new Date().toLocaleDateString()} for ${deviceProfile.deviceName || 'Subject Device'}</p>
          </div>
        </div>
      `;

      // Set the comparison table in state
      setComparisonTable(tableHtml);

      // Add the 510(k) specific metadata
      const comparisonData = {
        html: tableHtml,
        subjectDevice: deviceProfile,
        predicateDevices: selectedPredicates,
        metadata: {
          generatedAt: new Date().toISOString(),
          version: '2.0',
          predicateCount: selectedPredicates.length,
          comparisonFields: sortedFields.length,
          primaryPredicate: selectedPredicates.length > 0 ? selectedPredicates[0].id : null,
          submissionReady: true,
        },
      };

      // Call the callback with the generated comparison
      if (onComparisonGenerated) {
        onComparisonGenerated(comparisonData);
      }

      toast({
        variant: 'success',
        title: 'Comparison generated',
        description: 'Device comparison table has been generated successfully.',
      });
    } catch (error) {
      console.error('Error generating comparison:', error);
      toast({
        variant: 'destructive',
        title: 'Generation failed',
        description: error.message || 'Failed to generate comparison table. Please try again.',
      });
    } finally {
      setIsGeneratingComparison(false);
    }
  };

  // Copy comparison table to clipboard
  const copyComparisonToClipboard = () => {
    if (!comparisonTable) return;

    // Copy the HTML to clipboard
    navigator.clipboard
      .writeText(comparisonTable)
      .then(() => {
        toast({
          variant: 'success',
          title: 'Copied to clipboard',
          description: 'The comparison table has been copied to your clipboard.',
        });
      })
      .catch(err => {
        console.error('Error copying to clipboard:', err);
        toast({
          variant: 'destructive',
          title: 'Copy failed',
          description: 'Failed to copy to clipboard. Please try again.',
        });
      });
  };

  // Clear all selections and results
  const clearResults = () => {
    setSelectedPredicates([]);
    setPredicateResults([]);
    setComparisonTable(null);
  };

  return (
    <div className="predicate-device-comparison space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Predicate Device Search</CardTitle>
          <CardDescription>
            Find and compare predicate devices for your 510(k) submission or CER
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="search-container flex space-x-2 mb-4">
            <Input
              type="text"
              placeholder="Enter device description to find predicates..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="flex-grow"
            />
            <Button onClick={handlePredicateSearch} disabled={isSearching || !searchQuery.trim()}>
              {isSearching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search
                </>
              )}
            </Button>
          </div>

          {predicateResults.length > 0 && (
            <div className="sorting-controls flex items-center space-x-4 mb-4">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Sort by:</span>
                <Select value={sortField} onValueChange={setSortField}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relevance">Relevance</SelectItem>
                    <SelectItem value="year">Year</SelectItem>
                    <SelectItem value="deviceName">Device Name</SelectItem>
                    <SelectItem value="manufacturer">Manufacturer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Order:</span>
                <Select value={sortDirection} onValueChange={setSortDirection}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue placeholder="Order" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Descending</SelectItem>
                    <SelectItem value="asc">Ascending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button variant="outline" size="sm" onClick={clearResults}>
                <X className="mr-2 h-4 w-4" />
                Clear Results
              </Button>
            </div>
          )}

          {filteredAndSortedPredicates.length > 0 && (
            <div className="results-container">
              <Table>
                <TableCaption>
                  Found {filteredAndSortedPredicates.length} potential predicate devices.
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Select</TableHead>
                    <TableHead>Device Name</TableHead>
                    <TableHead>Manufacturer</TableHead>
                    <TableHead>K Number</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead className="w-[100px]">Class</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedPredicates.map(predicate => (
                    <TableRow
                      key={predicate.id}
                      className={
                        selectedPredicates.some(p => p.id === predicate.id) ? 'bg-muted/50' : ''
                      }
                    >
                      <TableCell>
                        <Button
                          variant={
                            selectedPredicates.some(p => p.id === predicate.id)
                              ? 'default'
                              : 'outline'
                          }
                          size="icon"
                          onClick={() => togglePredicateSelection(predicate)}
                        >
                          {selectedPredicates.some(p => p.id === predicate.id) ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>{predicate.deviceName || 'Unknown Device'}</TableCell>
                      <TableCell>{predicate.manufacturer || 'Unknown'}</TableCell>
                      <TableCell>
                        {predicate.kNumber ? (
                          <Badge variant="outline">{predicate.kNumber}</Badge>
                        ) : (
                          'N/A'
                        )}
                      </TableCell>
                      <TableCell>{predicate.year || 'N/A'}</TableCell>
                      <TableCell>
                        {predicate.deviceClass ? <Badge>{predicate.deviceClass}</Badge> : 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedPredicates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Selected Predicates ({selectedPredicates.length})
            </CardTitle>
            <CardDescription>Generate a comparison table for your submission</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="selected-predicates-list mb-4">
              {selectedPredicates.map(predicate => (
                <div
                  key={predicate.id}
                  className="flex items-center justify-between p-2 border rounded-md mb-2"
                >
                  <div>
                    <div className="font-medium">{predicate.deviceName || 'Unknown Device'}</div>
                    <div className="text-sm text-gray-500">
                      {predicate.manufacturer || 'Unknown'}{' '}
                      {predicate.kNumber ? `• ${predicate.kNumber}` : ''}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => togglePredicateSelection(predicate)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex space-x-2">
              <Button
                onClick={generateComparisonTable}
                disabled={isGeneratingComparison || selectedPredicates.length === 0}
              >
                {isGeneratingComparison ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Generate Comparison
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {comparisonTable && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Device Comparison Table</CardTitle>
            <CardDescription>Comparison of subject device with selected predicates</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="comparison-preview border rounded-md p-4 mb-4 max-h-[400px] overflow-auto"
              dangerouslySetInnerHTML={{ __html: comparisonTable }}
            />
          </CardContent>
          <CardFooter className="flex justify-end space-x-2">
            <Button variant="outline" onClick={copyComparisonToClipboard}>
              <Copy className="mr-2 h-4 w-4" />
              Copy HTML
            </Button>
            <Button
              onClick={() => {
                const blob = new Blob([comparisonTable], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'predicate-comparison.html';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Download HTML
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
};

export default PredicateDeviceComparison;
