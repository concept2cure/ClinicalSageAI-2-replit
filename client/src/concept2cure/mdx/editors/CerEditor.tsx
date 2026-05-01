/**
 * CER section editor — thin wrapper around DocumentEditor.
 * Ported from design-system/ui_kits/mdx/EditorSurfaces.jsx > CerEditorSurface.
 */

import * as React from 'react';
import { DocumentEditor } from './DocumentEditor';
import type { AnaMode } from '../data/nav';
import {
  CER_EDITOR_PROGRAM,
  CER_EDITOR_SECTIONS,
  CER_EDITOR_CONTENT,
  CER_EDITOR_VALIDATION,
  CER_EDITOR_COMMENTS,
  CER_EDITOR_SEED,
  CER_EDITOR_QUICK,
} from '../data/editors';

export function CerEditor({ initialMode = 'deep-research' }: { initialMode?: AnaMode['id'] }) {
  return (
    <DocumentEditor
      program={CER_EDITOR_PROGRAM}
      sections={CER_EDITOR_SECTIONS}
      contentMap={CER_EDITOR_CONTENT}
      validationMap={CER_EDITOR_VALIDATION}
      comments={CER_EDITOR_COMMENTS}
      seedMessages={CER_EDITOR_SEED}
      quickActions={CER_EDITOR_QUICK}
      initialActiveId="cs6"
      initialMode={initialMode}
      screenLabel="MDX · CER editor"
    />
  );
}
