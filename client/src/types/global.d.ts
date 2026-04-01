// Global TypeScript declarations for custom window properties

interface Window {
  // App ready state flag
  __APP_READY__: boolean;

  // Anti-flash control
  __DISABLE_FLASH__: boolean;

  // Vite HMR timeout control
  __VITE_HMR_TIMEOUT__: number;

  // Security related properties
  __PRELOAD_COMPLETE__: boolean;

  // Dispatched events
  dispatchEvent(event: Event): boolean;
  dispatchEvent(event: CustomEvent<any>): boolean;
}

interface ImportMetaEnv {
  readonly DEV?: boolean;
  readonly VITE_SHOW_DEMO_LOGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '@/pages/csr/CERV2Page' {
  import type { ComponentType } from 'react';

  const CERV2Page: ComponentType<{ projectId: string | null }>;
  export default CERV2Page;
}
