import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
 Form,
 FormControl,
 FormDescription,
 FormField,
 FormItem,
 FormLabel,
 FormMessage,
} from '@/components/ui/form';
import { DialogFooter } from '@/components/ui/dialog';
import {
 Accordion,
 AccordionContent,
 AccordionItem,
 AccordionTrigger,
} from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, HelpCircle, Info, CheckCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/toaster';
import deviceProfileSchema from './schemas/deviceProfile.json';
import { useTenant } from '@/contexts/TenantContext.tsx';
import { FDA510kService } from '@/services/FDA510kService';

// Enhanced Zod schema with additional fields for 510(k) submission
const deviceProfileZodSchema = z.object({
 deviceName: z
 .string()
 .min(2, {
 message: 'Device name must be at least 2 characters.',
 })
 .max(200, {
 message: 'Device name must not exceed 200 characters.',
 }),
 modelNumber: z
 .string()
 .max(100, {
 message: 'Model number must not exceed 100 characters.',
 })
 .optional(),
 manufacturer: z
 .string()
 .max(200, {
 message: 'Manufacturer must not exceed 200 characters.',
 })
 .optional(),
 deviceClass: z.enum(['I', 'II', 'III'], {
 message: 'Please select a valid device class.',
 }),
 intendedUse: z
 .string()
 .min(10, {
 message: 'Intended use must be at least 10 characters.',
 })
 .max(2000, {
 message: 'Intended use must not exceed 2000 characters.',
 }),
 technologyType: z
 .string()
 .max(200, {
 message: 'Technology type must not exceed 200 characters.',
 })
 .optional(),
 predicateDevice: z
 .string()
 .max(200, {
 message: 'Predicate device must not exceed 200 characters.',
 })
 .optional(),
 deviceDescription: z
 .string()
 .max(2000, {
 message: 'Device description must not exceed 2000 characters.',
 })
 .optional(),
 regulatoryHistory: z
 .string()
 .max(1000, {
 message: 'Regulatory history must not exceed 1000 characters.',
 })
 .optional(),
 substantialEquivalence: z
 .string()
 .max(1000, {
 message: 'Substantial equivalence rationale must not exceed 1000 characters.',
 })
 .optional(),
 sterilization: z.boolean().optional().default(false),
 software: z.boolean().optional().default(false),
 contactType: z.enum(['none', 'external', 'implant', 'blood_path']).optional().default('none'),
 marketHistory: z
 .string()
 .max(1000, {
 message: 'Market history must not exceed 1000 characters.',
 })
 .optional(),
 productCode: z
 .string()
 .max(50, {
 message: 'Product code must not exceed 50 characters.',
 })
 .optional(),
 regulationNumber: z
 .string()
 .max(50, {
 message: 'Regulation number must not exceed 50 characters.',
 })
 .optional(),
});

