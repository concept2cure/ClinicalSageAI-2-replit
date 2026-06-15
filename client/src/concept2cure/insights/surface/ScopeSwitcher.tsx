/**
 * ScopeSwitcher — picks the active report scope and its identifier.
 *
 * The scope type is a governed Select over the `ReportScope` enum; the scope id
 * is a governed Input. Both use the app's design-system primitives — never raw
 * `<select>` / `<input>` — so focus, sizing, and disabled states stay consistent
 * with the rest of the product. Purely controlled and presentational: the parent
 * owns the value and is notified on every change.
 *
 * Voice + color follow the design system: sentence case, calm, no decoration.
 *
 * @module client/src/concept2cure/insights/surface/ScopeSwitcher
 */

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ReportScope } from '../data/types';

/** The controlled value carried by the switcher. */
export interface ScopeValue {
  scopeType: ReportScope;
  scopeId: string;
}

export interface ScopeSwitcherProps {
  /** The active scope selection. */
  value: ScopeValue;
  /** Called with the next selection whenever the type or id changes. */
  onChange: (next: ScopeValue) => void;
  /** True while a downstream action is in flight; disables the controls. */
  disabled?: boolean;
}

/** The scope enum values, in the order the server declares them. */
const SCOPES: Array<{ value: ReportScope; label: string }> = [
  { value: 'account', label: 'Account' },
  { value: 'program', label: 'Program' },
  { value: 'project', label: 'Project' },
  { value: 'study', label: 'Study' },
  { value: 'submission', label: 'Submission' },
  { value: 'document', label: 'Document' },
];

export function ScopeSwitcher({
  value,
  onChange,
  disabled = false,
}: ScopeSwitcherProps): React.ReactElement {
  const handleType = React.useCallback(
    (next: string) => {
      onChange({ ...value, scopeType: next as ReportScope });
    },
    [onChange, value],
  );

  const handleId = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...value, scopeId: event.target.value });
    },
    [onChange, value],
  );

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        alignItems: 'flex-end',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
        <Label htmlFor="insights-scope-type">Scope</Label>
        <Select value={value.scopeType} onValueChange={handleType} disabled={disabled}>
          <SelectTrigger id="insights-scope-type" aria-label="Report scope">
            <SelectValue placeholder="Select scope" />
          </SelectTrigger>
          <SelectContent>
            {SCOPES.map((scope) => (
              <SelectItem key={scope.value} value={scope.value}>
                {scope.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
        <Label htmlFor="insights-scope-id">Scope identifier</Label>
        <Input
          id="insights-scope-id"
          value={value.scopeId}
          onChange={handleId}
          disabled={disabled}
          placeholder="Enter the scope identifier"
          aria-label="Scope identifier"
        />
      </div>
    </div>
  );
}
