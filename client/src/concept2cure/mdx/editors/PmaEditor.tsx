/**
 * PMA module editor — thin wrapper around DocumentEditor.
 * Ported from design-system/ui_kits/mdx/EditorSurfaces.jsx > PmaEditorSurface.
 */

import * as React from 'react';
import { DocumentEditor } from './DocumentEditor';
import type { AnaMode } from '../data/nav';
import {
  PMA_EDITOR_PROGRAM,
  PMA_EDITOR_SECTIONS,
  PMA_EDITOR_CONTENT,
  PMA_EDITOR_VALIDATION,
  PMA_EDITOR_COMMENTS,
  PMA_EDITOR_SEED,
  PMA_EDITOR_QUICK,
} from '../data/editors';

export interface PmaEditorProps {
  initialMode?: AnaMode['id'];
  programIdent?: string | null;
}

export function PmaEditor({ initialMode = 'deep-research', programIdent }: PmaEditorProps) {
  return (
    <DocumentEditor
      program={PMA_EDITOR_PROGRAM}
      sections={PMA_EDITOR_SECTIONS}
      contentMap={PMA_EDITOR_CONTENT}
      validationMap={PMA_EDITOR_VALIDATION}
      comments={PMA_EDITOR_COMMENTS}
      seedMessages={PMA_EDITOR_SEED}
      quickActions={PMA_EDITOR_QUICK}
      initialActiveId="m5-1"
      initialMode={initialMode}
      screenLabel="MDX · PMA editor"
      programIdent={programIdent}
    />
  );
}
