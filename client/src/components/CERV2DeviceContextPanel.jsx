/**
 * CERV2DeviceContextPanel — Phase 9 P0
 *
 * Collapsible side panel for capturing device context information.
 * Fields adapt per doc type:
 * 510(k): device name, predicate device, K-number, intended use, device class
 * PMA: device name, study name, intended use, device class
 * CER: device name, MDR class, Notified Body, intended use
 *
 * All values flow into AI prompts via deviceContext passed to parent.
 */
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Cpu, AlertCircle } from 'lucide-react';

/** Fields per doc type */
const FIELD_DEFS = {
 cerv2_510k: [
 {
 key: 'deviceName',
 label: 'Device Name',
 required: true,
 placeholder: 'e.g. CardioFlow Pro Monitor',
 },
 { key: 'manufacturer', label: 'Manufacturer', required: false, placeholder: 'Company name' },
 {
 key: 'predicateDevice',
 label: 'Predicate Device',
 required: true,
 placeholder: 'e.g. CardioFlow Classic',
 },
 {
 key: 'predicateK',
 label: 'Predicate 510(k) Number',
 required: true,
 placeholder: 'e.g. K210456',
 },
 {
 key: 'intendedUse',
 label: 'Intended Use / Indications',
 required: true,
 type: 'textarea',
 placeholder: 'Describe the intended use...',
 },
 {
 key: 'deviceClass',
 label: 'Device Class',
 required: true,
 type: 'select',
 options: ['Class I', 'Class II', 'Class III'],
 },
 { key: 'productCode', label: 'Product Code', required: false, placeholder: 'e.g. DQA' },
 {
 key: 'regulationNumber',
 label: '21 CFR Regulation Number',
 required: false,
 placeholder: 'e.g. 870.2340',
 },
 ],
 cerv2_pma: [
 {
 key: 'deviceName',
 label: 'Device Name',
 required: true,
 placeholder: 'e.g. NeuroStim Implant System',
 },
 { key: 'manufacturer', label: 'Manufacturer', required: false, placeholder: 'Company name' },
 {
 key: 'studyName',
 label: 'Clinical Study Name',
 required: true,
 placeholder: 'e.g. NEURAL-PATH Trial',
 },
 { key: 'ideNumber', label: 'IDE Number', required: false, placeholder: 'e.g. G210123' },
 {
 key: 'intendedUse',
 label: 'Intended Use / Indications',
 required: true,
 type: 'textarea',
 placeholder: 'Describe the intended use...',
 },
 {
 key: 'deviceClass',
 label: 'Device Class',
 required: true,
 type: 'select',
 options: ['Class II', 'Class III'],
 },
 { key: 'productCode', label: 'Product Code', required: false, placeholder: 'e.g. QAS' },
 ],
 cerv2_cer: [
 {
 key: 'deviceName',
 label: 'Device Name',
 required: true,
 placeholder: 'e.g. OrthoFlex Knee System',
 },
 { key: 'manufacturer', label: 'Manufacturer', required: false, placeholder: 'Company name' },
 {
 key: 'mdrClass',
 label: 'MDR Device Class',
 required: true,
 type: 'select',
 options: ['Class I', 'Class IIa', 'Class IIb', 'Class III'],
 },
 {
 key: 'notifiedBody',
 label: 'Notified Body',
 required: true,
 placeholder: 'e.g. BSI Group (NB 0086)',
 },
 {
 key: 'intendedUse',
 label: 'Intended Purpose',
 required: true,
 type: 'textarea',
 placeholder: 'Describe the intended purpose...',
 },
 { key: 'udiDi', label: 'UDI-DI', required: false, placeholder: 'Basic UDI-DI' },
 {
 key: 'equivalentDevice',
 label: 'Equivalent Device(s)',
 required: false,
 placeholder: 'Name of claimed equivalent device',
 },
 {
 key: 'riskClass',
 label: 'Risk Classification Rule',
 required: false,
 placeholder: 'e.g. Rule 8 (Annex VIII)',
 },
 ],
};

