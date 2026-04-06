import React, { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
 Select,
 SelectContent,
 SelectGroup,
 SelectItem,
 SelectLabel,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';

/**
 * SubtypeSelect Component
 *
 * An enhanced document subtype selector that shows subtypes grouped by their parent type.
 * Includes a search filter to quickly find subtypes.
 *
 * @param {Object} props Component props
 * @param {string} props.value Currently selected subtype ID
 * @param {Function} props.onChange Function called when selection changes
 * @param {string} props.topFolder Optional filter for a specific document type
 * @param {string} props.label Custom label for the select
 * @param {string} props.placeholder Custom placeholder text
 * @param {string} props.id ID attribute for the select
 * @param {Object} props.containerProps Props to pass to the container div
 */
export default function SubtypeSelect({
 value,
 onChange,
 topFolder = null,
 label = 'Document Subtype',
 placeholder = 'Select a document subtype...',
 id = 'document-subtype',
 containerProps = {},
}) {
 const [searchTerm, setSearchTerm] = useState('');

 // Fetch all document types
 const {
 data: types,
 isLoading: typesLoading,
 error: typesError,
 } = useQuery({
 queryKey: ['/api/meta/types'],
 staleTime: 5 * 60 * 1000, // Cache for 5 minutes
 });

 // Fetch all subtypes
 const {
 data: subtypes,
 isLoading: subtypesLoading,
 error: subtypesError,
 } = useQuery({
 queryKey: ['/api/meta/subtypes'],
 staleTime: 5 * 60 * 1000, // Cache for 5 minutes
 });

 // Filter subtypes based on search term and topFolder
 const filteredSubtypes = useMemo(() => {
 if (!subtypes) return [];

 return subtypes.filter(subtype => {
 // Filter by topFolder if specified
 if (topFolder && subtype.type_id !== topFolder) {
 return false;
 }

 // Filter by search term
 if (searchTerm && searchTerm.trim() !== '') {
 const searchLower = searchTerm.toLowerCase();
 return (
 subtype.name.toLowerCase().includes(searchLower) ||
 subtype.id.toLowerCase().includes(searchLower) ||
 subtype.description?.toLowerCase().includes(searchLower)
 );
 }

 return true;
 });
 }, [subtypes, topFolder, searchTerm]);

 // Group subtypes by type_id
 const groupedSubtypes = useMemo(() => {
 if (!filteredSubtypes || !types) return {};

 return filteredSubtypes.reduce((acc, subtype) => {
 const typeId = subtype.type_id;
 if (!acc[typeId]) {
 acc[typeId] = {
 type: types.find(t => t.id === typeId),
 subtypes: [],
 };
 }
 acc[typeId].subtypes.push(subtype);
 return acc;
 }, {});
 }, [filteredSubtypes, types]);

 // Determine loading and error states
 const isLoading = typesLoading || subtypesLoading;
 const error = typesError || subtypesError;

 // Handle errors
 if (error) {
 return (
 <Alert variant="destructive" className="mb-4">
 <AlertCircle className="h-4 w-4" />
 <AlertTitle>Error</AlertTitle>
 <AlertDescription>{error.message || 'Failed to load document subtypes'}</AlertDescription>
 </Alert>
 );
 }

 return (
 <div {...containerProps}>
 {label && (
 <Label htmlFor={id} className="mb-2">
 {label}
 </Label>
 )}

 <Select value={value} onValueChange={onChange} disabled={isLoading}>
 <SelectTrigger id={id} className="w-full">
 <SelectValue placeholder={placeholder} />
 </SelectTrigger>

 <SelectContent>
 {isLoading ? (
 <div className="flex items-center justify-center p-4">
 <Loader2 className="mr-2 h-4 w-4 animate-spin" />
 <span>Loading subtypes...</span>
 </div>
 ) : (
 <>
 <div className="p-2">
 <Input
 placeholder="Search subtypes..."
 value={searchTerm}
 onChange={e => setSearchTerm(e.target.value)}
 className="mb-2"
 />
 </div>

 {Object.entries(groupedSubtypes).length === 0 ? (
 <div className="p-2 text-sm text-muted-foreground">No subtypes found</div>
 ) : (
 Object.entries(groupedSubtypes).map(([typeId, group]) => (
 <SelectGroup key={typeId}>
 <SelectLabel className="font-semibold">
 {group.type?.name || typeId}
 </SelectLabel>

 {group.subtypes.map(subtype => (
 <SelectItem key={subtype.id} value={subtype.id}>
 <div className="flex items-center">
 {subtype.icon && (
 <span className="mr-2 text-muted-foreground">
 <i className={`fas fa-${subtype.icon}`}></i>
 </span>
 )}
 {subtype.name}
 {subtype.business_unit && (
 <span className="ml-2 text-xs text-muted-foreground">
 ({subtype.business_unit})
 </span>
 )}
 </div>
 </SelectItem>
 ))}
 </SelectGroup>
 ))
 )}
 </>
 )}
 </SelectContent>
 </Select>
 </div>
 );
}
