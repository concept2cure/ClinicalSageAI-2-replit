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
