import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, X, FileDown } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';

type Specification = {
  parameter: string;
  limit: string;
  result: string;
};

type StabilityData = {
  timepoint: string;
  result: string;
};

type ManualFormData = {
  drug_name: string;
  manufacturing_site: string;
  batch_number: string;
  specifications: Specification[];
  stability_data: StabilityData[];
};

const initialFormData: ManualFormData = {
  drug_name: '',
  manufacturing_site: '',
  batch_number: '',
  specifications: [{ parameter: '', limit: '', result: '' }],
  stability_data: [{ timepoint: '', result: '' }],
};

export default function ManualDataForm() {
  const [formData, setFormData] = useState<ManualFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });

  const handleBaseInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSpecificationChange = (index: number, field: keyof Specification, value: string) => {
    const newSpecifications = [...formData.specifications];
    newSpecifications[index] = {
      ...newSpecifications[index],
      [field]: value,
    };
    setFormData(prev => ({
      ...prev,
      specifications: newSpecifications,
    }));
  };

  const handleStabilityDataChange = (index: number, field: keyof StabilityData, value: string) => {
    const newStabilityData = [...formData.stability_data];
    newStabilityData[index] = {
      ...newStabilityData[index],
      [field]: value,
    };
    setFormData(prev => ({
      ...prev,
      stability_data: newStabilityData,
    }));
  };

  const addSpecification = () => {
    setFormData(prev => ({
      ...prev,
      specifications: [...prev.specifications, { parameter: '', limit: '', result: '' }],
    }));
  };

  const addStabilityData = () => {
    setFormData(prev => ({
      ...prev,
      stability_data: [...prev.stability_data, { timepoint: '', result: '' }],
    }));
  };

  const removeSpecification = (index: number) => {
    if (formData.specifications.length === 1) return;
    const newSpecifications = [...formData.specifications];
    newSpecifications.splice(index, 1);
    setFormData(prev => ({
      ...prev,
      specifications: newSpecifications,
    }));
  };

  const removeStabilityData = (index: number) => {
    if (formData.stability_data.length === 1) return;
    const newStabilityData = [...formData.stability_data];
    newStabilityData.splice(index, 1);
    setFormData(prev => ({
      ...prev,
      stability_data: newStabilityData,
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.drug_name || !formData.manufacturing_site || !formData.batch_number) {
      setStatus({
        type: 'error',
        message: 'Please fill in all required fields',
      });
      return false;
    }

    const hasEmptySpec = formData.specifications.some(
      spec => !spec.parameter || !spec.limit || !spec.result
    );
    const hasEmptyStability = formData.stability_data.some(data => !data.timepoint || !data.result);

    if (hasEmptySpec || hasEmptyStability) {
      setStatus({
        type: 'error',
        message: 'Please fill in all specification and stability data fields',
      });
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setStatus({ type: null, message: '' });

    try {
      const response = await fetch('/api/ind-automation/generate/module3', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to generate document');
      }

      // Since this endpoint returns a file, handle the blob and create a download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      // Create and click a temporary download link
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `Module3_CMC_${formData.drug_name.replace(/\s+/g, '_')}.docx`;
      document.body.appendChild(a);
      a.click();

      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setStatus({
        type: 'success',
        message: 'Document generated successfully and download started',
      });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Manual Data Entry</h3>
      <p className="text-sm text-muted-foreground">
        Enter drug information manually to generate a Module 3 document
      </p>

      {status.type && (
        <Alert variant={status.type === 'error' ? 'destructive' : 'default'}>
          <AlertTitle>{status.type === 'success' ? 'Success' : 'Error'}</AlertTitle>
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="drug_name">Drug Name</Label>
            <Input
              id="drug_name"
              name="drug_name"
              value={formData.drug_name}
              onChange={handleBaseInputChange}
              placeholder="e.g., Compound X-123"
              disabled={isSubmitting}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="batch_number">Batch Number</Label>
            <Input
              id="batch_number"
              name="batch_number"
              value={formData.batch_number}
              onChange={handleBaseInputChange}
              placeholder="e.g., BATCH-001-2025"
              disabled={isSubmitting}
              required
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="manufacturing_site">Manufacturing Site</Label>
            <Input
              id="manufacturing_site"
              name="manufacturing_site"
              value={formData.manufacturing_site}
              onChange={handleBaseInputChange}
              placeholder="e.g., Main Production Facility, Building 7"
              disabled={isSubmitting}
              required
            />
          </div>
        </div>

        <Accordion type="single" collapsible defaultValue="item-1">
          <AccordionItem value="item-1">
            <AccordionTrigger>Specifications</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                {formData.specifications.map((spec, index) => (
                  <Card key={index} className="relative">
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`spec-param-${index}`}>Parameter</Label>
                          <Input
                            id={`spec-param-${index}`}
                            value={spec.parameter}
                            onChange={e =>
                              handleSpecificationChange(index, 'parameter', e.target.value)
                            }
                            placeholder="e.g., Appearance"
                            disabled={isSubmitting}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`spec-limit-${index}`}>Limit</Label>
                          <Input
                            id={`spec-limit-${index}`}
                            value={spec.limit}
                            onChange={e =>
                              handleSpecificationChange(index, 'limit', e.target.value)
                            }
                            placeholder="e.g., White powder"
                            disabled={isSubmitting}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`spec-result-${index}`}>Result</Label>
                          <Input
                            id={`spec-result-${index}`}
                            value={spec.result}
                            onChange={e =>
                              handleSpecificationChange(index, 'result', e.target.value)
                            }
                            placeholder="e.g., White powder"
                            disabled={isSubmitting}
                            required
                          />
                        </div>
                      </div>
                      {formData.specifications.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2"
                          onClick={() => removeSpecification(index)}
                          disabled={isSubmitting}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={addSpecification}
                  disabled={isSubmitting}
                >
                  <Plus className="h-4 w-4 mr-2" /> Add Specification
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>Stability Data</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                {formData.stability_data.map((data, index) => (
                  <Card key={index} className="relative">
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`stab-time-${index}`}>Time Point</Label>
                          <Input
                            id={`stab-time-${index}`}
                            value={data.timepoint}
                            onChange={e =>
                              handleStabilityDataChange(index, 'timepoint', e.target.value)
                            }
                            placeholder="e.g., Initial"
                            disabled={isSubmitting}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`stab-result-${index}`}>Result</Label>
                          <Input
                            id={`stab-result-${index}`}
                            value={data.result}
                            onChange={e =>
                              handleStabilityDataChange(index, 'result', e.target.value)
                            }
                            placeholder="e.g., 99.5%"
                            disabled={isSubmitting}
                            required
                          />
                        </div>
                      </div>
                      {formData.stability_data.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2"
                          onClick={() => removeStabilityData(index)}
                          disabled={isSubmitting}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={addStabilityData}
                  disabled={isSubmitting}
                >
                  <Plus className="h-4 w-4 mr-2" /> Add Stability Data
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <FileDown className="mr-2 h-4 w-4" />
              Generate Document
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
