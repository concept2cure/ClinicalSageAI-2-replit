import { useEffect, useMemo } from "react";
import { TEMPLATES, Field, StandardRef } from "./templateRegistry";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function validateMetadata(fields: Field[], data: Record<string, any>) {
  const errors: Record<string, string> = {};
  fields.forEach(f => {
    if ("required" in f && f.required && !data[f.key]) {
      errors[f.key] = "Required";
    }
  });
  return errors;
}

export default function MetadataDynamicForm({
  categories, standard, value, onChange
}: {
  categories: string[];
  standard?: StandardRef;
  value: Record<string, any>;
  onChange: (v: Record<string, any>) => void;
}) {
  const fields: Field[] = useMemo(() => {
    const ctx = { categories, standard };
    // merge unique fields from all matching templates
    const matched = TEMPLATES.filter(t => t.when(ctx)).flatMap(t => t.fields);
    const dedup = new Map<string, Field>();
    matched.forEach(f => dedup.set(f.key, f));
    return [...dedup.values()];
  }, [categories, standard]);

  // initialize missing required fields (empty) once
  useEffect(() => {
    const next = { ...value };
    let changed = false;
    fields.forEach(f => { 
      if (value[f.key] === undefined) {
        next[f.key] = ""; 
        changed = true;
      }
    });
    if (changed) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  const set = (k: string, v: any) => onChange({ ...value, [k]: v });

  if (fields.length === 0) {
    return (
      <div className="text-sm text-stone-400 p-4 text-center">
        Select categories in the Tags tab to see metadata fields
      </div>
    );
  }

  return (
    <div className="md-form space-y-4">
      <p className="text-sm text-stone-500">
        Category-specific structured metadata fields ({fields.length} fields)
      </p>
      {fields.map(f => (
        <div key={f.key} className="md-field">
          <Label className="text-sm font-medium mb-1 block">
            {f.label} {("required" in f && f.required) ? <span className="text-stone-900">*</span> : null}
          </Label>
          {renderInput(f, value[f.key], (v: any) => set(f.key, v))}
        </div>
      ))}
    </div>
  );
}

function renderInput(field: Field, val: any, onChange: (v: any) => void) {
  switch (field.type) {
    case "text":
      return (
        <Input 
          value={val || ""} 
          onChange={e => onChange(e.target.value)}
          placeholder={field.unit || ''}
          data-testid={`input-metadata-${field.key}`}
        />
      );
    case "number":
      return (
        <Input 
          type="number" 
          value={val || ""} 
          onChange={e => onChange(e.target.value)} 
          placeholder={field.unit}
          data-testid={`input-metadata-${field.key}`}
        />
      );
    case "date":
      return (
        <Input 
          type="date" 
          value={val || ""} 
          onChange={e => onChange(e.target.value)}
          data-testid={`input-metadata-${field.key}`}
        />
      );
    case "bool":
      return (
        <input 
          type="checkbox" 
          checked={!!val} 
          onChange={e => onChange(e.target.checked)}
          className="h-4 w-4 cursor-pointer"
          data-testid={`checkbox-metadata-${field.key}`}
        />
      );
    case "enum":
      return (
        <Select value={val || ""} onValueChange={onChange}>
          <SelectTrigger data-testid={`select-metadata-${field.key}`}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map(o => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "file[]":
      return (
        <input 
          type="file" 
          multiple 
          onChange={e => onChange([...e.target.files || []])}
          className="block w-full text-sm text-stone-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-stone-100 file:text-stone-700 hover:file:bg-stone-100"
          data-testid={`file-metadata-${field.key}`}
        />
      );
    default:
      return null;
  }
}
