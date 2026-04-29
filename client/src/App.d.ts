// Sibling declaration for App.jsx so .tsx callers (main.tsx) don't trip
// TS7016. Tighten the prop surface when App.jsx is migrated to .tsx.
import type { ComponentType } from 'react';
declare const App: ComponentType<Record<string, unknown>>;
export default App;