const DeviceProfileForm = ({ initialData, onSubmit, onCancel, projectId }) => {
 const { currentOrganization, currentClientWorkspace } = useTenant();
 const { toast } = useToast();
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [vaultStatus, setVaultStatus] = useState(null);

 // Configure form with react-hook-form and Zod validation
 const form = useForm({
 resolver: zodResolver(deviceProfileZodSchema),
 defaultValues: initialData || {
 deviceName: '',
 modelNumber: '',
 manufacturer: '',
 deviceClass: 'II',
 intendedUse: '',
 technologyType: '',
 predicateDevice: '',
 deviceDescription: '',
 regulatoryHistory: '',
 substantialEquivalence: '',
 sterilization: false,
 software: false,
 contactType: 'none',
 marketHistory: '',
 productCode: '',
 regulationNumber: '',
 projectId: projectId || 'new-device', // Use provided projectId or default
 },
 });

 // Enhanced submit handler with Document Vault integration and robust error handling
 const handleSubmit = async data => {
 try {
 setIsSubmitting(true);

 // Add tenant context data if available
 if (currentOrganization?.id) {
 data.organizationId = currentOrganization.id;
 }

 if (currentClientWorkspace?.id) {
 data.clientWorkspaceId = currentClientWorkspace.id;
 }

 // Set proper projectId
 data.projectId = projectId || data.projectId || 'new-device';

 // CRITICAL: Ensure document structure exists to prevent "Error creating document structure"
 if (!data.structure) {
 console.log('Adding missing structure to device profile');
 data.structure = {
 documentType: '510k',
 sections: ['device-info', 'predicates', 'compliance'],
 version: '1.0',
 };
 }

 // CRITICAL: Ensure metadata exists
 const now = new Date().toISOString();
 if (!data.metadata) {
 console.log('Adding missing metadata to device profile');
 data.metadata = {
 createdAt: now,
 lastUpdated: now,
 };
 } else {
 data.metadata.lastUpdated = now;
 }

 console.log('Saving device profile with complete document structure:', data);
 setVaultStatus('creating');

 // Use FDA510kService to save profile with Document Vault integration
 const result = await FDA510kService.saveDeviceProfile(data);

 console.log('Device profile saved with Document Vault integration:', result);
 setVaultStatus('created');

 // Show success toast
 toast({
 title: 'Device Profile Saved',
 description:
 'Your device profile has been saved and document structure created in the vault.',
 });

 // Use callback if provided
 if (onSubmit) {
 onSubmit(result);
 }

 setIsSubmitting(false);
 } catch (error) {
 console.error('Error saving device profile:', error);
 setVaultStatus('error');

 // Show error toast - avoid mentioning document structure
 toast({
 title: 'Error Saving Profile',
 description: 'Unable to save device profile. Please try again.',
 variant: 'destructive',
 });

 setIsSubmitting(false);
 }
 };

 // Get current device class to provide context-sensitive guidance
 const deviceClass = form.watch('deviceClass');

 return (
 <Form {...form}>
 <form onSubmit={form.handleSubmit(handleSubmit)} className="w-full">
 <div className="bg-stone-50 p-4 rounded-lg mb-6 border border-stone-100">
 <h2 className="text-stone-800 font-medium flex items-center">
 <Info className="h-5 w-5 mr-2" />
 510(k) Device Profile Information
 </h2>
 <p className="text-sm text-stone-700 mt-1">
 This information will be used to create your 510(k) submission documentation and find
 appropriate predicate devices. Fields marked with * are required for basic analysis.
 </p>
 </div>

 <Tabs defaultValue="basic" className="w-full">
 <TabsList className="grid grid-cols-3 mb-4">
 <TabsTrigger value="basic" className="text-sm">
 Basic Information
 </TabsTrigger>
 <TabsTrigger value="technical" className="text-sm">
 Technical Details
 </TabsTrigger>
 <TabsTrigger value="regulatory" className="text-sm">
 Regulatory Context
 </TabsTrigger>
 </TabsList>

 <TabsContent value="basic" className="space-y-6">
 <div className="space-y-4">
 <div className="bg-white p-4 rounded-md border border-gray-200">
 <FormField
 control={form.control}
 name="deviceName"
 render={({ field }) => (
 <FormItem>
 <FormLabel>Device Name*</FormLabel>
 <FormControl>
 <Input placeholder="e.g. CardioMonitor 3000" {...field} />
 </FormControl>
 <FormDescription className="text-xs text-gray-500 mt-1">
 The commercial name of the device
 </FormDescription>
 <FormMessage />
 </FormItem>
 )}
 />
 </div>

 <div className="bg-white p-4 rounded-md border border-gray-200">
 <div className="grid grid-cols-2 gap-4">
 <FormField
 control={form.control}
 name="modelNumber"
 render={({ field }) => (
 <FormItem>
 <FormLabel htmlFor="model">Model Number</FormLabel>
 <FormControl>
 <Input id="model" placeholder="e.g. CM3000-X" {...field} />
 </FormControl>
 <FormDescription className="text-xs text-gray-500 mt-1">
 Device model or catalog number
 </FormDescription>
 <FormMessage />
 </FormItem>
 )}
 />

 <FormField
 control={form.control}
 name="manufacturer"
 render={({ field }) => (
 <FormItem>
 <FormLabel htmlFor="manufacturer">Manufacturer</FormLabel>
 <FormControl>
 <Input
 id="manufacturer"
 placeholder="e.g. MedTech Industries"
 {...field}
 />
 </FormControl>
 <FormDescription className="text-xs text-gray-500 mt-1">
 Legal manufacturer of the device
 </FormDescription>
 <FormMessage />
 </FormItem>
 )}
 />
 </div>
 </div>

 <div className="bg-white p-4 rounded-md border border-gray-200">
 <FormField
 control={form.control}
 name="deviceClass"
 render={({ field }) => (
 <FormItem>
 <FormLabel>Device Class*</FormLabel>
 <Select onValueChange={field.onChange} defaultValue={field.value}>
 <FormControl>
 <SelectTrigger className="bg-white">
 <SelectValue placeholder="Select device class" />
 </SelectTrigger>
 </FormControl>
 <SelectContent className="bg-white border border-gray-200 shadow-md z-50">
 <SelectItem value="I" className="hover:bg-stone-50">
 Class I
 </SelectItem>
 <SelectItem value="II" className="hover:bg-stone-50">
 Class II
 </SelectItem>
 <SelectItem value="III" className="hover:bg-stone-50">
 Class III
 </SelectItem>
 </SelectContent>
 </Select>
 <FormDescription className="text-xs text-gray-500 mt-1">
 FDA regulatory classification of the device
 </FormDescription>
 <FormMessage />
 </FormItem>
 )}
 />
 </div>

 <div className="bg-white p-4 rounded-md border border-gray-200">
 <FormField
 control={form.control}
 name="intendedUse"
 render={({ field }) => (
 <FormItem>
 <FormLabel>Intended Use*</FormLabel>
 <FormControl>
 <Textarea
 placeholder="Describe the intended use of the device..."
 className="min-h-20"
 {...field}
 />
 </FormControl>
 <FormDescription className="text-xs text-gray-500 mt-1">
 Statement of the device's intended use or indication for use - critical for
 510(k) substantial equivalence
 </FormDescription>
 <FormMessage />
 </FormItem>
 )}
 />
 </div>

 <div className="bg-white p-4 rounded-md border border-gray-200">
 <FormField
 control={form.control}
 name="deviceDescription"
 render={({ field }) => (
 <FormItem>
 <FormLabel>Device Description</FormLabel>
 <FormControl>
 <Textarea
 placeholder="Provide a detailed description of the device including key components, materials, principles of operation..."
 className="min-h-20"
 {...field}
 />
 </FormControl>
 <FormDescription className="text-xs text-gray-500 mt-1">
 Comprehensive description of device appearance, components, and how it
 functions
 </FormDescription>
 <FormMessage />
 </FormItem>
 )}
 />
 </div>
 </div>
 </TabsContent>

 <TabsContent value="technical" className="space-y-6">
 <div className="space-y-4">
 <div className="bg-white p-4 rounded-md border border-gray-200">
 <FormField
 control={form.control}
 name="technologyType"
 render={({ field }) => (
 <FormItem>
 <FormLabel>Technology Type</FormLabel>
 <FormControl>
 <Input placeholder="e.g. Electrocardiogram, Bluetooth, AI" {...field} />
 </FormControl>
 <FormDescription className="text-xs text-gray-500 mt-1">
 Primary technology used in the device (e.g., imaging, monitoring,
 diagnostic)
 </FormDescription>
 <FormMessage />
 </FormItem>
 )}
 />
 </div>

 <div className="bg-white p-4 rounded-md border border-gray-200">
 <h3 className="text-sm font-medium mb-3">Device Attributes</h3>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <FormField
 control={form.control}
 name="sterilization"
 render={({ field }) => (
 <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md">
 <FormControl>
 <Checkbox checked={field.value} onCheckedChange={field.onChange} />
 </FormControl>
 <div className="space-y-1 leading-none">
 <FormLabel>Sterilization Required</FormLabel>
 <FormDescription className="text-xs">
 Device requires sterilization prior to use
 </FormDescription>
 </div>
 </FormItem>
 )}
 />

 <FormField
 control={form.control}
 name="software"
 render={({ field }) => (
 <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md">
 <FormControl>
 <Checkbox checked={field.value} onCheckedChange={field.onChange} />
 </FormControl>
 <div className="space-y-1 leading-none">
 <FormLabel>Software Component</FormLabel>
 <FormDescription className="text-xs">
 Device includes software or firmware
 </FormDescription>
 </div>
 </FormItem>
 )}
 />
 </div>
 </div>

 <div className="bg-white p-4 rounded-md border border-gray-200">
 <FormField
 control={form.control}
 name="contactType"
 render={({ field }) => (
 <FormItem>
 <FormLabel>Patient Contact Type</FormLabel>
 <Select onValueChange={field.onChange} defaultValue={field.value}>
 <FormControl>
 <SelectTrigger className="bg-white">
 <SelectValue placeholder="Select contact type" />
 </SelectTrigger>
 </FormControl>
 <SelectContent className="bg-white border border-gray-200 shadow-md z-50">
 <SelectItem value="none" className="hover:bg-stone-50">
 No patient contact
 </SelectItem>
 <SelectItem value="external" className="hover:bg-stone-50">
 External contact
 </SelectItem>
 <SelectItem value="implant" className="hover:bg-stone-50">
 Implant
 </SelectItem>
 <SelectItem value="blood_path" className="hover:bg-stone-50">
 Blood path
 </SelectItem>
 </SelectContent>
 </Select>
 <FormDescription className="text-xs text-gray-500 mt-1">
 How the device contacts the patient (if applicable)
 </FormDescription>
 <FormMessage />
 </FormItem>
 )}
 />
 </div>
 </div>
 </TabsContent>

 <TabsContent value="regulatory" className="space-y-6">
 <div className="space-y-4">
 <div className="bg-white p-4 rounded-md border border-gray-200">
 <FormField
 control={form.control}
 name="predicateDevice"
 render={({ field }) => (
 <FormItem>
 <FormLabel>Predicate Device</FormLabel>
 <FormControl>
 <Input placeholder="e.g. HeartTrack 2.0 (K123456)" {...field} />
 </FormControl>
 <FormDescription className="text-xs text-gray-500 mt-1">
 If known, a legally marketed device to which substantial equivalence will be
 claimed (including K-number if available)
 </FormDescription>
 <FormMessage />
 </FormItem>
 )}
 />
 </div>

 <div className="bg-white p-4 rounded-md border border-gray-200">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <FormField
 control={form.control}
 name="productCode"
 render={({ field }) => (
 <FormItem>
 <FormLabel htmlFor="productCode">Product Code</FormLabel>
 <FormControl>
 <Input id="productCode" placeholder="e.g. DQA, LLZ" {...field} />
 </FormControl>
 <FormDescription className="text-xs text-gray-500 mt-1">
 FDA product classification code
 </FormDescription>
 <FormMessage />
 </FormItem>
 )}
 />

 <FormField
 control={form.control}
 name="regulationNumber"
 render={({ field }) => (
 <FormItem>
 <FormLabel htmlFor="regulationNumber">Regulation Number</FormLabel>
 <FormControl>
 <Input
 id="regulationNumber"
 placeholder="e.g. 21 CFR 870.2300"
 {...field}
 />
 </FormControl>
 <FormDescription className="text-xs text-gray-500 mt-1">
 CFR regulation number, if known
 </FormDescription>
 <FormMessage />
 </FormItem>
 )}
 />
 </div>
 </div>

 <div className="bg-white p-4 rounded-md border border-gray-200">
 <FormField
 control={form.control}
 name="substantialEquivalence"
 render={({ field }) => (
 <FormItem>
 <FormLabel>Substantial Equivalence Rationale</FormLabel>
 <FormControl>
 <Textarea
 placeholder="Describe why your device is substantially equivalent to the predicate device..."
 className="min-h-20"
 {...field}
 />
 </FormControl>
 <FormDescription className="text-xs text-gray-500 mt-1">
 Brief explanation of how your device is similar to the predicate device (if
 known)
 </FormDescription>
 <FormMessage />
 </FormItem>
 )}
 />
 </div>

 <div className="bg-white p-4 rounded-md border border-gray-200">
 <FormField
 control={form.control}
 name="marketHistory"
 render={({ field }) => (
 <FormItem>
 <FormLabel>Market History</FormLabel>
 <FormControl>
 <Textarea
 placeholder="Provide a brief history of the device's marketing status in the US and other countries..."
 className="min-h-20"
 {...field}
 />
 </FormControl>
 <FormDescription className="text-xs text-gray-500 mt-1">
 Brief history of device's marketing status in US and other countries
 </FormDescription>
 <FormMessage />
 </FormItem>
 )}
 />
 </div>

 {deviceClass === 'III' && (
 <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
 <div className="flex items-start">
 <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 mr-2" />
 <div>
 <h3 className="text-sm font-medium text-yellow-800">
 Class III Device Notice
 </h3>
 <p className="text-sm">
 Clinical data is often required for Class III submissions in addition to
 bench testing.
 </p>
 </div>
 </div>
 </div>
 )}
 </div>
 </TabsContent>
 </Tabs>

 <DialogFooter className="mt-6 pt-4 border-t border-gray-200 flex flex-col sm:flex-row sm:justify-between">
 {/* Status indicator */}
 {vaultStatus && (
 <div className="mb-4 w-full sm:mb-0 sm:w-auto px-3 py-2 rounded-md text-sm font-medium">
 {vaultStatus === 'creating' && (
 <div className="flex items-center text-stone-600">
 <Loader2 className="h-4 w-4 mr-2 animate-spin" />
 Creating folder structure in Document Vault...
 </div>
 )}
 {vaultStatus === 'created' && (
 <div className="flex items-center text-green-600">
 <CheckCircle className="h-4 w-4 mr-2" />
 Document structure created successfully
 </div>
 )}
 {vaultStatus === 'error' && (
 <div className="flex items-center text-red-600">
 <AlertCircle className="h-4 w-4 mr-2" />
 Error creating document structure
 </div>
 )}
 </div>
 )}

 <div className="flex flex-col sm:flex-row gap-2 sm:ml-auto">
 <Button
 type="button"
 variant="outline"
 className="mb-2 sm:mb-0"
 onClick={onCancel}
 disabled={isSubmitting}
 >
 Cancel
 </Button>
 <Button type="submit" className="bg-stone-800 hover:bg-stone-900" disabled={isSubmitting}>
 {isSubmitting ? (
 <>
 <Loader2 className="h-4 w-4 mr-2 animate-spin" />
 Saving...
 </>
 ) : (
 'Save Device Profile'
 )}
 </Button>
 </div>
 </DialogFooter>
 </form>
 </Form>
 );
};

export default DeviceProfileForm;
