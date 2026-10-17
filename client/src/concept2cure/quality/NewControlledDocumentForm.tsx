/** Change-control gallery adapter onto the canonical governed document setup. */
import * as React from 'react';
import { ControlledDocumentSetup } from './ControlledDocumentDialogs';
import type { SopTemplate } from './data';

export interface NewControlledDocumentFormProps {
  templates: SopTemplate[];
  initialKey?: string;
  onCancel: () => void;
  onCreated: (id: number) => void;
  onNavigate?: (target: string) => void;
}

export function NewControlledDocumentForm({ templates, initialKey, onCancel, onCreated, onNavigate }: NewControlledDocumentFormProps) {
  const template = templates.find(row => row.key === initialKey);
  return <ControlledDocumentSetup template={template} templates={templates}
    onClose={onCancel} onCreated={onCreated} onNavigate={onNavigate} />;
}
