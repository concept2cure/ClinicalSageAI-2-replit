import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Sparkles, Shield, RotateCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { documentIntelligenceService } from '@/services/DocumentIntelligenceService';

/**
 * Document Intake Form Component
 *
 * This component allows the user to review extracted data from documents
 * and selectively apply it to their device profile.
 *
 * @param {Object} props
 * @param {Object} props.extractedData - The data extracted from documents
 * @param {string} props.regulatoryContext - The regulatory context (510k, cer, etc.)
 * @param {Function} props.onApplyData - Callback for when data is applied
 */
const DocumentIntakeForm = ({ extractedData = null, regulatoryContext = '510k', onApplyData }) => {
  const [selectedFields, setSelectedFields] = useState({});
  const [isApplying, setIsApplying] = useState(false);
  const [enhancedData, setEnhancedData] = useState(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [groupedFields, setGroupedFields] = useState({});
  const { toast } = useToast();

  // Initialize form when extracted data changes
  useEffect(() => {
    if (extractedData) {
      initializeForm();
    }
  }, [extractedData]);

  // Initialize the form with data from the analyzer
  const initializeForm = () => {
    // Group fields by category
    const groups = {
      'Device Information': [
        'deviceName',
        'manufacturer',
        'productCode',
        'deviceClass',
        'intendedUse',
        'description',
      ],
      'Regulatory Information': ['regulatoryClass', 'status', 'classification', 'riskLevel'],
      'Technical Specifications': ['technicalSpecifications', 'performance', 'standards'],
      'Clinical Data': ['clinicalEvaluation', 'clinicalStudies', 'adverseEvents'],
      'Other Information': [],
    };

    // Determine which fields are available in the extracted data
    const availableFields = {};
    const initialSelection = {};

    Object.keys(extractedData).forEach(key => {
      if (
        key !== 'validation' &&
        key !== 'confidence' &&
        key !== 'sourceDocuments' &&
        !key.endsWith('Confidence')
      ) {
        // Determine which group this field belongs to
        let group = 'Other Information';
        for (const [groupName, fields] of Object.entries(groups)) {
          if (fields.includes(key)) {
            group = groupName;
            break;
          }
        }

        // Add to available fields
        if (!availableFields[group]) {
          availableFields[group] = [];
        }
        availableFields[group].push(key);

        // Set initial selection based on confidence
        const confidenceKey = `${key}Confidence`;
        const confidence = extractedData[confidenceKey] || 0;

        // Auto-select high confidence fields
        initialSelection[key] = confidence >= 0.75;
      }
    });

    setGroupedFields(availableFields);
    setSelectedFields(initialSelection);
  };

  // Handle checkbox change for a field
  const handleFieldSelection = fieldName => {
    setSelectedFields(prev => ({
      ...prev,
      [fieldName]: !prev[fieldName],
    }));
  };

  // Select all fields
  const handleSelectAll = () => {
    const allFields = {};
    Object.values(groupedFields)
      .flat()
      .forEach(field => {
        allFields[field] = true;
      });
    setSelectedFields(allFields);
  };

  // Deselect all fields
  const handleDeselectAll = () => {
    const noFields = {};
    Object.values(groupedFields)
      .flat()
      .forEach(field => {
        noFields[field] = false;
      });
    setSelectedFields(noFields);
  };

  // Enhance the extracted data
  const handleEnhanceData = async () => {
    if (!extractedData) return;

    setIsEnhancing(true);

    try {
      // Get enhanced data from the service
      const enhanced = await documentIntelligenceService.enhanceExtractedData(
        extractedData,
        regulatoryContext
      );

      setEnhancedData(enhanced);

      // Update selected fields with new data
      const updatedSelections = { ...selectedFields };
      Object.keys(enhanced).forEach(key => {
        if (!extractedData[key] && enhanced[key]) {
          // New field was added by enhancement
          updatedSelections[key] = true;
        }
      });

      setSelectedFields(updatedSelections);

      // Update grouped fields to include new fields
      const updatedGroups = { ...groupedFields };
      Object.keys(enhanced).forEach(key => {
        if (
          !extractedData[key] &&
          enhanced[key] &&
          key !== 'validation' &&
          key !== 'confidence' &&
          key !== 'sourceDocuments' &&
          !key.endsWith('Confidence')
        ) {
          // Determine which group this field belongs to
          let group = 'Other Information';
          updatedGroups[group].push(key);
        }
      });

      setGroupedFields(updatedGroups);

      toast({
        title: 'Data Enhanced',
        description: 'Successfully enhanced the extracted data with AI-powered insights.',
        variant: 'success',
      });
    } catch (error) {
      console.error('Error enhancing data:', error);

      toast({
        title: 'Enhancement Failed',
        description: error.message || 'An error occurred during data enhancement.',
        variant: 'destructive',
      });
    } finally {
      setIsEnhancing(false);
    }
  };

  // Apply the selected data
  const handleApplyData = () => {
    if (!extractedData) return;

    setIsApplying(true);

    try {
      // Create an object with only the selected fields
      const dataToApply = {};

      Object.keys(selectedFields).forEach(key => {
        if (selectedFields[key]) {
          // Use enhanced data if available, otherwise use extracted data
          dataToApply[key] =
            enhancedData && enhancedData[key] ? enhancedData[key] : extractedData[key];
        }
      });

      // Call the callback with the data to apply
      if (onApplyData) {
        onApplyData(dataToApply);
      }

      toast({
        title: 'Data Applied',
        description: 'The selected data has been applied to your device profile.',
        variant: 'success',
      });
    } catch (error) {
      console.error('Error applying data:', error);

      toast({
        title: 'Application Failed',
        description: error.message || 'An error occurred while applying the data.',
        variant: 'destructive',
      });
    } finally {
      setIsApplying(false);
    }
  };

  // Get field confidence level class
  const getConfidenceClass = fieldName => {
    const confidenceKey = `${fieldName}Confidence`;
    const confidence = extractedData[confidenceKey] || enhancedData?.[confidenceKey] || 0;

    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Get badge for field origin
  const getFieldOriginBadge = fieldName => {
    // Check if field was added during enhancement
    if (enhancedData && enhancedData[fieldName] && !extractedData[fieldName]) {
      return (
        <Badge variant="outline" className="bg-purple-50 text-purple-700 ml-2">
          AI Enhanced
        </Badge>
      );
    }

    // Check confidence level
    const confidenceKey = `${fieldName}Confidence`;
    const confidence = extractedData[confidenceKey] || 0;

    if (confidence >= 0.8) {
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 ml-2">
          High Confidence
        </Badge>
      );
    }

    if (confidence >= 0.5) {
      return (
        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 ml-2">
          Medium Confidence
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="bg-red-50 text-red-700 ml-2">
        Low Confidence
      </Badge>
    );
  };

  // Render content when no data is available
  const renderEmptyState = () => (
    <div className="text-center py-8">
      <div className="mb-4">
        <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto" />
      </div>
      <h3 className="text-lg font-medium mb-2">No Data Available</h3>
      <p className="text-muted-foreground max-w-md mx-auto">
        No extracted data is available for review. Please complete the document analysis process
        first.
      </p>
    </div>
  );

  // Main render function
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Shield className="h-5 w-5 mr-2" />
            Review & Apply Data
          </CardTitle>
          <CardDescription>
            Review the extracted data and select which fields to apply to your device profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!extractedData ? (
            renderEmptyState()
          ) : (
            <div className="space-y-6">
              {/* Data Enhancement Button */}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={handleEnhanceData}
                  disabled={isEnhancing}
                  className="group"
                >
                  {isEnhancing ? (
                    <>
                      <RotateCw className="h-4 w-4 mr-2 animate-spin" />
                      Enhancing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2 text-purple-500 group-hover:animate-pulse" />
                      Enhance with AI
                    </>
                  )}
                </Button>
              </div>

              {/* Selection Controls */}
              <div className="flex space-x-2 mb-4">
                <Button variant="secondary" size="sm" onClick={handleSelectAll}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                  Deselect All
                </Button>
              </div>

              {/* Field Selection Form */}
              <div className="space-y-6">
                {Object.entries(groupedFields).map(
                  ([groupName, fields]) =>
                    fields.length > 0 && (
                      <div key={groupName} className="space-y-3">
                        <h3 className="text-base font-medium">{groupName}</h3>
                        <Separator className="my-2" />

                        <div className="space-y-2">
                          {fields.map(field => {
                            const value =
                              enhancedData && enhancedData[field]
                                ? enhancedData[field]
                                : extractedData[field];

                            if (!value) return null;

                            return (
                              <div
                                key={field}
                                className="flex items-start space-x-3 p-2 rounded-md hover:bg-muted/50"
                              >
                                <Checkbox
                                  id={`field-${field}`}
                                  checked={selectedFields[field] || false}
                                  onCheckedChange={() => handleFieldSelection(field)}
                                  className="mt-1"
                                />
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center">
                                    <label
                                      htmlFor={`field-${field}`}
                                      className={`text-sm font-medium ${getConfidenceClass(field)}`}
                                    >
                                      {field.replace(/([A-Z])/g, ' $1').trim()}
                                    </label>
                                    {getFieldOriginBadge(field)}
                                  </div>
                                  <div className="text-sm text-muted-foreground truncate">
                                    {typeof value === 'object'
                                      ? JSON.stringify(value)
                                      : String(value)}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )
                )}
              </div>

              {/* No Fields Selected Warning */}
              {Object.values(selectedFields).every(selected => !selected) && (
                <div className="flex items-center p-3 bg-yellow-50 rounded-md">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 mr-2 flex-shrink-0" />
                  <p className="text-sm text-yellow-700">
                    No fields are currently selected. Select at least one field to apply to your
                    device profile.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="flex items-center text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
            {Object.values(selectedFields).filter(Boolean).length} fields selected
          </div>
          <Button
            onClick={handleApplyData}
            disabled={
              isApplying ||
              !extractedData ||
              Object.values(selectedFields).every(selected => !selected)
            }
          >
            {isApplying ? 'Applying...' : 'Apply Selected Data'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default DocumentIntakeForm;