function filledCount(deviceContext, fields) {
 return fields.filter(f => {
 const val = deviceContext[f.key];
 return val && val.trim().length > 0;
 }).length;
}

export default function CERV2DeviceContextPanel({
 selectedDocType,
 deviceContext,
 onContextChange,
 visible,
 onToggle,
}) {
 const fields = FIELD_DEFS[selectedDocType] || FIELD_DEFS.cerv2_510k;
 const required = fields.filter(f => f.required);
 const filled = filledCount(deviceContext, required);
 const allFilled = filled === required.length;

 const handleChange = (key, value) => {
 onContextChange({ ...deviceContext, [key]: value });
 };

 if (!visible) {
 return (
 <button
 onClick={onToggle}
 className="flex items-center gap-2 px-3 py-1.5 text-xs border rounded-md hover:bg-slate-50 transition-colors"
 title="Open Device Context (Ctrl+Shift+D)"
 >
 <Cpu className="w-3.5 h-3.5 text-stone-600" />
 <span className="font-medium text-slate-700">Device Context</span>
 {!allFilled && (
 <Badge
 variant="outline"
 className="text-[11px] px-1.5 py-0 border-amber-400 text-amber-600"
 >
 {filled}/{required.length}
 </Badge>
 )}
 {allFilled && (
 <Badge className="text-[11px] px-1.5 py-0 bg-green-100 text-green-700 border-green-300">
 Complete
 </Badge>
 )}
 <ChevronDown className="w-3 h-3" />
 </button>
 );
 }

 return (
 <div className="border rounded-lg bg-white shadow-sm mb-3 overflow-hidden">
 {/* Header */}
 <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b">
 <div className="flex items-center gap-2">
 <Cpu className="w-4 h-4 text-stone-600" />
 <span className="font-semibold text-sm text-slate-800">Device Context</span>
 <Badge
 variant="outline"
 className={`text-[11px] px-1.5 py-0 ${allFilled ? 'border-green-400 text-green-700' : 'border-amber-400 text-amber-600'}`}
 >
 {filled}/{required.length} required
 </Badge>
 </div>
 <Button variant="ghost" size="sm" onClick={onToggle} className="h-7 w-7 p-0">
 <ChevronUp className="w-4 h-4" />
 </Button>
 </div>

 {/* Info banner */}
 {!allFilled && (
 <div className="flex items-start gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700">
 <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
 <span>
 Fill in required fields so AI suggestions include your specific device information
 instead of generic placeholders.
 </span>
 </div>
 )}

 {/* Fields */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
 {fields.map(field => (
 <div key={field.key} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
 <Label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
 {field.label}
 {field.required && <span className="text-red-500">*</span>}
 </Label>

 {field.type === 'select' ? (
 <Select
 value={deviceContext[field.key] || ''}
 onValueChange={v => handleChange(field.key, v)}
 >
 <SelectTrigger className="h-8 text-xs">
 <SelectValue placeholder="Select..." />
 </SelectTrigger>
 <SelectContent>
 {field.options.map(opt => (
 <SelectItem key={opt} value={opt} className="text-xs">
 {opt}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 ) : field.type === 'textarea' ? (
 <textarea
 value={deviceContext[field.key] || ''}
 onChange={e => handleChange(field.key, e.target.value)}
 placeholder={field.placeholder}
 rows={2}
 className="w-full text-xs border rounded-md px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-stone-400 placeholder:text-slate-400"
 />
 ) : (
 <Input
 type="text"
 value={deviceContext[field.key] || ''}
 onChange={e => handleChange(field.key, e.target.value)}
 placeholder={field.placeholder}
 className="h-8 text-xs"
 />
 )}
 </div>
 ))}
 </div>
 </div>
 );
}
