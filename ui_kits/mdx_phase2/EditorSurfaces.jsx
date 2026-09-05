/* global DocumentEditor,
   PMA_EDITOR_PROGRAM, PMA_EDITOR_SECTIONS, PMA_EDITOR_CONTENT, PMA_EDITOR_VALIDATION, PMA_EDITOR_COMMENTS, PMA_EDITOR_SEED, PMA_EDITOR_QUICK,
   CER_EDITOR_PROGRAM, CER_EDITOR_SECTIONS, CER_EDITOR_CONTENT, CER_EDITOR_VALIDATION, CER_EDITOR_COMMENTS, CER_EDITOR_SEED, CER_EDITOR_QUICK */

/* PMA + CER editor surfaces — wrap DocumentEditor with the right data.
   App.jsx routes to these by activeNav. */

function PmaEditorSurface({ initialMode = 'deep-research' }) {
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
    />
  );
}

function CerEditorSurface({ initialMode = 'deep-research' }) {
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

Object.assign(window, { PmaEditorSurface, CerEditorSurface });
