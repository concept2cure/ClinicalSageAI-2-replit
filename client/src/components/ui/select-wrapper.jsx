import React from 'react';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
 SelectGroup,
 SelectLabel,
} from './select';
import { FormControl } from './form';

/**
 * EnhancedSelect component
 *
 * A wrapper around the shadcn Select component that properly displays selected values
 * instead of always showing placeholder text.
 *
 * @param {Object} props
 * @param {string} props.value - Selected value
 * @param {Function} props.onValueChange - Value change handler
 * @param {string} props.placeholder - Placeholder text when no value is selected
 * @param {Object} props.options - Map of option values to display labels (e.g. { 'value1': 'Label 1', 'value2': 'Label 2' })
 * @param {Array} props.optionsArray - Array of option objects with value and label (e.g. [{ value: 'value1', label: 'Label 1' }])
 * @param {string} props.className - Class name for the trigger element
 * @param {React.ReactNode} props.children - Additional content to render in the select
 * @param {Object} props.triggerProps - Additional props for the trigger element
 * @param {boolean} props.inForm - Whether the select is used in a form context (to wrap with FormControl)
 * @param {Array} props.groups - Array of option groups (e.g. [{ label: 'Group 1', options: [{ value: 'value1', label: 'Label 1' }] }])
 * @returns {React.ReactElement}
 */
export const EnhancedSelect = ({
 value,
 onValueChange,
 placeholder = 'Select an option',
 options = {},
 optionsArray = [],
 className = '',
 children,
 triggerProps = {},
 inForm = false,
 groups = [],
 defaultValue,
 ...props
}) => {
 // Get options from either options object or optionsArray
 let selectOptions =
 optionsArray.length > 0
 ? optionsArray
 : Object.entries(options).map(([value, label]) => ({ value, label }));

 // Find the label for the current value
 const getCurrentLabel = () => {
 if (!value && !defaultValue) return null;
 const currentValue = value || defaultValue;

 // Check in optionsArray or options object
 if (optionsArray.length > 0) {
 const option = optionsArray.find(opt => opt.value === currentValue);
 if (option) {
 console.log(`Found label for value ${currentValue}:`, option.label);
 return option.label;
 }
 } else if (Object.keys(options).length > 0) {
 const label = options[currentValue];
 if (label) {
 console.log(`Found label for value ${currentValue}:`, label);
 return label;
 }
 }

 // Check in groups
 if (groups.length > 0) {
 for (const group of groups) {
 const option = group.options.find(opt => opt.value === currentValue);
 if (option) {
 console.log(`Found label in group for value ${currentValue}:`, option.label);
 return option.label;
 }
 }
 }

 // If no label found, return the value itself but log the issue
 console.log(`No label found for value ${currentValue}`, {
 value,
 defaultValue,
 optionsArray,
 options,
 groups,
 });
 return currentValue;
 };

 const currentLabel = getCurrentLabel();

 const selectTrigger = (
 <SelectTrigger className={className} {...triggerProps}>
 <SelectValue>{currentLabel || placeholder}</SelectValue>
 </SelectTrigger>
 );

 return (
 <Select value={value} defaultValue={defaultValue} onValueChange={onValueChange} {...props}>
 {inForm ? <FormControl>{selectTrigger}</FormControl> : selectTrigger}
 <SelectContent>
 {children
 ? children
 : groups.length > 0
 ? groups.map((group, index) => (
 <SelectGroup key={index}>
 {group.label && <SelectLabel>{group.label}</SelectLabel>}
 {group.options.map(option => (
 <SelectItem key={option.value} value={option.value}>
 {option.label}
 </SelectItem>
 ))}
 </SelectGroup>
 ))
 : selectOptions.map(option => (
 <SelectItem key={option.value} value={option.value}>
 {option.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 );
};

/**
 * FormSelectField component
 *
 * A helper component to create a Select field within a form context
 *
 * @param {Object} props
 * @param {Object} props.field - The field object from react-hook-form
 * @param {Object} props.selectProps - Props to pass to the Select component
 * @returns {React.ReactElement}
 */
export const FormSelectField = ({ field, selectProps = {} }) => {
 return (
 <EnhancedSelect
 value={field.value}
 onValueChange={field.onChange}
 inForm={true}
 {...selectProps}
 />
 );
};

export default EnhancedSelect;
