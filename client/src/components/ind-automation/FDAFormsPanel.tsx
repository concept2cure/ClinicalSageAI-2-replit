import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, } from '@/components/ui/form';
import { Loader2, FileDown, CheckCircle } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

// Define form validation schema
const formSchema = z.object({
  sponsor_name: z.string().min(1, { message: 'Sponsor name is required' }),
  sponsor_address: z.string().min(1, { message: 'Sponsor address is required' }),
  sponsor_phone: z.string().optional(),
  ind_number: z.string().optional(),
  drug_name: z.string().min(1, { message: 'Drug name is required' }),
  indication: z.string().optional(),
  protocol_number: z.string().optional(),
  protocol_title: z.string().optional(),
  phase: z.string().min(1, { message: 'Phase is required' }),
  submission_date: z.string().optional(),
  nct_number: z.string().optional(),
  principal_investigator_name: z.string().optional(),
  investigator_address: z.string().optional(),
  investigator_phone: z.string().optional(),
  irb_name: z.string().optional(),
  irb_address: z.string().optional(),
  clinical_lab_name: z.string().optional(),
  clinical_lab_address: z.string().optional(),
  research_facility_name: z.string().optional(),
  research_facility_address: z.string().optional(),
  subinvestigators: z.string().optional(),
  contact_name: z.string().optional(),
  contact_email: z.string().optional(),
  contact_phone: z.string().optional(),
  authorizer_name: z.string().optional(),
  authorizer_title: z.string().optional(),
  certifier_name: z.string().optional(),
  certifier_title: z.string().optional(),
  certifier_address: z.string().optional(),
  certifier_email: z.string().optional(),
  certifier_phone: z.string().optional(),
  certifier_fax: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function FDAFormsPanel() {
  const [activeForm, setActiveForm] = useState<string>('form1571');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });

  // Default form values
  const defaultValues: FormValues = {
    sponsor_name: '',
    sponsor_address: '',
    sponsor_phone: '',
    ind_number: '',
    drug_name: '',
    indication: '',
    protocol_number: '',
    protocol_title: '',
    phase: 'Phase 1',
    submission_date: new Date().toISOString().split('T')[0],
    nct_number: '',
    principal_investigator_name: '',
    investigator_address: '',
    investigator_phone: '',
    irb_name: '',
    irb_address: '',
    clinical_lab_name: '',
    clinical_lab_address: '',
    research_facility_name: '',
    research_facility_address: '',
    subinvestigators: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    authorizer_name: '',
    authorizer_title: '',
    certifier_name: '',
    certifier_title: '',
    certifier_address: '',
    certifier_email: '',
    certifier_phone: '',
    certifier_fax: '',
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const handleFormSelection = (value: string) => {
    setActiveForm(value);
    setStatus({ type: null, message: '' });
  };

  const generateDocument = async (data: FormValues) => {
    setIsSubmitting(true);
    setStatus({ type: null, message: '' });

    let endpoint = '';
    let filename = '';

    // Determine endpoint and filename based on the active form
    switch (activeForm) {
      case 'form1571':
        endpoint = '/api/ind/form1571';
        filename = `FDA_Form_1571_${data.drug_name.replace(/\s+/g, '_')}.docx`;
        break;
      case 'form1572':
        endpoint = '/api/ind/form1572';
        filename = `FDA_Form_1572_${data.principal_investigator_name || data.drug_name.replace(/\s+/g, '_')}.docx`;
        break;
      case 'form3674':
        endpoint = '/api/ind/form3674';
        filename = `FDA_Form_3674_${data.drug_name.replace(/\s+/g, '_')}.docx`;
        break;
      case 'cover-letter':
        endpoint = '/api/ind/cover-letter';
        filename = `Cover_Letter_${data.drug_name.replace(/\s+/g, '_')}.docx`;
        break;
      default:
        setStatus({
          type: 'error',
          message: 'Invalid form selection',
        });
        setIsSubmitting(false);
        return;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to generate document');
      }

      // Handle the file download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      // Create and click a temporary download link
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
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
      <h3 className="text-lg font-medium">FDA Forms Generator</h3>
      <p className="text-sm text-muted-foreground">
        Generate FDA forms for your Investigational New Drug (IND) Application
      </p>

      {status.type && (
        <Alert variant={status.type === 'error' ? 'destructive' : 'default'}>
          <AlertTitle>{status.type === 'success' ? 'Success' : 'Error'}</AlertTitle>
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeForm} onValueChange={handleFormSelection}>
        <TabsList className="grid grid-cols-4">
          <TabsTrigger value="form1571">Form 1571</TabsTrigger>
          <TabsTrigger value="form1572">Form 1572</TabsTrigger>
          <TabsTrigger value="form3674">Form 3674</TabsTrigger>
          <TabsTrigger value="cover-letter">Cover Letter</TabsTrigger>
        </TabsList>

        <TabsContent value="form1571">
          <div className="mb-4 mt-2">
            <h4 className="text-base font-semibold">FDA Form 1571</h4>
            <p className="text-sm text-muted-foreground">
              Investigational New Drug Application (IND)
            </p>
          </div>
        </TabsContent>

        <TabsContent value="form1572">
          <div className="mb-4 mt-2">
            <h4 className="text-base font-semibold">FDA Form 1572</h4>
            <p className="text-sm text-muted-foreground">Statement of Investigator</p>
          </div>
        </TabsContent>

        <TabsContent value="form3674">
          <div className="mb-4 mt-2">
            <h4 className="text-base font-semibold">FDA Form 3674</h4>
            <p className="text-sm text-muted-foreground">
              Certification of Compliance with ClinicalTrials.gov Requirements
            </p>
          </div>
        </TabsContent>

        <TabsContent value="cover-letter">
          <div className="mb-4 mt-2">
            <h4 className="text-base font-semibold">Cover Letter</h4>
            <p className="text-sm text-muted-foreground">Cover letter for IND submission</p>
          </div>
        </TabsContent>
      </Tabs>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(generateDocument)} className="space-y-6">
          <Accordion type="multiple" defaultValue={['item-1']}>
            <AccordionItem value="item-1">
              <AccordionTrigger>Basic Information</AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="sponsor_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sponsor Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Acme Pharmaceuticals"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="drug_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Drug Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Compound X-123"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="sponsor_address"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Sponsor Address</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., 123 Medical Park, Suite 456, Boston, MA 02118"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="sponsor_phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sponsor Phone</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., (555) 123-4567"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="ind_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IND Number</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Leave blank for new IND applications"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="indication"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Indication</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Advanced Solid Tumors"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phase"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phase</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          disabled={isSubmitting}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select phase" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Phase 1">Phase 1</SelectItem>
                            <SelectItem value="Phase 2">Phase 2</SelectItem>
                            <SelectItem value="Phase 3">Phase 3</SelectItem>
                            <SelectItem value="Phase 1/2">Phase 1/2</SelectItem>
                            <SelectItem value="Phase 2/3">Phase 2/3</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="submission_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Submission Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} disabled={isSubmitting} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2">
              <AccordionTrigger>Protocol Information</AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="protocol_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Protocol Number</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., XYZ-123-01"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="nct_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ClinicalTrials.gov Number (NCT)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., NCT01234567"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="protocol_title"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Protocol Title</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., A Phase 1 Study of Drug X in Patients with Advanced Solid Tumors"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3">
              <AccordionTrigger>Investigator Information</AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="principal_investigator_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Principal Investigator Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Dr. Jane Smith"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="investigator_phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Investigator Phone</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., (555) 987-6543"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="investigator_address"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Investigator Address</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., 789 Research Center, New York, NY 10001"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="research_facility_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Research Facility Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., University Medical Center"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="research_facility_address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Research Facility Address</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., 789 Research Center, New York, NY 10001"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="subinvestigators"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Subinvestigators</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Dr. John Doe, Dr. Sarah Johnson"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4">
              <AccordionTrigger>IRB & Clinical Lab</AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="irb_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IRB Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Central Research Ethics Committee"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="irb_address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IRB Address</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., 456 Ethics Blvd, Suite 100, Chicago, IL 60601"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="clinical_lab_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Clinical Laboratory Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Central Clinical Labs"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="clinical_lab_address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Clinical Laboratory Address</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., 789 Lab Drive, Boston, MA 02115"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5">
              <AccordionTrigger>Contact & Authorization</AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="contact_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Dr. Robert Johnson"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contact_phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Phone</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., (555) 123-4567"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contact_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Email</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., robert.johnson@company.com"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="authorizer_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Authorizer Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Dr. Marie Thompson"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="authorizer_title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Authorizer Title</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Chief Medical Officer"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="certifier_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Certifier Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Dr. David Wilson"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="certifier_title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Certifier Title</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Director of Regulatory Affairs"
                            {...field}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                Generate {activeFormNames[activeForm]}
              </>
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}

// Helper for form names display
const activeFormNames: Record<string, string> = {
  form1571: 'FDA Form 1571',
  form1572: 'FDA Form 1572',
  form3674: 'FDA Form 3674',
  'cover-letter': 'Cover Letter',
};
