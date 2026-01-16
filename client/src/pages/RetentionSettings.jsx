import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, } from '@/components/ui/dialog';
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, Check, Copy, Edit, PlusCircle, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge';
import RetentionDashboard from '@/components/RetentionDashboard';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

// Define the schema for policy validation
const policySchema = z.object({
  policyName: z.string().min(3, { message: 'Policy name must be at least 3 characters' }).max(100),
  documentType: z.string().min(1, { message: 'Document type is required' }),
  retentionPeriod: z.number().int().positive({ message: 'Period must be a positive number' }),
  periodUnit: z.enum(['days', 'months', 'years']),
  archiveBeforeDelete: z.boolean().default(true),
  notifyBeforeDeletion: z.boolean().default(true),
  notificationPeriod: z.number().int().nonnegative(),
  notificationUnit: z.enum(['days', 'months', 'years']),
  active: z.boolean().default(true),
});

export default function RetentionSettings() {
  const [policies, setPolicies] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentPolicy, setCurrentPolicy] = useState(null);
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(policySchema),
    defaultValues: {
      policyName: '',
      documentType: '',
      retentionPeriod: 36,
      periodUnit: 'months',
      archiveBeforeDelete: true,
      notifyBeforeDeletion: true,
      notificationPeriod: 30,
      notificationUnit: 'days',
      active: true,
    },
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (currentPolicy && isEditing) {
      form.reset({
        policyName: currentPolicy.policyName,
        documentType: currentPolicy.documentType,
        retentionPeriod: currentPolicy.retentionPeriod,
        periodUnit: currentPolicy.periodUnit,
        archiveBeforeDelete: currentPolicy.archiveBeforeDelete,
        notifyBeforeDeletion: currentPolicy.notifyBeforeDeletion,
        notificationPeriod: currentPolicy.notificationPeriod,
        notificationUnit: currentPolicy.notificationUnit,
        active: currentPolicy.active,
      });
    }
  }, [currentPolicy, isEditing, form]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Use the new API routes
      const [policiesRes, typesRes] = await Promise.all([
        axios.get('/api/retention/policies'),
        axios.get('/api/retention/document-types'),
      ]);

      setPolicies(policiesRes.data?.data || []);
      setDocumentTypes(typesRes.data?.data || []);
    } catch (error) {
      console.error('Error loading retention data:', error);
      toast({
        title: 'Error loading data',
        description: error.response?.data?.message || error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async values => {
    try {
      if (isEditing && currentPolicy) {
        // Update existing policy
        await axios.put(`/api/retention/policies/${currentPolicy.id}`, values);
        toast({
          title: 'Policy updated',
          description: 'The retention policy has been updated successfully.',
        });
      } else {
        // Create new policy
        await axios.post('/api/retention/policies', values);
        toast({
          title: 'Policy created',
          description: 'A new retention policy has been created successfully.',
        });
      }

      // Reset form and reload data
      form.reset();
      loadData();
      setIsCreating(false);
      setIsEditing(false);
      setCurrentPolicy(null);
    } catch (error) {
      console.error('Error saving policy:', error);
      toast({
        title: 'Error saving policy',
        description: error.response?.data?.message || error.message,
        variant: 'destructive',
      });
    }
  };

  const handleEdit = policy => {
    setCurrentPolicy(policy);
    setIsEditing(true);
    setIsCreating(true);
  };

  const handleDelete = async policy => {
    if (
      !window.confirm(
        `Are you sure you want to delete policy "${policy.policyName}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await axios.delete(`/api/retention/policies/${policy.id}`);
      toast({
        title: 'Policy deleted',
        description: 'The retention policy has been deleted successfully.',
      });
      loadData();
    } catch (error) {
      console.error('Error deleting policy:', error);
      toast({
        title: 'Error deleting policy',
        description: error.response?.data?.message || error.message,
        variant: 'destructive',
      });
    }
  };

  const handleRunJob = async () => {
    try {
      await axios.post('/api/retention/run-job');
      toast({
        title: 'Job started',
        description:
          'The retention job has been started. This may take several minutes to complete.',
      });
    } catch (error) {
      console.error('Error starting job:', error);
      toast({
        title: 'Error starting job',
        description: error.response?.data?.message || error.message,
        variant: 'destructive',
      });
    }
  };

  const cancelForm = () => {
    form.reset();
    setIsCreating(false);
    setIsEditing(false);
    setCurrentPolicy(null);
  };

  const formatPeriodDisplay = (period, unit) => {
    return `${period} ${unit}`;
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-primary">Document Retention</h1>
        <div className="flex items-center gap-4">
          <Button onClick={() => setIsCreating(true)} variant="default" className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Create Policy
          </Button>
          <Button onClick={handleRunJob} variant="outline" className="gap-2">
            Run Retention Job
          </Button>
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <RetentionDashboard />
        </TabsContent>

        <TabsContent value="policies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Retention Policies</CardTitle>
              <CardDescription>
                Manage document retention policies for your organization.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center p-8">
                  <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy Name</TableHead>
                      <TableHead>Document Type</TableHead>
                      <TableHead>Retention Period</TableHead>
                      <TableHead>Archive Before Delete</TableHead>
                      <TableHead>Notification</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policies.map(policy => (
                      <TableRow key={policy.id}>
                        <TableCell className="font-medium">{policy.policyName}</TableCell>
                        <TableCell>{policy.documentType}</TableCell>
                        <TableCell>
                          {formatPeriodDisplay(policy.retentionPeriod, policy.periodUnit)}
                        </TableCell>
                        <TableCell>
                          {policy.archiveBeforeDelete ? (
                            <Badge
                              variant="outline"
                              className="bg-blue-50 text-blue-700 border-blue-200"
                            >
                              Yes
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-rose-50 text-rose-700 border-rose-200"
                            >
                              No
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {policy.notifyBeforeDeletion ? (
                            <Badge
                              variant="outline"
                              className="bg-green-50 text-green-700 border-green-200"
                            >
                              {formatPeriodDisplay(
                                policy.notificationPeriod,
                                policy.notificationUnit
                              )}{' '}
                              before
                            </Badge>
                          ) : (
                            <Badge variant="outline">Disabled</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {policy.active ? (
                            <Badge className="bg-green-100 text-green-800 border-green-200">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(policy)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => handleDelete(policy)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}

                    {policies.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No retention policies found. Click "Create Policy" to add one.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Retention Job Settings</CardTitle>
              <CardDescription>Configure how the automatic retention job runs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Job Schedule</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Daily Cleanup</p>
                        <p className="text-sm text-muted-foreground">
                          Run retention job at 1:00 AM every day
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Weekly Deep Scan</p>
                        <p className="text-sm text-muted-foreground">
                          Run thorough scan on Sundays at 2:00 AM
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Monthly Report</p>
                        <p className="text-sm text-muted-foreground">Send monthly summary report</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Notification Settings</h3>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="email-notif" defaultChecked />
                      <label
                        htmlFor="email-notif"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Email notifications
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="slack-notif" defaultChecked />
                      <label
                        htmlFor="slack-notif"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Slack notifications
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="dashboard-notif" defaultChecked />
                      <label
                        htmlFor="dashboard-notif"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Dashboard notifications
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="ml-auto">Save Settings</Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Policy Creation/Edit Dialog */}
      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Edit Retention Policy' : 'Create Retention Policy'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update the settings for this document retention policy.'
                : 'Configure how long documents should be retained before archiving or deletion.'}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="policyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Policy Name</FormLabel>
                      <FormControl>
                        <Input placeholder="SOPs Retention Policy" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="documentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select document type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {documentTypes.length > 0 ? (
                            documentTypes.map(type => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="protocol">Protocol</SelectItem>
                          )}
                          <SelectItem value="sop">SOP</SelectItem>
                          <SelectItem value="csr">CSR</SelectItem>
                          <SelectItem value="correspondence">Correspondence</SelectItem>
                          <SelectItem value="report">Report</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="retentionPeriod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Retention Period</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          {...field}
                          onChange={e => field.onChange(parseInt(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="periodUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Period Unit</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="days">Days</SelectItem>
                          <SelectItem value="months">Months</SelectItem>
                          <SelectItem value="years">Years</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="archiveBeforeDelete"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Archive Before Delete</FormLabel>
                      <FormDescription>
                        Archive documents in long-term storage before permanent deletion
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notifyBeforeDeletion"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Notify Before Deletion</FormLabel>
                      <FormDescription>
                        Send notifications when documents are approaching their retention limit
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              {form.watch('notifyBeforeDeletion') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="notificationPeriod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notification Period</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            {...field}
                            onChange={e => field.onChange(parseInt(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>How far in advance to send notifications</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notificationUnit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notification Unit</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select unit" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="days">Days</SelectItem>
                            <SelectItem value="months">Months</SelectItem>
                            <SelectItem value="years">Years</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active</FormLabel>
                      <FormDescription>
                        Only active policies will be processed by the retention job
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={cancelForm}>
                  Cancel
                </Button>
                <Button type="submit">{isEditing ? 'Update Policy' : 'Create Policy'}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
